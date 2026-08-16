# Plan 031: Deploy-env baseline manifest + read-only drift verifier

> **Executor instructions**: Follow step by step; run every verification command.
> On any STOP condition, stop and report. Update this plan's row in
> `plans/README.md` when done (unless a reviewer maintains the index).
>
> **Repo**: FRONTEND repo `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`
> (planned at `df3bf79`). This plan creates docs + one read-only script; it
> touches NO product source code.
>
> **Drift check (run first)**:
> `git diff --stat df3bf79..HEAD -- Scripts/ Docs/ops/ netlify.toml`
> Mismatch with "Current state" → STOP.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW (new files only; script is read-only)
- **Depends on**: none
- **Category**: dx
- **Planned at**: frontend `df3bf79`, 2026-07-03

## Why this matters

Google sign-in on production died twice from the same failure class: deploy
surfaces silently losing required configuration. Documented recurrences:
(1) commit `0c3814c` — "backend env GOOGLE_CLIENT_ID/ALLOWED_EMAILS **restored
after deploy wipe**"; (2) 2026-07-03 live incident — Netlify was missing
`VITE_GOOGLE_CLIENT_ID` (sign-in dead on argyleholocron.netlify.app) AND Cloud
Run was again missing `GOOGLE_CLIENT_ID`/`GOOGLE_AUTH_ALLOWED_EMAILS` (backend
returned 503 "Google login is not configured"), AND the OAuth client lacked the
Netlify JS origin. There is no single document listing what each surface must
have, and no way to detect drift before users hit it. This plan creates both.

## Current state

- `netlify.toml` (repo root) — build env sets only `NODE_VERSION`,
  `VITE_APPFOLIO_SEEDS`, `VITE_ONE_SAVE`; comments state
  `NETLIFY_API_PROXY_TARGET` must be set in site env (context-scoped).
- Netlify site: `argyleholocron`, site id `ee11c6c2-ac8d-494c-b390-e1d2162d7480`,
  URL `https://argyleholocron.netlify.app`. Site env vars (as of 2026-07-03):
  `NODE_VERSION`, `VITE_APPFOLIO_SEEDS`, `VITE_ONE_SAVE`,
  `NETLIFY_API_PROXY_TARGET` (context-scoped: production/deploy-preview/branch =
  `https://dwellium-backend-472241012306.us-central1.run.app`),
  `VITE_GOOGLE_CLIENT_ID` (context: all; restored 2026-07-03).
- Cloud Run: service `dwellium-backend`, project `my-project-57391aion-ethos-api`,
  region `us-central1`. Required auth env: `GOOGLE_CLIENT_ID`,
  `GOOGLE_AUTH_ALLOWED_EMAILS` (restored 2026-07-03), plus the ~22 pre-existing
  vars (NODE_ENV, AUTH_ENABLED, CORS_ORIGINS, storage dirs, etc. — enumerate
  from the live service in Step 1).
- Google OAuth client: `200583798886-9959g1037ds7e475hrb6hb4rnrfo8u8g.apps.googleusercontent.com`
  in project `skilful-gantry-465123-a7`; Authorized JS origins must include
  `https://argyleholocron.netlify.app` (added 2026-07-03) + the localhost dev
  set; consent screen is **Testing** mode with test users
  (iklipinitser@gmail.com, andy@dwellium.com).
- Live-endpoint signatures that prove config health (verified 2026-07-03):
  - `GET https://argyleholocron.netlify.app/health` → HTTP 200 (proxy alive)
  - `POST https://argyleholocron.netlify.app/api/auth/google` with JSON body
    `{"credential":"x"}` → **401** `{"error":"Google sign-in could not be verified"}`
    when healthy; **503** `{"error":"Google login is not configured on the backend"}`
    when the Cloud Run env is wiped. The 503-vs-401 distinction IS the drift detector.
- Script conventions: `Scripts/` at repo root holds plain-Node `.mjs` utilities
  (see `Scripts/verify_no_pii_leak.mjs` as the exemplar — no deps, exit code
  signals pass/fail, console table output).
- Secret handling rule: the baseline doc records env var **names and where they
  live**, NEVER values. The client ID is public by nature (ships in the JS
  bundle) and may appear; API keys/secrets may not.

## Commands you will need

| Purpose | Command (frontend repo root) | Expected |
|---|---|---|
| Run verifier | `node Scripts/verify_deploy_env.mjs` | exit 0, all checks PASS |
| Lint (repo gate) | `cd qualia-shell && npm run lint` | exit 0 (script is outside qualia-shell; lint must stay green regardless) |

## Scope

**In scope (create only — nothing existing is modified):**
- `Docs/ops/DEPLOY_ENV_BASELINE.md` (new)
- `Scripts/verify_deploy_env.mjs` (new)

**Out of scope (do NOT touch):**
- `netlify.toml`, any workflow YAML, any `qualia-shell/src/**` or backend source.
- Anything that WRITES to Netlify/Cloud Run/Google — the script is strictly read-only.
- Committing any secret value into either new file.

## Git workflow

- Branch: `advisor/031-deploy-env-baseline` off `main`
- Commits: `docs(ops): deploy env baseline` / `feat(scripts): read-only deploy-env drift verifier`
- Do NOT push without Ilya's explicit go.

## Steps

### Step 1: Write `Docs/ops/DEPLOY_ENV_BASELINE.md`

Four sections, one per surface, using the facts inlined above (names + purpose +
where to set them, never secret values):

1. **Netlify site `argyleholocron`** — table of required env vars (the 5 listed
   in Current state), which contexts, and the note that a rebuild is required
   after changing any `VITE_*` (build-time baked).
2. **Cloud Run `dwellium-backend`** — required auth vars + instruction to dump
   the full current set with
   `gcloud run services describe dwellium-backend --project my-project-57391aion-ethos-api --region us-central1 --format 'value(spec.template.spec.containers[0].env)'`
   and paste the NAME list (names only) into the doc.
3. **Google OAuth client** — client ID, project, required JS origins list,
   required redirect URIs (read them in Cloud Console → copy names), consent
   status = Testing + current test users.
4. **Recovery runbook** — the exact restore steps used 2026-07-03: set Netlify
   env via API/CLI → trigger rebuild → verify bundle contains the client ID;
   set Cloud Run env via "Edit & deploy revision" → verify with the
   503-vs-401 probe.

**Verify**: `test -s Docs/ops/DEPLOY_ENV_BASELINE.md && grep -c "argyleholocron" Docs/ops/DEPLOY_ENV_BASELINE.md` → count ≥ 3.

### Step 2: Write `Scripts/verify_deploy_env.mjs` (read-only, no deps)

Node 22, no npm deps, modeled on `Scripts/verify_no_pii_leak.mjs` style. Checks,
each printing PASS/FAIL with a reason:

1. `GET https://argyleholocron.netlify.app/health` → expect 200.
2. `POST https://argyleholocron.netlify.app/api/auth/google` body
   `{"credential":"drift-probe"}` → expect **401** (FAIL loudly on 503 with the
   message "Cloud Run GOOGLE_CLIENT_ID is missing — see Docs/ops/DEPLOY_ENV_BASELINE.md §2").
3. Fetch `https://argyleholocron.netlify.app/` , extract `/assets/*.js` URLs
   (index + the manifest it references), download them, and check at least one
   contains the string `200583798886-` → PASS means the deployed bundle was
   built WITH `VITE_GOOGLE_CLIENT_ID` (FAIL message: "Netlify VITE_GOOGLE_CLIENT_ID
   missing or site not rebuilt — §1").
4. OPTIONAL (skip with a SKIPPED line when env is absent): if
   `NETLIFY_AUTH_TOKEN` env var is set, GET
   `https://api.netlify.com/api/v1/accounts/{first account slug}/env?site_id=ee11c6c2-ac8d-494c-b390-e1d2162d7480`
   and assert the 5 required KEYS exist (names only, never print values).

Exit 0 iff no FAIL. `--json` flag optional; don't gold-plate.

**Verify**: `node Scripts/verify_deploy_env.mjs` → exit 0 with checks 1–3 PASS
(4 SKIPPED without token). Then simulate a failure path:
`node -e "..."` not required — instead verify FAIL wiring by temporarily
pointing check 2 at `https://argyleholocron.netlify.app/api/auth/nonexistent`
in a scratch copy and confirming nonzero exit; restore before commit.

## Test plan

The script IS the test (self-verifying against live endpoints). No vitest/jest
additions — it lives outside both app test suites, matching
`verify_no_pii_leak.mjs` precedent.

## Done criteria

- [ ] Both files exist; `git status` shows ONLY the two new files
- [ ] `node Scripts/verify_deploy_env.mjs` exits 0 against the live site
- [ ] `grep -riE "(secret|api[_-]?key)\s*[:=]\s*['\"][A-Za-z0-9]" Docs/ops/DEPLOY_ENV_BASELINE.md Scripts/verify_deploy_env.mjs` → no matches (no secret values)
- [ ] Status row updated in `plans/README.md`

## STOP conditions

- The live probes return neither the healthy nor the documented-failure
  signature (e.g. `/api/auth/google` → 404: the proxy shape changed) — report
  actual responses instead of adapting silently.
- You find yourself needing write access to Netlify/GCP to complete a step —
  that's out of scope by design.

## Maintenance notes

- When any new required env var lands (e.g. plan 033's `AUDIT_LOG_VIEWER_EMAILS`),
  add it to the baseline doc AND a presence probe if it has a detectable
  signature. The doc is the source of truth the NEXT wipe gets restored from.
- Candidate follow-up (not in scope): run the verifier on a schedule (cron or
  GitHub Action) and alert on FAIL.
