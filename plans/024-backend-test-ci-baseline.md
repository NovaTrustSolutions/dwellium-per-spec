# Plan 024: Establish a backend test + CI baseline (auth / objects / audit)

> **Executor instructions**: Follow step by step; run every verification command and
> confirm the expected result before advancing. Honor STOP conditions — do not
> improvise. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `cd /Users/ilyaklipinitser/dwellium-backend && git diff --stat 6695bd4..HEAD -- ai-dashboard369-file-manager/src/routes ai-dashboard369-file-manager/src/services ai-dashboard369-file-manager/package.json`
> If in-scope files changed, compare against "Current state" before proceeding.

## Status

- **Priority**: P1 (verification baseline — unblocks all other backend plans)
- **Effort**: L
- **Risk**: LOW (adds tests + CI; touches no runtime route logic)
- **Depends on**: none (but plans 023 and 026 become safe to verify once this lands)
- **Category**: tests
- **Planned at**: commit `6695bd4` (backend), 2026-07-02

## Why this matters

The backend (Express + better-sqlite3, the source of truth for auth, the One Save
object store, and the audit log) has ~17 test files for ~53 route files and **no CI
workflow**. Every backend change this session (Google login env, audit RBAC, logout
logging) shipped verified only by `tsc --noEmit` and manual curl. There is no
one-command way to know the money-path routes still work. This plan creates an
integration-test harness and a GitHub workflow so subsequent backend changes (plans 023,
026, and the OAuth spike 027) have a real safety net. Per the audit-playbook rubric, a
verification baseline floats to the top of the order.

## Current state

Backend repo: `/Users/ilyaklipinitser/dwellium-backend`, app in
`ai-dashboard369-file-manager/`.

- `ai-dashboard369-file-manager/package.json` — `"test": "jest"`; a `jest.config.*`
  exists. Confirm the exact test glob with `cat jest.config.*`.
- `ai-dashboard369-file-manager/tests/` — ~17 `*.test.ts` files; store-level, not
  route-level. `objectStore.test.ts` covers the store, not the HTTP route.
- Routes to cover first (money paths):
  - `src/routes/authRoutes.ts` — `POST /api/auth/login`, `POST /api/auth/google`,
    `POST /api/auth/logout`, `GET /api/auth/me`.
  - `src/routes/objectRoutes.ts` — One Save CRUD under `/api/objects`; ownership is
    enforced by `obj.ownerId === req.user.id`.
  - `src/routes/auditRoutes.ts` — `GET /api/dwellium/audit`; non-privileged users may
    read only their own trail (RBAC via `hasMinRole(req.user.role, 'corporate')`).
- `src/services/authMiddleware.ts` — `authenticate` accepts a 96-hex Bearer session
  token; when `AUTH_ENABLED !== 'true'` it falls back to a dev user. Tests should set
  `AUTH_ENABLED=true` and mint real sessions, OR exercise the dev-fallback deliberately.
- The Express app is assembled in `src/app.ts`. Check whether it exports the `app`
  instance (needed for supertest). If `app.ts` only calls `.listen()`, Step 1 extracts
  the app into an exported factory.

Conventions: TypeScript, `npx tsc --noEmit` is the current gate. better-sqlite3 opens a
DB file from an env-configured dir (`DWELLIUM_DATA_DIR` etc., see `deploy/cloud-run.sh`);
tests must point these at a temp dir so they never touch real data.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install test deps | `cd ai-dashboard369-file-manager && npm install -D supertest @types/supertest` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Run tests | `npm test` | all pass |
| Run one suite | `npm test -- auth` | the auth suite passes |

## Scope

**In scope:**
- `ai-dashboard369-file-manager/jest.config.js` — ADDED TO SCOPE 2026-07-02 after the first
  execution attempt (commit `b5e7b59` on branch `advisor/024-backend-test-baseline`) hit a
  real, reproduced blocker: importing the full `app.ts` pulls in `jsdom` (via
  `scribeDndRoutes`) → `@exodus/bytes` which is ESM (`"type":"module"`), and `ts-jest`'s
  default `transformIgnorePatterns` ignores `node_modules`, so it throws
  `SyntaxError: Unexpected token 'export'` at `@exodus/bytes/encoding-lite.js:1` and 0 tests
  run. Fix: add a `transformIgnorePatterns` that whitelists the ESM dep(s) for transpilation,
  e.g. `transformIgnorePatterns: ['/node_modules/(?!(@exodus)/)']`. If a NEW ESM package
  surfaces in the next error, add it to the whitelist group and retry (up to ~2 iterations).
  If a THIRD distinct ESM package appears or a non-ESM error surfaces, STOP and report — do
  not spiral. Keep existing passing suites (`tests/auth.test.ts`, `tests/objectStore.test.ts`)
  green after the change.
- **RESOLVED APPROACH (2026-07-02, after 2 attempts proved whitelisting spirals through
  `@exodus/bytes → parse5 → entities → …` — jsdom's whole tree is ESM): do NOT transpile
  jsdom; STUB it.** In `jest.config.js`: (1) KEEP a `transform` routing `.ts` AND `.js`
  through `ts-jest` with `allowJs: true` (so any `.js` down-levels); (2) add
  `moduleNameMapper: { '^jsdom$': '<rootDir>/tests/helpers/jsdomStub.ts' }`; (3) create
  `tests/helpers/jsdomStub.ts` exporting a no-op `JSDOM` class so
  `scribeDndRoutes.ts`'s `import { JSDOM } from 'jsdom'` resolves without loading the real ESM
  tree. The integration suites never call the scribe route → the stub is never invoked;
  existing suites don't import jsdom → unaffected. This is the crisp, deterministic fix — no
  more whitelist iteration.
- **RUNTIME NOTE:** the prebuilt `better-sqlite3` is compiled for an older Node ABI; run the
  suites under Node 22 (`/Users/ilyaklipinitser/.nvm/versions/node/v22.22.2/bin` on PATH) so
  the native module loads. The new `backend-test.yml` pins Node 22 + does `npm ci` (fresh
  native build), so CI is consistent.
- `ai-dashboard369-file-manager/src/app.ts` — only if it must be refactored to export an
  app factory (Step 1). (First attempt found it already exports the app with a guarded
  `.listen()`, so NO refactor was needed — leave it untouched.)
- `ai-dashboard369-file-manager/tests/integration/` (create) — new integration suites.
- `ai-dashboard369-file-manager/tests/helpers/` (create) — test harness (temp DB, app
  bootstrap, session minting).
- `ai-dashboard369-file-manager/package.json` — devDeps + a `test:integration` script.
- `.github/workflows/backend-test.yml` (create, at the backend repo root).

**In scope (added 2026-07-02 — a REAL BUG the suite caught):**
- `ai-dashboard369-file-manager/src/stores/auditLogStore.ts` — the integration suite
  surfaced a genuine production defect: `logAuditEvent()` runs `insertStmt.run(...)` with NO
  try/catch, and `audit_log.user_id` has a foreign key. A `LOGIN_FAILED` event logs the
  sentinel user `'unknown'` (authRoutes.ts:34, and the google-not-allowed path ~:68), which
  has no `users` row → `SQLITE_CONSTRAINT_FOREIGNKEY` throws synchronously → the route's catch
  returns **500 instead of 401**, AND no failed-login is ever recorded (audit gap). Fix: wrap
  the `insertStmt.run(...)` in `logAuditEvent` in try/catch that logs the failure to
  `console.error` and swallows it — audit-write failures must NEVER break request flow. This
  mirrors what `src/services/auditMiddleware.ts:89` already does. Do NOT relax the FK or the
  401 assertion. After the fix, `tests/integration/auth.test.ts` bad-credentials test must
  pass (401) and all 21 integration tests + 18 pre-existing tests go green.

**Out of scope:**
- OTHER route runtime logic — do NOT change how any route behaves beyond the audit-store
  try/catch above. If a test reveals a FURTHER bug,
  record it and STOP; a behavior fix is a separate plan.
- The frontend repo.
- Rewriting the existing 17 tests.

## Git workflow

- Branch: `advisor/024-backend-test-baseline`.
- Conventional commits (`test(backend): …`, `ci(backend): …`).
- Do NOT push or open a PR without Ilya's go.

## Steps

### Step 1: Ensure the Express app is importable without listening

Read `src/app.ts`. If it constructs the app and immediately `.listen()`s at module load,
refactor so the app is built by an exported function (e.g. `export function createApp()`)
and `.listen()` runs only under a `if (require.main === module)` / a dedicated
`server.ts` entrypoint. Behavior must be identical when run normally.

**Verify**: `npx tsc --noEmit` → exit 0; `node -e "require('./dist/app')"` after a build,
or confirm by reading that `createApp` is exported and `.listen` is guarded.

### Step 2: Build a test harness (temp DB + app + session minting)

Create `tests/helpers/harness.ts` that: sets `DWELLIUM_DATA_DIR` (and any sibling data-dir
env vars) to a freshly-created temp directory before importing the app; sets
`AUTH_ENABLED=true`; exposes `makeApp()` returning the supertest-wrapped app; and exposes
a helper to create a user + a valid session token directly via the auth service/store
(so tests can authenticate without going through Google). Tear down the temp dir after.

**Verify**: a trivial `tests/integration/harness.smoke.test.ts` that boots the harness and
asserts `GET /api/health` (or the app's health route) returns 200. `npm test -- harness` → pass.

### Step 3: Auth route integration suite

`tests/integration/auth.test.ts` covering: login with valid credentials returns a token +
user; login with bad credentials returns 401; `GET /api/auth/me` with a valid Bearer
returns the user; `/me` with a garbage token returns 401; `POST /api/auth/logout` with a
valid session returns `{ success: true }` and writes a `LOGOUT` audit entry (assert via
the audit store or `GET /api/dwellium/audit`).

**Verify**: `npm test -- auth` → all pass.

### Step 4: Object-store ownership suite

`tests/integration/objects.test.ts` covering: user A `PUT`s an object then `GET`s it back;
user B `GET`ting user A's object id returns 404/403 (never A's data); user B `PUT`ting to
A's id cannot overwrite A's object; `DELETE` respects ownership. This pins the per-user
isolation the whole persistence model depends on.

**Verify**: `npm test -- objects` → all pass.

### Step 5: Audit RBAC suite

`tests/integration/audit.test.ts` covering: a non-privileged user `GET /api/dwellium/audit`
receives only their own entries; a non-privileged user requesting `?user_id=<other>` gets
403; a `corporate`+ user can list across users; the 500 path returns the generic message
(pairs with plan 023 Step 2 if that has landed — otherwise assert current behavior and
note the coupling).

**Verify**: `npm test -- audit` → all pass.

### Step 6: GitHub Actions workflow

Create `.github/workflows/backend-test.yml` (backend repo root) triggering on push + PR to
paths under `ai-dashboard369-file-manager/**`: checkout, Node 22 setup, `npm ci` in the app
dir, `npx tsc --noEmit`, `npm test`. No deploy steps.

**Verify**: `npx tsc --noEmit` still 0; the workflow YAML parses (e.g. `yamllint` if
available, or careful read). Do not trigger a run; leave dispatch to the operator.

## Test plan

The suites above ARE the test plan. Target: harness smoke + auth (≥5 cases) + objects
(≥4) + audit (≥4). Model structure after the existing `tests/objectStore.test.ts` for
setup/teardown idioms; use supertest for HTTP.

## Done criteria

- [ ] `npm test` exits 0 with the new integration suites present and passing
- [ ] `npm test -- objects` proves user B cannot read/write user A's objects
- [ ] `.github/workflows/backend-test.yml` exists and runs tsc + tests on backend paths
- [ ] `npx tsc --noEmit` exits 0
- [ ] No route runtime logic changed (`git diff` on `src/routes/**` shows only Step-1
      app-factory extraction, if any)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `app.ts` cannot be made importable without a large refactor (touches many modules) —
  report scope and stop; a minimal `server.ts` split may need its own plan.
- Any integration test reveals a real ownership/RBAC bypass — record the exact request
  and STOP (that is a security bug for a separate plan, not something to "fix while here").
- A data-dir env var is missed and a test writes to a real data directory — STOP and fix
  the harness isolation before continuing.
- Tests require secrets (e.g. a real Google token) — do not hardcode any; mock the
  verifier boundary instead.

## Maintenance notes

- Once green, wire this workflow as a required check before backend deploys.
- New routes should ship with an integration test; add that expectation to the backend
  README (see the DX finding — separate).
- The harness's session-minting helper is the seam most likely to break if the session
  token format changes; keep it in one file.
