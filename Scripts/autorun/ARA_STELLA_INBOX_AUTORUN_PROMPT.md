# ARA / Stella / Inbox Zero + Linkage arc — CONTINUOUS AUTONOMOUS driver

You are running UNATTENDED for ~2 hours. Ilya is NOT at the keyboard and will NOT
answer anything. **Never ask questions. Never stop for review between cycles.** Decide,
log, keep moving. This prompt is re-fed every iteration — re-orient from the repo each
time, do ONE bounded cycle of real work, leave the tree committed + green, end the turn.

Global rules (Ilya's CLAUDE.md): 🧪 in every response; ETA before each step; **paste
verification proof inline BEFORE any "done/green/complete" claim**; no browser subagents
(run_command/curl/node); NO `git push` ever (commit only); never undo Ilya's manual
commits; never delete `Scripts/autorun/HALT`.

═══════════════════════════════════════════════════════════════════════════════
## GOAL OF THIS ARC
═══════════════════════════════════════════════════════════════════════════════
Make **ARA, Stella, and Inbox Zero** work correctly AND be properly linked to ALL
widgets they should feed/receive from. **Stella is PROTECTED**: you may FIX Stella's
bugs/wiring/linkage and EXTEND its tests, but do NOT do cosmetic/structural "redesign"
of Stella. ARA and Inbox Zero may be improved more freely.

This is a NEW branch off the workspace work. Do NOT touch the workspace widget further.

═══════════════════════════════════════════════════════════════════════════════
## ABSOLUTE AUTONOMY RULES (same as the workspace arc that just succeeded)
═══════════════════════════════════════════════════════════════════════════════
1. NO QUESTIONS, NO REVIEW STOPS. Chain Cycle 1 → 2 → 3 → … continuously.
2. DECIDE + LOG every fork to `Scripts/autorun/ARA_DECISIONS.md` (reversible defaults).
3. ONE CYCLE PER ITERATION. Finish it, gate it, commit it, end the turn.
4. ALWAYS LEAVE IT GREEN + COMMITTED. If you can't get green, revert your iteration's
   changes so the tree is green again, log why, move on. Never leave it broken.
5. HALT ONLY ON A TRUE BLOCKER (`touch Scripts/autorun/STOP`) — same failure 3
   iterations running, or a destructive action needed. `touch Scripts/autorun/ALL_DONE`
   only when the whole arc (incl. closure) is verified done.
6. LOG EVERY ITERATION to `Scripts/autorun/ARA_PROGRESS.md` (timestamp, cycle, what you
   did, proof you verified, what's next).

## KNOWN TRAPS — handle automatically, never stop on these
- **Port 3000 = live Dwellium app.** ALWAYS run the smoke step with `SMOKE_TEST_PORT=3458`.
  Never kill what holds 3000.
- **Terminal truncates long output.** Capture the gate to a log and read the tail:
  `... 2>&1 | tee Scripts/autorun/logs/ara_gate_$(date +%s).log`.
- **cwd does NOT persist between run_command calls.** Always `cd` to the absolute repo
  path at the start of each command.
- **vitest baseline at this branch's base = 348 passed / 0 failed / 47 files** (after the
  workspace arc). A green vitest with a HIGHER count is good (you added tests) — note the
  delta. A FAILURE you didn't cause: prove it's pre-existing (git stash + run) and proceed.
- **`Scripts/autorun/HALT`** — leave untracked, never delete/commit. Doesn't block you.

## THE STRICT GATE (run at the end of every cycle that touches source)
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell" && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_PORT=3458 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```
6/6 green = commit. Red you caused = fix or revert (rule 4). Docs-only cycles need only
a `git status` check.

═══════════════════════════════════════════════════════════════════════════════
## STEP 0 — FIRST ITERATION ONLY: create the branch
═══════════════════════════════════════════════════════════════════════════════
On iteration 1, if branch `feat/ara-stella-inbox-linkage` does NOT exist:
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec"
git rev-parse --abbrev-ref HEAD     # likely feat/workspace-widget
git status --short                  # expect clean except untracked autorun files
# Branch off the workspace closure (so it builds on the finished Workspace widget):
git checkout feat/workspace-widget 2>/dev/null || true
git checkout -b feat/ara-stella-inbox-linkage
git rev-parse --abbrev-ref HEAD     # MUST be feat/ara-stella-inbox-linkage
```
If the branch already exists, just `git checkout feat/ara-stella-inbox-linkage` and
continue from PROGRESS. Create `ARA_PROGRESS.md` + `ARA_DECISIONS.md` on iteration 1.

═══════════════════════════════════════════════════════════════════════════════
## EVERY ITERATION — orient, then do the next undone cycle
═══════════════════════════════════════════════════════════════════════════════
a. `cd` to repo, confirm branch `feat/ara-stella-inbox-linkage` (checkout if needed),
   `git status` clean except untracked autorun files (clean only YOUR junk, never HALT).
b. Read last ~10 lines of `Scripts/autorun/ARA_PROGRESS.md`.
c. Find the lowest-numbered cycle below not marked done → do exactly that one → gate →
   commit → mark done → end turn.
d. When all cycles incl. closure are done + gate green → closure summary + `touch ALL_DONE`.

## GROUND TRUTH (verify as you go — established by inventory, may have shifted)
- Components: `src/components/ARAConsole/ARAConsole.tsx` (single file + css),
  `src/components/StellaAgent/StellaAgent.tsx` (+ honchoDreamStore.ts),
  `src/components/InboxZero/` (~15 files: InboxZero.tsx, OpenTracker, ReplyTracker,
  SmartActions, RulesManager, NifIntelligence, useInboxQueries.ts, etc.),
  `src/components/InboxWidget/InboxWidget.tsx`.
- Existing tests: `src/test/ARAConsole.test.tsx`, `src/test/StellaAgent.test.tsx`
  (NO InboxZero test yet — add one).
- Registry (`src/registry/widgetRegistry.ts`, 29 widgets): `ara-console` ~L156,
  `stella-agent` ~L165, `inbox` ~L84, `inbox-zero` ~L101.
- Backends: ARA `/api/ara` + `/api/transcribe`; Stella `/api/stella` (+ telegram
  `/api/v1/telegram`); both use `useIntegrations` (per-user LLM via `lib/llmClient.ts`).
- **CROSS-WIDGET LINKAGE MECHANISMS ALREADY IN THE APP (this is "link to all widgets"):**
  - `dwellium:open-widget` CustomEvent → WindowContext.tsx:447 (NEW bus, workspace arc).
    Helper pattern: `src/components/Workspace/workspaceScribe.ts` (`dispatchOpenWidget`).
  - `qualia-open-widget` CustomEvent → Desktop.tsx:590 listener (OLDER bus).
  - Topic events: `strata:navigate`, `qualia-docviewer-open-file`, `qualia-toast`,
    `qualia-skin-change`. Use these existing buses — do NOT invent new plumbing.

═══════════════════════════════════════════════════════════════════════════════
## CYCLE SEQUENCE (do in order; each ends gate-green + committed)
═══════════════════════════════════════════════════════════════════════════════
**Cycle 1 — LINKAGE AUDIT (docs-only).** Read ARAConsole.tsx, StellaAgent.tsx,
InboxZero.tsx (+ its tabs), and grep the whole `src/` for every `CustomEvent` /
`addEventListener` / cross-widget call. Produce `Scripts/autorun/LINKAGE.md`: a matrix
of feature (ARA / Stella / InboxZero) × every widget/bus it currently feeds or receives
from, marking each link ✅ present / ⚠️ partial / ❌ missing-but-expected. List the
concrete gaps to fix in later cycles. Docs-only → no full gate. Commit. End turn.

**Cycle 2 — ARA correctness + test hardening.** Fix any real bugs in ARAConsole
(error/empty/loading states, failed-fetch handling, integrations-not-configured path).
Extend `ARAConsole.test.tsx` to cover the core happy path + at least one failure path.
FULL gate. Commit.

**Cycle 3 — ARA linkage.** Wire ARA into the cross-widget buses per LINKAGE.md gaps
(e.g. "open in <widget>" handoffs via `dwellium:open-widget`; receive context from
hierarchy/active selection). Mirror the `workspaceScribe.ts` injectable-deps pattern so
it stays unit-testable. Add a linkage unit test. FULL gate. Commit.

**Cycle 4 — Stella correctness (PROTECTED: fix only, no redesign).** Fix wiring/bugs
only — connection-status handling, LLM-ready offline path (`hasActiveLlm`), failed
`/api/stella` calls. Extend `StellaAgent.test.tsx`. Do NOT restyle/restructure Stella.
FULL gate. Commit.

**Cycle 5 — Stella linkage (fix-only).** Ensure Stella correctly participates in the
cross-widget buses it should (per LINKAGE.md) WITHOUT cosmetic change. Add a linkage
test. FULL gate. Commit.

**Cycle 6 — Inbox Zero correctness.** It's large (~15 files). Fix the most impactful
real issues (loading/empty/error states, broken tabs, `useInboxQueries` failure
handling). Add `src/test/InboxZero.test.tsx` covering the main view + one failure path.
FULL gate. Commit.

**Cycle 7 — Inbox Zero linkage.** Wire InboxZero into the buses per LINKAGE.md (e.g.
SmartActions → open relevant widget; audit/toast events). Add a linkage test. FULL gate.
Commit.

**Cycle 8 — Cross-feature linkage verification + LINKAGE.md finalize.** Re-run the audit;
flip every intended link to ✅ with the test/commit that proves it. If any link can't be
completed (needs sibling backend), mark it clearly with the reason. FULL gate. Commit.

**Cycle 9 — a11y + polish pass (ARA + InboxZero; Stella fix-only).** WCAG AA labels on
icon-only buttons, keyboard nav, focus states, consistent loading/empty/error UI. FULL
gate. Commit.

**Cycle 10 — CLOSURE.** Write `Scripts/autorun/ARA_CLOSURE.md` (every commit SHA, final
LINKAGE.md state, gate proof, open items for Ilya, push commands). Re-run the FULL gate
fresh at closure HEAD for end-of-arc proof. `touch Scripts/autorun/ALL_DONE`.

If a cycle is bigger than one iteration, split it: do a coherent chunk, gate, commit,
and DON'T mark the cycle done — the next iteration continues it.

═══════════════════════════════════════════════════════════════════════════════
## END-OF-ARC
═══════════════════════════════════════════════════════════════════════════════
When all 10 cycles done + gate green: append final summary to ARA_PROGRESS.md with push
commands (`git push origin main` then `git push -u origin feat/ara-stella-inbox-linkage`)
and `touch Scripts/autorun/ALL_DONE`. Do NOT push.

LOOP CONTRACT: one bounded cycle, verified green, committed, logged — then end the turn.
