# Deploy-env baseline — Dwellium production surfaces

Plan 031. Written 2026-07-03 against frontend HEAD `df3bf79`.

## Why this document exists

Google sign-in on production has died twice from the same failure class:
deploy surfaces silently losing required configuration.

1. Commit `0c3814c` — backend env `GOOGLE_CLIENT_ID` / `ALLOWED_EMAILS` had to
   be restored after a deploy wipe.
2. 2026-07-03 live incident — Netlify was missing `VITE_GOOGLE_CLIENT_ID`
   (sign-in dead client-side), Cloud Run was again missing
   `GOOGLE_CLIENT_ID` / `GOOGLE_AUTH_ALLOWED_EMAILS` (backend returned 503
   "Google login is not configured"), and the Google OAuth client was missing
   the Netlify JS origin (`origin_mismatch`).

No single document previously listed what each deploy surface must have, and
there was no automated drift detection. This document is the baseline
inventory (§1–§3); `Scripts/verify_deploy_env.mjs` is the read-only drift
verifier; §4 is the recovery runbook used on 2026-07-03.

**Never put secret values in this file.** Names, purposes, and "where to set
it" only.

---

## §1. Netlify site (`argyleholocron`)

- Site name: `argyleholocron`
- Site ID: `ee11c6c2-ac8d-494c-b390-e1d2162d7480`
- Public URL: https://argyleholocron.netlify.app
- Build config lives in-repo at `netlify.toml` (repo root); base dir
  `qualia-shell`, build command `react-router build`, publish dir
  `build/client`.

`netlify.toml` bakes in only 3 vars via `[build.environment]`:

| Var | Value (in netlify.toml) | Purpose |
|---|---|---|
| `NODE_VERSION` | `"22"` | Netlify build image Node version |
| `VITE_APPFOLIO_SEEDS` | `"false"` | Disables AppFolio-derived demo seed layer in production |
| `VITE_ONE_SAVE` | `"true"` | Enables One Save cross-device sync (encrypted per-account keys/workspaces) |

The remaining required vars are **site-scoped, not in the repo** — set them
in Netlify's dashboard (Site configuration → Environment variables) or via
the Netlify CLI/API, never in `netlify.toml`:

| Var | Context | Purpose |
|---|---|---|
| `NETLIFY_API_PROXY_TARGET` | All contexts | Origin the build's redirect-writer script (`scripts/write-netlify-redirects.mjs`) points `/api/*` at. Current value (2026-07-03): `https://dwellium-backend-472241012306.us-central1.run.app`. Without this, One Save and all `/api/*` calls are inert. |
| `VITE_GOOGLE_CLIENT_ID` | All contexts | The Google OAuth client ID, baked into the client JS bundle at build time. Restored 2026-07-03 after being found missing (this was the direct cause of dead sign-in). |

**Build-time-baked warning:** every `VITE_*` var is inlined into the static
JS bundle at build time (Vite convention). Changing any `VITE_*` value in the
Netlify dashboard does **nothing** until the next rebuild — there is no
runtime env read in the deployed static SPA. After changing a `VITE_*` var,
you must trigger a new deploy (push a commit, or "Trigger deploy" → "Clear
cache and deploy site" in the Netlify UI) and then verify the new bundle
actually contains the expected value (see §4 and the verifier's check 3).

---

## §2. Cloud Run backend (`dwellium-backend`)

- Service: `dwellium-backend`
- Project: `my-project-57391aion-ethos-api`
- Region: `us-central1`
- URL: `https://dwellium-backend-472241012306.us-central1.run.app`

### Auth-critical vars (highlighted — these caused the 2026-07-03 outage)

| Var | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Backend-side verification of the Google ID token the frontend sends to `/api/auth/google`. Missing → backend returns 503 `{"error":"Google login is not configured on the backend"}`. |
| `GOOGLE_AUTH_ALLOWED_EMAILS` | Allowlist gating which verified Google accounts may create/link a Dwellium session. |

Both were restored 2026-07-03.

### Other required vars (~22, pre-existing, non-exhaustive names only)

`NODE_ENV`, `AUTH_ENABLED`, `AUTH_SESSION_HOURS`, `SEED_DEMO_DATA`,
`TRUST_PROXY`, `CORS_ORIGINS`, `DWELLIUM_DATA_DIR`, `QUALIA_DATA_DIR`,
`ONE_SAVE_DATA_DIR`, `STORAGE_DIR`, `DWELLIUM_SYNC_DIR`, `QUALIA_SYNC_DIR`,
`REMOTE_FILE_CACHE_DIR`, `CLOUD_BROWSER_CHROMIUM_PATH`, `SOFFICE_PATH`,
`SCHEDULER_ENABLED`, `GMAIL_FETCHER_ENABLED`, `GOOGLE_OAUTH_PUBLIC_BASE_URL`,
`PUBLIC_BASE_URL`, `RECALL_WEBHOOK_BASE_URL`, and two **secret-holding** vars
named here for inventory purposes only — **never print their values**:
`GOOGLE_OAUTH_CLIENT_SECRET`, `OPENAI_API_KEY`.

### How to inspect current Cloud Run env (names only)

Documented, **not run** as part of this plan — `gcloud` auth on this Mac is
currently expired.

```
gcloud run services describe dwellium-backend \
  --project=my-project-57391aion-ethos-api \
  --region=us-central1 \
  --format="value(spec.template.spec.containers[0].env[].name)"
```

This prints only variable **names**, one per line — safe to run and share.
To also confirm a var is non-empty without ever printing its value, pipe
through `grep -c '^GOOGLE_CLIENT_ID$'` and check the count is 1.

Setting/restoring env vars requires "Edit & deploy new revision" in the
Cloud Run console (or `gcloud run services update --update-env-vars`) — both
are WRITE operations, out of scope for this plan's read-only verifier.

---

## §3. Google OAuth client

- Client ID: `200583798886-9959g1037ds7e475hrb6hb4rnrfo8u8g.apps.googleusercontent.com`
  (this ID is public by nature — it ships in the client JS bundle and is
  visible in every sign-in request; it is NOT a secret. The client *secret*,
  named `GOOGLE_OAUTH_CLIENT_SECRET` in §2, is the actual credential and must
  never appear in any repo file.)
- GCP project: `skilful-gantry-465123-a7`
- Managed in: Google Cloud Console → "APIs & Services" → "Credentials", or
  the newer "Google Auth Platform" surface (Console → Google Auth Platform →
  Clients).

### Required Authorized JavaScript origins

- `https://argyleholocron.netlify.app` (added 2026-07-03 — this was the
  `origin_mismatch` fix)
- Local dev origins: `http://localhost:8080`, `http://localhost:8081`,
  `http://localhost:8082`, `http://localhost:8083`, `http://localhost:8084`,
  `http://localhost:5173`

### Redirect URIs

This app uses the Google Identity Services (GIS) client-side token flow, not
a server-side OAuth redirect flow, for sign-in — there is no Authorized
redirect URI needed for the sign-in button itself. If a redirect-based flow
is added later (e.g. Gmail/Calendar OAuth per the frontend CLAUDE.md
carry-forward list), manage redirect URIs in the same Console → Google Auth
Platform → Clients screen.

### Consent screen status

- Publishing status: **Testing** (not verified/production)
- Test users (only these accounts can complete sign-in while in Testing
  mode): `iklipinitser@gmail.com`, `andy@dwellium.com`

---

## §4. Recovery runbook (the exact 2026-07-03 restore sequence)

Use this when the drift verifier (or a user report) shows sign-in broken.
Steps are ordered by what was actually needed 2026-07-03; skip any step
whose symptom doesn't match.

### A. Netlify `VITE_GOOGLE_CLIENT_ID` missing (client-side dead sign-in button / no Google prompt)

1. Set the env var on the Netlify site (dashboard: Site configuration →
   Environment variables → add `VITE_GOOGLE_CLIENT_ID`, context: all; or via
   `netlify env:set` CLI, or the Netlify API
   `PATCH /api/v1/accounts/{account_id}/env/VITE_GOOGLE_CLIENT_ID`).
2. Trigger a rebuild — `VITE_*` vars are baked in at build time, so setting
   the var alone does nothing until the next deploy. Push any commit, or use
   "Trigger deploy" → "Clear cache and deploy site" in the Netlify UI.
3. Verify the new bundle actually contains the client ID: fetch
   `https://argyleholocron.netlify.app/`, resolve the built `/assets/*.js`
   entry, and grep it for the client-ID prefix `200583798886-`. This is
   exactly what `Scripts/verify_deploy_env.mjs` check 3 automates.

### B. Cloud Run `GOOGLE_CLIENT_ID` / `GOOGLE_AUTH_ALLOWED_EMAILS` missing (backend 503 "Google login is not configured")

1. Cloud Run console → `dwellium-backend` → "Edit & deploy new revision" →
   Variables & Secrets tab → re-add `GOOGLE_CLIENT_ID` and
   `GOOGLE_AUTH_ALLOWED_EMAILS` (values from your secret manager / password
   store — never from this doc) → Deploy.
2. Verify with the 503-vs-401 probe: `POST /api/auth/google` with body
   `{"credential":"drift-probe"}` (an intentionally invalid token).
   - Healthy backend (env present): `401 {"error":"Google sign-in could not
     be verified"}` — the backend attempted verification and rejected the
     fake token, which is correct.
   - Broken backend (env missing): `503 {"error":"Google login is not
     configured on the backend"}` — the backend never attempted
     verification. This distinction IS the drift signal; see
     `Scripts/verify_deploy_env.mjs` check 2.

### C. Google OAuth client missing the Netlify origin (`origin_mismatch` error in the browser console during sign-in)

1. Google Cloud Console → Google Auth Platform → Clients → select the OAuth
   client (`200583798886-...`) → Authorized JavaScript origins → Add URI →
   `https://argyleholocron.netlify.app` → Save.
2. Changes to Authorized origins can take a few minutes to propagate; retry
   sign-in after a short wait if `origin_mismatch` persists immediately after
   saving.

---

## Cross-reference

- Read-only verifier: `Scripts/verify_deploy_env.mjs` (run on a machine that
  can reach the public internet; checks 1–3 require no credentials, check 4
  is optional and needs `NETLIFY_AUTH_TOKEN`).
- Repo build config: `netlify.toml` (repo root).
- Frontend CLAUDE.md "Current state" section narrates the 2026-07-03
  incident and fixes at the arc level.
