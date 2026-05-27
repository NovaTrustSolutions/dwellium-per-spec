# Handoff v20 — Architecture-v4 Session 7 second pass (closeout) + Session 8 UI Overhaul plan

**To:** the next Claude session (the one that will *implement* the UI Overhaul).
**From:** Session 7 second-pass sign-off, 2026-05-14. Two-part doc — first half closes out Session 7's "remaining four items" cleanly; second half captures the UI Overhaul architectural plan agreed between Andy and the **external Orchestrator-Sonnet** (claude.ai planning layer; **not** the unbuilt Phase-5 in-product Orchestrator from architecture-v4 §4.7 — language distinction matters; see §0 below). All Session 7 second-pass work is now committed (`031b71d` on branch `architecture-v4-sessions-through-7p1`). The UI Overhaul is **planning only** in this doc — no source code shipped this session for that work. The next agent does the implementation.

## TL;DR for the next agent

- **Session 7 is closed.** Both passes shipped + committed. Working tree clean except the three documented do-not-commit paths (`themes.ts`, `tsconfig.web.tsbuildinfo`, `docs/Notes/`).
- **Session 8 is the UI Overhaul** (the Three Changes — slim chrome, vertical sidebar nav, chat redesign). Full spec is **architecture-v4 Part 14** (just added). Concrete order: **Part A → Part B → Part C**, ~165 min total.
- **Session 9 is code health** (formerly Session 8; pushed back one). tsc triage, dead-code, dependency audit, filesystem-side test harness for Session 6/7 work.
- **8 concerns/recommendations** for the UI work are documented in §3 below — read those BEFORE starting Part A. None of them are blockers; all are calls the implementing agent will need to make and benefit from having pre-considered.

---

## 0 — The Orchestrator distinction (important, do not conflate)

There are **two** things called "Orchestrator" in this codebase's documentation:

1. **The in-product Orchestrator (architecture-v4 §4.7)** — a Phase-5 agent that doesn't exist yet. Coordinates inter-agent jobs, scheduling, retries, the job queue. Status: NOT BUILT, deferred beyond Session 9.

2. **The external Orchestrator-Sonnet** — Claude (Sonnet) in claude.ai acting as a planning + brainstorming + orchestration layer that Andy talks to during architecture conversations. This is the role that produced the UI Overhaul plan captured in this doc. It's a person-facing tool, not a software component.

The UI Overhaul plan in §2 below came from #2 (the external planning Sonnet). Architecture-v4 Part 14 records that explicitly. **Do not confuse the two in any future docs or code comments.** When you see "Orchestrator" in past handoffs, it's almost always #1 (the unbuilt agent). When you see it in this doc + Part 14, it's #2 (the planning tool). The implementing agent never talks to #2 directly — Andy is the intermediary.

---

## 1 — Session 7 second pass — what shipped

Four items, all committed in `031b71d`. The first-pass chapter is `HANDOFF_v19.md`. This second-pass closeout summary is brief because the commit message already has the long-form per-item detail.

### 1.1 Auto-delete iCloud Inbox after Foundry admission

- `src/main/foundry.ts:approveItem` now SELECTs `source_type` + `source_filename` alongside `triage_status`.
- After the happy path completes (writeFile + DB update + admit log), `fs.promises.unlink(path.join(cfg.icloudInboxPath, sourceFilename))` fires.
- Silent on already-gone (file may have been moved/deleted out-of-band between capture and admit). Only fires for `source_type === 'icloud'`; URL captures, paste text, and direct file drops are unaffected.
- New log: `[Foundry] deleted inbox source: <path>`.

### 1.2 Domaines navigation state persistence

- `Shell.tsx` tab-click handler: `backToIndex()` now fires ONLY when `activeTab === 'domaines'` (same-tab "home" reset).
- Cross-tab switches preserve `view` + `activeDomaineId` + `activeProject` naturally — those fields already lived in `domainesStore`; the Shell was the only thing forcibly resetting them on every click.
- Architecture-v4 Part 3's "tab click is a hard reset to the index" rule applies to same-tab clicks; cross-tab switches preserve.

### 1.3 Multi-select Domain filter for the Graph

- `graphStore.selectorDomaineId: string` → `selectorDomaineIds: string[]` (empty array = "All Domaines" sentinel).
- `graphQueries.ts` + `graphAnalytics.ts` accept `domaineIds: string[] | null` (additive — legacy `domaineId` retained for backwards compat; `domaineIds` wins when both provided). WHERE clause uses `= ANY($N::uuid[])` so the same query shape handles single + multi.
- `preload/index.ts` + `types/ipc.ts` forward `domaineIds` through.
- **New `AnchoredMultiSelect` component** appended to `AnchoredDropdown.tsx` (~165 LOC). Same portal + `getBoundingClientRect` + flip-up + `useLayoutEffect` height-refinement infrastructure as `AnchoredDropdown`. Optional `allLabel` prop renders a top-of-popover toggle-all row. Popover stays open across selections.
- `Graph.tsx` swapped native `<select>` for `<AnchoredMultiSelect>`. `selectorTriggerLabel` memo computes display text: 0 → "All Domains", 1 → single name, 2–3 → comma-joined, 4+ → "N Domains". `crossDomaine` checkbox preserved as a separate control.

### 1.4 Working Memory panel

- Replaces the streaming-chunk `tokenCount` display (the v3 Trust failure #1 from architecture-v4 §9) with a collapsible Working Memory header above the context bar in `ChatPane.tsx`.
- **Active session:** duration (`Date.now()` since first message after a reset; cleared when chatHistory empties) + exchange count.
- **Memory active:** "Active — session bound" / "Active — prior summaries on disk" / "Inactive — no Honcho session"; click "open" launches the existing `MemoryPanel`.
- **Coherence signal:** Fresh (<10) / Extended (10–30) / Long session — consider a checkpoint (>30), by exchange count. Threshold-color cues (green / text / orange).
- **Context bar** kept — already model-aware from Session 2's fix.
- **Streaming `tokenCount` removed** from the Thinking indicator and the "Generating…" footer; `tokenCount` destructure dropped from `useLMStream()`.
- **"Grounded in" pane deliberately omitted** — architecture-v4 §9 calls for it but explicitly notes it requires chat-path retrieval instrumentation that doesn't exist. Andy's Item 4 spec correctly omitted it.

### 1.5 Verification at S7 second-pass close

- `npm run test` → 28/28 passing (~2.0 s)
- `npx tsc --noEmit -p tsconfig.web.json` → 6 pre-existing errors, **0 new**
- `npx tsc --noEmit -p tsconfig.node.json` → 4 pre-existing errors, **0 new**
- Committed: `031b71d` (10 files, +535 / -46)

---

## 2 — Session 8 UI Overhaul — the Three Changes

Plan agreed between Andy and the external Orchestrator-Sonnet. Full spec lives in **architecture-v4 Part 14** (just appended to that doc). Quick recap:

### 2.1 Part A — Slim chat chrome (~30 min)

- **One ⚙ icon → slide-out panel** replacing: agent selector pill (`✦ Gemini Flash ▾`), `Memory ▸` toggle, `⟳ Reset` button, AND the Working Memory inline panel from Session 7. One drawer for everything session-scoped.
- **Drawer internal layout (recommended):** three labeled sections — **Session** (Working Memory + Reset Context), **Memory** (reuse the existing `MemoryPanel.tsx`), **Agent** (provider/model picker).
- **Context bar kept,** ~4 px thinner cosmetically. No semantic change — model-aware from Session 2 stays.
- **Title bar height reduced** to minimum. MAIN indicator + git controls move to the vertical sidebar footer (Part B). Breadcrumb relocates to the Scribe sub-header.

### 2.2 Part B — Vertical sidebar navigation (~90 min)

- **48 px collapsed (icons + hover tooltips), ~160 px expanded (icons + labels).**
- Collapse state persisted in `sessionStore.navSidebarCollapsed: boolean`.
- Contents (top to bottom): Toggle · HUD · Scribe · Codex · Foundry · Hive · Domains.
- Footer region for MAIN branch indicator + git controls (moved from the slim title bar).
- Replaces the horizontal tab bar in `Shell.tsx`. Every `activeTab === '<tab>'` branch + every `setActiveTab(...)` call site needs to be re-wired.
- Scribe file explorer (left panel) **stays where it is** — opens to the right of the vertical nav when Scribe is active.
- **Domaines tab special-case preserved** (Session 7 second-pass): same-tab click on Domaines = `backToIndex()`; cross-tab switch = restore last view. The VerticalNav onClick handler must port this conditional.

### 2.3 Part C — Chat message redesign (~45 min)

- **User messages:** right-aligned, **no bubble**. Subtle left-border or background tint to preserve the "this is me" rhythm signal. **Recommended `max-width: 70%`** on the user message block — long messages spanning the full chat panel read badly on wide screens.
- **Agent messages:** full-width, markdown rendering (already working). Verify headers / blockquotes / nested lists / fenced code blocks all render correctly in the new layout.
- **Sticky user-message header:** when scrolling through a long agent reply, the triggering user message stays pinned at the top of the viewport (Antigravity / claude.ai pattern). **Implementation:** `position: sticky; top: 0` on the user-message wrapper. The chat scroll container is the positioning ancestor. No IntersectionObserver needed for v1.

### 2.4 Order rationale

Part A first (contained CSS + drawer component, quick visible win on its own). Part B second (biggest restructure — Shell.tsx + every tab routing branch). Part C last (independent, polish on a stable layout).

---

## 3 — Concerns + recommendations for the implementing agent

Read these **before** starting Part A. Concerns 1, 6, 7, 8 were **explicitly decided by Andy at sign-off** (marked **DECIDED** below) — implement as stated, do not relitigate. The remaining four are recommendations the implementer should follow unless they have concrete evidence otherwise.

### 3.1 The slide-out drawer needs internal organization — **DECIDED**

**Three labeled sections inside the drawer, top to bottom:**
1. **Session** — Working Memory readout (active session duration + exchanges + coherence) + the `⟲ Reset Context` button.
2. **Memory** — mount the existing `src/renderer/src/components/chat/MemoryPanel.tsx` (408 LOC) as a section. Don't rewrite.
3. **Agent** — provider / model picker (currently the `✦ Gemini Flash ▾` pill).

Locked at Session 7 sign-off. Don't ship a flat 4-stack; don't substitute sub-tabs or a single accordion.

### 3.2 Reuse `MemoryPanel.tsx` — don't rewrite it

The current `src/renderer/src/components/chat/MemoryPanel.tsx` is 408 LOC and fully built: Honcho session id display, dream insights list, Dream Now button, Memory file viewer with `synthesisReady` badge, deep-link to Settings → Maintenance. Mount it as a section inside the new drawer rather than rebuilding any of it. Saves substantial work + carries forward all the Session 2/3 trust fixes baked into it.

### 3.3 User messages "no bubble + right-align" — preserve the rhythm signal

On wide chat panels (Andy uses split-pane chat on tall monitors), right-aligned user text spanning the full width looks like the agent is talking to itself. **Recommend:** `max-width: 70%` on the user message text block + subtle background tint (e.g. `rgba(120, 200, 255, 0.05)`) or a 2 px left border in `var(--accent-cyan)`. Keep enough of a delineator that the user-vs-agent distinction reads at a glance.

### 3.4 Sticky user-message header — `position: sticky` is enough

The chat scroll container has overflow:auto, which makes it a position:sticky scrolling ancestor. Set `position: sticky; top: 0; z-index: 2; background: var(--bg-1)` on the user-message wrapper. Each user message naturally sticks when its bottom edge crosses the top of the viewport; the next user message pushes the previous one out when it arrives. No IntersectionObserver, no scroll-event listener, no extra state. If you find yourself reaching for either of those, you've overcomplicated it.

### 3.5 Domaines tab special-case must port to VerticalNav

Session 7 second pass added: clicking the Domaines tab WHILE ALREADY on it = `backToIndex()` (Home reset); cross-tab switch = preserve drill-down state via `domainesStore.view` + `.activeDomaineId` + `.activeProject`. The current logic lives at `Shell.tsx:115-129`. The new VerticalNav onClick handler for the Domaines item must replicate this conditional or you'll regress the persistence. Same rule applies, just at a different call site.

### 3.6 Tab order — **DECIDED** (UI Overhaul order, HUD first)

**Final order, top to bottom in the VerticalNav:**
1. Toggle (collapse/expand chevron)
2. HUD
3. Scribe
4. Codex
5. Foundry
6. Hive
7. Domains

Locked at Session 7 sign-off. This supersedes architecture-v4 Part 3's original `Scribe · Codex · Foundry · Hive · HUD · Domaines` order — Part 13 §8 already flagged the order as low-stakes / reorderable. Don't make this draggable for Session 8; if reorderable becomes a need later it's `sessionStore.navTabOrder: AppTab[]` but that's not in scope.

### 3.7 `PanelToggleButton` new home — **DECIDED**

**Relocate to the chat sub-header's right edge, alongside the new ⚙ icon.** Mirrors the symmetry — ⚙ on the right for chat session controls (drawer), `▸/▾` PanelToggleButton next to it for chat-visibility. The slim title bar (Part A) no longer hosts it. Don't lose the affordance. Locked at Session 7 sign-off.

### 3.8 Title-bar reduction — verify Electron `titleBarStyle` first — **DECIDED (implementing agent verifies)**

**The implementing agent verifies the Electron `titleBarStyle` config before touching CSS height.** Look at `editor/electron/main.ts` (or wherever `BrowserWindow` is created) for `titleBarStyle`. If it's already `hiddenInset` or `customButtonsOnHover`, the traffic lights are overlaid on the content — reducing the in-app title-bar div height is safe. If it's `default`, the OS draws a full title bar and reducing the in-app div has no visual effect — switch to `hiddenInset` first, then thin the div. Locked at Session 7 sign-off as a pre-flight step in Part A.

---

## 4 — Architecture-v4 doc updates this session

- **Part 12 (Sequencing) — updated:**
  - Session 7 marked DONE (both passes), references HANDOFF_v19 + v20.
  - Session 8 is now the **UI Overhaul** (was Code Health).
  - Session 9 is now **Code Health** (pushed from Session 8 by the UI work). Carries the Session 6/7 test-harness debt added during recent sessions.
  - The "Beyond Session 8" parenthetical updated to "Beyond Session 9".
- **Part 14 (UI Overhaul) — new section appended** at the end of architecture-v4.md, before the Appendix. Captures the Three Changes spec in canonical form: Part A (slim chrome) / Part B (vertical sidebar) / Part C (chat redesign), plus rationale + out-of-scope list.
- **End-of-doc footer updated** to reflect Sessions 1–7 complete.

---

## 5 — STATUS.md updates this session

- Header bumped to "Session 7 second pass complete; UI Overhaul next".
- TL;DR updated: Sessions 1–7 fully done; Session 8 = UI Overhaul; Session 9 = code health.
- Built/Partial/Not-built sections refreshed:
  - Auto-delete iCloud inbox, Domaines nav persistence, multi-select Domain filter, Working Memory panel all moved to **Built**.
  - The "Working Memory panel still the old token counter" line removed from Partial.
  - The four-item Session 7 carry-forward list deleted (it's done).
- Hand-off rules section (item 14) updated to flag the new Session 8 = UI Overhaul context for the next agent.

---

## 6 — gotcha.md updates this session

New **Session 7 third-pass / UI Overhaul priors** block appended below the Session 7 priors block (which itself sits below Session 6 priors). Three new entries per Andy's spec:

1. **UI Overhaul is a dedicated session.** Don't start implementing without reading the full plan in architecture-v4 Part 14 + this HANDOFF_v20. Order matters: Part A (slim chrome) → Part B (sidebar nav) → Part C (chat redesign). Part B is the biggest change — `Shell.tsx` restructure touches every tab routing branch.
2. **Sidebar nav target: 48 px collapsed (icons + tooltips), 160 px expanded (icons + labels).** Scribe file explorer stays in left panel, opens to the right of the nav sidebar.
3. **Chat sub-header consolidation: agent selector + Memory + Reset + Working Memory → single ⚙ icon → slide-out panel.** One click to access all session controls. Reuse `MemoryPanel.tsx` as a section inside the drawer (don't rewrite).

---

## 7 — Verification at this sign-off

- `npm run test` → 28/28 passing.
- `git log -1` → `031b71d` (Session 7 second pass, the only source-code commit this session).
- `git status --short` → only the three documented do-not-commit paths.
- 4 docs written/updated: `architecture-v4.md` (Part 12 + Part 14), `HANDOFF_v20.md` (this file), `STATUS.md`, `gotcha.md`.

---

## 8 — Read order for the next agent (~30 min)

1. **`docs/STATUS.md`** — refreshed at this sign-off; points at Session 8 UI Overhaul next.
2. **This file** (HANDOFF_v20) — closeout for S7 second pass + UI Overhaul plan + concerns.
3. **`docs/architecture-v4.md` Part 14** — canonical UI Overhaul spec (the Three Changes).
4. **`docs/gotcha.md`** — Session 7 priors (4 entries) + Session 7 third-pass / UI Overhaul priors (3 entries) at the bottom.
5. **`docs/HANDOFF_v19.md`** — Session 7 FIRST pass chapter (context for the AnchoredDropdown work that Part B's VerticalNav will likely echo + Wikilink-writeback guards that any chat path touching must respect).
6. **`docs/HANDOFF_v18.md`** — Session 6 chapter (Graph + Move-to-thread context).

---

## 9 — Don't touch list (carry-forward, unchanged)

- `editor/src/renderer/src/themes.ts` (Fey palette — Andy returns explicitly)
- `editor/tsconfig.web.tsbuildinfo` (autogen, perpetually dirty)
- `docs/Notes/` (Fey design + private PRDs)
- The 10 pre-existing tsc errors (Session 9 code-health territory; no ad-hoc fixes)
- Existing `References/` folders on disk (forward-only References removal — Session 7 first pass rule)
- Honcho workspace id (`honcho.ts:1` — still `'holocron'`, never rename)
- Move-to-thread `withRenameLock` bypass (load-bearing; the wikilink-writeback guards in `ragIngest.ts:710` are what make it safe)
- Wikilink-writeback guards themselves (`fs.stat` + `is_active=true` checks — Session 7 first-pass fix; don't remove thinking they're paranoid)

🍣
