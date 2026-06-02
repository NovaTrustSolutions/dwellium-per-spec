# Workspace arc — CONTINUOUS AUTONOMOUS driver (fed once per loop iteration)

You are running UNATTENDED for ~2 hours. Ilya is NOT at the keyboard and will NOT
answer anything. **Never ask questions. Never stop for review between cycles.** Make
the best reasonable decision, log it, and keep moving. This prompt is re-fed to you
every iteration — re-orient from the repo each time, do ONE bounded cycle of real
work, leave the tree committed + green, then end the turn. The wrapper re-invokes you.

Global rules (Ilya's CLAUDE.md): put 🧪 in every response; give an ETA before each
step; **paste verification proof inline BEFORE any "done/green/complete" claim**; no
browser subagents (use run_command/curl/node); NO `git push` ever (commit only —
Ilya pushes after); never undo Ilya's manual commits; never delete `Scripts/autorun/HALT`.

═══════════════════════════════════════════════════════════════════════════════
## ABSOLUTE AUTONOMY RULES
═══════════════════════════════════════════════════════════════════════════════
1. NO QUESTIONS, NO REVIEW STOPS. The old per-cycle "STOP for review" gates are
   SUSPENDED for this run. Chain Cycle 2 → 3 → 4 → … without pausing.
2. DECIDE + LOG. At any fork (data-model shape, Scribe/Thread coupling, FileExplorer
   scoping, route naming, etc.) pick the most reasonable + most REVERSIBLE default,
   append the decision + rationale to `Scripts/autorun/DECISIONS.md`, and proceed.
   Prefer choices that are easy to change later over ones that lock in architecture.
3. ONE CYCLE PER ITERATION. Each iteration = one coherent unit (see the cycle sketch
   in WORKSPACE_PORTING_PLAN.md once Cycle 2 writes it). Finish it, gate it, commit it,
   end the turn. Don't try to do the whole arc in one pass.
4. ALWAYS LEAVE IT GREEN + COMMITTED. Never end an iteration with a red gate or
   uncommitted source. If you can't get green, revert your iteration's changes
   (`git checkout -- <files>` / `git reset --hard HEAD` of only your work), log why
   in PROGRESS.md, and move to the next safe item — do NOT leave the tree broken.
5. HALT ONLY ON A TRUE BLOCKER. Touch `Scripts/autorun/STOP` only if continuing would
   be destructive or the same failure recurs 3 iterations running. Touch
   `Scripts/autorun/ALL_DONE` only when the whole arc (through closure) is verified done.
6. LOG EVERY ITERATION to `Scripts/autorun/PROGRESS.md` (timestamp, cycle, what you
   did, what you verified with proof, what's next).

═══════════════════════════════════════════════════════════════════════════════
## KNOWN TRAPS — handle automatically, never re-diagnose, never stop on these
═══════════════════════════════════════════════════════════════════════════════
- **Port 3000 is the live Dwellium app.** The SSR smoke stage will EADDRINUSE on 3000.
  ALWAYS run the gate's smoke step with a free port: `SMOKE_TEST_PORT=3458`. Never kill
  whatever holds 3000. (Recorded in MEMORY.md.)
- **Terminal truncates long gate output.** Run the gate capturing to a log and read the
  log, e.g. append `2>&1 | tee Scripts/autorun/logs/gate_$(date +%s).log` and inspect
  the tail, so a truncated console doesn't look like a failure.
- **cwd does not persist between your run_command calls.** Always `cd` to an absolute
  path at the START of each command (e.g. `cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec"`).
- **vitest baseline = 278 passed | 39 skipped** (after the ARAConsole mock fix at db0ab95,
  already on main). A green vitest with a DIFFERENT count is fine if your cycle added
  tests — note the delta in PROGRESS.md. A vitest FAILURE you didn't cause: investigate;
  if it's pre-existing on main (prove with `git stash` + run), log it and proceed with
  your cycle, don't try to fix unrelated pre-existing failures.
- **`Scripts/autorun/HALT` is an autorun stop-signal file** — leave it untracked, never
  delete or commit it. It does not block YOUR work.

## THE STRICT GATE (run at the end of every cycle that touches source)
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell" && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_PORT=3458 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```
6/6 green = commit. Any red you CAUSED = fix it or revert your cycle's work (rule 4).
Docs-only cycles (e.g. Cycle 2 plan) don't need the full gate — a `git status` sanity
check is enough.

═══════════════════════════════════════════════════════════════════════════════
## EVERY ITERATION — START HERE
═══════════════════════════════════════════════════════════════════════════════
a. `cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec"` and confirm branch:
   `git rev-parse --abbrev-ref HEAD` MUST be `feat/workspace-widget`. If not, checkout it.
   `git status --short` — expect clean except untracked HALT. If a PRIOR iteration left
   junk, clean only YOUR junk (never Ilya's commits, never HALT).
b. Read the last ~10 lines of `Scripts/autorun/PROGRESS.md` to see what's done.
c. Determine the current cycle:
   - If `Scripts/autorun/WORKSPACE_PORTING_PLAN.md` is still the ~5-line STUB →
     you are on **Cycle 2 (discovery + plan)**. Do Cycle 2 (below), commit, end turn.
   - Else the plan exists → find the lowest cycle in its "port sequence" not yet marked
     done in PROGRESS.md → that's THIS iteration's cycle. Do it, gate, commit, end turn.
d. If every cycle through closure is done + gate green → write the closure summary to
   PROGRESS.md and `touch Scripts/autorun/ALL_DONE`.

───────────────────────────────────────────────────────────────────────────────
### CYCLE 2 (discovery + plan) — if the plan is still a stub
───────────────────────────────────────────────────────────────────────────────
Read (READ ONLY, Read tool) and take notes:
- Holocron: `Docs/holocron-reference/editor/src/main/workspace.ts`, `projectFs.ts`,
  `domaineFs.ts`, `scripts/migrations/004_domaines.sql`, `005_wiki_pages_domaine.sql`,
  `src/renderer/src/store/domainesStore.ts`, `components/layout/Domaines.tsx`,
  `components/layout/ThreadPickerHeader.tsx`, `components/DomaineBadge.tsx`,
  `hooks/useDomaineForProject.ts`, `utils/threadActions.ts`.
- Dwellium target patterns: `qualia-shell/src/components/FileExplorer/fileExplorerApi.ts`,
  `fileExplorerStore.ts`, `qualia-shell/src/components/Scribe/scribeStore.ts`,
  `qualia-shell/src/utils/createLocalStorageStore.ts`,
  `qualia-shell/src/registry/widgetRegistry.ts` (scribe ~L264, file-explorer ~L271),
  `qualia-shell/src/data/hierarchy.ts` (Filing Cabinet ~L37-47),
  `Docs/backend-file-explorer-routes.ts` (route-contract format to mirror).

Key architecture fact (already established — verify as you read): Holocron is Electron
(chokidar/IPC/BrowserWindow/main-process Postgres+fs). Dwellium is React+react-router
SSR; widgets fetch over HTTP (`${API_BASE}/api/<feature>/*` + `getAuthHeaders()`); backend
ROUTES live in a SEPARATE sibling repo, documented in-repo as `Docs/backend-<feature>-routes.ts`;
per-user UI state uses `createLocalStorageStore` keyed by user id. So the port = runtime
translation (Electron→web-over-HTTP), NOT a copy. Data model: Domaine (`rag_domaines`) →
Project (`rag_namespaces` row w/ `domaine_id` FK) → Thread (folders under the project).

Write `Scripts/autorun/WORKSPACE_PORTING_PLAN.md` (replace stub) with sections:
1. Architecture translation table (Holocron primitive → Dwellium equivalent, per file).
2. Data model (Domaine→Project→Thread, fields from 004_domaines.sql + IPC types). DECIDE
   whether to reuse Dwellium's existing namespace/hierarchy concepts or a parallel model —
   pick the MORE REVERSIBLE option, log to DECISIONS.md.
3. Backend route surface: a `/api/workspace/*` contract sketch (mirror file-explorer);
   mark "IMPLEMENTED IN SIBLING BACKEND — out of scope for this branch (client + contract only)".
4. Per-user storage (active domaine, drill view, sort prefs — mirror domainesStore fields),
   keyed by user id like fileExplorerStore.
5. Scribe + FileExplorer integration: DECIDE (a) does a Scribe tab belong to a Thread?
   (b) is the FileExplorer tree scoped to the active Project? Pick reversible defaults,
   log to DECISIONS.md.
6. SSR safety notes (route init-time browser globals through createLocalStorageStore/effects).
7. A concrete ~10-cycle port sequence (Cycle 3..N), each a coherent gate-green unit, e.g.:
   C3 workspaceStore scaffold (createLocalStorageStore, per-user, no fetch) ·
   C4 workspaceApi.ts HTTP client + `Docs/backend-workspace-routes.ts` contract doc ·
   C5 Workspace.tsx widget shell + register in widgetRegistry.ts + hierarchy.ts Filing Cabinet ·
   C6 Domaine index view · C7 Project view · C8 Thread view · C9 Scribe integration ·
   C10 FileExplorer project-scoping · C11 a11y + loading/empty/error states + polish ·
   C12 closure doc + final gate.
   NUMBER them explicitly so later iterations can find "the next undone cycle".

Commit (docs-only, no full gate needed):
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec"
git add Scripts/autorun/WORKSPACE_PORTING_PLAN.md Scripts/autorun/DECISIONS.md Scripts/autorun/PROGRESS.md
git commit -m "docs(workspace): Cycle 2 — discovery + porting plan + cycle sequence"
```
Then END THE TURN (wrapper re-invokes you for Cycle 3).

───────────────────────────────────────────────────────────────────────────────
### CYCLE 3+ (the actual port) — if the plan exists
───────────────────────────────────────────────────────────────────────────────
- Pick the lowest-numbered cycle in the plan's sequence not yet marked done in PROGRESS.md.
- Implement EXACTLY that one cycle's scope — small, coherent, self-contained. Follow the
  Dwellium patterns (createLocalStorageStore for state; fetch + getAuthHeaders for data;
  lazyWithReload + registry/hierarchy registration for the widget). Reuse, don't reinvent.
- Where the cycle needs backend data that only the sibling repo can serve, build the client
  + contract doc + a graceful empty/loading/error state; do NOT block on the backend.
- STELLA IS PROTECTED if you ever touch shared widget code — do not modify Stella.
- Run the FULL strict gate (with SMOKE_TEST_PORT=3458). Get 6/6 green.
- If green: commit with a clear `feat(workspace): Cycle N — <what>` message (explicit paths,
  never `git add -A` blindly — avoid staging build artifacts). Mark the cycle done in
  PROGRESS.md. END THE TURN.
- If you cannot get green after a reasonable effort: revert your cycle's changes so the tree
  is green again, log the blocker in PROGRESS.md, and (only if the SAME cycle has failed 3
  iterations) `touch Scripts/autorun/STOP`.

═══════════════════════════════════════════════════════════════════════════════
## END-OF-ARC
═══════════════════════════════════════════════════════════════════════════════
When all planned cycles incl. closure are done + gate green: append a final summary to
PROGRESS.md (every commit SHA, gate status, open items for Ilya, and the push commands
`git push origin main` then `git push -u origin feat/workspace-widget`) and
`touch Scripts/autorun/ALL_DONE`. Do NOT push. Do NOT start anything beyond the arc.

LOOP CONTRACT: one bounded cycle, verified green, committed, logged — then end the turn.
