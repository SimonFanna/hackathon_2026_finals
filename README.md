<div align="center">

<img src="public/brand/logo.webp" alt="<PRODUCT NAME>" width="420">

**Today, <the status quo, in one sentence nobody can argue with>.**<br>
<PRODUCT NAME> <does the one thing that changes it> — with a number and a reason.<br>
And when there is nothing useful to say, it says so.

[**→ Try the live demo**](https://<project>.vercel.app/)

[![Live demo](https://img.shields.io/badge/demo-live-0097DB?style=flat-square)](https://<project>.vercel.app/)
![Next.js](https://img.shields.io/badge/Next.js-16-0D2A50?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-0D2A50?style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-0D2A50?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-RLS%20on-3ECF8E?style=flat-square)
![Data](https://img.shields.io/badge/data-100%25%20synthetic-5BA215?style=flat-square)

<sub>Built for the <PARTNER> challenge at the Tectonic Hackathon 2026 — <b>Finals</b>.</sub>

</div>

---

> **Status: pre-match.** The challenge drops on finals day. Everything in `<angle brackets>` gets filled in the first hour. The structure, the stack and the tone are already locked — we qualified with them, we are not changing a winning team.

---

## The problem

Here is <the thing> as it is today.

<div align="center">
<img src="docs/assets/today.png" width="330" alt="<What the current experience looks like>">
</div>

It is <one word that names what is wrong — an inventory, a form, a wall of text>. It tells the user *<what it does>*, and stops there.

What it never does:

- **Nothing adapts.** <Same output for everyone, whatever their situation.>
- **Nothing is proposed.** <No suggestion tied to the user's actual data.>
- **There is no plan.** <No target, no amount, no horizon, no next step.>
- **Nothing is explained.** <A number without context. The user has to already know what to ask.>

The information needed to do better already exists: <the signals the partner already has>. Almost none of it reaches the user.

<One paragraph on why the partner's current approach doesn't scale — with one real figure from the brief.>

---

## The solution

**<PRODUCT NAME>** is <a one-line definition: what it reads, what it decides, what it shows>.

**→ [<project>.vercel.app](https://<project>.vercel.app/)** — <the 10-second demo path: pick X, press Y, watch Z>. Everything runs from this repository; there is nothing to install to try it.

It works in five steps:

| Step | What happens |
|---|---|
| **1. Read** | <Inputs. Only with consent.> |
| **2. Measure** | <A concrete gap, in a unit someone can check.> |
| **3. Decide** | Deterministic rules, not a language model. A confidence score decides whether to speak at all. |
| **4. Compose** | <The output: a goal, the reason behind it, one next step.> |
| **5. Explain** | Every signal used is shown, and can be switched off. |

---

## What changes when you activate it

The same user, the same data, one screen rebuilt around the single thing worth their attention.

- **A number instead of a slogan.** <Not "think about X" but *€N, by date D, you are at P% today*.>
- **A reason you can audit.** <Every output lists its signals. Switch one off and it changes in front of you.>
- **A plan, not a list.** <Target, horizon, amount, one next step.>
- **Consent is a switch, not a checkbox.** <Turn it off and nothing is read.>
- **The right to say nothing.** <When there is nothing useful, the app says what it checked — and stays quiet.>
- **It scales.** <One small stateless calculation per user. A new case is new data and a new rule, not a new build.>

### The personas

| Persona | Situation | What <PRODUCT NAME> shows |
|---|---|---|
| **<Name>, <age>** | <Situation> | <Output, with a number> |
| **<Name>, <age>** | <Situation — declared by the user> | <Output> |
| **<Name>, <age>** | <Situation> | <Output, with a number> |
| **<Name>, <age>** | <Already well served> | Nothing to suggest, and what was checked |

---

## How the decision is made

No language model decides anything. The engine is a pure TypeScript module with no dependencies, covered by unit tests.

```
confidence = sum of the weights of the active signals

no consent            →  nothing is read
no gap                →  "nothing to suggest"
confidence < THRESHOLD →  the output is hidden
otherwise             →  the output is composed
```

The constants are frozen in [`src/lib/engine/types.ts`](src/lib/engine/types.ts):

| Constant | Value | Meaning |
|---|---|---|
| `THRESHOLD` | `<0.60>` | Below this confidence, say nothing |
| `<CONSTANT>` | `<value>` | <Illustrative assumption — **not** a partner figure> |
| `<CONSTANT>` | `<value>` | <Guard-rail> |

---

## Run it locally

```bash
git clone https://github.com/SimonFanna/hackathon_2026_finals.git
cd hackathon_2026_finals
npm install
npm run dev          # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm test` | Engine unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

No environment variables are needed to run the demo: without Supabase, the site reads an offline snapshot and shows an "Offline snapshot" badge.

**With a local Supabase** (Docker required):

```bash
npx supabase start                  # applies supabase/migrations and loads supabase/seed.sql
# then, in .env.local (ignored by Git):
#   SUPABASE_URL=http://127.0.0.1:54321
#   SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY printed by supabase start>
npm run dev                         # the badge now says "Live: Supabase"
```

---

## Project structure

```
src/
  app/                  /, /demo/[persona]
  components/
    home/               persona picker
    demo/               activation panel, explanation panel
    phone/              BEFORE and AFTER screens
    brand/              logo, header, footer
  lib/
    engine/             types, decision rules, tests  <- the frozen contract
    data/               Supabase access, offline snapshot
datasets/               synthetic data generator (Python)
supabase/               migrations (RLS on) and seed.sql
docs/
  brand.md              partner design tokens
  assets/               images used by this README
public/
  brand/  personas/     logo and portrait assets
```

## Data and security

- **100% synthetic data.** No real person, no real account, no real identifier anywhere in this repository.
- Data lives in **Supabase**, read on the server with the publishable key. If Supabase is unreachable, the app **falls back to an offline snapshot** and never shows an error page.
- Tables are **read-only**: RLS is on, Data API roles can only `select`. No secret key in the app. Keys live in Vercel environment variables, **never in Git**. This repository is public.
- Inputs are validated with Zod. Routes use a fixed allow-list, so unknown slugs 404.
- Security headers (CSP, `frame-ancestors`, `Referrer-Policy`, `nosniff`, `Permissions-Policy`) set in `next.config.ts`.

---

## Finals game plan

The playbook that got us here, compressed for one day.

| Hour | Objective | Done when |
|---|---|---|
| **H+0 → H+1** | Read the brief, pick the angle, fill every `<placeholder>` in this README | The problem and the solution fit in two sentences |
| **H+1 → H+2** | Scaffold, deploy an empty shell to Vercel, freeze `engine/types.ts` | A live URL exists |
| **H+2 → H+5** | Engine + tests, synthetic data, Supabase seed | `npm test` green, personas load from the DB |
| **H+5 → H+8** | BEFORE / AFTER screens, activation, explanation panel | The demo path works end to end on the live URL |
| **H+8 → end** | Polish, README screenshots, pitch rehearsal | Pitch timed, demo rehearsed twice, nothing left in `<brackets>` |

**House rules**

1. **Deploy first, build second.** A live URL at H+2, always.
2. **The engine is a contract.** Types are frozen early; UI and data work against them in parallel.
3. **One number per screen.** If it isn't quantified, it isn't shown.
4. **Saying nothing is a feature.** Every demo includes the persona who gets no suggestion.
5. **No real data, no secrets in Git.** Ever.
6. **Login is the last step**, only if time allows.

## Status

| Part | State |
|---|---|
| README skeleton | Done |
| Brief read, angle chosen | Waiting for the challenge |
| Live URL | Planned — H+2 |
| Decision engine and unit tests | Planned |
| Synthetic data + Supabase | Planned |
| BEFORE / AFTER demo | Planned |
| Pitch | Planned |

## Notes

- Hackathon concept. Partner branding is used with the partner for this challenge only.
- Commercial fonts are never committed; a free fallback is used.
- All amounts and rates are illustrative assumptions, not partner figures.
