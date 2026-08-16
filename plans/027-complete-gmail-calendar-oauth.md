# Plan 027: Complete live Gmail/Calendar OAuth (per-user token storage + flow)

> **Executor instructions**: This is a design + build plan for a security-sensitive
> surface (OAuth tokens). Follow step by step, honor STOP conditions, and do NOT
> improvise token handling. Update this plan's row in `plans/README.md` when done.
> **Supersedes** the older `plans/021-gmail-calendar-oauth.md` (mark 021 SUPERSEDED in
> the index).
>
> **Drift check (run first)**:
> Frontend: `cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec" && git diff --stat 730c82a..HEAD -- qualia-shell/src/lib/googleOAuthConnect.ts qualia-shell/src/components/ControlPanel/GoogleAccountsSection.tsx`
> Backend: `cd /Users/ilyaklipinitser/dwellium-backend && git diff --stat 6695bd4..HEAD -- ai-dashboard369-file-manager/src/routes/googleOAuthRoutes.ts ai-dashboard369-file-manager/src/services/googleOAuthAccountStore.ts`

## Status

- **Priority**: P2 (direction)
- **Effort**: M (much of the flow was wired 2026-07-02; this closes the gaps)
- **Risk**: MED (OAuth token storage — must be encrypted at rest, never logged)
- **Depends on**: 024 (backend tests, to verify the token store safely)
- **Category**: direction
- **Planned at**: `730c82a` (frontend) / `6695bd4` (backend), 2026-07-02

## Why this matters

The multi-account Gmail + Calendar UI exists, and as of 2026-07-02 most of the OAuth
plumbing was completed: the frontend does an authenticated `fetch(...?mode=json)` and opens
the returned consent URL; the backend `/api/google/oauth/start` returns `{ url }` for JSON
requests and is mounted behind `authenticate`; the deployed callback URI is registered on
the Google client; `GOOGLE_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` are set on Cloud Run.
What remains is verifying the end-to-end round-trip and confirming per-user token storage +
refresh are solid and encrypted at rest. This plan is scoped to *closing and verifying*, not
rebuilding.

## Current state

- Backend `src/routes/googleOAuthRoutes.ts` — `GET /oauth/start` (returns `{ url }` for
  `mode=json`, 302 otherwise), `GET /oauth/callback` (public; exchanges `code`, fetches the
  profile, calls `upsertGoogleAccountForUser`), `GET /oauth/status`, and account CRUD. State
  is stored via `saveGoogleOAuthState` / `consumeGoogleOAuthState`.
- Backend `src/services/googleOAuthAccountStore.ts` — persists per-user Google accounts and
  `StoredGoogleTokens`. **Confirm how tokens are stored at rest** (plaintext vs encrypted).
  This is the key security question of this plan.
- Backend `src/services/googleAuth.ts` — builds an OAuth2 client from the stored tokens for
  the automation engine; refreshes on the `tokens` event and calls
  `updateGoogleAccountTokensForUser`.
- Frontend `src/lib/googleOAuthConnect.ts` — `getGoogleOAuthStatus()`,
  `startGoogleOAuthConnect()` (authed fetch → `{ url }`), `openConsentPopup()`.
- Frontend `src/components/ControlPanel/GoogleAccountsSection.tsx` /
  `LlmIntegrationsSection.tsx` — the Connect UI.
- Reference docs: `Docs/Google_OAuth_Start_Backend_Patch.md`,
  `Docs/Google_MultiAccount_Backend.md`, `plans/021-gmail-calendar-oauth.md` (older plan,
  being superseded).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Backend typecheck | `cd /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager && npx tsc --noEmit` | exit 0 |
| Backend tests | `npm test -- google` | pass (after plan 024) |
| Frontend gate | `cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec" && bash Scripts/gate.sh` | GREEN |

## Scope

**In scope:**
- `ai-dashboard369-file-manager/src/services/googleOAuthAccountStore.ts` — encrypt tokens
  at rest if they are not already; add refresh-persistence coverage.
- `ai-dashboard369-file-manager/tests/integration/googleOAuth.test.ts` (create) — mock the
  Google token/profile boundary; test state CSRF, callback upsert, status, and that stored
  tokens are not plaintext.
- Frontend: only status/UX polish in `GoogleAccountsSection.tsx` if the round-trip reveals a
  gap; no new flow.

**Out of scope:**
- Changing the OAuth client / consent screen / redirect URIs (operator action, already done).
- The LLM per-user key vault (separate system).
- Building Gmail/Calendar *feature* UI beyond connect/status.

## Steps

### Step 0 (SPIKE — do this first and report before building)

Read `googleOAuthAccountStore.ts` and determine: (a) are `StoredGoogleTokens`
(access + refresh) stored **plaintext** on disk/DB, or encrypted? (b) is the OAuth `state`
single-use and expiry-checked (CSRF)? (c) on refresh, are new tokens persisted for the right
user? Write findings into this plan's "Spike findings" section below and STOP for review if
tokens are plaintext — the encryption approach (reuse the pattern in the frontend
`integrationsCrypto.ts`, or a backend equivalent keyed by a server secret) needs a decision.

### Step 1: Encrypt tokens at rest (if the spike found plaintext)

Encrypt `access_token` + `refresh_token` before persisting and decrypt on read, using a key
derived from a server-side secret (env var, via Secret Manager — never committed). Match the
never-log rule: no token value in any log line.

**Verify**: a test asserts the persisted representation contains no substring of a known
test token; `npx tsc --noEmit` → 0.

### Step 2: End-to-end round-trip verification

With the backend running and real credentials, confirm: Connect → consent → callback →
status flips to `connected`, and the account persists across reload. Per repo rule
("green gate ≠ working"), verify with real requests, not mocks, before declaring done.
(Operator may need to perform the interactive consent.)

**Verify**: `GET /api/google/oauth/status` returns `connected: true` for the account after a
real connect; record the observed (redacted) response.

### Step 3: Integration tests (mocked Google boundary)

Create `tests/integration/googleOAuth.test.ts`: mock the token exchange + profile fetch;
assert callback rejects a missing/expired/mismatched `state`; assert a successful callback
upserts the account for the state's user; assert `status` reflects it; assert stored tokens
are not plaintext.

**Verify**: `npm test -- google` → all pass.

## Done criteria

- [ ] Spike findings recorded; if tokens were plaintext, they are now encrypted at rest
- [ ] `tests/integration/googleOAuth.test.ts` passes (state CSRF, callback upsert, status,
      no-plaintext-token)
- [ ] Real round-trip verified: a genuine connect flips status to connected and persists
- [ ] No token value appears in any log statement (`grep -n "accessToken\|refreshToken" src`
      shows only guarded uses)
- [ ] `npx tsc --noEmit` exits 0; frontend gate GREEN if any frontend file changed
- [ ] `plans/README.md` updated; plan 021 marked SUPERSEDED

## STOP conditions

- Spike finds tokens stored plaintext → STOP after Step 0 and report; get the encryption
  approach confirmed before writing it.
- The callback route is reachable without validating `state` → security bug, report before
  changing.
- Real round-trip returns `redirect_uri_mismatch` → the registered URI drifted; report to
  operator (do not edit the Google client).

## Maintenance notes

- Token refresh persistence is the fragile seam; the test for it must stay.
- If additional Google scopes are added later, the consent screen + scope list update
  together.
- Reviewer must confirm: no token in logs, `state` is single-use + expiring, encryption key
  comes from a secret, not source.

## Spike findings

(Executor fills this in at Step 0.)

## Constraint added 2026-07-03 (plan 032)

The app's Google OAuth consent screen (client `200583798886-9959…`, GCP project
`skilful-gantry-465123-a7`) is in **Testing** publishing status, External user
type. Under Google's policy for Testing-mode apps requesting sensitive/restricted
scopes (Gmail, Calendar), refresh tokens expire after ~7 days, and only accounts
on the test-user list (2/100 as of 2026-07-03: iklipinitser@gmail.com,
andy@dwellium.com) can authorize at all — a live Gmail connect attempt on
2026-07-03 failed with `Error 403: access_denied` until the account was added.
See `Docs/ops/GOOGLE_OAUTH_PUBLISHING.md` (plan 032) for the publish-vs-stay
decision memo; re-read it before executing this plan.

Hard requirement for this plan's token storage: it MUST handle refresh-token
revocation/expiry gracefully — detect `invalid_grant` on refresh, mark the
account as needs-reauth, and surface a reconnect button in the integrations UI.
Never a silent failure: a weekly-expiring token in Testing mode makes silent
degradation the default failure mode unless explicitly designed against.
