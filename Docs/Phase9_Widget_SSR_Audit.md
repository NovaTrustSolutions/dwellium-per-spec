# Phase-9+ Task 9.4 — Widget-altitude SSR-safety audit (Block A item A1)

**Status.** Audit-only doc deliverable. Sister-shape to `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md` at widget-altitude (vs provider-tree altitude). Per Cowork verdict-lock 2026-05-23: read-only sweep; HARD HALT before any production-source remediation if any reachability-positive hit surfaced.
**Branch.** `feat/phase-9-task-9.4-widget-ssr-audit` off `main@bfcc654` (v2.74.1 branch-base discipline 8-consecutive vindication at 8.11+8.12+8.13+8.14+8.15+9.1+9.2+9.3+9.4 — wait, recount: 8.11+8.12+8.13+8.14+8.15+9.1+9.2+9.3+9.4 = 9-consecutive).
**Authored.** 2026-05-23 (Phase-9+ Task 9.4 close).
**Cross-references.**
- `Docs/Phase8_Task_8_3_Provider_Tree_SSR_Audit.md` — sister-shape provider-tree audit at App.tsx altitude (4 top-level providers + 3 AdminShell-scoped providers; identical 3-altitude SSR-safety taxonomy).
- `Docs/Phases/Phase_9_Plan.md §3 A1` — Block A item A1 scope at the Phase-9+ kickoff brief.
- `Docs/Phase8_Task_8_11_Completion_Report.md` — Task 8.11 5-phase SSR smoke-test empirical baseline (zero ReferenceError + zero hydration mismatch warnings at `ssr:true` runtime; Finding II reachability-negative precedent for TranscriptionHub.tsx:376 widget-altitude entry).
- `Docs/CLAUDE_history.md` Conventions block — Per-provider-SSR-safety 3-altitude taxonomy + 19-pattern anchor-bias-mitigation cluster (recursive-validation P2 standing).

---

## §0 — Cover

### Audit verdict (1-line)

**🎯 ALL 3 init-time-UNSAFE hits at widget-altitude are REACHABILITY-NEGATIVE via DOUBLE mechanism (AuthGate Branch 3 + `lazyWithReload` Suspense-shield). Empirically validated by Phase-8 Task 8.11 SSR smoke-test (zero `ReferenceError` + zero hydration mismatch warnings at `ssr:true` runtime). Audit-only / INFORMATIONAL catalog at this Task 9.4 close; NO production-source remediation required.**

### Three publishable-level Phase-9+ Task 9.4 engineering findings

1. **Finding II (cross-task extension; PROMOTED from Phase-8 Task 8.11 to a 3-hit Task 9.4 catalog).** TranscriptionHub.tsx:376 (`useState(() => !!(window.SpeechRecognition || …))`) was already cemented as INFORMATIONAL deferred-to-Phase-9+ at Task 8.11. Task 9.4 widget-altitude sweep surfaces 2 additional init-time-UNSAFE hits (TranscriptionHub.tsx:312 + StellaAgent.tsx:270); all 3 share the same reachability-negative classification.
2. **Finding JJ (NEW; reachability-negative DOUBLE mechanism).** Widget-altitude init-time-UNSAFE hits are protected by BOTH (A) AuthGate Branch 3 gating (fresh sessions render LoginScreen at `/` → widgets unmounted) AND (B) `lazyWithReload` wrapping at `WINDOW_COMPONENTS` (`qualia-shell/src/registry/widgetRegistry.ts:280`) — widget bodies are `React.LazyExoticComponent<…>` → Suspense-shielded server-side regardless of which App.tsx branch the URL hits. Mechanism (B) is the STRONGER guarantee — even Branch 2 popup-direct-URL navigation (`/?popup=TranscriptionHub`) can't unmask widget bodies server-side because lazy resolution is post-hydration only.
3. **Finding KK (NEW; per-route Suspense-shield SSR-safety pattern).** Library-mode RR v7 + framework-mode `ssr:true` + `lazyWithReload`-at-widgetRegistry-altitude is a structurally-SSR-safe pattern at React 19. Any future widget added via the `widgetRegistry.ts:WIDGET_REGISTRY` table inherits the same reachability-negative SSR-safety guarantee by construction. NEW widgets should continue using `lazyWithReload(...)` per the registry shape; bare `React.lazy(...)` at widget altitude is structurally equivalent for the SSR-safety claim but loses the chunk-load-failure retry semantic (see Conventions "2-layer altitude rule for `lazyWithReload` vs bare `React.lazy`").

---

## §1 — Widget directory enumeration (empirical)

### §1.1 — Empirical layout (NO dedicated `widgets/` directory)

Sweep verified: NO `qualia-shell/src/widgets/**` directory exists. NO `qualia-shell/src/components/**/widgets/**` subdirectory exists. The canonical widget directory layout is **`qualia-shell/src/components/<WidgetName>/<WidgetName>.tsx`** — i.e., widgets are siblings of non-widget components, distinguished only by registry membership.

This means the "widget tree" is NOT a topological subtree of `components/`; it's a **registry-membership defined set** of 25 entry-points enumerated in `qualia-shell/src/registry/widgetRegistry.ts:WIDGET_REGISTRY`.

### §1.2 — Canonical widget set (from `widgetRegistry.ts`)

| # | Widget key | Entry-point file |
|--:|:--|:--|
| 1 | `strata-dashboard` | `components/StrataDashboard/StrataDashboard.tsx` |
| 2 | `astra-dashboard` | `components/AstraDashboard/AstraDashboard.tsx` |
| 3 | `universal-shell` | `components/UniversalShell/UniversalShell.tsx` |
| 4 | `inbox-zero` (+ alias `inbox-tasks` → `InboxZero.tsx`) | `components/InboxZero/InboxZero.tsx` |
| 5 | `task-menu` | `components/TaskMenu/TaskMenu.tsx` |
| 6 | `trello-board` | `components/TrelloBoard/TrelloBoard.tsx` |
| 7 | `home-upkeep-ai` | `components/HomeUpkeepAI/HomeUpkeepAI.tsx` |
| 8 | `automation-hub` | `components/AutomationHub/AutomationHub.tsx` |
| 9 | `tenant-portal-mgmt` | `components/TenantPortalMgmt/TenantPortalMgmt.tsx` |
| 10 | `georgia-code` | `components/GeorgiaCode/GeorgiaCode.tsx` |
| 11 | `ara-console` | `components/ARAConsole/ARAConsole.tsx` |
| 12 | `stella-agent` | `components/StellaAgent/StellaAgent.tsx` |
| 13 | `hydra-ai` | `components/HydraAI/HydraAI.tsx` |
| 14 | `thought-weaver` | `components/ThoughtWeaver/ThoughtWeaver.tsx` |
| 15 | `notebook-lm-context` | `components/NotebookLMContext/NotebookLMContext.tsx` |
| 16 | `two-brains` | `components/TwoBrains/TwoBrains.tsx` |
| 17 | `transcription-hub` | `components/TranscriptionHub/TranscriptionHub.tsx` |
| 18 | `fact-check-log` | `components/FactCheckLog/FactCheckLog.tsx` |
| 19 | `file-manager` | `components/FileManager/FileManager.tsx` |
| 20 | `doc-viewer` | `components/DocViewer/DocViewer.tsx` |
| 21 | `pdf-gear` | `components/PDFGear/PDFGear.tsx` |
| 22 | `notepad` | `components/Notepad/Notepad.tsx` |
| 23 | `template-generator` | `components/DocViewer/TemplateGenerator.tsx` (sibling of DocViewer) |
| 24 | `terminal` | `components/Terminal/Terminal.tsx` |
| 25 | `control-panel` | `components/ControlPanel/ControlPanel.tsx` |

24 canonical widget directories + 1 sibling-file entry-point (`TemplateGenerator.tsx` lives inside `DocViewer/`).

### §1.3 — Out-of-scope adjacent components

- `components/OpenJarvis/OpenJarvis.tsx` — App.tsx-altitude (not widget-registry-member); already covered by Phase-8 Task 8.10 provider/leaf-component remediation.
- `components/Antigravity/Antigravity.tsx` — **orphan** (NOT imported from any live source; references only from `.css` filename + string-text in OpenJarvis comments + adapter prose). Dead code; not in active tree; init-time-UNSAFE hit there is unreachable by construction. NOT remediation-relevant.
- `components/Shell/*` (AdminShell + Desktop + Sidebar + LayoutEngine + AppSuspenseFallback) — already covered by Phase-8 Task 8.10 remediation (provider tree + Sidebar leaf-component).
- `components/Auth/*` (LoginScreen + TenantLoginScreen) — App.tsx-altitude (not widget-registry-member); already verified SSR-safe at Task 8.11 smoke-test (LoginScreen IS the server-rendered initial paint at `/`).

---

## §2 — SSR-safety 3-altitude taxonomy (sweep results)

Per `Docs/CLAUDE_history.md` Conventions "Per-provider-SSR-safety taxonomy (3-altitude classification)" — the same taxonomy applies at widget altitude:

1. **Initialization-time UNSAFE** — `useState(() => browser-global)` lazy initializer OR module-top-level `const X = browser-global` read = fires during React render → throws `ReferenceError` on server-side render attempt.
2. **Effect-time SAFE** — inside `useEffect(() => …, [])` / `useLayoutEffect(() => …, [])` = fires AFTER hydration on client (no-op on server; effects don't fire during `renderToString` / `renderToPipeableStream`).
3. **Event-handler-time SAFE** — inside callback functions (`onClick`, `onChange`, `setItem` mutators) = fires on user interaction post-hydration.

### §2.1 — Init-time UNSAFE hits at widget altitude (3 hits across 24 widgets)

| # | File:Line | Hit | Pattern | Browser-global |
|--:|:--|:--|:--|:--|
| 1 | `components/TranscriptionHub/TranscriptionHub.tsx:312` | `const [sessionId] = useState(() => crypto.randomUUID());` | `useState(() => …)` lazy init | `crypto.randomUUID()` (WebCryptoAPI; Node 19+ exposes `globalThis.crypto` so NOT a strict ReferenceError under Node 20+ Vercel runtime — but produces a different UUID server-vs-client → potential hydration-mismatch HAZARD if the value is rendered into the DOM tree) |
| 2 | `components/TranscriptionHub/TranscriptionHub.tsx:376` | `const [liveSupported] = useState(() => !!(window.SpeechRecognition \|\| window.webkitSpeechRecognition));` | `useState(() => …)` lazy init | `window.SpeechRecognition` / `window.webkitSpeechRecognition` (bare-window read; `ReferenceError` on server) — Finding II cemented at Task 8.11 |
| 3 | `components/StellaAgent/StellaAgent.tsx:270` | `const [honchoLearnActive, setHonchoLearnActive] = useState(() => { return localStorage.getItem('honcho-learn-active') === 'true'; });` | `useState(() => …)` lazy init | `localStorage.getItem(...)` (`ReferenceError` on server) |

### §2.2 — Module-top-level reads (1 hit; TYPEOF-GUARDED = SAFE)

| # | File:Line | Hit | Guard | Verdict |
|--:|:--|:--|:--|:--|
| 1 | `components/StrataDashboard/strataApi.ts:40` | `if (typeof window !== 'undefined' && !(window as any).__strataApiModeLogged) { ... }` | `typeof window !== 'undefined'` | **SAFE** — SSR-aware module-top-level pattern; one-shot console breadcrumb that no-ops server-side by construction |

### §2.3 — Effect-time + event-handler-time references (SAFE; bulk count NOT enumerated per audit-scope discipline)

`grep -rEln "(window\.|localStorage\.|...)" qualia-shell/src/components/<24 widget dirs>/ --include="*.tsx"` returned **33 unique widget files** with at least one browser-global reference. The 3-altitude classification per file is OUT OF SCOPE at this audit altitude (audit-only / informational; deep per-file effect-time inventory is sister-altitude to Task 8.3 §3 provider-by-provider deep-dive but at widget-altitude that would be a 33-file deep-dive — disproportionate to the audit value, since effect-time/event-handler-time are SSR-SAFE by construction).

The audit conclusion rests on **init-time** classification (§2.1 + §2.2), which is the only altitude relevant for SSR-safety verdict. Effect-time + event-handler-time references are SSR-SAFE by 3-altitude-taxonomy axiom; they do not require per-file enumeration to ratify the audit.

### §2.4 — Categorical signal table

| Altitude | Hit count at widget tree | SSR-safety class |
|:--|:--:|:--|
| Init-time UNSAFE (raw) | 3 | Would be UNSAFE if reachable on server-render |
| Init-time SAFE (typeof-guarded module-top) | 1 | SAFE by construction |
| Effect-time SAFE | (many; not enumerated) | SAFE by 3-altitude-axiom |
| Event-handler-time SAFE | (many; not enumerated) | SAFE by 3-altitude-axiom |

---

## §3 — Per-hit reachability analysis (init-time UNSAFE hits)

### §3.1 — Reachability mechanism (A): AuthGate Branch 3 gating

App.tsx routing structure (verified at `qualia-shell/src/App.tsx`):

```
<BrowserRouter>
  <Routes>
    <Route path="/security" element={<SecurityRoute />} />          ← Branch 1 (no providers; standalone)
    <Route path="*" element={<DefaultRoute />} />                   ← Branches 2 + 3
  </Routes>
</BrowserRouter>

DefaultRoute:
  if (?popup=X) → Branch 2: <ThemeProvider><UserProvider><QueryProvider><PermissionsProvider><Suspense><PopupShell component={X}>
  else → Branch 3: <ThemeProvider><UserProvider><QueryProvider><AuthGate>

AuthGate:
  if (isLoading) → spinner (no children rendered)
  if (!isAuthenticated) → <LoginScreen> | <TenantLoginScreen>
  if (isAuthenticated && role === 'tenant') → <TenantPortal /> + <OpenJarvisWidget />
  if (isAuthenticated && role !== 'tenant') → <PermissionsProvider><AdminShell />
```

**Widget tree mount point:** widgets are mounted inside `AdminShell → Desktop → WINDOW_COMPONENTS[component]`. They only mount when `isAuthenticated && role !== 'tenant'`.

**Server-render at `/` (fresh session; no token):** `UserContext` initial state is `{ token: null, isLoading: true }` (per `UserContext.tsx` factory-produced store + `useSyncExternalStore` `getServerSnapshot` returning the server-default). At server-render, AuthGate's `isLoading` branch fires → spinner JSX rendered → AdminShell NOT mounted → widgets NOT mounted → 3 init-time-UNSAFE hits NOT executed.

**Empirical evidence:** Phase-8 Task 8.11 5-phase SSR smoke-test (`Scripts/smoke_test_ssr_phase8.mjs`) probes `/` at `ssr:true` runtime via chromium-headless and HARD-BLOCKS on any `ReferenceError` or hydration-mismatch warning. Test passes consistently — empirical confirmation that Branch 3 reachability is NEGATIVE for widget-altitude init-time-UNSAFE hits.

### §3.2 — Reachability mechanism (B): `lazyWithReload` Suspense-shield at `WINDOW_COMPONENTS`

`qualia-shell/src/registry/widgetRegistry.ts:280`:

```ts
export const WINDOW_COMPONENTS: Record<string, React.LazyExoticComponent<ComponentType<any>>> =
    // ... 25 entries, ALL produced via lazyWithReload(() => import(...))
```

Every widget in the registry is wrapped in `lazyWithReload(() => import('./WidgetName/WidgetName'))`. The `lazyWithReload` utility (`qualia-shell/src/utils/lazyWithReload.ts`) returns a `React.LazyExoticComponent<...>` — a React lazy component that resolves the dynamic import only when first rendered AND DOES NOT resolve on server-render.

**On server-side render:** React encounters the lazy component → throws a Promise → the nearest `<Suspense>` boundary catches → server emits the Suspense fallback HTML (not the widget body). The widget's source file is NOT loaded server-side → init-time-UNSAFE patterns inside the widget body are NEVER evaluated server-side.

**This mechanism is INDEPENDENT of branch:** even if a user navigates to `/?popup=TranscriptionHub` (Branch 2), the popup-mounted widget body would still be lazy-resolved at hydration time on the client — never on the server. PopupShell.tsx mounts `WINDOW_COMPONENTS[component]` which is itself a `LazyExoticComponent`. The `<Suspense fallback={<AppSuspenseFallback variant="popup" />}>` boundary at App.tsx DefaultRoute Branch 2 catches the lazy promise on server-render.

**Mechanism (B) is the STRONGER guarantee** — it holds even if AuthGate gating is bypassed (e.g., Branch 2 popup-direct-URL navigation). Mechanism (A) holds only for Branch 3.

### §3.3 — Per-hit reachability verdict

| # | Hit | Mechanism (A) AuthGate Branch 3 | Mechanism (B) lazyWithReload Suspense-shield | VERDICT |
|--:|:--|:--:|:--:|:--|
| 1 | `TranscriptionHub.tsx:312` `crypto.randomUUID()` | ✅ Negative (widget not mounted at `/`) | ✅ Negative (Suspense-shielded at all branches) | **🎯 REACHABILITY-NEGATIVE** |
| 2 | `TranscriptionHub.tsx:376` `window.SpeechRecognition` | ✅ Negative | ✅ Negative | **🎯 REACHABILITY-NEGATIVE** (Finding II cemented at Task 8.11 INFORMATIONAL) |
| 3 | `StellaAgent.tsx:270` `localStorage.getItem(...)` | ✅ Negative | ✅ Negative | **🎯 REACHABILITY-NEGATIVE** |

**Composite verdict:** ALL 3 init-time-UNSAFE hits are REACHABILITY-NEGATIVE via either mechanism independently; the DOUBLE-mechanism guarantee is robust to single-mechanism failure (e.g., if AuthGate Branch 3 gating were changed in future, mechanism (B) would still hold).

---

## §4 — Audit conclusion + remediation disposition

### §4.1 — Audit-only verdict ratified

**🎯 No production-source remediation required at this Task 9.4 close.** All 3 init-time-UNSAFE hits are reachability-negative; the DOUBLE mechanism (A) + (B) provides a robust SSR-safety guarantee at the React 19 + Vite 6 + RR v7 framework-mode + `ssr:true` architecture. The empirical baseline (Phase-8 Task 8.11 smoke-test passing under `ssr:true`) directly validates this conclusion.

**Cement as INFORMATIONAL catalog entry:** the 3 hits are cataloged as Finding II (TranscriptionHub.tsx:376 — already cemented at Task 8.11) + Finding II-Adjacent (TranscriptionHub.tsx:312 + StellaAgent.tsx:270 — newly surfaced at Task 9.4). All 3 share identical reachability-negative classification + identical INFORMATIONAL disposition.

### §4.2 — Future-state stewardship

IF future architectural changes break either reachability mechanism — e.g., (A) AuthGate Branch 3 gating is removed OR (B) widgets are no longer lazy-wrapped via `lazyWithReload` — the 3 init-time-UNSAFE hits would become reachability-POSITIVE and require remediation. Sister-shape remediation pattern is Phase-8 Task 8.9 / 8.10 / 8.11 work — `useSyncExternalStore` + `createLocalStorageStore` factory migration (sister-altitude to the 6 already-migrated provider + leaf-component sites).

This stewardship note is INFORMATIONAL only — no current task; no scoped remediation.

### §4.3 — Doc-coherence note: A2 / A3 / A4 disposition post-v1-L228-(a)-flip

Per Cowork verdict-lock 2026-05-23 (re-ratified v1 L228 ≤500 ms LCP → (a) STRUCTURALLY UNATTAINABLE at `bfcc654`), Block A items A2 / A3 / A4 are re-prioritized:

| Item | Original scope | Post-(a)-flip disposition |
|:--|:--|:--|
| **A2** AuthGate hydration-flash polish (Option β Suspense fallback) | UX polish + LCP-regression caveat | LCP-regression caveat MOOT (LCP no longer a live objective); A2 = optional UX polish; **Ilya-gated; NOT in Task 9.4 scope** |
| **A3** AuthGate hydration-flash polish (Option γ pre-hydration cookie) | UX polish + LCP-regression caveat | LCP-regression caveat MOOT; A3 = optional UX polish; **Ilya-gated; NOT in Task 9.4 scope; pick-one with A2 if pursued (mutually-redundant approaches)** |
| **A4** LCP bimodal investigation (Phase-8 cluster A 5,500 ms vs cluster B 2,724 ms) | LCP investigation | **🔴 MOOT** — LCP no longer a live objective per v1 L228 (a)-ratification; AND Task 9.3 POC-4 measurement showed cluster A entirely collapsed at Vercel (10/10 runs in single cluster — bimodal shape was a localhost-specific artifact). Task 9.4 does NOT execute A4. |

Per Cowork verdict-lock: Task 9.4 does NOT execute A2/A3/A4 — those items remain Ilya-gated optional polish OR moot. Task 9.4 scope is strictly A1 (this audit).

---

## §5 — Class designation candidate

**Candidate.** Audit-only / INFORMATIONAL with no production-source remediation. Closest existing class is **SCOPING-ONLY** (sister-shape to Task 9.2 B-α scoping + Task 9.3 next-lever scoping at Phase-9+ altitude) — DOC deliverable surveying a tree + cataloging findings without spawning a production-source change.

**Sub-shape:** `widget-altitude-SSR-safety-audit-with-reachability-negative-verdict` — distinct from prior SCOPING-ONLY sub-shapes (forward-scoping-roadmap @ 8.1 / provider-tree-audit @ 8.3 / NO-extraction-empirical-refutation @ 8.5 / per-route-SSR-opt-out-INFEASIBLE @ 8.8 / perf-lever-stacking-EXHAUSTED @ 8.13 / cross-phase-boundary-kickoff-with-stakeholder-decision-resolution @ 9.1 / architectural-axis-shift-scoping-CDN-edge-deploy-platform-decision-tree @ 9.2).

**Calibration:** SCOPING-ONLY 7pt → 8pt CROSS-PHASE-DISTRIBUTED extension at Task 9.4 close. (Phase-8+ 5pt + Phase-9+ 3pt = 8pt total cross-phase.)

Alternative candidate: a NEW class **WIDGET-SSR-AUDIT** if Cowork prefers structural distinction (sister-altitude to PROVIDER-SSR-REMEDIATION 19th but at widget-altitude + audit-only). Per Phase-8+ Task 8.13 precedent (perf-lever-refutation stayed SCOPING-ONLY rather than spawning a new class), SCOPING-ONLY extension is the conservative default. Final cementation at Cowork verdict at PR-merge altitude.

NOT a candidate: PROVIDER-SSR-REMEDIATION 3pt → 4pt extension — that class requires actual remediation (production-source migration), which Task 9.4 does NOT perform. The remediation candidate would only apply if a reachability-positive hit had forced a HARD HALT + Cowork-verdict-gated remediation task.

---

## §6 — Risks + open questions

### §6.1 — Risks for downstream architectural changes (informational)

1. **AuthGate Branch 3 gating dependency.** Future App.tsx routing changes that bypass AuthGate (e.g., adding a non-authenticated route that mounts widgets) would break mechanism (A). Stewardship: include AuthGate-gating verification in any future App.tsx routing PR.
2. **`lazyWithReload` widget-altitude convention dependency.** Future PRs that introduce a widget via bare `React.lazy(...)` AT WIDGET-ALTITUDE would still preserve mechanism (B) — the SSR-safety claim depends on the LAZY shape, not the specific `lazyWithReload` wrapper. But if a future PR introduces a widget via direct (non-lazy) import at `WINDOW_COMPONENTS` — that would break mechanism (B) at that widget. Stewardship: maintain `lazyWithReload` (or bare `React.lazy`) at all widgetRegistry entries; never use direct import in `WINDOW_COMPONENTS`.
3. **PopupShell-direct-URL altitude.** PopupShell DOES NOT AuthGate-gate. If a future widget breaks mechanism (B) AND mechanism (A) (e.g., bare-import widget mounted via PopupShell), Branch 2 popup-direct-URL navigation would fire init-time-UNSAFE patterns on server-render. Current state: mechanism (B) holds via the registry convention → no immediate risk.

### §6.2 — Open questions (NONE blocking)

No blocking OQs at this audit close. Audit is complete.

---

## §7 — Carry-forward + interactions

### §7.1 — Phase-9+ Block A remaining items disposition

Per §4.3 above:
- **A1** ✓ COMPLETE (this Task 9.4)
- **A2** Ilya-gated optional UX polish (LCP-regression caveat MOOT)
- **A3** Ilya-gated optional UX polish (mutually-redundant with A2; pick-one if pursued)
- **A4** 🔴 MOOT (v1 L228 (a)-ratified + bimodal collapsed empirically at Task 9.3)

### §7.2 — Phase-9+ Block C remaining items

Per Phase_9_Plan.md §1 Block C: 3 housekeeping items, 1 RESOLVED at 9.1 OPENER, 2 carry-forward. Not affected by Task 9.4 audit.

### §7.3 — Recursive-validation P2 standing convention

Per Phase-9+ standing PRE-FLIGHT P2 (CEMENTED at Task 9.1 OPENER): treat audit citations + cited gate-claims as STARTING-POINT-HYPOTHESES requiring empirical verification. Task 9.4 PRE0 verified empirically (vs cited):
- (cited) "qualia-shell/src/widgets/** + qualia-shell/src/components/**/widgets/** likely paths" → (empirical) NEITHER directory exists; widgets live in `components/<WidgetName>/` siblings → **recursive-validation P2 SUCCESSFUL — directive citation refuted at altitude (DIR-PATH-LITERAL-CHECK at PRE0)**. v2.60.1 cluster 17th altitude candidate at empirical [refutation] vs cited [likely paths].

### §7.4 — Anchor-bias 19-pattern → 20-pattern cluster extension candidate

v2.60.1 cluster (falsified-hypothesis empirical-verification) was at 16 altitudes pre-Task 9.4. Task 9.4 PRE0 surfaces a NEW altitude:
- **17th altitude `cited-directory-paths-DO-NOT-EXIST-empirical-refutation`** — at task-directive altitude, cited widget directory paths "likely qualia-shell/src/widgets/** + qualia-shell/src/components/**/widgets/**" were empirically refuted via `ls` + `find` sweep; widgets actually live as registry-membership-defined set in `components/<Name>/` siblings.

Class extension candidate: v2.60.1 16pt → 17pt at Task 9.4 PRE0. Final cementation at Cowork verdict at PR-merge altitude.

---

## §8 — Cowork decision gate

### §8.1 — Audit complete; ratify INFORMATIONAL disposition

Audit complete + reachability-NEGATIVE verdict ratified. NO production-source touched. NO remediation task scoped. INFORMATIONAL catalog cemented at this doc + CLAUDE.md Conventions update + Phase_9_Plan.md A1-resolution row.

### §8.2 — Class designation final cementation

Cowork to ratify class designation candidate: **SCOPING-ONLY 7pt → 8pt CROSS-PHASE-DISTRIBUTED extension** at Task 9.4 close (sub-shape `widget-altitude-SSR-safety-audit-with-reachability-negative-verdict`) OR introduce NEW class **WIDGET-SSR-AUDIT** (Phase-9+ first NEW class; sister-altitude to PROVIDER-SSR-REMEDIATION).

### §8.3 — v2.60.1 17th altitude cementation

Cowork to ratify v2.60.1 16pt → 17pt extension at Task 9.4 PRE0 (sub-shape `cited-directory-paths-DO-NOT-EXIST-empirical-refutation`; recursive-validation P2 standing successful).

🧪
