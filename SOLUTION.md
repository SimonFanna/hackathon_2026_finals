# SOLUTION — Intent → Journey

> Document vivant : mis à jour au fil de la journée. Chaque feature a son propre fichier dans `docs/features/<feature>.md`.
> Dernière mise à jour : 09:20

## En une phrase

**KBC détecte qu'un client entre dans un moment de vie, et transforme cette intention en un parcours concret, étape par étape, en combinant KBC et ses partenaires — le client garde la main à chaque étape.**

## Le problème

KBC possède déjà ~229 produits et services répartis en 21 écosystèmes (Housing, Energy, Mobility, Business…), dont ~27 partenaires (Immoscoop, Setle, Cambio, NMBS, Billit…). Mais pour le client, c'est un catalogue éclaté : il doit savoir quoi chercher, dans quel ordre, et chez qui. Résultat : l'intention (« j'achète une maison ») ne se transforme pas en action.

## Notre solution

Un **orchestrateur** qui suit toujours la même boucle :

1. **Signal** — un événement observé (recherche sur Immoscoop, simulation de prêt, versement important…)
2. **Intention** — on en déduit un moment de vie, avec un score de confiance. Sous un seuil, on *demande* au client au lieu de supposer.
3. **Parcours** — on compose un parcours multi-étapes à partir du catalogue KBC + partenaires.
4. **Contrôle client** — à chaque étape : accepter / passer, et choisir quelles données sont partagées avec quel partenaire.
5. **Résultat mesurable** — un tableau de bord « triple win » : gain pour le client, pour KBC, pour les partenaires.

**Clé de scalabilité :** une nouvelle intention = de nouvelles *données* (intention + étapes), pas de nouveau code.

## Parcours démontrés

### Héros — « J'achète une maison de 1975 »
Immoscoop (recherche) → estimation & budget → crédit hypothécaire → obligation de rénovation (EPC) → primes via Setle → devis isolation / chauffage → solaire + batterie → prêt énergie → assurance habitation.
*Mesurable :* € économisés, kWh, CO₂, primes obtenues.

### Preuve de généralisation — « Je lance mon entreprise »
Start it → Business PRO → facturation Billit → statut indépendant, pension & assurances.

## Triple win

| Client | KBC | Partenaires |
|---|---|---|
| Un chemin clair, moins d'effort, € et CO₂ économisés | Plus de produits par client, engagement, données consenties | Leads qualifiés, au bon moment, avec consentement |

## Principes (alignés sur le guide KBC)

- **Bold** — on ne recommande pas un produit, on orchestre un moment de vie.
- **Scalable** — moteur générique, intentions pilotées par les données.
- **Transparent & privacy-first** — consentement par partenaire et par étape, « pourquoi je vois ça » visible.
- **Commercialement viable** — chaque étape est un produit KBC ou un partenaire rémunérable.

## Architecture (MVP)

- **Front :** Next.js + TypeScript + Tailwind, déployé sur Vercel
- **Données :** Supabase — `ecosystem_items` (catalogue nettoyé), `intents`, `intent_steps`, `customers`, `signals` ; RLS activée, lecture seule
- **Moteur :** TypeScript pur, testé (Vitest) ; pas de LLM dans la prise de décision
- **Données clients :** synthétiques (le xlsx est un catalogue, pas des données clients)

## Hors scope (sauf temps restant)

Authentification, LLM décisionnel, voix Kate, intégrations partenaires réelles.

## Features (une par fichier `docs/features/`)

| Feature | Responsable | Statut |
|---|---|---|
| Import & nettoyage du catalogue | — | à faire |
| Moteur signal → intention → parcours | — | à faire |
| UI parcours + consentement par partenaire | — | à faire |
| Tableau de bord triple win | — | à faire |
| Deck + démo (GIF/vidéo) | — | à faire |
| Sécurité (Aikido) + repo public | — | à faire |

## Questions ouvertes

- Quels KPI d'écosystème KBC utilise-t-il ? (à demander au staff)
- Peut-on citer les partenaires nommément dans la démo / le pitch ?

## Journal

- **09:20** — Direction A validée. Création de ce document.
