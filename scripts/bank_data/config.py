"""Generation rules for the synthetic bank. Data only, no logic.

Every probability and amount below is an illustrative assumption for the hackathon,
not a KBC figure. Life moments are deliberately over-represented versus reality so a
model can be trained on a small population.

Catalogue services are referenced by their row in resources/KBC_Ecosystems.xlsx
(`ecosystem_items.source_row`), never by database id.
"""

SEED = 20261020
N_CUSTOMERS = 2000                 # including the demo personas
PERIOD_START = "2026-04-01"        # simulated history: 6 months
PERIOD_END = "2026-09-30"

# ------------------------------------------------------------------ personas (latent archetypes)
# share: fraction of the population; age: inclusive range; status: employment status.
# kids: (min, max) number of children; owner_p: probability of owning a home;
# mortgage_p: probability an owner still has a home loan; car_p: probability of owning a car.
PERSONAS = {
    "student":            {"share": 0.07, "age": (18, 24), "status": "student",        "income": (300, 900),   "couple_p": 0.05, "kids": (0, 0), "owner_p": 0.00, "mortgage_p": 0.0, "car_p": 0.15},
    "young_professional": {"share": 0.20, "age": (24, 34), "status": "employee",       "income": (2000, 3200), "couple_p": 0.45, "kids": (0, 0), "owner_p": 0.20, "mortgage_p": 1.0, "car_p": 0.55},
    "young_family":       {"share": 0.19, "age": (28, 42), "status": "employee",       "income": (2300, 3800), "couple_p": 0.95, "kids": (1, 3), "owner_p": 0.55, "mortgage_p": 0.95, "car_p": 0.85},
    "established_family": {"share": 0.17, "age": (40, 55), "status": "employee",       "income": (2800, 4800), "couple_p": 0.85, "kids": (1, 3), "owner_p": 0.85, "mortgage_p": 0.70, "car_p": 0.92},
    "self_employed":      {"share": 0.10, "age": (28, 60), "status": "self_employed",  "income": (2200, 5500), "couple_p": 0.65, "kids": (0, 3), "owner_p": 0.60, "mortgage_p": 0.65, "car_p": 0.85},
    "business_owner":     {"share": 0.07, "age": (35, 62), "status": "business_owner", "income": (3500, 8000), "couple_p": 0.75, "kids": (0, 3), "owner_p": 0.85, "mortgage_p": 0.50, "car_p": 0.95},
    "pre_retiree":        {"share": 0.11, "age": (55, 66), "status": "employee",       "income": (2900, 4800), "couple_p": 0.75, "kids": (0, 0), "owner_p": 0.85, "mortgage_p": 0.20, "car_p": 0.90},
    "retiree":            {"share": 0.09, "age": (66, 85), "status": "retired",        "income": (1500, 2800), "couple_p": 0.55, "kids": (0, 0), "owner_p": 0.80, "mortgage_p": 0.02, "car_p": 0.65},
}

# ------------------------------------------------------------------ life moments (ground truth)
# p: probability per persona (only eligible customers, see ELIGIBILITY in generate.py).
# anchor: catalogue row of the product that means "converted"; convert_p: share converted
# before the period ends. lead_days: how long before the end the moment may have started.
MOMENTS = {
    "buy_house": {
        "p": {"young_professional": 0.30, "young_family": 0.35, "self_employed": 0.15, "student": 0.02},
        "anchor": 2, "convert_p": 0.30, "lead_days": (20, 150),
    },
    "start_business": {
        "p": {"young_professional": 0.14, "young_family": 0.08, "established_family": 0.07},
        "anchor": 79, "convert_p": 0.40, "lead_days": (20, 150),
    },
    "new_parent": {
        "p": {"young_professional": 0.18, "young_family": 0.15},
        "anchor": 75, "convert_p": 0.35, "lead_days": (30, 160),
    },
    "buy_ev": {
        "p": {"young_family": 0.10, "established_family": 0.22, "self_employed": 0.12, "business_owner": 0.18, "pre_retiree": 0.12},
        "anchor": 27, "convert_p": 0.30, "lead_days": (20, 150),
    },
    "prepare_retirement": {
        "p": {"pre_retiree": 0.35, "self_employed": 0.06, "business_owner": 0.08},
        "anchor": 56, "convert_p": 0.35, "lead_days": (20, 150),
    },
}

# ------------------------------------------------------------------ in-app behaviour
# Per month, every customer opens the app a few times and looks at popular services.
APP_SESSIONS_PER_MONTH = (3, 14)
BASELINE_VIEWS = {   # catalogue row -> relative weight of a casual page view
    147: 6, 148: 4, 74: 6, 218: 8, 222: 5, 223: 3, 224: 4, 152: 3, 153: 3, 155: 2, 204: 2,
    127: 3, 31: 2, 65: 2, 56: 2, 210: 2, 201: 1, 211: 2, 226: 1, 43: 2, 42: 1, 39: 1,
}
# False positives: anyone may glance at a "moment" page without being in that moment.
NOISE_VIEWS_PER_MONTH = 0.6    # expected casual views of a random moment page per month
# Hard negatives: some customers without a moment browse one topic for a while (dreaming,
# comparing, helping a friend) but never act: no simulation, no change in money behaviour.
CURIOUS_P = 0.15               # share of customers without a moment
CURIOUS_INTENSITY = (0.2, 0.6) # multiplier on that moment's page views
CURIOUS_MONTHS = (1, 3)        # how long the curiosity lasts (last N months)
# False negatives: customers in a moment are not all digital. Multiplier on their in-app
# behaviour (views, simulations, Kate questions), drawn once per customer.
ENGAGEMENT = {0.1: 25, 0.5: 35, 1.0: 40}
# Share of customers in a moment whose money behaviour also changes (savings, spending).
MONEY_SIGNAL_P = 0.7

# Pages and Kate questions that a customer in a moment tends to produce, from the
# moment start onwards. views: catalogue row -> expected views per month.
MOMENT_BEHAVIOUR = {
    "buy_house": {
        "views": {18: 2.0, 2: 2.5, 17: 1.2, 15: 1.5, 14: 0.6, 12: 0.6, 8: 0.5, 10: 0.3, 3: 0.2},
        "simulation": {"row": 2, "per_month": 1.2, "amount": (180_000, 480_000)},
        "kate": ["How much can I borrow for a house?", "What are the registration fees on a first home?",
                 "Can I combine a home loan with a renovation loan?", "What does a notary cost?"],
    },
    "start_business": {
        "views": {107: 2.0, 79: 1.5, 86: 1.0, 110: 0.8, 58: 0.5, 195: 0.5, 188: 0.4, 123: 0.3, 215: 0.4},
        "simulation": None,
        "kate": ["How do I open a business account?", "Do I need a VAT number as a freelancer?",
                 "How do I send invoices?", "Which insurance do I need as a self-employed person?"],
    },
    "new_parent": {
        "views": {75: 1.2, 157: 1.0, 163: 0.8, 158: 0.5, 159: 0.4, 161: 0.4},
        "simulation": None,
        "kate": ["How do I open a savings account for my child?", "Is my baby covered by my hospitalisation insurance?",
                 "How do I add my child to my family insurance?"],
    },
    "buy_ev": {
        "views": {27: 2.0, 37: 1.5, 32: 1.0, 26: 0.6, 52: 0.6, 129: 0.3, 130: 0.2},
        "simulation": {"row": 27, "per_month": 0.8, "amount": (28_000, 65_000)},
        "kate": ["Is an electric car cheaper than a petrol car?", "How much is an electric car loan per month?",
                 "Can I charge my car with solar panels?"],
    },
    "prepare_retirement": {
        "views": {56: 1.5, 57: 1.0, 65: 0.8, 70: 0.6, 169: 0.5, 168: 0.4, 167: 0.3},
        "simulation": None,
        "kate": ["When can I retire?", "How much will my pension be?", "How do I pass on my savings to my children?"],
    },
}

# ------------------------------------------------------------------ catalogue rows used for products
ITEM = {
    "kbc_plus_account": 142, "kbc_basic_account": 141, "savings_account": 74, "business_pro_account": 79,
    "term_deposit": 78, "debit_card": 147, "credit_card": 148, "home_insurance": 8, "car_insurance": 31,
    "ev_insurance": 32, "family_insurance": 157, "hospitalisation_insurance": 163, "pension_savings_fund": 56,
    "investment_plan": 65, "life_insurance": 159, "outstanding_balance_insurance": 10, "save_for_someone_else": 75,
    "travel_insurance": 127, "apple_pay": 152, "kate": 218, "guaranteed_income_self_employed": 195,
    "supplementary_pension_self_employed": 58, "professional_liability": 188, "business_liability": 187,
    "home_loan": 2, "renovation_loan": 4, "energy_loan": 128, "petrol_car_loan": 25, "electric_car_loan": 27,
    "personal_loan": 151, "investment_loan": 99,
}

# ------------------------------------------------------------------ names & places (synthetic)
FIRST_NAMES = {
    ("nl", "f"): ["Emma", "Louise", "Olivia", "Elena", "Noor", "Sofie", "Lotte", "Fien", "Marie", "Lien", "An", "Els",
                  "Katrien", "Sarah", "Hanne", "Julie", "Lisa", "Nina", "Ines", "Femke", "Griet", "Hilde", "Tine", "Leen"],
    ("nl", "m"): ["Noah", "Lucas", "Liam", "Arthur", "Jules", "Louis", "Finn", "Lars", "Thomas", "Pieter", "Jan", "Bram",
                  "Wout", "Jens", "Koen", "Tom", "Stijn", "Dries", "Bart", "Geert", "Wim", "Dirk", "Maarten", "Ruben"],
    ("fr", "f"): ["Camille", "Chloé", "Léa", "Manon", "Juliette", "Alice", "Charlotte", "Inès", "Sophie", "Nathalie",
                  "Isabelle", "Valérie", "Pauline", "Margaux"],
    ("fr", "m"): ["Gabriel", "Hugo", "Nathan", "Théo", "Victor", "Maxime", "Antoine", "Nicolas", "Julien", "Olivier",
                  "Laurent", "Philippe", "Benoît", "Quentin"],
    ("en", "f"): ["Nadia", "Amira", "Sara", "Maya", "Yasmine", "Lina", "Hana", "Aylin"],
    ("en", "m"): ["Adam", "Omar", "Yusuf", "Mehdi", "Karim", "Elias", "Rayan", "Daniel"],
}
LAST_NAMES = {
    "nl": ["Peeters", "Janssens", "Maes", "Jacobs", "Mertens", "Willems", "Claes", "Goossens", "Wouters", "De Smet",
           "Vermeulen", "Van den Broeck", "Hermans", "Pauwels", "Aerts", "Michiels", "Desmet", "De Clercq", "Verhoeven",
           "Van Damme", "Smets", "Leemans", "Coppens", "Verstraete", "Declercq", "Van Dyck", "Martens", "Lenaerts"],
    "fr": ["Dubois", "Lambert", "Dupont", "Martin", "Leclercq", "Lejeune", "Renard", "Lemaire", "François", "Collin",
           "Delvaux", "Mathieu", "Simon", "Laurent", "Hubert", "Gilson"],
    "en": ["El Amrani", "Benali", "Yilmaz", "Kaya", "Haddad", "Rossi", "Kowalski", "Nowak", "Bakker", "Diallo"],
}
# (city, postal code, region, weight). KBC is mostly Flemish; CBC covers Wallonia.
CITIES = [
    ("Gent", "9000", "flanders", 10), ("Antwerpen", "2000", "flanders", 12), ("Leuven", "3000", "flanders", 7),
    ("Brugge", "8000", "flanders", 5), ("Hasselt", "3500", "flanders", 5), ("Mechelen", "2800", "flanders", 5),
    ("Kortrijk", "8500", "flanders", 4), ("Aalst", "9300", "flanders", 4), ("Sint-Niklaas", "9100", "flanders", 3),
    ("Genk", "3600", "flanders", 3), ("Roeselare", "8800", "flanders", 3), ("Turnhout", "2300", "flanders", 3),
    ("Lier", "2500", "flanders", 2), ("Dendermonde", "9200", "flanders", 2), ("Ieper", "8900", "flanders", 1),
    ("Brussel", "1000", "brussels", 4), ("Schaerbeek", "1030", "brussels", 2), ("Ixelles", "1050", "brussels", 2),
    ("Liège", "4000", "wallonia", 2), ("Namur", "5000", "wallonia", 2), ("Charleroi", "6000", "wallonia", 1),
    ("Wavre", "1300", "wallonia", 1), ("Mons", "7000", "wallonia", 1),
]
SECTORS = ["IT", "healthcare", "education", "retail", "manufacturing", "logistics", "public sector", "finance",
           "construction", "hospitality", "consulting", "marketing", "energy"]
COMPANY_WORDS = ["Nova", "Delta", "Atlas", "Lumen", "Vector", "Orbit", "Prisma", "Kern", "Noord", "Schelde", "Leie",
                 "Kempen", "Brabo", "Zenith", "Helix", "Mosa", "Ardenne", "Polder", "Duin", "Vlas"]
COMPANY_SUFFIX = ["BV", "NV", "Consulting", "Studio", "Solutions", "Group", "Partners", "Works"]

# Merchants per spending category: (name, amount range in euros).
MERCHANTS = {
    "groceries": [("Colruyt", (25, 140)), ("Delhaize", (15, 110)), ("Aldi", (20, 90)), ("Lidl", (15, 85)),
                  ("Carrefour", (20, 120)), ("Albert Heijn", (10, 70)), ("Okay", (8, 40))],
    "energy_utilities": [("Engie", (90, 260)), ("Luminus", (90, 240)), ("TotalEnergies Power & Gas", (85, 250)),
                         ("Eneco", (80, 230))],
    "telecom": [("Proximus", (45, 110)), ("Telenet", (50, 120)), ("Orange Belgium", (30, 80)), ("BASE", (15, 40))],
    "fuel": [("Q8", (45, 90)), ("TotalEnergies", (45, 95)), ("Shell", (50, 95)), ("Esso", (45, 85))],
    "ev_charging": [("Allego", (8, 35)), ("Shell Recharge", (10, 40)), ("Fastned", (15, 45))],
    "public_transport": [("NMBS/SNCB", (5, 70)), ("De Lijn", (2, 25)), ("STIB-MIVB", (2, 25))],
    "car_maintenance": [("Carglass", (90, 400)), ("Midas", (80, 450)), ("Garage Van Hool", (120, 700))],
    "restaurants": [("Brasserie Lombard", (25, 90)), ("Pizza Hut", (15, 45)), ("Panos", (6, 18)), ("Le Pain Quotidien", (12, 40)),
                    ("Ellis Gourmet Burger", (18, 55)), ("Takeaway.com", (15, 45)), ("Deliveroo", (15, 50))],
    "shopping": [("Bol.com", (15, 150)), ("Zalando", (30, 160)), ("H&M", (15, 90)), ("Primark", (10, 60)),
                 ("Action", (5, 50)), ("Hema", (5, 40)), ("Coolblue", (20, 300))],
    "baby_kids": [("Dreambaby", (20, 250)), ("Baby-Dump", (30, 400)), ("Kruidvat", (8, 45)), ("Fun", (15, 80))],
    "childcare_school": [("Kinderopvang Kribbebijter", (300, 650)), ("Stedelijke Basisschool", (20, 120)),
                         ("Scholengroep", (30, 180))],
    "health": [("Apotheek", (8, 60)), ("Huisartsenpraktijk", (25, 60)), ("Tandarts", (40, 200)), ("AZ Ziekenhuis", (40, 600))],
    "subscriptions": [("Netflix", (11, 18)), ("Spotify", (11, 18)), ("Disney+", (9, 14)), ("Streamz", (7, 13)),
                      ("Basic-Fit", (25, 35)), ("De Standaard", (20, 30))],
    "travel": [("Ryanair", (60, 400)), ("Brussels Airlines", (150, 800)), ("Booking.com", (120, 900)),
               ("TUI", (500, 2500)), ("Eurostar", (80, 350))],
    "home_improvement": [("Gamma", (20, 400)), ("Brico", (20, 350)), ("Hubo", (15, 250)), ("Hornbach", (30, 600))],
    "furniture": [("IKEA", (40, 900)), ("JYSK", (30, 400)), ("Casa", (15, 200)), ("Maisons du Monde", (50, 700))],
    "electronics": [("Coolblue", (80, 1800)), ("MediaMarkt", (60, 1500)), ("Vanden Borre", (60, 1500)),
                    ("Apple Store", (150, 2500))],
    "business_supplies": [("Bureau Vallée", (20, 250)), ("Viking", (30, 300)), ("Vistaprint", (25, 150))],
    "accounting_software": [("Billit", (15, 40)), ("Accountable", (15, 35)), ("Yuki", (25, 60))],
}
