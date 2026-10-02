# 079 — Task Board widget: capability report, audit, improvement plan

Status: AUDIT ONLY (read-only, 2026-10-01). Nothing was changed, committed or pushed. Base: `origin/main` @ `fe281de`
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

## 6. What was and was not verified

Run by the orchestrator: H1 and M1 and the no-op audit entry, on `taskBoardModel.ts` at `fe281de` with node 22.
Read on both sides: H3, M3 (frontend request vs backend route), H2 (`oneSaveStore.ts:359, 440-495`).
Recomputed: the four contrast ratios in M12, from `themes-master.css` latte tokens.
NOT done: no browser render (layout, clipping, touch, real contrast are from source); no two-device or
two-page-load run of H2 or M5; the vitest suite was not run (the audit worktree has no `node_modules`);
production's `EXPRESS_JSON_LIMIT` and whether `OPENAI_API_KEY` is set there are unknown; the
`BULK_LIST_LIMIT = 500` hydrate gap a mapper raised is app-wide One Save behaviour and was not traced here.
