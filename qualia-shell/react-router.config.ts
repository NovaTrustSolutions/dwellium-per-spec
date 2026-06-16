import type { Config } from '@react-router/dev/config';

/**
 * Phase-8+ Task 8.6 — React Router v7 framework-mode config
 *
 * `ssr: false` initial state per Cowork Q3.d LOCK at PRE0 — preserves
 * SPA behavior empirically at HEAD-post-8.5; SSR enablement gated on
 * provider-tree SSR-safety remediation arc (Phase-8+ Task 8.9 hydration
 * verification per `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md`
 * findings G/H/I — 2-of-4 STRUCTURALLY UNSAFE providers; ThemeProvider
 * 8 init-time localStorage reads + UserProvider 1 init-time read require
 * `useSyncExternalStore` migration OR lazy-initializer-with-typeof-window
 * guards before `ssr: true` flip is structurally viable).¹
 *
 * Once Task 8.9 closes the provider-tree SSR-safety remediation arc,
 * this file flips `ssr: false → true` to enable framework-mode SSR
 * rendering — that flip is the Phase-8+ → Phase-9+ transition signal
 * per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6`.²
 *
 * ─────────────────────────────────────────────────────────────────────
 * ¹ Phase-8+ Task 8.9 Finding AA / Verdict 5(c) LOCK footnote-correction
 *   (shipped 2026-05-18): the "ThemeProvider 8 init-time localStorage
 *   reads" framing above is hypothetical pre-Task-8.4 — empirically
 *   corrected to **6 init-time reads** (4 primary keys: `dwellium-theme`
 *   + `dwellium-font-pairing` + `dwellium-accent-color` +
 *   `dwellium-animations` + 2 legacy fallbacks: `qualia-theme` +
 *   `qualia-accent-color`) per Task 8.4 Finding J + audit doc §3.1
 *   D-1 LOCK footnote-correction. UserProvider's "1 init-time read"
 *   above is empirically correct (`TOKEN_KEY = 'dwellium-auth-token'`
 *   at `UserContext.tsx:52`). Sister-shape to Plan §4 L116
 *   footnote-correction at Task 8.5 Finding M (Phase-plan-doc altitude)
 *   + audit doc §3.1 footnote at Task 8.4 (audit-doc altitude) +
 *   audit doc §3.2 + L23 footnotes at Task 8.9 (within-doc cross-altitude).
 *   v2.64.0 audit-content cross-altitude PRE-FLIGHT discipline at NEW
 *   altitude: **production-source-config-file-JSDoc-altitude**.
 *
 * ² Phase-8+ Task 8.9 PROVIDER-SSR-REMEDIATION class shape (19th
 *   cumulative project-wide class) shipped 2026-05-18: ThemeProvider's
 *   4 useState lazy initializers + UserProvider's L52 token useState
 *   lazy init migrated to `useSyncExternalStore` + `getServerSnapshot`.
 *   `ssr` stays `false` at HEAD-post-8.9 — atomic `ssr: false → true`
 *   flip + smoke-test bundle DEFERRED to **Task 8.11** per Verdict 1
 *   LOCK (Sidebar + AdminShell 3-provider tree remediation DEFERRED to
 *   Task 8.10 per Finding DD; Block B 8.9 = provider-remediation-only).
 *
 * ³ Phase-8+ Task 8.11 ssr-flip enablement (PR #80 / squash-SHA TBD):
 *   `ssr: false → true` flip cemented at this commit per Cowork Q1 LOCK
 *   Option D HYBRID (PROVIDER-SSR-REMEDIATION 2pt → 3pt
 *   CROSS-TASK-SHAPE-ROBUSTNESS extension + FRAMEWORK-INSTALLATION 2pt
 *   → 3pt CROSS-TASK-SHAPE-ROBUSTNESS extension co-shipping). Smoke-test
 *   verification at NEW `Scripts/smoke_test_ssr_phase8.mjs` validates
 *   14 cumulative `createLocalStorageStore`-factory-produced stores
 *   under true SSR runtime (zero `ReferenceError` + zero hydration
 *   mismatch warnings). Finding EE AuthGate hydration-flash empirically
 *   resolved per Q2 LOCK Option α — flash exists at BOTH `ssr:false`
 *   AND `ssr:true`; `ssr:true` empirically IMPROVES UX (1 transition
 *   spinner → final-view vs 2 transitions HydrateFallback → spinner →
 *   final-view at `ssr:false`). `@react-router/serve@7.15.1` installed
 *   as production dep per Q5 LOCK + Finding S production-deps placement
 *   convention. Block B 6-of-6 closer + 4-of-4 Phase-8+-introduced
 *   classes EXTENDED PAST FULL CALIBRATION milestone at this close.
 *   See `Docs/Phase8_Task_8_11_Completion_Report.md` for full closure
 *   narrative.
 */
export default {
    // SSR locally + in CI (the strict-gate smoke test serves build/server/index.js).
    // On Netlify we build a STATIC SPA instead (ssr:false) — the full SSR server
    // bundle exceeds Netlify's Function upload limit ("request body too large"),
    // and this login-gated shell gains nothing from SSR. NETLIFY is set during
    // Netlify's own builds.
    ssr: !process.env.NETLIFY,
} satisfies Config;
