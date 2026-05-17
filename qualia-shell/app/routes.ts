import { type RouteConfig, route } from '@react-router/dev/routes';

/**
 * Phase-8+ Task 8.6 — React Router v7 framework-mode declarative route config
 *
 * Ports Task 8.2 library-mode `<Routes><Route>` JSX shape at
 * `qualia-shell/src/App.tsx::L143-148` into RR v7 framework-mode declarative
 * config. 3-branch routing semantic preserved byte-for-byte from Task 8.2:
 *
 *   - `/security`        → routes/security.tsx → SecurityRoute (Branch 1; viewport-fill; no providers)
 *   - `/?popup=key`      → routes/default.tsx  → DefaultRoute → popup conditional (Branch 2; 4 providers)
 *   - `/` (splat default) → routes/default.tsx  → DefaultRoute → AuthGate (Branch 3; 3 providers)
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
    route('*', 'routes/default.tsx'),
] satisfies RouteConfig;
