/**
 * Phase-8+ Task 8.6 — `/security` route file (Branch 1 semantic preserved)
 *
 * Thin re-export bridging RR v7 framework-mode route registry to existing
 * SecurityRoute implementation at `qualia-shell/src/App.tsx::SecurityRoute()`.
 * Preserves Task 8.2 library-mode `<Route path="/security" element={<SecurityRoute />} />`
 * shape byte-for-byte.
 *
 * Branch 1 semantic: viewport-fill SecurityPortal; NO provider tree (sister
 * to Task 8.2 Branch 1 implementation at `src/App.tsx::L82-88`); lazyWithReload
 * wraps `SecurityPortal` for Phase-7 7.10 LCP-reduction lever preservation.
 *
 * Task 8.7 (entry boundary creation) may consolidate this route logic
 * directly into app/routes/security.tsx + remove the cross-directory
 * import — at which point this file becomes the canonical SecurityRoute
 * implementation rather than a re-export bridge.
 */
export { SecurityRoute as default } from '../../src/App';
