# CLAUDE.md — Techtonic Hackathon 2026 (Finals)

Rules for every agent (Claude or other) working on this repo. Read before doing anything.

## Context

- **Finals: 2026-10-20.** Hacking 09:00 → **16:00 hard freeze** (submissions close, nothing can change after). Pitch from 16:15: 3 min + 5 min Q&A, on a device that is not ours.
- **KBC challenge:** take customers from intent to action — signals → context → KBC + partners → customer in control → measurable outcome, triple win (customer / KBC / partners).
- **Judging:** Creativity 25% · Pitch 25% · Tech 20% · Fit 20% · Security/Aikido 10%.
- **Our solution:** see `SOLUTION.md` — single source of truth for the idea.
- **Team:** 4 people + their agents working in parallel on the same repo.
- **Language:** all docs, code, comments and UI copy in **English** (public repo judged by KBC).

## Golden rules

1. **Pull often.** `git pull` before starting a task, before every commit, and before any status report. Others push constantly.
2. **Nothing is final.** Every file, feature, model or screen can be improved. Before building on something, **re-analyse the whole project** (code, site, data, models, docs, pitch) and log improvement ideas in the relevant `.md`.
3. **One feature = one `.md`** in `docs/features/<feature>.md`. Create it before coding, update it after each change. Any agent must be able to understand the whole project from `SOLUTION.md` + `docs/features/` alone.
4. **`SOLUTION.md` is living.** Update its feature table and timestamped log on every significant change.
5. **Evidence before claims.** Never say "it works" without running it (build, tests, lint, visual check).

## Feature docs (`docs/features/<feature>.md`)

Minimum template:

```md
# Feature — <name>
> Owner: <person/agent> · Status: todo | in progress | done · Last update: HH:MM

## Goal
## How it works (files, data, contracts/APIs)
## Decisions (and why)
## Known limits / improvement ideas
## Status checklist
```

## Git workflow

- **Branches:** `main` + one personal branch per teammate (e.g. `kepa`). Work on your branch, merge into `main` often (at least every hour, and whenever something works).
- **Commit and push freely** — no human approval needed — **if** `npm run lint`, `npm test` and `npm run build` pass in `web/`.
- Small, focused commits touching only your own files. Check `git status` before `git add`; never `git add -A` blindly.
- Pull/rebase before pushing; resolve conflicts without overwriting teammates' work. Never force-push `main`.
- Never commit secrets (`.env*`, keys, tokens). The repo is **public** and scanned by Aikido.

## Code & quality

- Stack: Next.js + TypeScript + Tailwind in `web/`; pure engine in `web/src/engine/` (Vitest); Supabase project `endbafjcxanzmlwiezwe` (RLS always on).
- Demo must work offline: keep static engine data as a fallback for any network source.
- Demo figures (€, kWh, CO₂) are estimates — say so in the UI.
- No code copied from the qualifier repo (eligibility rule). Reusing ideas is fine.

## Skills to use

- Design / new feature: `superpowers:brainstorming` → `superpowers:writing-plans`.
- Implementation: `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`.
- UI: `impeccable`, `design-taste-frontend`, `emil-design-eng`, `frontend-design:frontend-design`. Follow the KBC brand (`docs/features/ux-redesign.md`).
- Supabase: `supabase` + `supabase-postgres-best-practices` before any schema change.
- Security: `security-review` before final submission.

## Submission checklist (Builderbase, by 15:45)

- [ ] Public GitHub repo
- [ ] Description
- [ ] Deck PPT/PDF with demo embedded (GIF/video) + live URL as backup
- [ ] Aikido scan screenshots (repo name + remaining vulnerabilities)
