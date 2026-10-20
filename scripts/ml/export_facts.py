"""Generated bank CSVs → CustomerFacts JSON (the shape of web/src/backend/types.ts).

Usage (from the repo root, after `python3 scripts/bank_data/generate.py`):
    python3 scripts/ml/export_facts.py [--as-of 2026-10-01]

Writes
- scripts/ml/out/facts.jsonl: one CustomerFacts per line, all customers (git-ignored, used for training);
- scripts/ml/out/labels.csv: customer_id, life_moment, moment_started_on, converted (ground truth);
- web/src/backend/fixtures/t1-demo-facts.json: the 6 demo personas (committed, used by the offline tests).

The CSVs are byte-identical to what scripts/bank_data/load.sql puts in Supabase (same seed), so this is
the "direct dump" path of T2: no database connection and no secret needed to train.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "scripts" / "bank_data" / "out"
OUT = ROOT / "scripts" / "ml" / "out"
DEMO_FIXTURE = ROOT / "web" / "src" / "backend" / "fixtures" / "t1-demo-facts.json"


def rows(table: str) -> list[dict]:
    with open(BANK / f"{table}.csv", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def by_customer(table: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for r in rows(table):
        out[r["customer_id"]].append(r)
    return out


def opt_int(v: str) -> int | None:
    return int(v) if v not in ("", None) else None


def opt_float(v: str) -> float | None:
    return float(v) if v not in ("", None) else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", default="2026-10-01")
    args = ap.parse_args()

    employment = {r["customer_id"]: r for r in rows("customer_employment")}
    housing = {r["customer_id"]: r for r in rows("customer_housing")}
    children, properties, accounts = by_customer("customer_children"), by_customer("properties"), by_customer("accounts")
    loans, holdings = by_customer("loans"), by_customer("product_holdings")
    transactions, app_events = by_customer("transactions"), by_customer("app_events")

    OUT.mkdir(parents=True, exist_ok=True)
    demo = []
    with open(OUT / "facts.jsonl", "w", encoding="utf-8") as f:
        for c in rows("customers"):
            cid = c["id"]
            e, h = employment[cid], housing[cid]
            facts = {
                "asOf": args.as_of,
                "customer": {"id": int(cid), "slug": c["demo_slug"] or None, "firstName": c["first_name"],
                             "birthDate": c["birth_date"], "region": c["region"], "maritalStatus": c["marital_status"],
                             "segment": c["segment"], "language": c["language"]},
                "employment": {"status": e["status"], "monthlyNetIncome": float(e["monthly_net_income_eur"]), "since": e["since"]},
                "housing": {"status": h["status"], "monthlyRent": opt_float(h["monthly_rent_eur"])},
                "children": [{"birthDate": k["birth_date"]} for k in children[cid]],
                "properties": [{"kind": p["kind"], "buildYear": int(p["build_year"]), "epcLabel": p["epc_label"] or None,
                                "estimatedValue": float(p["estimated_value_eur"])} for p in properties[cid]],
                "accounts": [{"kind": a["kind"], "balance": float(a["balance_eur"]), "sourceRow": opt_int(a["ecosystem_item_row"])}
                             for a in accounts[cid]],
                "loans": [{"kind": l["kind"], "monthlyPayment": float(l["monthly_payment_eur"]),
                           "outstanding": float(l["outstanding_eur"]), "status": l["status"],
                           "sourceRow": opt_int(l["ecosystem_item_row"])} for l in loans[cid]],
                "holdings": [{"sourceRow": int(p["ecosystem_item_row"]), "status": p["status"]} for p in holdings[cid]],
                "transactions": [{"id": t["id"], "bookedOn": t["booked_on"], "amount": float(t["amount_eur"]),
                                  "category": t["category"], "counterparty": t["counterparty"]} for t in transactions[cid]],
                "appEvents": [{"id": a["id"], "occurredAt": a["occurred_at"], "channel": a["channel"], "eventType": a["event_type"],
                               "sourceRow": opt_int(a["ecosystem_item_row"]), "detail": json.loads(a["detail"] or "{}")}
                              for a in app_events[cid]],
                "injectedEvents": [],
            }
            f.write(json.dumps(facts, ensure_ascii=False, separators=(",", ":")) + "\n")
            if c["is_demo"] == "true":
                demo.append(facts)

    with open(OUT / "labels.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["customer_id", "life_moment", "moment_started_on", "converted"])
        for r in rows("customer_truth"):
            w.writerow([r["customer_id"], r["life_moment"], r["moment_started_on"], r["converted"]])

    DEMO_FIXTURE.write_text(json.dumps(demo, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT / 'facts.jsonl'}, {OUT / 'labels.csv'} and {DEMO_FIXTURE.relative_to(ROOT)} ({len(demo)} demo personas)")


if __name__ == "__main__":
    main()
