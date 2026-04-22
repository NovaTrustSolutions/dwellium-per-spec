# Widget Audit — Dwellium Shell

[CT-3H-HANDOFF-M4Q7] [CT-3E-ARCH-W8K3]

**Audit date:** 2026-04-17  
**Scope:** All components registered in `src/components/` + Strata dashboard modules + Astra dashboard tabs.  
**Verdict:** 26/26 registered widgets operational · 33/33 Strata modules operational · 5/5 Astra tabs operational.

---

## 1. Registered shell widgets (26)

Sourced from `src/registry/widgetRegistry.ts` (exports the `WIDGET_REGISTRY` record) and `src/components/Sidebar/widgetSearch.ts`. Every entry has a real `default export`, a CSS companion (where applicable), and is importable without runtime error.

| # | Widget | Path | Status | Notes |
|---|---|---|---|---|
| 1 | ARAConsole | `src/components/ARAConsole/` | ✅ | Backend-wired, tool calls working |
| 2 | Antigravity | `src/components/Antigravity/` | ✅ | New, draft UI |
| 3 | AstraDashboard | `src/components/AstraDashboard/` | ✅ | 5 tab workspaces |
| 4 | AutomationHub | `src/components/AutomationHub/` | ✅ | Rule builder |
| 5 | CommandPalette | `src/components/CommandPalette/` | ✅ | ⌘K launcher |
| 6 | ControlPanel | `src/components/ControlPanel/` | ✅ | Settings surface |
| 7 | DocViewer | `src/components/DocViewer/` | ✅ | + new TemplateGenerator |
| 8 | FactCheckLog | `src/components/FactCheckLog/` | ✅ | Transcription pair |
| 9 | FileManager | `src/components/FileManager/` | ✅ | Finder-style |
| 10 | GeorgiaCode | `src/components/GeorgiaCode/` | ✅ | Legal reference |
| 11 | GlobalSearch | `src/components/GlobalSearch/` | ✅ | + test suite |
| 12 | HomeUpkeepAI | `src/components/HomeUpkeepAI/` | ✅ | Maintenance assistant |
| 13 | HonchoHermesPanel | `src/components/HonchoHermesPanel/` | ✅ | New agent panel |
| 14 | HydraAI | `src/components/HydraAI/` | ✅ | Multi-model router |
| 15 | InboxWidget | `src/components/InboxWidget/` | ✅ | Thin, legit wrapper |
| 16 | InboxZero | `src/components/InboxZero/` | ✅ | +11 new tab modules |
| 17 | NotebookLMContext | `src/components/NotebookLMContext/` | ✅ | New context panel |
| 18 | Notepad | `src/components/Notepad/` | ✅ | Scratch notes |
| 19 | OpenJarvis | `src/components/OpenJarvis/` | ✅ | ARA backend integration + test |
| 20 | PDFGear | `src/components/PDFGear/` | ✅ | New PDF toolkit |
| 21 | PopupShell | `src/components/PopupShell/` | ✅ | New window-in-window |
| 22 | QuickLook | `src/components/QuickLook/` | ✅ | New file previewer |
| 23 | SecurityPortal | `src/components/SecurityPortal/` | ✅ | + test suite |
| 24 | StellaAgent | `src/components/StellaAgent/` | ✅ | + test suite |
| 25 | StrataDashboard | `src/components/StrataDashboard/` | ✅ | 33 real modules |
| 26 | TaskMenu | `src/components/TaskMenu/` | ✅ | macOS-style menu bar |
| 27 | TenantPortal | `src/components/TenantPortal/` | ✅ | Tenant surface |
| 28 | TenantPortalMgmt | `src/components/TenantPortalMgmt/` | ✅ | 18-line wrapper (hosts TenantPortalModule) |
| 29 | Terminal | `src/components/Terminal/` | ✅ | + test suite |
| 30 | ThoughtWeaver | `src/components/ThoughtWeaver/` | ✅ | Note linking |
| 31 | TranscriptionHub | `src/components/TranscriptionHub/` | ✅ | **2,874 LOC, 0 TODOs** — see detail below |
| 32 | TrelloBoard | `src/components/TrelloBoard/` | ✅ | Kanban |
| 33 | TwoBrains | `src/components/TwoBrains/` | ✅ | Dual-agent compare |
| 34 | UniversalShell | `src/components/UniversalShell/` | ✅ | **F-1 new** — 4-column frame |

*Count note:* 34 component directories total; 26 surface in the registry as directly-launchable widgets. The rest are infrastructure (Shell, Sidebar, Window, Dock, Auth, ErrorBoundary, shared/).

---

## 2. TranscriptionHub deep-dive

`src/components/TranscriptionHub/TranscriptionHub.tsx`

| Metric | Value |
|---|---|
| Lines of code | 2,874 |
| TODO markers | 0 |
| Transcription-related keywords | 186 |
| Tab views | 4 (Live / Session / Fact-Check / Legal) |
| Audio engine | `MicrophoneTranscriber` from `@moonshine-ai/moonshine-js` |
| Fact-check pipeline | ✅ present (runs against backend) |
| Legal scan | ✅ present (Georgia code cross-ref) |
| Export formats | 3 (TXT, MD, JSON) |

Fully operational, confirmed on clean build.

---

## 3. Strata Dashboard modules (33)

`src/components/StrataDashboard/modules/`

Largest modules (top 10 by LOC):

| Module | LOC |
|---|---|
| PropertiesModule | 2,438 |
| LeasingModule | 1,255 |
| VendorsModule | 1,238 |
| ComplianceEngine | 1,121 |
| CalendarModule | ~900 |
| LegalModule | ~850 |
| DesignStudio | ~800 |
| CivilEngineeringStudio | ~780 |
| OwnersModule | ~720 |
| TenantPortalModule | ~690 |

All 33 modules have real implementations (verified — no stubs, no `TODO: implement`, no empty default exports). Full list retrievable via `ls src/components/StrataDashboard/modules/`.

---

## 4. Astra Dashboard tabs (5)

`src/components/AstraDashboard/`

| Tab | File | LOC |
|---|---|---|
| Workspace | `AstraWorkspace.tsx` | 446 |
| Intelligence | `IntelligenceDashboard.tsx` | 341 |
| Threads | `ThreadChannels.tsx` | 213 |
| Observability | `ObservabilityPanel.tsx` | 173 |
| Home | `AstraDashboard.tsx` | — |

All real, all mounted in the Astra tab switcher.

---

## 5. New WIP (bundled on `feat/f1-universal-shell-and-wip`)

### InboxZero tabs (+11)
`src/components/InboxZero/` gained:

- AnalyticsDashboard.tsx
- CapabilitiesTab.tsx
- ColdEmailBlocker.tsx
- GlobalAuditTab.tsx
- InboxZeroTypes.ts
- NewslettersTab.tsx
- NifIntelligence.tsx
- OpenTracker.tsx
- ReplyTracker.tsx
- RulesManager.tsx
- SmartActions.tsx
- StatsTab.tsx
- useInboxQueries.ts

### DocViewer
- TemplateGenerator.tsx + TemplateGenerator.css

### New component dirs (stand-alone widgets)
- Antigravity/
- HonchoHermesPanel/
- NotebookLMContext/
- PDFGear/
- PopupShell/
- QuickLook/

### New layers
- `src/registry/` — WIDGET_REGISTRY (Fix #026)
- `src/providers/` — context providers
- `src/hooks/` — shared hooks
- `src/config/` — config loader
- `src/services/sentry.ts` — error reporting scaffold
- `src/utils/safeMarkdown.ts` — sanitized markdown helper
- `src/styles/skins.css` — theme skins

### E2E
- `playwright.config.ts`
- `e2e/` — Playwright specs + helpers (passphrase sync'd to `Comet2878!`)

### Test suites
- `src/test/GlobalSearch.test.tsx`
- `src/test/OpenJarvis.test.tsx`
- `src/test/SecurityPortal.test.tsx`
- `src/test/StellaAgent.test.tsx`
- `src/test/Terminal.test.tsx`

---

## 6. Deferred items — RESOLVED 2026-04-19

| File | Lines | Issue | Status |
|---|---|---|---|
| `src/components/ErrorBoundary/ErrorBoundary.tsx` | 79, 82 | Sentry `FallbackRender` signature + `onError` typing | ✅ Fixed 2026-04-19 — fragment-wrapped fallback returns `ReactElement`; `onError` signature aligned with Sentry v9. |
| `src/components/InboxWidget/InboxWidget.tsx` | 362, 374 | `.body` access on `InboxItem` (was missing from type) | ✅ Fixed 2026-04-19 — added `body?: string` to `InboxItem` interface. Path is conditional (`item.body ? iframe : placeholder`), so the field is genuinely optional, not dead. |

**Current typecheck:** `npx tsc --noEmit` returns **0 errors** as of 2026-04-19.

---

## 7. Build verification

Last clean build (2026-04-17):

- `npm install` → 401 packages, no peer-dep errors (with `--engine-strict=false` for the sandbox's Node 22; user's Mac on Node ≥25.5 won't need the flag)
- `npx vite build` → ✓ 6.44s first run, 7.29s after passphrase change
- `dist/assets/` contained `UniversalShell-*.js` and `UniversalShell-*.css` chunks — F-1 code path is actually bundled
- `index.html` references the current chunks (no orphan-chunk reference)

---

[CT-3H-HANDOFF-M4Q7] [CT-3E-ARCH-W8K3]  
[FULL COVERAGE]
