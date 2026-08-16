# Plan 025: Decouple the shared per-user-id holder to eliminate the #185 render-loop class

> **Executor instructions**: Follow step by step; run every verification command and
> confirm the expected result before advancing. Honor STOP conditions. Update this
> plan's row in `plans/README.md` when done. All verification runs on the **Mac**
> (the Linux sandbox lacks the Vite/vitest native binaries; `tsc` works there).
>
> **Drift check (run first)**:
> `cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec" && git diff --stat 730c82a..HEAD -- qualia-shell/src/utils/integrationsStore.ts qualia-shell/src/lib qualia-shell/src/hooks qualia-shell/src/components/Shell/HalocronOS.tsx`
> If in-scope files changed, compare against "Current state" before proceeding.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the per-user scoping of ~15 stores; a mistake mis-scopes a
  user's data — so it is gated behind the gate + a new regression test)
- **Depends on**: none
- **Category**: tech-debt / correctness
- **Planned at**: commit `730c82a`, 2026-07-02

## Why this matters

On 2026-07-02 a deploy (`dbcfe00`) crashed production with React error #185 (infinite
render loop). Root cause (logged as `FUCKUPS.md` F-015): a single module-level object,
`integrationsUserIdHolder`, is **aliased** by 7+ stores
(`llmUsageUserIdHolder = integrationsUserIdHolder`, and the same for `goals`,
`morningBrief`, `agentContext`, `artifacts`, `activation`, `costKpi`), and **multiple
components write `user.id` into it during render**. When two writers put different values
into the one shared object within a single render pass, every dynamic-key store keyed on
it invalidates its cache on each `getSnapshot()`, `useSyncExternalStore` sees a new
snapshot every check, and React loops.

The incident was mitigated by splitting the integrations *vault* onto a private
`integrationsOwnerIdHolder`, but the shared alias object still exists and still has
multiple render-time writers. This plan removes the shared-mutable-holder class of bug
structurally: each per-user store gets its **own** holder, and a single hook owns writing
`user.id` into all of them from one place. After this, adding a new per-user store or a
new component cannot re-introduce the loop.

## Current state

Frontend: `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell`.

- `src/utils/integrationsStore.ts:25` — `export const integrationsUserIdHolder = { current: null }`
  with a header comment warning that its value MUST stay the raw `user.id` because many
  stores alias it. `integrationsOwnerIdHolder` (the private vault holder) is separate and
  already correct — **leave it alone**.
- Stores that alias the shared holder (each has a line like
  `export const <name>UserIdHolder = integrationsUserIdHolder; // shared identity`):
  - `src/lib/llmUsageStore.ts:51`
  - `src/lib/goalsStore.ts:48`
  - `src/lib/morningBriefStore.ts:33`
  - `src/lib/costKpiStore.ts:23`
  - `src/lib/agentContextStore.ts:22`
  - `src/lib/activationStore.ts:81`
  - `src/lib/artifactStore.ts:42`
  (Confirm the full set with:
  `grep -rn "= integrationsUserIdHolder" src/lib`.)
- Render-time writers of `integrationsUserIdHolder.current` /
  `<alias>UserIdHolder.current` (confirm with
  `grep -rn "UserIdHolder.current *=" src | grep -v test | grep -v OwnerIdHolder`):
  `src/hooks/useIntegrations.ts`, `src/components/Shell/HalocronOS.tsx`,
  `src/lib/goalsStore.ts` (a `useSyncGoalsUser`-style hook), `morningBriefStore.ts`,
  `agentContextStore.ts`, `activationStore.ts`, `artifactStore.ts`, plus several
  component-level writers (`ThoughtWeaver.tsx`, `ARAConsole.tsx`, etc. — these write
  *other* holders too; only the ones aliasing `integrationsUserIdHolder` matter here).
- The store factory that reacts to holder changes:
  `src/utils/createLocalStorageStore.ts:162-171` — dynamic-key stores invalidate the
  cache when the resolved key changes on any `getSnapshot()`.
- Precedent for a correct decoupling already in the tree: the vault split in
  `integrationsStore.ts` (`integrationsOwnerIdHolder`) and its loop-guard test in
  `src/test/integrationsPersistence.test.ts` ("vault snapshot is immune to shared-alias
  holder churn (#185 loop guard)"). Model the new regression test after it.

Conventions: SSR-safe module stores use `useSyncExternalStore` + a module holder written
during render BEFORE the store is read; `createLocalStorageStore` supports a dynamic `key`
resolver. Tests reset holders in `beforeEach` (`.reset()` convention). The gate is
`Scripts/gate.sh` (tsc + vitest + 2 builds + PII + SSR smoke), run on the Mac.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd qualia-shell && npx tsc -b` | exit 0 |
| Targeted tests | `cd qualia-shell && npx vitest run src/test/integrationsPersistence.test.ts src/test/holderIsolation.test.ts` | all pass |
| Full gate (Mac) | `cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec" && bash Scripts/gate.sh` | GATE GREEN |

## Scope

**In scope:**
- The 7 ALIAS stores: `src/lib/llmUsageStore.ts`, `goalsStore.ts`, `morningBriefStore.ts`,
  `costKpiStore.ts`, `agentContextStore.ts`, `activationStore.ts`, `artifactStore.ts`.
- **SCOPE EXPANSION (2026-07-02, after executor STOP):** the 4 DIRECT-READER stores that
  read `integrationsUserIdHolder.current` inside their own `resolveKey()` (not via an alias
  export) are ALSO in scope — leaving them on the shared holder would defeat the plan's
  purpose. They are byte-safe to migrate (each reads the same raw `user.id`; storage keys
  unchanged): `src/lib/workspacesStore.ts` (`resolveKey` at :69, and a sync registration
  passing `holder: integrationsUserIdHolder` at :166 — give it the new holder too),
  `src/lib/tagsStore.ts` (:23), `src/lib/subscriptionsStore.ts` (:25),
  `src/lib/halocronKnowledgeGraphStore.ts` (:59, plus its sync registration at :166 passing
  `holder: integrationsUserIdHolder` — give it the new holder too). Each of these 4 gets its
  OWN holder in `perUserIdentity.ts` and reads it in `resolveKey()`.
- A new `src/lib/perUserIdentity.ts` (create) — owns ALL 11 holders + `setPerUserIdentity()`
  + the `usePerUserIdentity()` single-writer hook. `setPerUserIdentity(userId)` assigns
  `userId` to all 11.
- The hooks/components that currently write these holders' `.current` during render, to
  route through the new single writer. NOTE: `workspacesStore`, `tagsStore`,
  `subscriptionsStore`, `halocronKnowledgeGraphStore` have their OWN sync hooks that write
  the shared holder — repoint those to their new holder (or to `setPerUserIdentity`).
- `src/test/holderIsolation.test.ts` (create) — cover at least one alias store AND one of
  the 4 direct-reader stores in the churn-guard assertion.

**AUTHORITATIVE COMPLETE SCOPE (2026-07-02, from a full `src`-wide grep — this is
exhaustive; do NOT stop again for a newly-found store, they are all listed here).**
The shared `integrationsUserIdHolder` is consumed by **12 stores** + **2 render-time
writers** + **2 sync registrations**. Migrate ALL of them to per-store holders in
`perUserIdentity.ts`:

- 7 ALIAS stores (each `export const X = integrationsUserIdHolder;` → own holder):
  `agentContextStore.ts:22`, `llmUsageStore.ts:51`, `goalsStore.ts:48`,
  `morningBriefStore.ts:33`, `costKpiStore.ts:23`, `activationStore.ts:81`,
  `artifactStore.ts:42`.
- 5 DIRECT-READER stores (read `integrationsUserIdHolder.current` in `resolveKey()` →
  own holder): `workspacesStore.ts:69`, `tagsStore.ts:23`, `subscriptionsStore.ts:25`,
  `halocronKnowledgeGraphStore.ts:59`, **and `src/components/Scribe/kbStore.ts:47`**
  (storage key `scribe-kb:${uid}` — under `src/components/`, not `src/lib/`).
- 2 SYNC REGISTRATIONS passing `holder: integrationsUserIdHolder` (→ pass the matching
  new holder): `workspacesStore.ts:114`, `halocronKnowledgeGraphStore.ts:166`.
- 2 RENDER-TIME WRITERS (route through the single `usePerUserIdentity()`):
  `useIntegrations.ts:43`, `HalocronOS.tsx:275`.
- 1 UNUSED IMPORT to delete: `src/components/Scribe/scribeUtils.ts:5` imports
  `integrationsUserIdHolder` but never reads `.current` — remove it from that import.
- COMMENT-ONLY mentions (leave as-is or update text; NO code change needed):
  `workspaceUiStore.ts:9`, `honchoBackgroundRunner.ts:72,76`, doc comments in
  `useIntegrations.ts:33`, `llmUsageStore.ts:15`, `goalsStore.ts:8`, `costKpiStore.ts:9`.

So `perUserIdentity.ts` defines **12 holders**; `setPerUserIdentity(userId)` assigns
`userId` to all 12; `usePerUserIdentity()` calls it once during render from the two
writer sites. Every store's storage-key string stays byte-identical (each still receives
the raw `user.id`).

**Goal:** ZERO references to `integrationsUserIdHolder` remain outside
`integrationsStore.ts` (which keeps the symbol only for the private-vault back-compat
comment/path) and `perUserIdentity.ts`. Verify:
`grep -rn "integrationsUserIdHolder" src --include="*.ts" --include="*.tsx" | grep -v OwnerIdHolder | grep -v "/test/" | grep -v "integrationsStore.ts" | grep -v "perUserIdentity.ts"`
→ matches ONLY comment-only lines (no `import`, no `.current`, no `= integrationsUserIdHolder`, no `holder: integrationsUserIdHolder`).

**Out of scope:**
- `integrationsOwnerIdHolder` and the integrations vault (already correct — do NOT merge
  it back into the shared holder).
- The dynamic-key resolvers' storage-key *format* (namespaces must stay byte-identical so
  existing users keep their data).
- Any store NOT aliasing `integrationsUserIdHolder` (e.g. `savedLayoutsUserIdHolder` in
  WindowContext is independent — leave it).

## Git workflow

- Branch: `advisor/025-decouple-holder`.
- Conventional commits (`refactor(stores): …`).
- Do NOT push without Ilya's go.

## Steps

### Step 1: Create independent holders + one writer

Create `src/lib/perUserIdentity.ts` exporting one holder object per aliasing store
(`llmUsageUserIdHolder`, `goalsUserIdHolder`, …), each `{ current: null as string | null }`,
independent objects (NOT aliases of one another). Export a single function
`setPerUserIdentity(userId: string | null)` that assigns `userId` to ALL of them, and a
hook `usePerUserIdentity()` that reads `UserContext` and calls `setPerUserIdentity` once
during render. Because every holder is set to the *same* `user.id` from one call site,
two writers can never disagree.

**Verify**: `npx tsc -b` → exit 0.

### Step 2: Point each store at its own holder

In each store file, replace `export const <name>UserIdHolder = integrationsUserIdHolder;`
with a re-export of the matching holder from `perUserIdentity.ts`
(`export { <name>UserIdHolder } from './perUserIdentity';`). The store's `resolveKey()`
must read the same holder. Keep the storage-key string identical.

**Verify**: `grep -rn "= integrationsUserIdHolder" src/lib` → no matches. `npx tsc -b` → 0.

### Step 3: Route render-time writers through the single writer

Find every component/hook that wrote `<alias>UserIdHolder.current = user?.id` during
render (grep from "Current state"). Replace those writes with a single
`usePerUserIdentity()` call at the top of the component/hook. Remove the now-redundant
per-alias assignments. Do not remove writers of unrelated holders.

**Verify**: `grep -rn "UserIdHolder.current *=" src --include=*.ts --include=*.tsx | grep -v test | grep -v OwnerIdHolder | grep -v perUserIdentity` → only the single writer in `perUserIdentity.ts` remains (plus any genuinely unrelated holders you did not touch — list them in your report).

### Step 4: Regression test — shared-alias churn is impossible

Create `src/test/holderIsolation.test.ts` modeled on the `#185 loop guard` test in
`integrationsPersistence.test.ts`: assert that the holders exported from
`perUserIdentity.ts` are distinct objects; that `setPerUserIdentity('u1')` sets all of
them to `'u1'`; and that a dynamic-key store keyed on one of them returns a stable
snapshot reference across repeated `getSnapshot()` calls while another holder is written
(i.e. writing `goalsUserIdHolder` does not invalidate `llmUsageStore`'s snapshot).

**Verify**: `npx vitest run src/test/holderIsolation.test.ts` → all pass.

### Step 5: Green gate

**Verify**: `bash Scripts/gate.sh` (on the Mac) → `GATE GREEN`. In particular, vitest
count must not drop and the SSR smoke test must stay clean (holders must not read
`window`/`localStorage` at module load).

## Test plan

- New `src/test/holderIsolation.test.ts`: distinct-objects, single-writer-sets-all,
  cross-holder-churn-does-not-invalidate (the #185 regression).
- Existing `integrationsPersistence.test.ts` must still pass unchanged.
- Model after that file's structure.

## Done criteria

- [ ] `grep -rn "= integrationsUserIdHolder" src/lib` → no matches
- [ ] Exactly one render-time writer of the per-user holders (in `perUserIdentity.ts`)
- [ ] `src/test/holderIsolation.test.ts` exists and passes (≥3 cases incl. the churn guard)
- [ ] `npx tsc -b` exits 0
- [ ] `bash Scripts/gate.sh` → GATE GREEN, vitest count ≥ prior
- [ ] Storage-key strings unchanged (existing users keep data) — spot-check one store's
      `resolveKey()` output format against its pre-change form
- [ ] `plans/README.md` status row updated

## STOP conditions

- The grep finds an aliasing store NOT listed here — add it to your report and confirm
  scope before editing.
- A store's `resolveKey()` produces a different storage-key string after the change
  (would strand user data) — STOP.
- A component writes the holder inside an effect/callback (not during render) for a
  deliberate reason — report it; do not blindly move it into the render-time writer.
- Gate goes red on the SSR smoke test (a holder touched a browser global at load) — STOP
  and revert that holder to lazy access.

## Maintenance notes

- New per-user stores must import their holder from `perUserIdentity.ts` and rely on
  `usePerUserIdentity()` — never create a fresh shared-mutable holder or alias.
- Reviewer should confirm there is exactly one writer and that no storage-key format
  changed.
- The integrations vault (`integrationsOwnerIdHolder`) stays separate by design (it is
  keyed by stable email, not raw `user.id`); do not consolidate it in.
