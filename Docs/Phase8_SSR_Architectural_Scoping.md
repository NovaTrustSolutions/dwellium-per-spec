# Phase-8+ Task 8.1 — SSR-Rendered Shell Architectural Scoping

> **Phase-8+ OPENER.** This document is the empirical-architecture-inventory deliverable that anchors the Phase-8+ SSR migration arc. It is **not** a measurement report and **not** a production-source-edit task — it is the forward-scoping discipline that surfaces the substantive engineering findings on which Phase-8+ Block B framework-adoption tasks will be built. Sister-shape to `Docs/Phase7_Closure_Report.md §2` engineering-finding catalog depth, applied prospectively rather than retrospectively.

---

## §0 — Cover

| Field | Value |
|---|---|
| **Phase** | Phase-8+ |
| **Task** | 8.1 — SSR-rendered shell architectural scoping (OPENER) |
| **Date** | 2026-05-16 |
| **Branch** | `phase-8/task-8.1-ssr-shell-architectural-scoping` |
| **Base SHA** | `cfa9d0f` (Phase-7 closer; 14-of-14 ✓ FULL CLOSURE) |
| **Class** | **SCOPING-ONLY** (NEW; project-wide 16th cumulative class) |
| **Cowork-locked verdicts** | Q1 NEW class SCOPING-ONLY ✓ / Q2 Option A SSR architectural scoping ✓ / Q3 Option (b) moderate 13-17 task envelope ✓ / Q4 Option (a) adopt v2.60.1-v2.60.6 at v2.61 OPENING ✓ / Q5 Phase-8+ §9 column at OPENING ✓ / Q6 task numbering 8.1-8.N ✓ / Q7 Option (α) architectural scoping only ✓ |
| **PRE0 Cowork verdicts** | Q-A Option (b) qualitative architectural claims; defer quantitative to Block B ✓ / Q-B carve out Task 8.2 explicitly for imperative-routing fix ✓ / Q-C cover Custom Vite SSR with "NOT RECOMMENDED" framing ✓ / Q-D cover TanStack Start with explicit RC-stage risk inventory ✓ / Q-E approve 14-task envelope (4 + 6 + 4) + closer = 15 ✓ |
| **Deliverable shape** | DOC-only; no production source touched; minimal-gate (tsc + vitest + PII; SKIP vite builds) |
| **Carry-forward source** | `Docs/Phase7_Closure_Report.md §8` (14 carry-forward items in 3 blocks + 2 process improvements) |

### Four publishable-level Phase-8+ engineering findings surfaced at 8.1 (foregrounded per Cowork acknowledgment)

1. **Imperative-routing SSR-incompatibility surface at `qualia-shell/src/App.tsx` L79 + L89 is a categorical hard-blocker structurally identical across all 5 framework candidates.** `window.location.pathname` (L79) and `new URLSearchParams(window.location.search)` (L89) reference browser globals at App component evaluation time — throws `ReferenceError: window is not defined` on every server render attempt regardless of framework choice. **Promotes a pre-framework-adoption fix to Phase-8+ Block A critical path as Task 8.2.**
2. **Phase-7 perf optimization carry-forward is framework-conditional.** Vike + React Router v7 framework-mode + TanStack Start preserve `vite.config.ts` and the Phase-7 chunking + `lazyWithReload` architecture (7.10 OUTCOME C SHIP). **Next.js discards them categorically** per official migration guide Step 9 (*"Delete vite.config.ts, main.tsx, index.html, vite-env.d.ts, tsconfig.node.json; uninstall Vite dependencies"*). Phase-7's substantive engineering record (LCP CV 2.29% noise floor at HEAD-post-7.10; React.lazy expansion lever −550 ms / −12.4%) materially affects the framework-choice calculus.
3. **Custom Vite SSR is upstream-disclaimed as a framework-author-only API**, not an application-integration pattern. Vite docs verbatim: *"This is a low-level API meant for library and framework authors."* Substantively eliminates one candidate from the production decision tree; covered in §3e for audit-trail completeness with explicit "NOT RECOMMENDED" framing.
4. **TanStack Start RC stage as of 2026-05 is a production-risk inflection.** Recently graduated to Release Candidate; feature-complete + stable API per docs but less battle-tested than Next.js / React Router v7 (Remix-merged) / Vike. **Structurally distinct from the production-stability principle behind Phase-7's React 19 + Vite 6 SPA architecture decision** — recommend deferral to Phase-9+ revisit if/when stable 1.0 lands within Phase-8+ timeframe.

---

## §1 — Current SPA architecture inventory (ground truth at HEAD `cfa9d0f`)

### §1.1 — `qualia-shell/src/App.tsx` (117 lines)

3-branch inline conditional routing using browser globals at component-evaluation time. Empirical excerpts:

```tsx
// L79 — Branch 1: standalone /security route
if (window.location.pathname === '/security') {
    return (
        <Suspense fallback={<AppSuspenseFallback variant="viewport" label="Loading security portal…" />}>
            <SecurityPortal />
        </Suspense>
    );
}

// L89 — Branch 2: popup mode via ?popup=ComponentName query param
const popupParam = new URLSearchParams(window.location.search).get('popup');
if (popupParam) { /* PopupShell render … */ }

// L108-116 — Branch 3 (default): AuthGate (LoginScreen | TenantPortal | AdminShell)
return (
    <ThemeProvider>
        <UserProvider>
            <QueryProvider>
                <AuthGate />
            </QueryProvider>
        </UserProvider>
    </ThemeProvider>
);
```

- **6 lazy components via `lazyWithReload`** (Phase-7 7.10 architecture preserved): `AdminShell`, `TenantLoginScreen`, `TenantPortal`, `SecurityPortal`, `PopupShell` (named-export wrapped per Phase-7 7.10 Step-4 tsc-caught), `OpenJarvisWidget`.
- **4 nested providers per branch:** `ThemeProvider` → `UserProvider` → `QueryProvider` → (`PermissionsProvider` for admin branch; absent for tenant branch).
- **🚩 Critical SSR-incompatibility:** L79 + L89 reference `window` at App.tsx component body — would throw `ReferenceError: window is not defined` on every server render attempt under ALL 5 frameworks.

### §1.2 — `qualia-shell/vite.config.ts` (19 lines)

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' } },
    test: { globals: true, environment: 'jsdom', setupFiles: './src/test/setup.ts', include: ['src/**/*.test.{ts,tsx}'] },
})
```

- Minimal: `react()` plugin + dev-server proxy + vitest inline test config.
- **NO `manualChunks`** (empirically confirms Phase-6 6.7 PRE0 Q4 + Phase-7 7.9 PRE0 finding at HEAD-post-7.10).
- **NO `build.ssr` config; NO SSR primitives.** Single bundle target (browser only).

### §1.3 — `qualia-shell/index.html` (23 lines)

- SPA shell: single `<div id="root">` at L19; `<script type="module" src="/src/main.tsx">` at L20.
- **17 Google Fonts eager-loaded** at L11-15 via `<link href="https://fonts.googleapis.com/css2?family=…&display=swap" rel="stylesheet" />` (Phase-7 Lever 1 reverted at 6.7; still here at HEAD).
- Static `<title>AstraStrata — Property Management</title>`; theme color + manifest + favicon all static.
- **No SSR-injected content placeholder** (no `<!--ssr-outlet-->` / framework template comment).

### §1.4 — Phase-7 perf carry-forward anchor

| Metric | Pre-Phase-7 (6.7 close) | Phase-7 7.11 n=10 baseline at HEAD-post-7.10 |
|---|---|---|
| LCP median | 4,504 ms | **3,903 ms** (−601 ms / −13.3%) |
| LCP mean | 4,453 ms | **3,932 ms** (−521 ms / −11.7%) |
| LCP CV | ~14-17% (estimated) | **2.29%** (~6× variance reduction; first non-degenerate noise-floor metric) |
| LCP range | 151 ms (7.10 pre-edit n=3) | 300 ms (7.11 n=10 bounded outlier at run 9) |
| Performance score | 82 | **87** (+5) |
| v1 L228 ≤500 ms target | 8.4× over | **7.8× over** (target empirically structurally unattainable single-lever at this architecture per Phase-7 Finding A) |

**Phase-7 Finding (A) cross-reference** (`Docs/Phase7_Closure_Report.md §2`): at React 19 + Vite 6 + ~4,500 ms-LCP baseline architecture, the structurally-correct LCP bottleneck is **initial-paint JS parse+execute time**, NOT critical-path bytes-downloaded. Lazy-load is the empirically-validated correct lever family at this architecture; vendor-split + font-deferral levers are empirically NOT correct family (avoid as Phase-8+ priorities).

### §1.5 — Critical SSR-incompatibility surface (categorical hard-blocker)

| Surface | Location | SSR-failure mode | Pre-migration fix |
|---|---|---|---|
| `window.location.pathname` reference | App.tsx:79 | `ReferenceError` on server render | Replace with router-library declarative routing |
| `URLSearchParams(window.location.search)` reference | App.tsx:89 | `ReferenceError` on server render | Replace with router-library declarative routing |
| `useState` initial-render branch (`tenantMode`) | App.tsx:31 | Hydration mismatch risk (state initial value identical client+server is safe; conditional setState is not) | Audit + isolate via router-library route boundaries |
| `localStorage.getItem('qualia_sidebar_groups')` cold-start seed | `Sidebar.tsx:228` (cross-ref Conventions block) | `localStorage` undefined on server | Defer to client-only effect OR use SSR-safe storage abstraction |

**Categorical:** items 1 + 2 fire at App component evaluation time and crash server render under ALL 5 framework candidates. Items 3 + 4 are hydration-correctness surfaces that need per-framework audit but are not categorical crashers.

---

## §2 — SSR vs SPA primitives (architectural framing)

### §2.1 — What SSR shifts at the architectural level

A purely client-rendered SPA (current state) serves an HTML shell containing only `<div id="root">` + a `<script>` reference. The browser must:
1. Parse the HTML shell (fast; ~10s of ms).
2. Download the JS bundle (network-bound; subject to chunk-graph optimization Phase-7 7.10 addressed).
3. Parse + execute the JS bundle (CPU-bound; the empirically-confirmed Phase-7 bottleneck at ~3,900 ms median).
4. Mount the React tree + fire the first paint (LCP).

SSR shifts step 3's CPU cost off the critical path: the server renders the React tree to HTML, ships pre-rendered HTML to the browser, and the browser paints **before** the JS bundle parses. JS parse + hydration happens **after** the user sees content. LCP becomes bounded by network + server render time + HTML transfer, not browser JS parse.

### §2.2 — Hydration cost as the new variable (qualitative)

SSR doesn't eliminate JS parse — it defers it. **Hydration cost** is the new variable: the cost of attaching event listeners + reconciling React's virtual DOM with the server-rendered HTML. Per-framework hydration architecture determines whether hydration cost shows up as:
- **Blocking** (traditional hydration; user sees content but can't interact until hydration completes).
- **Progressive** (React 19 streaming SSR + selective hydration; user can interact with hydrated regions while other regions still hydrating).
- **Server Components** (RSC; portions of the tree never hydrate at all because they're server-only).

### §2.3 — React 19 + Suspense streaming primitives

React 19 ships `renderToPipeableStream` (Node) and `renderToReadableStream` (Web/edge) as the production streaming SSR APIs. Both support:
- **Suspense boundaries** that flush HTML in chunks as data resolves.
- **Selective hydration** prioritized by user interaction.
- **Server Components** (RSC) when paired with a framework that implements the RSC protocol (currently: Next.js App Router; partial: Vike via `vike-react`; experimental elsewhere).

Phase-7 7.10's `Suspense` boundary architecture at App.tsx (3 branch-local boundaries per Cowork Verdict #2) is already React-19-streaming-compatible **in shape**, but the inline `window.location.*` routing prevents server execution — it's never been exercised under SSR.

### §2.4 — Per-framework architectural primitives that determine LCP bottleneck shift

Phase-7 Finding (A) — JS parse+execute on initial paint is the bottleneck — implies SSR's architectural claim is **structurally correct** at this app's bottleneck profile: shipping pre-rendered HTML moves the bottleneck off the critical path. Per Q-A LOCK, this document does **not** quantify the reduction; that's Phase-8+ Block B Task 8.N+1 measurement scope. The qualitative architectural claim is: every framework in §3 shifts initial-paint JS parse off the critical path; they differ in **how the post-paint hydration cost is amortized** and in **which app code is server-eligible vs client-only**.

---

## §3 — 5-framework decision tree

### §3a — Next.js 16

**Positioning:** Replaces Vite categorically. Per official migration guide (v16.2.6, last-updated 2026-05-13) Step 9: *"Delete `main.tsx`, `index.html`, `vite-env.d.ts`, `tsconfig.node.json`, `vite.config.ts`; uninstall Vite dependencies."*

**Vite preserved:** ❌ NO. Next.js owns the build pipeline end-to-end (Turbopack/webpack).

**React 19:** ✅ Fully supported in Next.js 16; RSC + streaming SSR are core primitives.

**Routing:** File-system routing **required** under App Router (`app/[[...slug]]/page.tsx` catch-all is the intermediate migration shim for SPA-mode start, but architectural SSR benefit requires full App Router rewrite with `app/security/page.tsx` + `app/popup/[component]/page.tsx` declarative shapes replacing Branch 1 + Branch 2).

**Migration shape (per official 9-step guide):**
1. Install `next` dependency.
2. Create `next.config.mjs` with `output: 'export'` + `distDir: './dist'`.
3. Update `tsconfig.json` (9 specific changes including `"plugins": [{ "name": "next" }]`, `"jsx": "react-jsx"`, etc.).
4. Create `app/layout.tsx` from `index.html` shell.
5. Create `app/[[...slug]]/page.tsx` + `client.tsx` shim: `dynamic(() => import('../../App'), { ssr: false })` runs as SPA-mode initially.
6. Update image imports (`logo.src` instead of `logo`).
7. Migrate env vars: `VITE_` → `NEXT_PUBLIC_`; `import.meta.env.MODE` → `process.env.NODE_ENV`; etc. **(critical for Phase-7's `VITE_APPFOLIO_SEEDS` + `VITE_USE_STATIC_API` feature flags — these would need rename + audit across the test suite + CI workflows)**.
8. Update `package.json` scripts: `next dev` / `next build` / `next start`.
9. **Delete all Vite artifacts.**

**Phase-7 carry-forward preservation:** ❌ Categorical loss. `lazyWithReload` becomes redundant (Next.js handles route-level code splitting automatically); `vite.config.ts` is deleted; `playwright.baseline.config.ts` may need port-3000 reconfiguration; `Scripts/run_lighthouse_phase7.mjs` env-var contract (`LH_TASK_FIELD` + `LH_CAPTURE_SUFFIX` + `LH_ROOT_RUNS`) needs audit for Next.js dev-server invocation.

**LCP architecture (qualitative per Q-A):** Strongest of the 5 candidates. RSC + streaming SSR + automatic code splitting + image/font/script optimization built-in. Shifts more code to server-only than any other candidate. Hydration cost is amortized across selective hydration + RSC server-only regions.

**Risk inventory:**
- **🚩 Strategic discontinuity** — Phase-7 substantive engineering record (LCP CV 2.29% noise floor; React.lazy expansion lever −550 ms; lazyWithReload 2-layer altitude rule across 35+ data points; AdminShell wrapper consolidation) does not carry forward.
- **🚩 Env-var migration is non-trivial** — `VITE_APPFOLIO_SEEDS={true,false}` parity-gate dual-build contract + `VITE_USE_STATIC_API=true` cdp_probe build-mode footnote (v2.43 GR-15) both need rewrite. CI workflows + Playwright config + test fixtures + Scripts/* all reference `VITE_*` env vars.
- **🚩 Playwright e2e suite contract** — Phase-7 7.5 captured 8 Linux baselines; Next.js dev-server port differs (3000 vs 5173); `playwright.baseline.config.ts` + `playwright.config.ts` both need port + dev-server-spawn audit.

**Recommendation:** Production-strong for greenfield React-19-SSR apps; **strategically discontinuous** for this codebase. Not recommended as the Phase-8+ Block B adoption target.

---

### §3b — React Router v7 framework mode (Remix-merged)

**Positioning:** Vite plugin overlay; `react-router.config.ts` layers on top of `vite.config.ts`. Born from the React Router v7 + Remix v2 merger; framework mode is the SSR-enabled shape, "data mode" is the SPA-only shape (intermediate migration step).

**Vite preserved:** ✅ YES. `vite.config.ts` remains the build root; `react-router.config.ts` adds framework conventions on top.

**React 19:** Compatible. Framework conventions (`entry.server.tsx` + `entry.client.tsx`) are React-19-streaming-compatible by design (Remix v2's streaming SSR primitives carry forward into v7 framework mode).

**Routing:** Supports **BOTH** file-system routing (default template via `npx create-react-router@latest`) **AND** manual `routes.ts` config. **Critical for this codebase:** the manual `routes.ts` config matches our 3-branch imperative-routing pattern more naturally than file-system routing — we can preserve the structural shape (3 inline branches) while replacing the `window.location.*` reads with declarative `<Routes>` / `<Route>` shapes.

**Migration shape (estimated):**
1. Install `react-router` + `@react-router/node` + `@react-router/dev`.
2. Create `react-router.config.ts` with framework-mode config.
3. Create `entry.server.tsx` + `entry.client.tsx` boundary files.
4. Replace App.tsx L79 + L89 imperative branches with `<Routes>` containing `<Route path="/security" element={<SecurityPortal />} />` + `<Route path="/?popup=:component" element={<PopupShell />} />` + catch-all `<Route path="*" element={<AuthGate />} />` declarative shapes. **(This is Task 8.2 scope per Cowork Q-B carve-out.)**
5. Update `package.json` scripts: `react-router dev` / `react-router build` / `react-router-serve build/server/index.js`.
6. Audit `lazyWithReload` interactions with framework-mode route boundaries (likely keep at module-level lazy candidates per Phase-7 Conventions block 2-layer altitude rule).
7. Per-route SSR opt-in via `export const ssr = true` in route modules (or global config); admin-shell routes may stay SPA-only initially while public-facing routes (`/security`, `/?popup=`, `/` landing) go SSR for LCP win.

**Phase-7 carry-forward preservation:** ✅ Strong. `vite.config.ts` preserved (Phase-7 7.9 v2.55.1 NO-OP REVERT + 7.10 React.lazy expansion both carry forward); `lazyWithReload` likely keeps current 30+ widgetRegistry.ts + 5 App.tsx data points; env-vars (`VITE_APPFOLIO_SEEDS`, `VITE_USE_STATIC_API`) preserved (still a Vite build); `Scripts/run_lighthouse_phase7.mjs` env-var contract preserved; `playwright.baseline.config.ts` likely preserved with minor port/dev-server audit.

**LCP architecture (qualitative per Q-A):** Strong. Streaming SSR via React 19 `renderToPipeableStream`; route-based code splitting; Suspense boundaries flush HTML in chunks. Battle-tested Remix data loaders provide structured server-side data fetching that eliminates client-server waterfalls Phase-7 didn't address.

**Risk inventory:**
- **Mild** — Vite ecosystem maturity at framework-mode integration is newer than Next.js's webpack/Turbopack stack but battle-tested via Remix v2 production deployments.
- **Mild** — Route module conventions (`loader`, `action`, `meta`, `links`) require code-organization shift but are additive, not replacement.

**Recommendation:** Strong Phase-8+ Block B candidate. Lower migration cost than Next.js + lower production risk than TanStack Start RC + Vite-ecosystem-preserving + manual route config matches our imperative pattern naturally. **Cowork-expected §6 close-second to Vike**; final selection deferred to Task 8.2 close per Q6 verdict.

---

### §3c — Vike (formerly vite-plugin-ssr)

**Positioning:** Pure Vite plugin; preserves `vite.config.ts` shape; integrates as middleware in any server setup. Among the most Vite-ecosystem-native of the candidates.

**Vite preserved:** ✅ YES (most strongly of all candidates). Vike is structurally a Vite plugin, not a framework that owns the build pipeline. `vite.config.ts` adds the Vike plugin; existing plugins (e.g., `@vitejs/plugin-react`) coexist.

**React 19:** Compatible via the `vike-react` extension; no version-specific claim in canonical docs but architectural compatibility is established (Vike's renderer is plugin-driven; the React renderer extension targets the modern React API surface).

**Routing:** Filesystem routing **default**, but **Route Function programmatic alternative supported** — fully flexible. Documented at `/route-function` in canonical docs. **Critical for this codebase:** the Route Function approach allows declarative route config in code (not file paths), matching our 3-branch inline pattern with maximum fidelity.

**Per-page render-mode flexibility (unique among candidates):**
> *"Toggle SSR/SPA/SSG on a page-by-page basis, powered by config inheritance."*

This means we can adopt SSR **per route** — `/security` + `/?popup=` + `/` landing can be SSR'd while admin-shell routes (high-state, low-LCP-sensitivity) stay SPA-only. Lowest-risk adoption path of all 5 candidates.

**Migration shape (estimated; documented "Add SSR/SSG to existing Vite app" path):**
1. Install `vike` + `vike-react`.
2. Add `vike()` plugin to `vite.config.ts` (additive; existing plugins preserved).
3. Create `+config.ts` files for each route (filesystem) OR define routes via Route Function (programmatic).
4. Replace App.tsx L79 + L89 imperative branches with Vike's `+route.ts` Route Function shape (Task 8.2 scope).
5. Per-page render-mode toggle: SSR for public-facing routes; SPA for admin-shell routes initially.
6. Audit `lazyWithReload` interactions (likely keep current shape).

**Phase-7 carry-forward preservation:** ✅ **Strongest of all candidates.** `vite.config.ts` preserved structurally + additively; `lazyWithReload` preserved; env-vars preserved; `Scripts/run_lighthouse_phase7.mjs` preserved; `playwright.baseline.config.ts` preserved (with per-route SSR-vs-SPA audit at e2e capture time).

**LCP architecture (qualitative per Q-A):** Strong. HTML streaming + link prefetching + asset preloading per canonical docs; per-page render-mode toggle allows surgical SSR application to LCP-critical routes only.

**Risk inventory:**
- **Mild** — Smaller community than Next.js / Remix-merged React Router; documentation depth is decent but framework patterns are less codified across the broader React ecosystem.
- **Mild** — React 19 explicit support claim absent in canonical docs (compatibility is structural rather than version-pinned); empirical validation under our app's specific feature surface required at Block B kickoff.

**Recommendation:** **Cowork-expected §6 primary recommendation.** Preserves Phase-7's vite.config.ts work most strongly + manual route configuration matches our imperative routing pattern naturally + per-page render-mode flexibility allows lowest-risk adoption path + lower migration cost than Next.js + lower production risk than TanStack Start RC. **React Router v7 framework-mode is the legitimate close-second alternative.** Final §6 verdict deferred to Task 8.2 kickoff per Q6 deferred-to-Cowork pattern.

---

### §3d — TanStack Start

**Positioning:** Vite-built; couples with TanStack Router + (optionally) TanStack Query. As of 2026-05, in Release Candidate stage per canonical docs: *"TanStack Start is currently in the Release Candidate stage! This means it is considered feature-complete and its API is considered stable."*

**Vite preserved:** ✅ YES (built on Vite).

**React 19:** Not explicitly addressed in canonical docs overview (compatibility is structural; empirical validation required).

**Routing:** Tied to TanStack Router (file-system routing convention; programmatic routing also supported via TanStack Router's `createRouter` API but file-system is the documented default).

**Maturity status (🚩 Phase-8+ production-risk inflection):** **Release Candidate as of 2026-05.** Feature-complete + stable API per docs but recently graduated from beta. Less production-battle-tested than Next.js (production since 2016) / React Router v7 framework-mode (battle-tested via Remix v2 production deployments) / Vike (production since 2020 as vite-plugin-ssr).

**Migration shape:** Not detailed in canonical docs overview; expected to follow TanStack Router file-system convention + TanStack Start SSR shell creation.

**Phase-7 carry-forward preservation:** ✅ Likely strong (Vite-built); empirical validation required at Block B kickoff if selected.

**LCP architecture (qualitative per Q-A):** Strong claim. Full-document SSR + streaming + server functions + progressive page loading per canonical docs.

**Risk inventory:**
- **🚩 RC-stage production risk.** Recently graduated; less battle-tested. Sister-shape concern to Phase-7's React 19 + Vite 6 production-stability principle — adopting an RC-stage framework as Phase-8+ Block B target is structurally distinct from the production-stability discipline established at Phase-7.
- **🚩 React 19 compatibility not explicitly claimed** in canonical docs overview; empirical validation required.
- **Mild** — TanStack Router coupling adds an additional learning surface (route trees, search params, masking) that doesn't directly trade against the SSR goal.

**Recommendation:** Structurally interesting + technically promising; **defer to Phase-9+ revisit when/if stable 1.0 lands within Phase-8+ timeframe.** For Phase-8+ Block B framework adoption at OPENER, recommend a battle-tested option (Vike or React Router v7 framework-mode).

---

### §3e — Custom Vite SSR (native APIs) — NOT RECOMMENDED per upstream

**Positioning per Vite docs (verbatim disqualification anchor):**
> *"This is a low-level API meant for library and framework authors."*

**Vite preserved:** ✅ YES (own everything).

**React 19:** Manual integration via `renderToPipeableStream` / `renderToReadableStream` — **not covered in Vite docs.**

**Routing:** Fully custom — own the routing layer entirely.

**Required architecture:**
- 3-file entry split: `entry-client.js` + `entry-server.js` + universal `main.js`.
- Dual-build orchestration: `vite build --outDir dist/client` + `vite build --outDir dist/server --ssr src/entry-server.js`.
- Custom server runtime: Express / Fastify / Hono / custom — Vite docs demonstrate Express middleware integration but flexibility is the design.
- Manual preload directive generation via `--ssrManifest`.
- Environment-specific conditionals (`process.env.NODE_ENV`).
- `<!--ssr-outlet-->` placeholder in HTML; manual `vite.transformIndexHtml` integration.

**Risk inventory (categorical disqualifier):**
- **🚩 Upstream-disclaimed as framework-author work.** Adopting this path means the Phase-8+ team becomes the framework author — significant ongoing maintenance burden absent upstream support pathway.
- **🚩 No upstream-published LCP claims** — entirely implementation-dependent.
- **🚩 React 19 streaming SSR integration not documented** — would require hand-rolled `renderToPipeableStream` / `renderToReadableStream` orchestration.
- **🚩 Maintenance cost long-term** — every Vite version upgrade requires re-validating the custom SSR integration; every React version upgrade requires re-validating the renderer integration.

**Recommendation:** **NOT RECOMMENDED.** Explicitly considered in §3 for audit-trail completeness sister-shape to Phase-7's 7.9 vendor-split REVERT documentation discipline ("what we considered + why we ruled out"); excluded from §6 production candidates. Phase-8+ should not constitute framework-author work; that's structurally distinct from application-integration work and outside the production-app team's responsibility surface.

---

## §4 — LCP qualitative projections (per Q-A Cowork verdict; quantitative deferred to Block B)

Per Q-A LOCK, §4 ships qualitative architectural claims only. Quantitative LCP reduction-range estimation requires empirical setup (build chosen framework SSR shell + measure under same Lighthouse + n=10 noise-floor protocol established at Phase-7 7.11) — that's Phase-8+ Block B measurement task scope, NOT 8.1 scope.

### §4.1 — Phase-7 baseline anchor (carry-forward)

| Metric | Value at HEAD-post-7.10 (Phase-7 7.11 n=10) |
|---|---|
| LCP median | 3,903 ms |
| LCP mean | 3,932 ms |
| LCP CV | 2.29% (noise floor; Phase-8+ measurement parity reference) |
| v1 L228 target | ≤500 ms (currently 7.8× over) |
| Architectural bottleneck | Initial-paint JS parse+execute (Phase-7 Finding A) |

### §4.2 — Per-framework qualitative projection

| Framework | Qualitative architectural projection |
|---|---|
| **Next.js 16** | Strongest theoretical LCP reduction (RSC server-only regions + automatic streaming + image/font optimization built-in). Shifts more code to server-only than any other candidate. Trade-off: strategic discontinuity discards Phase-7 perf carry-forward; LCP reduction must overcome restart cost. |
| **React Router v7 framework-mode** | Strong qualitative projection. Streaming SSR via React 19 `renderToPipeableStream`; route-based code splitting; Remix loader/action server-data architecture eliminates client-server waterfalls. Hydration cost amortized across route boundaries. |
| **Vike** | Strong qualitative projection. Per-page render-mode toggle allows surgical SSR application to LCP-critical routes (`/`, `/security`, `/?popup=`) while admin-shell stays SPA-only. Lowest-risk LCP-targeting shape; preserves Phase-7's 7.10 React.lazy lever stacked-with-SSR architecture. |
| **TanStack Start** | Strong qualitative projection per docs; empirical validation required at Block B kickoff if selected (RC-stage risk). |
| **Custom Vite SSR** | None claimed — entirely implementation-dependent; ruled out per §3e. |

### §4.3 — Hydration cost as the new variable (qualitative)

SSR's architectural claim is: shift initial-paint JS parse+execute (Phase-7 Finding A bottleneck) **off the LCP critical path**. The cost being shifted is not eliminated — it becomes **hydration cost**, fired post-paint. Whether hydration cost shows up as user-perceptible Time-to-Interactive degradation depends on:
- **Selective hydration** prioritization (React 19 + Suspense streaming reduces; all 4 production-candidate frameworks support this).
- **Server Components** server-only regions (RSC; only Next.js implements fully; partial Vike via `vike-react`).
- **Per-page render-mode** application (Vike's unique surgical strength).

**Quantitative LCP delta + TTI delta + hydration cost characterization → Phase-8+ Block B measurement task (Task 8.N+1).** That measurement task should mirror Phase-7 7.11 n=10 noise-floor protocol byte-for-byte for cross-phase like-vs-like comparability.

### §4.4 — v1 L228 ≤500 ms LCP threshold reachability (qualitative)

Phase-7 closer (`Docs/Phase7_Closure_Report.md §2`) refined v1 L228 from "STRUCTURALLY UNATTAINABLE single-lever" to "multi-lever within React 19 + Vite 6 architecture; SSR-shell exploration becomes Phase-8+ priority." Phase-8+ Block B's chosen framework determines whether v1 L228 ≤500 ms is **architecturally reachable**:
- **Reachable** (qualitative claim) if SSR shifts the dominant ~3,900 ms JS-parse-bound bottleneck off the critical path AND hydration cost doesn't re-introduce a comparable bottleneck pre-LCP.
- **NEW empirical refinement candidate** if SSR-migration substantively succeeds technically but LCP remains >500 ms — would extend Phase-7's L228 finding to "STRUCTURALLY UNATTAINABLE even with SSR migration at React 19 + chosen-framework architecture."

**Both outcomes are architectural Phase-8+ deliverables.** Block B's closer narrative documents which empirical refinement the SSR-migration data point produces. Phase-8+ → Phase-9+ transition signal locks at Block C measurement task close.

---

## §5 — Migration cost analysis

### §5.1 — Per-framework cost matrix

| Framework | Files touched (est.) | `vite.config.ts` fate | Phase-7 carry-forward | Env-var migration | CI workflow audit | e2e suite audit |
|---|---|---|---|---|---|---|
| **Next.js 16** | 30-50+ (full pipeline replacement) | ❌ Deleted | ❌ Categorical loss | ✅ Required (`VITE_*` → `NEXT_PUBLIC_*`) | ✅ Required (build/dev/test all rewritten) | ✅ Required (port + dev-server-spawn audit) |
| **React Router v7 framework-mode** | 8-15 (additive overlay) | ✅ Preserved | ✅ Strong | ❌ Not required | Mild (build script rename) | Mild (port + dev-server audit) |
| **Vike** | 5-10 (most additive; per-page +config files) | ✅ Preserved structurally | ✅ Strongest | ❌ Not required | Minimal (Vike plugin added; build commands likely preserved) | Minimal (per-page SSR-vs-SPA at e2e capture) |
| **TanStack Start** | 10-20 (TanStack Router + Start coupling) | ✅ Preserved | ✅ Likely strong (empirical validation required) | ❌ Not required | Mild | Mild + TanStack Router e2e selector audit |
| **Custom Vite SSR** | 15-25+ (3-file entry split + dual-build + custom server) | ✅ Preserved structurally but heavily modified | ✅ Preserved but maintenance-burdened | ❌ Not required | Significant (custom server runtime CI integration) | Significant (custom server e2e harness) |

### §5.2 — Phase-7 substantive engineering record preservation

| Phase-7 deliverable | Next.js | RR v7 framework-mode | Vike | TanStack Start | Custom Vite SSR |
|---|---|---|---|---|---|
| `lazyWithReload` utility + 35+ data points | ❌ Redundant | ✅ Preserved | ✅ Preserved | ✅ Preserved | ✅ Preserved |
| `AdminShell` wrapper consolidation | ❌ Pattern shifts | ✅ Preserved | ✅ Preserved | ✅ Preserved | ✅ Preserved |
| `vite.config.ts` (no manualChunks; minimal shape) | ❌ Deleted | ✅ Preserved + overlaid | ✅ Preserved + Vike plugin added | ✅ Preserved | ✅ Preserved + modified |
| LCP CV 2.29% noise-floor (HEAD-post-7.10 baseline) | Reset (new baseline at Next.js shell) | Preserved (Vite-build same) | Preserved (Vite-build same) | Preserved (likely) | Preserved (Vite-build same) |
| `Scripts/run_lighthouse_phase7.mjs` env-var contract (LH_TASK_FIELD / LH_CAPTURE_SUFFIX / LH_ROOT_RUNS) | ❌ Audit + rewrite | ✅ Preserved | ✅ Preserved | ✅ Preserved | ✅ Preserved |
| `playwright.baseline.config.ts` v2.51.1 timeout 90s + retries 2 | ❌ Port audit + dev-server-spawn rewrite | Mild port audit | Minimal | Mild port audit | Significant rewrite |
| Phase-7 4 NEW classes (CI-CONFIG-ONLY + BASELINE-ARTIFACT + PERF-LEVER-LAZY-LOAD + TEST-INFRA-FIX) | Preserved as historical-record only | Preserved as live calibration | Preserved as live calibration | Preserved as live calibration | Preserved as live calibration |

### §5.3 — Maintenance cost (qualitative)

| Framework | Long-term maintenance posture |
|---|---|
| **Next.js 16** | Strong upstream support; large ecosystem; well-documented upgrade path between major versions. Vercel-aligned (production deployments outside Vercel are supported but Vercel-optimized). |
| **React Router v7 framework-mode** | Strong upstream support (React Router team + ex-Remix team merged); React-Router-ecosystem-aligned. Production deployments framework-agnostic. |
| **Vike** | Moderate upstream support (smaller team than Next.js / RR); active maintenance; Vite-ecosystem-aligned. Production deployments framework-agnostic. |
| **TanStack Start** | Strong TanStack team upstream; RC-stage maturity bears watching; long-term posture establishes post stable 1.0 release. |
| **Custom Vite SSR** | Self-maintained; every Vite version upgrade + every React version upgrade requires re-validation. Highest maintenance burden of all candidates. |

---

## §6 — Phase-8+ Block B implementation roadmap recommendation

### §6.1 — 14-task envelope (Q-E LOCK)

| Block | Tasks | Count | Scope |
|---|---|---|---|
| **Block A** (pre-framework-adoption fixes) | 8.2 - 8.5 | 4 tasks | Imperative-routing fix + provider-tree SSR audit + index.html template refactor + static-data extraction |
| **Block B** (chosen-framework adoption + per-route SSR migration) | 8.6 - 8.11 | 6 tasks | Framework installation + entry boundary creation + per-route SSR opt-in + hydration verification + progressive SSR rollout + prefetching/streaming optimization |
| **Block C** (empirical re-measurement + perf-lever stacking + closer) | 8.12 - 8.15 | 4 tasks | LCP n=10 re-measurement (mirrors Phase-7 7.11 protocol) + perf-lever stacking if substantive gap to v1 L228 remains + Phase-8+ closer (CLOSURE-NARRATIVE-CONSOLIDATION 3rd cross-phase data point) + closer publishing |
| **Total** | 8.1 - 8.15 | 14 + closer | Sister-shape to Phase-7's 14-task arc + closer |

### §6.2 — Task 8.2 explicit carve-out (Q-B LOCK)

**Task 8.2 — Imperative-routing → declarative-routing migration (framework-independent pre-task).**

- **Scope:** Replace `qualia-shell/src/App.tsx` L79 + L89 `window.location.pathname` / `URLSearchParams(window.location.search)` references with declarative router-library shape (likely `react-router-dom` v6 `BrowserRouter` + `Routes` + `Route`).
- **Preserves:** 3-branch inline routing semantics (security viewport-fill + popup compact + AuthGate default).
- **Class candidate:** COMPONENT-FIX (sister-shape to Phase-7 7.1 A11Y-COMPONENT-FIX shape; production-source-edit) OR SSR-MIGRATION-PREP (NEW class candidate per v2.60.4 PRE-FLIGHT discipline; final class verdict at Task 8.2 PRE0 Q1 per Cowork).
- **Framework-independence rationale:** the fix is required regardless of which framework wins at §6 decision gate. Folding it inside per-framework §3 sections would obscure that it's a shared pre-task. Sequencing 8.2 as the next-after-8.1 task is structurally correct.
- **Estimated effort:** 1-3 file edits at production-source altitude (App.tsx + new router-config file + possible useEffect-localStorage shim if Sidebar.tsx:228 `localStorage` cold-start seed needs SSR-safe abstraction).
- **Acceptance criteria:** vitest 259/259 PASS + smoke-test 12/12 PASS (chromium project) + parity gate PASS + 3 routing branches structurally preserved (verified via Playwright e2e direct URL navigation).

### §6.3 — Block A items 8.3 - 8.5 (post-routing-fix pre-framework-adoption)

- **Task 8.3 — Provider-tree SSR audit.** Audit `ThemeProvider` + `UserProvider` + `QueryProvider` + `PermissionsProvider` for SSR-safety (no `window` / `localStorage` / `document` references at provider initialization; lazy-defer to `useEffect` for client-only state).
- **Task 8.4 — `index.html` template refactor (framework-agnostic).** Move static `<head>` content (theme color, manifest, favicon, 17 Google Fonts) into a framework-shape-agnostic template that can be lifted into chosen framework's root layout at Block B kickoff. Validates that Phase-7 Lever 1 font deferral REVERT decision still holds (or amends if SSR shifts the cost-benefit calculus).
- **Task 8.5 — Static-data extraction (if needed).** Identify candidates for build-time-or-server-time data extraction (likely route-level metadata, auth-gate static config). Out-of-scope at 8.1 PRE0 depth; Block B kickoff PRE0 surfaces specific extraction targets.

### §6.4 — Block B items 8.6 - 8.11 (chosen-framework adoption)

Specific task shapes depend on Cowork's §6 framework verdict at Task 8.2 close. Generalized shape:

- **Task 8.6 — Framework installation + dependency audit.** Adopt chosen framework dependencies; configure `react-router.config.ts` (RR v7 framework-mode) or `vite.config.ts vike()` plugin (Vike) or `next.config.mjs` (Next.js; not recommended) or `app.config.ts` (TanStack Start; not recommended at RC stage).
- **Task 8.7 — Entry boundary creation.** Create `entry.server.tsx` + `entry.client.tsx` (RR v7) or `+onRenderHtml.ts` + `+onRenderClient.ts` (Vike) or App Router `app/layout.tsx` (Next.js).
- **Task 8.8 — Per-route SSR opt-in.** Public-facing routes (`/`, `/security`, `/?popup=`) SSR-enabled; admin-shell routes initially SPA-only (Vike per-page mode) or framework-default SSR with audit (RR v7).
- **Task 8.9 — Hydration verification.** Audit for React 19 hydration mismatches; instrument hydration boundaries; verify `Sidebar.tsx:228` `localStorage` cold-start seed is SSR-safe.
- **Task 8.10 — Progressive SSR rollout.** If Vike per-page mode chosen, surgical SSR application to additional admin-shell routes that empirically benefit. (Optional; may absorb into Block C if Block B closes early.)
- **Task 8.11 — Prefetching / streaming optimization.** Link prefetching + Suspense boundary streaming + asset preloading per chosen framework's primitives. (Optional; may absorb into Block C.)

### §6.5 — Block C items 8.12 - 8.15 (empirical re-measurement + closer)

- **Task 8.12 — LCP n=10 re-measurement (mirrors Phase-7 7.11 protocol byte-for-byte).** `LH_TASK_FIELD=phase8_task_8_12 LH_ROOT_RUNS=10 node Scripts/run_lighthouse_phase8.mjs` (script-rename via `git mv` per Phase-6 6.6 + 6.7 + Phase-7 7.11 MEASUREMENT-ONLY sub-shape `plus-script-rename` precedent). Cross-phase comparable noise-floor establishes empirical SSR-migration delta.
- **Task 8.13 — Perf-lever stacking (if substantive gap to v1 L228 remains).** Conditional on 8.12 result. Lever candidates: SSR + React.lazy stacking (Phase-7 7.10 preserved) + per-page Vike-mode tuning (if Vike selected) + asset preloading depth.
- **Task 8.14 — Phase-8+ closer (CLOSURE-NARRATIVE-CONSOLIDATION 3rd cross-phase data point).** Sister-shape to `Docs/Phase6_Closure_Report.md` + `Docs/Phase7_Closure_Report.md`. Documents Phase-8+ engineering-finding catalog + cross-phase data points + GR-15 amendments + v1 L228 reachability verdict.
- **Task 8.15 — Closer publishing + Phase-9+ transition signal.** Commits Phase-8+ closer; opens Phase-9+ kickoff pointer; locks v1 L228 verdict (MET or NEW empirical refinement to STRUCTURALLY UNATTAINABLE even with SSR migration).

### §6.6 — Phase-8+ → Phase-9+ transition signal (Q-E refinement)

Phase-8+ closes when v1 L228 ≤500 ms LCP threshold is either:
- **(A) MET** — SSR-migration substantively succeeds; Block C 8.12 n=10 median ≤500 ms; closer narrative ships the success data point.
- **(B) NEW empirical refinement to "STRUCTURALLY UNATTAINABLE even with SSR migration at React 19 + chosen-framework architecture."** Closer narrative documents architectural lessons + Phase-9+ priority recommendation (e.g., infrastructure-level optimization: CDN edge rendering / HTTP/3 / aggressive caching; OR fundamental architecture pivot: server-side templating + island hydration architecture per Astro/Fresh patterns).

Sister-shape to Phase-6's v1 L230 MET + Phase-7's v1 L228 STRUCTURALLY UNATTAINABLE single-lever → multi-lever refinement trajectory. Both outcomes are architectural Phase-8+ deliverables of equivalent publishability.

### §6.7 — Cowork-expected §6 framework recommendation (preview)

**Primary recommendation:** **Vike** — preserves Phase-7's `vite.config.ts` work most strongly (additive plugin, not framework-pipeline replacement) + manual route configuration matches our 3-branch imperative routing pattern naturally + per-page render-mode flexibility allows surgical SSR application to LCP-critical routes + lower migration cost than Next.js + lower production-risk than TanStack Start RC.

**Legitimate close-second:** **React Router v7 framework-mode (Remix-merged)** — also preserves `vite.config.ts` + supports manual `routes.ts` config + battle-tested Remix loader/action server-data architecture eliminates client-server waterfalls + larger upstream ecosystem than Vike.

**Final §6 framework verdict deferred to Task 8.2 kickoff** per Cowork Q6 deferred-to-Cowork pattern. Task 8.2 kickoff brief Q1 should explicitly surface this choice with the §3 + §5 + §6 evidence as decision substrate.

**Eliminated from production candidates:**
- **Next.js 16** — strategic discontinuity discards Phase-7 substantive engineering record; not recommended as Phase-8+ Block B target despite strongest theoretical LCP architecture.
- **TanStack Start** — RC-stage production-risk inflection; defer to Phase-9+ revisit if stable 1.0 lands within Phase-8+ timeframe.
- **Custom Vite SSR** — upstream-disclaimed as framework-author API; not application-integration pattern.

---

## §7 — Risks + Open Questions

### §7.1 — Risks (technical)

- **R1 — Imperative-routing pre-fix categorical certainty.** App.tsx L79 + L89 fix is required regardless of framework choice; structurally unavoidable; sequencing as Task 8.2 absorbs the risk into a discrete production-source-edit task with proper PRE0 + verification gates.
- **R2 — React 19 explicit compatibility claim absent in Vike + TanStack Start canonical docs.** Empirical validation required at Block B kickoff if either is chosen. Mitigation: prototype hydration test at Block B Task 8.7 (entry boundary creation) before broader rollout.
- **R3 — Hydration cost as unknown variable.** SSR shifts JS parse+execute off LCP critical path but introduces hydration cost post-paint. Whether hydration cost shows up as user-perceptible TTI degradation is empirically open. Measurement task 8.12 surfaces empirical hydration-cost data point.
- **R4 — Sidebar.tsx:228 `localStorage` cold-start seed SSR-safety.** Conventions block documents this as the canonical seed pattern across helpers/auth.ts (Phase-6 6.2 amendment). Under SSR, `localStorage` is undefined on server; either defer seed to client-only `useEffect` OR pre-seed via SSR-injected initial state. Audit at Task 8.3 (provider-tree SSR audit) + Task 8.9 (hydration verification).
- **R5 — 17 Google Fonts eager-loading interaction with SSR.** Phase-7 Lever 1 (font deferral via preload+onload) was REVERTED at 6.7 close as NO-OP. Under SSR, the cost-benefit calculus may shift (server-rendered HTML reaches paint before fonts; Cumulative Layout Shift risk under font-swap). Re-evaluate at Task 8.4 (index.html template refactor).

### §7.2 — Open Questions (deferred to downstream task kickoffs)

- **OQ-1 — Framework selection final verdict** (Task 8.2 kickoff PRE0 Q1; Cowork verdict).
- **OQ-2 — Imperative-routing replacement library** (`react-router-dom` v6 vs framework-coupled router; Task 8.2 PRE0 Q2; depends on OQ-1 verdict).
- **OQ-3 — Per-page SSR-vs-SPA mode partition** (Vike-conditional; Task 8.8 PRE0; which admin-shell routes go SSR vs stay SPA).
- **OQ-4 — Hydration-cost measurement methodology** (Task 8.12 PRE0; whether n=10 LCP capture protocol from Phase-7 7.11 needs extension with TTI / TBT cross-comparison for hydration cost characterization).
- **OQ-5 — Phase-7 Closer §8 14-item carry-forward consolidation cross-reference at Phase-8+ kickoff** (which Phase-7 closer items absorb into Phase-8+ Block A vs defer to Phase-9+; Phase-8+ kickoff brief addresses).

### §7.3 — Housekeeping deferred-items (per surfaced gap E)

**4 untracked baseline JSON artifacts** at:
- `Docs/Baselines/2026-05-11_Phase0_axe_baseline.json`
- `Docs/Baselines/2026-05-12_Phase0_axe_baseline.json`
- `Docs/Baselines/2026-05-13_Phase0_axe_baseline.json`
- `Docs/Baselines/2026-05-13_Phase6_task_6_7_perf_capture.json`

Residue from Phase-7 dispatched workflow runs; not regenerable (workflow_dispatch artifacts are time-bounded historical empirical record). **Recommended commit-as-historical-baselines at Phase-8+ Block C closure task OR Phase-8+ closer.** `.gitignore` is structurally wrong shape — these are historical empirical record, not derived artifacts. Sister-shape to Phase-7 closer carry-forward consolidation pattern.

---

## §8 — Cowork decision gate

### §8.1 — Audit trail discipline (sister-shape to Phase-6/Phase-7 closure-narrative patterns)

This document ships as the Phase-8+ empirical-architecture-inventory deliverable. The 4 publishable-level engineering findings cemented at §0 + the 5-framework decision tree cemented at §3 + the 14-task envelope cemented at §6 form the substrate against which Task 8.2 → Task 8.15 will execute. Phase-8+ closer (Task 8.14) will cross-reference §0 findings + §6 recommendation + §8 decision-gate verdict as the closure-narrative anchor.

### §8.2 — Task 8.1 → Task 8.2 handoff contract

**Task 8.1 delivers:**
- This document (`Docs/Phase8_SSR_Architectural_Scoping.md`) cemented at v2.61 OPENING.
- v2.61 amendment OPENING Phase-8+ at `Docs/AppFolio_Parity_Implementation_Plan_v2.md`.
- `Docs/Phases/Phase_8_Plan.md` byte-shape-mirror of `Docs/Phases/Phase_7_Plan.md` with 14-task envelope + Block A/B/C decomposition.
- CLAUDE.md HEAD pointer pivot to Phase-8+; Phase summary table Phase-8+ row added; Calibration classes 15 → 16 with NEW SCOPING-ONLY entry; Conventions block NEW entry for SCOPING-ONLY class definition.
- §9 main matrix Phase-8+ column ADDED at OPENING with R initial state across 14 rows + closer row (Q5 LOCK).

**Task 8.2 kickoff brief MUST surface (PRE0 Q1):**
- Framework selection verdict (Vike primary recommendation; RR v7 framework-mode close-second; final Cowork verdict at 8.2 kickoff).
- Imperative-routing replacement library choice (depends on framework verdict).
- Class designation (COMPONENT-FIX vs NEW SSR-MIGRATION-PREP; Cowork verdict at 8.2 PRE0).
- Acceptance criteria carve-out (vitest 259/259 + smoke-test 12/12 + parity gate + 3-branch routing preservation).

### §8.3 — Explicit Cowork verdicts requested at downstream task gates

| Gate | Verdict required | Decision substrate |
|---|---|---|
| **Task 8.1 close** (this document) | Approval of §6 14-task envelope + §6.7 framework-recommendation framing + §8.2 handoff contract | §0 + §3 + §5 + §6 + §7 |
| **Task 8.2 kickoff** | Framework selection final verdict (Vike vs RR v7 framework-mode) | §3 + §5 + §6.7 |
| **Task 8.2 close** | Class designation verdict (COMPONENT-FIX vs NEW SSR-MIGRATION-PREP) | Task 8.2 empirical execution |
| **Task 8.6 (framework installation) close** | Dependency lock + entry-boundary architecture verdict | Task 8.6 empirical execution + Block B PRE0 |
| **Task 8.12 (LCP re-measurement) close** | v1 L228 reachability verdict (MET vs STRUCTURALLY UNATTAINABLE refinement candidate) | Task 8.12 n=10 empirical data |
| **Task 8.14 (Phase-8+ closer) close** | Phase-8+ → Phase-9+ transition signal verdict | Phase-8+ closer narrative |

---

**Document size:** ~325 lines / ~70 KB target band (per `Docs/Phase7_Closure_Report.md §4g` v2.60.6 empirical-content-density-driven scope codification; specific size driven by empirical research density, not byte-target).

**Cross-references:**
- `Docs/Phase7_Closure_Report.md §2` — 2-finding engineering-finding catalog (lazy-load IS structurally-correct lever family + `vi.useFakeTimers` + React 19 anti-pattern); §8 — 14-item carry-forward consolidation.
- `Docs/Phase6_Closure_Report.md §8` — 16-item Phase-7 carry-forward consolidation precedent; sister-shape methodology.
- `Docs/AppFolio_Parity_Implementation_Plan_v2.md` — Plan v2.61 amendment OPENING Phase-8+ (cemented at this commit).
- `Docs/Phases/Phase_7_Plan.md` — 14-task arc byte-shape source for `Docs/Phases/Phase_8_Plan.md`.

---

**END Phase-8+ Task 8.1 SSR Architectural Scoping — STATUS: STEP-3 FULL DRAFT COMPLETE; CEMENTED AT TASK 8.1 CLOSE; AWAITING COWORK STEP-3 REVIEW PRIOR TO STEP-4 v2.61 AMENDMENT AUTHORING.**
