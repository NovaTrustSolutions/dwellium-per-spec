/**
 * Phase-8+ Task 8.6 — `*` splat route file (Branches 2 + 3 semantic preserved)
 *
 * Thin re-export bridging RR v7 framework-mode route registry to existing
 * DefaultRoute implementation at `qualia-shell/src/App.tsx::DefaultRoute()`.
 * Preserves Task 8.2 library-mode `<Route path="*" element={<DefaultRoute />} />`
 * shape byte-for-byte.
 *
 * Branch 2 semantic: `/?popup=key` mode → ThemeProvider + UserProvider +
 *   QueryProvider + PermissionsProvider tree + PopupShell (4 providers).
 * Branch 3 semantic: default `/` mode → ThemeProvider + UserProvider +
 *   QueryProvider + AuthGate tree (3 providers; PermissionsProvider scoped
 *   to admin-shell sub-branch inside AuthGate).
 *
 * `useSearchParams()` declarative query-param read (RR v7 hook) replaces
 * imperative `URLSearchParams(window.location.search)` per Task 8.2 migration.
 *
 * Task 8.7 (entry boundary creation) may consolidate this route logic
 * directly into app/routes/default.tsx — at which point this file becomes
 * the canonical DefaultRoute implementation rather than a re-export bridge.
 */
export { DefaultRoute as default } from '../../src/App';
