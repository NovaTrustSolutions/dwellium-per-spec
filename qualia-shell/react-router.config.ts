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
 * guards before `ssr: true` flip is structurally viable).
 *
 * Once Task 8.9 closes the provider-tree SSR-safety remediation arc,
 * this file flips `ssr: false → true` to enable framework-mode SSR
 * rendering — that flip is the Phase-8+ → Phase-9+ transition signal
 * per `Docs/Phase8_SSR_Architectural_Scoping.md §6.6`.
 */
export default {
    ssr: false,
} satisfies Config;
