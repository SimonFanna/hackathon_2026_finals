# Feature — Security (Aikido 10%)
> Owner: Kepa's UI terminal (hardening) · user (Aikido account) · Status: in progress · Last update: 11:05

## Goal
Score the full 10% for security. The finals guide requires:
- an **Aikido** scan of this public repo;
- fixes for what it finds;
- **screenshots of the final scan**, showing the repo name and the remaining vulnerabilities, submitted on Builderbase **before 16:00**.

The scan takes time, so connect early.

## How it works

### Aikido: steps for the user (needs a human and a GitHub login)
1. Go to **app.aikido.dev** and sign up **with GitHub**. An agent must not create accounts.
2. Install the Aikido GitHub app on the repo **`SimonFanna/hackathon_2026_finals`**. The repo belongs to **Simon's** GitHub account, so either Simon installs it, or he grants access to the account that runs Aikido. Select only this repository.
3. Wait for the first scan, then open the findings (dependencies, SAST, secrets, IaC).
4. Send the findings to the team. Agents fix them, commit and push, and Aikido re-scans on push.
5. **Before 15:30**, take screenshots of the final scan, showing the **repo name** and the **remaining** issues. Put them in the Builderbase submission (and optionally in `docs/screenshots/aikido-*.png`).

### Already hardened in the repo
- **HTTP security headers** (`web/next.config.ts`):
  - a static CSP following the Next.js "Without Nonces" guide (`default-src 'self'`, no third-party scripts, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`);
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`;
  - a `Permissions-Policy` that turns off camera, mic, geolocation, payment and USB;
  - COOP `same-origin`, HSTS (production only), and no `X-Powered-By`.
  - Verified on a production build: full flow, no CSP violations in the console.
- **No secrets in git:** a scan of tracked files found no `sb_secret_…` and no JWTs. `.env*` is git-ignored; only `web/.env.example` with placeholders is committed.
- **Supabase:** the catalogue tables have RLS on, read-only for `anon` / `authenticated`, and insert/update/delete/truncate revoked. Writes go through migrations only.
- **Data:** 100% synthetic customers; catalogue labels come from the KBC-provided XLSX. No real personal data.
- **Production dependencies:** `npm audit --omit=dev` reports **0 vulnerabilities**.
- **Stale public content removed:** `pitch/idea-a.html` (old persona, invented figures).

## Decisions (and why)
- **CSP without nonces.** Nonces force dynamic rendering for every page. The demo is fully static, so `'unsafe-inline'` for scripts is the documented trade-off. No external script, font or image host is allowed. `connect-src` only allows our Supabase project, for the catalogue.
- **Dev-dependency advisory accepted, not "fixed".** `npm audit` reports 5 "high" issues from one chain: `braces` (GHSA-vfj7-8cjw-p6xm, a ReDoS / stack-exhaustion advisory where every version is affected) via `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`.
  - The only fix npm offers is downgrading `eslint-config-next` to 14.x. That breaks Next 16 linting.
  - The package runs only in local linting. It is never bundled or shipped.
  - Re-check when a patched `braces` is released. Mark it "accepted / dev-only" in Aikido if it is listed.

## Known limits / improvement ideas
- Run the **`security-review`** skill on the final diff before submitting.
- If a Supabase client is added to the web app, use only the **publishable** key in the browser, keep `SUPABASE_SECRET_KEY` server-side, and add RLS to every new table.
- `.claude/settings.local.json` is tracked in git. It holds no secret today (only `enabledMcpjsonServers`), but local settings usually shouldn't be committed. The team can decide.
- Possible extra: Subresource Integrity (an experimental Next.js option) instead of `'unsafe-inline'`.

## Status checklist
- [x] Security headers + CSP (verified on a production build)
- [x] No secrets in git, `.env*` ignored
- [x] Supabase RLS read-only on the catalogue
- [x] Production dependencies: 0 vulnerabilities; dev advisory documented
- [x] Stale public pitch file removed
- [ ] Aikido connected (user / Simon)
- [ ] Aikido findings fixed
- [ ] Final Aikido screenshots (repo name + remaining issues) in Builderbase by 16:00
- [ ] `security-review` skill run before the freeze
