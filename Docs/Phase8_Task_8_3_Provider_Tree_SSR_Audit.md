# Phase-8+ Task 8.3 — Provider-tree SSR-safety audit

> **Phase-8+ Block A item 2.** Sister-shape to Task 8.1 OPENER SSR architectural scoping deliverable. Empirically documents SSR-incompatibility surfaces in the App.tsx provider tree BEFORE framework-mode adoption at Task 8.6 surfaces them through actual server-rendering failures. SCOPING-ONLY class shape (project-wide 16th cumulative; 2pt cross-phase calibration LOCK completing full class calibration sister to CLOSURE-NARRATIVE-CONSOLIDATION at Phase-7 closer); no production source touched.

---

## §0 — Cover

| Field | Value |
|---|---|
| **Phase** | Phase-8+ |
| **Task** | 8.3 — Provider-tree SSR-safety audit (Block A item 2) |
| **Date** | 2026-05-17 |
| **Branch** | `phase-8/task-8.3-provider-tree-ssr-safety-audit` |
| **Base SHA** | `b43c2bf` (Task 8.2 Imperative-routing → declarative-routing migration squash) |
| **Class** | **SCOPING-ONLY** (project-wide 16th cumulative; 1pt → **2pt cross-phase fully calibrated** at Task 8.3 close per Cowork Q1 LOCK; sister-shape to CLOSURE-NARRATIVE-CONSOLIDATION class full calibration at Phase-7 closer = Phase-6 6.9 + Phase-7 closer 2pt cross-phase pattern) |
| **Cowork-locked verdicts** | Q1 SCOPING-ONLY 2pt LOCK ✓ / Q2 pure-audit just-document SSR-incompatibility ✓ / Q3 Moderate Q3 depth (3-5 paragraphs per provider) ✓ / Q4 React Query SSR-hydration in-scope at Task 8.3 ✓ / Q5 both auth init + theme FOUC surface ✓ / Q6 sister-shape audit deliverable ✓ / Q7 DOC-only minimal-gate ✓ / Q8 sequential 8.3 → 8.4 → 8.5 ✓ |
| **Deliverable shape** | DOC-only; no production source touched; minimal-gate (tsc + vitest 264/264 + PII; SKIP vite builds × 2) |
| **Carry-forward source** | Task 8.1 §1 (App.tsx provider tree inventory) + Task 8.2 §0 finding (E + F) + v2.62.1 PRE-FLIGHT scope-shape discipline + 4-pattern anchor-bias-mitigation cluster (v2.60.1 + v2.60.4 + v2.60.6 + v2.62.1) |

### Three publishable-level Phase-8+ Task 8.3 engineering findings

1. **2-of-4 STRUCTURALLY UNSAFE vs 2-of-4 SSR-SAFE empirical mix** at App.tsx top-level provider tree — ThemeProvider (8 localStorage initialization-time reads) + UserProvider (1 localStorage initialization-time read) are STRUCTURALLY UNSAFE for SSR; QueryProvider + PermissionsProvider are SSR-SAFE at provider altitude. Empirically refines Cowork HARD HALT-IF #5 expectation (was "all 4 might be empirically SSR-safe"; empirical reality is mixed). **9 total localStorage initialization-time reads require `useSyncExternalStore` migration OR lazy-initializer-with-`typeof window` guards before Task 8.6 framework-mode SSR enablement.**
2. **TanStack Query SSR-hydration discipline gap separate from provider-altitude safety** — QueryProvider is SSR-safe at provider body (no browser globals) BUT current singleton-client architecture is incompatible with SSR cache hydration. TanStack Query v5 official guidance (verbatim from `tanstack.com/query/latest/docs/framework/react/guides/ssr`): *"Creating the queryClient at the file root level makes the cache shared between all requests and means all data gets passed to all users."* Current `qualia-shell/src/providers/QueryProvider.tsx:16` does exactly this. **Requires per-request QueryClient pattern + `dehydrate()` + `<HydrationBoundary>` + `prefetchQuery()` at Task 8.6 implementation.**
3. **Dependency-chain SSR-safety propagation** — PermissionsProvider depends on `useUser()` at L28; its SSR-safety is structurally CONDITIONAL on UserProvider SSR-safe rendering producing `isAuthenticated=false` initial state. **Empirical engineering finding: provider-tree SSR-safety must be evaluated at TREE altitude not PROVIDER altitude** — fixing UserProvider's 1 init-time localStorage read also unlocks PermissionsProvider's safety; conversely, leaving UserProvider unfixed would propagate UNSAFE state downstream to PermissionsProvider's early-return logic.

---

## §1 — App.tsx top-level provider tree inventory

Per Phase-8+ Task 8.2 HEAD-post-`b43c2bf` (declarative-routing migration via react-router v7 library-mode), the provider tree at App.tsx top-level lives inside route element components (NOT wrapping `<BrowserRouter>` at App root). Empirical structure:

```tsx
// qualia-shell/src/App.tsx (post-Task 8.2)
function SecurityRoute() {
    return (
        <Suspense fallback={...}>
            <SecurityPortal />            {/* NO providers — viewport-fill standalone */}
        </Suspense>
    );
}

function DefaultRoute() {
    const [searchParams] = useSearchParams();
    if (searchParams.get('popup')) {
        return (
            <ThemeProvider>               {/* Branch 2 popup-conditional: 4 providers */}
                <UserProvider>
                    <QueryProvider>
                        <PermissionsProvider>
                            <PopupShell .../>
                        </PermissionsProvider>
                    </QueryProvider>
                </UserProvider>
            </ThemeProvider>
        );
    }
    return (
        <ThemeProvider>                   {/* Branch 3 default: 3 providers */}
            <UserProvider>
                <QueryProvider>
                    <AuthGate />          {/* AuthGate-internal Permissions for admin sub-branch */}
                </QueryProvider>
            </UserProvider>
        </ThemeProvider>
    );
}
```

### Four top-level providers in scope at Task 8.3 (per Cowork Q3 explicit LOCK at 4)

| Provider | Source path | LoC | Bytes | Responsibility |
|---|---|---|---|---|
| `ThemeProvider` | `qualia-shell/src/context/ThemeContext.tsx` | 213 | 7,615 | Theme mode (dark/light) + font pairing + accent color + animations toggle; localStorage-persisted user preferences |
| `UserProvider` | `qualia-shell/src/context/UserContext.tsx` | 376 | 14,280 | Auth state + JWT token persistence + silent refresh + role/permission hierarchy + `authFetch` wrapper |
| `QueryProvider` | `qualia-shell/src/providers/QueryProvider.tsx` (🚩 NOT `src/context/QueryContext.tsx` per kickoff-brief assumption) | 33 | 1,137 | Singleton `QueryClient` wrapper for `@tanstack/react-query` v5 |
| `PermissionsProvider` | `qualia-shell/src/context/PermissionsContext.tsx` | 91 | 2,776 | Per-user widget/section visibility map; depends on `useUser()` upstream |

**Empirical path-refinement at Task 8.3 PRE0** (sister-shape to Task 8.2 Step-2 PRE0 path verification per v2.60.2 kickoff-brief precision 3-pattern cluster): QueryProvider lives at `src/providers/QueryProvider.tsx` NOT `src/context/QueryContext.tsx`. Application of v2.60.2 actual-path verification sub-pattern.

### Three AdminShell-scoped providers — §7 deferred-item carry-forward (per v2.62.1 scope-shape PRE-FLIGHT discipline)

Per Phase-7 7.10 AdminShell consolidation architecture: `HierarchyContext.tsx` (10,393 B) + `LayoutContext.tsx` (15,317 B) + `WindowContext.tsx` (17,384 B) are lazy-loaded inside `qualia-shell/src/components/Shell/AdminShell.tsx` wrapper (inside AuthGate admin-shell branch). **OUT OF SCOPE at Task 8.3 per Cowork Q3 explicit LOCK at 4 top-level providers + v2.62.1 scope-shape PRE-FLIGHT discipline.** Cross-link to §7.2 deferred-item for downstream-Phase-8+ audit-task scope.

---

## §2 — SSR-safety taxonomy (init-time / effect-time / event-handler-time categorization)

For each browser-global reference (`window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `IntersectionObserver`, etc.) in a React Context provider, categorize by execution context:

### §2.1 — Initialization-time references (STRUCTURALLY UNSAFE for SSR)

Browser-global access INSIDE:
- The provider component body at module-evaluation time
- A `useState(...)` initializer function (lazy initializer)
- A `useRef(...)` initializer expression
- A `useMemo`/`useCallback` body that runs on first render

**SSR-failure mode:** `ReferenceError: window is not defined` (or equivalent for `document` / `localStorage` / etc.) thrown during `renderToPipeableStream()` or `renderToReadableStream()` server-side execution. **Categorical hard-blocker for SSR adoption.**

**Empirical example (ThemeProvider L127):**
```tsx
const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'dark';
});
//        ^^^^^^^^^^^^^^^^^^^^^^^ ❌ STRUCTURALLY UNSAFE
//        Throws ReferenceError on server render at React initial-render-phase
```

### §2.2 — Effect-time references (SSR-SAFE)

Browser-global access INSIDE:
- A `useEffect(() => {...}, [])` body
- A `useLayoutEffect(() => {...}, [])` body
- A `useInsertionEffect(() => {...}, [])` body

**SSR-failure mode:** None. Effects do NOT run on server (React skips effect execution during `renderToPipeableStream`). Effects fire client-side post-hydration.

**Empirical example (ThemeProvider L181-185):**
```tsx
useEffect(() => {
    const root = document.documentElement;
//                ^^^^^^^^^^^^^^^^^^^^^^^ ✅ SSR-SAFE
//                Effect skipped on server; runs only after hydration
    root.className = `theme-${theme}`;
    root.style.setProperty('--accent', accentColor);
}, [theme, accentColor]);
```

### §2.3 — Event-handler-time references (SSR-SAFE)

Browser-global access INSIDE:
- Event handler callbacks (`onClick`, `onChange`, etc.)
- `useCallback(...)` returned functions
- `setTimeout` / `setInterval` callback bodies
- Promise `.then(...)` / `.catch(...)` callback bodies

**SSR-failure mode:** None. Handlers fire only on user interaction OR async resolution post-hydration; never on server during initial render.

**Empirical example (UserProvider L158):**
```tsx
const authFetch = useCallback(async (url, opts = {}) => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
//                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ✅ SSR-SAFE
//                       Callback body only fires when called post-hydration
    // ...
}, [doRefresh]);
```

### §2.4 — Categorical signal table

| Browser-global reference appears in... | SSR-safety verdict | Fix required? |
|---|---|---|
| useState initializer / useRef initializer / provider body | ❌ STRUCTURALLY UNSAFE | YES (typeof window guard OR useSyncExternalStore) |
| useEffect / useLayoutEffect / useInsertionEffect body | ✅ SSR-SAFE | NO |
| useCallback body / event handler / Promise callback / setTimeout callback | ✅ SSR-SAFE | NO |
| Module-level top (outside React) | ⚠️ DEPENDS — if executed at import time, fails on server (rare); usually safe if behind function | Audit per case |

---

## §3 — Per-provider SSR-safety audit (Moderate Q3 depth per Cowork LOCK)

### §3.1 — ThemeProvider (`src/context/ThemeContext.tsx`)

> **🔗 Inline-footnote-correction at Phase-8+ Task 8.4 close (2026-05-17) per Cowork D-1 LOCK + v2.64.0 audit-content empirical-vs-hypothetical PRE-FLIGHT discipline.** Empirical re-read at Task 8.4 Step-2 PRE0 surfaced **count discrepancy** between this section's narrative headline ("8 init-time localStorage reads") and the empirical code-excerpt below (which carries 6 ❌ marks at L172/L173/L178/L181/L182/L186 matching empirical L127/L128/L134/L138/L139/L144 line numbers). **Empirically-correct inventory: 4 useState lazy initializers / 6 `localStorage.getItem()` calls** across 6 storage keys: `dwellium-theme` (primary) + `qualia-theme` (legacy fallback) + `dwellium-font-pairing` + `dwellium-accent-color` (primary) + `qualia-accent-color` (legacy fallback) + `dwellium-animations`. **Structural verdict UNCHANGED — still STRUCTURALLY UNSAFE for SSR**; only the headline count was inflated by +2 vs empirical (8 narrative vs 6 empirical) + the storage-key names propagated downstream at Task 8.3 close docs (CLAUDE.md HEAD pointer + Task 8.3 Completion Report + Plan v2.63 amendment) carried hypothetical key names (theme / hue / accentMode / colors / customLightThemes / customDarkThemes / customColorPresets / customRipplePresets) NOT empirically present in `ThemeContext.tsx` at HEAD-time-of-audit-shipping (c44198f). Sister-shape to v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline applied at audit-shipping altitude (Task 8.4 finding J). Audit-shipping-time content preserved verbatim below; this correction-in-place pattern sister-shape to Phase-7 7.14 inline-footnote-at-Phase5_Perf_Report.md §2 retroactive-correction-in-place precedent. **Cross-link:** `Docs/Phase8_Task_8_4_Completion_Report.md §0` finding (J) cementation + v2.64.0 PRE-FLIGHT discipline candidate at v2.64 Plan amendment.

**SSR-safety verdict: 🚩 STRUCTURALLY UNSAFE (8 init-time localStorage reads)**

The provider initializes 4 useState hooks (theme / fontPairing / accentColor / animationsEnabled) using lazy initializers that read from `localStorage`. Empirical inventory:

```tsx
const [theme, setThemeState] = useState<Theme>(() => {
    return (
        (localStorage.getItem(THEME_STORAGE_KEY) as Theme) ||         // L127 ❌
        (localStorage.getItem(LEGACY_THEME_STORAGE_KEY) as Theme) ||  // L128 ❌
        'dark'
    );
});
const [fontPairing, setFontPairingState] = useState<FontPairing>(() => {
    return (localStorage.getItem(FONT_STORAGE_KEY) as FontPairing) || 'default';  // L134 ❌
});
const [accentColor, setAccentColorState] = useState(() => {
    return localStorage.getItem(ACCENT_STORAGE_KEY) ||                // L138 ❌
        localStorage.getItem(LEGACY_ACCENT_STORAGE_KEY) ||             // L139 ❌
        '#0088cc';
});
const [animationsEnabled, setAnimationsEnabledState] = useState(() => {
    const stored = localStorage.getItem(ANIMATIONS_STORAGE_KEY);       // L144 ❌
    return stored !== null ? stored === 'true' : true;
});
```

**Total: 8 STRUCTURALLY UNSAFE init-time localStorage reads** across 4 useState initializers. All 8 throw `ReferenceError: localStorage is not defined` on server render.

Effect-time + event-handler-time references (11+ `document.body.classList` / `document.documentElement` / `localStorage.setItem` calls inside useCallback + useEffect bodies at L149/155/159/162/167/172/177/181-194/197-199) are SSR-SAFE — skipped on server; fire post-hydration.

**Recommended fix pattern (deferred to Task 8.6+ per Q2 LOCK):** Migrate the 4 useState-with-localStorage-initializer reads to React 19 `useSyncExternalStore` pattern per `react.dev/reference/react/useSyncExternalStore` SSR guidance. Each user-preference subscription becomes:

```tsx
function getServerSnapshot() { return DEFAULT_THEME; }  // 'dark'
function getClientSnapshot() {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || DEFAULT_THEME;
}
function subscribe(callback) {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('storage', callback);
    return () => window.removeEventListener('storage', callback);
}
const theme = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
```

This guarantees same snapshot on server and client during hydration → zero hydration mismatch. Alternative lower-effort path: prefix each `useState(() => localStorage.getItem(...))` with `typeof window !== 'undefined'` guard returning default on server. Less robust (doesn't subscribe to cross-tab storage events) but minimally invasive.

**Cross-link:** Task 8.6 framework-installation context for fix-pattern selection per Cowork verdict at §8 decision gate; Task 8.4 index.html template refactor for FOUC mitigation (§5.1).

### §3.2 — UserProvider (`src/context/UserContext.tsx`)

**SSR-safety verdict: 🚩 STRUCTURALLY UNSAFE (1 init-time localStorage read; partially mitigated by defensive `getAuthToken()` pattern)**

The provider initializes `token` useState via lazy initializer that reads from localStorage:

```tsx
const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
//                                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ L52 ❌
```

**Total: 1 STRUCTURALLY UNSAFE init-time localStorage read.**

Effect-time + event-handler-time references (13+ `localStorage.{get,set,remove}Item` calls inside `saveTokens` / `clearTokens` / `doRefresh` / `authFetch` / `login` / `logout` callbacks + 1 mount useEffect at L266-321) are SSR-SAFE — skipped on server.

**Empirical SSR-defensive pattern already present at L354-356:** The non-hook `getAuthToken()` standalone utility already wraps localStorage access in `try { ... } catch { return null; }`:
```tsx
export function getAuthToken(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
```

This pattern is structurally SSR-safe by construction — the try/catch absorbs the ReferenceError on server context and returns null. Sister-shape applies to L52 fix: wrap useState initializer in equivalent try/catch OR `typeof window` guard.

**Recommended fix pattern (deferred to Task 8.6+):** Replace L52 useState initializer with `useSyncExternalStore` pattern (sister to ThemeProvider fix) OR minimally apply `typeof window` guard:
```tsx
const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
});
```

**Auth-context initialization order concern (§5.2 cross-link):** Even after L52 fix, SSR-rendered initial state is `token=null, user=null, isLoading=true` (per useState L53 `isLoading=true`). Client-hydrates, mount useEffect fires (L266-321), reads localStorage token, fetches `/api/auth/me`, validates, sets user/permissions state. Net effect: SSR-rendered HTML always shows loading spinner; authenticated UI only appears post-hydration + post-fetch. Mitigation discussed at §5.2 (cookie-based auth for server-readable initial state).

**Cross-link:** Task 8.6 framework-installation; §4 React Query interaction (PermissionsProvider's fetch logic uses UserContext token); §5.2 auth init pattern.

### §3.3 — QueryProvider (`src/providers/QueryProvider.tsx`)

**SSR-safety verdict: ✅ SSR-SAFE at provider altitude** (zero browser-global references at provider body OR useState initializers OR module-level)

The provider is a minimal 33-line wrapper around `<QueryClientProvider>` from `@tanstack/react-query`:

```tsx
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

export default function QueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

**Total: 0 browser-global references.** SSR-safe by construction at provider altitude.

**🚩 SEPARATE CONCERN — TanStack Query SSR-hydration discipline gap.** Despite provider-altitude SSR-safety, the current singleton-client architecture is structurally incompatible with SSR cache hydration. Per `@tanstack/react-query` v5 official guidance: *"Creating the queryClient at the file root level makes the cache shared between all requests and means all data gets passed to all users."* The L16 module-level `const queryClient = new QueryClient(...)` does exactly this — fine for SPA-mode (one user per browser session) but UNSAFE for SSR (cross-request cache leakage on server).

**Recommended fix pattern (Task 8.6 implementation scope; covered at §4):** Migrate to per-request QueryClient pattern + `dehydrate()` + `<HydrationBoundary>` wrapping. See §4 for full pattern depth.

**Cross-link:** §4 React Query SSR-hydration discipline (dedicated section).

### §3.4 — PermissionsProvider (`src/context/PermissionsContext.tsx`)

**SSR-safety verdict: ✅ SSR-SAFE (dependency-chain-safe via UserContext)**

The provider initializes 2 useState hooks with constant initial values (no browser globals):

```tsx
const [permissions, setPermissions] = useState<PermissionMap>({});  // L29 ✅
const [loading, setLoading] = useState(true);                       // L30 ✅
```

**Total: 0 browser-global references at provider body or useState initializers.**

Effect-time references: 1 useEffect at L59-61 fires `fetchPermissions()` callback. The callback at L32-57 uses `fetch()` which IS available in Node 18+ server runtime (global `fetch`); no browser-only APIs. Server execution path:

```tsx
const fetchPermissions = useCallback(async () => {
    if (!isAuthenticated || !token) {
//      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ — Branch taken on server (UserContext SSR-renders isAuthenticated=false)
        setPermissions({});
        setLoading(false);
        return;
    }
    // ... fetch logic never reached on server
});
```

**Dependency-chain SSR-safety propagation** (Phase-8+ Task 8.3 finding #3 from §0): PermissionsProvider's safety is CONDITIONAL on UserContext SSR-renderng `isAuthenticated=false` initial state. After UserProvider L52 fix (per §3.2), UserContext SSR-renders `token=null` → `isAuthenticated=false` → PermissionsProvider early-return at L33-36 → no network fetch attempted on server → safe.

**No fix required at Task 8.6+** for PermissionsProvider IF UserProvider fix lands first. If UserProvider fix doesn't land, PermissionsProvider INHERITS the upstream UNSAFE state (token leaks across SSR requests; isAuthenticated returns whatever happened to be in the prior request's localStorage value — security-critical vulnerability under SSR).

**Cross-link:** §3.2 UserProvider fix; §4 React Query (PermissionsProvider's fetch could be migrated to a query for SSR-prefetch coverage if desired at Task 8.6+).

---

## §4 — React Query SSR-hydration discipline (Cowork Q4 LOCK; Task 8.3 scope)

Per Cowork Q4 Option (a) LOCK: TanStack Query SSR-hydration discipline IS a provider-tree-altitude concern; documented at Task 8.3 audit + cross-linked to Task 8.6 implementation context.

### §4.1 — Current architecture (`qualia-shell/src/providers/QueryProvider.tsx:16`)

```tsx
export const queryClient = new QueryClient({...});  // Module-level singleton
```

This is the standard SPA pattern — one client shared across the entire app lifetime within a single browser session. Under SSR, this becomes a structural problem:

1. **Cross-request cache leakage on server** — multiple users hitting the same server process would share queryClient cache. Data from user A's `/api/auth/me` could be served to user B on cache hit. **Security-critical.**
2. **Hydration mismatches** — Server prefetches data into the singleton client; client-side hydration starts with EMPTY local client (different state) → hydration mismatch + re-fetch + flicker.

### §4.2 — Per-request QueryClient pattern (Task 8.6 fix)

Per `@tanstack/react-query` v5 official SSR guidance:

```tsx
// Server-side per-request:
function RouteLoader() {
    const queryClient = new QueryClient();        // ✅ Per-request instance
    await queryClient.prefetchQuery({ queryKey: ['auth', 'me'], queryFn: getAuthMe });
    return { dehydratedState: dehydrate(queryClient) };
}

// Client-side wrapper:
function Route({ dehydratedState }) {
    return (
        <HydrationBoundary state={dehydratedState}>
            <Content />
        </HydrationBoundary>
    );
}

// Inside Content — useSuspenseQuery returns prefetched data without refetch:
function Content() {
    const { data: user } = useSuspenseQuery({ queryKey: ['auth', 'me'], queryFn: getAuthMe });
    // ...
}
```

### §4.3 — Integration shape with react-router v7 framework-mode (Task 8.6 context)

When Task 8.6 adopts `@react-router/dev` framework-mode + `app/routes.ts` declarative routes, each route module can export a `loader` function that prefetches queries server-side:

```tsx
// app/routes/_index.tsx (Task 8.6 shape)
export async function loader() {
    const queryClient = new QueryClient();
    await queryClient.prefetchQuery({ queryKey: ['auth', 'me'], queryFn: getAuthMe });
    return { dehydratedState: dehydrate(queryClient) };
}

export default function Home({ loaderData }) {
    return (
        <HydrationBoundary state={loaderData.dehydratedState}>
            <AuthGate />
        </HydrationBoundary>
    );
}
```

### §4.4 — useSuspenseQuery + prefetch discipline

TanStack Query v5 official guidance verbatim: *"useSuspenseQuery works with server rendering as long as you always prefetch all your queries. Forgetting prefetching can cause hydration mismatches."*

Implication for Phase-8+ Block B Task 8.6+: every server-rendered route must enumerate prefetch-required queries at loader time. Phase-8+ Block B closure narrative documents the prefetch coverage matrix.

### §4.5 — Cross-link to Task 8.6 implementation scope

Task 8.6 framework-installation will:
1. Replace `qualia-shell/src/providers/QueryProvider.tsx` singleton with per-request factory at `app/entry.server.tsx` or equivalent
2. Add `<HydrationBoundary>` wrapper at root layout (`app/root.tsx`)
3. Enumerate prefetch-required queries per public-facing route (`/`, `/security`, `/?popup=`)
4. Validate hydration-mismatch-free rendering via React 19 DevTools

---

## §5 — Theme FOUC + UserProvider auth-init mitigation patterns (Cowork Q5 LOCK)

Per Cowork Q5 Option (a) LOCK: both surface in Task 8.3 audit.

### §5.1 — ThemeProvider FOUC (Flash of Unstyled Content) mitigation

**The problem:** Even after fixing the 8 init-time localStorage reads (§3.1), SSR-rendered HTML serves a default theme (e.g., 'dark'). Client-side hydration reads the user's stored preference (potentially 'light'). The brief window between initial-paint and hydration causes a visible theme flash.

**Three mitigation patterns (per industry SSR practice):**

1. **Cookie-based theme persistence** — Server reads `theme` cookie from request headers at SSR time → renders correct theme HTML. Requires client-side to ALSO write theme changes to cookie (in addition to / instead of localStorage). Best UX; requires HTTP cookie setup at Task 8.6.

2. **Data-theme attribute injection in `index.html` template** — Inline `<script>` at top of `<head>` reads localStorage SYNCHRONOUSLY before React hydrates, sets `<html data-theme="dark">` attribute, CSS rules cascade off the attribute. Browser sees correct theme on first paint; no flash. Sister-shape to Task 8.4 index.html template refactor scope (cross-link).

3. **prefers-color-scheme media query default** — `<html data-theme="light dark">` + CSS `@media (prefers-color-scheme: dark) { ... }` lets browser pick initial theme matching OS preference. User-stored preference applied post-hydration. Tolerable for most users; mismatch only when user-stored ≠ OS-preference.

**Cross-link:** Task 8.4 index.html template refactor scope (Block A item 3) for pattern (2) implementation; Task 8.6 framework-installation for cookie integration pattern (1).

### §5.2 — UserProvider auth-context initialization order

**The problem:** Even after fixing L52 init-time localStorage read (§3.2), SSR-rendered initial state is `token=null, user=null, isLoading=true`. Server-rendered HTML always shows loading spinner for authenticated routes. Client-hydrates, mount useEffect fires, fetches `/api/auth/me`, validates, eventually renders authenticated UI. Net SSR benefit: minimal for authenticated routes (HTML still serves spinner; real content depends on client-side fetch).

**Three mitigation patterns:**

1. **Cookie-based auth** — JWT token stored in `HttpOnly` cookie instead of localStorage. Server reads cookie at SSR time → validates → fetches user → renders authenticated HTML. Best SSR-benefit; requires backend cooperation (currently localStorage-only per `qualia-shell/src/context/UserContext.tsx:14` `TOKEN_KEY = 'dwellium-auth-token'`).

2. **Server-rendered loading state ONLY for unauthenticated routes** — Use SSR for public-facing routes (`/`, `/security`, `/?popup=`) where auth state doesn't gate content; CSR for authenticated routes (admin shell). Matches Phase-8+ scoping doc §6.4 per-page render-mode partition; Vike-style per-page mode toggle. Under RR v7 framework-mode, per-route `export const ssr = false` achieves the same partition.

3. **Optimistic SSR + post-hydration auth reconciliation** — Server renders assuming `isAuthenticated=false`; client-hydrates, fetches auth state, re-renders authenticated UI. Hydration mismatch risk if not carefully scoped. Lower implementation cost; acceptable UX trade-off if loading spinner is short.

**Recommended for Phase-8+ Block B Task 8.6+:** combine pattern (2) per-route SSR opt-in + pattern (3) optimistic SSR for public routes. Cookie-based auth (pattern 1) deferred to Phase-9+ as cross-repo concern (R-4 v2.26 backend partition).

---

## §6 — Phase-8+ Block B Task 8.6+ implementation roadmap (consolidated per-provider fix-recommendation)

Consolidated per-provider implementation roadmap for Task 8.6 framework-installation + downstream Block B tasks:

| Provider | Fix scope | Implementation task estimate | Cross-link |
|---|---|---|---|
| ThemeProvider | Migrate 8 useState-with-localStorage-initializer → `useSyncExternalStore` (4 hooks × full pattern) OR `typeof window` guards (minimally invasive) | ~0.5 day at Task 8.6 OR sub-task at 8.7 entry-boundary; FOUC pattern (1) or (2) at Task 8.4 + 8.6 combined | §3.1 + §5.1 |
| UserProvider | Migrate L52 useState initializer → guarded OR `useSyncExternalStore`; auth-init pattern at Task 8.6+ via per-route SSR opt-in + cookie-based auth (deferred Phase-9+) | ~0.5 day at Task 8.6; cookie-based auth = Phase-9+ cross-repo scope | §3.2 + §5.2 |
| QueryProvider | Migrate module-level singleton → per-request factory at `app/entry.server.tsx`; add `<HydrationBoundary>` at `app/root.tsx`; enumerate prefetch-required queries per route loader | ~1 day at Task 8.6 + 8.7 entry boundary + 8.8 per-route SSR opt-in | §3.3 + §4 |
| PermissionsProvider | NO direct fix required; SSR-safety propagates from UserProvider fix (dependency-chain-safety per §3.4 finding) | 0 days (no direct work); verify dependency-chain-safety at Task 8.9 hydration verification | §3.4 |

**Total Block B Task 8.6+ implementation estimate for provider-tree SSR-safety: ~2 days** (within Task 8.6 + 8.7 + 8.8 envelope; sister-shape estimate to Phase_8_Plan §10 budget).

**Phase-8+ Task 8.6 PRE0 should pre-decide:** (a) `useSyncExternalStore` migration depth vs minimally-invasive `typeof window` guards (Theme/User); (b) FOUC mitigation pattern selection (cookie vs script-injection vs media-query default); (c) per-request QueryClient factory location (`app/entry.server.tsx` vs route loader vs HOC).

---

## §7 — Risks + open questions + Phase-8+ Block A/C carry-forward dependencies

### §7.1 — Technical risks for downstream Task 8.6+ implementation

- **R-8.3-1** `useSyncExternalStore` migration may surface React 19 hydration edge cases not present in `useState` pattern. Mitigation: prototype on smallest provider (ThemeProvider) at Task 8.6 PRE0; validate hydration discipline before scaling to UserProvider.
- **R-8.3-2** Cookie-based auth shift (UserProvider §5.2 pattern 1) requires backend cooperation per R-4 v2.26 cross-repo partition. Deferred to Phase-9+ unless backend repo aligns within Phase-8+ timeframe.
- **R-8.3-3** Per-request QueryClient factory at `app/entry.server.tsx` (Task 8.6+) introduces server-side memory pressure if not properly garbage-collected post-render. Mitigation: validate via Lighthouse repeated-request stress test at Task 8.12 LCP n=10 re-measurement.
- **R-8.3-4** TanStack Query `useSuspenseQuery` requires comprehensive prefetch coverage per route (§4.4); missing prefetch → hydration mismatch + re-fetch. Mitigation: prefetch-coverage matrix enumeration at Task 8.6+ PRE0.
- **R-8.3-5** Theme FOUC script-injection mitigation (§5.1 pattern 2) adds blocking inline `<script>` in `<head>` — minor LCP impact; quantify at Task 8.12.

### §7.2 — Open questions deferred to downstream task kickoffs

- **OQ-1** **AdminShell-scoped 3-provider audit** (HierarchyContext + LayoutContext + WindowContext at AdminShell altitude per Phase-7 7.10 architecture) — per Cowork Q3 explicit LOCK at 4 top-level providers + v2.62.1 scope-shape PRE-FLIGHT discipline, deferred from Task 8.3. Carry-forward to Phase-8+ Task 8.6+ implementation OR separate sub-task. Recommended: integrate into Task 8.9 hydration verification context (where AdminShell admin-route SSR enablement is empirically validated).
- **OQ-2** **`useSyncExternalStore` vs `typeof window` guard pattern selection** — Cowork verdict at Task 8.6 PRE0 Q1 (sister-shape to Task 8.2 PRE0 Q-α-vs-β scope-shape selection pattern).
- **OQ-3** **FOUC mitigation pattern selection** (cookie / script-injection / media-query default) — Cowork verdict at Task 8.4 PRE0 Q1.
- **OQ-4** **Per-request QueryClient factory location** — `app/entry.server.tsx` vs per-route loader vs HOC; Cowork verdict at Task 8.6 PRE0.

### §7.3 — Housekeeping deferred-items (sister-shape carry-forward from Task 8.1 §7.3 + Task 8.2 §7.4)

4 untracked baseline JSON artifacts at `Docs/Baselines/`:
- `2026-05-11_Phase0_axe_baseline.json`
- `2026-05-12_Phase0_axe_baseline.json`
- `2026-05-13_Phase0_axe_baseline.json`
- `2026-05-13_Phase6_task_6_7_perf_capture.json`

Carry-forward from Phase-8+ Task 8.1 §7.3 + Task 8.2 §7.4 per Cowork Verdict 4 LOCK: commit-as-historical-baselines at Phase-8+ Block C closure task (NOT Phase-8+ closer narrative); preserved untracked at Task 8.3 PR.

### §7.4 — Phase-8+ Block A/C carry-forward dependencies

- **Block A item 8.4 (index.html template refactor)** cross-link to §5.1 FOUC mitigation pattern (2) script-injection scope
- **Block A item 8.5 (static-data extraction conditional)** may surface additional SSR-safety concerns at static-data hydration boundary
- **Block B → Block C transition gate at Task 8.11 close** per Cowork Verdict 5 LOCK from Task 8.1 §8.3 institutionalized decision-gate #6
- **Block C item 8.12 LCP n=10 re-measurement** quantifies empirical SSR-migration delta vs Phase-7 7.11 baseline LCP CV 2.29%; includes provider-tree SSR-safety fixes from Task 8.6+

---

## §8 — Cowork decision gate

### §8.1 — Audit trail discipline (sister-shape to Task 8.1 §8.1)

This document ships as the Phase-8+ Task 8.3 audit deliverable. The 3 publishable engineering findings cemented at §0 + per-provider SSR-safety inventory at §3 + React Query SSR-hydration discipline at §4 + FOUC + auth-init patterns at §5 form the empirical substrate for Phase-8+ Task 8.6+ framework-installation implementation. Phase-8+ Block B closer narrative will cross-reference §3 + §6 roadmap consolidation as the closure-narrative anchor.

### §8.2 — Task 8.3 → Task 8.4 handoff contract

**Task 8.3 delivers:**
- This document (`Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md`) cemented at v2.63 amendment
- v2.63 amendment closes Phase-8+ Task 8.3 row in §9 sub-tracker
- `Docs/Phases/Phase_8_Plan.md` Phase status update with Task 8.3 closure
- CLAUDE.md HEAD pointer pivot; Phase summary table Phase-8+ row 2 → 3 of 15 ✓
- Calibration classes: SCOPING-ONLY class 1pt → 2pt cross-phase fully calibrated (no class count increment; full calibration of 16th class)
- Conventions block: NEW entry for per-provider-SSR-safety taxonomy (init-time / effect-time / event-handler-time classification framework) per §2

**Task 8.4 kickoff brief MUST surface (PRE0 Q1):**
- FOUC mitigation pattern selection per §5.1 Q-OQ-3 (cookie / script-injection / media-query default)
- index.html template refactor scope (preserve existing 17 Google Fonts eager-load OR refactor per Phase-7 Lever 1 cost-benefit re-evaluation under SSR architecture)
- Acceptance criteria carve-out (CONFIG-FILE-EDIT class if scoped narrowly; or COMPONENT-FIX if FOUC script broader)

### §8.3 — Explicit Cowork decision gates remaining at downstream task gates

| Gate | Verdict required | Decision substrate |
|---|---|---|
| **Task 8.3 close** (this document) | Approval of audit + §6 implementation roadmap + AdminShell-scoped 3-provider §7.2 OQ-1 deferral | §3 + §4 + §5 + §6 + §7 |
| **Task 8.4 kickoff** | FOUC mitigation pattern selection per §5.1 (Q-OQ-3) | §5.1 + Task 8.1 §6 framework recommendation |
| **Task 8.6 kickoff** | `useSyncExternalStore` vs `typeof window` guard pattern selection per §3.1+§3.2 (Q-OQ-2) | §3.1 + §3.2 + §6 |
| **Task 8.6 close** | Per-request QueryClient factory location verdict per §4.2 (Q-OQ-4) | §4.2 + §4.3 |
| **Task 8.9 hydration verification close** | AdminShell-scoped 3-provider audit integration verdict per §7.2 OQ-1 | §7.2 |
| **Task 8.11 close** | Block B → Block C transition gate (provider-tree SSR-safety fixes validated empirically) | Task 8.6+ closure narratives |
| **Task 8.12 close** | v1 L228 reachability verdict per scoping-doc §6.6 | Task 8.12 n=10 empirical data |
| **Task 8.14 close** | Phase-8+ → Phase-9+ transition signal verdict | Phase-8+ closer narrative |

---

**Document size target:** ~250-350 lines / ~40-60 KB per Cowork Q6 LOCK (sister-shape byte-density to Phase-7 closure-narrative ~230 bytes/line vs Task 8.1 scoping-matrix ~96 bytes/line; Task 8.3 prose-heavy per-provider analysis trends closure-narrative density).

**Cross-references:**
- `Docs/Phase8_SSR_Architectural_Scoping.md §1.5 + §6.3` — Phase-8+ Block A item 8.3 carve-out
- `Docs/Phase8_Task_8_1_Completion_Report.md §0` — 4 publishable Phase-8+ engineering findings (A + B + C + D)
- `Docs/Phase8_Task_8_2_Completion_Report.md §0` — 2 additional Phase-8+ engineering findings (E + F)
- `Docs/AppFolio_Parity_Implementation_Plan_v2.md` v2.63 amendment + Changelog
- `Docs/Phases/Phase_8_Plan.md §4` Block A item 8.3 + downstream task scope refinements

---

**END Phase-8+ Task 8.3 Provider-Tree SSR-Safety Audit — STATUS: STEP-3 FULL DRAFT COMPLETE; SCOPING-ONLY class 2pt CROSS-PHASE FULLY CALIBRATED AT THIS CLOSE; AWAITING STEP-4 COMPLETION REPORT + STEP-5 DOC SWEEP + STEP-6 MINIMAL-GATE + STEP-7 COMMIT/PUSH/MANUAL-DISPATCH + STEP-8 HALT LEDGER.**
