# Dwellium (qualia-shell) — Full Project Overview

*Prepared 2026-05-23. State-of-record: `main` @ `f312b3d` (Phase-9+ closer). This is a readable walkthrough of what the project is, how it's built, the engineering arc that got it here, and where it stands today.*

---

## 1. What it is

**Dwellium** (codebase name `qualia-shell`) is a property-management web application built to reach **feature parity with AppFolio**, the property-management SaaS. The repo `NovaTrustSolutions/dwellium-per-spec` wraps the app as a subtree under `qualia-shell/`, alongside the engineering documentation and CI tooling that drove it to production readiness.

The product is structured as a **desktop-style "shell"** — a windowed environment that hosts a collection of widgets rather than a single fixed page. The headline surface is the **Strata dashboard**, the property-management workspace (accounting, leasing, maintenance, properties, residents, owners, vendors, and an overview). Around it sits a suite of **AI tools** and **filing-cabinet utilities**, all registered in a single widget registry and openable as windows or popups.

The login flow is a stylized "terminal access" splash → avatar pick (Andy / Lisa / Wendy / Lee, each a different role) → passphrase gate. Behind the gate, the shell loads the user's workspace.

---

## 2. Architecture at a glance

| Layer | Technology / pattern |
|---|---|
| Framework | React 19 + React Router v7 (**framework mode**, `app/` entry boundaries) |
| Build | Vite 6 via `@react-router/dev`; SPA-shell + **SSR enabled** (`ssr: true`) |
| Server runtime | `@react-router/serve` (`build/server/index.js`) |
| State | React Context providers migrated to `useSyncExternalStore` + a `createLocalStorageStore` factory (SSR-safe) |
| Data | Dual-mode API: **static mode** (`VITE_USE_STATIC_API=true`, no backend) vs. **backend mode** (hits `/api/dwellium`) |
| Seed data | `VITE_APPFOLIO_SEEDS` gates the AppFolio-derived demo data layer |
| Auth | `AuthGate` (token in `localStorage`); separate `/security` route; popup mode via `/?popup=<key>` |
| Widgets | `WIDGET_REGISTRY` single source of truth; `lazyWithReload` dynamic imports with reload-on-chunk-miss |
| Resilience | Per-column `AdapterBoundary` isolation so one crashing widget can't take down the shell |

**Routing (3 branches)** — defined in `app/routes.ts`:

- `/security` → `SecurityRoute` (viewport-fill, no providers)
- `/` → `DefaultRoute` → `AuthGate` (the normal authenticated shell)
- `/?popup=<key>` → `DefaultRoute` → `PopupShell` (a single widget popped out standalone)

**Provider tree** wraps the default route: Theme → User → Query (`@tanstack/react-query`) → and, inside the admin shell, Permissions / Layout / Hierarchy / Window providers. All browser-global access was audited to a 3-altitude SSR-safety taxonomy (init-time-unsafe / effect-time-safe / event-handler-safe) and the unsafe ones migrated to SSR-safe stores.

---

## 3. What's in the shell

**26 registered widgets** (from `src/registry/widgetRegistry.ts`):

| Group | Widgets |
|---|---|
| Property Management | `strata-dashboard`, `astra-dashboard`, `universal-shell`, `tenant-portal-mgmt`, `home-upkeep-ai`, `georgia-code` |
| Productivity | `inbox`, `inbox-zero`, `tasks`, `trello-board`, `automation-hub`, `notepad`, `terminal`, `control-panel` |
| AI Tools | `ara-console`, `stella-agent`, `hydra-ai`, `thought-weaver`, `notebooklm-context`, `two-brains`, `transcription`, `fact-check-log` |
| Filing Cabinet | `file-manager`, `doc-viewer`, `pdf-gear`, `template-generator` |

**Strata dashboard** is the deepest surface: ~33 modules, with the largest being PropertiesModule (~2,438 LOC), LeasingModule (~1,255), VendorsModule (~1,238), and the ComplianceEngine (~1,121). It uses a sub-sidebar + list-panel + detail-panel 3-column layout and opens at 1100×800 by default so the grid doesn't collapse.

**TranscriptionHub** (~2,874 LOC) is a standout: live microphone transcription via `@moonshine-ai/moonshine-js`, fact-check, legal scan, and three export formats.

---

## 4. The engineering arc (Phases 0–9)

The repo was driven through a disciplined, phase-by-phase hardening program. Each phase shipped via PRs gated by a CI parity-gate (`tsc -b`, `vitest`, dual-mode builds, PII scan), with a closure report per phase.

| Phase | Theme | Outcome |
|---|---|---|
| 0–1 | Baseline + foundations | Exit-gate baselines established |
| 2 | Feature build-out | 10 PRs, +87 tests |
| 3 | Hardening | 9 PRs, +32 tests |
| 4 | Stabilization | 7 PRs, first byte-identical build chunk across tasks |
| 5 | Feature parity | 10 PRs, +35 tests |
| 6 | Production readiness | 11 PRs; **zero WCAG AA violations** met on the 4-page scope |
| 7 | a11y + CI + perf + test infra | 14 PRs; Linux Playwright visual-regression baselines; lazy-load perf levers |
| 8+ | **SSR architectural migration** | 15 PRs, +19 tests; React Router v7 framework mode, `ssr: true`, all providers → `useSyncExternalStore`; **−30% LCP** at the measurement task |
| 9+ | **Scoping / audit / measurement / decision** | 6 PRs, **0 production-source changes**; settled the LCP objective and closed remaining housekeeping |

Total automated test suite at HEAD: **278 vitest tests across 39 files**, all green.

Two cross-cutting engineering disciplines are worth calling out, because they show up all over the docs: a **branch-base discipline** (every feature branch cut from the immediately-prior squash on `main`), and a **recursive-validation discipline** (treat cited sources — even the project's own docs — as hypotheses to verify empirically, which repeatedly caught stale assumptions).

---

## 5. The two v1 commitments

The spec pinned two hard quality gates:

- **L230 — zero WCAG 2.1 AA violations.** **Met and sustained.** Achieved on the core page scope at Phase 6 and held through every subsequent phase (Phase 9 touched no source, so there was no regression surface).

- **L228 — Largest Contentful Paint ≤ 500 ms.** **Resolved as structurally unattainable under v1 scope** (an engineering-judgment verdict locked 2026-05-23, not a mathematical impossibility proof). The investigation is the most interesting story in the project:
  - LCP improved across phases: **4,653 → 3,903 → 2,724 ms** (a cumulative **−41%**), but stalled at ~5.4× the gate.
  - Phase 9 ran two architectural levers as proofs-of-concept and **empirically refuted both**: a CDN-edge HTML cache moved LCP only −1.5%, and island/partial hydration was a non-starter because total blocking time was already zero (no JS cost to cut).
  - The residual LCP was attributed to a **CSS animation on the login text** (`.login-start-text`, a 3-second opacity pulse) that inflates Lighthouse's measured render-delay by ~1,095 ms — but this is a **measurement artifact, not a user-perceived delay** (the text is fully legible the whole time). Fixing it was scoped, deemed metric-hygiene-only, and deliberately deferred.
  - Conclusion: crossing 500 ms would require a fundamental re-architecture (a separate static/SSR landing replacing the SPA shell), which is out of v1 scope. The −41% improvement is retained as the progress record.

---

## 6. Where it stands today

Phase 9 is fully closed and the project is at a natural stopping point. **Nothing required remains.** The open threads are all optional, cosmetic, or monitoring-only:

- **A2 / A3 — AuthGate hydration-flash polish.** Two alternative implementations of the same cosmetic fix (Suspense fallback vs. pre-hydration cookie); pick at most one. No performance motivation now that the LCP gate is settled.
- **`.gitignore` gap.** `qualia-shell/build/` and `qualia-shell/.react-router/` aren't ignored — they show as untracked but have never been committed. One-line cleanup.
- **`nebula-bg.mp4`** (70.96 MiB) — accepted and monitored; under GitHub's 100 MB hard limit. Revisit only if a future push approaches the limit.
- **CSS-animation LCP fix** — deferred, not authorized; only matters if a future lever needs a clean Lighthouse baseline.

---

## 7. How to run it locally

> The original README's quick-start (`npx vite build` / `vite preview`) is **stale** — after the Phase-8 React Router v7 framework-mode migration, `npx vite build` silently no-ops. Use the commands below.

**Fastest — dev server with hot reload, no backend needed:**

```bash
cd qualia-shell
VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npm run dev
# open the URL it prints (typically http://localhost:5173)
```

**Production build + SSR serve (what actually ships):**

```bash
cd qualia-shell
VITE_USE_STATIC_API=true VITE_APPFOLIO_SEEDS=true npm run build
npx react-router-serve build/server/index.js
# open http://localhost:3000
```

(The static-API flag is inlined at **build** time, which is why it goes on the build command, not the serve command.)

**Logging in:**

1. Click the splash overlay ("Click to Access Terminal").
2. Pick an avatar — **Andy** (god/full access), Lisa (corporate), Wendy (management), or Lee (maintenance).
3. Passphrase: **`Comet2878!`**

---

*This overview is a generated, uncommitted summary. The authoritative per-phase narrative lives in `Docs/Phase<N>_Closure_Report.md`; the working index is `CLAUDE.md`.*
