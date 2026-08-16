# Plan 030: Record failed logins in the audit log (fix the sentinel-user FK gap)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in "STOP
> conditions" occurs, stop and report — do not improvise. When done, update this
> plan's status row in `plans/README.md` (in the FRONTEND repo) — unless a reviewer
> dispatched you and maintains the index.
>
> **Repo**: this plan targets the **BACKEND** repo at
> `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager`
> (planned at backend commit `fa9e529`). The plans directory lives in the frontend
> repo (`/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/plans/`).
>
> **Drift check (run first, in the backend repo)**:
> `git diff --stat fa9e529..HEAD -- src/routes/authRoutes.ts src/stores/auditLogStore.ts src/services/database.ts`
> If any listed file changed, compare "Current state" excerpts against live code;
> on mismatch treat as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (additive seed row + tests; no API shape change)
- **Depends on**: none
- **Category**: security
- **Planned at**: backend `fa9e529`, frontend `df3bf79`, 2026-07-03

## Why this matters

Failed login attempts currently leave **no audit trail**. `authRoutes.ts` logs
`LOGIN_FAILED` with the sentinel user id `'unknown'`, but `audit_log.user_id`
has a foreign key to `users` — no `'unknown'` row exists, so the insert throws.
Since commit `b08f6f1` that error is swallowed (so failed logins correctly
return 401 instead of 500) — which means the event is silently dropped. Result:
brute-force and credential-stuffing attempts are invisible in the Audit Log
widget the owner uses for security monitoring. After this plan, every
LOGIN_FAILED writes a row and appears in the widget's Sessions view.

## Current state

- `src/routes/authRoutes.ts` — login routes; logs the sentinel events:
  - line 34 (password login): `logAuditEvent('unknown', email, 'unknown', 'LOGIN_FAILED', 'auth', undefined, { email, reason: 'invalid_credentials' }, ip);`
  - line 68 (Google login, disallowed account): `logAuditEvent('unknown', identity.email, 'unknown', 'LOGIN_FAILED', 'auth', undefined, { email: identity.email, reason: 'google_account_not_allowed' }, ip);`
- `src/stores/auditLogStore.ts:87-113` — `logAuditEvent()` wraps `insertStmt.run(...)`
  in try/catch and on error only does
  `console.error('[audit] failed to record event:', ...)` — the swallow.
- `src/services/database.ts` — schema bootstrap; contains the
  `CREATE TABLE ... audit_log` definition with the `user_id` FK to `users`
  (locate the exact block with `grep -n "audit_log" src/services/database.ts`).
- Test harness (plan 024) lives at `tests/integration/` (jest;
  `npm run test:integration`). Model new tests on the existing auth
  integration spec in that directory.
- Convention: conventional-commit messages (`fix(audit): …`), prepared
  statements only, no ORM.

## Approach (decided — do not redesign)

Seed a permanent **system sentinel user** row (`id = 'unknown'`) at database
bootstrap, satisfying the FK with zero schema migration. SQLite cannot drop an
FK without a table rebuild, and making `user_id` nullable would ripple through
`hydrate()` and the widget. A seeded system row is additive and idempotent.

The sentinel user must be: inactive (cannot log in), no usable password hash,
role `'unknown'`, name `'Unknown / failed login'`. It exists purely as an FK
target.

## Commands you will need

| Purpose | Command (run in backend repo root) | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck/build | `npx tsc --noEmit` | exit 0 |
| All tests | `npm test` | all pass |
| Integration only | `npm run test:integration` | all pass |

## Scope

**In scope (only files you may modify):**
- `src/services/database.ts` (add idempotent sentinel-user seed after table creation)
- `src/stores/auditLogStore.ts` (keep the try/catch, but add a one-line comment that sentinel inserts are expected to succeed now)
- `tests/integration/` — ONE new test file, e.g. `tests/integration/failedLoginAudit.test.ts`

**Out of scope (do NOT touch):**
- `src/routes/authRoutes.ts` — the call sites are correct as-is; they will start working once the FK target exists. Do not change response codes or messages.
- `src/routes/auditRoutes.ts` and `src/services/ipGeoService.ts` — owned by plan 033 (may be edited concurrently by another agent).
- Any `users` table schema change; any password/auth logic.

## Git workflow

- Branch off backend `main`: `advisor/030-failed-login-audit`
- Conventional commits, e.g. `fix(audit): seed sentinel 'unknown' user so LOGIN_FAILED events persist`
- Do NOT push or open a PR without Ilya's explicit go (repo policy).

## Steps

### Step 1: Locate the users-table bootstrap and add the idempotent seed

In `src/services/database.ts`, find where tables are created/seeded. After the
`users` table exists, add:

```ts
// Sentinel FK target for audit events with no authenticated user
// (LOGIN_FAILED from unknown accounts). Inactive; can never log in.
database.prepare(`
    INSERT OR IGNORE INTO users (id, email, name, role, is_active, password_hash)
    VALUES ('unknown', 'unknown@system.invalid', 'Unknown / failed login', 'unknown', 0, '')
`).run();
```

Adapt column names to the actual `users` schema (inspect the existing
`CREATE TABLE users` block and any existing seed inserts in the same file and
match their column list exactly — if columns differ from the snippet, use the
real ones; the load-bearing values are `id='unknown'` and inactive).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Write the integration test

New file `tests/integration/failedLoginAudit.test.ts`, modeled structurally on
the existing auth integration spec from plan 024. Cases:

1. POST `/api/auth/login` with a valid-format but wrong-password body → expect
   HTTP **401** AND a new `audit_log` row with `action='LOGIN_FAILED'`,
   `user_id='unknown'`, and the attempted email inside `details`.
2. POST `/api/auth/login` for a nonexistent user → 401 AND a LOGIN_FAILED row.
3. Sentinel user cannot authenticate: POST `/api/auth/login` with
   `email='unknown@system.invalid'` and any password → 401.
4. Regression guard: the endpoint still returns 401 (not 500) — assert status
   explicitly in every case.

**Verify**: `npm run test:integration` → all pass, including the 4 new tests.

### Step 3: Annotate the swallow in `auditLogStore.ts`

Above the `catch` in `logAuditEvent()` (line ~104), add a comment: the catch
remains as a safety net, but sentinel LOGIN_FAILED inserts are expected to
succeed since the `'unknown'` user is seeded (plan 030). No logic change.

**Verify**: `npm test` → all suites pass.

## Test plan

Covered in Step 2 (4 cases). Pattern: existing plan-024 integration specs in
`tests/integration/`. Full-suite verification: `npm test` → exit 0.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; the 4 new tests exist and pass
- [ ] Manual probe (optional, live server): a wrong-password login attempt produces a row visible via `GET /api/dwellium/audit` (auth as a privileged user)
- [ ] `git status` shows only in-scope files modified
- [ ] Status row updated in frontend `plans/README.md`

## STOP conditions

- No `CREATE TABLE` for `users`/`audit_log` exists in `src/services/database.ts` (schema lives elsewhere) — report where you found it instead.
- The `users` schema has NOT NULL columns the seed can't satisfy without inventing semantics (e.g. mandatory tenant linkage).
- Step 2's test reveals the FK is NOT the reason rows are missing (i.e. inserts already succeed) — the finding may be stale; report evidence.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a user-management UI ever lists users, filter out `id='unknown'` (system row).
- Reviewer should scrutinize: seed idempotency (`INSERT OR IGNORE`) and that the sentinel truly cannot authenticate.
- Deferred: rate-limiting/lockout on repeated LOGIN_FAILED (separate finding; not planned).

## AMENDMENT 2026-07-04 (supersedes conflicting text above — from execution round 1)

Executor round 1 verified the diagnosis is correct but found two plan errors:

1. **Schema location**: `users`/`audit_log` are NOT in `src/services/database.ts`.
   They live in `src/services/dwelliumSchema.ts` (`initDwelliumSchema()`; `users`
   at :21, `audit_log` at :274). `database.ts:196` calls `initDwelliumSchema(db)`
   and `database.ts:74` sets `db.pragma('foreign_keys = ON')`. **Step 1's edit
   goes in `src/services/dwelliumSchema.ts`**, inside/after `initDwelliumSchema`'s
   users-table creation, matching any existing seed style in that file.
   Scope change: `src/services/dwelliumSchema.ts` is IN scope; `src/services/database.ts` is OUT.
2. **Role CHECK constraint**: `users.role` has
   `CHECK(role IN ('god','corporate','management','advisor','maintenance','agent','tenant'))` —
   `'unknown'` violates it. **Decision: the sentinel row uses `role='tenant'`**
   (lowest-privilege enum value) with `is_active=0`. Do NOT widen the CHECK.
   Note: this does not affect what the Audit Log displays — `audit_log.user_role`
   for LOGIN_FAILED events is the literal string `'unknown'` passed by
   `authRoutes.ts`, independent of the users row.
3. Worktree layout note: the package root is nested —
   `<worktree>/ai-dashboard369-file-manager/` — run all commands there.

Test case (3) in Step 2 stays as written (sentinel login attempt → 401) and now
also proves `is_active=0` blocks authentication despite the valid role.
