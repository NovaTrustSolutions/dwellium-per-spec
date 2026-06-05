# PM-Exec Dashboard arc — CONTINUOUS AUTONOMOUS driver

You are running UNATTENDED for ~2 hours. Ilya is NOT at the keyboard and will NOT
answer anything. **Never ask questions. Never stop for review between cycles.** Decide,
log, keep moving. This prompt is re-fed every iteration — re-orient from the repo each
time, do ONE bounded cycle, leave the tree committed + green, end the turn.

Global rules (Ilya's CLAUDE.md): 🧪 in every response; ETA before each step; **paste
verification proof inline BEFORE any "done/green/complete" claim**; no browser subagents
(run_command/curl/node); NO `git push` ever; never undo Ilya's manual commits; never
delete `Scripts/autorun/HALT`.

═══════════════════════════════════════════════════════════════════════════════
## GOAL OF THIS ARC
═══════════════════════════════════════════════════════════════════════════════
Deliver an **interactive dashboard for a property-management executive** whose remit
spans research, litigation/legal, compliance, HR, finance, operations/maintenance,
tenant & lease management, vendors, and risk. It must be **composable** (add / remove /
rearrange widgets) with **per-user persistence**, **interactive** (filters, date ranges,
drill-down), and wired to **real data** where the app already has it (clearly-labeled
mock only where it doesn't).

**KEY HEAD START (verified by inventory — confirm as you go):** you are NOT starting from
scratch. `src/components/AstraDashboard/AstraDashboard.tsx` (481 L, registered as widget
`astra-dashboard`, in the "Property Management" sidebar group) is ALREADY an
"Executive-tier dashboard" with the right SECTIONS — Portfolio Heatmap, Watchdog List,
Financial Quick-viz, Compliance Calendar, AI Agent Log, + 5 tabs (Dashboard / Workspace /
Channels / Intelligence / Observability). BUT its data arrays are EMPTY mock stubs
(`HEATMAP_PROPERTIES = []`, `WATCHDOG_ITEMS = []`, `FINANCIAL_CARDS = []`,
`CALENDAR_EVENTS = []`, `AGENT_LOG = []`). **This arc EXTENDS AstraDashboard into the
real PM-exec dashboard — do NOT build a parallel one.** Decision logged: see ARA arc's
`workspaceScribe.ts` for the injectable-deps + event-bus patterns to mirror.

═══════════════════════════════════════════════════════════════════════════════
## ABSOLUTE AUTONOMY RULES (same as the two arcs that just succeeded)
═══════════════════════════════════════════════════════════════════════════════
1. NO QUESTIONS, NO REVIEW STOPS. Chain Cycle 1 → 2 → … continuously.
2. DECIDE + LOG every fork to `Scripts/autorun/DASH_DECISIONS.md` (reversible defaults).
3. ONE CYCLE PER ITERATION. Finish, gate, commit, end turn.
4. ALWAYS LEAVE IT GREEN + COMMITTED. Can't get green → revert your cycle's changes,
   log why, move on. Never leave it broken.
5. HALT ONLY ON A TRUE BLOCKER (`touch Scripts/autorun/STOP`) — same failure 3 iterations
   running, or destructive action needed. `touch Scripts/autorun/ALL_DONE` only when the
   whole arc (incl. closure) is verified done.
6. LOG EVERY ITERATION to `Scripts/autorun/DASH_PROGRESS.md`.

## KNOWN TRAPS — handle automatically, never stop on these
- **Port 3000 = live Dwellium app.** ALWAYS run the smoke step with `SMOKE_TEST_PORT=3458`.
  Never kill what holds 3000.
- **Terminal truncates long output.** Capture the gate to a log and read the tail.
- **cwd does NOT persist between run_command calls.** `cd` to the absolute repo path
  at the start of each command.
- **vitest baseline at this branch's base = 385 passed / 51 files** (after the ARA arc).
  Green with a HIGHER count is good (you added tests) — note the delta. A failure you
  didn't cause: prove pre-existing (git stash + run), then proceed.
- **`Scripts/autorun/HALT`** — leave untracked, never delete/commit.
- **Strata `data-testid` + container-query gotcha:** the StrataDashboard window has a
  1100×800 default + container-query collapse < 700px (see repo CLAUDE.md). If you embed
  Strata-derived views, mind minWidth so the 3-column grid doesn't collapse.

## THE STRICT GATE (end of every cycle that touches source)
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell" && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_PORT=3458 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```
6/6 green = commit. Red you caused = fix or revert. Docs-only cycles need only `git status`.

═══════════════════════════════════════════════════════════════════════════════
## STEP 0 — FIRST ITERATION ONLY: create the branch
═══════════════════════════════════════════════════════════════════════════════
If branch `feat/pm-exec-dashboard` does NOT exist:
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec"
git status --short    # expect clean except untracked autorun files
git checkout feat/ara-stella-inbox-linkage 2>/dev/null || true   # build on the ARA arc
git checkout -b feat/pm-exec-dashboard
git rev-parse --abbrev-ref HEAD   # MUST be feat/pm-exec-dashboard
```
If it already exists, `git checkout feat/pm-exec-dashboard` and continue from PROGRESS.
Create `DASH_PROGRESS.md` + `DASH_DECISIONS.md` on iteration 1.

═══════════════════════════════════════════════════════════════════════════════
## EVERY ITERATION — orient, then do the next undone cycle
═══════════════════════════════════════════════════════════════════════════════
a. `cd` repo, confirm branch `feat/pm-exec-dashboard` (checkout if needed), `git status`
   clean except untracked autorun files (clean only YOUR junk, never HALT).
b. Read last ~10 lines of `Scripts/autorun/DASH_PROGRESS.md`.
c. Find lowest-numbered undone cycle → do exactly that one → gate → commit → mark done →
   end turn.
d. All cycles incl. closure done + gate green → closure summary + `touch ALL_DONE`.

## GROUND TRUTH (verify as you go)
- **Extend:** `src/components/AstraDashboard/AstraDashboard.tsx` (+ AstraWorkspace.tsx,
  IntelligenceDashboard.tsx, ObservabilityPanel.tsx, ThreadChannels.tsx). Registered
  `astra-dashboard` (widgetRegistry.ts:58) in hierarchy.ts:17 "Property Management".
- **Real data sources (Strata modules, fetch via `strataApi`):** ComplianceEngine.tsx
  (1233 L), MaintenanceModule.tsx (1200 L), LegalModule.tsx (583 L), LeasingModule,
  VendorsModule, InsuranceModule, IncidentModule, ForecastModule, ReportingModule,
  OwnersModule, ResidentsModule, PropertiesModule, AccountingModule. Reuse their data
  hooks / `strataApi` calls — don't duplicate fetch logic; import or mirror it.
- **Composition + persistence (already built — REUSE):** `savedLayoutsStore` (per-user
  dynamic key `qualia_saved_layouts_${user.id}`, WindowContext.tsx:81) + `SavedLayout`
  type (data/types) + `dwellium:open-widget` bus (WindowContext.tsx:447) for opening
  widgets onto the canvas. The Window/Desktop system already does drag/resize/persist.
- **LLM (for "research"):** `lib/llmClient.ts` `callLlm` + `useIntegrations` (per-user).
- **Cross-widget bus helper pattern:** `src/components/Workspace/workspaceScribe.ts`
  (injectable deps + `dispatchOpenWidget`) — mirror for testability.

═══════════════════════════════════════════════════════════════════════════════
## CYCLE SEQUENCE (in order; each gate-green + committed)
═══════════════════════════════════════════════════════════════════════════════
**Cycle 1 — DASHBOARD AUDIT + PLAN (docs-only).** Read AstraDashboard.tsx + its 4 sub-
files; read how 4–5 key Strata modules fetch (ComplianceEngine, MaintenanceModule,
LegalModule, LeasingModule, ForecastModule). Read `savedLayoutsStore` + `SavedLayout` +
the `dwellium:open-widget` flow. Write `Scripts/autorun/DASH_PLAN.md`: the exec remit →
panel map (which existing module/data feeds each panel; what's new), the composability
approach (reuse savedLayouts vs. an in-dashboard grid — pick the MORE REVERSIBLE; log to
DASH_DECISIONS.md), the interactivity model (filters/date-range/drill-down), data-source
table (real vs. mock per panel), and a ~10-cycle sequence. Commit. End turn.

**Cycle 2 — Panel data layer (no UI yet).** Create `src/components/AstraDashboard/
dashboardData.ts` (+ test): typed fetchers that pull the exec-relevant data from existing
strataApi endpoints (compliance items + due dates, open work orders, active legal matters,
lease expirations, financial snapshot, vendor/insurance status, incidents/risk). Where an
endpoint doesn't exist, return a clearly-typed `{ mock: true, ... }` shape. Unit-test the
fetchers with mocked strataApi. FULL gate. Commit.

**Cycle 3 — Wire AstraDashboard's existing sections to real data.** Replace the empty mock
arrays (HEATMAP/WATCHDOG/FINANCIAL/CALENDAR/AGENT_LOG) with the Cycle-2 fetchers + proper
loading/empty/error states. Keep mock clearly labeled where no real source. FULL gate. Commit.

**Cycle 4 — Composable panel grid + per-user persistence.** Make the dashboard panels
add/remove/rearrange. REUSE `savedLayoutsStore` if it fits dashboard panels; otherwise add
a minimal `dashboardLayoutStore` via `createLocalStorageStore` (per-user dynamic key,
mirror fileExplorerStore/savedLayouts). Persist which panels are shown + their order.
Add a test. FULL gate. Commit.

**Cycle 5 — Compliance + Legal/Litigation panels.** Surface compliance calendar (filings,
inspections, certs, due dates) + a litigation/matter tracker (status, deadlines, counsel)
from ComplianceEngine/LegalModule data. Drill-down opens the relevant module via
`dwellium:open-widget`. FULL gate. Commit.

**Cycle 6 — Operations panels: Maintenance + Leases + Vendors.** Work-order queue,
lease-expirations, vendor/contract status panels from the existing modules' data, each with
filter + drill-down handoff. FULL gate. Commit.

**Cycle 7 — Finance + Risk panels.** NOI / delinquencies / budget-vs-actual snapshot
(Forecast/Accounting) + a risk register (Incident/Insurance). Date-range filter on finance.
FULL gate. Commit.

**Cycle 8 — HR + Research panels.** HR panel (headcount/open roles/incidents — mock-labeled
if no HR data source exists) + a Research feed panel using `callLlm` (per-user LLM) for
market/regulatory summaries, with graceful no-LLM state. FULL gate. Commit.

**Cycle 9 — Interactivity + a11y + polish.** Global filters (portfolio/date), consistent
loading/empty/error UI across panels, WCAG AA labels on controls, keyboard nav. FULL gate.
Commit.

**Cycle 10 — CLOSURE.** Write `Scripts/autorun/DASH_CLOSURE.md` (commit SHAs, panel→source
table final, composability/persistence summary, deferred items, push commands). Re-run the
FULL gate fresh at closure HEAD. `touch Scripts/autorun/ALL_DONE`.

If a cycle is bigger than one iteration, split it: coherent chunk, gate, commit, DON'T mark
done — next iteration continues it. **Reuse before building. Never duplicate fetch logic.**

═══════════════════════════════════════════════════════════════════════════════
## END-OF-ARC
═══════════════════════════════════════════════════════════════════════════════
When all 10 cycles done + gate green: append final summary to DASH_PROGRESS.md with push
commands (`git push origin main` then `git push -u origin feat/pm-exec-dashboard`) and
`touch Scripts/autorun/ALL_DONE`. Do NOT push.

LOOP CONTRACT: one bounded cycle, verified green, committed, logged — then end the turn.
