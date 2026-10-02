# 079 — Task Board widget: capability report, audit, improvement plan

Status: phases 1–5 DONE 2026-10-01 — five stacked local branches feat/079-task-board-p1 … -p5 (unpushed). Each phase: contract → coders by file → tests from the contract (fail-before proven) → orchestrator read + mutation checks → full gate → adversarial review → fixes → full gate; phases 4–5 also proven in a real browser (harness ~/dwellium-harness/079-task-board: 17/17 + 10/10). Known limits: solarized contrast (app-wide tokens, PR #135); whole-board last-writer-wins across devices (D2); a deliberately emptied board can be resurrected by a stale device. Base: `origin/main` @ `fe281de`
(local `main` was level with it). Backend read at `origin/main` via `git show` (its working tree is on another branch).
Swarm: ruflo `swarm-1790844744917-lsf0h7` (hierarchical). ruflo only *registered* the agents
(`tb-m1-model`, `tb-m2-persistence`, `tb-m3-ui`, `tb-m4-integration`, `tb-r1-refuter`); the work ran as
Claude Code subagents: 4 mappers by file ownership + 1 refute-first reviewer (16 claims: 14 confirmed,
2 partly corrected, 5 new findings). The orchestrator re-read the cited code, re-ran the card-loss and
undo reproductions on the real model, recomputed the contrast ratios, and checked the backend routes.

Paths are under `qualia-shell/src/` unless they start with `backend:` (= `ai-dashboard369-file-manager/src/`).
TB = `components/TaskBoard/TaskBoard.tsx`, model = `taskBoardModel.ts`, store = `taskBoardStore.ts` (same folder).

## 1. What the Task Board is today

Files: `TaskBoard.tsx` (1,310 lines) + `TaskBoard.css` (666), `taskBoardModel.ts` (490, pure),
`taskBoardStore.ts` (269), `taskRouting.ts` (61), three test files (429 lines).
Registry `registry/widgetRegistry.ts:310-320` (category `core`, 680×460 min). Pinned in the dock
(`data/hierarchy.ts:24`), in the staff startup stack (`Shell/defaultStack.ts:47,63,68`) and the "Manage"
space (`lib/spacesStore.ts:29`). Also mounted as the **Board tab of Task Menu** (`TaskMenu/TaskMenu.tsx:11,415-418`).
Created 2026-06-02 (`cc73bea`); every commit since is cosmetic or view-state; last touch 2026-08-31 (`1cde809`).

| Capability | How it works | Evidence |
|---|---|---|
| Cards | Add inline per column (Enter/Esc), edit title + description in a card dialog (saved on blur), urgency low/medium/high, delete (×) | TB:637-657, 830, 852, 355, 584 |
| Columns | 5 defaults; add, rename (double-click or Settings), delete (takes its cards), mouse resize 200–640 px. No reorder | TB:672, 482, 981, 525, 266-289; model:125 |
| Move | HTML5 drag between columns; dragging a selected card moves the whole selection; checkbox + "Move to…" for bulk | TB:557, 302-346, 412, 562 |
| WIP limits + exit policies | Per-column min/max with badge and a warning modal; exit-criteria checklist modal. Checked on user moves only | TB:166-257, 509, 710, 957-1013 |
| Undo + audit | Every change goes through one function and is logged with its inverse; Undo last; Activity drawer; "Undo last AI"; copy AI report | model:412-474, 480; TB:438, 676-698 |
| "AI: file Backlog" | A fixed local rule (not an LLM): moves every Backlog card to To Do, tagged as agent "ara" | store:173-185; TB:427 |
| Assign + send | Assignee = ARA, Stella, Lisa or custom. AI → POST to the agent's chat route; person → opens a Gmail draft (never auto-sent) | TB:751, 610-622; store:227-257; taskRouting.ts:14-61 |
| Sub-tasks | "Next steps" child cards under a card | TB:877; store:196-202 |
| Attachments | Drag-and-drop only; ≤256 KB stored inline as base64, larger keep name + size only | TB:914-932; store:188 |
| Tags | Tag a card; see related tagged items; "Add as card" | TB:855-875 |
| Per-card timeline | The card's audit entries | TB:937; model:428 |
| Metrics drawer | WIP, throughput bar chart, item age, lead/cycle scatter (recharts) | TB:1049-1290 |
| Project boards | Picker: Global or one board per hierarchy project | TB:379-386; store:32-39 |
| Backup | Save / Load the board as JSON | TB:111-141 |
| Remembers view | Active project and open card reopen where you left them | TB:62-67, 103 |
| Persistence | Per-user, per-project localStorage `taskboard:<uid>[:<projectId>]`; One Save sync (objectType `task-board`), live in production (`netlify.toml:28`) | store:32-39, 62-69 |
| Readers elsewhere | ARA daily glance ("N tasks not done — M high urgency"); backend Knowledge Graph export | lib/araDailyGlance.ts:85-88; backend:services/knowledgeGraphService.ts:28 |

**Not there today:** search or filter, due dates, ordering cards inside a column from the UI, column reorder,
swimlanes, column collapse, coloured labels, comments, archive, redo, keyboard shortcuts, touch drag,
opening or downloading an attachment, any way for an assistant to read or change cards, any way to create a
card from another widget (Inbox Zero, Strata work orders, Notepad, ThoughtWeaver, Task Menu).

## 2. Findings

How each was checked: **run** = reproduced on the real model with node; **read** = code path read by the
orchestrator and the reviewer; **calc** = computed from theme tokens, not rendered.

### High

| id | finding | evidence | check |
|---|---|---|---|
| H1 | **Cards can be deleted for good through normal buttons.** Click "AI: file Backlog", delete the now-empty Backlog column, click "Undo last AI": the cards go back to a column that no longer exists (stored, invisible). Click Undo once more: the column comes back and the cards are removed permanently; nothing left in the log can restore them. Cause: `RESTORE_POSITIONS` never checks the column exists; `RESTORE_COLUMN` filters out every card with that column id. | model:245-255, 293-298; TB:427, 525, 684 | run (2 cards → 0 stored) |
| H2 | **All of a user's boards share one server object.** Local keys are per project, the One Save id is `task-board_<uid>`. The server keeps only the board written last; on the next page load it replaces whichever board is on screen. Simplest case: edit Global, add a card on project P, switch back to Global, wait a second, reload → Global now shows P's cards and Global's own cards are gone locally and on the server. | lib/oneSaveStore.ts:359, 479; store:32-39, 62-69 | read + reviewer simulation; not run on two real page loads |
| H3 | **"Send to ARA" can never work.** The request has no `mode`; the backend answers 400. The board then says "unavailable … queued, not sent", but no queue or retry exists. ARA is the first assignee offered. | store:235-246; backend:routes/araRoutes.ts:52-59 | read (both sides) |
| H4 | **The dialogs are not dialogs.** WIP modal, exit-criteria modal and the card dialog have no `role="dialog"`, no focus move or trap, no Escape, no focus return; there is no live region anywhere, so moves, undo and send results are never announced. | TB:710, 826, 1019 (grep: no `role="dialog"`, `aria-live`, `<dialog`) | read |

### Medium

| id | finding | evidence | check |
|---|---|---|---|
| M1 | "Undo last AI" silently throws away the user's later move of the same card (it restores the old position unconditionally and logs "Reverted"). | model:245-255, 455-469 | run |
| M2 | The board can stop syncing and block other stores. The audit log is never capped and keeps full undo payloads (a removed attachment's base64, a removed column's cards, the whole previous board after Load). Three 256 KB attachments ≈ 1 MB of JSON = the backend body limit. A rejected batch is retried 3 times, then every store in that batch is marked failed and the app goes "offline". Deleting an attachment does not shrink the board. | model:424, 290, 352, 362; store:188; backend:app.ts:347; lib/oneSaveStore.ts flush path | read; prod `EXPRESS_JSON_LIMIT` unknown |
| M3 | "Send to Stella" logs "Sent" on any 200, including the canned "no server LLM key" reply; the reply is discarded either way. | store:240-243; backend:routes/stellaRoutes.ts:149-158 | read |
| M4 | Task Menu's "Board" tab shows a different list from its "List" tab (local cards vs `/api/tasks` rows). Nothing moves a task between them. `USER_GUIDE.md:113` describes them as one thing in two views. | TaskMenu/TaskMenu.tsx:106, 415-418 | read |
| M5 | Two devices: whole-board last-writer-wins (no `merge`), including the undo history. Hydrate runs only at page load / login. | store:62-69; lib/oneSaveStore.ts:457-479 | read |
| M6 | No keyboard or touch path to several things: attachments are drop-only (no file input), column resize is mouse-only, column rename by double-click only (Settings is the keyboard path), the card × is invisible until hover. Moving a card by keyboard needs checkbox → toolbar → "Move to…". | TB:916-921, 661-667, 482, 562, 412; TaskBoard.css:119-120 | read |
| M7 | Delete column removes its cards with no confirm (Undo does restore them). Load Board replaces the board with no confirm and only checks that `columns` and `cards` are arrays. | TB:525, 124-141; model:281-292 | read |
| M8 | WIP limits and exit policies are skipped by add card, add sub-task, "Add as card", the AI button and undo. Sub-tasks count as ordinary cards in WIP and metrics. | TB:166-190, 349, 427, 870, 445 | read |
| M9 | Switching project keeps open UI state. Column Settings seeds its fields once; default column ids are the same on every board, so Save after a switch writes board A's name, limits and policies onto board B. A stale remembered project id shows "Global Board" in the picker while the store reads the stale project's key. | TB:383, 958-961, 82-83 | read; not run in a browser |
| M10 | Async writes land on whichever board is current: the send result and file attachments are written after an `await`. The unmerged guard in `ca9a4fe` (PR #138) covers an account switch, not a project switch. | store:227-250; TB:806-821 | read |
| M11 | Lead/cycle time parses log text for "→ To Do / In Progress / Review / Done". Wrong for renamed columns (cycle 0), for titles containing that text, and for cards moved in bulk (bulk moves carry no card id, so they are also missing from the card timeline). "Avg per week" is total ÷ 4 regardless of board age. | TB:1088, 1116-1131; model:396-409 | run (reviewer) + read |
| M12 | Contrast, latte theme: secondary text on a card 2.52:1; text on the red "over WIP" column 1.31:1 (hard-coded `#1c0e10 !important` under dark-theme text colours in a light theme); white on the red badge 3.76:1; the yellow urgency colour on a card 1.04:1. | TaskBoard.css:105, 296-303, 316-324; TB:44; styles/themes-master.css:348-370 | calc; PR #135 (plan 064) may change the tokens |
| M13 | At the 680 px minimum the toolbar has no wrap and the drawers are fixed at 320 px and 540 px, so Undo/Activity are likely pushed off-screen. | TaskBoard.css:15-22, 150, 483 | read; needs a real render |

### Low (fix in passing)

- The log records things that did not happen: a no-op still adds an entry; "Moved N cards" counts requested ids. (model:412-425, 377 — run)
- `EDIT_CARD` spreads any patch keys (could change `id`/`columnId`); undo restores only five fields. Reachable only through `aiApply` today. (model:256-273)
- A stored board with one malformed column resets ALL columns to defaults (cards in custom columns vanish); cards missing a timestamp are dropped. Remote payloads skip validation entirely. (store:50-58; lib/oneSaveStore.ts:479)
- localStorage quota errors are swallowed. (store:81-85)
- Undo of a first urgency edit is a no-op after a reload, yet logs "Reverted". (model:265)
- `aiEndpoint` sends any unknown AI assignee to ARA. Card text goes into the prompt unfenced and uncapped. Very long descriptions make an over-long Gmail URL. Built-in "Lisa" has an empty email. (taskRouting.ts:17, 30-32, 39-61)
- Daily glance counts whichever board was viewed last (Global on a cold load), not all boards. (lib/araDailyGlance.ts:116)
- Knowledge Graph export gets only the last-written board, no column/urgency/assignee on card documents, and audit text including drafted-email addresses. (backend:services/knowledgeGraphService.ts:98-114)
- Dead links: Connections "Tags" row opens the Task Board instead of Tag File (Connections/ConnectionsPanel.tsx:45); Tag File rows are not clickable; the command palette's task focus does nothing when Task Menu was left on its Board tab (TaskMenu/TaskMenu.tsx:121-134).
- Dead code: `didDrag` ref, unrendered `throughput.avg`, AI-vs-user CSS rules that repeat the base colour. Attachment bytes are stored but can never be opened.
- `store:107` sorts the live snapshot's columns in place.
- Tests: 3 files; none applies a bulk-move inverse, interleaves user and AI undo, or covers remove/restore of cards or columns.

Corrected by review: H2 overwrites the board on screen at hydrate (not always Global). The KG export drops
the newest audit entries first, not cards. Already fixed elsewhere: the account-switch guard on `routeCard`
(`ca9a4fe`, unmerged, PR #138) — do not redo it.

## 3. Plan (data safety first; each phase = one PR, in its own worktree off `origin/main`)

### Phase 1 — stop losing cards (pure model + store, ~2 h)
Owner files: `taskBoardModel.ts`, `taskBoardStore.ts` (deserialize only), `test/taskBoard*.test.ts`.
1. `RESTORE_POSITIONS`, `RESTORE_CARD`, `MOVE_CARD`, `MOVE_CARDS`: if the target column does not exist, use the first column. (H1)
2. `RESTORE_COLUMN`: keep cards that currently sit in that column id; add back only snapshot cards that are missing. (H1)
3. `undo`: skip a position whose card has moved since (current column ≠ the column the action put it in) and return `changed: false` when nothing moved; no "Reverted" entry for a no-op. (M1)
4. `applyAction`: return `state` unchanged when the reducer returned the same data — no audit entry. Dedupe `cardIds`; count moved cards. (Low)
5. `EDIT_CARD`: pick only the five `CardPatch` keys; trim title, keep it non-empty. (Low)
6. Audit entries gain `cardIds?: string[]` and `to?: columnId` for moves. (feeds M11 in phase 4)
7. `deserialize`: repair a bad column (default width) instead of resetting all; never drop a card for a missing timestamp (stamp it); cards in unknown columns go to the first column. (Low)
8. One-liners in other files: Connections "Tags" → `tag-file`; Task Menu focus listener calls `setView('list')` first (not `chooseView`, which would also overwrite the saved tab preference).
Tests first, each run against the old code to prove it fails there: the H1 sequence (stored = visible = 2 at every step), M1, no-op audit, bulk inverse applied, duplicate ids.

### Phase 2 — sync that cannot eat a board (~3 h)
Owner files: `taskBoardStore.ts`, `lib/oneSaveStore.ts` (shared — read 356-515 first), `lib/araDailyGlance.ts`.
1. **Per-board server object** (H2): object id = `task-board_<uid>` for Global, `task-board_<uid>_<projectId>` for a project; hydrate again when the picker changes. Contract to write before coding: what the legacy single object is treated as (it holds an unknown board — never apply it over a non-empty local board; push local boards to their own ids instead), and what happens if the migration half-finishes.
2. **Bound the log** (M2): keep the newest 500 entries; inverses store attachment metadata only (no `dataUrl`); the Load inverse stays (one board) but is dropped when it leaves the 500 window.
3. Validate remote payloads and imported files through the same repair path as phase 1 step 7.
4. Capture the project id with the owner before each `await` in `routeCard` and the attachment reader; drop the write if either changed (builds on `ca9a4fe`). (M10)
5. Surface a failed local save (quota) and a failed sync in the board header using `syncStatusStore`.
6. Daily glance: sum all of the user's boards, or say "Global board" in the line.
Not in this phase (decision D2 below): true two-device merge.

### Phase 3 — honest AI routing (~1 h frontend, no backend change)
1. Send `mode` to ARA (existing caller uses `'chief-of-staff'`, AstraDashboard/AstraWorkspace.tsx:100 — confirm the right mode via `GET /api/ara/modes`). (H3)
2. A non-OK response is logged and shown as "failed (HTTP n)", never "queued". (H3)
3. Read the reply and attach it to the card timeline; treat Stella's canned no-key reply as "not configured", not "Sent". (M3)
4. Unknown AI assignee → no endpoint, clear message. Fence and cap card text in the prompt (2,000 chars); cap the Gmail body.

### Phase 4 — accessibility, layout, theming (~3 h, needs the live harness)
Owner files: `TaskBoard.tsx` (one integrator), `TaskBoard.css` (one agent).
1. The three modals become native `<dialog>` + `showModal()` (focus trap, Escape, focus return for free). (H4)
2. One `role="status"` live region for move / undo / send results. (H4)
3. Per-card "Move to…" native `<select>` (keyboard and touch); `<input type="file" multiple>` beside the drop zone and a download link per stored attachment. (M6)
4. `key={userId + ':' + activeProjectId}` on the board body so open popovers and drafts reset on a switch; fall back to Global when the remembered project no longer exists. (M9)
5. Confirm before deleting a non-empty column and before Load Board; Undo disabled when there is nothing to undo; card × visible on `:focus-within`. (M7)
6. Toolbar wraps; drawers overlay with `max-width: 100%`. (M13)
7. Replace hard-coded colours with theme tokens; WIP states as a tint of the theme surface, not fixed dark hexes. Re-measure all 16 themes in the harness after PR #135 lands. (M12)
8. Metrics read `cardIds`/`to` from the audit (phase 1 step 6) and the Done column by position, not by text. (M11)
9. Delete the dead code listed above.

### Phase 5 — make it more useful (scope is Ilya's call; each item is independent)
| item | smallest version | reuses |
|---|---|---|
| Search / filter | one `<input type="search">` filtering title, description, tags, assignee | — |
| Due dates | `dueAt` on the card, native `<input type="date">`, overdue badge, "due this week" in the daily glance | `araDailyGlance` |
| Order inside a column | drop position → `toOrder` (the model already supports it), renumber siblings | model:204-217 |
| Assistants can use the board | `listCards` / `addCard` / `moveCard` tools in `lib/dwelliumCommands.ts`, all through `aiApply` so every AI change is logged and undoable | store:95; `undoLastAi` |
| Open a card from anywhere | `patchWidgetMemory('task-board', { openCardId })` + open the widget; use it from Tag File rows, the command palette and the daily glance | lib/widgetMemory.ts:108 |
| "Send to board" | one-way from Task Menu rows, Inbox Zero, ThoughtWeaver to-dos (same high/medium/low urgency values) | store `addCard` |
| WIP limits that mean something | warn on add / sub-task / AI moves too; option to exclude sub-tasks | TB:166-190 |

Deliberately not planned: two-way sync between Task Menu and the board, real-time multi-device merge,
virtualized rendering (revisit at several hundred cards), swimlanes, comments.

## 4. Decisions needed from Ilya

- **D1 — one task list or two?** Task Menu's Board tab shows a different list from its List tab (M4). Options: (a) rename the tab "Task Board" and say it is a separate list (5 minutes); (b) add one-way "Send to board" (phase 5); (c) merge the data models (large; not recommended now). Recommendation: (a) now, (b) in phase 5.
- **D2 — two-device edits.** Keep whole-board last-writer-wins after phase 2 (recommended: phase 2 removes the silent cross-board loss, which is the real damage), or build a per-card merge (needs `updatedAt` on cards and tombstones for deletes).
- **D3 — attachments.** Keep small inline files (bounded by phase 2), or move them to the file store so they sync properly and can be large. Recommendation: keep inline for now.
- **D4 — which ARA mode** card hand-offs should use (phase 3).

## 5. Execution (ruflo swarm, house pattern)

Per phase: worktree `.claude/worktrees/079-task-board-pN` off `origin/main` (symlink `qualia-shell/node_modules`,
`git add` explicit paths only) → P0 contract commit (types + signatures, in this plan's section) →
W1 coders by FILE ownership (told to ignore type errors in files they do not own, no git writes) →
orchestrator reads every diff + full gate (`npx vitest run`, `npx tsc --noEmit -p tsconfig.json`, `npx eslint <files>`) →
commit → adversarial reviewer with ≥3 real probes → root-cause fixes → full gate again on the final commit.
Phase 1: model coder + test writer in parallel from the contract (tests written from the contract, run against old code first).
Phase 2: one coder owns `oneSaveStore.ts` (shared by every synced store — run the FULL suite; grep `vi.mock(` for the module).
Phase 4: CSS agent + one `TaskBoard.tsx` integrator, then a theme pass.
Harness: standalone render in `~/dwellium-harness/079-task-board` (durable, not the scratchpad) with a fake One Save
backend, an in-place project and account switch, `@before`/`@after` aliases, axe scoped to the board, a contrast
walker over all 16 themes, and screenshots at 680×460. Read `Docs/code.md` before each fix and add an entry after.
Nothing is pushed, merged or deployed without an explicit go from Ilya.

## 7. Phase 1 contract (P0 — coder and test writer both build from this)

Pure model: `qualia-shell/src/components/TaskBoard/taskBoardModel.ts`. "First column" = the column with the
lowest `order`. "No change" = the reducer returns the SAME data object it was given.

Types (additive only):
```ts
interface AuditEntry { /* existing fields */ cardIds?: string[]; to?: string; }
// cardIds: every card a MOVE_CARD / MOVE_CARDS actually moved (after dedupe and skips); UNDO entries copy the target's cardId/cardIds.
// to:      destination column id of MOVE_CARD / MOVE_CARDS as applied.
type CardPatch = Partial<Pick<TaskCard, 'title' | 'description' | 'assignee' | 'tags'>> & { urgency?: Urgency | null };
// urgency: null in a patch = "unset" (stored card has no urgency key / undefined).
export function repairBoard(raw: unknown): BoardState;   // pure; never throws
export function undo(state, ctx, actor, filter?): { state: BoardState; undone: AuditEntry | null; changed: boolean };
export function undoLastAi(state, ctx, actor):     { state: BoardState; undone: AuditEntry | null; changed: boolean };
export function cardTimeline(state, cardId): AuditEntry[]; // matches e.cardId === id OR e.cardIds includes id
```

Behaviour:
1. **ADD_CARD** to a column id that does not exist → the card goes to the first column (order = next in that column).
2. **MOVE_CARD / MOVE_CARDS** to a column id that does not exist → no change. MOVE_CARDS dedupes `cardIds` and ignores missing ids; no change if nothing moved.
3. **RESTORE_POSITIONS / RESTORE_CARD** whose column no longer exists → the card goes to the first column, `order` = next in that column, `enteredColumnAt = ctx.now()`. RESTORE_POSITIONS whose cards all no longer exist → no change.
4. **RESTORE_COLUMN** re-adds the column and adds back only snapshot cards whose id is not already on the board; cards currently on the board (including ones whose `columnId` is that column) are kept.
5. **REMOVE_COLUMN** of the only remaining column → no change.
6. **EDIT_CARD**: only the keys title / description / urgency / assignee / tags are applied (anything else is ignored). Title is trimmed; an empty title is ignored. `urgency: null` unsets urgency. Keys whose value already equals the card's (`===`, or JSON-equal for arrays/objects) are dropped. Nothing left → no change. The inverse records every changed key's old value, writing `urgency: null` when it was unset and `tags: []` when tags were undefined (so the inverse survives a JSON round-trip).
7. **applyAction**: when the reducer reports no change → return the input `state` object unchanged and add NO audit entry. Exception: LOG_EVENT always adds its entry. MOVE_CARDS summary counts the cards actually moved ("Moved 1 card → To Do"). MOVE_CARD / MOVE_CARDS entries set `to` and `cardIds`.
8. **undo(state, ctx, actor, filter?)** (and `undoLastAi`, same shape):
   - nothing reversible → `{ state, undone: null, changed: false }` (same state object).
   - target inverse is RESTORE_POSITIONS AND the entry has `to` → apply only positions whose card still exists AND whose current `columnId === entry.to` (the card has not been moved since). Entries without `to` (written before this change) apply all positions.
   - The target is ALWAYS marked `reversed: true` (so the next undo moves on), and ONE UNDO entry is appended carrying the target's `cardId` / `cardIds`. Its summary is:
     `Reverted: <summary>` (everything applied) · `Reverted: <summary> (skipped N card(s) moved since)` (partial) · `Nothing to revert: <summary>` (no change).
   - `changed` is true iff the board data changed.
9. **repairBoard(raw)** (store `deserialize` becomes `JSON.parse` → `repairBoard`; parse failure → `createInitialBoard()`):
   - columns: not an array / empty / nothing usable → `defaultColumns()`. Otherwise keep each entry with a string `id` (first wins on duplicate ids); `title` non-string → 'Untitled column'; `width` not a finite number → `DEFAULT_COLUMN_WIDTH`, else clamped to 200–640; `order` not finite → its index. Known optional fields (minWip, maxWip, policies) kept when well-typed.
   - cards: keep each entry with a string `id` (first wins on duplicates); `title` non-string or blank → 'Untitled task'; `description` non-string → ''; `columnId` unknown → first column; `order` not finite → 0; missing/invalid `createdAt` / `enteredColumnAt` → the other one, else the current time (ISO). Optional fields kept when well-typed. A card is NEVER dropped for a bad field.
   - audit: keep entries that are objects with string `id`, `type`, `summary`; drop the rest.
10. Store: `addCard` must not sort the live snapshot in place. Store `undo()` / `undoLastAi()` keep returning `BoardState`.

Outside the model (orchestrator edits): `Connections/ConnectionsPanel.tsx` Tags row → `widget: 'tag-file'`;
`TaskMenu/TaskMenu.tsx` focus listener calls `setView('list')` before focusing (the saved 'board' preference must stay unchanged).

Acceptance: the H1 sequence (2 Backlog cards → AI file Backlog → remove Backlog → Undo last AI → Undo) ends with
2 cards stored AND 2 visible at every step; every new test fails on `origin/main` @ `fe281de` (except pure
regression guards, marked as such); full vitest + `tsc --noEmit` + eslint on touched files green.

## 8. Phase 2 contract (P0 — sync that cannot eat a board)

Owner split: **A** = `qualia-shell/src/lib/oneSaveStore.ts` (shared by ~50 stores) + its new test file.
**B** = `components/TaskBoard/taskBoardModel.ts`, `taskBoardStore.ts`, `TaskBoard.tsx`, `lib/araDailyGlance.ts`.
**T** = new test file `src/test/taskBoard.p2.test.ts` (writes from this contract).
Decision D2 taken: whole-board last-writer-wins stays (no per-card merge).

### A — oneSaveStore.ts (generic; every store NOT passing the new options must behave byte-identically)
```ts
interface SyncOptions<T> {
  /* existing */
  /** Appended to the object id: `${objectType}_${ownerId()}${objectSuffix()}`. Must only yield [A-Za-z0-9_.-]. */
  objectSuffix?: () => string;
  /** Non-merge stores only. Runs on a remote payload AFTER the dirty-marker check and before it is applied.
   *  Return the value to apply, or null to keep local AND schedule a write-through of local. */
  acceptRemote?: (remote: unknown, local: T) => T | null;
}
```
A1. `objectId()` uses the suffix (also what the registry/bootstrap match on).
A2. `hydrate`: capture `objectId()` at start; after the await, if `objectId()` changed → return without applying
    (replaces/extends the owner check — for a store without a suffix this is exactly the owner check).
A3. Failed-write replay re-schedules only while `objectId() === scheduledObjectId` (not just the owner).
A4. "Did hydrate see this object?" (`lastHydrateSeen`) is tracked PER objectId (Map), so `migrate()` for board B
    never trusts a hydrate answer that was about board A.
A5. `acceptRemote` as typed above; absent → current behaviour.

### B — Task Board
B1. **Per-board server object.** `objectSuffix` = '' for the Global board, `__<boardSlug>` for a project board.
    boardSlug = project id with every char outside [A-Za-z0-9_.-] replaced by '_', cut to 60 chars, plus
    `_<hash>` (8 hex, any stable string hash of the ORIGINAL id) whenever the id was changed by that rule.
    Global keeps the legacy id `task-board_<uid>` (no migration for single-board users).
B2. **acceptRemote(remote, local)** for the task board:
    - `r = repairBoard(remote)` (remote payloads are now validated — closes C11).
    - Remote has 0 cards and local has ≥1 → null (keep + push local). `ponytail:` comment: a board emptied on
      purpose on another device is resurrected here; accepted over losing a board.
    - **One-time legacy check, Global board only**: until localStorage flag `taskboard:legacy-checked:<uid>` is set,
      if local has ≥1 card and `r` shares NO card id with local → null (the legacy object holds another board).
      Set the flag after this check whatever the outcome.
    - otherwise → r.
B3. **TaskBoard.tsx**: when the active board changes (project picker, and on mount), call
    `taskBoardStore.hydrate().then(() => taskBoardStore.migrate())` (fire-and-forget, errors swallowed). Do this in
    an effect keyed on user id + active project id.
B4. **Bound the log** (model): `AUDIT_LIMIT = 500` newest entries kept by `applyAction` and `undo`.
    Entries older than the newest `HEAVY_INVERSE_WINDOW = 50` lose a heavy inverse (set `inverse: null`):
    heavy = REPLACE_BOARD, or any inverse whose JSON contains `"dataUrl"`. Light inverses keep working past 50.
B5. **Attachment size guard** (store `attachToCard`): if `JSON.stringify(board).length + dataUrl.length > 700_000`
    store metadata only (drop dataUrl). Return value unchanged (BoardState).
B6. **Board-scoped async guard**: export `captureBoard(): () => boolean` (true while `resolveKey()` is unchanged).
    `routeCard` captures before its fetch; if the board changed when it resolves → no logEvent, return
    `{ status: 'none', detail: 'The board changed while sending; the result was not logged.' }`.
    `TaskBoard.tsx` attachment reader: capture before reading files; skip attaching if the board changed.
B7. **Quota**: `persist()` catches a failed localStorage write; expose `taskBoardSaveError` as a tiny store
    (`subscribe/getSnapshot`, value `string | null`), set to a human message on failure, cleared on the next
    successful write. TaskBoard.tsx shows it in the toolbar with `role="alert"`.
    (Sync failures are already shown app-wide by `Shell/SyncStatusPill.tsx` — no duplicate chip.)
B8. **Daily glance**: count open (non-done-column) and high-urgency cards across ALL of the user's local boards
    (`taskboard:<uid>` and every `taskboard:<uid>:<pid>` key, each through repairBoard), and stop writing
    `taskBoardUserIdHolder` from the glance. Line text unchanged.

Acceptance: H2 reproduction (edit Global → add card on project P → back to Global → reload → hydrate) leaves Global's
own cards and P's cards each on their own board, locally and in the fake server; a stores-wide test proves an
unrelated store (no new options) hydrates/migrates exactly as before; every new test fails on the phase-1 commit;
full vitest + tsc -b + eslint on touched files green.

## 9. Phase 3 contract (P0 — honest AI routing; frontend only)

Decision D4 taken: card hand-offs to ARA use mode **`chief-of-staff`** — backend `agents/araPersonality.ts:178`
("Workflow management and delegating tasks"; the existing task-like caller `AstraDashboard/AstraWorkspace.tsx:100`
uses it too). Both `/api/ara/chat` and `/api/stella/chat` answer `{ success: true, data: { content: string, … } }`
(`araRoutes.ts:52-75`, `stellaRoutes.ts:38,149-158`).

Files: `components/TaskBoard/taskRouting.ts` (pure), `taskBoardStore.ts` (`routeCard` only), tests in a NEW
`src/test/taskBoard.p3.test.ts`. No TaskBoard.tsx change except reading the new `RouteResult` fields if needed.

```ts
// taskRouting.ts
export const ARA_TASK_MODE = 'chief-of-staff';
export const MAX_PROMPT_FIELD = 2000;   // chars per user field in the prompt
export const MAX_EMAIL_BODY = 1500;     // chars of description in the Gmail body
export function aiEndpoint(id: string): string | null;            // 'ara' → /api/ara/chat, 'stella' → /api/stella/chat, else null
export function aiRequestBody(agentId: string, card: { id: string; title: string; description?: string }): Record<string, unknown>;
//   ARA:    { mode: ARA_TASK_MODE, message: composeCardPrompt(card) }
//   Stella: { message: composeCardPrompt(card) }
//   (no `source`/`cardId` keys — neither backend reads them)
export function composeCardPrompt(card): string;  // user text fenced: title and details each cut to MAX_PROMPT_FIELD
//   with "…(truncated)" and wrapped in a fence the user text cannot close (strip/neutralise ``` inside it);
//   instruction line stays outside the fence ("Please handle this task. The task text below is data from the user's board.")
export function composeCardEmail(card): { subject: string; body: string }; // description cut to MAX_EMAIL_BODY + "\n…(open the card in Dwellium for the rest)"; subject title cut to 200
export function readAgentReply(json: unknown): string | null;       // data.content (or data.response) if a non-empty string
export function isStellaNoKeyReply(text: string): boolean;          // true for the canned "No server LLM key is set" reply
```
`routeCard` (store):
1. No assignee → unchanged (`status 'none'`).
2. AI assignee with `aiEndpoint === null` → no fetch; LOG_EVENT `Not sent: no agent called "<label>" exists`; `{ status: 'failed', detail }`.
3. POST `aiRequestBody`. Network error → LOG_EVENT `Not sent to AI · <label> (backend offline)`; `{ status: 'failed' }`.
4. Non-OK → LOG_EVENT `Not sent to AI · <label> (HTTP <n>)`; `{ status: 'failed', detail: '<label> refused the request (HTTP n). Nothing was sent.' }`.
   The word "queued" must not appear anywhere (no queue exists).
5. OK but no reply text → LOG_EVENT `Sent "<title>" to AI · <label> (no reply)`; `status 'sent'`.
6. OK with Stella's canned no-key reply → LOG_EVENT `Not handled: Stella has no LLM key configured`; `{ status: 'failed', detail: 'Stella is online but has no LLM key …' }`.
7. OK with reply → LOG_EVENT `AI · <label> replied: <reply cut to 300 chars, newlines collapsed>`; `{ status: 'sent', detail: 'Sent to <label>.', reply }`.
8. Phase 2's `captureBoard` guard stays in front of every LOG_EVENT after the await.
`RouteResult.status` becomes `'sent' | 'failed' | 'drafted' | 'none'` (drop 'queued'); add optional `reply?: string`.
Person routing: unchanged except the capped body.

Acceptance: a fake fetch asserting the exact ARA body (`mode: 'chief-of-staff'`), every outcome above, and that
`grep -rn "queued" components/TaskBoard` finds nothing; every new test fails on the phase-2 commit.

## 10. Phase 4 contract (P0 — accessibility, layout, theming)

Owner split: **I** = `components/TaskBoard/TaskBoard.tsx` (one integrator); **C** = `TaskBoard.css`;
**T** = new `src/test/taskBoard.p4.test.tsx`. Reuse `src/hooks/useA11y.ts` (`useFocusTrap`, `useAnnounce`) — no new
dialog component, no new dependency (native `<dialog>.showModal` is not implemented in jsdom). `.sr-only` exists in
`styles/global.css`. The 16 selectable themes are `VALID_PICKER_THEMES` in `context/ThemeContext.tsx:148`.

### UI contract (accessible names — the harness, the tests and the integrator all use these exact strings)
| Element | Role / name |
|---|---|
| WIP modal | `role="dialog" aria-modal="true"`, labelled by its heading "WIP Limit Exceeded" |
| Exit-criteria modal | `role="dialog" aria-modal="true"`, labelled by its heading "Column Exit Criteria Enforced" |
| Card view (ProjectView) | `role="dialog" aria-modal="true" aria-label="Card: <title>"` |
| Per-card move | `<select aria-label="Move <title> to">`, first option "Move to…" (disabled), then every OTHER column |
| Attach input | `<input type="file" multiple>` with visible label "Attach files" inside the card view |
| Attachment download | `<a download href=dataUrl>` named "Download <file name>" (only when bytes are stored) |
| Toolbar Undo | button "Undo last action", `disabled` when nothing is reversible |
| Column remove | button "Remove column <title>", `disabled` when it is the only column |
| Resize handle | `role="separator" aria-orientation="vertical" tabIndex=0 aria-valuenow/min/max` (200/640), name "Resize column <title>" |
| Metrics tabs | `role="tablist"` + `role="tab"` with `aria-selected` |
| Each metrics chart | wrapper `role="img"` with an `aria-label` that states the data in words |

### Behaviour
1. **Dialogs**: the three modals get the roles above, `useFocusTrap(true)` on the dialog element (focus moves in, Tab
   cycles, focus returns to the opener on close), and Escape closes them (onKeyDown on the dialog). Backdrop click still closes.
2. **Announcements** (`useAnnounce`, polite): after a move/bulk move ("Moved <title> to <column>" / "Moved N cards to <column>"),
   undo (the new UNDO entry's summary), card removed ("Removed <title>. Undo is available."), column removed, send result
   (RouteResult.detail).
3. **Per-card move select** calls `initiateMoveCard` (so WIP and exit policies still apply). The bulk "Move to…" clears the
   selection after moving (like drag does).
4. **Attachments**: file input + drop zone share one handler (`onFiles`, keeps phase 2's `captureBoard` guard); input value
   reset after use so the same file can be chosen again. Download link per stored attachment.
5. **Reset on switch**: an effect keyed on `[userId, activeProjectId]` clears transient UI state (adding-card draft,
   column-settings / policies popovers, assignee picker, rename field, WIP / exit modals, selection). A remembered project id
   that is no longer in a NON-EMPTY project list falls back to 'global'.
6. **Destructive confirms** (native `window.confirm`, `ponytail:` comment): removing a column that holds cards
   ("Remove column "<title>" and its N card(s)? Undo can restore them.") and Load Board ("Replace this board with the
   backup file? Undo can restore the current board."); cancel = no change. The Load Board file input value is reset after use.
7. **Undo button** disabled via `lastReversible(board) === null` (export it from the model if needed — it already is).
8. **Keyboard resize**: ArrowLeft/ArrowRight on the separator resize by 16 px through `resizeColumn` (clamped by the model).
9. **Metrics** (no text parsing): Done = the LAST column by `order`; lead time = Done entry time − createdAt; cycle time =
   Done entry time − ts of the first non-reversed MOVE entry whose `cardIds` include the card and whose `to` is not the FIRST
   column by order (fallback: createdAt). Throughput "avg per week" = completed ÷ max(1, weeks since the oldest card's
   createdAt) and is rendered. WIP chart counts use the actual columns.
10. **Theme tokens** (C): no hard-coded colours remain in TaskBoard.css or inline styles in TaskBoard.tsx except
    `transparent`/`currentColor`. Scoped tokens on `.tb-board`:
    `--tb-muted: color-mix(in srgb, var(--text-secondary) 65%, var(--text-primary))` for all small/secondary text;
    card background `var(--bg-surface)`; WIP exceeded = `color-mix(in srgb, var(--danger) 12%, var(--bg-surface))` + danger
    border; starved = same with `--accent`; no `!important` that would hide the drag-over highlight (`.tb-col--over` wins).
    Urgency: a small coloured dot (decorative, `aria-hidden`) + the level as text in `--tb-muted`; card left border keeps the
    urgency colour (non-text). Badges: text `var(--text-primary)` on a `color-mix(... 18%, var(--bg-surface))` tint.
    Recharts: axis/ticks/tooltip colours from CSS variables via `var(--…)` strings.
11. **Layout** (C): `.tb-toolbar { flex-wrap: wrap }`; `.tb-main { position: relative }`; the Activity and Metrics drawers
    overlay the columns (`position: absolute; top: 0; right: 0; bottom: 0; width: min(<current>, 100%)`) instead of taking
    width from them; popovers inside cards/column heads must not be clipped by `.tb-col__cards` overflow at 680 px
    (open upward/leftward or render via `position: fixed` — C's choice, must pass the harness screenshot).
    Card × visible on `:focus-within` and `:hover`; touch targets ≥ 24×24 px for every button in the board.
    `.tb-toolbar__error` rule replaces the inline style.
12. **Dead code** (I): remove the `didDrag` ref; compute `subtasksOf` once per card.

Acceptance (harness, `~/dwellium-harness/079-task-board`, standalone Vite page, before = phase-3 commit, after = this phase):
at 680×460 every toolbar button is inside the window; opening both drawers never pushes columns off; axe (scoped to the
board) reports 0 violations with a card view open and with the WIP modal open; every text node ≥ 4.5:1 (≥ 3:1 for ≥ 18.66 px
bold / 24 px) in all 16 picker themes; keyboard-only: open a card, Escape closes it and focus returns to the opener, move a
card via its select, attach a file via the input. Full vitest + tsc -b + both builds green.

## 11. Phase 5 contract (P0 — make it more useful)

Decision D1 taken (plan §4 recommendation): Task Menu keeps its own list; its Board tab is relabelled "Task Board" with a
one-line note that it is a separate list, and rows get a one-way "Send to Task Board". No two-way sync, no merged models.

Owner split: **A** = `taskBoardModel.ts`, `taskBoardStore.ts`, `lib/araDailyGlance.ts`, `lib/perUserIdentity.ts` (one getter);
**B** = `TaskBoard.tsx` + `TaskBoard.css`; **C** = `lib/dwelliumCommands.ts`, `TagFile/TagFile.tsx`, `TaskMenu/TaskMenu.tsx`,
`ThoughtWeaver/ThoughtWeaver.tsx`; **T** = new `src/test/taskBoard.p5.test.ts(x)`.

### A — model / store (signatures are the contract)
```ts
// taskBoardModel.ts
interface TaskCard { /* … */ dueAt?: string }                 // 'YYYY-MM-DD' (local calendar date)
type CardPatch = … & { dueAt?: string | null }                // null = unset; invalid strings ignored
export function isOverdue(card: TaskCard, columns: BoardColumn[], today: string): boolean; // dueAt < today AND not in the last column by order
export function lastColumnId(columns: BoardColumn[]): string | undefined;               // highest order
export function wipCount(cards: TaskCard[], columnId: string): number;                 // top-level cards only (parentId null/undefined)
// MOVE_CARD with toOrder: the card is inserted at index toOrder among the destination column's cards (sorted by order),
// and that column's cards are renumbered 0..n-1. The inverse restores the prior position of EVERY card whose order changed.
// repairBoard keeps a valid dueAt, drops an invalid one. planEdit applies dueAt with the same rules (inverse: null when unset).

// perUserIdentity.ts
export function currentOwner(): string | null;                // the id setPerUserIdentity last set

// taskBoardStore.ts
export function sendToTaskBoard(userId: string, fields: { title: string; description?: string; urgency?: Urgency }): { board: 'Global' | string };
//   If the board holders already belong to userId → add to the board currently selected (returns its project id or 'Global').
//   Otherwise point the user holder at userId (the setter resets the project → Global) and add there. Goes through addCard
//   (so it is audited, undoable, and synced). Title trimmed; empty → no card, returns { board: '' }.
export function findCardBoard(userId: string, cardId: string): { projectId: string | null } | null;
//   Scans this user's local boards (`taskboard:<uid>` and `taskboard:<uid>:<pid>`, through repairBoard) for the card.
export function openTaskBoardCard(userId: string, cardId: string): boolean;
//   findCardBoard → patchWidgetMemory('task-board', { activeProjectId: pid ?? 'global', openCardId: cardId }) →
//   dispatch the same 'dwellium:open-widget' event `openWidget('task-board')` uses. false (and no open) when not found.
export function findCardsByTitle(query: string): TaskCard[];  // current board; exact (case-insensitive) match wins, else substring matches
```
araDailyGlance: when any open card is overdue, the line becomes `N tasks not done — M high urgency — K overdue`.

### B — TaskBoard.tsx / .css
1. **Filter**: `<input type="search" aria-label="Filter cards">` in the toolbar; case-insensitive match on title, description,
   tags and assignee label; non-matching cards hidden; the toolbar count reads `N of M cards` while filtering; Escape clears.
   Remembered per board in widget memory is NOT required.
2. **Due date**: card view `<input type="date" aria-label="Due date">` (empty clears → `dueAt: null`); card face shows
   `Due <Mon D>` or, when `isOverdue`, `Overdue · <Mon D>` (text, not colour alone).
3. **Order inside a column**: dropping a card ON another card inserts it before that card (`moveCard(id, col, index)`);
   on the card title button, Alt+ArrowUp / Alt+ArrowDown move it one place within its column (announced).
4. **WIP that means something**: WIP badges/limits use `wipCount` (sub-tasks excluded); adding a card to a column at its max
   opens the WIP dialog ("Add anyway" / Cancel); "AI: file Backlog" routes through the same WIP + exit-policy checks as a bulk move.
5. Keep every phase-4 accessible name unchanged.

### C — integrations
1. `dwelliumCommands.parseSingle` (before the bare-widget fallback; "add"/"create" are currently routed to chat):
   `add task <title>` / `add card <title>` / `new task <title>` → `sendToTaskBoard(currentOwner(), { title })`, toast
   "Added to Task Board (<board>)"; no owner → toast "Sign in to use the Task Board" and nothing written.
   `open task <query>` → `findCardsByTitle` exactly one → `openTaskBoardCard`; none / several → toast saying so.
   `move task <query> to <column>` → one card + a column whose title matches (case-insensitive) → `moveCard` (user actor),
   toast; otherwise a toast explaining why nothing moved. Must not capture existing commands ("move strata to the left").
2. Tag File: rows whose source is 'task-board' become buttons (accessible name = item title) that call `openTaskBoardCard`;
   other sources unchanged.
3. Task Menu: the Board tab label reads "Task Board" and its panel starts with the note
   "This is your Task Board — a separate list from these tasks."; every list row gets a button "Send <title> to Task Board"
   → `sendToTaskBoard(user.id, { title, description, urgency })` (urgency high/medium/low passes through) + a status message.
4. ThoughtWeaver to-dos: each row gets a button "Send "<text>" to Task Board" (priority → urgency).

Acceptance: commands + Tag File + Task Menu + ThoughtWeaver paths create/open/move cards on the right user's board and
audit them; ordering survives undo; overdue appears in the glance; harness: filter, due date and drop-ordering work in a real
browser at 680×460 with 0 axe violations; full vitest + tsc -b + both builds green.

## 6. What was and was not verified

Run by the orchestrator: H1 and M1 and the no-op audit entry, on `taskBoardModel.ts` at `fe281de` with node 22.
Read on both sides: H3, M3 (frontend request vs backend route), H2 (`oneSaveStore.ts:359, 440-495`).
Recomputed: the four contrast ratios in M12, from `themes-master.css` latte tokens.
NOT done: no browser render (layout, clipping, touch, real contrast are from source); no two-device or
two-page-load run of H2 or M5; the vitest suite was not run (the audit worktree has no `node_modules`);
production's `EXPRESS_JSON_LIMIT` and whether `OPENAI_API_KEY` is set there are unknown; the
`BULK_LIST_LIMIT = 500` hydrate gap a mapper raised is app-wide One Save behaviour and was not traced here.
