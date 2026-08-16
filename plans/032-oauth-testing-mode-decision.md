# Plan 032: Document the OAuth Testing-mode constraint + decision memo (publish vs. stay)

> **Executor instructions**: Docs-only plan. Follow step by step; verify each
> step. On any STOP condition, stop and report. Update this plan's row in
> `plans/README.md` when done.
>
> **Repo**: FRONTEND repo `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`
> (planned at `df3bf79`). No source code is touched.
>
> **Drift check (run first)**:
> `git diff --stat df3bf79..HEAD -- Docs/ops/ plans/027-complete-gmail-calendar-oauth.md`
> Mismatch with "Current state" → STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (docs only)
- **Depends on**: none (informs plan 027; does not block it)
- **Category**: docs / deps-ops
- **Planned at**: frontend `df3bf79`, 2026-07-03

## Why this matters

The Google OAuth consent screen for the app (client
`200583798886-9959…apps.googleusercontent.com`, GCP project
`skilful-gantry-465123-a7`) has publishing status **Testing**. Verified live on
2026-07-03: only accounts on the test-user list can authorize sensitive scopes
(a Gmail connect attempt by andy@dwellium.com failed with
`Error 403: access_denied` until that account was added as a test user). Google
policy for external apps in Testing mode: **refresh tokens for apps requesting
sensitive/restricted scopes expire after ~7 days**, and the test-user cap is
100 for the app's lifetime. Plan 027 (complete Gmail/Calendar OAuth with
per-user token storage) will silently break weekly if this constraint isn't
designed for. This plan records the constraint and gives Ilya a one-page
decision memo: publish the app (verification burden) vs. stay in Testing
(weekly re-auth), so 027's executor builds the right thing.

## Current state

- Consent screen: Google Auth Platform → project `skilful-gantry-465123-a7` →
  Audience: Publishing status **Testing**, User type **External**, test users:
  `iklipinitser@gmail.com`, `andy@dwellium.com` (2/100), as of 2026-07-03.
- `plans/027-complete-gmail-calendar-oauth.md` — existing TODO plan for live
  Gmail/Calendar OAuth; currently does NOT mention the Testing-mode refresh
  token expiry.
- `Docs/ops/` — may not exist yet (plan 031 also creates files there; both may
  run concurrently — creating the directory is safe/idempotent, but do NOT
  edit plan 031's files).
- Backend OAuth env conventions: `src/services/googleAuth.ts` in the backend
  repo reads `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` — cite
  by name only; never copy secret values into docs.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Verify files exist | `ls Docs/ops/GOOGLE_OAUTH_PUBLISHING.md` | file listed |
| No secrets committed | `grep -riE "client_secret\s*[:=]\s*['\"]?[A-Za-z0-9_-]{10,}" Docs/ops/GOOGLE_OAUTH_PUBLISHING.md` | no matches |

## Scope

**In scope:**
- `Docs/ops/GOOGLE_OAUTH_PUBLISHING.md` (new)
- `plans/027-complete-gmail-calendar-oauth.md` (append ONE constraint section; change nothing else in it)

**Out of scope (do NOT touch):**
- `Docs/ops/DEPLOY_ENV_BASELINE.md` and `Scripts/verify_deploy_env.mjs` — plan 031's files (possibly being written concurrently).
- Any source code in either repo; any change to the OAuth client itself.

## Git workflow

- Branch: `advisor/032-oauth-testing-decision` off `main`
- Commit: `docs(ops): OAuth Testing-mode constraint + publish decision memo`
- Do NOT push without Ilya's explicit go.

## Steps

### Step 1: Research and confirm current Google policy (web, read-only)

Confirm against Google's current documentation (search "Google OAuth testing
publishing status refresh token expiry site:developers.google.com" and the
OAuth verification FAQ):

1. Refresh-token lifetime for External+Testing apps using sensitive/restricted scopes (expected: 7 days).
2. What verification requires for **Gmail restricted scopes** (expected: app verification + possible CASA/security assessment; note current pricing/timeline).
3. Whether "Internal" user type is available (expected: only for Google Workspace orgs — check whether dwellium.com is a Workspace org, in which case Internal mode removes both the cap and verification for org users).

Record each answer WITH the source URL and access date in the memo.

**Verify**: memo draft contains ≥3 developers.google.com / support.google.com citations.

### Step 2: Write `Docs/ops/GOOGLE_OAUTH_PUBLISHING.md`

One page, four sections:

1. **Facts** — client ID, project, current status (Testing, External, 2/100 test
   users as of 2026-07-03), where to manage it (Cloud Console → Google Auth
   Platform → Audience).
2. **Constraint** — the confirmed token-expiry and cap rules from Step 1, and
   the concrete symptom (Gmail/Calendar integrations silently need re-auth
   after expiry; new users blocked with 403 access_denied until added as test users).
3. **Options** — (a) stay in Testing: zero process, weekly re-auth UX, manual
   test-user list; (b) publish with only sensitive (non-restricted) scopes if
   feasible; (c) full verification for restricted Gmail scopes (effort/cost from
   Step 1); (d) Internal user type if dwellium.com is a Workspace org (state
   whether it is, from Step 1 research or `andy@dwellium.com`'s org status).
4. **Recommendation + decision line** — recommend the cheapest option that
   matches actual usage (a handful of known accounts → (d) if available, else
   (a) with the re-auth caveat documented); end with `DECISION (Ilya): ____` to
   be filled by the owner.

**Verify**: the grep from "Commands" table → no secret matches; file renders (no broken markdown tables).

### Step 3: Append the constraint to plan 027

At the END of `plans/027-complete-gmail-calendar-oauth.md`, add a section
`## Constraint added 2026-07-03 (plan 032)` — two paragraphs: token-expiry
behavior under Testing mode with the memo as the reference, and one
requirement: "027's token storage MUST handle refresh-token revocation/expiry
gracefully (detect invalid_grant, mark the account as needs-reauth, surface a
reconnect button — never a silent failure)."

**Verify**: `grep -n "plan 032" plans/027-complete-gmail-calendar-oauth.md` → match found; `git diff --stat` shows only the appended lines in that file.

## Test plan

Docs-only; verification is the grep gates above. No app tests run.

## Done criteria

- [ ] `Docs/ops/GOOGLE_OAUTH_PUBLISHING.md` exists with ≥3 cited sources and a DECISION line
- [ ] Plan 027 contains the appended constraint section, nothing else changed in it
- [ ] No secret values in any touched file
- [ ] `git status` shows only the two in-scope files
- [ ] Status row updated in `plans/README.md`

## STOP conditions

- Step 1 research contradicts the 7-day expectation (policy changed) — write what IS true, but flag the discrepancy prominently in your report.
- `plans/027-complete-gmail-calendar-oauth.md` does not exist or was substantially rewritten since `df3bf79`.

## Maintenance notes

- When Ilya fills the DECISION line, whoever executes 027 must re-read this memo first.
- If the app is ever published, delete the test-user instructions from the recovery runbook in `Docs/ops/DEPLOY_ENV_BASELINE.md` (plan 031's file) — coordinate, don't edit concurrently.
