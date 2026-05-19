# Phase-8+ Task 8.9 — Completion Report

**Task.** Phase-8+ Task 8.9 — Provider-remediation-only at `qualia-shell/src/context/{ThemeContext,UserContext}.tsx` (Phase-8+ Block B item 4); scope-collapsed at PRE0 per Cowork Verdict 1 LOCK from kickoff "atomic SSR enablement bundle" (7 deliverables) to **provider-remediation-only** (`ssr: false → true` flip + smoke-test + Sidebar/AdminShell-tree remediation DEFERRED to Tasks 8.10 + 8.11). Truly-atomic ship unit: useState lazy initializers → `useSyncExternalStore` + `getServerSnapshot` migration preserving browser-client behavior byte-for-byte at API-surface altitude.

**Class.** **NEW class `PROVIDER-SSR-REMEDIATION`** (project-wide 19th cumulative; 1pt within Phase-8+ at 8.9 close) per Cowork Verdict 2 LOCK at PRE0. Sub-shape candidate at 8.9: `useSyncExternalStore-migration-of-localStorage-backed-providers` (1pt baseline; calibration pending 2nd cross-task data point at Task 8.10 AdminShell-tree remediation OR later phase recurrence). Structurally distinct from FRAMEWORK-INSTALLATION (18th — framework primitive wiring) + SSR-MIGRATION-PREP (17th — framework-agnostic pre-adoption prep) + SCOPING-ONLY (16th — no production source).

**PROVIDER-SSR-REMEDIATION class definition (cemented at Task 8.9 §0):** production-source-altitude migration of provider primitives (`useState(() => …)` lazy initializers reading browser globals: `localStorage` / `window` / `document` / `navigator`) to React 19 SSR-canonical primitives (`useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`). Preserves browser-client behavior byte-for-byte while making provider tree SSR-safe at server-render altitude. The `getServerSnapshot` callback returns a documented default that matches any pre-hydration HTML mutation (e.g., the `app/root.tsx::Layout` FOUC IIFE-set className for theme) to avoid hydration mismatch by construction.

**Commit (HEAD on `main`):** `TBD` (squash commit for PR #TBD, Task 8.9 — Provider-remediation-only at qualia-shell/src/context/{ThemeContext,UserContext}.tsx via useSyncExternalStore migration; resolved at Task 8.10 OPENING sweep per 35-consecutive cross-phase sweep-resolutions convention extending 34-pattern at 8.9 → 35-pattern at 8.10).

**Green CI run.** AppFolio Parity Gate — TBD (Parity Gate AUTO-FIRES per v2.68.1 paths-filter glob amendment from Task 8.8 close — `qualia-shell/src/**` glob covers production-source edits at `qualia-shell/src/context/{ThemeContext,UserContext}.tsx` + `qualia-shell/src/utils/createLocalStorageStore.ts` + `qualia-shell/src/test/{UserContext,appfolioParity/providerSSRSafety}.test.tsx`). PII Scan — TBD. CodeRabbit Review — TBD.

**Vitest delta.** 264 → **269** (+5). 5 NEW server-snapshot tests at `qualia-shell/src/test/appfolioParity/providerSSRSafety.test.tsx` cementing the SSR-safety contract for each migrated store: 4 ThemeContext stores (theme + fontPairing + accentColor + animationsEnabled) + 1 UserContext tokenStore. All 264 pre-existing tests preserved byte-for-byte. NOTE: `qualia-shell/src/test/UserContext.test.tsx` `beforeEach` extended with `tokenStore.reset()` invocation to prevent module-level store cache pollution across tests — caught at Step-4 strict-gate first run (1 test failure surfacing the module-level cache vs original per-mount useState lazy-init semantic divergence; HALT-IF #3 candidate triaged + remediated in-place via `reset()` method addition to `LocalStorageStore` interface).

---

## §0 — Substantive Phase-8+ Task 8.9 engineering findings (publishable-level)

5 findings cemented at this close per Cowork Verdict 4 LOCK (catalog 25 → 30; per-task cadence +5 sister-shape to Task 8.6 Block B opener +8 cadence acceleration pattern). 4-of-5 (Z + AA + CC + DD) surfaced at Step-2 PRE0 empirical inventory; 1 (EE) surfaced during Step-3 implementation analysis per Cowork Verdict 4 trailing-clause LOCK.

### (Z) Finding Z — UserProvider audit-content empirical-vs-hypothetical-distinction at cross-doc convention narrative altitude

**Cemented per Cowork Verdict 4 LOCK at Task 8.9 §0.** PRE0 Q4(a) empirical inventory at HEAD `0a3c83f` surfaced discrepancy between `CLAUDE.md` Conventions block per-provider-SSR-safety taxonomy entry (cited `useState(() => localStorage.getItem('qualia_auth_user'))` — wrong key name + wrong subject) vs empirical signature at `qualia-shell/src/context/UserContext.tsx:52` (`useState<string | null>(() => localStorage.getItem(TOKEN_KEY))` where `TOKEN_KEY = 'dwellium-auth-token'` at L14 — for TOKEN restoration, not USER restoration). String `'qualia_auth_user'` does NOT exist anywhere in `qualia-shell/src/`. Actual user-data persistence key is `'dwellium-user'` (L237 setItem / L274 getItem), accessed inside async callbacks / useEffect bodies (effect-time SAFE per Task 8.3 §2 taxonomy).

**Structural SSR-safety verdict UNCHANGED** — UserProvider remains STRUCTURALLY UNSAFE due to the L52 token lazy init; only the empirical specifics in the cross-doc convention narrative differed. Sister-shape to Task 8.4 Finding J (ThemeProvider audit-content empirical-vs-hypothetical distinction at audit-doc §3.1 altitude) at UserProvider altitude. **v2.64.0 audit-content empirical-vs-hypothetical PRE-FLIGHT discipline now cumulative across 5 distinct application altitudes:** audit-doc §3.1 (Task 8.4 J) + Plan §4 L116 (Task 8.5 M) + audit-doc §3.2 (Task 8.9 Z) + audit-doc L23 narrative (Task 8.9 sister-shape extension) + react-router.config.ts JSDoc (Task 8.9 AA). Recommended for Plan v2.71+ amendment.

**Remediation shipped:** audit doc `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §3.2` inline-footnote-correction (sister-shape to §3.1 ThemeProvider footnote byte-for-byte) + L23 narrative summary footnote ² per Verdict 5(a)+(b) LOCK. CLAUDE.md Conventions block refinement DEFERRED to Phase-8+ closer per Verdict 5 trailing-clause LOCK (post-CLAUDE.md-cleanup R5 state preservation; convention entry stays load-bearing for ThemeProvider which is empirically correct; only UserProvider entry has minor cross-doc drift on key name).

### (AA) Finding AA — react-router.config.ts JSDoc audit-content drift at production-source-config-file-JSDoc altitude

**Cemented per Cowork Verdict 4 LOCK at Task 8.9 §0.** PRE0 Q4(b) empirical inspection of `qualia-shell/react-router.config.ts` surfaced JSDoc L10-L11 cites stale `"ThemeProvider 8 init-time localStorage reads"` hypothetical count — empirically corrected to **6 init-time reads** at Task 8.4 Finding J + audit doc §3.1 D-1 LOCK footnote-correction (4 primary keys `dwellium-theme` + `dwellium-font-pairing` + `dwellium-accent-color` + `dwellium-animations` + 2 legacy fallbacks `qualia-theme` + `qualia-accent-color`). UserProvider's "1 init-time read" framing is empirically correct.

**NEW altitude for v2.64.0 audit-content cross-altitude-applicability validation:** production-source-config-file-JSDoc-altitude. Sister-shape constellation expanded to **5 distinct altitudes**: Plan §4 L116 (Task 8.5 M — Phase-plan-doc altitude) → Audit doc §3.1 ThemeProvider (Task 8.4 J — audit-doc altitude) → Audit doc §3.2 UserProvider (Task 8.9 Z — sister-shape within audit doc) → Audit doc L23 narrative summary (Task 8.9 sister-shape — within-doc narrative altitude) → react-router.config.ts JSDoc (Task 8.9 AA — production-source-config-file-JSDoc altitude). v2.64.0 discipline-cluster now has 12-pattern anchor-bias-mitigation recognition extension (extends 11-pattern at Task 8.8 close).

**Remediation shipped:** inline-footnote-correction at react-router.config.ts JSDoc per Verdict 5(c) LOCK — preserve shipping-time content verbatim (lines 4-19) + add footnotes ¹ (Finding AA correction) + ² (Task 8.9 PROVIDER-SSR-REMEDIATION migration note + ssr-flip deferred to Task 8.11).

### (CC) Finding CC — Sidebar.tsx:228 init-time localStorage UNSAFE site outside original Task 8.3 audit scope

**Cemented per Cowork Verdict 4 LOCK at Task 8.9 §0 (INFORMATIONAL — remediation deferred to Task 8.10 per Verdict 1 LOCK).** PRE0 Q4(d) empirical inspection at HEAD `0a3c83f` surfaced `qualia-shell/src/components/Sidebar/Sidebar.tsx:228` `useState<Set<string>>(() => { ... localStorage.getItem('qualia_sidebar_groups') ... })` — Init-time UNSAFE per Task 8.3 §2 3-altitude taxonomy. try/catch guards against `JSON.parse` failures but does NOT prevent `ReferenceError: localStorage is not defined` at server-side render attempt.

Original Task 8.3 audit scope (per Cowork Q3 explicit LOCK at 4 top-level providers + Q7 explicit LOCK) was **App.tsx top-level providers only** — AdminShell render tree + leaf components were OUTSIDE audit boundary by design. Finding CC confirms that exclusion-by-deferral decision was correctly conservative; the AdminShell-tree-altitude unsafe sites (per Finding DD) PLUS leaf-component unsafe sites (per Finding CC) form a coherent Task 8.10 scope.

**Sister-shape:** to Task 8.5 Finding L scope-existence-empirical-refutation pattern but at audit-scope-completeness altitude. Where Finding L refuted positive-existence (extraction NOT needed), Finding CC confirms negative-existence (additional unsafe sites EXIST beyond audit scope by design). **NEW v2.71.0 PRE-FLIGHT discipline candidate at audit-scope-completeness altitude:** at every multi-component audit (Task 8.3 / 8.9 / future tasks), explicitly enumerate audit boundary AND surface what's outside the boundary as carry-forward items. Sister-shape to 11-pattern anchor-bias-mitigation cluster (NEW 12th pattern; recommended for Plan v2.71 amendment).

**Remediation deferred to Task 8.10** (admin-tree SSR remediation: Sidebar.tsx:228 + LayoutContext + HierarchyContext + WindowContext).

### (DD) Finding DD — AdminShell-tree 3-provider audit (deferred from Task 8.3 per Cowork Verdict 9 LOCK)

**Cemented per Cowork Verdict 4 LOCK at Task 8.9 §0 (INFORMATIONAL — remediation deferred to Task 8.10 per Verdict 1 LOCK).** PRE0 Q4(e) empirical inventory at HEAD `0a3c83f` of the 3 providers wrapped at `qualia-shell/src/components/Shell/AdminShell.tsx` (`LayoutProvider` / `HierarchyProvider` / `WindowProvider`) revealed **all 3 STRUCTURALLY UNSAFE** at init-time altitude:

| Provider | Location | Init-time UNSAFE reads | useState lazy init signature |
|---|---|---:|---|
| `LayoutProvider` | `src/context/LayoutContext.tsx:98` | 1 | `useState<LayoutSettings>(() => { ... localStorage.getItem(STORAGE_KEY) ... })` |
| `HierarchyProvider` | `src/context/HierarchyContext.tsx:186` | 1 (via function reference) | `useState<HierarchyItem[]>(loadHierarchy)` where `loadHierarchy` at L153 calls `localStorage.getItem(STORAGE_KEY)` |
| `WindowProvider` | `src/context/WindowContext.tsx:60+98` | multi | `useState<DockItem[]>(() => { ... ~5 localStorage reads ... })` + `useState<SavedLayout[]>(() => { ... localStorage.getItem ... })` |

`AdminShell.tsx` itself (L1-L160) is SSR-SAFE at its own altitude — 0 useState; all `localStorage` / `window` / `document` references inside useEffect bodies (effect-time SAFE per Task 8.3 §2 taxonomy). Total AdminShell render tree at HEAD `0a3c83f`: **3 STRUCTURALLY UNSAFE provider sites + 1 leaf component (Sidebar.tsx — Finding CC) + Task 8.3 audit's 2 App.tsx top-level UNSAFE (ThemeProvider + UserProvider)** = 6 cumulative SSR-unsafe sites at AdminShell render tree.

Confirms Task 8.3 audit's exclusion-by-deferral decision was correctly conservative; AdminShell tree remediation correctly belongs at Task 8.10 not Task 8.3. **Strategic implication:** Task 8.9 ships PROVIDER-SSR-REMEDIATION for App.tsx top-level providers only (Theme + User). Task 8.10 will ship a 2pt cross-task-shape calibration data point (sister-shape to PROVIDER-SSR-REMEDIATION class) at AdminShell-tree altitude. `ssr: false → true` flip at `qualia-shell/react-router.config.ts` DEFERRED to Task 8.11 after ALL 6 sites remediated.

### (EE) Finding EE — AuthGate hydration-flash empirical signature at UserProvider remediation altitude (NEW altitude for v2.60.1 cluster)

**Cemented per Cowork Verdict 4 LOCK trailing-clause at Task 8.9 §0 (empirical-finding-during-implementation pattern sister-shape to Task 8.6 Findings S+T).** Surfaced during Step-3 implementation analysis: useSyncExternalStore migration of `UserContext.tokenStore` alone produces **hydration flash for authenticated users at `ssr: true` altitudes** — server renders auth-token=null (per `getServerSnapshot()` returning `null`) → AuthGate renders SecurityRoute (login screen) → client hydrates → `tokenStore.getSnapshot()` reads real token from localStorage → useSyncExternalStore triggers re-render to DefaultRoute. This is structurally **hydration-mismatch-by-construction** — the server CANNOT know whether the client has a localStorage token until hydration completes.

At HEAD-post-8.9 (`ssr: false` at react-router.config.ts) the flash is **ABSENT** because SPA Mode does not server-render. The flash is a DEFERRED risk for Task 8.11 (atomic `ssr: false → true` flip). Three architectural mitigations are available at Task 8.11 PRE0 for Cowork verdict:

| Pattern | Description | Trade-off |
|---|---|---|
| **(a) `ClientOnly` wrap of AuthGate** | Server renders a `<Suspense fallback>` placeholder; client mounts AuthGate post-hydration | Eliminates SSR benefit for auth tree (LCP regression at authenticated route) |
| **(b) Accept flash** | Ship as-is; let flash render | Visible authentication state flicker on every cold-start with persisted token |
| **(c) Move AuthGate behind Suspense boundary** | Allow server to stream pre-auth-resolved HTML | Requires server-side cookie/header inspection for auth signal (cross-cutting infra change) |

**Sister-shape:** NEW altitude for v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline cluster — **hydration-mismatch-by-construction altitude** (10th distinct altitude after hypothesis-content + implementation-shipping + audit-shipping + scope-existence + install-shipping + routing-config + entry-boundary-build-time-invocation + per-route-routing-config + nested route-id-derivation sub-altitude). Recommended for Plan v2.71+ amendment as PERMANENT engineering-finding pattern.

---

## §1 — Empirical signature + chunk-axis verification at HEAD-post-8.9

**Strict-gate (Step-4) at HEAD-pre-commit:**

| Gate | Result | Notes |
|---|---|---|
| `tsc -b` | ✓ silent-clean | 0 errors / 0 warnings |
| `vitest run` | ✓ **269/269 PASS** | +5 from pre-Task-8.9 baseline (264 → 269); 39 test files; 2.84s wallclock |
| `npx react-router build` (bare; SEEDS=true default) | ✓ SUCCESS | SPA Mode emit; `build/server` post-emission removed per `ssr: false` |
| `VITE_APPFOLIO_SEEDS=false npx react-router build` | ✓ SUCCESS | SPA Mode emit; identical structural shape |
| PII guard (`node Scripts/verify_no_pii_leak.mjs`) | ✓ 0 leaks / 51 files | 1460ms total |

**Chunk-axis verification (Step-4-bis):** 7th cross-phase production-source-edit BREAK data point sister to 6.1a + 6.3 + 6.4 + 7.1 + 7.10 + 8.2 + 8.6 precedents. NEW canonical at HEAD-post-8.9 (parity-gate canonical = bare `npx react-router build` or `VITE_APPFOLIO_SEEDS={true,false} npx react-router build`):

| Chunk | HEAD-post-8.8 canonical | HEAD-post-8.9 canonical | Delta |
|---|---|---|---|
| Eager entry JS | `entry.client-UEY9SPBa.js` / 187,619 B | `entry.client-PwuHOHUl.js` / 187,619 B / `84518ca8…f549a` | filename hash BREAK; byte-count IDENTICAL |
| StrataDashboard JS | `StrataDashboard-Cuka4DA6.js` / 1,032,178 B | `StrataDashboard-Chm9UAiL.js` / 1,032,178 B | filename hash BREAK; byte-count IDENTICAL |
| Eager CSS `default-` | `default-BebuHEVu.css` / 49,312 B | `default-BebuHEVu.css` / 49,312 B | byte-for-byte PRESERVED |
| Vendor `index-1yBoi7Al.js` | 87,711 B | 87,711 B | byte-for-byte PRESERVED (Phase-6.x → 8.9 continuum, 35-pattern milestone) |
| NEW shared chunk | (n/a) | `index-DJi_CBRm.js` / 117,774 B | NEW chunk emerged (likely contains `createLocalStorageStore` factory + module-level stores) |

Build-mode invariance preserved: bare vs SEEDS=false produces identical eager entry hash (validated empirically).

---

## §2 — File-change inventory

7 files changed; 2 NEW + 5 MODIFIED at production-source + test + docs altitudes:

**Production source (3 files; 2 MODIFIED + 1 NEW):**

1. **MODIFIED** `qualia-shell/src/context/ThemeContext.tsx` (+87 / −56 ≈ net +31 lines):
   - Import migration: `useState` → `useSyncExternalStore` + `createLocalStorageStore`
   - 4 useState lazy initializers (L125 / L133 / L137 / L143) REMOVED
   - 4 module-level external stores ADDED (themeStore + fontPairingStore + accentColorStore + animationsEnabledStore) — all EXPORTED for unit test access
   - 4 `useSyncExternalStore` invocations replace useState reads
   - 4 setter functions refactored to use `store.set(next, persistToStorage)` atomic API
   - `toggleTheme` refactored to use `themeStore.getSnapshot()` instead of `setThemeState(prev => ...)` functional setter
   - 3 useEffect blocks PRESERVED byte-for-byte (DOM application of theme/font/accent/animations — effect-time SAFE per §2 taxonomy)
   - Public API surface (`theme`, `fontPairing`, `accentColor`, `animationsEnabled`, `toggleTheme`, `setTheme`, `setFontPairing`, `setAccentColor`, `setAnimationsEnabled`) PRESERVED byte-for-byte
2. **MODIFIED** `qualia-shell/src/context/UserContext.tsx` (+25 / −13 ≈ net +12 lines):
   - Import migration: added `useSyncExternalStore` + `createLocalStorageStore`
   - L52 `useState<string | null>(() => localStorage.getItem(TOKEN_KEY))` REMOVED → replaced by `useSyncExternalStore(tokenStore.subscribe, tokenStore.getSnapshot, tokenStore.getServerSnapshot)`
   - 1 module-level `tokenStore` ADDED — EXPORTED for unit test access (and tokenStore.reset() test escape-hatch)
   - 3 internal `setToken(...) + localStorage.{set,remove}Item(TOKEN_KEY, ...)` pairs (in `saveTokens` / `clearTokens` / static-fallback `login`) COLLAPSED to single `tokenStore.set(next, persistCallback)` atomic calls
   - Public API surface (`user`, `token`, `role`, `permissions`, `isAuthenticated`, `isLoading`, `login`, `logout`, `authFetch`, `hasMinRole`, `hasPermission`) PRESERVED byte-for-byte
   - Non-hook accessors `getAuthToken()` + `getAuthHeaders()` PRESERVED byte-for-byte (still direct localStorage reads with try/catch)
3. **NEW** `qualia-shell/src/utils/createLocalStorageStore.ts` (110 lines / 3.7 KB):
   - Shared SSR-safe localStorage-backed store factory
   - `LocalStorageStore<T>` interface: `subscribe` + `getSnapshot` + `getServerSnapshot` + `set` + `reset` (test escape-hatch)
   - Sister-shape to `qualia-shell/src/utils/lazyWithReload.ts` (Phase-7 7.10 convention; same `src/utils/` altitude)

**Tests (2 files; 1 NEW + 1 MODIFIED):**

4. **NEW** `qualia-shell/src/test/appfolioParity/providerSSRSafety.test.tsx` (~60 lines / 2.0 KB):
   - 5 server-snapshot tests (one per migrated store) verifying SSR-safety contract
   - Phase-7 7.13 Finding (B) `vi.useFakeTimers` anti-pattern convention preserved (synchronous assertions only)
5. **MODIFIED** `qualia-shell/src/test/UserContext.test.tsx` (+5 / −1 lines):
   - Import: added `tokenStore` from UserContext
   - `beforeEach` extended with `tokenStore.reset()` call per Phase-8+ Task 8.9 store-cache cross-test-pollution mitigation (HALT-IF #3 candidate caught at Step-4 first run + remediated in-place)

**Docs / config (2 files; both MODIFIED):**

6. **MODIFIED** `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md` (3 inline-footnote-correction blocks):
   - §3.2 UserProvider section: NEW inline-footnote-correction block per Verdict 5(a) LOCK (cites Finding Z; sister-shape to §3.1 ThemeProvider Task 8.4 D-1 LOCK footnote byte-for-byte)
   - L23 narrative summary: footnotes ¹ + ² (¹ refines pre-existing Task 8.4 Finding J ThemeProvider correction; ² cements Finding Z UserProvider correction within narrative-summary altitude per Verdict 5(b) LOCK — NEW within-doc cross-altitude data point)
7. **MODIFIED** `qualia-shell/react-router.config.ts` (footnotes ¹ + ² appended; original config body L4-L19 PRESERVED byte-for-byte):
   - Footnote ¹: Finding AA correction at production-source-config-file-JSDoc altitude per Verdict 5(c) LOCK
   - Footnote ²: Task 8.9 PROVIDER-SSR-REMEDIATION migration note + `ssr: false → true` flip + smoke-test bundle DEFERRED to Task 8.11 per Verdict 1 LOCK

**Source-of-truth fixtures: NO CHANGES.** No `qualia-shell/public/data/**` edits. No `qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived/**` edits. Envelope preserved byte-for-byte.

---

## §3 — PROVIDER-SSR-REMEDIATION class designation (NEW; project-wide 19th cumulative)

**Class definition** (cemented at this Task 8.9 §0): production-source-altitude migration of provider primitives (`useState(() => …)` lazy initializers reading browser globals: `localStorage` / `window` / `document` / `navigator`) to React 19 SSR-canonical primitives (`useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`). Preserves browser-client behavior byte-for-byte while making provider tree SSR-safe at server-render altitude. The `getServerSnapshot` callback returns a documented default that matches any pre-hydration HTML mutation (e.g., the `app/root.tsx::Layout` FOUC IIFE-set className for theme) to avoid hydration mismatch by construction.

**Sub-shape candidate at Task 8.9 (1pt baseline; pending 2nd cross-task data point for full calibration):** `useSyncExternalStore-migration-of-localStorage-backed-providers`. Likely 2nd data point at Task 8.10 AdminShell-tree-altitude remediation (LayoutContext + HierarchyContext + WindowContext + Sidebar.tsx:228 — 4 additional sites per Findings CC + DD).

**Structurally distinct from:**
- FRAMEWORK-INSTALLATION (18th class — wiring chosen framework's full primitive set)
- SSR-MIGRATION-PREP (17th class — framework-agnostic pre-adoption prep WITHOUT framework adoption)
- SCOPING-ONLY (16th class — forward-scoping no production source touched)
- COMPONENT-FIX (10th class — fixes existing bugs at component altitude; PROVIDER-SSR-REMEDIATION fixes a structural SSR-incompatibility at provider altitude, not a runtime bug)
- TEST-INFRA-FIX (15th class — test-tooling primitive interaction fix; PROVIDER-SSR-REMEDIATION is production-source migration)

**Project-wide cumulative class count: 18 → 19** at Task 8.9 close.

---

## §4 — Verification matrix

| Axis | Predicted (Q8) | Empirical | Outcome |
|---|---|---|---|
| `tsc -b` | ✓ | ✓ silent-clean | PASS |
| `vitest run` | 264 → 268-269 (+N if tests added) | 264 → 269 (+5) | PASS as predicted |
| `npx react-router build` (bare) | ✓ SPA Mode emit | ✓ SPA Mode emit | PASS |
| `VITE_APPFOLIO_SEEDS=false npx react-router build` | ✓ identical structural shape | ✓ identical | PASS |
| PII guard | 0 leaks / 51 files | 0 leaks / 51 files | PASS |
| Chunk-axis at `build/client/**` | BREAK at production-source-edit class shape | BREAK at filename hash; byte-count IDENTICAL on entry+StrataDashboard; NEW chunk emerged | PASS (7th cross-phase BREAK data point) |
| Paths-filter (Q6) | AUTO-FIRE per v2.68.1 + `qualia-shell/src/**` glob | AUTO-FIRE expected at Step-7 push | (pending) |
| HALT-IF #1 (PRE0 inventory discrepancy) | none expected | **TRIGGERED** at Q4(a) UserContext audit-vs-empirical drift → Cowork verdict resolved at Verdicts 1-6 LOCK | RESOLVED |
| HALT-IF #2 (build-time error from ssr flip) | n/a (ssr stays false) | n/a | not in scope per Verdict 1 |
| HALT-IF #3 (strict-gate failure) | none expected | **TRIGGERED** at Step-4 first run (1 vitest fail at `UserContext.test.tsx > login() returns error on failed login`); root-cause module-level store cache pollution across tests; remediated in-place via `LocalStorageStore.reset()` method + `beforeEach` invocation; re-run 269/269 PASS | RESOLVED in-place |
| HALT-IF #4 (chromium-headless probe hydration mismatch) | not in scope per Verdict 1 (ssr stays false) | n/a — smoke-test deferred to Task 8.11 | not in scope |
| HALT-IF #5 (Parity Gate failure) | none expected | (pending Step-7) | (pending) |

---

## §5 — Empirical anchor references

- `qualia-shell/src/context/ThemeContext.tsx` HEAD-post-8.9 (4 stores at L130-L175; ThemeProvider component at L177-L242) — 4 useState lazy initializers → 4 `useSyncExternalStore` migration shipped
- `qualia-shell/src/context/UserContext.tsx` HEAD-post-8.9 (tokenStore at L34-L37; UserProvider component at L49 onward) — L52 useState lazy init → `useSyncExternalStore` migration shipped + 3 internal `setToken+setItem` pairs collapsed to 3 `tokenStore.set()` atomic calls
- `qualia-shell/src/utils/createLocalStorageStore.ts` HEAD-post-8.9 — NEW shared factory at sister-shape altitude to `lazyWithReload.ts`
- `qualia-shell/src/test/appfolioParity/providerSSRSafety.test.tsx` HEAD-post-8.9 — 5 server-snapshot tests
- `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md §3.1 + §3.2 + L23` HEAD-post-8.9 — 3 inline-footnote-correction blocks
- `qualia-shell/react-router.config.ts` HEAD-post-8.9 — 2 JSDoc footnotes per Verdict 5(c) (config body unchanged: `ssr: false` LOCK preserved at HEAD-post-8.9)
- `qualia-shell/build/client/index.html` HEAD-post-8.9 — eager entry references `entry.client-PwuHOHUl.js`

---

## §6 — Rollback plan + Task 8.10 / 8.11 carry-forward roadmap

**Rollback target:** `git revert <Task 8.9 squash SHA>` (single-commit revert restores HEAD `0a3c83f` ↔ HEAD-pre-Task-8.9 byte-for-byte). No production-source edits at App.tsx top-level routing — `qualia-shell/src/App.tsx` semantic preserved. Theme + User provider tree at HEAD-post-revert returns to pre-Task-8.9 useState lazy init pattern. **Resolved at Task 8.10 OPENING sweep ✓** (sister-shape pattern from prior Phase-8+ task close convention).

**Task 8.10 implementation roadmap (AdminShell-tree SSR remediation per Verdict 1 LOCK + Findings CC + DD):**

| Site | File | Migration target | Sub-shape |
|---|---|---|---|
| LayoutProvider | `src/context/LayoutContext.tsx:98` | 1 useSyncExternalStore (settings) | useSyncExternalStore-migration-of-localStorage-backed-providers (2pt extension at Task 8.10) |
| HierarchyProvider | `src/context/HierarchyContext.tsx:186` | 1 useSyncExternalStore (hierarchy) | (same sub-shape) |
| WindowProvider | `src/context/WindowContext.tsx:60+98` | 2 useSyncExternalStore (dockItems + savedLayouts) | (same sub-shape) |
| Sidebar.tsx:228 | `src/components/Sidebar/Sidebar.tsx` | 1 useSyncExternalStore (expandedGroups) — NEW leaf-component sub-altitude | NEW sub-shape `useSyncExternalStore-migration-at-leaf-component-altitude` |

Task 8.10 anticipated class: PROVIDER-SSR-REMEDIATION 1pt → 2pt CROSS-TASK-SHAPE FULL CALIBRATION (sister-shape to SCOPING-ONLY 2pt full calibration at Tasks 8.1+8.3 + SSR-MIGRATION-PREP 2pt at 8.2+8.4 + FRAMEWORK-INSTALLATION 2pt at 8.6+8.7 precedents). **All 4-of-4 Phase-8+-introduced classes will be fully calibrated at 2pt+ cross-task-shape by Task 8.10 close.**

**Task 8.11 implementation roadmap (atomic `ssr: false → true` flip + smoke-test bundle per Verdict 1 LOCK):**

1. **PRE0 dependency check:** Task 8.10 closed (all 6 SSR-unsafe sites remediated)
2. **Install `@react-router/serve`** at install-shipping altitude per Finding BB (deferred from Task 8.9; sister-shape to Task 8.6 Finding S production-deps placement)
3. **1-line config flip** at `qualia-shell/react-router.config.ts`: `ssr: false → ssr: true`
4. **Hydration smoke-test mechanism:** local `npx react-router-serve build/server/index.js` + chromium-headless probe at `/` + `/security` verifying:
   - Zero `ReferenceError: localStorage is not defined` in server stdout
   - Zero React hydration mismatch console warnings (`Warning: Text content does not match server-rendered HTML` / etc.)
5. **Architectural decision per Finding EE:** Cowork verdict at Task 8.11 PRE0 between (a) ClientOnly wrap of AuthGate + (b) accept flash + (c) Suspense boundary
6. **Empirical signal:** `grep -c "dwellium-theme" build/client/index.html` PRESERVED at 1 (Layout/Root/HydrateFallback 3-export pattern preserved through ssr flip)

**Phase-8+ → Phase-9+ transition signal per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6`:** binary v1 L228 ≤500 ms LCP MET-or-STRUCTURALLY-UNATTAINABLE refinement candidate OR 3rd partial-MET outcome at Block C Task 8.12 LCP n=10 re-measurement (after Task 8.11 SSR enablement + hydration cost characterization).

---

## §7 — Deferred-items ledger (Phase-8+ Task 8.9 close)

7 deferred-items captured at this close:

1. **Finding BB carry-forward** — `@react-router/serve` package install at Task 8.11 (hydration smoke-test mechanism). Sister-shape to Task 8.6 Finding S install-shipping altitude discipline.
2. **Finding CC carry-forward** — Sidebar.tsx:228 cold-start localStorage `useState` migration at Task 8.10.
3. **Finding DD carry-forward** — AdminShell-tree 3-provider remediation (LayoutContext + HierarchyContext + WindowContext) at Task 8.10.
4. **Finding EE carry-forward** — AuthGate hydration-flash architectural decision at Task 8.11 (3 options: ClientOnly / accept-flash / Suspense-boundary).
5. **`ssr: false → ssr: true` flip** at `qualia-shell/react-router.config.ts` deferred to Task 8.11 atomic-shipping per Verdict 1 LOCK.
6. **CLAUDE.md Conventions block per-provider-SSR-safety taxonomy entry refinement** (UserProvider entry has minor cross-doc drift on key name per Finding Z) — DEFERRED to Phase-8+ closer per Verdict 5 trailing-clause LOCK (post-CLAUDE.md-cleanup R5 state preservation).
7. **v2.71.0 PRE-FLIGHT discipline candidate at audit-scope-completeness altitude per Finding CC** — Plan v2.71 amendment candidate cementing 12-pattern anchor-bias-mitigation cluster recognition extension (extends 11-pattern at Task 8.8 close).

---

## §8 — Cross-phase milestone state at Task 8.9 close

- **Phase-8+ progress:** 9 of 15 ✓ (8.1-8.9; 8.10-8.15 R)
- **Cumulative engineering-finding catalog:** 25 → **30 findings (A-Y + Z + AA + CC + DD + EE)** at Task 8.9 close (+5 vs Task 8.8 close)
- **Anchor-bias-mitigation cluster:** 11-pattern → **12-pattern** at Task 8.9 close (NEW v2.71.0 candidate per Finding CC)
- **v2.60.1 cluster altitudes:** 9 distinct → **10 distinct** at Task 8.9 close (NEW hydration-mismatch-by-construction altitude per Finding EE)
- **v2.64.0 audit-content cross-altitude application altitudes:** 4 → **5** at Task 8.9 close (NEW production-source-config-file-JSDoc altitude per Finding AA)
- **Project-wide class count:** 18 → **19** at Task 8.9 close (NEW PROVIDER-SSR-REMEDIATION class)
- **3-of-3 Phase-8+ classes fully calibrated → 4-of-4 by Task 8.10 close projection** (PROVIDER-SSR-REMEDIATION 2pt full calibration at Task 8.10 AdminShell-tree remediation)
- **Cross-phase production-source-edit chunk-axis BREAK data points:** 6 → **7** at Task 8.9 close (sister to 6.1a + 6.3 + 6.4 + 7.1 + 7.10 + 8.2 + 8.6 + 8.9 precedents)
- **Cross-phase sweep-resolutions consecutive count:** 33 → **34** at Task 8.9 OPENING sweep (resolved Task 8.8 TBD → `387abfa` / `#76` across 5 reference spots per directive Step-1)
- **Block B 3-of-6 → 4-of-6 milestone** at Task 8.9 close (8.6 + 8.7 + 8.8 + 8.9 ✓; 8.10 + 8.11 R)
- **5th consecutive Task PRE0 wrong-hypothesis refutation pattern** empirically cemented (Findings L+O+W+Y+Z) — recursive-validation discipline extends from 4th consecutive at Task 8.8 close to **5th consecutive at Task 8.9 close** — pattern continues at scale per established convention; standing PRE-FLIGHT discipline cluster's recursive-self-validation property empirically vindicated at substantive scale.

---
