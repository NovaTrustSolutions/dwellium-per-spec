# Implementation Spec — Fix #2 (Hermes sidebar visibility) & Fix #3 (per‑user ingestion handle isolation)

**Status:** Ready to implement
**Author:** review synthesis (Cowork), 2026‑06‑15
**Branch:** `feat/assessment-sweep`
**Scope:** Two defects surfaced by the 5‑lane production‑readiness review. Each is independent and lands in disjoint files, so they can be implemented and reviewed separately.

**Environment note for the implementer:** the Cowork Linux sandbox can run `tsc` and node scripts but **cannot** run `vitest` or the Vite/React‑Router build (the Mac‑installed `node_modules` lacks the Linux `rollup`/`esbuild` native binaries). Type‑check in the sandbox; run `vitest` + builds on the Mac.

---

## Fix #2 — `widget:hermes` is invisible in the classic sidebar for non‑god users

### Problem
The new **Hermes** widget appears in the Halocron OS launcher (which reads `WIDGET_REGISTRY` directly, ungated) but **not** in the classic Dwellium sidebar for any non‑`god` user (corporate / management / advisor / etc.). Andy and Archi are `god`, so they see it — but real Google‑auth production users won't.

### Root cause
The sidebar filters every dock item through a permission check:

- `src/components/Sidebar/Sidebar.tsx` — `dockItems.filter(item => can(\`widget:${item.component}\`) …)` at **L622, L777, L1129**.
- `src/context/PermissionsContext.tsx` — `can()` (**L63–72**):
  ```ts
  if (role === 'god') return true;          // god short‑circuit
  if (loading) return true;                 // default‑allow during load (anti‑flicker)
  return permissions[key] !== false && permissions[key] !== undefined
      ? permissions[key]
      : false;                              // ← UNKNOWN key ⇒ false for non‑god
  ```
- Backend `dwellium-backend/ai-dashboard369-file-manager/src/services/permissionsService.ts` — the permission map is built from `ALL_PERMISSION_KEYS` (**L14+**) via `getDefaultPermissions(role)` (**L370+**). **`widget:hermes` is not in `ALL_PERMISSION_KEYS`**, so it is never present in a non‑god user's map → `can('widget:hermes')` returns `false`.

This is a **class bug**: `widget:honcho`, and several other AI widgets, are likewise absent from `ALL_PERMISSION_KEYS` and so are also sidebar‑invisible to non‑god users today. Hermes inherits it.

### Decision required
Pick **Option A** (targeted, lowest blast radius — recommended for a production cut) or **Option B** (class fix, broader semantics change).

#### Option A — targeted backend grant (recommended)
Make `widget:hermes` a real, granted permission for the roles that should see Hermes. Backend‑only; requires a backend redeploy/restart.

1. `permissionsService.ts` — add to `ALL_PERMISSION_KEYS` (alongside the other `widget:` keys, ~L18):
   ```ts
   'widget:hermes',
   ```
   (`PermissionKey` at L198 derives from this array, so it updates automatically.)
2. Grant it to the appropriate role defaults. Hermes is an AI tool; to match how `widget:ara-console` / `widget:thought-weaver` are treated, add `'widget:hermes'` to the default arrays that already include those keys (e.g. `MANAGEMENT_DEFAULTS` at L235 and/or `CORPORATE_DEFAULTS` at L293, and the broad CORPORATE block at L357‑364 that lists `widget:ara-console`). Match the exact role set the product wants — minimally, every role that today gets `widget:ara-console` should also get `widget:hermes`.
3. **Deploy:** restart the backend so the new map is served — `launchctl kickstart -k gui/$(id -u)/com.dwellium.backend`. (god users are unaffected by the restart; they short‑circuit.)

**Pros:** no change to permission semantics; explicit and auditable. **Cons:** backend deploy; must remember to add future widgets to the list (the existing drift problem persists).

#### Option B — frontend default‑allow for `widget:` keys (class fix)
Treat unknown **widget** keys as allowed; deny only when explicitly revoked. Fixes Hermes + the whole class (honcho/etc.) with no backend deploy, and aligns with the existing "default allow to prevent flicker" intent (L67). Keep non‑widget namespaces (`section:`, `action:`) strict.

`src/context/PermissionsContext.tsx`, `can()`:
```ts
const can = useCallback((key: string): boolean => {
    if (role === 'god') return true;
    if (loading) return true;
    if (permissions[key] === false) return false;          // explicit revoke always wins
    if (permissions[key] === true) return true;
    // Unknown key: default‑allow widgets (registry is the source of truth),
    // stay strict for other namespaces (sections/actions).
    return key.startsWith('widget:');
}, [role, loading, permissions]);
```

**Pros:** one file; fixes the whole class; new widgets are visible by default and can be revoked in the admin grid. **Cons:** any widget intentionally hidden purely by *omission* from the backend list would now appear — audit the admin grid before shipping.

### Acceptance criteria
- A non‑god user (e.g. role `corporate`) sees **Hermes** in the classic sidebar AI Tools group and can open it to the persona cards.
- god users are unchanged.
- (Option A) the admin permission grid lists `widget:hermes`.
- No regression in which other widgets each role sees (diff a `getDefaultPermissions(role)` snapshot per role before/after).

### Tests
- Backend (Option A): unit‑assert `getDefaultPermissions('corporate').includes('widget:hermes')` and that `'god'` still returns all keys.
- Frontend (Option B): `PermissionsContext` test — `can('widget:hermes')` is `true` for a non‑god user with an empty/partial map and `loading=false`; `can('widget:foo')` where `permissions['widget:foo'] === false` is `false`; a non‑widget unknown key (`section:secret`) stays `false`.

### Verification
- `cd qualia-shell && npx tsc -b` (sandbox OK).
- Mac: `npx vitest run` for the touched suites; for Option A also restart backend and confirm `/api/auth/my-permissions` for a corporate token includes `widget:hermes`.
- Live: sign in as a non‑god user → Hermes appears in the sidebar → opens the cards.

---

## Fix #3 — per‑user isolation of in‑memory ingestion directory handles

### Problem
The live `FileSystemDirectoryHandle`s for Scribe ingestion are module‑level singletons. `useIngestion` is mounted by more than one surface at once (e.g. Scribe + the Honcho **Files** tab), and its async restore effect writes to those shared globals keyed only by the *current* user — so a fast account switch (or two concurrent consumers) can bleed one account's live folder handle into another. The durable copies are already per‑user (IndexedDB + localStorage), so this is purely the in‑memory layer.

### Root cause
`src/components/Scribe/ingestion/ingestionStore.ts`:
```ts
export const ingestionHandles: { source: unknown | null; backup: unknown | null } = { source: null, backup: null };
export const pendingHandles:  { source: unknown | null; backup: unknown | null } = { source: null, backup: null };
```
Both are single process‑wide objects. `useIngestion` mutates `ingestionHandles.source/backup` and `pendingHandles.source/backup` directly, gated only by `ingestionUserIdHolder.current`.

### Change — key the in‑memory handles by user id
Replace the two singletons with per‑uid records plus accessor helpers that resolve the current uid (mirroring how the localStorage store keys via `resolveKey()`).

**`ingestionStore.ts`:**
```ts
type HandlePair = { source: unknown | null; backup: unknown | null };

const liveHandlesByUser = new Map<string, HandlePair>();    // permission‑granted, in use
const pendingHandlesByUser = new Map<string, HandlePair>(); // restored, awaiting re‑grant

function handleKey(uid: string | null): string { return uid ?? '_anonymous'; }
function pair(map: Map<string, HandlePair>, uid: string | null): HandlePair {
    const k = handleKey(uid);
    let p = map.get(k);
    if (!p) { p = { source: null, backup: null }; map.set(k, p); }
    return p;
}

/** Live (granted) handles for a user — defaults to the current holder uid. */
export function liveHandles(uid: string | null = ingestionUserIdHolder.current): HandlePair {
    return pair(liveHandlesByUser, uid);
}
/** Pending (awaiting permission re‑grant) handles for a user. */
export function pendingHandlesFor(uid: string | null = ingestionUserIdHolder.current): HandlePair {
    return pair(pendingHandlesByUser, uid);
}
/** Test/util reset — clears all in‑memory handles. */
export function resetIngestionHandles(): void {
    liveHandlesByUser.clear();
    pendingHandlesByUser.clear();
}
```
Keep deprecated `ingestionHandles` / `pendingHandles` exports **only if** something outside this folder imports them (grep first — `grep -rn "ingestionHandles\|pendingHandles" src` shows only this folder + the 3 test files, so prefer removing them and updating callers).

Update `clearIngestion()` to clear the **current uid's** pair (not a global), and keep the IndexedDB delete:
```ts
export function clearIngestion(): void {
    const lh = liveHandles(); lh.source = null; lh.backup = null;
    const ph = pendingHandlesFor(); ph.source = null; ph.backup = null;
    void deleteIngestionHandles(ingestionUserIdHolder.current);
    ingestionStore.set(DEFAULT_STATE, () => { try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ } });
}
```

**`useIngestion.ts`:** resolve `const uid = userCtx?.user?.id ?? null;` (already present) and replace every `ingestionHandles.X` / `pendingHandles.X` with `liveHandles(uid).X` / `pendingHandlesFor(uid).X`:
- Restore effect: write `liveHandles(uid).source = src` (granted) or `pendingHandlesFor(uid).source = src` (needs re‑grant); the "reset previous user" step is no longer needed (each uid has its own pair — that's the whole point), which also removes the last cross‑user reset.
- `pickSource`/`pickBackup`: `liveHandles(uid).source = handle; pendingHandlesFor(uid).source = null;`
- `reconnect`: read `pendingHandlesFor(uid)[which]`, on `granted` move it into `liveHandles(uid)[which]`.
- `convert`: read `liveHandles(uid).source/backup`.
- Return values: `hasSource: liveHandles(uid).source !== null`, `hasBackup: liveHandles(uid).backup !== null`.

### Edge cases
- **Anonymous / logged‑out:** uid `null` → `_anonymous` bucket; isolated from real users.
- **Account switch:** new uid → fresh empty pair; the previous user's live handle stays in *their* bucket, never read under the new uid. No leak.
- **Two concurrent consumers, same uid:** share the same pair (correct — same user).
- **SSR / no IndexedDB:** unchanged; maps are plain memory, no browser globals at module‑eval.

### Tests
Update the three suites (they currently mutate `ingestionHandles.source` etc. in `beforeEach`):
- `src/test/ingestionStore.test.ts`, `src/test/ingestionPanel.test.tsx` — replace the `ingestionHandles.source = null; …; pendingHandles.source = null;` resets with `resetIngestionHandles()`.
- Add an **isolation test**: set `ingestionUserIdHolder.current = 'a'`, populate `liveHandles('a').source`; switch to `'b'`; assert `liveHandles('b').source === null` and `liveHandles('a').source` is intact.
- `src/test/ingestionHandlePersistence.test.ts` — unaffected (it tests the IDB layer), but add a reset in `beforeEach` for cleanliness.

### Verification
- `cd qualia-shell && npx tsc -b` (sandbox OK).
- Mac: `npx vitest run src/test/ingestionStore.test.ts src/test/ingestionPanel.test.tsx src/test/ingestionHandlePersistence.test.ts` + `npx react-router build`.
- Live (Chrome): sign in as user A, pick a folder; sign out; sign in as user B → B shows no source folder (only A's persisted name in A's session), and picking a folder for B does not affect A.

---

## Combined rollout
1. Implement #3 (frontend‑only, no deploy) and #2 (choose A or B).
2. `tsc -b` green in sandbox; `vitest` + both builds green on the Mac.
3. Commit on `feat/assessment-sweep`; if Option A, redeploy/restart the backend.
4. Live‑verify both on the Mac, then PR to `main` so the AppFolio Parity Gate runs the full gate.

## Related (out of scope here — from the same review)
- **Passwords in source + git history** (`LoginScreen.tsx`) — rotate, move validation server‑side, history rewrite (needs explicit go).
- **TranscriptionHub eager ~24 MB import** — convert moonshine→onnx/transformers to a dynamic `await import(...)` at the call site.
- **Test coverage gaps** — `loginLocal`, `HermesAgentWorkspace`, the `hermes` widget wiring, `useIngestion` restore/reconnect.
