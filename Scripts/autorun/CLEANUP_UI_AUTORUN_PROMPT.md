# Test + Clean-up + Dashboard UI arc — CONTINUOUS AUTONOMOUS driver

You run UNATTENDED for ~2 hours. Ilya is NOT at the keyboard and will NOT answer.
**Never ask questions. Never stop for review.** This prompt is re-fed every iteration —
re-orient from the repo, do ONE bounded cycle, leave the tree committed + green, end turn.

## THE ONE RULE THAT MATTERS HERE
**"Compiles" and "tests pass" do NOT mean a feature works.** Past work shipped code that
built green but did nothing at runtime (ThoughtWeaver didn't send, connections didn't fire).
This arc exists to FIX THAT. Every cycle you must **actually run the app and drive the
feature in a real browser** and confirm it FUNCTIONS — not just that it renders. If it
doesn't function, FIX it. If you can't fix it this cycle, write it to
`Scripts/autorun/BROKEN_LEDGER.md` honestly. Do NOT claim anything works without a runtime
check pasted as proof.

Global rules (Ilya's CLAUDE.md): 🧪 in every response; ETA before each step; **paste runtime
proof BEFORE any "works/fixed/done" claim**; NO `git push` ever (commit only); never undo
Ilya's manual commits; never delete `Scripts/autorun/HALT`.

═══════════════════════════════════════════════════════════════════════════════
## GOAL
═══════════════════════════════════════════════════════════════════════════════
1. **Test every feature at runtime and fix what's broken.** Go feature by feature: Honcho,
   Scribe ingestion, ThoughtWeaver (capture→categorize→report→to-do→insights), Stella
   (tools + /hermes spawn), Hermes learning, the Astra/PM-exec dashboard, Workspace,
   statute matching. For EACH: run it live, exercise the core action, confirm it works or
   FIX it.
2. **Make the dashboard UI unbelievably responsive, simple, and intuitive.** Tighten the
   Astra/PM-exec dashboard: clean layout, fast interactions, obvious affordances, no dead
   buttons, consistent loading/empty/error states, keyboard + a11y, no console errors.

═══════════════════════════════════════════════════════════════════════════════
## AUTONOMY RULES
═══════════════════════════════════════════════════════════════════════════════
1. NO QUESTIONS, NO REVIEW STOPS. Chain Cycle 1 → 2 → … continuously.
2. DECIDE + LOG every fork to `Scripts/autorun/CLEANUP_DECISIONS.md`.
3. ONE CYCLE PER ITERATION. Finish it, verify at runtime, gate, commit, end turn.
4. ALWAYS LEAVE IT GREEN + COMMITTED. Can't get green → revert your cycle's changes, log
   why, move on. Never leave the tree broken.
5. HALT ONLY ON A TRUE BLOCKER (`touch Scripts/autorun/STOP`) — same failure 3 iterations
   running, or destructive action needed. `touch Scripts/autorun/ALL_DONE` only when every
   feature is runtime-verified working (or logged BROKEN with a reason) AND the dashboard
   UI pass is done.
6. LOG EVERY ITERATION to `Scripts/autorun/CLEANUP_PROGRESS.md` (what you tested, what you
   found, what you fixed, the runtime proof, what's next).

## KNOWN TRAPS — handle automatically
- **Port 3000 = the app/backend.** Use `SMOKE_TEST_PORT=3458` for the smoke step. If a real
  backend is running on 3000, the headless UI test below talks to it (better — real data).
  If not, stub auth so you can still drive the UI (see RUNTIME TEST HARNESS).
- **cwd does NOT persist between commands.** `cd` to the absolute repo path each command.
- **`Scripts/autorun/HALT`** — leave untracked; this driver proceeds regardless (Ilya
  launched it intentionally).
- **Branch:** work on the CURRENT branch (`feat/scribe-ingestion-honcho` — it has all the
  feature code merged). Do NOT create a new branch.

## RUNTIME TEST HARNESS (this is how you PROVE a feature works)
Build once, then drive the real UI headless. Create `Scripts/autorun/_drive.mjs` if missing
(pattern below), and use it each cycle to open a widget, perform its core action, and assert
the result + screenshot to `Scripts/autorun/cleanup-shots/`.
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell"
npx react-router build   # rebuild after each change
# serve + drive in ONE shell (background server dies when the shell exits):
( npx react-router-serve build/server/index.js > /tmp/serve.log 2>&1 & SRV=$!; \
  for i in $(seq 1 15); do curl -sf -o /dev/null http://localhost:3000/ && break; sleep 1; done; \
  node ../Scripts/autorun/_drive.mjs <widget> <action> ../Scripts/autorun/cleanup-shots/<file>.png; \
  kill $SRV )
```
The driver logs in (splash → Andy → passphrase `Comet2878!` → Unlock; stub `/api/auth/me`
+ `/api/auth/login` to return Andy/god if no backend), expands the sidebar groups, opens
the target widget by its sidebar label (labels carry a leading glyph — match by
`textContent` stripped of leading non-letters, or click by resolved coordinate), performs
the action (type a capture, click Generate, click a tab, etc.), then asserts the expected
DOM/text appeared and screenshots. **A cycle is "done" only when the assert passes and the
screenshot shows the feature actually did the thing.**

## STRICT GATE (after code changes, before commit)
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell" && npx tsc -b && npx vitest run && npx react-router build && cd .. && SMOKE_TEST_PORT=3458 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```
Green + runtime-proof = commit. Red you caused = fix or revert.

═══════════════════════════════════════════════════════════════════════════════
## EVERY ITERATION
═══════════════════════════════════════════════════════════════════════════════
a. `cd` repo, confirm branch `feat/scribe-ingestion-honcho`, `git status` (clean except
   untracked autorun files).
b. Read the last ~10 lines of `Scripts/autorun/CLEANUP_PROGRESS.md`.
c. Pick the next item from the CYCLE LIST not yet marked done. Do exactly that one:
   run it live → find the break → fix it → re-run live to prove the fix → gate → commit →
   mark done with the runtime proof. End turn.
d. When every feature is verified-or-BROKEN-logged AND the dashboard UI pass is complete:
   write `Scripts/autorun/CLEANUP_CLOSURE.md` (per-feature working/broken table + before/
   after dashboard notes + screenshots) and `touch Scripts/autorun/ALL_DONE`.

## CYCLE LIST (in order; each ends with runtime proof + commit)
1. **Harness + feature audit.** Build `_drive.mjs`. Run each feature once, record in
   `Scripts/autorun/FEATURE_STATUS.md`: works ✅ / renders-but-dead ⚠️ / broken ❌, with a
   one-line runtime observation each. (This is the honest baseline — no fixing yet.)
2. **ThoughtWeaver: make capture→categorize actually fire.** Type a thought, hit capture,
   confirm it is stored AND categorized (the `insights.ts` categorize path runs, or the
   `/api/thought-weaver` call fires). Fix the wiring if it doesn't. Runtime proof.
3. **ThoughtWeaver: Reports + Insights generate.** Click "Generate now" (or open Reports/
   Insights), confirm a daily report + to-do seeds + insights actually render from captures.
   Fix if dead. Runtime proof.
4. **Honcho: Add Memory + Files arrange/filter work.** Add a memory, confirm it persists +
   shows; switch the Files view sort/filter and confirm it reorders. Fix if dead.
5. **Stella: tool catalog search + /hermes spawn.** Search the Skills/tools catalog, confirm
   it filters; type `/hermes <task>`, confirm it dispatches a run (or shows the offline
   state correctly). Fix if dead.
6. **Hermes learning: rating + record.** Confirm a run records to `hermesLearningStore` and
   the 👍/👎 rating persists. Fix if dead.
7. **Scribe ingestion: pickers + convert.** Confirm the source/backup pickers open and
   "Convert now" runs the convert path (or shows the right state without a backend). Fix.
8. **Statute matching:** confirm matched statutes render with similarity/excerpt. Fix.
9. **Workspace:** confirm Domaine→Project→Thread drill-down navigates. Fix.
10. **DASHBOARD UI PASS 1 — layout + responsiveness.** Make the Astra/PM-exec dashboard
    clean and fast: consistent spacing/typography, responsive grid that doesn't break at
    narrow widths, no dead buttons, smooth panel add/remove/rearrange. Runtime proof
    (screenshot at 1440px AND ~900px).
11. **DASHBOARD UI PASS 2 — states + a11y + intuitiveness.** Consistent loading/empty/error
    states across panels, obvious affordances/labels, keyboard nav, zero console errors.
    Runtime proof.
12. **CLOSURE.** `CLEANUP_CLOSURE.md` + fresh gate + `ALL_DONE`.

Split any cycle that's too big: do a coherent chunk, prove it, commit, DON'T mark done.
**Reuse existing code. Fix real wiring. Never fake a runtime check.**

═══════════════════════════════════════════════════════════════════════════════
## END
═══════════════════════════════════════════════════════════════════════════════
When all cycles done: append final summary to CLEANUP_PROGRESS.md with the push command
(`git push -u origin feat/scribe-ingestion-honcho`) and `touch Scripts/autorun/ALL_DONE`.
Do NOT push.

LOOP CONTRACT: one bounded cycle, RUNTIME-verified, committed, logged — then end the turn.
