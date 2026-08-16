# Plan 034: Audit Log widget — render locations + capability-based access (drop hardcoded emails)

> **Executor instructions**: Follow step by step; run every verification command.
> On any STOP condition, stop and report. Update this plan's row in
> `plans/README.md` when done.
>
> **Repo**: FRONTEND repo `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`,
> app in `qualia-shell/` (planned at `df3bf79`). All verification (vitest,
> build) runs on the Mac — the Linux sandbox can't run vitest here.
>
> **Drift check (run first)**:
> `git diff --stat df3bf79..HEAD -- qualia-shell/src/components/AuditLog/ qualia-shell/src/registry/widgetRegistry.ts qualia-shell/src/test/auditLogWidget.test.tsx`
> Mismatch with "Current state" → STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes an access gate; mitigated: server-side authz is the real boundary — plan 033 — and the widget keeps a hard fallback)
- **Depends on**: SOFT dependency on plan 033 (backend `location` field + `AUDIT_LOG_VIEWER_EMAILS`). This plan is written to be safe to build and merge BEFORE 033 deploys: the location column falls back to IP, and the access probe falls back to the email gate. Can run concurrently with 030/031/032/033 — zero shared files.
- **Category**: direction / tech-debt
- **Planned at**: frontend `df3bf79`, 2026-07-03

## Why this matters

Two gaps in the new Audit Log holocron (shipped `730c82a`). First, the owner
asked for "all the locations" — the table header already says "IP / Location"
but renders only raw IPs (`AuditLogWidget.tsx:212-214`); plan 033 adds a
`location` field server-side, and this plan renders it. Second, access is
hardcoded to `andy@dwellium.com` in TWO frontend places; granting the owner's
other accounts (two pending) means a code change + Netlify redeploy every time.
The real security boundary is the backend (it already 401/403s non-authorized
sessions — verified live 2026-07-03); the frontend should ask the backend
instead of duplicating an email list.

## Current state

- `qualia-shell/src/components/AuditLog/AuditLogWidget.tsx` (223 lines) —
  - line 24: `const ALLOWED_EMAILS = ['andy@dwellium.com'];`
  - lines 64-68: gate — `const allowed = ALLOWED_EMAILS.includes(email);`
  - lines 74-95: `load()` — fetches `${API_BASE}/api/dwellium/audit?limit=500`
    with `getAuthHeaders()`; maps 401/403 to an "error" state with an
    explanatory message; `AuditEntry` interface at lines 26-38 (no `location`).
  - lines 111-123: the "restricted" card rendered when `!allowed`.
  - lines 212-214: IP cell — `{e.ipAddress || '—'}`.
- `qualia-shell/src/registry/widgetRegistry.ts:60-69` — the `'audit-log'`
  entry with `restrictedToEmails: ['andy@dwellium.com']` (line 68). Per the
  interface docs at lines 38-44: catalog filtering is COSMETIC; the component
  must hard-gate; `HalocronOS.tsx:253` hides catalog entries by this field.
- `qualia-shell/src/test/auditLogWidget.test.tsx` (87 lines) — existing suite;
  line 85 asserts `reg.restrictedToEmails` equals `['andy@dwellium.com']`.
- Conventions: raw `useContext(UserContext)` (not `useUser()`) for
  test-resilience — the widget already follows this (line 66); inline styles;
  vitest + RTL; `.reset()` in beforeEach for factory stores (not used here).

## Approach (decided — do not redesign)

Replace "is my email on the hardcoded list" with **"can I actually read the
audit API"** (capability probe): the widget attempts the fetch for ANY signed-in
non-quick-access user whose registry entry was visible, and renders the
restricted card on 403. To avoid exposing the catalog entry to everyone,
`restrictedToEmails` stays but becomes a fallback list PLUS the new accounts —
sourced from ONE exported constant so there is a single place to edit:

- New file `qualia-shell/src/components/AuditLog/auditLogAccess.ts`:
  `export const AUDIT_LOG_CATALOG_EMAILS = ['andy@dwellium.com'] as const;`
  with a comment: cosmetic catalog visibility only; real authz = backend
  `AUDIT_LOG_VIEWER_EMAILS` (plan 033); add emails here so the tile shows up
  for those accounts.
- Widget: drop its private `ALLOWED_EMAILS` gate. New behavior: if there is no
  signed-in user → restricted card. Otherwise always attempt `load()`; map
  **403** to the restricted card (message: "This account isn't on the audit-log
  viewer list (backend `AUDIT_LOG_VIEWER_EMAILS`)."), keep the existing 401
  quick-access message, keep all other states.
- Location cell: render `e.location ?? e.ipAddress ?? '—'`; when both exist
  render `location` with the IP in a muted `<span>` after it. Add
  `location?: string | null` to the widget's `AuditEntry` interface.

## Commands you will need

| Purpose | Command (run in `qualia-shell/`) | Expected |
|---|---|---|
| Typecheck | `npx tsc -b` | exit 0 |
| Tests | `npx vitest run src/test/auditLogWidget.test.tsx` | all pass |
| Full suite | `npx vitest run` | all pass (~1634+) |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 (NEVER `npx vite build` — silent no-op) |

## Scope

**In scope:**
- `qualia-shell/src/components/AuditLog/AuditLogWidget.tsx`
- `qualia-shell/src/components/AuditLog/auditLogAccess.ts` (create)
- `qualia-shell/src/registry/widgetRegistry.ts` — ONLY line 68's array value (→ `[...AUDIT_LOG_CATALOG_EMAILS]`) + its import
- `qualia-shell/src/test/auditLogWidget.test.tsx`

**Out of scope (do NOT touch):**
- `qualia-shell/src/components/Shell/HalocronOS.tsx` — the catalog filter at line 253 already consumes `restrictedToEmails` generically.
- Backend repo (plan 033 owns it, possibly concurrent).
- Any other registry entry; `UserContext.tsx`; `lib/perUserIdentity.ts`.

## Git workflow

- Branch: `advisor/034-audit-widget-access` off `main`
- Commits: `feat(audit-log): render server-resolved locations` /
  `refactor(audit-log): capability-based access via backend 403 (single catalog-email constant)`
- Do NOT push without Ilya's explicit go.

## Steps

### Step 1: Create `auditLogAccess.ts` and repoint the registry

Create the constant file as specified in Approach. In `widgetRegistry.ts`,
import it and change line 68 to `restrictedToEmails: [...AUDIT_LOG_CATALOG_EMAILS],`.
No other registry lines change.

**Verify**: `npx tsc -b` → exit 0.

### Step 2: Rework the widget gate

In `AuditLogWidget.tsx`: delete the `ALLOWED_EMAILS` const (line 24) and the
`allowed` derivation (line 68); gate only on "signed-in user exists"
(`userCtx?.user` truthy). In `load()`, split the 401 and 403 branches: 401
keeps the current quick-access message; 403 sets a new state kind
`{ kind: 'forbidden' }` rendering the existing restricted-card JSX with the
new backend-allowlist message. `useEffect` now depends on the user id.

**Verify**: `npx tsc -b` → exit 0.

### Step 3: Render locations

Add `location?: string | null` to the widget's `AuditEntry`. Update the cell at
(old) lines 212-214 per Approach. Include `e.location` in the filter-query
haystack (line ~106 array).

**Verify**: `npx tsc -b` → exit 0; `npm run lint` → exit 0.

### Step 4: Update tests

In `src/test/auditLogWidget.test.tsx` (keep existing structure/mocks):

1. Update the line-85 assertion to expect `AUDIT_LOG_CATALOG_EMAILS`.
2. No user signed in → restricted card.
3. Signed-in user + fetch resolves 403 → restricted card with the allowlist message; fetch WAS called.
4. Signed-in user + 200 with entries `[{..., ipAddress:'8.8.8.8', location:'Mountain View, California, US'}]` → location text rendered; entry with `location: null` → IP rendered.
5. 401 → the quick-access message (existing behavior, now asserted).

**Verify**: `npx vitest run src/test/auditLogWidget.test.tsx` → all pass;
then `npx vitest run` → full suite green.

## Test plan

Covered in Step 4 (5 cases), modeled on the file's existing tests. Full-suite +
build gates in Done criteria.

## Done criteria

- [ ] `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build` all exit 0 (on the Mac)
- [ ] `grep -rn "andy@dwellium.com" qualia-shell/src/` → matches ONLY in `auditLogAccess.ts` (single source of truth)
- [ ] `grep -n "location" qualia-shell/src/components/AuditLog/AuditLogWidget.tsx` shows interface field + render
- [ ] `git status` shows only the 4 in-scope files
- [ ] Status row updated in `plans/README.md`

## STOP conditions

- The widget/test files don't match the quoted line numbers or excerpts (drift).
- Removing the email gate would make the widget fetch for QUICK-ACCESS (non-backend) sessions in a way that changes any other component's behavior — report before proceeding (expected: it only produces the handled 401).
- Full vitest run has failures OUTSIDE the audit-log spec after your change.

## Maintenance notes

- Once plan 033 deploys with `AUDIT_LOG_VIEWER_EMAILS`, granting a new viewer = backend env change + adding the email to `AUDIT_LOG_CATALOG_EMAILS` for tile visibility (one constant, no logic).
- Reviewer: confirm the 403 path can't loop retries and the restricted card copy doesn't leak internal env names to non-owners... (it names the env var — acceptable for this single-operator app; flag if the audience widens).
- Deferred: pagination past `limit=500` (small; revisit when the log grows).
