# Plan 014: Remove committed account credentials + PII from the bundle; document the auth model

> **Executor instructions**: Follow step by step. The bootstrap decision in the STOP
> section must be resolved with the operator before blanking the last god password.
> Rotation is an operator action — surface it, don't skip it. Update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/components/Auth/localAccounts.ts qualia-shell/src/components/Auth/LoginScreen.tsx qualia-shell/src/context/UserContext.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the login roster — lockout risk if bootstrap mishandled)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a619279`, 2026-06-20
- **Executed**: 2026-08-20 on branch `sec/014-credentials` — see resolution record below. **Operator TODO (Ilya): rotate the two burned god passwords AND the stage-1 gate passphrase (`LoginScreen.tsx:24`, still committed by design) anywhere they were reused — they remain in git history.**

## Resolution record (2026-08-20)

**Bootstrap STOP — resolved by the operator:** blank ALL committed god-account
password literals (Lisa's `password: ''` pattern). Production sign-in is Google
Identity Services with backend verification; the roster password path is
dev/offline only.

**What the auth surface actually looked like at execution (drift from `a619279`):**
the Andy → Lisa → Architect quick-access *picker* is gone (plan 045-D one-form
login; 046-F splash). Flow today: splash → shared gate passphrase
(`LoginScreen.tsx:24`, committed) → one email+password form →
`checkLocalPassword` client gate → REAL backend `login(email, backendPassword ??
typed)`; offline entry only on explicit user choice. `SessionExpiredModal`
mirrors the same check. Dev sign-in DID depend on a committed non-empty
`password` literal (client-side compare before the backend call), so blanking
alone would have made dev builds unloginnable on any fresh device.

**Mechanism shipped:** shared `checkLocalPassword(account, typed, dev =
import.meta.env.DEV)` in `localAccounts.ts`, used by both `LoginScreen` and
`SessionExpiredModal`. An empty-password account is waived ONLY in DEV builds
(statically dead-code-eliminated from production bundles); the backend login
(or the explicit offline choice) remains the verifier. A runtime-set password
is enforced in both modes. Production builds hard-block empty-password accounts
until the Architect sets one at runtime (Control Panel → Accounts) — never a
committed literal. Personal email replaced with `architect@dwellium.com`
(matches the existing HalocronOS greeting map + e2e helper; account `id`
unchanged so per-user stores carry over); the personal-email entry was also
dropped from the HalocronOS greeting map (Google-derived first name covers it).

**Guard:** `localAccounts.test.ts` now scans the roster module AND its source
text — fails on any non-empty `password:` literal or personal-email/`@gmail.`
match (patterns only; no secret values in fixtures).

**Additional committed secrets found (locations + types only, per STOP #2):**
- `qualia-shell/src/components/Auth/LoginScreen.tsx:24` — stage-1 shared gate passphrase (also mirrored in `LoginScreen.test.tsx`). Left in place: removing it bricks the gate stage; rotation is the operator action.
- `qualia-shell/src/components/Auth/localAccounts.ts` — `backendPassword` dev-seed credentials for Andy/Lisa (pair with the backend's seeded users). Kept per the Lisa pattern; real fix is server-side verification.
- `qualia-shell/public/data/users.json` — seeded `passwordHash` values shipped in the public bundle.
- `qualia-shell/.env.example` documents `VITE_DEV_LOGIN`, which is consumed nowhere in `src/` (stale doc; the live flag is `VITE_GOOGLE_LOGIN`).

## Why this matters

`localAccounts.ts` ships two `god`-role accounts with **committed real password literals**
in the bundle, one tied to a personal email address. Because the deployed app is a static
SPA whose login is verified **client-side** (`LoginScreen.tsx` compares in the browser;
`UserContext.loginLocal` mints a `static-…` session with no backend check), the committed
passwords provide no real access control anyway — but they create two concrete problems:
(1) the personal email + the password literals are in git history (and any reused password
is now burned), and (2) `god` role bypasses all permission checks. The fix: stop shipping
real secrets/PII in source, rely on the existing runtime override store (the way Lisa's
account already works — blank, set at runtime by the Architect), and document that real
auth must move server-side (the backend already exposes `/api/auth/login`).

## Current state

- `qualia-shell/src/components/Auth/localAccounts.ts:43-47` — base roster. Two entries have `role:'god'` with a non-empty committed `password` literal; one of those uses a personal email. Lisa (`:45`) already ships with `password: ''` and is enabled at runtime by the Architect — this is the pattern to follow.
- `localAccounts.ts:80-101` — `applyOverrides`/`getEffectiveAccounts` merge a localStorage override layer over the base; `isPasswordSet` gates sign-in on a non-empty effective password.
- `LoginScreen.tsx:66-83` (`submitCredential`) — blocks sign-in when `!isPasswordSet(acct)` (`:72-75`), else compares `email`/`password` client-side (`:76-77`) and calls `loginLocal` (`:79`).
- `UserContext.tsx:446-464` (`loginLocal`) — builds the session entirely client-side, mints `static-${Date.now()}-${id}` token; depended upon for offline resilience.
- The repo has a memory/CLAUDE note that production login is moving to Google Identity Services; this local roster is the dev/offline path.

> Do NOT copy any password value into this plan, the commit, or the PR. Reference `localAccounts.ts:44,46` and "committed god password literal" only.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Tests (Mac) | `cd qualia-shell && npx vitest run localAccounts LoginScreen` | pass (incl. new guard test) |
| Guard grep | `grep -nE "password: *'[^']+'" qualia-shell/src/components/Auth/localAccounts.ts` | after fix: no non-empty committed password in the base roster |

## Scope

**In scope**:
- `qualia-shell/src/components/Auth/localAccounts.ts` (blank committed passwords; replace personal email with a non-PII placeholder)
- `qualia-shell/src/components/Auth/localAccounts.test.ts` (extend) — add a guard test
- README/CLAUDE note about the auth model (1–2 lines) if not already accurate

**Out of scope**:
- Moving verification to the backend `/api/auth/login` — that requires backend (separate repo) work; it is the *real* fix and is flagged as a follow-up, not done here.
- `loginLocal`'s session-minting (keep the offline-resilient `static-` path).
- Google Identity Services flow.

## Git workflow

- Branch: `advisor/014-remove-committed-creds`
- Commit: `security(auth): stop shipping account passwords + personal email; gate sign-in on runtime-set creds`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Replace the personal email with a placeholder

In `localAccounts.ts:46`, change the personal email to a non-PII placeholder (e.g. `architect@dwellium.local`). Keep the `id` unchanged (it scopes per-user stores — changing it would orphan existing data).

**Verify**: `grep -n "iklipinitser\|@gmail" qualia-shell/src/components/Auth/localAccounts.ts` → no match.

### Step 2: Blank the committed passwords

Set `password: ''` for the committed god account(s), matching Lisa's existing pattern, so sign-in is blocked until the Architect sets a password at runtime (the override store already supports this via `setAccountPassword`). **Before blanking the LAST god account that can bootstrap, resolve the STOP/decision below** — blanking every god password with no runtime override present would lock out the only account that can set passwords.

**Verify**: `grep -nE "password: *'[^']+'" qualia-shell/src/components/Auth/localAccounts.ts` → no non-empty committed password remains (or only the single operator-approved bootstrap, per the decision).

### Step 3: Add a guard test

In `localAccounts.test.ts`, add a test asserting every entry in `LOCAL_ACCOUNTS` has an empty `password` (or that no entry contains a known-secret-shaped literal). This prevents re-introduction.

**Verify**: `npx vitest run localAccounts` → pass.

### Step 4: Confirm sign-in flow still works with runtime-set creds

`LoginScreen` already blocks empty-password accounts and reads effective (override-merged) creds. Confirm the existing `LoginScreen`/`localAccounts` tests still pass; adjust any test that hard-coded a now-removed password to set it via the override store first (mirror how the app does it).

**Verify (Mac)**: `npx vitest run LoginScreen localAccounts` → pass; `npx tsc -b` exit 0.

## Test plan

- `localAccounts.test.ts`: (a) new guard — no base account ships a non-empty password; (b) `getEffectiveAccounts()` reflects an override-set password; (c) `isPasswordSet` false for a blank account.
- `LoginScreen` test: signing in is blocked for a blank account and succeeds after an override password is set (set it via `setAccountPassword` in the test).
- Verification: `npx vitest run localAccounts LoginScreen` → all pass.

## Done criteria

- [ ] No personal email in `localAccounts.ts` (`grep` clean)
- [ ] No non-empty committed password in the base roster (or only the single operator-approved bootstrap) — `grep` guard + unit test
- [ ] `npx vitest run localAccounts LoginScreen` green; `npx tsc -b` exit 0
- [ ] Only the in-scope files changed
- [ ] `plans/README.md` row updated, with the rotation + server-auth follow-up noted

## STOP conditions

- **Bootstrap decision (resolve with operator before Step 2 completes):** if blanking all god passwords leaves no way to sign in and set passwords at runtime, STOP and confirm the bootstrap approach (e.g. keep ONE operator-chosen, freshly-rotated bootstrap password, or seed an override out-of-band). Do not leave the app unloginnable.
- You find additional committed secrets elsewhere while doing this (e.g. in `data/users.json`) — STOP, report locations + types (never values), and recommend rotation; don't expand scope silently.

## Maintenance notes

- **Rotation advisory (operator, important):** the two committed god passwords and the stage-1 gate passphrase are in git history — rotate them, and anywhere they were reused (the values share a pattern, which suggests reuse risk). Removing them from `HEAD` does not unburn them; history rewrite or rotation is required.
- **Real fix (follow-up, backend-dependent):** for any account protecting real data, verify credentials at the backend `/api/auth/login` (already present) instead of the client-side compare in `LoginScreen.tsx:76-77`; keep the local roster as display-only quick-select. Track as a cross-repo task.
- Reviewer: confirm no password/email literal re-entered the roster; confirm the app is still loginnable per the bootstrap decision.
