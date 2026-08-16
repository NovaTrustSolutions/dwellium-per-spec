# Plan 011: Add CSP (report-only first) + security headers on Netlify

> **Executor instructions**: Follow step by step; run each verification. The CSP starts
> in **report-only** so nothing breaks. Obey STOP conditions. Update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- netlify.toml qualia-shell/scripts/write-netlify-redirects.mjs qualia-shell/src/config.ts`

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED (a too-tight CSP can break browser-direct LLM calls — mitigated by report-only)
- **Depends on**: none (complements plan 010)
- **Category**: security
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

The app holds LLM/Supabase/Postgres secrets and the auth token in browser storage and
renders LLM/web-derived HTML, yet ships **no security headers**: `netlify.toml` has only
`[[redirects]]`, and `scripts/write-netlify-redirects.mjs` emits only a `_redirects`
file. With no Content-Security-Policy, the XSS surface (plan 010) has no second line of
defense — an injected script faces no `connect-src` limit on exfiltrating keys to an
arbitrary origin. Missing `X-Frame-Options`/`frame-ancestors` allows clickjacking of the
authenticated app. Adding a CSP (in report-only mode first, so it can't break anything)
plus the standard hardening headers closes a real gap on a sensitive public surface.

## Current state

- `netlify.toml` — has `[build]`, `[build.environment]`, `[dev]`, and one `[[redirects]]` (`/* -> /index.html 200`). **No `[[headers]]`.**
- `qualia-shell/scripts/write-netlify-redirects.mjs` — postbuild script; writes `build/client/_redirects` (the `/api/*` proxy + SPA fallback). Emits no headers.
- Outbound origins the app calls (build the CSP `connect-src` from these — confirm by grep): provider endpoints are referenced in `qualia-shell/src/lib/agents/skills.ts` and `qualia-shell/src/config.ts` and the per-provider LLM client. Known set to expect: Anthropic (`api.anthropic.com`), OpenAI (`api.openai.com`), Google Gemini (`generativelanguage.googleapis.com`), Tavily/Brave search, open-meteo, Supabase (`*.supabase.co`), and the proxied same-origin `/api` + `/health` (to `NETLIFY_API_PROXY_TARGET`). Plus image data URIs.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Enumerate outbound hosts | `grep -rhoE "https://[a-zA-Z0-9.-]+" qualia-shell/src/lib qualia-shell/src/config.ts \| sort -u` | the real allowlist of origins |
| Build (Mac) | `cd qualia-shell && npm run build` | exit 0 |
| Verify headers locally | `npx netlify-cli@latest build` is not required; inspect `netlify.toml` is valid TOML | n/a |
| Verify after deploy (operator) | `curl -sI https://argyleholocron.netlify.app/ \| grep -iE "content-security-policy\|x-frame-options\|x-content-type"` | headers present |

## Scope

**In scope**: `netlify.toml` (`[[headers]]` block). Optionally `public/_headers` if the team prefers that mechanism — but `[[headers]]` in `netlify.toml` is simplest and is what this plan uses.

**Out of scope**:
- Application code. CSP is delivered via headers, not code.
- Switching the CSP from report-only to enforcing — that is a deliberate later step after reviewing violation reports (Maintenance).

## Git workflow

- Branch: `advisor/011-security-headers`
- Commit: `security(headers): add report-only CSP + X-Frame-Options/nosniff/Referrer/HSTS on Netlify`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Enumerate the legitimate `connect-src` origins

Run the grep above and assemble the unique list of `https://…` origins the app fetches (LLM providers, search, weather, Supabase). Include `'self'` and (since `/api/*` is same-origin-proxied) you do NOT need the Cloud Run origin in `connect-src` — the browser talks to same-origin `/api`. Record the list.

**Verify**: you have a concrete origin list (no guessing — derived from the grep).

### Step 2: Add a `[[headers]]` block to `netlify.toml`

Append:
```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    Content-Security-Policy-Report-Only = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self'; connect-src 'self' <ORIGINS FROM STEP 1>; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
```
Replace `<ORIGINS FROM STEP 1>` with the enumerated list. Use **`Content-Security-Policy-Report-Only`** (not enforcing) so the policy reports violations without blocking anything. Note: `style-src 'unsafe-inline'` is included because the app uses inline styles widely; tightening that is a later step.

**Verify**: `netlify.toml` parses (no syntax error) and contains `Content-Security-Policy-Report-Only` + the four hardening headers.

### Step 3: Build

**Verify (Mac)**: `cd qualia-shell && npm run build` exit 0 (headers don't affect the build, but confirm nothing regressed).

### Step 4: Post-deploy verification (operator-run, after Ilya deploys)

After deploy, `curl -sI https://argyleholocron.netlify.app/ | grep -iE "content-security-policy-report-only|x-frame-options|x-content-type|strict-transport"` → all present. Then, in the browser console on the live site, exercise an LLM call and note any CSP violation reports — these reveal origins missing from `connect-src` to add before enforcing.

## Test plan

No unit tests (deploy config). Verification is: valid TOML + headers present on the deployed response (operator `curl`), and report-only means zero functional breakage.

## Done criteria

- [ ] `netlify.toml` has a `[[headers]]` block with `Content-Security-Policy-Report-Only`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`
- [ ] `connect-src` lists the real provider origins enumerated in Step 1 (not a guess)
- [ ] `cd qualia-shell && npm run build` exit 0
- [ ] Only `netlify.toml` changed
- [ ] `plans/README.md` row updated (note: enforcement is a follow-up after report review)

## STOP conditions

- The `grep` reveals outbound origins you can't classify (an unexpected third-party host) — STOP and ask the operator before allowlisting it.
- The team uses a `public/_headers` file already (check) — then add headers there instead of `netlify.toml` to avoid split sources; report which you chose.

## Maintenance notes

- **Follow-up (deliberate, not this plan):** after a week of report-only with no false violations on real usage, flip `Content-Security-Policy-Report-Only` → `Content-Security-Policy` to enforce. Then tighten `style-src` (drop `'unsafe-inline'`) once inline styles are reduced.
- Reviewer: confirm report-only (not enforcing) on first landing; confirm `connect-src` includes every LLM/search origin the app actually calls, or live LLM calls will report violations (and break once enforced).
