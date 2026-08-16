# Plan 023: Backend security quick-wins — seed god password, error leakage, IP trust

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving to the next step. If
> anything in "STOP conditions" occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `cd /Users/ilyaklipinitser/dwellium-backend && git diff --stat 6695bd4..HEAD -- ai-dashboard369-file-manager/src/services/authService.ts ai-dashboard369-file-manager/src/routes/auditRoutes.ts ai-dashboard369-file-manager/src/app.ts`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `730c82a` (frontend) / `6695bd4` (backend `dwellium-backend`), 2026-07-02

## Why this matters

Three independent backend security weaknesses, all small and high-confidence:

1. **Seed god password in source.** `seedDefaultUsers()` creates `andy@dwellium.com`
   with role `god` and password `admin123` — in committed source. It only runs when
   the `users` table is empty, but a fresh Cloud Run deploy with a new database seeds
   the top-privilege account with a guessable password. Andy is the primary human
   operator; this is the account most worth protecting.
2. **Internal error text leaked to clients.** The audit route returns `err.message`
   verbatim on a 500, exposing schema/stack details to the browser.
3. **Spoofable client IP.** Audit logging and the login rate-limiter key off
   `req.ip`, which honours `x-forwarded-for` only correctly when Express `trust proxy`
   is set. If it is not set on Cloud Run, an attacker can forge the IP recorded in the
   audit trail and rotate it to bypass the login rate-limiter.

## Current state

Backend repo root: `/Users/ilyaklipinitser/dwellium-backend` (the app lives in the
`ai-dashboard369-file-manager/` subdirectory; git repo is at the parent).

- `ai-dashboard369-file-manager/src/services/authService.ts` — auth service. Around
  line 267–281, `seedDefaultUsers()` holds an array of `{ email, name, password, role }`
  literals; the first entry is:
  ```ts
  { email: 'andy@dwellium.com', name: 'Andy', password: 'admin123', role: 'god' as Role },
  ```
  Guard above it: `const count = ...; if (count > 0) return; // Already seeded`.
- `ai-dashboard369-file-manager/src/routes/auditRoutes.ts:50` — the catch block:
  ```ts
  } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
  }
  ```
- `ai-dashboard369-file-manager/src/app.ts` — Express bootstrap. Search for
  `trust proxy` (near line 251–260): it is set conditionally from `TRUST_PROXY` /
  `TRUST_PROXY_HOPS` env vars and otherwise left at the Express default (`false`).
  The login rate limiter is near line 235–239; audit IP is read as
  `req.ip || req.headers['x-forwarded-for'] || ''` at `authRoutes.ts` (login + the
  logout handler added 2026-07-02) and in `src/services/auditMiddleware.ts`.

Conventions: this is a TypeScript + Express + better-sqlite3 backend. Verify with
`npx tsc --noEmit` from the app subdir. Passwords are hashed via `hashPassword()` in
`authService.ts` (scrypt) — never store or log plaintext. Secrets are supplied through
environment variables / Cloud Run Secret Manager (see `deploy/cloud-run.sh`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager && npx tsc --noEmit` | exit 0, no errors |
| Grep check | `grep -n "admin123\|corp123\|mgmt123\|adv123\|maint123\|tenant123" src/services/authService.ts` | no matches after Step 1 |

There is no backend test runner wired yet (see plan 024). Verification here is
typecheck + grep + manual reading.

## Scope

**In scope:**
- `ai-dashboard369-file-manager/src/services/authService.ts`
- `ai-dashboard369-file-manager/src/routes/auditRoutes.ts`
- `ai-dashboard369-file-manager/src/app.ts`

**Out of scope:**
- The frontend repo (`/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`) — nothing here touches it.
- The scrypt work factor (`hashPassword`) — separate low-priority note, not this plan.
- Any change to the login/session flow beyond IP handling.

## Git workflow

- Backend repo commits use conventional-commit style (see `git log --oneline -5`).
- Branch: `advisor/023-security-quick-wins`.
- **Do NOT push or deploy.** Per repo policy the operator (Ilya) runs deploys and
  gives an explicit go. Committing locally is fine.

## Steps

### Step 1: Remove hardcoded seed passwords; source them from env with a random fallback

In `authService.ts` `seedDefaultUsers()`, replace each literal `password: '…'` with a
value read from an environment variable, falling back to a per-run random password that
is printed once to the server log (never persisted in plaintext). Target shape:

```ts
import crypto from 'crypto';

function seedPassword(envKey: string): string {
    const fromEnv = process.env[envKey];
    if (fromEnv && fromEnv.length >= 8) return fromEnv;
    const generated = crypto.randomBytes(12).toString('base64url');
    console.warn(`[seed] ${envKey} not set — generated a one-time password (shown once): ${generated}`);
    return generated;
}
// ...
{ email: 'andy@dwellium.com', name: 'Andy', password: seedPassword('SEED_ANDY_PASSWORD'), role: 'god' as Role },
// ...one env key per seeded account (SEED_LISA_PASSWORD, etc.)
```

Keep the `if (count > 0) return;` guard. Do not change the hashing call that consumes
`password`.

**Verify**: `grep -n "admin123\|corp123\|mgmt123\|adv123\|maint123\|tenant123" src/services/authService.ts` → no matches. Then `npx tsc --noEmit` → exit 0.

### Step 2: Stop leaking internal error text from the audit route

In `auditRoutes.ts`, change the catch block to log the detail server-side and return a
generic message:

```ts
} catch (err: any) {
    console.error('[audit] query failed:', err?.message, err?.stack);
    res.status(500).json({ success: false, error: 'Failed to read the audit log' });
}
```

**Verify**: `grep -n "error: err.message" src/routes/auditRoutes.ts` → no matches. `npx tsc --noEmit` → exit 0.

### Step 3: Make `trust proxy` safe-by-default in production

In `app.ts`, where `trust proxy` is configured, ensure that when
`process.env.NODE_ENV === 'production'` and no explicit `TRUST_PROXY`/`TRUST_PROXY_HOPS`
is set, it defaults to `1` (trust exactly one proxy hop — correct for Cloud Run, which
puts one Google front-end proxy in front of the container). Preserve any explicit env
override. Add a one-line `console.warn` if production is running with `trust proxy`
disabled. Do not change the rate-limiter or audit-IP read sites themselves — fixing the
`trust proxy` value makes `req.ip` correct everywhere it is already used.

Target shape (adapt to the existing conditional):

```ts
const trustProxyEnv = process.env.TRUST_PROXY_HOPS ?? process.env.TRUST_PROXY;
if (trustProxyEnv != null && trustProxyEnv !== '') {
    app.set('trust proxy', isNaN(Number(trustProxyEnv)) ? trustProxyEnv : Number(trustProxyEnv));
} else if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Cloud Run: one front-end proxy hop
} // else: dev default (false)
```

**Verify**: `npx tsc --noEmit` → exit 0. Read the block back and confirm the production
branch sets `1`.

## Test plan

No backend test harness exists yet (plan 024 establishes it). For this plan:

- Manual: `grep` checks in each step above return the expected empty results.
- After plan 024 lands, add a test asserting the audit 500 body equals
  `Failed to read the audit log` and does not contain `err.message` content, and a test
  that `seedDefaultUsers()` does not embed the removed literals.

## Done criteria

- [ ] `grep -n "admin123\|corp123\|mgmt123\|adv123\|maint123\|tenant123" src/services/authService.ts` → no matches
- [ ] `grep -n "error: err.message" src/routes/auditRoutes.ts` → no matches
- [ ] `app.ts` sets `trust proxy` to `1` on the production-with-no-override branch
- [ ] `npx tsc --noEmit` (from `ai-dashboard369-file-manager/`) exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated
- [ ] Report to Ilya: **the existing `andy@dwellium.com` account, if already seeded in
      any live database, must have its password rotated manually** — removing the literal
      does not change an already-seeded row.

## STOP conditions

Stop and report if:
- The seed array or the audit catch block doesn't match the excerpts (drift).
- `trust proxy` is already set unconditionally somewhere else in `app.ts` (a second
  writer would conflict) — report the location instead of adding a second set call.
- Typecheck fails twice after a reasonable fix.
- You find the seed passwords referenced anywhere else (tests, fixtures) — report the
  list rather than editing out of scope.

## Maintenance notes

- The one-time generated seed passwords appear in the server log exactly once. For a
  real deployment, set the `SEED_*_PASSWORD` env vars (or seed via a proper admin flow).
- If session storage ever moves from Bearer tokens to cookies, revisit CORS
  `credentials` and add `SameSite`/`HttpOnly` — out of scope here.
- Reviewer should confirm no plaintext password is logged at `info` level and that the
  hashing call is unchanged.
