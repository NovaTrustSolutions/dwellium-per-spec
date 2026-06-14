# Assessment Sweep — Ledger (2026-06-12)

Branch: **`feat/assessment-sweep`** off `eb30826`. Not pushed; `main` untouched.
Reversibility: every change is on this branch (revert = delete the branch) and,
where it changes runtime behavior, behind a default-safe flag. Verified on a
`/tmp` mirror (the mounted folder forbids SQLite/unlink, so builds/tests run
off-mount). CodeGraph (`@colbymchenry/codegraph`) indexed the repo and drove
the call-graph work (callLlm chokepoint = 20 callers / 65 affected symbols;
the 16 `dwellium:*` buses; createLocalStorageStore = 63 references).

## Gate at close

| Check | Result |
|---|---|
| `tsc -b` | ✓ exit 0 |
| `vitest run` | ✓ **1,413 passed** (baseline 1,319 → **+94**) |
| `react-router build` (seeds=true) | ✓ exit 0 |
| `react-router build` (seeds=false) | ✓ exit 0 |
| `verify_no_pii_leak.mjs` | ✓ 0 leaks |

Commits (small clusters, each independently revertible):
`32dec63` gitignore · `b1ac4d9` C1 · `…` C2 · C3+C4 · C9 · C5+C6 · C7 · C8.

---

## Assessment items → disposition

### Weaknesses (the fixes)

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Security posture | **Scaffolded (frontend)** | `secretsAdapter.ts` (auto-upgrades to Electron `safeStorage`), Activation Center "Security mode" card (auth-on + server-side LLM proxy toggles). Backend `AUTH_ENABLED` flip + proxy route are the backend half — not in the mounted repo. |
| 2 | Verification breadth | **Done** | Registry-walker smoke (all 49 widgets well-formed + crash-isolation) + daily-driver Playwright journey specs + 94 new tests. |
| 3 | Performance ceiling | **Not addressed this sweep** | TranscriptionHub 2.36 MB chunk + media weight deferred (Ilya-gated per BACKLOG). |
| 4 | Event-bus invisible coupling | **Done** | `typedBus.ts` + `busChannels.ts`; 3 hand-rolled pending-slots migrated; startup mount-race structurally dead via undelivered-last-value replay. |
| 5 | Six overlapping layout systems | **Not addressed** | Option β Stage C is a deliberate larger arc (Phase-12 opener per BACKLOG). |
| 6 | God components | **DEFERRED** | Desktop.tsx / ARAConsole.tsx extraction — see "Deferred" below. |
| 7 | Single-machine data | **Scaffolded** | Activation Center "Cloud replication" card (Supabase URL+key). Backend replication worker is the backend half. |
| 8 | Uneven AI degradation | **Done (contract)** | `aiHealthStore` + `useAIAvailability` + `AIDegradedState`; the callLlm chokepoint now feeds health. Per-widget adoption inherits via the Widget Enhancement Layer's `aiContract` flag. |
| 9 | Documentation sprawl | **Partially done** | This ledger + the sweep is documented; the full collapse to 4 living docs is a low-risk follow-up (listed below). |
| 10 | Solo bus-factor | **Advanced** | Conventions are now encoded as typed code (typed bus, widget contract, AI contract) rather than prose. |

### Upgrades

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Live property-data feeds | **Scaffolded** | Activation Center "Live AppFolio sync" card (base URL + client creds). Backend `/api/appfolio/sync` is the backend half. |
| 2 | Real security mode | **Scaffolded** | = weakness #1. |
| 3 | Cloud replication of One Save | **Scaffolded** | = weakness #7. |
| 4 | Mobile companion (PWA) | **Scaffolded** | Activation Center "Phone companion (PWA)" toggle. Manifest/SW shell wiring is the follow-up the flag gates. |
| 5 | Auto-updater | **Scaffolded** | Activation Center "Auto-updater" card (feed URL). `electron-updater` wiring in the packaged build is the follow-up. |
| 6 | ARA streaming + tool calls | **Foundation** | `llmStream.ts` (streaming-shaped API, single-shot fallback today) + `araPrefsStore` flags. Per-provider SSE + ARAConsole wiring deferred. |
| 7 | Time travel | **Done (frontend)** | Time Travel widget (#49) over `oneSaveClient.history()`; restore = new version (reversible by design). Backend `/history` route is the backend half (widget degrades honestly without it). |
| 8 | Backend cron + notifications | **Scaffolded** | Activation Center "Desktop notifications" card. |
| 9 | Widget consolidation | **Proposal only** | Deletions are your call — not executed. |
| 10 | Continuous voice mode | **Foundation** | `araPrefsStore.holdToTalk` flag; mic-loop wiring deferred with #6. |

---

## The 10 + 10 per-widget improvements (all 49 widgets)

Delivered at the **shell layer** (per your pick) so every widget inherits them
through `Window.tsx` → `WidgetShell`, each behind a flag in
`widgetEnhancementsStore` (reversible at runtime).

**Functional (C3):** 1 error boundary + retry · 2 loading skeleton · 3 mount
perf telemetry · 4 surfaced errors · 5 crash-recovery remount · 6 escape-to-close
(opt-in) · 7 auto-focus-on-open (opt-in) · 8 reduced-motion · 9 mount fade-in ·
10 AI-degraded contract.

**UI (C4):** 1 density token · 2 themed scrollbars · 3 focus-visible rings ·
4 hover/active affordance · 5 font-scale clamp · 6 min-size guard · 7 themed
selection · 8 consistent empty/error visuals · 9 stable scroll gutter ·
10 motion-safe transitions.

Behavior-changing flags (`escapeToClose`, `autoFocusOnOpen`) default **OFF** so
the baseline interaction model is unchanged; with the boundary flag off,
`WidgetShell` is a transparent pass-through.

---

## Deferred (deliberately, with rationale)

- **C10 god-component extraction (weakness #6).** Desktop.tsx + ARAConsole.tsx
  are ~2,500–3,000 lines each. Mechanical extraction is the right move, but
  doing it at the end of a long session is precisely how regressions breed
  (the assessment's own warning). Wants a focused session with codegraph
  `callees`/`impact` driving seam selection + a green gate per slice.
- **ARA streaming SSE + hold-to-talk mic loop (upgrade #6/#10 deep half).**
  Foundation shipped; the consuming wiring lives inside the ARAConsole god
  component — pairs naturally with C10.
- **Performance (weakness #3), layout unification (weakness #5), doc collapse
  to 4 living docs (weakness #9 remainder), widget-merge deletions (upgrade #9).**

## Backend halves (cannot be committed from this repo)

The backend (`../ai-dashboard369-file-manager`) is not in the mounted folder.
These activate the moment their backend half ships, with no frontend change:
AppFolio sync route · `AUTH_ENABLED` flip + server-side LLM proxy · Supabase
replication worker · `electron-updater` in the packaged build · One Save
`/history` route. All are surfaced honestly in the Activation Center with a
"Backend pending" chip.

## To activate anything

Control Panel → **Activation Center**: enter the key/URL, flip the toggle.
Widget enhancement toggles live in `widgetEnhancementsStore` (a settings
surface for them is the obvious small follow-up). ARA prefs in `araPrefsStore`.
