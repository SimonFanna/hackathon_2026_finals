"""Generate a small synthetic bank (customers, products, transactions, in-app events).

Deterministic: the same seed always produces the same files.
Usage (from the repo root):
    python3 scripts/bank_data/generate.py [--customers N] [--seed S] [--out DIR]

Outputs one CSV per table in DIR (default scripts/bank_data/out/), plus
demo_personas.sql (the demo customers only, as plain INSERTs, loadable through the
Supabase SQL editor or MCP). Load the full bank with load.sql (psql \\copy).

Catalogue references are written as `ecosystem_item_row` (the Excel row, i.e.
ecosystem_items.source_row). The loaders resolve them to ids; ids are never assumed.
100% synthetic: names are drawn from lists, IBANs use the invalid check digits "00",
VAT numbers fail the Belgian mod-97 check, and emails use the reserved example.com domain.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

PERIOD_START = date.fromisoformat(C.PERIOD_START)
PERIOD_END = date.fromisoformat(C.PERIOD_END)

DEMO_PERSONAS = [
    # Hero: buying a house, signals are recent and not yet converted.
    {"demo_slug": "sofie", "first_name": "Sofie", "last_name": "Peeters", "gender": "f", "language": "nl", "age": 32,
     "city": "Gent", "persona": "young_family", "couple": True, "kids": [3], "owner": False, "has_car": True,
     "is_ev": False, "moment": "buy_house", "converted": False, "lead_days": 45},
    # Generalisation proof: side income becoming a business.
    {"demo_slug": "lucas", "first_name": "Lucas", "last_name": "Wouters", "gender": "m", "language": "nl", "age": 29,
     "city": "Leuven", "persona": "young_professional", "couple": False, "kids": [], "owner": False, "has_car": False,
     "is_ev": False, "moment": "start_business", "converted": False, "lead_days": 80},
    {"demo_slug": "nadia", "first_name": "Nadia", "last_name": "El Amrani", "gender": "f", "language": "nl", "age": 31,
     "city": "Antwerpen", "persona": "young_professional", "couple": True, "kids": [], "owner": True, "has_car": True,
     "is_ev": False, "moment": "new_parent", "converted": False, "lead_days": 140},
    {"demo_slug": "pieter", "first_name": "Pieter", "last_name": "Claes", "gender": "m", "language": "nl", "age": 49,
     "city": "Mechelen", "persona": "established_family", "couple": True, "kids": [14, 17], "owner": True,
     "has_car": True, "is_ev": False, "moment": "buy_ev", "converted": False, "lead_days": 60},
    # Nothing to suggest: well served, no moment.
    {"demo_slug": "els", "first_name": "Els", "last_name": "Maes", "gender": "f", "language": "nl", "age": 44,
     "city": "Brugge", "persona": "established_family", "couple": True, "kids": [9, 12], "owner": True,
     "has_car": True, "is_ev": True, "moment": "none"},
    # Hard negative: browses home pages out of curiosity, no real project.
    {"demo_slug": "thomas", "first_name": "Thomas", "last_name": "Jacobs", "gender": "m", "language": "nl", "age": 27,
     "city": "Kortrijk", "persona": "young_professional", "couple": False, "kids": [], "owner": False,
     "has_car": True, "is_ev": False, "moment": "none", "extra_views": [15, 15, 2, 18, 15]},
]

COLUMNS = {
    "customers": ["id", "first_name", "last_name", "birth_date", "gender", "language", "email", "postal_code", "city",
                  "region", "marital_status", "segment", "customer_since", "is_demo", "demo_slug"],
    "customer_children": ["id", "customer_id", "first_name", "birth_date"],
    "customer_employment": ["customer_id", "status", "sector", "employer_name", "company_name", "company_vat",
                            "company_founded_on", "monthly_net_income_eur", "since"],
    "customer_housing": ["customer_id", "status", "monthly_rent_eur"],
    "properties": ["id", "customer_id", "kind", "build_year", "epc_label", "estimated_value_eur", "postal_code",
                   "acquired_on"],
    "accounts": ["id", "customer_id", "ecosystem_item_row", "kind", "iban", "opened_on", "balance_eur"],
    "loans": ["id", "customer_id", "ecosystem_item_row", "kind", "principal_eur", "annual_rate_pct", "term_months",
              "monthly_payment_eur", "start_date", "end_date", "outstanding_eur", "status"],
    "product_holdings": ["id", "customer_id", "ecosystem_item_row", "since", "monthly_premium_eur", "status"],
    "transactions": ["id", "account_id", "customer_id", "booked_on", "amount_eur", "category", "counterparty",
                     "description"],
    "app_events": ["id", "customer_id", "session_id", "occurred_at", "channel", "event_type", "ecosystem_item_row",
                   "detail"],
    "customer_truth": ["customer_id", "persona", "life_moment", "moment_started_on", "converted"],
}

# Premiums (€/month) for products that cost something.
PREMIUM = {C.ITEM["home_insurance"]: (18, 45), C.ITEM["car_insurance"]: (45, 110), C.ITEM["ev_insurance"]: (55, 120),
           C.ITEM["family_insurance"]: (7, 14), C.ITEM["hospitalisation_insurance"]: (15, 60),
           C.ITEM["life_insurance"]: (15, 50), C.ITEM["outstanding_balance_insurance"]: (15, 45),
           C.ITEM["travel_insurance"]: (6, 12), C.ITEM["guaranteed_income_self_employed"]: (40, 120),
           C.ITEM["professional_liability"]: (20, 70), C.ITEM["business_liability"]: (30, 90)}
PENSION_SAVINGS_MONTHLY = 83.33     # Belgian pension savings: about €1,000/year
GROEIPAKKET_PAYERS = ["Fons", "Infino", "KidsLife", "MyFamily", "Parentia"]
SOCIAL_FUNDS = ["Xerius", "Acerta", "Liantis", "Securex"]
GENERIC_KATE = [(222, "How much did I spend on groceries this month?"), (223, "Block my debit card"),
                (224, "Transfer 50 euros to my savings account"), (222, "What are my fixed costs?"),
                (221, "Find my last tax certificate")]


class Gen:
    def __init__(self, seed: int):
        self.rng = random.Random(seed)
        self.rows: dict[str, list[dict]] = {t: [] for t in COLUMNS}
        self.next_id = {t: 1 for t in COLUMNS}
        self.months = month_ranges(PERIOD_START, PERIOD_END)
        self.used_emails: set[str] = set()

    # ------------------------------------------------------------ small helpers
    def nid(self, table: str) -> int:
        i = self.next_id[table]
        self.next_id[table] += 1
        return i

    def add(self, table: str, **row):
        self.rows[table].append(row)

    def money(self, lo: float, hi: float) -> float:
        return round(self.rng.uniform(lo, hi), 2)

    def poisson(self, lam: float) -> int:
        if lam <= 0:
            return 0
        l, k, p = math.exp(-lam), 0, 1.0
        while True:
            p *= self.rng.random()
            if p <= l:
                return k
            k += 1

    def day_in(self, start: date, end: date) -> date:
        return start + timedelta(days=self.rng.randint(0, max(0, (end - start).days)))

    def weighted(self, items: dict | list):
        if isinstance(items, dict):
            return self.rng.choices(list(items), weights=list(items.values()))[0]
        return self.rng.choices([i[:-1] for i in items], weights=[i[-1] for i in items])[0]

    def company_name(self) -> str:
        return f"{self.rng.choice(C.COMPANY_WORDS)} {self.rng.choice(C.COMPANY_SUFFIX)}"

    def iban(self) -> str:
        # "00" check digits never validate, so this can never be a real account.
        return "BE00" + "".join(str(self.rng.randint(0, 9)) for _ in range(12))

    def vat(self) -> str:
        base = self.rng.randint(10_000_000, 99_999_999)
        valid = 97 - (base % 97)
        check = (valid + self.rng.randint(1, 96)) % 97 or 1   # deliberately wrong check digits
        return f"BE0{base:08d}{check:02d}"

    # ------------------------------------------------------------ one customer
    def customer(self, ov: dict | None = None) -> None:
        ov = ov or {}
        rng = self.rng
        cid = self.nid("customers")
        persona = ov.get("persona") or self.weighted({k: v["share"] for k, v in C.PERSONAS.items()})
        P = C.PERSONAS[persona]

        age = ov.get("age", rng.randint(*P["age"]))
        birth = PERIOD_END - timedelta(days=age * 365 + rng.randint(0, 364))
        city, postal, region = (next(c[:3] for c in C.CITIES if c[0] == ov["city"]) if "city" in ov
                                else self.weighted(C.CITIES))
        language = ov.get("language") or {"flanders": "nl" if rng.random() < 0.93 else "en",
                                          "wallonia": "fr" if rng.random() < 0.93 else "en",
                                          "brussels": rng.choices(["fr", "nl", "en"], [60, 25, 15])[0]}[region]
        gender = ov.get("gender") or rng.choices(["f", "m", "x"], [49.5, 49.5, 1])[0]
        name_gender = gender if gender != "x" else rng.choice("fm")
        first = ov.get("first_name") or rng.choice(C.FIRST_NAMES[(language, name_gender)])
        last = ov.get("last_name") or rng.choice(C.LAST_NAMES[language])

        couple = ov.get("couple", rng.random() < P["couple_p"])
        if couple:
            marital = "married" if rng.random() < (0.35 if age < 32 else 0.65) else "cohabiting"
        elif age > 70 and rng.random() < 0.35:
            marital = "widowed"
        elif age > 35 and rng.random() < 0.3:
            marital = "divorced"
        else:
            marital = "single"

        # Children (ages in years at the end of the period).
        if "kids" in ov:
            kid_ages = list(ov["kids"])
        else:
            n = rng.randint(*P["kids"])
            hi = max(0, min(age - 22, 12 if persona == "young_family" else 24))
            lo = min(hi, 6 if persona == "established_family" else 0)
            kid_ages = [rng.randint(lo, hi) for _ in range(n)]
            if persona in ("self_employed", "business_owner") and age < 30:
                kid_ages = []
        status = P["status"]
        segment = {"self_employed": "self_employed", "business_owner": "business_owner"}.get(status, "private")
        income = round(rng.uniform(*P["income"]), 2)

        owner = ov.get("owner", rng.random() < P["owner_p"])
        has_car = ov.get("has_car", rng.random() < P["car_p"])
        is_ev = ov.get("is_ev", has_car and rng.random() < 0.12)

        # ---- life moment (ground truth)
        moment = ov.get("moment")
        if moment is None:
            moment = "none"
            eligible = {
                "buy_house": not owner,
                "start_business": status == "employee",
                "new_parent": couple and age <= 42 and gender != "x",
                "buy_ev": has_car and not is_ev,
                "prepare_retirement": age >= 50,
            }
            for m in rng.sample(list(C.MOMENTS), len(C.MOMENTS)):
                if eligible[m] and rng.random() < C.MOMENTS[m]["p"].get(persona, 0):
                    moment = m
                    break
        M = C.MOMENTS.get(moment)
        m_start = conv_date = None
        converted = False
        if M:
            lead = ov.get("lead_days", rng.randint(*M["lead_days"]))
            m_start = PERIOD_END - timedelta(days=lead)
            converted = ov.get("converted", rng.random() < M["convert_p"])
            if converted:
                lo, hi = m_start + timedelta(days=30), PERIOD_END - timedelta(days=5)
                if lo < hi:
                    conv_date = self.day_in(lo, hi)
                else:
                    converted = False

        # ---- housing & property
        if owner:
            housing, rent = "owner", None
        elif (persona == "student" and rng.random() < 0.7) or (age < 27 and rng.random() < 0.25):
            housing, rent = "with_parents", None
        else:
            base = 1050 if region == "brussels" or city in ("Gent", "Antwerpen", "Leuven") else 850
            rent = round(rng.uniform(0.75, 1.3) * base * (1.25 if kid_ages else 1), 0)
            housing = "tenant"

        home = None   # (build_year, epc, kind, value, acquired_on)
        if owner:
            home = self.property(cid, postal, age, birth)
        bought = None
        if moment == "buy_house" and converted:
            bought = self.property(cid, postal, age, birth, acquired_on=conv_date)
            housing = "owner"   # status at the end of the period

        since_lo = max(birth + timedelta(days=18 * 365), date(1995, 1, 1))
        customer_since = self.day_in(since_lo, PERIOD_START - timedelta(days=60))

        email = f"{slug(first)}.{slug(last)}"
        while email + "@example.com" in self.used_emails:
            email += str(rng.randint(0, 9))
        email += "@example.com"
        self.used_emails.add(email)

        self.add("customers", id=cid, first_name=first, last_name=last, birth_date=birth, gender=gender,
                 language=language, email=email, postal_code=postal, city=city, region=region,
                 marital_status=marital, segment=segment, customer_since=customer_since,
                 is_demo="demo_slug" in ov, demo_slug=ov.get("demo_slug"))

        kids = []   # birth dates
        for a in kid_ages:
            bd = PERIOD_END - timedelta(days=a * 365 + rng.randint(0, 364))
            kids.append(bd)
        birth_of_new_child = None
        if moment == "new_parent":
            birth_of_new_child = m_start + timedelta(days=rng.randint(60, 130))
            if birth_of_new_child <= PERIOD_END:
                kids.append(birth_of_new_child)
            else:
                birth_of_new_child = None
        for bd in kids:
            self.add("customer_children", id=self.nid("customer_children"), customer_id=cid,
                     first_name=rng.choice(C.FIRST_NAMES[(language, rng.choice("fm"))]), birth_date=bd)

        # ---- employment
        employer = company = vat = founded = sector = None
        emp_since = self.day_in(birth + timedelta(days=22 * 365), PERIOD_START - timedelta(days=90)) \
            if age >= 23 else PERIOD_START - timedelta(days=rng.randint(30, 900))
        if status in ("employee",):
            employer, sector = self.company_name(), rng.choice(C.SECTORS)
        elif status in ("self_employed", "business_owner"):
            company, vat, sector = self.company_name(), self.vat(), rng.choice(C.SECTORS)
            founded = emp_since
        elif status == "student":
            emp_since = birth + timedelta(days=18 * 365)
        elif status == "retired":
            emp_since = birth + timedelta(days=65 * 365)
        self.add("customer_employment", customer_id=cid, status=status, sector=sector, employer_name=employer,
                 company_name=company, company_vat=vat, company_founded_on=founded,
                 monthly_net_income_eur=income, since=emp_since)
        self.add("customer_housing", customer_id=cid, status=housing, monthly_rent_eur=rent)

        # ---- accounts
        accounts = {}
        cur_item = C.ITEM["kbc_plus_account"] if rng.random() < 0.75 else C.ITEM["kbc_basic_account"]
        accounts["current"] = self.account(cid, cur_item, "current", customer_since)
        if rng.random() < 0.85 or moment == "buy_house":
            accounts["savings"] = self.account(cid, C.ITEM["savings_account"], "savings",
                                               self.day_in(customer_since, PERIOD_START - timedelta(days=30)))
        if segment != "private" and rng.random() < 0.9:
            accounts["business"] = self.account(cid, C.ITEM["business_pro_account"], "business_current",
                                                max(customer_since, founded or customer_since))
        if moment == "start_business" and converted:
            accounts["business"] = self.account(cid, C.ITEM["business_pro_account"], "business_current", conv_date)
        if persona in ("pre_retiree", "retiree") and rng.random() < 0.15:
            accounts["term"] = self.account(cid, C.ITEM["term_deposit"], "term_deposit",
                                            self.day_in(customer_since, PERIOD_START - timedelta(days=30)))

        # ---- loans (each: dict with payment, start, end, category)
        loans = []
        if owner and rng.random() < P["mortgage_p"] and home:
            loans.append(self.loan(cid, C.ITEM["home_loan"], "home", (140_000, 380_000), (240, 300), home["acquired_on"]))
        if bought:
            loans.append(self.loan(cid, C.ITEM["home_loan"], "home", (200_000, 420_000), (240, 300), conv_date))
        if has_car and not is_ev and moment == "buy_ev":
            # The current car loan is ending: the classic trigger for a new car.
            end = PERIOD_END + timedelta(days=rng.randint(-60, 200))
            term = rng.choice([48, 60])
            loans.append(self.loan(cid, C.ITEM["petrol_car_loan"], "car", (14_000, 32_000), (term, term),
                                   end - timedelta(days=term * 30)))
        elif has_car and rng.random() < 0.4:
            term = rng.choice([48, 60, 72])
            loans.append(self.loan(cid, C.ITEM["electric_car_loan"] if is_ev else C.ITEM["petrol_car_loan"], "car",
                                   (12_000, 42_000), (term, term),
                                   PERIOD_END - timedelta(days=rng.randint(30, term * 30 - 30))))
        if moment == "buy_ev" and converted:
            loans.append(self.loan(cid, C.ITEM["electric_car_loan"], "car", (28_000, 60_000), (60, 72), conv_date))
        if owner and home and rng.random() < (0.18 if home["build_year"] < 1985 else 0.06):
            loans.append(self.loan(cid, C.ITEM["renovation_loan"], "renovation", (10_000, 60_000), (60, 120),
                                   PERIOD_END - timedelta(days=rng.randint(60, 1500))))
        if owner and rng.random() < 0.06:
            loans.append(self.loan(cid, C.ITEM["energy_loan"], "energy", (5_000, 25_000), (60, 120),
                                   PERIOD_END - timedelta(days=rng.randint(60, 1500))))
        if rng.random() < 0.08 and persona not in ("retiree",):
            loans.append(self.loan(cid, C.ITEM["personal_loan"], "personal", (2_000, 12_000), (24, 48),
                                   PERIOD_END - timedelta(days=rng.randint(30, 700))))
        if segment == "business_owner" and rng.random() < 0.4:
            loans.append(self.loan(cid, C.ITEM["investment_loan"], "business_investment", (25_000, 150_000), (60, 120),
                                   PERIOD_END - timedelta(days=rng.randint(60, 1800))))
        loans = [l for l in loans if l]

        # ---- product holdings
        holdings: dict[int, tuple[date, float | None]] = {}

        def hold(row: int, p: float, since: date | None = None):
            if row in holdings or rng.random() >= p:
                return
            since = since or self.day_in(customer_since, PERIOD_START - timedelta(days=15))
            prem = self.money(*PREMIUM[row]) if row in PREMIUM else None
            holdings[row] = (since, prem)

        hold(C.ITEM["debit_card"], 1.0)
        hold(C.ITEM["credit_card"], 0.55 if income > 2200 else 0.25)
        hold(C.ITEM["kate"], 0.7 if age < 60 else 0.4)
        hold(C.ITEM["apple_pay"], 0.35 if age < 45 else 0.1)
        hold(C.ITEM["home_insurance"], 0.92 if owner else (0.5 if housing == "tenant" else 0.0))
        if has_car:
            hold(C.ITEM["ev_insurance"] if is_ev else C.ITEM["car_insurance"], 0.85)
        hold(C.ITEM["family_insurance"], 0.65 if (couple or kid_ages) else 0.4)
        hold(C.ITEM["hospitalisation_insurance"], 0.45)
        if 25 <= age <= 64 and moment != "prepare_retirement":
            hold(C.ITEM["pension_savings_fund"], 0.45)
        hold(C.ITEM["investment_plan"], 0.35 if income > 3200 else 0.15)
        hold(C.ITEM["life_insurance"], 0.3 if kid_ages else 0.12)
        if any(l["kind"] == "home" and l["start"] < PERIOD_START for l in loans):
            hold(C.ITEM["outstanding_balance_insurance"], 0.8)
        if kid_ages and moment != "new_parent":
            hold(C.ITEM["save_for_someone_else"], 0.25)
        hold(C.ITEM["travel_insurance"], 0.25)
        if segment == "self_employed":
            hold(C.ITEM["guaranteed_income_self_employed"], 0.4)
            hold(C.ITEM["supplementary_pension_self_employed"], 0.5)
            hold(C.ITEM["professional_liability"], 0.6)
        if segment == "business_owner":
            hold(C.ITEM["business_liability"], 0.7)
            hold(C.ITEM["supplementary_pension_self_employed"], 0.5)
        if converted and moment in ("new_parent", "prepare_retirement"):
            anchor = M["anchor"]
            holdings[anchor] = (conv_date, None)
        if bought:
            holdings.setdefault(C.ITEM["home_insurance"], (conv_date, self.money(*PREMIUM[C.ITEM["home_insurance"]])))
        if moment == "buy_ev" and converted:
            holdings.pop(C.ITEM["car_insurance"], None)
            holdings[C.ITEM["ev_insurance"]] = (conv_date, self.money(*PREMIUM[C.ITEM["ev_insurance"]]))
        for row, (since, prem) in holdings.items():
            self.add("product_holdings", id=self.nid("product_holdings"), customer_id=cid, ecosystem_item_row=row,
                     since=since, monthly_premium_eur=prem, status="active")

        is_demo = "demo_slug" in ov   # demo personas show a clear story: fully digital, money signals on
        engagement = 1.0 if is_demo else (self.weighted(C.ENGAGEMENT) if M else 1.0)
        curious = None   # (moment, intensity, from_date) for hard negatives
        if "extra_views" not in ov and not M and rng.random() < C.CURIOUS_P:
            months = rng.randint(*C.CURIOUS_MONTHS)
            curious = (rng.choice(list(C.MOMENT_BEHAVIOUR)), rng.uniform(*C.CURIOUS_INTENSITY),
                       PERIOD_END - timedelta(days=30 * months))
        money_signal = is_demo or rng.random() < C.MONEY_SIGNAL_P

        ctx = dict(cid=cid, persona=persona, engagement=engagement, curious=curious, money_signal=money_signal, age=age, income=income, status=status, segment=segment, region=region,
                   housing=housing, rent=rent, home=home, bought=bought, has_car=has_car, is_ev=is_ev, kids=kids,
                   couple=couple, accounts=accounts, loans=loans, holdings=holdings, moment=moment, m_start=m_start,
                   converted=converted, conv_date=conv_date, new_child=birth_of_new_child, employer=employer,
                   company=company, last_name=last)
        self.transactions(ctx)
        self.app_events(ctx, ov.get("extra_views", []))

        self.add("customer_truth", customer_id=cid, persona=persona, life_moment=moment,
                 moment_started_on=m_start, converted=converted)

    # ------------------------------------------------------------ product helpers
    def property(self, cid, postal, age, birth, acquired_on=None):
        rng = self.rng
        build_year = int(rng.choices([rng.randint(1900, 1945), rng.randint(1946, 1970), rng.randint(1971, 1990),
                                      rng.randint(1991, 2005), rng.randint(2006, 2024)], [10, 25, 30, 20, 15])[0])
        epc_by_era = [(1970, ["F", "E", "D"], [35, 45, 20]), (1990, ["E", "D", "C"], [35, 45, 20]),
                      (2006, ["D", "C", "B"], [30, 50, 20]), (2015, ["C", "B", "A"], [25, 50, 25]),
                      (9999, ["B", "A", "A+"], [15, 60, 25])]
        epc = next(rng.choices(l, w)[0] for y, l, w in epc_by_era if build_year <= y)
        kind = "house" if rng.random() < 0.75 else "apartment"
        value = round(rng.uniform(190_000, 520_000) * (1.0 if kind == "house" else 0.8), -3)
        if acquired_on is None:
            earliest = max(birth + timedelta(days=24 * 365), date(1990, 1, 1))
            acquired_on = self.day_in(earliest, PERIOD_START - timedelta(days=90))
        pid = self.nid("properties")
        self.add("properties", id=pid, customer_id=cid, kind=kind, build_year=build_year, epc_label=epc,
                 estimated_value_eur=value, postal_code=postal, acquired_on=acquired_on)
        return {"build_year": build_year, "epc": epc, "kind": kind, "value": value, "acquired_on": acquired_on}

    def account(self, cid, item_row, kind, opened_on):
        aid = self.nid("accounts")
        row = {"id": aid, "customer_id": cid, "ecosystem_item_row": item_row, "kind": kind, "iban": self.iban(),
               "opened_on": opened_on, "balance_eur": 0.0}
        self.rows["accounts"].append(row)
        return row

    def loan(self, cid, item_row, kind, principal_range, term_range, start):
        rng = self.rng
        principal = round(rng.uniform(*principal_range), -2)
        term = rng.randint(*term_range)
        rate = {"home": (1.8, 3.9), "renovation": (2.5, 5.0), "energy": (0.0, 3.0), "car": (2.9, 6.5),
                "personal": (5.0, 9.5), "business_investment": (3.5, 6.5)}[kind]
        rate = round(rng.uniform(*rate), 3)
        r = rate / 1200
        pay = principal / term if r == 0 else principal * r / (1 - (1 + r) ** -term)
        end = start + timedelta(days=round(term * 30.44))
        paid = max(0, min(term, months_between(start, PERIOD_END)))
        if r == 0:
            outstanding = principal - pay * paid
        else:
            outstanding = principal * (1 + r) ** paid - pay * ((1 + r) ** paid - 1) / r
        status = "active" if end > PERIOD_END else "repaid"
        outstanding = max(0.0, round(outstanding, 2)) if status == "active" else 0.0
        self.add("loans", id=self.nid("loans"), customer_id=cid, ecosystem_item_row=item_row, kind=kind,
                 principal_eur=principal, annual_rate_pct=rate, term_months=term, monthly_payment_eur=round(pay, 2),
                 start_date=start, end_date=end, outstanding_eur=outstanding, status=status)
        return {"kind": kind, "payment": round(pay, 2), "start": start, "end": end}

    # ------------------------------------------------------------ transactions
    def transactions(self, x: dict) -> None:
        rng = self.rng
        txs: list[tuple] = []   # (account, date, amount, category, counterparty, description)
        cur = x["accounts"]["current"]
        sav = x["accounts"].get("savings")
        bus = x["accounts"].get("business")
        moment, m_start, conv = x["moment"], x["m_start"], x["conv_date"]

        def active(d):        # moment is ongoing on date d
            return m_start is not None and d >= m_start

        def tx(acc, d, amount, cat, cp, desc=None):
            if PERIOD_START <= d <= PERIOD_END and round(amount, 2) != 0:
                txs.append((acc, d, round(amount, 2), cat, cp, desc))

        def spend(cat, d, scale=1.0):
            name, (lo, hi) = rng.choice(C.MERCHANTS[cat])
            tx(cur, d, -self.money(lo, hi) * scale, cat, name)

        subs = rng.sample(C.MERCHANTS["subscriptions"], rng.randint(0, 3))
        telecom = rng.choice(C.MERCHANTS["telecom"])
        energy_name = rng.choice(C.MERCHANTS["energy_utilities"])[0]
        clients = [self.company_name() for _ in range(rng.randint(2, 5))]
        new_clients = [self.company_name() for _ in range(rng.randint(1, 3))]
        salary_stops = moment == "start_business" and rng.random() < 0.4
        uses_accounting = moment == "start_business" and rng.random() < 0.6
        household = 1 + (1 if x["couple"] else 0) + len(x["kids"])
        save_rate = rng.uniform(0.03, 0.15)
        save_boost = rng.uniform(1.3, 3.0)
        social_fund = rng.choice(SOCIAL_FUNDS)

        if x["home"]:
            epc_factor = {"A+": 0.45, "A": 0.6, "B": 0.75, "C": 0.9, "D": 1.1, "E": 1.35, "F": 1.6}[x["home"]["epc"]]
            energy_base = 165 * epc_factor * (1.0 if x["home"]["kind"] == "house" else 0.7)
        else:
            energy_base = 95 + 15 * household

        for m0, m1 in self.months:
            # -- income
            payday = m0.replace(day=min(26, m1.day))
            if x["status"] == "employee" and not (salary_stops and m0 > m_start + timedelta(days=45)):
                tx(cur, payday, x["income"] * rng.uniform(0.97, 1.03), "salary", x["employer"], "Salary")
            elif x["status"] == "self_employed":
                for c in rng.sample(clients, min(len(clients), rng.randint(1, 4))):
                    tx(bus or cur, self.day_in(m0, m1), x["income"] * rng.uniform(0.3, 0.6), "freelance_income", c,
                       f"Invoice {m0.year}-{rng.randint(10, 999):03d}")
            elif x["status"] == "business_owner":
                tx(cur, payday, x["income"], "transfer_in", x["company"], "Management fee")
            elif x["status"] == "retired":
                tx(cur, m0.replace(day=min(5, m1.day)), x["income"], "pension_income", "Federale Pensioendienst", "Pension")
            elif x["status"] == "student":
                tx(cur, m0.replace(day=1), x["income"] * 0.6, "transfer_in", f"{x['last_name']} (parent)", "Pocket money")
                if rng.random() < 0.5:
                    tx(cur, payday, x["income"] * rng.uniform(0.3, 0.8), "salary", self.company_name(), "Student job")
            if moment == "start_business" and m1 >= m_start:
                n = 1 + (m0 > m_start) + (m0 > m_start + timedelta(days=60))
                for c in rng.sample(new_clients, min(len(new_clients), n)):
                    d = self.day_in(max(m0, m_start), m1)
                    target = bus if (bus and conv and d >= conv) else cur
                    tx(target, d, rng.uniform(400, 2400), "freelance_income", c, f"Invoice {rng.randint(1, 60):03d}")
            if x["kids"]:
                n_kids = sum(1 for bd in x["kids"] if bd <= m0 and (m0 - bd).days < 25 * 365)
                if n_kids:
                    payer = {"flanders": rng.choice(GROEIPAKKET_PAYERS), "wallonia": "FAMIWAL",
                             "brussels": "Famiris"}[x["region"]]
                    tx(cur, m0.replace(day=min(8, m1.day)), 175 * n_kids, "benefits", payer, "Child benefit")

            # -- fixed costs
            if x["rent"] and not (x["bought"] and m0 > conv):
                tx(cur, m0.replace(day=rng.randint(1, 5)), -x["rent"], "rent", "Landlord", "Rent")
            for l in x["loans"]:
                if l["start"] <= m0 < l["end"]:
                    tx(cur, m0.replace(day=min(10, m1.day)), -l["payment"],
                       "mortgage_payment" if l["kind"] == "home" else "loan_payment", "KBC Bank", f"{l['kind']} loan")
            if x["housing"] != "with_parents" or x["bought"]:
                seasonal = 1.25 if m0.month in (10, 11, 12, 1, 2, 3) else 0.85
                tx(cur, m0.replace(day=min(15, m1.day)), -energy_base * seasonal * rng.uniform(0.9, 1.1),
                   "energy_utilities", energy_name, "Monthly advance")
            tx(cur, m0.replace(day=min(20, m1.day)), -self.money(*telecom[1]), "telecom", telecom[0])
            for name, (lo, hi) in subs:
                tx(cur, m0.replace(day=min(rng.randint(1, 28), m1.day)), -round((lo + hi) / 2, 2), "subscriptions", name)
            premiums = sum(p for s, p in x["holdings"].values() if p and s <= m1)
            if premiums:
                tx(cur, m0.replace(day=min(3, m1.day)), -premiums, "insurance_premium", "KBC Verzekeringen", "Premiums")
            if C.ITEM["pension_savings_fund"] in x["holdings"] and x["holdings"][C.ITEM["pension_savings_fund"]][0] <= m1:
                tx(cur, m0.replace(day=min(12, m1.day)), -PENSION_SAVINGS_MONTHLY, "investment",
                   "KBC Asset Management", "Pension savings")
            if C.ITEM["investment_plan"] in x["holdings"]:
                tx(cur, m0.replace(day=min(12, m1.day)), -round(rng.choice([50, 100, 150, 250]), 2), "investment",
                   "KBC Asset Management", "Investment plan")
            if moment == "prepare_retirement" and active(m1) and rng.random() < 0.4:
                tx(cur, self.day_in(max(m0, m_start), m1), -self.money(1000, 8000), "investment",
                   "KBC Asset Management", "Lump sum")

            # -- variable spending
            frugal = 0.6 if moment == "buy_house" and active(m1) and x["money_signal"] else 1.0
            for _ in range(rng.randint(3, 6) + household * 2):
                spend("groceries", self.day_in(m0, m1), 0.8 + 0.1 * household)
            if x["has_car"]:
                ev_now = x["is_ev"] or (moment == "buy_ev" and conv and m0 >= conv)
                for _ in range(rng.randint(2, 6) if ev_now else rng.randint(2, 4)):
                    spend("ev_charging" if ev_now else "fuel", self.day_in(m0, m1))
                if rng.random() < 0.12:
                    spend("car_maintenance", self.day_in(m0, m1))
            for _ in range(rng.randint(0, 2) if x["has_car"] else rng.randint(5, 12)):
                spend("public_transport", self.day_in(m0, m1))
            for _ in range(round(rng.randint(1, 8) * frugal * (0.6 if x["age"] > 65 else 1))):
                spend("restaurants", self.day_in(m0, m1))
            for _ in range(round(rng.randint(1, 5) * frugal)):
                spend("shopping", self.day_in(m0, m1))
            for _ in range(rng.randint(0, 2)):
                spend("health", self.day_in(m0, m1))
            if rng.random() < (0.45 if m0.month in (7, 8) else 0.12) * frugal:
                spend("travel", self.day_in(m0, m1))
            if rng.random() < 0.08:
                spend("furniture", self.day_in(m0, m1))
            if rng.random() < 0.05:
                spend("electronics", self.day_in(m0, m1))
            if x["home"] or (x["bought"] and m0 > conv):
                old = x["home"] and x["home"]["build_year"] < 1985
                for _ in range(rng.randint(0, 2 if old else 1)):
                    spend("home_improvement", self.day_in(m0, m1))
            if x["age"] > 55 or rng.random() < 0.4:
                tx(cur, self.day_in(m0, m1), -rng.choice([20, 40, 50, 100, 150]), "cash_withdrawal", "KBC ATM")
            if rng.random() < 0.3:
                tx(cur, self.day_in(m0, m1), -self.money(5, 120), "other", "Payconiq transfer")

            # -- children
            young = [bd for bd in x["kids"] if bd <= m1 and (m1 - bd).days < 4 * 365]
            school = [bd for bd in x["kids"] if 3 * 365 <= (m1 - bd).days < 18 * 365]
            for _ in range(len(young) * rng.randint(1, 3)):
                spend("baby_kids", self.day_in(m0, m1))
            if any((m1 - bd).days < 3 * 365 for bd in young):
                tx(cur, m0.replace(day=min(5, m1.day)), -self.money(300, 650), "childcare_school",
                   "Kinderopvang Kribbebijter", "Childcare")
            for _ in school:
                if rng.random() < 0.5:
                    spend("childcare_school", self.day_in(m0, m1), 0.6)

            # -- self-employed obligations
            if x["segment"] != "private" and m0.month in (1, 4, 7, 10):
                tx(bus or cur, m0.replace(day=min(10, m1.day)), -x["income"] * rng.uniform(0.35, 0.6), "taxes",
                   "FOD Financiën", "Advance tax payment")
                tx(bus or cur, m0.replace(day=min(20, m1.day)), -self.money(800, 1900), "taxes", social_fund,
                   "Social contributions")

            # -- life moment behaviour (from the moment start)
            if moment == "buy_house" and active(m1):
                if conv and m0 <= conv - timedelta(days=30) <= m1:
                    tx(cur, conv - timedelta(days=30), -x["bought"]["value"] * 0.10, "notary",
                       f"Notariskantoor {rng.choice(C.LAST_NAMES['nl'])}", "Deposit (10%)")
                if conv and m0 <= conv <= m1:
                    tx(cur, conv, -x["bought"]["value"] * rng.uniform(0.04, 0.08), "notary",
                       f"Notariskantoor {rng.choice(C.LAST_NAMES['nl'])}", "Registration fees and notary costs")
                    for _ in range(rng.randint(2, 5)):
                        spend("furniture", self.day_in(conv, m1))
            if moment == "start_business" and active(m1):
                if m0 <= m_start + timedelta(days=10) <= m1:
                    spend("electronics", m_start + timedelta(days=10), 1.5)
                for _ in range(rng.randint(0, 2)):
                    spend("business_supplies", self.day_in(max(m0, m_start), m1))
                if uses_accounting and m1 >= m_start + timedelta(days=30):
                    spend("accounting_software", self.day_in(m0, m1))
            if moment == "new_parent" and active(m1):
                for _ in range(rng.randint(1, 3)):
                    spend("baby_kids", self.day_in(max(m0, m_start), m1), 1.8)
                if x["new_child"] and m0 <= x["new_child"] <= m1:
                    tx(cur, x["new_child"] + timedelta(days=3), -self.money(250, 1200), "health", "AZ Ziekenhuis",
                       "Maternity stay")
                    for _ in range(2):
                        spend("furniture", self.day_in(m0, m1))

            # -- savings (two legs)
            if sav:
                ramp = save_boost if moment == "buy_house" and active(m1) and x["money_signal"] else 1.0
                amount = x["income"] * save_rate * ramp
                if moment == "buy_house" and conv and m0 > conv:
                    amount *= 0.2
                d = m0.replace(day=min(27, m1.day))
                tx(cur, d, -amount, "savings_transfer", "Own savings account", "Monthly saving")
                tx(sav, d, amount, "savings_transfer", "Own current account", "Monthly saving")
                if moment == "buy_house" and conv and m0 <= conv - timedelta(days=31) <= m1:
                    big = x["bought"]["value"] * 0.12
                    tx(sav, conv - timedelta(days=31), -big, "savings_transfer", "Own current account", "Deposit for house")
                    tx(cur, conv - timedelta(days=31), big, "savings_transfer", "Own savings account", "Deposit for house")

        # Opening balances: high enough that no account goes below zero.
        txs.sort(key=lambda t: t[1])
        running: dict[int, float] = {}
        low: dict[int, float] = {}
        for acc, _, amount, *_ in txs:
            running[acc["id"]] = running.get(acc["id"], 0.0) + amount
            low[acc["id"]] = min(low.get(acc["id"], 0.0), running[acc["id"]])
        for acc in x["accounts"].values():
            base = {"current": x["income"] * rng.uniform(0.3, 1.5), "savings": x["income"] * rng.uniform(1, 25),
                    "business_current": x["income"] * rng.uniform(0.5, 3),
                    "term_deposit": rng.uniform(10_000, 80_000)}[acc["kind"]]
            acc["balance_eur"] = round(max(base, -low.get(acc["id"], 0.0) + 50) + running.get(acc["id"], 0.0), 2)
        for acc, d, amount, cat, cp, desc in txs:
            self.add("transactions", id=self.nid("transactions"), account_id=acc["id"], customer_id=x["cid"],
                     booked_on=d, amount_eur=amount, category=cat, counterparty=cp, description=desc)

    # ------------------------------------------------------------ app events
    def app_events(self, x: dict, extra_views: list[int]) -> None:
        rng = self.rng
        events: list[tuple] = []   # (datetime, session, channel, type, row, detail)
        scale = 0.5 if x["age"] > 65 else (0.8 if x["age"] < 22 else 1.0)
        moment, m_start = x["moment"], x["m_start"]
        moment_pages = [r for b in C.MOMENT_BEHAVIOUR.values() for r in b["views"]]

        def ts(d: date) -> datetime:
            hour = rng.choices(range(24), weights=[1, 1, 1, 1, 1, 2, 4, 8, 10, 9, 8, 8, 10, 9, 8, 8, 9, 10, 12, 14, 14, 12, 7, 3])[0]
            return datetime(d.year, d.month, d.day, hour, rng.randint(0, 59), rng.randint(0, 59), tzinfo=timezone.utc)

        def session() -> str:
            return f"s{x['cid']}-{rng.getrandbits(40):010x}"

        def ev(d, typ, row=None, detail=None, channel=None, sid=None):
            if PERIOD_START <= d <= PERIOD_END:
                events.append((ts(d), sid or session(), channel or ("kbc_mobile" if rng.random() < 0.85 else "kbc_touch"),
                               typ, row, detail or {}))

        for m0, m1 in self.months:
            for _ in range(round(rng.randint(*C.APP_SESSIONS_PER_MONTH) * scale)):
                d, sid = self.day_in(m0, m1), session()
                for _ in range(rng.randint(1, 3)):
                    ev(d, "page_view", self.weighted(C.BASELINE_VIEWS), sid=sid)
            for _ in range(self.poisson(C.NOISE_VIEWS_PER_MONTH)):
                ev(self.day_in(m0, m1), "page_view", rng.choice(moment_pages))
            for _ in range(self.poisson(0.5 * scale)):
                row, q = rng.choice(GENERIC_KATE)
                ev(self.day_in(m0, m1), "kate_question", row, {"question": q}, channel="kate")

            # A real moment (scaled by digital engagement) or a hard negative's curiosity.
            topic = None
            if moment in C.MOMENT_BEHAVIOUR:
                topic, since, k_views, k_sim, k_kate = moment, m_start, x["engagement"], x["engagement"], x["engagement"]
            elif x["curious"]:
                topic, k_views, since = x["curious"][0], x["curious"][1], x["curious"][2]
                k_sim, k_kate = 0.1 * k_views, 0.3 * k_views
            if topic and m1 >= since:
                B = C.MOMENT_BEHAVIOUR[topic]
                lo = max(m0, since)
                frac = ((m1 - lo).days + 1) / ((m1 - m0).days + 1)
                for row, rate in B["views"].items():
                    for _ in range(self.poisson(rate * frac * k_views)):
                        ev(self.day_in(lo, m1), "page_view", row)
                if B["simulation"]:
                    s = B["simulation"]
                    for _ in range(self.poisson(s["per_month"] * frac * k_sim)):
                        ev(self.day_in(lo, m1), "simulation", s["row"],
                           {"amount": round(rng.uniform(*s["amount"]), -3)})
                for _ in range(self.poisson(0.9 * frac * k_kate)):
                    ev(self.day_in(lo, m1), "kate_question", None, {"question": rng.choice(B["kate"])}, channel="kate")

        for row in extra_views:
            ev(self.day_in(PERIOD_END - timedelta(days=60), PERIOD_END), "page_view", row)
        if x["converted"] and moment in C.MOMENTS:
            anchor, conv = C.MOMENTS[moment]["anchor"], x["conv_date"]
            sid = session()
            ev(conv - timedelta(days=5), "application_started", anchor, sid=sid)
            ev(conv, "application_completed", anchor)

        events.sort(key=lambda e: e[0])
        for t, sid, channel, typ, row, detail in events:
            self.add("app_events", id=self.nid("app_events"), customer_id=x["cid"], session_id=sid,
                     occurred_at=t.isoformat(), channel=channel, event_type=typ, ecosystem_item_row=row,
                     detail=json.dumps(detail, ensure_ascii=False))


# ---------------------------------------------------------------- utilities

def month_ranges(start: date, end: date) -> list[tuple[date, date]]:
    out, d = [], start.replace(day=1)
    while d <= end:
        nxt = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
        out.append((max(d, start), min(nxt - timedelta(days=1), end)))
        d = nxt
    return out


def months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


def slug(s: str) -> str:
    table = str.maketrans("éèêëàâçîïôöûüÉ", "eeeeaaciioouuE")
    return "".join(ch for ch in s.translate(table).lower() if ch.isalnum())


def fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        return f"{v:.2f}"
    return str(v)


def sql_literal(v) -> str:
    if v is None or v == "":
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return fmt(v)
    return "'" + str(v).replace("'", "''") + "'"


def write_csvs(g: Gen, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for table, cols in COLUMNS.items():
        with open(out / f"{table}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for r in g.rows[table]:
                w.writerow([fmt(r.get(c)) for c in cols])


def write_demo_sql(g: Gen, out: Path) -> None:
    """INSERTs for the demo personas only (small enough for the SQL editor / MCP)."""
    demo_ids = {r["id"] for r in g.rows["customers"] if r["is_demo"]}
    item_cols = {"ecosystem_item_row"}
    schema = {"customer_truth": "ml"}
    lines = ["-- Generated by scripts/bank_data/generate.py — demo personas only. Do not edit by hand.", "begin;"]
    for table, cols in COLUMNS.items():
        key = "id" if table == "customers" else "customer_id"
        rows = [r for r in g.rows[table] if r[key] in demo_ids]
        if not rows:
            continue
        db_cols = ["ecosystem_item_id" if c in item_cols else c for c in cols]
        conflict = "(id)" if "id" in cols else "(customer_id)"
        for i in range(0, len(rows), 500):
            values = []
            for r in rows[i:i + 500]:
                vals = []
                for c in cols:
                    v = r.get(c)
                    if c in item_cols:
                        vals.append("null" if v is None else
                                    f"(select id from public.ecosystem_items where source_row = {int(v)})")
                    elif c == "detail":
                        vals.append(sql_literal(v) + "::jsonb")
                    else:
                        vals.append(sql_literal(v))
                values.append("(" + ", ".join(vals) + ")")
            lines.append(f"insert into {schema.get(table, 'public')}.{table} ({', '.join(db_cols)}) values\n  "
                         + ",\n  ".join(values) + f"\non conflict {conflict} do nothing;")
    lines.append("commit;")
    (out / "demo_personas.sql").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--customers", type=int, default=C.N_CUSTOMERS)
    ap.add_argument("--seed", type=int, default=C.SEED)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "out")
    args = ap.parse_args()

    g = Gen(args.seed)
    for ov in DEMO_PERSONAS:
        g.customer(ov)
    for _ in range(max(0, args.customers - len(DEMO_PERSONAS))):
        g.customer()
    write_csvs(g, args.out)
    write_demo_sql(g, args.out)

    print(f"wrote {args.out}")
    for t in COLUMNS:
        print(f"  {t:<22} {len(g.rows[t]):>8}")
    truth = g.rows["customer_truth"]
    for m in ["none", *C.MOMENTS]:
        n = sum(1 for r in truth if r["life_moment"] == m)
        conv = sum(1 for r in truth if r["life_moment"] == m and r["converted"])
        print(f"  moment {m:<20} {n:>6}  ({n / len(truth):.0%}, converted {conv})")


if __name__ == "__main__":
    main()
