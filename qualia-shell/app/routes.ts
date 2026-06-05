import { type RouteConfig, index, route } from '@react-router/dev/routes';

/**
 * Phase-8+ Task 8.6 — React Router v7 framework-mode declarative route config
 *
 * Ports Task 8.2 library-mode `<Routes><Route>` JSX shape at
 * `qualia-shell/src/App.tsx::L143-148` into RR v7 framework-mode declarative
 * config. 3-branch routing semantic preserved byte-for-byte from Task 8.2:
 *
 *   - `/security`        → routes/security.tsx → SecurityRoute (Branch 1; viewport-fill; no providers)
 *   - `/?popup=key`      → routes/default.tsx  → DefaultRoute → popup conditional (Branch 2; 4 providers)
 *   - `/`                → routes/default.tsx  → DefaultRoute → AuthGate (Branch 3; 3 providers)
 *   - any other path     → routes/default.tsx  → DefaultRoute (splat catch-all)
 *
 * Phase-8+ Task 8.6 v2.66.3 (2026-05-17): `index('routes/default.tsx')` route
 * declaration ADDED per Cowork Verdict 6 Z1 LOCK in response to Step-4-bis
 * chromium-headless probe Finding U (revised at Verdict 7 to routing-config
 * altitude): RR v7 framework-mode `route('*', 'file')` splat semantic at SPA
 * Mode runtime does NOT match root path `/` (structural API divergence from
 * RR v6 library-mode where `<Route path="*">` matched `/`). Canonical RR v7
 * framework-mode pattern uses `index('file')` helper for root-path matching.
 * Empirical pre-fix signature: chromium-headless probe of vite preview
 * --outDir build/client against `/` returned HTTP 200 with our Root() head
 * <title> rendering correctly but `<Outlet />` body content empty (no
 * DefaultRoute → no LoginScreen → no .login-start-overlay). 7th altitude of
 * v2.60.1 falsified-hypothesis empirical-verification PRE-FLIGHT discipline
 * cluster (hypothesis-content + implementation-shipping + audit-shipping +
 * scope-existence + install-shipping + empirical-CI-runtime [refuted-then-
 * recast] + routing-config). Sister-shape to v2.66.1 build-command in-place
 * patch + v2.66.2 server-startup in-place patch within single Task 8.6 close
 * cycle — establishes 3-in-place-patches-per-task precedent at Phase-8+
 * Block B opener (extends Phase-7 Task 7.3 v2.50.1+v2.50.2 2-in-place-patch
 * shape).
 *
 * NOTE on `{ id: 'splat' }` on the catch-all `route('*', ...)`: RR v7
 * framework-mode derives default route IDs from file paths; two routes
 * pointing to the same file (`routes/default.tsx`) collide on default ID
 * `routes/default`. Explicit `id` disambiguates per RR v7 RouteConfig
 * options. Empirical refutation surfaced at Step-4-bis Z1.B build attempt
 * post-index()-add: "Error: Unable to define routes with duplicate route id:
 * 'routes/default'" — 8th altitude of v2.60.1 cluster (route-id-derivation
 * altitude) recursively-surfaced within Z1.A patch cycle itself.
 *
 * Route component logic lives at `qualia-shell/src/App.tsx::SecurityRoute()`
 * + `qualia-shell/src/App.tsx::DefaultRoute()` (named exports). app/routes/
 * files are thin re-exports that bridge RR v7 framework-mode route registry
 * to existing route component implementations. Task 8.7 (entry boundary
 * creation) will consolidate routing logic into app/routes/ filesystem
 * entirely + remove src/App.tsx default export + cut over from src/main.tsx
 * + index.html SPA entry points to RR v7 framework-mode entry points.
 */
export default [
    route('/security', 'routes/security.tsx'),
    // Server-side reverse proxy for same-origin /api/* → backend (:3000).
    // More specific than the '*' splat below, so /api/* matches here (not the SPA shell),
    // which is what was returning 405 for relative fetch('/api/...') calls in this deployment.
    route('/api/*', 'routes/apiProxy.tsx'),
    index('routes/default.tsx'),
    route('*', 'routes/default.tsx', { id: 'splat' }),
] satisfies RouteConfig;
