# 058 — Universal Shell persistence + small fixes

Branch: `feat/universal-shell-persistence` (from `origin/main` @ `07880ca`).
Scope: `qualia-shell/src/components/UniversalShell/**`, one new store, one holder, one test.
Out of scope: making the shell the app frame; migrating the ~11 remaining containers.

## Problem (verified 2026-09-17 by code read)

1. Active container is a bare `useState` (`UniversalShell.tsx:74`) — resets on close/reload.
2. Scratch pad uses ONE device-global key `dwellium-universal-scratch`
   (`adapters/WorkspaceHomeColumns.tsx:44`) — shared between accounts on a browser, never synced.
3. Widget tip promises drag-from-cabinet-to-canvas (`registry/widgetRegistry.ts:259`); no drag code exists.
4. Header shows the internal surface value ("ANY") to the user (`UniversalShell.tsx:109`).
5. Astra Portfolio adapter is placeholder text in all four columns but is offered in the switcher.
6. Empty-column copy is a dead end ("This container doesn't populate this column.").
7. No tests mention the shell.

## Phase 1 — per-user store (the persistence fix)

New `src/utils/universalShellStore.ts`, copied shape from `src/utils/gridLockStore.ts`
(do NOT invent a new pattern):

```ts
export interface UniversalShellState { activeContainerId: string; scratch: string }
export const UNIVERSAL_SHELL_KEY = 'dwellium:universalShell';       // + ':<uid>' | ':_anonymous'
export const LEGACY_SCRATCH_KEY = 'dwellium-universal-scratch';     // read once for adoption; NEVER written or removed
export const universalShellStore;                                   // withSync(createLocalStorageStore({key: resolveKey, deserializer, defaultValue}), { objectType: 'universalShell', holder: universalShellUserIdHolder, resolveKey })
export function setUniversalShellState(patch: Partial<UniversalShellState>): void;
export function useUniversalShellState(): UniversalShellState;      // single-writer identity hook first, then useSyncExternalStore
```

- Add `universalShellUserIdHolder` to `src/lib/perUserIdentity.ts` AND to `ALL_HOLDERS`.
- Deserializer: bad JSON → default. Empty per-user key → `scratch` adopts the legacy
  global value once (data-protection rule: no user note is ever lost or deleted).
- Default `{ activeContainerId: '', scratch: '' }`; server snapshot = default (SSR-safe,
  no init-time `localStorage`).

## Phase 2 — wire the shell to the store

- `UniversalShell.tsx`: replace `useState` with the store. Precedence:
  `initialContainerId` prop (if visible) → stored id (if still visible to this role) → first adapter.
  A stored id the role can no longer see must fall back silently, not render empty.
- `WorkspaceHomeColumns.tsx` `ScratchPadHome`: read/write `scratch` through the store;
  delete the local `SCRATCH_KEY` constant + `useEffect` loader.

## Phase 3 — small fixes (all of them)

- Tip (`widgetRegistry.ts:259`): describe what the shell really does
  ("Switch containers in the header — your notes and last container are remembered.").
- Header: drop the raw surface badge when `surface === 'any'`; otherwise show a readable
  label ("Strata" / "Astra"), not upper-cased enum text.
- Hide Astra: remove `astraPortfolioAdapter` from `ADAPTER_REGISTRY` with a `ponytail:`
  comment naming the re-enable condition (real data). Keep the adapter file.
- Empty column copy → "Nothing here for this container yet — pick another container above."

## Phase 4 — one test file

`src/test/universalShellPersistence.test.tsx` (vitest + RTL; call `universalShellStore.reset()`
and `localStorage.clear()` in `beforeEach`; mock fetch BY URL if `UserProvider` is mounted — see
`docs/code.md` One Save entry):

1. select a container → unmount → remount → same container active.
2. scratch text survives remount.
3. user A's scratch is not visible to user B (different holder id → different key).
4. legacy `dwellium-universal-scratch` is adopted when the per-user key is empty, and the legacy key is left intact.
5. stored id that is no longer visible falls back to the first adapter.
6. Astra is absent from the switcher; header has no "ANY".

## Phase 5 — gate + live proof

- `cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs`
- Live browser pass with screenshots: pick container + type note → reload → both restored;
  close window + reopen → restored. Report only what was observed.
- Add a `docs/code.md` entry (error / root cause / fix / prevention).
- Commit on the feature branch. NO push, NO PR until Ilya says so.
