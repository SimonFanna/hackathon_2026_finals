# Backend — Intent → Action → Outcome

## 1. Vue globale

```text
                 CUSTOMER
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
PERSISTENT CONTEXT         OBSERVABLE SIGNALS
profil durable             transactions / KBC events
        │                       │
        └───────────┬───────────┘
                    ▼
              CONTEXT ENGINE
                    ▼
               INTENT ENGINE
                    ▼
            GOAL CONFIRMATION
                    ▼
        CAPABILITY ORCHESTRATOR
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
       KBC       PARTNER A   PARTNER B
        └───────────┬───────────┘
                    ▼
               ACTION PLAN
                    ▼
        CUSTOMER CONTROL / CONSENT
                    ▼
                 EXECUTION
                    ▼
             OUTCOME TRACKER
```

**Idée centrale :** on ne recommande pas simplement un produit.  
On détecte un besoin émergent, on confirme l'objectif avec le client, puis on compose les capacités KBC + partenaires nécessaires pour atteindre un résultat concret.

---

## 2. Persistent Context

Décrit la situation relativement stable du client.

Exemples :

```ts
{
  lifeStage: "young_professional",
  employment: "employed",
  housing: "tenant",
  family: "single",
  mortgage: false,
  savingsLevel: "medium",
  incomeStability: "high"
}
```

Ne pas créer de catégories géantes du type :

```text
young_parent_homeowner_with_mortgage
```

On préfère des attributs combinables.

---

## 3. Observable Signals

On utilise uniquement des signaux plausiblement observables par KBC ou explicitement partagés.

### Exemples autorisés

```text
Transaction
Simulation de crédit KBC
Page produit KBC consultée
Recherche dans l'app/site KBC
Produit KBC déjà détenu
Donnée déclarée par le client
Événement partenaire avec consentement explicite
```

### À éviter

```text
Recherche Google
Navigation externe non partagée
Recherche sur Immoscoop supposée visible par KBC
Historique navigateur externe
```

Un **event** est un fait.  
Un **signal** est son interprétation.

```text
Event:
page KBC "Emprunter pour une voiture électrique"

Signal:
ELECTRIC_CAR_FINANCING_INTEREST
strength = 0.30
```

---

## 4. Context Engine

Répond à :

> **What is happening right now?**

Il combine les signaux et produit des **Active Moments** avec un score de confiance.

```ts
{
  type: "HOME_BUYING",
  confidence: 0.88,
  evidence: [
    "housing_budget_simulation",
    "mortgage_page_view"
  ]
}
```

Exemples :

```text
FIRST_SALARY
NEW_PARENT
RETIREMENT_TRANSITION
HOME_BUYING
CAR_PROJECT
TRAVEL
CASHFLOW_PRESSURE
```

Les moments ont une durée de vie / expiration.

---

## 5. Intent Engine

Répond à :

> **What does the customer probably want or need?**

Un moment peut produire plusieurs intentions.

```text
HOME_BUYING 88%
    ↓
BUY_HOME                92%
RENOVATE_HOME           61%
REDUCE_ENERGY_COST      44%
```

Le moteur garde plusieurs intentions simultanées.

---

## 6. Goal Confirmation

L'intention détectée ne doit pas devenir automatiquement une action.

Logique :

```text
Low confidence
→ do nothing

Medium confidence
→ ask / confirm

High confidence
→ proactively surface the possible goal

Before execution or partner data sharing
→ explicit customer confirmation
```

Exemple :

> “It looks like you're preparing to buy a home. Want KBC to build your complete home-buying plan?”

Après confirmation :

```ts
{
  goal: "BUY_AND_PREPARE_HOME",
  budget: 350000,
  priorities: ["affordability", "energy_efficiency"]
}
```

---

## 7. Ecosystem Capability Registry

Le XLSX KBC doit être transformé en **capabilities**, pas seulement chargé comme une liste de produits.

Exemple :

```ts
{
  id: "setle-renovation",
  provider: "Setle",
  ecosystem: "Housing",
  capabilities: [
    "estimate_renovation_cost",
    "identify_grants"
  ]
}
```

Autre exemple :

```ts
{
  id: "impact-insulation",
  provider: "Impact us today",
  ecosystem: "Energy",
  capabilities: [
    "request_insulation_quote"
  ]
}
```

Chaque capability devrait idéalement avoir :

```text
id
provider
ecosystem
whatItSolves
preconditions
requiredData
output / outcome
```

---

## 8. Capability Orchestrator

Répond à :

> **What capabilities are required to achieve this goal?**

Exemple :

```text
GOAL
Buy + renovate a home

↓ REQUIRED CAPABILITIES

estimate_budget
find_property
finance_property
inspect_property
estimate_renovation
identify_grants
get_quotes
finance_renovation
insure_property
```

Puis :

```text
required capability
        ↓
Capability Registry
        ↓
best KBC / partner capability
        ↓
ordered Action Plan
```

Le parcours doit être **data-driven** autant que possible.

---

## 9. Hero Journey — maison + rénovation

```text
Emerging home-buying intent
        ↓
Customer confirms goal
        ↓
Housing budget
        ↓
Property / valuation
        ↓
Home loan
        ↓
Certificates / EPC
        ↓
Renovation cost + grants
        ↓
Insulation / heating quotes
        ↓
Solar / battery evaluation
        ↓
Renovation / energy financing
        ↓
Home insurance
        ↓
OUTCOME
Home bought + renovation plan ready
```

Important :

- ne pas affirmer automatiquement une obligation légale de rénovation ;
- parler plutôt de **renovation needs identified via EPC / inspection**.

---

## 10. Decision & Suppression Rules

Le moteur doit pouvoir décider :

```text
SHOW_STEP
SHOW_GUIDANCE
SHOW_PARTNER
WAIT
NO_ACTION
```

Exemples :

```text
already has equivalent product
→ suppress duplicate offer

high cashflow pressure
→ suppress non-urgent commercial step

recent "not relevant" feedback
→ lower priority / suppress

low confidence
→ do nothing
```

Principe :

> **The best recommendation is sometimes no recommendation.**

---

## 11. Customer Control & Consent

À chaque étape externe :

```text
Accept
Skip
Why am I seeing this?
What data will be shared?
With whom?
```

Le client doit rester maître du parcours.

Exemple :

```ts
{
  partner: "Setle",
  sharedData: ["property_type", "postal_code", "renovation_budget"],
  consent: true
}
```

---

## 12. Outcome Tracker

Le parcours ne s'arrête pas à une recommandation.

Il doit suivre l'objectif jusqu'au résultat.

```text
GOAL
Buy + prepare home

PROGRESS
███████████░░░ 72%

✓ Budget
✓ Financing
✓ Inspection
→ Renovation estimate
○ Grants
○ Quotes
○ Energy financing
○ Insurance
```

Exemples de KPI :

```text
journey completion
providers coordinated
manual hand-offs avoided
estimated renovation budget
identified grants
estimated savings
time to outcome
```

---

## 13. Triple Win

### Customer
- moins de recherche ;
- moins de coordination ;
- parcours plus clair ;
- résultat concret.

### KBC
- meilleure conversion intention → outcome ;
- engagement et rétention ;
- opportunités commerciales pertinentes.

### Partners
- demande qualifiée ;
- meilleur timing ;
- moins de friction ;
- meilleure conversion.

---

## 14. Data Model minimal

```text
customers
persistent_context
events
signals
active_moments
intents
goals
capabilities
journey_templates
customer_journeys
journey_steps
consents
outcomes
```

---

## 15. Pipeline backend

```ts
event
  ↓
signalEngine.extract()
  ↓
contextEngine.recompute()
  ↓
intentEngine.recompute()
  ↓
goalEngine.confirmOrSuggest()
  ↓
orchestrator.buildPlan(goal, capabilities)
  ↓
decisionEngine.applyRules()
  ↓
consentEngine.filter()
  ↓
outcomeTracker.update()
```

---

## 16. Règles de design

1. **Events are facts.**
2. **Signals are interpretations.**
3. **Context explains what is happening.**
4. **Intent estimates what the customer wants.**
5. **Goal is customer-confirmed.**
6. **Capabilities describe what KBC/partners can do.**
7. **The orchestrator composes the journey.**
8. **The customer controls execution and data sharing.**
9. **The journey ends in a measurable outcome.**
10. **NO_ACTION must always be possible.**

---

## 17. Backend MVP

Priorité :

```text
1. Import + normalize KBC ecosystem catalogue
2. Capability Registry
3. Signals / Context / Intent
4. Goal confirmation
5. Generic orchestrator
6. Hero home journey
7. Consent model
8. Outcome tracker
9. One second journey proving generalisation
```

Deuxième journey conseillé :

```text
START A BUSINESS
↓
Start it @KBC
↓
Business PRO
↓
Billit
↓
Payments
↓
Working capital
↓
Pension / insurance
```

---

## 18. Phrase à garder en tête

> **The backend should not answer “Which product should we sell?”**

Il doit répondre :

> **“What is the customer trying to achieve, which capabilities are required, who can provide them, in what order, and how do we know the outcome was reached?”**
