# Dwellium Autorun Status

**Started:** 2026-05-27
**Cycle count:** 16 (advancing to feat/workspace-widget — 3rd of 4 feature branches)
**Main HEAD when started:** `7f3b548`
**Main HEAD now:** `9b929a6` (PR #93 Scribe + PR #94 File Explorer both merged)
**Current branch focus:** `feat/workspace-widget` (NOT YET CREATED — next prompt instructs Claude Code to create it)

## Goal
Integrate Andy's Agenteryx (Holocron mirror at `NovaTrustSolutions/Agenteryx`, branch `architecture-v4-sessions-through-7p1`) into Dwellium across 4 feature branches, in order:

1. ✅ `feat/scribe-widget` — Scribe markdown editor (PR #93 merged 2026-05-28)
2. ✅ `feat/file-explorer-enhanced` — Dual-mode file explorer, drag-to-agent, screenshot paste, hierarchy lock (PR #94 merged 2026-05-28)
3. 🎯 `feat/workspace-widget` — Domain → Project → Thread hierarchy (STARTING NOW)
4. `feat/foundry-ingestion` — Capture → Triage → Review → Admit pipeline

## What's been done

### 2026-05-26 (prior sessions — see CLAUDE.md commit 160b0ae)
- Per-user LLM integrations + Postgres card + Stella LLM wiring + bring-up on anzo + Gmail OAuth

### feat/scribe-widget arc (Cycles 1-12 + post-PR polish; closed 2026-05-28 via PR #93 merge → main `d5fbc2f`)
- 12 cycles delivered: setup → discovery/plan → 10 porting cycles → closure
- 23 new Scribe files / 3,718 LOC / 8 npm packages / 8 backend routes / ~650 KB lazy-loaded bundle
- Post-PR polish committed directly to the branch (not in autorun loop, but counted): inline `+ New File` UX fix, resizable splitters with per-user persistence, drag-and-drop pipeline (text/files/URLs/widgets), right-click context menu Paste+/Paste++ + Markdown submenu, launchd autostart for backend + frontend, a11y on gate-password input. Branch HEAD now `8202317` (13 commits beyond main even after merge).
- See `Docs/feat-scribe-widget-closure.md` for the 9-section closure narrative.

### feat/file-explorer-enhanced arc (closed 2026-05-28 via PR #94 merge → main `9b929a6`)
- ~10 cycles delivered (Cycles 2-11 visible in branch log; closure at `6e32b38`)
- Deliverables: empty-state panel + 3-tier type model + lock + dual-mode toggles → `/api/file-explorer/tree` fetch + 3-tier disk walker → inline rename + new file/folder + right-click + `/touch` backend → drag-from FileExplorer + `/read` backend + Scribe path-drop branch → drag-INTO move/copy + external file upload → Cmd+V screenshot paste (reuses `/api/scribe/images`) → hierarchy-lock polish (banner, panel ring, cursor) → dual-mode polish (sort dropdown, full-path line, Cmd+/ shortcut) → multi-select + FileManager merge → closure report
- Plan-of-record at `Scripts/autorun/FILE_EXPLORER_PORTING_PLAN.md`

## What's next (feat/workspace-widget — Cycles 1-12 planned, ONE PROMPT AT A TIME)
1. 🎯 **Cycle 1 — SETUP** (NEXT — current PROMPT_FOR_CLAUDE_CODE.md). Branch off main `9b929a6`. Subtree `Docs/holocron-reference/` already present (carried in from Scribe PR). Locate Workspace-relevant Holocron files. Push to origin. STOP for review.
2. **Cycle 2 — DISCOVERY + PLAN.** Read all relevant Holocron files + Dwellium target files. Draft `Scripts/autorun/WORKSPACE_PORTING_PLAN.md` covering: data model (Domain → Project → Thread), backend routes/storage location, UI shape, per-user namespacing, integration with existing Dwellium widgets, open questions for Ilya. STOP for review.
3. **Cycles 3-11 — PORT ITERATIVELY** (exact sequence determined by Cycle 2 plan; rough sketch):
   - Cycle 3: Scaffold widget + sidebar entry + per-user store
   - Cycle 4: Data model + backend routes (domains list, create, rename, purge)
   - Cycle 5: Domain sidebar UI + selection state
   - Cycle 6: Project tier (list, create, rename, move-between-domains)
   - Cycle 7: Thread tier (picker, create, rename, purge)
   - Cycle 8: Cross-tier integration (Scribe-tab-belongs-to-thread; File-Explorer-scoped-to-project)
   - Cycle 9: Drag-reorder + bulk ops
   - Cycle 10: Settings UI + per-user theme
   - Cycle 11: Polish (keyboard shortcuts, context menu, empty states)
4. **Cycle 12 — CLOSURE.** Closure report + strict gate. PR-ready. Ilya pushes manually.

## Blocked / waiting on Ilya
**🎯 Cycle 16 generated for Ilya:** Phase A (Setup) prompt for `feat/workspace-widget` written to `Scripts/autorun/PROMPT_FOR_CLAUDE_CODE.md`. Awaiting Ilya to run it in Claude Code.

Acknowledged carry-overs (not blocking workspace work; respecting Ilya's manual work):
- `feat/scribe-widget` branch still exists locally with 6 post-PR-#93 commits (UX polish + launchd autostart + drag/drop pipeline + resizable splitters + right-click menu) — NOT instructing Claude Code to do anything with these; assumed they'll either land as a follow-up PR or stay on the branch at Ilya's discretion.
- `feat/file-explorer-enhanced` branch still exists locally at `6e32b38` (matches the PR #94 closure commit) — nothing to do.

### Autorun fire log
- 2026-05-27 autorun fire #1: Cycle 5 prompt generated (initial).
- 2026-05-27 autorun fire #2: git local state unchanged — verdict still waiting; prompt left in place.
- 2026-05-27 cowork live-update: Ilya executed Cycle 5 → commit `982321e` landed → STATUS advanced + Cycle 6 prompt generated.
- 2026-05-27 autorun fire #3: HEAD still at `d45b11d` — Cycle 8 prompt unchanged; waiting on Ilya.
- 2026-05-27 autorun fire #4: HEAD still at `009d12c` — branch PR-ready but not pushed; PROMPT (push+PR walkthrough) left unchanged.
- 2026-05-27 autorun fire #5: Manual-commit detected `009d12c` → `f158a43` (window.prompt UX fix). Respected manual work; PROMPT (push+PR walkthrough) left unchanged.
- 2026-05-28 autorun fires #6, #7, #8: All three fires found no git advance — `feat/scribe-widget` HEAD still `f158a43`; `main` still `7f3b548`. PROMPT left unchanged each time.
- 2026-05-28 autorun fire #9 (scheduled): **🎯 BIG ADVANCE.** `main` HEAD `7f3b548` → `9b929a6` (+2 squash merges: `d5fbc2f` Scribe PR #93 + `9b929a6` File Explorer PR #94). `feat/scribe-widget` HEAD `f158a43` → `8202317` (+6 post-PR polish commits Ilya landed manually). `feat/file-explorer-enhanced` exists locally at `6e32b38` (closure commit). `feat/workspace-widget` does NOT yet exist (expected; about to be created). `git fetch origin` failed again ("could not read Username for 'https://github.com'") — proceeded with local state only (consistent with all prior fires). Mount this run: `/sessions/intelligent-laughing-tesla/mnt/Dwellium -Per Spec`. No HALT file. Advanced STATUS substantially; wrote new Phase A (Setup) prompt for `feat/workspace-widget` Cycle 1. Respecting Ilya's 6 post-PR-#93 polish commits on `feat/scribe-widget` per autorun rule — not touching them. 🧪

## Architecture decisions (Scribe arc, locked 2026-05-27 — preserved for cross-arc reference)
| # | Decision | Affects |
|---|---|---|
| 1+2 | **File storage:** `~/.dwellium/scribe/<userId>/` — per-user namespaced (sister to integrationsUserIdHolder pattern) | Workspace likely uses same pattern: `~/.dwellium/workspace/<userId>/` |
| 3 | **Coexist with Notepad** — both stay; no removals | Workspace cycle should also coexist with everything |
| 4 | **Sidebar group:** `'Filing Cabinet'` (Scribe lives here) | Workspace may want its own group OR live in 'Filing Cabinet' — TBD in Cycle 2 plan |
| 5 | **Backend routes:** sibling `ai-dashboard369-file-manager` repo via `Docs/backend-A-routes.patch` pattern | Workspace will follow same pattern — patch grows further |
| 6 | **Skip PDFViewer port** — delegate to PDFGear | N/A workspace |
| 7 | **DumpMode was deferred to feat/workspace-widget** | 🎯 Resolve in Cycle 2 plan whether DumpMode lands here or gets dropped entirely |
| 8 | **Self-contained "Send to Agent"** | N/A workspace |

## Last cycle summary
**Cycle 16 (2026-05-28 autorun fire #9) — feat/scribe-widget + feat/file-explorer-enhanced BOTH MERGED.** Cowork autorun detected `main` advanced from `7f3b548` to `9b929a6` via PR #93 (Scribe) and PR #94 (File Explorer) squash-merges. The 4-branch plan is now 50% complete — 2 of 4 feature branches shipped to main. Cycle 16 generates the Phase A (Setup) prompt for `feat/workspace-widget` (Domain → Project → Thread hierarchy; 3rd of 4 branches). Phase A is the standard setup pattern: branch off main + locate Holocron source files + push to origin + STOP for review. Holocron source surface area pre-surveyed in this fire (workspace.ts main-process + domaineFs.ts + projectFs.ts + Domaines.tsx + ThreadPickerHeader.tsx + DomaineBadge.tsx + domainesStore.ts + useDomaineForProject.ts + threadActions.ts + 2 SQL migrations + 3 tests). The subtree `Docs/holocron-reference/` is already present in main (carried in via PR #93 Scribe merge) — no subtree-add needed, just branch + locate + push.

## Conventions
- 🧪 token in every response
- NO commits or pushes from Cowork autorun side. Only state files + prompts get written. Claude Code commits; Ilya pushes.
- Strict gate (tsc, vitest, both builds, PII, SSR smoke) must pass before any Claude Code commit
- Code commits use `Co-Authored-By: Claude <noreply@anthropic.com>`
- If autorun detects a stuck state (Ilya hasn't executed the last prompt yet), it DOES NOT regenerate a fresh prompt — leaves the existing one in place
- HALT file: `touch Scripts/autorun/HALT` to skip the next cycle gracefully
