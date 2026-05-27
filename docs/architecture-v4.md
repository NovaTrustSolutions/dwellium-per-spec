# Architecture V4 — The Intelligence & Agent Layer
**Status:** Planning Document
**Prepared for:** Next development phase
**Author:** Claude Opus 4.7 (deep planning session)
**Date:** May 2026
**Supersedes:** architecture-v3.md (partially — v3's Domaines vision is now complete; v3's Trust Layer is 4/6 done; v3's "Intake" is renamed "Foundry" here and given implementation detail)

---

### How to Use This Document

V3 was the *vision* document — what Holocron should become. This is the *intelligence-and-agent* planning document — how the multi-agent layer that turns Holocron into Agenteryx actually gets built, in what order, and what decisions Andy still needs to make.

Read it in three passes:

1. **Part 1** — what's actually built right now, with no rounding up. If you're a fresh agent, this is your ground truth; don't trust older docs over this.
2. **Parts 2–11** — the design. Terminology, navigation, every agent formally specced, the Hive, the Foundry, the Syntheses tab, the graph overhaul, the Working Memory panel, mobile/Telegram, and the UI direction.
3. **Parts 12–13 + Appendix** — the sequencing (next 8 sessions, in order, with rationale), the open questions Andy must answer before implementation, and a one-page agent quick reference.

**What this document requires from Andy:** the answers in Part 13. Several of them gate Part 12 sessions — in particular the `graphology`-vs-hand-rolled decision (Session 1), the Honcho-vs-native-memory question (Session 2), the Telegram auth model (Session 5), and the Foundry final naming/scope confirmation (Session 4). Everything else can be settled during implementation.

This doc does **not** re-spec what's already built (read the canonical trio — `ARCHITECTURE.md` / `DATA_MODEL.md` / `MVP.md` — for the MVP, `architecture-v3.md` for the Domaines/lifecycle vision, `HANDOFF_v13.md` for the v13 implementation chapter, `gotcha.md` for the priors). It builds *forward* from the current state.

---

## Part 1: Current State — What Is Actually Built

### Fully built and verified

| Capability | State | Reference |
|---|---|---|
| MVP P1–P7 (thread intelligence, brain dump, file import, report gen, redline, notes, branching) | In daily use | `MVP.md`, all `✓ Complete` |
| Three-tier namespace-anchored wiki — one page per thread, one meta-synthesis per project, one overview per Domaine; slug encodes folder path; auto-compile fires per-ingest (no threshold); cold-start bootstrap at boot | Complete + verified | `b5033d5`, `73a49e5`, `34c336f` (+ migration 007); `ragWiki.ts` |
| Tier-aware orphan sweep — `deleteSourcelessWikiPages` 3-tier bottom-up cascade; `scanOrphans` mirrors it exactly | Complete + 5 tests | `7d5929e`, `0fa9f03`; `cleanupOps.ts` |
| Boot-time self-healing — `syncWorkspaceRoots` (config-key drift), `validateActiveConfigPaths` (stale active state), `bootstrapMissingPages` (uncompiled wiki tiers), `deleteZombieWikiDocs` (migration-007 residue + orphan tags) | Complete + verified | `0dc8ada`, `739d54d`, `9740a40`; `index.ts`, `config.ts`, `cleanupOps.ts` |
| Nested Domaines layout — `_Domaines/<Domaine>/<Project>/<Thread>/…`; Sync-workspace bulk ingest; per-row force re-ingest; Nuclear Reset; sort persistence at every level | Complete + verified | `5f86c5b`, `004e8ad`, `f940d9f`, `0dc8ada` |
| Domaines CRUD — create/rename/delete Domaine + project + thread under the nested layout; typed-confirmation purges; active-state escape hatches | Complete + verified (6 bugs healed) | `0dc8ada` + the v13 chapter; `HANDOFF_v13.md` |
| Codex → Ingest — resizable/collapsible split, sticky header, source-type + tier + Domaine filters (all persisted in `ingestStore`), Retry-failed bulk action, X-badge from latest ingest event, scoped doc count, wiki Project·Domaine column resolved via `rag_wiki_pages` | Complete | `b85af8f`, `8c8b9d2`, `e3f4d23`; `Ingest.tsx`, `ingestQueries.ts` |
| Codex → Wiki — page grid, tier badges, tier filter + tier sort, always-down `OptionDropdown`s, Domaine filter persisted in `codexWikiStore` (default "All Domaines") | Complete | `73a49e5`, `34c336f`, `b9b0575` |
| Codex → Graph — d3-force "living cell": continuous physics, soft per-Domaine clustering via charge anchors (no bounding boxes), glow-haloed nodes sized by tier, pulsing edges, drag/hover/zoom, double-click→Codex preview, "Edit in Scribe" rail; resizable/collapsible detail rail; fills the full Codex viewport; Domaine filter persisted in `graphStore`; "Show orphans" defaults off | Complete (renderer); analytics not yet | `e387dd5`, `d49b229`, `a554e1a`; `graphQueries.ts`, `Graph.tsx` |
| Codex preview links — external → system browser (`window.open` → `setWindowOpenHandler` → `shell.openExternal`); internal `.md` paths → in-pane navigation; `wiki://<slug>` + wiki-type `[N]` citations → wiki-page lookup; `[[wikilinks]]` resolve to raw documents via `openDocByName`, not just wiki pages; no `a:` branch renders a dead `<a>` | Complete | `14417f7`, `5e67b0d`; `CodexPreview.tsx` |
| Scribe — CodeMirror 6 markdown editor; redlines/comments/versioning/smart-paste; VS Code-style preview tabs; thread-picker accordion in the sidebar header; `loadThreadForPath` context-switch helper | Complete | `2cea2ba`, `861ffc3` |
| RAG ingestion pipeline — auto-ingest on file create (chokidar, polling); `detectSourceType` nested-layout regexes; Gemini Flash tag extraction; `attachTags` (idempotent on the composite PK); `recomputeTagOverlap` (tag-shared edges); `ensureNamespaceRow` resolves real `domaine_id`; cost middleware writes `rag_operations_log` | Complete | Phase 3a + the v13 ingest commits; `ragIngest.ts` |
| Provider routing — LM Studio (slow), Gemini Flash (tagging/wiki), Anthropic Claude (chat/synthesis); per-task default + chat-header override; `rag_config.daily_budget_usd` budget gate | Complete | Phase 3a |
| Honcho v3 integration — workspace `holocron`, peer `andy`, one session per thread; messages saved on every exchange; history restored on thread load; Reset Context (server summary → Memory file → new session, with Gemini fallback) | Connected + storing | Phase 3a + MVP P1 |
| Automated test suite — 28 vitest tests against a real `holocron_rag_test` Postgres + a per-test temp filesystem (no DB/fs mocks; `electron` stubbed to node) | Complete | `649ba95`, `b5033d5` (V5 rewrite); `tests/` |
| DB schema — migrations 001→007 (`rag_documents`, `rag_tags`, `rag_document_tags`, `rag_relationships`, `rag_wiki_pages`, `rag_wiki_page_sources`, `rag_syntheses`, `rag_domaines`, `rag_namespaces`, `rag_operations_log`, `rag_config`, `rag_schema_migrations`); `npm run db:setup` idempotent | Complete | scripts/migrations/ |

### Partially built — known gaps

- **Honcho memory layer.** Connected and storing messages, but: (a) the "80% auto-compaction" the MVP claimed was never implemented — the bar is advisory only, and **Reset Context** (manual) is the only real compaction path; (b) the **Dreaming Agent** is referenced in `DATA_MODEL.md` (`Memory.dreamInsights`, `lastDreamQuery`) and the MVP P7 Branch flow, but is never actually called — `dreamInsights` is always empty; (c) Honcho memory is **write-only** from the user's perspective — there's no readable surface for what it knows. The architecture-v3 Trust Layer items #2 (Clear button) and #6 (Honcho memory inspection) are still open.
- **Graph analytics.** The renderer is done (d3-force, clustering, glow, hover/drag/zoom), but it's purely *visual* — node size = degree, color = Domaine. No betweenness centrality, no Louvain community detection, no structural-gap detection, no topical-diversity score. The "InfraNodus-style" analytics layer doesn't exist.
- **Syntheses tab.** The sub-tab button exists in `CodexTab.tsx` but is `enabled: false` (grayed out, "Phase 3c"). The `rag_syntheses` table exists (migration 001: `title`, `query`, `content`, `source_doc_ids`, `captured_back`, `captured_at`, `created_at`) but is empty — no code path writes to it. There is no UI.
- **Synthesis Agent scope.** Claude Sonnet *does* compile wiki pages (the per-tier prompts, the contradiction-surfacing "Open questions / tensions" section). It does **not** do cross-Domaine synthesis, gap-bridging, or write synthesis documents to `_Library/Syntheses/`.
- **Validation Agent surface.** The rule-based integrity sweep (`deleteSourcelessWikiPages` + `deleteOrphanTags` + `scanDeadLinks` + `bootstrapMissingPages` + `deleteZombieWikiDocs`) runs on boot and via the Ingest-tab buttons, but there's no per-run report, no health-trend view, no Hive surface — it's invisible unless you read the boot log.
- **Working Memory panel.** Still the old token counter (which shows *output* chunk count, not input/context size — `STATUS.md` and `architecture-v3.md` both flag this as a trust failure). Not replaced.
- **Phase 1 ingestion validation.** Paused since v11. `PHASE_1_VALIDATION.md` has Andy's pre-written Q1–Q4 expectations and the 8-PRD corpus; the corpus paths now resolve under the nested layout, so it *can* resume — but it hasn't.

### Not built at all

- **The Foundry** (was "The Intake" in v3) — the four-stage upstream pipeline (Capture → Triage → Review → Admit). No tab, no triage agent, no Firecrawl integration despite the API key being in Settings, no paste-a-URL, no iCloud drop zone.
- **The Hive** — the agent-management top-level tab. Nothing exists. Agent monitoring, per-agent landing pages, the Dreams panel, cost-by-Domaine, Telegram/iCloud config — none of it.
- **Hermes** — the relay agent (Telegram bridge + iCloud watcher + inter-agent router). Nothing exists.
- **The CoPaw auto-capture pattern** — silently scanning agent responses for key facts and writing them to Honcho memory. Not built.
- **The Orchestrator** — formal agent coordinator / job queue. Today each agent is triggered independently and implicitly; there is no orchestrator. (Phase 5.)
- **Web research integration** — Codex-first → web-augmented retrieval (v3 §4.6). Not built.
- **Document lifecycle states (Raw / Working Copy / Output)** — conceptually agreed in v3 §4.2, but not enforced or surfaced. Batch import from Codex into a Project doesn't exist.

### Technical debt

- **Dead code:** `EditDomaineModal` in `Domaines.tsx` (~70 lines, defined, never referenced — the Edit-description/color toolbar buttons were removed in v13). Likely others now that Cytoscape is gone — needs an audit.
- **Pre-existing tsc errors (7, from the `HANDOFF_v13.md` table):** `cleanupOps.ts:~354` (TS2322, `withRagClient` return `number | null` in `purgeDeadLinks` — line migrates as code is added above it), `convert.ts:20,29` (TS2339, mammoth + pdf-parse), `dashboard.ts:54` (TS18047, `res.rowCount` possibly null), `ipc.ts:303` (TS2345, `path.basename` in `.map`), `ragIngest.ts:242` (TS2339, `config.gemini` not on `HolocronConfig` — runtime works, the type is just missing), plus renderer-side `ChatMessage.tsx:67`, `CodexPreview.tsx:~1161,~1237` (ScribeColorTheme TS2345 + ReactPortal TS2352), `HUD.tsx:50` (TS2367, `'dashboard'` literal vs `AppTab`), `selectionObserver.ts:14` (TS2344, PluginValue). None block the build. Needs a dedicated triage pass.
- **`config.gemini` / `config.anthropic` not declared on `HolocronConfig`** — runtime fields exist (the providers work), the TS interface doesn't. ~5-line fix in `config.ts` + `settingsStore.ts`.
- **Bundle size:** the d3-force swap *reduced* the renderer bundle from ~3.63 MB → ~2.42 MB (Cytoscape ~1.3 MB out, d3 ~270 KB in). `import * as d3 from 'd3'` pulls the full bundle — switching to per-submodule imports (`d3-force`/`d3-selection`/`d3-zoom`/`d3-drag`/`d3-color`/`d3-array`) would shave more. Worth a bundle-analysis pass before the next big dep add (`graphology`).
- **Stale `activeSessionId` / `activeSessionName` in config** — pre-Projects-model leftover, not used.
- **STATUS.md was badly stale before this session** (it described the v12 clean-slate state — six bugs, DB at zero, API keys lost — none of which is current). Refreshed alongside this doc.

### The test suite — what it covers, what it doesn't

28 tests across 6 files, all against a real `holocron_rag_test` Postgres (auto-CREATEd, migrations applied idempotently, TRUNCATE between tests, bridges re-seeded) and a per-test temp fs. **No mocks for DB or fs.** `electron` is aliased to a node-only stub so `config.ts` / `workspace.ts` load without a runtime.

- `domaine-purge.test.ts` (6) — V1: Domaine purge cascades, active-state escape hatch, tab-close wiring.
- `project-rename.test.ts` (4) — V2: project rename + the bug-4 collateral-damage check.
- `thread-purge.test.ts` (4) — V3: thread purge escape hatch.
- `nuclear-reset.test.ts` (5) — V4: Nuclear Reset FK order, per-table counts, bridge preservation.
- `wiki-bootstrap.test.ts` (5) — V5: three-tier `alreadyExists` paths, wiki-doc exclusion, bridge skipping, multi-thread counting. **The compile-new-page branch is NOT exercised** (needs a live Gemini key or an LLM stub).
- `ingest-filter.test.ts` (4) — wiki-vs-Domaine-scope leak fix.

**Not covered:** any renderer/React code (zero component tests), Honcho integration (zero — the Honcho client is never exercised), the LLM call paths (no stub for Gemini/Claude — tagging, wiki compilation, synthesis are all untested), the d3-force graph, the ingestion regex coverage (`detectSourceType` has ~10 regex variants, none unit-tested). A renderer-test harness and an LLM-stub fixture are pre-reqs for confidently building the agent layer.

---

## Part 2: Renamed Terminology (V4 additions)

Carrying forward v3's table, with the following changes and additions. Old/proposed names are listed for reference only — retire them.

| Old / Proposed | New Name | Notes |
|---|---|---|
| The Intake | **Foundry** | Where raw information enters, gets triaged and refined, before Codex admission. (v3 left this unnamed — candidates were Atrium / Crucible / Current. "Foundry" wins: it's where raw material is worked, and it's a place, not a flow.) |
| Agent Dashboard / The Hive | **Hive** | Top-level nav tab. Agent management, monitoring, dreams; future home of Claude Code session management and the custom-agent builder. (v3's "The Hive" was a vague reservation; this gives it a concrete shape — see Part 5.) |
| Mind / Honcho-as-orchestrator surface | **Hive → Honcho** | The "Mind tab" from the older 5-tab plan is folded into the Hive as the Honcho agent's landing page. |
| (new) | **Hermes** | Relay agent: Telegram bridge, iCloud-Drive watcher, inter-agent router. Not built on Ilya's code — fresh build, relay pattern only. |
| (new) | **CoPaw pattern** | Auto-capture: after every agent response, silently scan for key facts and store to Honcho memory. Named after the auto-capture loop in Ilya's `copawStore.ts` (the *pattern*, not the code). |
| (new) | **Orchestrator** | The agent coordinator / job queue. Implicit today (each agent triggered independently); a formal Orchestrator is Phase 5. |
| Codex sub-tab "Mind" | — | Removed. The 5-sub-tab Codex (Search / Wiki / Ingest / Graph / Syntheses) stands; no "Mind" sub-tab. |

(Unchanged from v3: **Codex** = the knowledge repository; **Scribe** = the active workspace; **Domaines** → Projects → Threads; **HUD** = system status; **Holocron** = the current app, one module within **Agenteryx** = the full vision.)

---

## Part 3: Navigation Architecture

### Default Tab Order (draggable, persisted in config)

**Scribe · Codex · Foundry · Hive · HUD · Domaines**

Rationale:
- **Scribe first** — it's the write surface; the thing Andy is actually *doing* most days lives there.
- **Codex second** — the read surface; the knowledge base is the second-most-frequented place. Scribe + Codex are the read/write pair, so they're adjacent.
- **Foundry third** — information *flows into* the system here before it reaches Codex. Putting it between Codex and Hive reads left-to-right as "raw material → refined knowledge → the agents that maintain it."
- **Hive fourth** — agent monitoring is a periodic check-in, not a constant; it sits in the middle.
- **HUD fifth** — system status is glanceable; it doesn't need pole position now that the Hive exists (the Hive is where the *interesting* status lives — what the agents are doing — and the HUD becomes the lighter "is the machine healthy" view).
- **Domaines last** — it's the org-structure surface; you go there to create/rename/navigate the hierarchy, which is rare relative to actually working inside a thread. (Note: the Domaines tab is already a hard reset to the index grid — `backToIndex()` runs on tab click.)

**Drag-to-reorder:** the tab bar gets a small lock/unlock affordance (a 🔒 icon at the left or right of the strip). Unlocked → tabs become draggable (HTML5 drag or pointer-drag with a ghost), drop to reorder; the order persists to `config.tabOrder: AppTab[]`. Locked is the default. This is a small, self-contained feature (one config key, one renderer interaction, the existing `AppTab` union) — bundle it with the Working Memory panel pass (Session 7) or do it standalone earlier if Andy wants it sooner.

### Tab Responsibilities

- **Scribe** — the write surface. CodeMirror editor for the active thread's documents: drafting, redlining, versioning, brain dumps, reports. Mental mode: *making the thing*. The agent chat lives alongside here.
- **Codex** — the read surface. The knowledge repository made browsable: Search, Wiki (the three-tier compiled pages), Ingest (manual inspection + control of the pipeline), Graph (the connectivity view), Syntheses (the cross-domain analytical layer — see Part 7). Mental mode: *what do I know, and how does it connect*.
- **Foundry** — the intake. Where external information arrives, gets triaged by an agent, reviewed by Andy, and admitted (or rejected) into the Codex. Mental mode: *what's coming in, and is it worth keeping*. Nothing enters the Codex except through here (or a direct file drop into a thread folder, which is the legacy path).
- **Hive** — the agent control room. Per-agent monitoring cards, per-agent landing pages, the Honcho memory + Dreams surface, cost attribution by Domaine, Telegram/iCloud config. Mental mode: *what are my agents doing, and are they healthy*.
- **HUD** — system status. Knowledge-base counts, API spend, recent ingestion activity, pending actions. Lighter than the Hive; the "dashboard glance" view. Mental mode: *is the machine running*.
- **Domaines** — the org structure. Drill-down: Index → Domaine → Project → Threads. Create/rename/delete at each level. Mental mode: *where does this go / how is this organized*. Single-click navigation throughout; tab click is a hard reset to the index.

---

## Part 4: The Agent Architecture

This is the core of v4. Each agent is defined with: **role**, **triggers**, **inputs**, **outputs**, **model**, **cost tier**, **what it reports to**, and **how Andy interacts with it**. The Appendix has the one-page table.

The guiding principle (from v3, still load-bearing): **cheap models for bulk transformation, expensive models only when warranted, and the user is the quality gate for anything that mutates the knowledge base.**

### 4.1 Ingestion Agent (Gemini Flash) — EXISTS, PARTIALLY

**Role:** Read a newly-created (or force-re-ingested) document, extract a tag set, and recompute its tag-overlap relationships.

**Triggers:** chokidar `add` event under `_Domaines/` (auto-ingest on file create); the per-row "Re-ingest" button (`rag:ingest-manual`, `force=true`); "+ Ingest file…" picker; "Sync workspace" (walks `_Domaines/`, ingests every `.md`, no `force`).

**Inputs:** the document's text, its `source_path` (→ `source_type` + `project_name` + `domaine_id` via `detectSourceType` + `ensureNamespaceRow`).

**Outputs:** `rag_documents` row (or updated row + skipped-content-hash bail-out when `force`), `rag_tags` + `rag_document_tags` rows (idempotent on the composite PK), `rag_relationships` tag-shared edges (`recomputeTagOverlap`), an `rag_operations_log` ingest event (with cost).

**Model:** Gemini Flash. **Cost tier:** cheap (bulk).

**Reports to:** the Hive's Gemini Flash card — ingestion queue, recent runs, per-file tag count/quality, cost by Domaine.

**Andy interacts:** via Codex → Ingest (filter, re-ingest, Retry-failed, Sync workspace) and the Hive's Gemini page.

**Gaps to fix:**
- **No retry/backoff on Gemini 429/503.** A transient 503 during Sync workspace silently skips that doc's tags (Andy hit this — the doc lands with 0 tags + an error event). Belongs in `chat()` so all task types benefit. The "Retry failed" button papers over the symptom.
- **`config.gemini` type missing** — declare it on `HolocronConfig`.
- **Tag-quality signal** — there's no per-file "did this produce useful tags or generic mush" indicator. The Hive Gemini page should surface tag count + a heuristic flag (e.g. all tags ≤ 2 words and all appear on > 50% of the Domaine's docs → "possible tag collapse"). This is also what Phase 1 validation is supposed to measure manually.
- **No unit coverage** of `detectSourceType` or `extractTags` (`parseTagsFromResponse`).

### 4.2 Synthesis Agent (Claude Sonnet) — EXISTS FOR WIKI, NEEDS EXPANSION

**Role (today):** compile the three-tier wiki — one page per thread (from raw docs in that thread folder), one meta-synthesis per project (from the thread-tier pages in that namespace+domaine), one overview per Domaine (from the project-tier pages). Per-tier system prompts wrap a shared structure (Overview / Key concepts / Open questions / Sources with `[N]` citations and contradiction-surfacing). Compile order is strict (thread → project → domaine) but doesn't require inter-tier synchronization because tier-2/3 source-gathering queries `rag_wiki_pages` directly. Auto-fires per ingest; cold-start `bootstrapMissingPages` at boot.

**Role (to add):**
- **Cross-Domaine synthesis** — given two clusters (from the graph analytics, Part 7) that the user works in but rarely connects, write a *connection* document: "Your AstraStrata work on X relates to your AI research on Y."
- **Gap-bridge documents** — given a structural gap (low inter-cluster connectivity, Part 7.2), write a *research question* document that, if pursued, would bridge the gap.
- **Theme synthesis** — given N documents that share an emerging theme not yet captured by any wiki page, write a theme document naming and developing the theme.
- **Cluster naming** — given a Louvain community's member documents, produce a short human-readable name for it (used by the graph color legend and the Syntheses analytics panel).

**Triggers:** wiki — per-ingest (debounced/batched via the compile queue) + boot bootstrap; the new synthesis types — on-demand from the Syntheses tab ("synthesize this gap" / "name this cluster" / "write a theme doc for these") and from the Hive (an approved Honcho dream becomes a synthesis document).

**Inputs:** wiki — raw docs (tier 1), `rag_wiki_pages` rows (tiers 2/3); synthesis — cluster member docs, gap descriptors, dream text.

**Outputs:** wiki — `rag_wiki_pages` rows + `_Library/Wiki/<slug>.md` files + a reingested `rag_documents` row each; synthesis — `rag_syntheses` rows + `_Library/Syntheses/<slug>.md` files (this directory doesn't exist yet — it'll be created on first synthesis, sibling to `_Library/Wiki/`).

**Model:** Claude Sonnet. **Cost tier:** mid (synthesis is where the money should go — never put this on Flash; never put bulk ingestion on Sonnet).

**Reports to:** the Hive's Claude Sonnet card — wiki compilation history, synthesis documents generated, cost by Domaine.

**Andy interacts:** Codex → Wiki (regenerate a page) and Codex → Syntheses (trigger / review / approve syntheses); the Hive's Sonnet page.

### 4.3 Validation Agent (rule-based, not LLM) — EXISTS AS BOOT SWEEP, NEEDS SURFACE

**Role:** maintain the structural invariants of the knowledge base. Not an LLM — a set of deterministic checks-and-repairs: `deleteSourcelessWikiPages` (3-tier orphan cascade), `deleteOrphanTags`, `scanDeadLinks` / `purgeDeadLinks` (rag_documents pointing at vanished files), `bootstrapMissingPages` (compile any uncompiled wiki tier), `deleteZombieWikiDocs` (wiki doc rows with no live `rag_wiki_pages` row + their orphan tags), `scanOrphans`/`runHealthScan` (the read-only counts that feed the badge), `syncWorkspaceRoots` + `validateActiveConfigPaths` (config invariants). All idempotent.

**Triggers (today):** every boot (`syncWorkspaceRoots`, `validateActiveConfigPaths`, `bootstrapMissingPages`, `deleteZombieWikiDocs`); after every document delete / dead-link purge / orphan sweep; the Ingest-tab buttons ("Purge N dead links", "Sweep N orphans").

**Outputs (today):** boot log lines (`[Boot] …`), the Ingest-tab health badge, summary alerts.

**To add:**
- **Hive visibility** — a Validation agent card on the Hive dashboard: last sweep, what it found/fixed, health trend (a sparkline of orphan-tag / dead-link / sourceless-wiki counts over the last N sweeps — store a `rag_operations_log` row per sweep so the trend is queryable).
- **Manual trigger from the Hive** — "Run validation sweep now" → runs the full set, returns a per-run report.
- **Per-run report** — structured: tables/rows checked, issues found by type, issues fixed by type, anything that *couldn't* be fixed (flag for manual attention).
- **`sweepOrphans` on boot** — it's currently manual-only; per the boot-self-healing pattern it should run on every boot like the others.
- **A "deep validation" mode (future, LLM-assisted)** — read-only: does each wiki page actually *synthesize* its sources or just enumerate them (the "wiki drift" failure mode)? Are there obvious clusters of docs with no compiled page? Surfaces on the HUD's Pending Actions card. Spec'd in `architecture-v3.md` §"Planned: Audit Pass" — defer until the basic Hive surface ships.

### 4.4 Memory Agent — Honcho (EXISTS, BROKEN)

**Role:** per-thread conversation memory + cross-session insight ("dreams"). Honcho v3: workspace `holocron`, peer `andy`, one session per thread (`thread.json.honchoSessionId`). Messages are saved on every exchange; history is restored on thread load; Reset Context creates a new session and writes the server summary (or a Gemini fallback summary) to the thread's `Memory_*.json`.

**What's broken / missing:**

1. **Compression doesn't fire at 80%.** The MVP P1-D claim was never implemented — the 80% bar is purely advisory. **Fix:** wire the bar to actually call the Reset-Context pipeline at the threshold (with a confirmation prompt, since clearing chat mid-conversation is jarring — or, better, do a *silent* compression that summarizes-and-continues without clearing the visible chat, which is what "compression" should mean as opposed to "reset"). Decision needed (Part 13): auto-compress silently vs. prompt-then-reset vs. leave manual.
2. **The Dreaming Agent is never called.** `DATA_MODEL.md` documents `Memory.dreamInsights[]` with `trigger: "branch" | "thread_load"` and `lastDreamQuery`; the MVP P7 Branch flow says "query Honcho Dreaming Agent for cross-session insights" — but no code path queries it. **Fix:** add a `honchoDream(peer, context)` call that hits Honcho's chat/dream endpoint with the project/Domaine context; call it on (a) branch creation, (b) first thread load of a session, (c) on demand from the Hive and via the `/dream` Telegram command. Persist results to the Memory file's `dreamInsights[]`. **The Dreaming Agent's job:** synthesize patterns across the user's sessions that wouldn't be visible inside any single one — recurring themes, contradictions between threads, "you keep coming back to X across Y projects." **Where it surfaces:** the Hive → Honcho card shows a "N new dreams" badge → click into the **Dreams panel** (Part 5.3) → each dream has timestamp + originating thread/context + Approve (route to Codex as a synthesis document) / Reject / Defer.
3. **Memory is not inspectable.** Write-only relationship. **Fix:** a memory-state panel on the Hive → Honcho page — active sessions by thread, the current server summary peek per session, compression history (from the Memory files), last-updated timestamps, and a *clear-this-session* / *clear-all-Honcho* action with honest copy ("this clears Honcho's server-side memory for this thread — it does not delete the local Memory snapshot").
4. **The "Clear" button still only resets UI state** (architecture-v3 Trust failure #2). It should either clear Honcho for the thread or say plainly "Conversation reset. Honcho memory retained — clear it from the Hive?"

**Model:** Honcho's own deriver/dreamer (server-side). The Reset-Context fallback summary uses Gemini Flash. **Cost tier:** Honcho is self-hosted (Docker); the fallback summary is cheap.

**Reports to:** the Hive's Honcho card.

**Andy interacts:** Reset Context (sidebar), the Hive → Honcho page (inspect / clear / dreams), the `/dream` Telegram command, and the Working Memory panel (Part 9 — "Memory active: last updated 3 days ago", one click to the Honcho page). And — the *deeper* question (Part 13): is Honcho the right long-term memory layer at all, or should we build a native, fully-inspectable/editable/clearable memory store?

### 4.5 Hermes — Relay Agent (NOT BUILT)

**Role:** route messages and requests between *channels* (Telegram, iCloud Drive, in-app) and *agents*. Three jobs:

1. **Telegram bridge.** Andy sends a message from his iPhone → Hermes (a long-running listener in the main process, or a tiny Cloudflare Worker that writes to a file — see below) receives it → routes it: a plain message goes to the active thread's Honcho session and gets a Claude Sonnet reply back via Telegram; a `/command` is dispatched per Part 10.3. **Auth pattern (not hardcoded tokens):** the bot token lives in Settings → Connections (like the Firecrawl/Gemini/Anthropic keys, persisted in `holocron-config.json`); Hermes only responds to Andy's Telegram user ID, also stored in config (not a hardcoded number). The token never goes in source or env files committed to the repo. **Honcho connection:** Telegram-originated messages attach to the *active thread's* Honcho session by default (so a phone reply continues the desktop conversation), with `/note` and `/ingest` being the exceptions that route elsewhere (to the active thread's Notes file / the Foundry queue respectively).
2. **iCloud Drive watcher.** Watches a designated iCloud-synced directory (configured in Settings — e.g. `~/Library/Mobile Documents/com~apple~CloudDocs/Agenteryx Inbox/`) for new files via chokidar (polling, same config as the workspace watcher per `gotcha.md`) → routes each new file to the **Foundry triage queue** (not directly to the Codex — nothing bypasses Review) → optionally notifies Andy via Telegram ("new file in the inbox: `notes.md` — triage queued"). This is the v3 "iCloud helper" item, finally given a home.
3. **Inter-agent router.** When one agent needs another (Synthesis Agent decides a document is stale and wants Ingestion to re-process it; Foundry's Triage Agent wants the Ingestion Agent to pre-tag a candidate before Review), Hermes coordinates the hand-off and the eventual callback. Today these are direct function calls; Hermes makes them explicit, queued, and observable — which is also the seed of the Orchestrator (Part 4.7).

**Build note:** **do not build on Ilya's code.** Borrow the *relay pattern* only — a thin dispatcher that normalizes inbound events into a common shape (`{ channel, sender, kind, payload }`), routes by kind, and posts results back to the originating channel. The whole thing is a few hundred lines.

**Model:** Hermes itself is plumbing (no LLM). The replies it relays come from Claude Sonnet (chat) or the relevant agent.

**Reports to:** the Hive's Hermes card — Telegram connection status, the iCloud watch directory + last-seen file, recent messages/files routed, a "Configure" button (token, user ID, watch dir).

**Andy interacts:** mostly *through* Hermes (from his phone), not *with* it; the Hive page is for setup and status.

### 4.6 The CoPaw Pattern — Auto-Capture (NOT BUILT)

**Role:** the compounding loop that makes Honcho smarter over time *without* explicit memory management. After every agent response in chat, silently scan the output for key facts — bullet patterns, numbered lists, named entities, decisions ("we decided X", "the deadline is Y", "Andy prefers Z") — and write them as Honcho memory entries tagged with thread / project / Domaine. No user action; the loop just runs.

**Based on:** the auto-capture in Ilya's `copawStore.ts` (~lines 960–1111) — the *pattern* (post-response scan → extract → store), not the code.

**Triggers:** the chat response handler, after each assistant message lands.

**Inputs:** the assistant's response text + the current thread/project/Domaine context.

**Outputs:** Honcho memory entries (and, if we go native-memory, rows in whatever store replaces it). Cheap heuristic extraction first (regex for bullets/numbers/decisions); a Gemini-Flash "pull the 3-5 durable facts from this" pass is the upgrade if heuristics are too noisy/sparse.

**Model:** heuristic (no LLM) v1; Gemini Flash v2. **Cost tier:** free → cheap.

**Implementation size:** ~50 lines in the chat response handler. **When to build:** alongside the Honcho compression fix (Session 2/3) — they're the same surface (the chat-memory loop) and the auto-capture only matters once Honcho memory is actually doing something.

### 4.7 Orchestrator — NOT BUILT

**Role:** the coordinator. Decides which agent runs when and in what order, handles failures and retries, maintains a job queue, prevents thundering-herd (e.g. don't fire 50 wiki compiles at once during Sync workspace — there's already an ad-hoc `isCompiling` mutex + `recentIngestIds` batch in `ragWiki.ts`; the Orchestrator generalizes that).

**For now: implicit.** Each agent is triggered independently — chokidar fires the Ingestion Agent, the ingest tail fires the Synthesis Agent's wiki compile, boot fires the Validation Agent, etc. There's no central queue. **A formal Orchestrator is Phase 5** — once Hermes exists (it's already half an Orchestrator: the inter-agent router) and there are enough agents that ordering matters.

**What the Hive's job-queue display would show (when it exists):** pending jobs (agent, trigger, payload, queued-at), running jobs (with elapsed time), recent completions (success/fail, duration, cost), and a "pause all agents" kill switch. Until then, the Hive shows per-agent recent-runs lists, not a unified queue.

---

## Part 5: The Hive

A top-level nav tab — **not** a Settings sub-page. The agent control room.

### 5.1 The Dashboard (landing page)

A grid of **per-agent monitoring cards**, one per agent (Ingestion / Synthesis / Validation / Honcho / Hermes, plus Orchestrator when it exists). Each card shows:

- **Status** — healthy (green) / warning (amber) / error (red), with a one-line reason for non-green.
- **Last run** — timestamp + what it processed ("ingested `SR 17 …`, 6 tags" / "compiled `astrastrata/prds/_project`" / "swept 0 orphans" / "no new dreams" / "relayed 2 Telegram messages").
- **Cost attribution by Domaine** — a tiny stacked bar or sparkline of this agent's spend split by Domaine (from `rag_operations_log` joined through namespace → domaine). Honcho/Hermes/Validation are ~free; the bar is mostly Gemini + Sonnet.
- **Alert badge** — when the agent needs attention: a new Honcho dream, a validation error that couldn't be auto-fixed, a Telegram message waiting because the bot is misconfigured, a doc that failed ingestion 3× (the red-X set). The badge also bubbles up to the Hive tab in the nav bar.

Above the cards: a system summary line (total spend today vs. `rag_config.daily_budget_usd`, total docs / wiki pages / syntheses, last ingestion). Below: a "pause all agents" toggle (kill switch — stops chokidar-triggered ingestion + the wiki compile queue + Hermes listeners).

### 5.2 Per-Agent Landing Pages

Click an agent card → its dedicated page.

- **Gemini Flash (Ingestion)** — ingestion queue (pending + in-flight), recent runs (table: file, source_type, tags extracted, duration, cost, status), per-file tag quality (the collapse-heuristic flag), cost by Domaine. A "Retry all failed" action (the same set as the Ingest-tab button).
- **Claude Sonnet (Synthesis)** — wiki compilation history (which slug, which tier, when, cost), synthesis documents generated (list → click to preview in Codex), a "regenerate this wiki page" / "trigger a synthesis" launcher, cost by Domaine.
- **Validation** — recent sweep reports (each: tables checked, issues found by type, issues fixed by type, anything unfixable), the health trend sparkline (orphan tags / dead links / sourceless wiki over the last N sweeps), a "Run validation sweep now" button.
- **Honcho** — active sessions by thread (with the current server-summary peek and last-updated), compression history (from the Memory files), a clear-session / clear-all action with honest copy, and **the Dreams panel** (5.3).
- **Hermes** — Telegram connection status (connected / not configured / error), the iCloud watch directory + last-seen file + a "scan now" button, recent messages/files routed (table: channel, sender, kind, routed-to, when), and a Configure section (bot token, allowed user ID, watch directory).

### 5.3 The Dreams Panel

Where the Honcho Dreaming Agent's output surfaces (lives on the Hive → Honcho page; the badge also shows on the Hive tab and the Honcho card). A new dream → alert badge. The panel: a list of dreams, each with **timestamp**, **the thread/context it came from** (clickable), and the dream text (expandable). Per-dream actions:

- **Approve** → the dream becomes a synthesis document: the Synthesis Agent (Sonnet) writes it up as `_Library/Syntheses/<slug>.md` + a `rag_syntheses` row (`synthesis_type = 'honcho-dream'`, see Part 7.5), it gets ingested, it shows up in Codex → Syntheses and in the Graph.
- **Reject** → discard (logged so it doesn't resurface).
- **Defer** → keep in the panel, no badge.

### 5.4 Future Hive Expansion (flag, don't spec)

- Claude Code session management — capture/route coding-session logs (the v3 §"open question 5"), launch/monitor Claude Code runs from inside Agenteryx.
- Terminal integration.
- Custom agent builder — define per-Domaine agent roles (an AstraStrata agent with property-management context vs. a personal-research agent).
- Multi-agent orchestration — Agenteryx-level: the Hive becomes the cockpit for agents that span modules, not just Holocron's five.

---

## Part 6: The Foundry

The intake pipeline (was "The Intake" in v3 — see Part 2 for the rename). A top-level tab. **Nothing enters the Codex except through here** (or a legacy direct file-drop into a thread folder, which still works but isn't the encouraged path).

### 6.1 The Four-Stage Pipeline

**Capture → Triage → Review → Admit** (from v3 §4.3, now with implementation detail):

1. **Capture** — content arrives via any source (6.2). Stored in a Foundry holding area — *not* `rag_documents` yet. A new table `foundry_items` (or a `staging` flag on `rag_documents` — see Part 13) holds: `id`, `source` (firecrawl/paste/icloud/telegram/upload/youtube), `source_url` or `source_path`, `raw_content`, `captured_at`, `status` (captured / triaged / reviewing / admitted / rejected), and the triage output once it runs.
2. **Triage** — the Triage Agent (6.3) reads the captured content and writes proposed tags, a proposed Domaine, a quality/signal score, a noise/signal assessment, and a list of suggested connections to existing Codex content.
3. **Review** — Andy sees the captured content + the triage output in the Review interface (6.4). He can edit the tags, change the Domaine, click connection suggestions to preview the target doc, and then Approve / Reject / Edit-then-Approve.
4. **Admit** — on Approve, the content becomes a Raw `rag_documents` row (its content also written to disk — to `_Library/References/<slug>.md` if it's general reference, or to a thread folder if Andy assigned it to one), the ingestion pipeline runs (the agent's pre-extracted tags can seed it), it gets wiki compilation on the next per-ingest trigger, and it appears in the Graph. Admitted documents are treated identically to manually-uploaded ones from there on.

### 6.2 Capture Sources

- **Firecrawl web scraping** — API key already in Settings → Connections. "Scrape a URL" in the Foundry: paste a URL → Firecrawl returns markdown → lands as a captured item.
- **Paste-a-URL (in-app)** — a paste field in the Foundry that triggers the Firecrawl path (or a lighter readability-extract for simple pages).
- **iCloud drop zone** — Hermes watches the configured iCloud directory and routes new files here (Part 4.5).
- **Telegram drop** — `/ingest <URL>` or a file sent via Telegram → Hermes routes it to the Foundry queue (Part 10.3).
- **Manual file upload** — the existing "+ Ingest file…" picker, unified here. (The Codex → Ingest "+ Ingest file…" button can stay as a power-user shortcut, but the Foundry is the front door.)
- **YouTube transcript extraction** — future. Paste a YouTube URL → fetch the transcript via the YouTube API (no download) → captured item. Flag, don't build in the first Foundry session.

### 6.3 Triage Agent

**Model:** Gemini Flash (it's bulk, fast, cheap — and the *user* is the final gate, so the agent doesn't need to be careful, just fast). **Cost tier:** cheap.

**What it does:** read the captured content; output `{ proposed_tags: string[], proposed_domaine: string|null, quality_score: 0..1, signal_assessment: string, connections: [{ doc_id, doc_title, why }] }`. Connections are found by extracting the candidate's likely tags and querying `rag_document_tags` for overlap (the same `recomputeTagOverlap` logic, run hypothetically before admission), plus a tsvector search of the candidate's text against existing docs. **Speed:** sub-second to a few seconds per item; runs automatically as soon as an item is captured (so by the time Andy opens the Review interface, triage is done).

**Reports to:** the Hive (it's a sub-mode of the Ingestion/Gemini agent, or its own small card — TBD; probably its own card since it's a distinct trigger and surface).

### 6.4 Review Interface

What Andy sees per captured item: the captured content (rendered markdown, scrollable), and a side panel with the triage output — proposed tags (chips, editable: remove, add, rename), proposed Domaine (a dropdown of Domaines, defaulting to the agent's pick, with "none / general reference" as an option), the quality/signal assessment (read-only, informational), and the connection suggestions (each clickable → previews the target document inline, like the Codex preview pane). Actions: **Approve** (admit as-is), **Reject** (discard — logged), **Edit-then-Approve** (the edits to tags/Domaine carry into admission). A queue view shows all captured items with their status; the badge on the Foundry tab shows the count of items in `captured`/`triaged` state awaiting review.

### 6.5 Admission

On Approve: content → `rag_documents` Raw row + a disk file (`_Library/References/<slug>.md` or the assigned thread folder); the Ingestion Agent runs (seeded with the triage tags, so it's not re-extracting from scratch — though it can still adjust); `recomputeTagOverlap` writes the relationships; the per-ingest wiki trigger fires; the Foundry item moves to `admitted`; it appears in Codex → Search / Wiki (eventually) / Graph. On Reject: the item moves to `rejected` (kept in the queue's "rejected" filter for a while so Andy can undo, then GC'd).

---

## Part 7: The Syntheses Tab

Currently empty (`enabled: false`). What it becomes: the **cross-domain intelligence output layer**.

### 7.1 What Syntheses Is

Not raw documents — that's the Codex's Raw layer (Ingest tab / Search). Not wiki pages — those are per-namespace topical summaries (Wiki tab). **Syntheses are agent-generated analytical documents that find connections, gaps, and emergent themes *across* the knowledge base** — the things no single wiki page captures because they span Domaines/projects. The Syntheses tab is two halves: an **analytics panel** (the graph-theory readout) and a **synthesis-document library** (the Sonnet-written artifacts).

### 7.2 Graph Analytics Feed (InfraNodus-style)

Implement these on top of the existing graph data (`rag_documents` as nodes, `rag_relationships` as edges) using **`graphology` + `graphology-metrics` + `graphology-communities-louvain`** (or hand-roll Brandes + a modularity-optimization pass — see Part 13; `graphology` is ~50 KB and gives all of this for free, but it's another dep on top of d3).

- **Betweenness centrality (Brandes' algorithm)** — for each node, how often it sits on a shortest path between two other nodes. High-BC nodes are the structural bridges — the documents that connect otherwise-separate parts of the knowledge base. Used for: node sizing in the graph (Part 8), and a "most connective documents" list in the analytics panel. Brandes is ~O(VE); fine at < 500 nodes (Andy's corpus is ~30–200).
- **Louvain community detection** — partition the graph into clusters by *actual connectivity*, not Domaine membership. These are emergent topics — a cluster might pull together AstraStrata leasing docs *and* a personal-research note *and* an AI doc if they share enough tag-overlap edges. Used for: the color-by-community visual (Part 8), and "your knowledge base currently has N communities" in the panel. Each community gets an AI-generated name from the Synthesis Agent (4.2).
- **Structural-gap detection** — pairs of communities with *low inter-cluster connectivity* (few or weak edges between them relative to their internal density). These are the "you have two bodies of knowledge that should talk and don't" gaps — what InfraNodus surfaces as "bridge these ideas." For each gap: the two community names, the gap "size" (inverse of inter-cluster edge weight), and a hook for the Synthesis Agent to write a gap-bridge document.
- **Topical diversity score** — a single number: is the knowledge base over-concentrated (one giant community, everything connected to everything → low diversity, you're in a rut) or over-dispersed (many tiny isolated communities → high diversity but no synthesis happening)? Something like the entropy of the community-size distribution, or modularity itself, with a plain-language band ("focused" / "balanced" / "scattered") and a recommendation ("you've been deep in AstraStrata for a while — the Personal Domaine hasn't grown; consider…").

**Where this runs:** computed on demand when the Syntheses tab opens (or the Graph tab if Theme 2 is active), cached until the next ingestion. Not on every render — the graph can be a few hundred nodes and Louvain + Brandes are not free.

### 7.3 The Syntheses Analytics Panel

What Andy sees: the **community clusters** (each with its AI-generated name, member count, and the Domaines its members span), the **most influential documents** (top-N by betweenness centrality, clickable to preview), the **structural gaps** (each with the two cluster names, the gap size, and a "write a bridge document" button → Synthesis Agent), and the **topical diversity score** with its band + recommendation. This panel is the "InfraNodus dashboard" for Andy's own knowledge.

### 7.4 Synthesis Documents

Agent-generated, written to `_Library/Syntheses/<slug>.md` (a new directory, sibling to `_Library/Wiki/` — created on first synthesis) **and** stored in `rag_syntheses`. They're treated like Raw documents from then on (ingested, tagged, in the Graph). Types:

- **Gap bridge** — "Here's a research question / project idea that connects cluster A and cluster B."
- **Theme synthesis** — "These N documents share an emerging theme: X. Here's the through-line."
- **Cross-domain connection** — "Your AstraStrata work on X connects to your AI research on Y."
- **Honcho dream** — an approved dream from the Hive Dreams panel, written up by the Synthesis Agent.

Each is a normal markdown document with a frontmatter block recording its provenance (`synthesis_type`, source cluster IDs / gap ID / source doc IDs / dream ID).

### 7.5 The `rag_syntheses` Table

Current schema (migration 001): `id`, `title`, `query`, `content`, `source_doc_ids` (array), `captured_back` (boolean — suggests a two-stage compose→review→capture flow that was never wired), `captured_at`, `created_at`.

**Proposed schema additions** (migration 008):
- `synthesis_type TEXT` — `'gap-bridge' | 'theme' | 'cross-domain' | 'honcho-dream'`.
- `source_clusters JSONB` — the Louvain community IDs (and names) this synthesis draws on (null for dream-derived).
- `gap_id TEXT` — the structural-gap identifier this synthesis bridges (null unless `synthesis_type = 'gap-bridge'`).
- `dream_id TEXT` — the originating Honcho dream (null unless `synthesis_type = 'honcho-dream'`).
- `disk_path TEXT` — `_Library/Syntheses/<slug>.md` (mirrors the wiki-page disk-path convention; lets the boot self-healer treat syntheses like wiki pages — a synthesis row with no disk file, or a disk file with no row, is a fixable invariant violation).
- `domaine_id UUID` — nullable; cross-Domaine syntheses are NULL, single-Domaine ones get set (so the Syntheses tab can be Domaine-filtered like the others).

Keep `query` and `captured_back` for now (the `query`-anchored "capture a chat answer back to syntheses" flow is still a reasonable future feature — Part 13).

---

## Part 8: The Graph Overhaul (Phase 2)

What changes once graph analytics (Part 7.2) exist. The d3-force renderer (`Graph.tsx`) stays; the *data feeding it* and *what it encodes* change.

### 8.1 Visual Changes

- **Color by Louvain community**, not Domaine — a *soft gradient palette* (community-N gets a hue stepped around a muted wheel), not a rainbow. (Domaine color is still available as Theme 1.)
- **Node size by betweenness centrality**, not degree — so the structural bridges are the big ones.
- **The living-cell aesthetic, sharpened:** the highest-BC nodes (the "organelles") sit toward the center (give them a stronger pull to the centroid in the force layout, or post-position them), with the satellite documents orbiting. The largest nodes approach near-white; smaller nodes are progressively more saturated color — so brightness reads as influence.
- **Selected node spotlight:** bright white glow on the selected node, connected nodes brighten, **everything else dims to near-invisible** (more aggressive than the current ~0.12 dim — when you're inspecting one node you want the rest to almost disappear).
- **Zoom behavior fix.** Per the user's note the current behavior is *inverted*: zooming **out** should show the full constellation with labels on the high-BC nodes only (the big readable hubs); zooming **in** should spread the graph and reveal progressively more labels. (Today raw-doc labels appear *past* a zoom threshold — verify which direction is wrong and flip it; the intent is "zoomed out = see the structure, zoomed in = see the detail.")
- **Structural gaps visualized** — faint dashed lines between cluster centroids for the gaps the analytics found, so the "these two clusters should talk" insight is visible on the graph itself, not just in the panel.

### 8.2 Graph Themes

A theme selector in the Graph toolbar (persisted in `graphStore.graphTheme`):
- **Theme 1 — "Cell" (current):** Domaine-colored, physics-driven, node size by degree, dark `#0a0a0f`. The default until analytics ship.
- **Theme 2 — "Constellation":** Louvain-community-colored, betweenness-sized, gap lines, the sharpened living-cell brightness mapping. The new default once Part 7.2 lands.
- **Theme 3 — future:** TBD per the Fey design direction (a lighter "Blueprint" or "Minimal" look). Flag, don't spec.

---

## Part 9: Working Memory Panel

Replace the token counter (which shows *output* chunk count, not input/context size — the v3 Trust failure #1) with the Working Memory model from `architecture-v3.md` §4.5 — a small persistent panel near the chat input:

- **Active session** — duration + exchange count. "This conversation: 47 min, 23 exchanges."
- **Grounded in** — the documents currently in RAG context for this thread, by name, clickable (clicking previews the doc). This is the trust win: distinguishes "this answer came from my AstraStrata docs" from "this answer is Claude floating on training data." (Requires the chat path to record which docs it pulled into context per response — a small instrumentation add.)
- **Memory active** — Honcho state at a glance: "Active — last updated 3 days ago." One click → Hive → Honcho page (inspect / clear).
- **Coherence signal** — qualitative, not a number: **Fresh** / **Extended** / **Long session — consider a checkpoint**. Maps to compression count + exchange count + (eventually) a real input-token estimate. (If we want a number under the hood for the threshold, compute it honestly — system prompt + RAG context + chat history, not the streaming chunk count.)

---

## Part 10: Mobile + Telegram Integration

### 10.1 The iCloud Workflow

Andy's iPhone workflow: create a note in iOS Notes / Files (or save anything to the designated iCloud Drive directory) → Hermes's iCloud watcher (4.5) detects it → routes it to the Foundry triage queue (or, for a `.txt`/`.md` that's clearly a question rather than a document, optionally fires it at Honcho and replies via Telegram — a heuristic, configurable). The point: *capture from the phone without an app* — the file system + iCloud is the transport, Hermes is the bridge.

### 10.2 Telegram Bot Setup

What needs building: (1) **bot creation** via BotFather (Andy does this once, gets a token); (2) **token storage** in Settings → Connections (alongside Firecrawl/Gemini/Anthropic — persisted in `holocron-config.json`, never in source/env-committed); (3) **the allowed-user-ID setting** (also in config — Hermes only responds to Andy's Telegram user ID, never a hardcoded number); (4) **Hermes's bot handler** — a long-poll or webhook listener in the main process that normalizes inbound Telegram updates into the relay shape and dispatches; (5) **command routing** (10.3). Connection status (connected / not configured / error) shows on the Hive → Hermes page.

### 10.3 Telegram Commands

Initial set:
- *(plain message)* → routes to the **active thread's Honcho session**, replies with Claude Sonnet (so a phone reply continues the desktop conversation).
- `/ingest <URL>` → Firecrawl that URL → land it in the **Foundry queue** (reply with "captured — triage queued"). A file sent to the bot does the same (route to Foundry).
- `/dream` → trigger the Honcho **Dreaming Agent** for the active thread's context → reply with the latest dream summary (and it also lands in the Hive Dreams panel).
- `/status` → reply with system health: today's spend vs. budget, last ingestion, which agents are healthy/warning/error, doc/wiki/synthesis counts.
- `/note <text>` → append `<text>` to the **active thread's Notes file** (`Notes_[Project]_[Thread].md`), reply with "noted."

Future commands flagged, not built: `/search <query>` (RAG search → top hits), `/wiki <topic>` (return a wiki page), `/draft <prompt>` (start a brain dump).

---

## Part 11: The UI Overhaul Direction

### 11.1 The Fey Aesthetic

`themes.ts`'s Fey work is deferred (uncommitted in the working tree — *do not commit, do not modify* until Andy explicitly returns to it; `docs/Fey design.md` has the 4-phase plan). The direction is set: clean, minimal, dark, data-forward, high contrast on key metrics, subtle animations (à la fey.com). **Don't implement now** — flag for a dedicated UI session. The pieces in v4 (the Hive cards, the Foundry, the Syntheses panel, the Working Memory panel) should be built *functional first*, then re-skinned in the Fey pass — not blocked on it.

### 11.2 Priority UI Improvements (before the full Fey overhaul)

- **Graph:** the zoom-behavior fix (currently inverted), color-by-community, the selected-node spotlight (these come for free with the Part 8 work).
- **Working Memory panel** replacing the token counter (Part 9).
- **Hive agent cards** (Part 5.1).
- **Tab drag-to-reorder** (Part 3).

### 11.3 Code Health Pass

Before the UI overhaul (Session 8):
- **Dead-code audit** — `EditDomaineModal` (unreferenced) and a sweep for anything else now unused (especially post-Cytoscape; `react-cytoscapejs` and `cytoscape-cola` are gone from `package.json` but check for orphaned helper files / dead imports).
- **Dependency audit** — what else is unused now? Run a `depcheck`-style pass.
- **Pre-existing tsc errors** — a dedicated triage of the ~7–10 known errors in the `HANDOFF_v13.md` table (the `withRagClient` `number|null` in `cleanupOps`, `config.gemini` on `HolocronConfig`, the mammoth/pdf-parse `convert.ts` ones, `HUD.tsx`'s `'dashboard'` literal, the renderer ones). Several are one-liners; do them all in one pass.
- **Bundle-size analysis** — identify the largest contributors post-d3-swap; decide whether to switch `import * as d3` to per-submodule imports before adding `graphology`.

---

## Part 12: Sequencing — Next 8 Sessions

In order. Each builds on the prior; the rationale is "establish the analytics + memory foundations first (they unlock the Syntheses tab, the Hive, and the smarter agents), then the new surfaces (Hive, Foundry, Hermes), then the visual/UX polish, then code health."

**Session 1 — Graph analytics + Syntheses tab foundation.** Add `graphology` + `graphology-metrics` + `graphology-communities-louvain` (or commit to hand-rolling — decide first, Part 13). Compute betweenness centrality + Louvain communities + structural gaps + topical diversity over `rag_documents`/`rag_relationships`. Stand up the Syntheses tab with the analytics panel (community clusters, most-influential docs, gaps, diversity score) — `enabled: true` at last. *Why first:* it's self-contained (read-only over existing data), it's the highest-leverage new capability (turns the graph from pretty into useful), and Sessions 6 (graph visual overhaul) and 3/Hive depend on having the community/BC data.

**Session 2 — Honcho fixes.** Wire compression at the 80% threshold (decide silent-compress vs. prompt-then-reset first, Part 13); implement `honchoDream()` and call it on branch / first-thread-load / on-demand, persisting to the Memory files; build the Honcho memory-inspection panel (active sessions, summary peeks, compression history, honest clear actions). Fix the "Clear" button's copy. *Why second:* the memory layer is broken in ways that mislead the user (v3 Trust failures #2 + #6), and the Hive (Session 3) needs the Honcho page to surface; the Dreaming Agent's output feeds the Hive Dreams panel and the Syntheses tab.

**Session 3 — CoPaw auto-capture + Hive foundation.** The ~50-line CoPaw post-response key-fact extraction → Honcho memory (it only matters now that Honcho memory does something, post-Session-2). Stand up the Hive tab: the dashboard with per-agent cards (Ingestion / Synthesis / Validation / Honcho — Hermes comes in Session 5), per-agent landing pages, the Honcho Dreams panel (Approve → synthesis document), and the Validation agent's Hive surface (recent sweeps, health trend, "run sweep now"). Also: `sweepOrphans` on boot (per the self-healing pattern). *Why third:* the Hive is the home for everything Sessions 1–2 produced (validation reports, dreams) and everything Sessions 4–5 will produce (Foundry, Hermes status).

**Session 4 — Foundry foundation.** The Foundry tab: the `foundry_items` holding area (or staging flag — decide, Part 13), Firecrawl integration (the key's already in Settings), the in-app paste-a-URL, the Triage Agent (Gemini Flash → proposed tags/Domaine/quality/connections), the Review interface (content + triage side panel + Approve/Reject/Edit-then-Approve), and Admission (→ Raw doc + disk file + ingestion + Foundry-item state). Manual file upload unified here. *Why fourth:* it's the first new *content-ingress* surface; it depends on the ingestion pipeline (exists) and benefits from the Hive existing (the Triage agent gets a card). YouTube transcript extraction deferred to a follow-up.

**Session 5 — Hermes foundation.** The Telegram bot (BotFather setup docs, token + allowed-user-ID in Settings, the main-process listener, command routing per 10.3), the iCloud-Drive watcher (configured directory → Foundry queue, with optional Telegram notification), and the inter-agent router (normalize → route → callback — the seed of the Orchestrator). Hermes's Hive card + Configure page. *Why fifth:* it depends on the Foundry queue existing (Session 4 — `/ingest` and the iCloud watcher route there) and on the Hive (Session 3 — Hermes's status surface).

**Session 6 — Graph visual overhaul.** The Part 8 changes: color-by-community (soft gradient), size-by-betweenness, the sharpened living-cell brightness mapping (high-BC near-white, satellites saturated), the selected-node spotlight (aggressive dim), the zoom-behavior fix (un-invert it), structural-gap dashed lines, and the graph-theme selector (Cell / Constellation / future). *Why sixth:* it consumes Session 1's analytics; it's pure renderer work; doing it after the analytics + Syntheses panel exist means the panel and the graph stay consistent.

**Session 7 — Working Memory panel + UI polish.** **DONE (split across two passes).** First pass: References/ folder removed as a destination, file-resurrection race fixed (ragIngest wikilink writeback guarded with fs.stat + is_active), Scribe sidebar Expand-all recurses, AnchoredDropdown shared component, Validation card schema fix (kind/payload → operation/details), triage content cap removed, large-doc 20K warning. Second pass: auto-delete iCloud Inbox after Foundry admission, Domaines nav state persistence (same-tab-click=reset / cross-tab-switch=restore per Part 3), multi-select Domain filter on the Graph (AnchoredMultiSelect + `domaineIds: string[]` IPC chain), Working Memory panel replacing the streaming-tokenCount display. "Grounded in" pane explicitly deferred (requires retrieval instrumentation). Full chapters in `HANDOFF_v19.md` (first pass) and `HANDOFF_v20.md` (second pass + UI Overhaul plan).

**Session 8 — UI Overhaul.** The Three Changes per Part 14: slim chat chrome (consolidate agent selector + Memory + Reset + Working Memory into one ⚙ slide-out panel; thin context bar; reduce title bar height); vertical sidebar navigation (48 px icon strip → 160 px expanded with labels, replaces the horizontal tab bar; persist collapse state in `sessionStore`; breadcrumb relocates to Scribe sub-header); chat message redesign (remove bubbles from user messages, right-align with subtle tint, sticky user-message header while scrolling the agent reply, verify markdown rendering). Implementation order: **Part A (slim chrome) → Part B (sidebar nav) → Part C (chat redesign).** *Why now:* the trust + memory + Foundry + Hermes layers are real; what's slowing daily use is chrome consuming 180–200 px of vertical real estate. Antigravity-style thin chrome is the next 10x for daily usability. Full spec in Part 14 below; concrete plan + concerns + pushback list in `HANDOFF_v20.md`.

**Session 9 — Code health.** Dead-code audit (`EditDomaineModal` + post-Cytoscape orphans), dependency audit (`depcheck`), the pre-existing tsc-error triage pass (all ~10 in one go), bundle-size analysis (and the `d3` per-submodule-import decision before any future dep adds), filesystem-side test harness for Session 6/7 main-process work (move-to-thread, approveItem, wikilink-writeback guards), consolidate the `config.gemini` / `config.anthropic` workaround pattern (now in 4 places). *Why last:* it's maintenance, not feature work; doing it after the UI overhaul means the audit catches everything the new code rendered dead, and it's a natural "close the chapter" session before whatever v5 is. Originally scheduled as Session 8 — pushed to Session 9 by the UI Overhaul. The tsc errors are pre-existing and not actively blocking; this isn't urgent.

*(Beyond Session 9: the Orchestrator (Phase 5), web research integration (v3 §4.6), the deep-validation LLM audit pass, YouTube transcripts, the Fey UI overhaul, Claude Code session management in the Hive, document lifecycle states / batch import from Codex — none scheduled here; revisit after the agent layer is real.)*

---

## Part 13: Open Questions

Decisions needed from Andy. The ones that gate a Session are flagged.

1. **`graphology` vs. hand-rolled graph analytics.** *(Gates Session 1.)* `graphology` + `graphology-metrics` + `graphology-communities-louvain` ≈ 50 KB, gives betweenness/Louvain/more for free, well-tested. Hand-rolling Brandes (~40 lines) + a modularity-optimization pass keeps the dep count down (you're already adding nothing — d3 is in). Tradeoff: dep weight + a second graph lib alongside d3, vs. ~100–150 lines of algorithm you own and must test. Recommendation: **`graphology`** unless bundle size is a hard constraint — the time saved is real and the algorithms are subtle (Louvain especially).

2. **Honcho compression behavior at 80%.** *(Gates Session 2.)* Options: (a) **silent compress-and-continue** — summarize the old turns, keep the visible chat, drop the old turns from the model's context (true "compression"); (b) **prompt-then-reset** — at 80%, ask "compress this conversation?" and if yes, run the existing Reset-Context flow (clears the visible chat); (c) **leave it manual** — the bar stays advisory, Reset Context stays the only path. Recommendation: **(a)** — it's what "compression" should mean and it's the least disruptive — but it's the most work (the visible chat and the model context diverge). (b) is the cheap version.

3. **Is Honcho the right long-term memory layer?** Honcho gives derivation + dreaming server-side, but it's a black box — you can't fully inspect/edit/clear it, and the v3 trust complaints (#2, #6) are partly *because* it's opaque. The alternative: build a native memory store (Postgres table + a readable/editable/clearable surface) and use the CoPaw pattern + a Gemini-Flash "derive insights" pass to fill it. Tradeoff: keep Honcho (less work, but the opacity problem persists and you don't own the dreaming logic) vs. native (full transparency, you own it, but you reimplement derivation + dreaming, and the Branch flow / Reset Context all need rewiring). This is a *strategic* call — not blocking Session 2 (the fixes in Session 2 help either way), but the bigger fork eventually. Recommendation: **fix Honcho first (Session 2), decide native vs. Honcho after seeing whether the inspection panel + Dreams panel make it feel "owned enough."**

4. **Foundry holding area: `foundry_items` table vs. a `staging` flag on `rag_documents`.** *(Gates Session 4.)* A separate table is cleaner (the schema is genuinely different — triage output, source provenance) but adds a migration + a join. A `staging` boolean on `rag_documents` reuses the existing pipeline (and `is_active` already exists as a soft-delete-ish flag) but muddies what "a document" means. Recommendation: **separate `foundry_items` table** — the lifecycle is distinct enough, and "nothing is a real document until it's admitted" is a clean invariant.

5. **Telegram auth model.** *(Gates Session 5.)* Bot token + allowed-user-ID both in `holocron-config.json` (Settings → Connections), Hermes ignores everyone else. Is that sufficient, or do you want a `/auth <pin>` handshake on first contact too? Recommendation: **config-only is fine** for a single-user personal tool — the user-ID gate is the security boundary; a PIN is belt-and-suspenders you'll never need.

6. **Foundry vs. the existing direct file-drop into thread folders.** The chokidar auto-ingest of any `.md` dropped into `_Domaines/<…>/<thread>/` still works and is fast. Does the Foundry *replace* that (everything must go through Review) or *coexist* (direct drop = "I trust this, skip triage"; Foundry = "triage this")? Recommendation: **coexist** — direct drop into a thread folder is "working material I'm putting somewhere on purpose"; the Foundry is for *external/uncertain* content (web scrapes, iCloud drops, Telegram). Don't force the friction where it isn't needed.

7. **Where do admitted Foundry documents live on disk?** `_Library/References/<slug>.md` for general reference, or always assign them to a thread folder, or a new `_Foundry/admitted/` archive? Recommendation: **`_Library/References/` for general reference, with an optional "assign to thread" in the Review step** — most admitted external content is reference material, not thread-specific working material.

8. **Tab drag-to-reorder default order — keep "Scribe · Codex · Foundry · Hive · HUD · Domaines"?** Or does HUD belong higher (it's the system glance), or Domaines higher (you navigate there a lot at the start of a session)? Recommendation: as proposed — but it's user-reorderable, so this is low-stakes.

9. **Should the Synthesis Agent auto-generate gap-bridge / theme documents, or only on Andy's explicit request?** v3's principle is "the user is the quality gate for anything that mutates the knowledge base" — but a *synthesis document* is additive, not a mutation of existing content. Recommendation: **on explicit request only, initially** (the analytics panel surfaces the gap/theme; Andy clicks "write this"); revisit auto-generation (with a Review step, like the Foundry) once you trust the quality.

10. **`rag_syntheses` schema migration timing.** Migration 008 (the additions in 7.5) — ship it in Session 1 (so the table's ready when syntheses start getting written in Session 3), or Session 3? Recommendation: **Session 1** — migrations are cheap and the table being ready early costs nothing.

11. **The Working Memory "grounded in" instrumentation.** Recording which docs the chat path pulled into context per response requires touching the RAG-retrieval step. Is that step even *doing* retrieval into chat context today, or is chat currently un-RAG'd (just system prompt + history)? *(Needs a code check before Session 7 — if chat doesn't currently retrieve from the Codex at all, "grounded in" needs the retrieval built first, which is a bigger item.)*

12. **YouTube transcript extraction — Foundry source or skip?** Low priority; flagged in 6.2. Decide whether it's worth a follow-up session or out of scope.

13. **The `query`-anchored "capture a chat answer back to Syntheses" flow** (the dormant `rag_syntheses.captured_back` column). Build it (a "save this answer to Syntheses" button on long chat responses → a `rag_syntheses` row + a review step) or drop the column? Recommendation: **keep the column, defer the feature** — it's a natural complement to the CoPaw auto-capture (CoPaw → Honcho memory; this → Syntheses), worth doing once both layers exist.

---

## Appendix: Agent Quick Reference

| Agent | Model | Trigger | Input | Output | Cost tier | Hive surface | Status |
|---|---|---|---|---|---|---|---|
| **Ingestion** | Gemini Flash | chokidar `add`; re-ingest button; "+ Ingest file…"; Sync workspace | doc text + source_path | `rag_documents` + tags + tag-shared edges + ingest event | cheap | Gemini Flash card / page | **Exists, partial** — needs 429/503 retry, `config.gemini` type, tag-quality signal |
| **Synthesis** | Claude Sonnet | wiki: per-ingest + boot bootstrap; synthesis: on-demand (Syntheses tab, approved dream) | raw docs (tier 1), `rag_wiki_pages` (tiers 2/3); clusters/gaps/dreams | `rag_wiki_pages` + `_Library/Wiki/*.md`; `rag_syntheses` + `_Library/Syntheses/*.md`; cluster names | mid | Claude Sonnet card / page | **Exists for wiki** — needs cross-Domaine synthesis, gap-bridge, theme, cluster naming |
| **Validation** | rule-based (no LLM) | every boot; after delete/purge/sweep; Ingest-tab buttons; Hive "run now" | the DB + the filesystem | repairs (orphan/zombie/dead-link sweeps); health counts; per-run report | free | Validation card / page (recent sweeps, health trend) | **Exists as boot sweep** — needs Hive surface, per-run report, `sweepOrphans` on boot |
| **Memory (Honcho)** | Honcho deriver/dreamer (server); Gemini Flash for fallback summary | message exchange; thread load; branch; Reset Context; `/dream`; Hive | chat messages; thread/project/Domaine context | session memory; Reset summaries (Memory files); dreams | ~free (self-hosted) | Honcho card / page (sessions, summary peeks, Dreams panel, clear) | **Exists, broken** — compression doesn't fire, Dreaming Agent never called, memory not inspectable, Clear button cosmetic |
| **Hermes (relay)** | none (plumbing); relays Sonnet replies | Telegram update; iCloud `add`; inter-agent request | Telegram messages/files; new iCloud files; agent-to-agent requests | routed messages (→ Honcho / Foundry / Notes / agent); Telegram replies | ~free | Hermes card / page (Telegram status, iCloud watch dir, routing log, Configure) | **Not built** |
| **CoPaw (auto-capture)** | heuristic v1; Gemini Flash v2 | chat response landed | assistant response text + context | Honcho memory entries (key facts) | free → cheap | (folded into the Honcho page) | **Not built** — ~50 lines, build with the Honcho compression fix |
| **Triage** | Gemini Flash | a Foundry item captured | captured content | proposed tags / Domaine / quality score / signal assessment / connections | cheap | Triage card (or sub-mode of the Gemini card) | **Not built** |
| **Orchestrator** | none (coordinator) | — | agent jobs | scheduling, retries, the job queue | free | the job-queue display (when it exists) | **Not built — Phase 5; implicit today** |

---

## Part 14: UI Overhaul — The Three Changes

Added during Session 7 second-pass sign-off after a planning conversation between Andy and the external **Orchestrator-Sonnet** (Claude in claude.ai acting as a brainstorming + orchestration layer for this UI direction — **not** the Phase 5 in-product Orchestrator from §4.7, which is still unbuilt and deferred). Captured here because the chrome consumes ~180–200 px of vertical real estate before a single line of content shows on a tall screen: macOS title bar + horizontal tab bar + chat sub-header (agent selector + Memory ▸ + Reset) + chat footer stack (Working Memory + context bar + input). On wide screens vertical pixels are more valuable than horizontal; Antigravity-style thin chrome is the next 10× for daily usability. Implementation lives in Session 8 (Part 12). Concrete order: **Part A → Part B → Part C**.

### 14.1 — Part A: Slim chat chrome (~30 min)

Quick wins, contained. The Scribe chat region currently has:

- A sub-header row: thread name (`ATX_BUILD ▾`) + download + layout buttons + agent selector pill (`✦ Gemini Flash ▾`) + `Memory ▸` toggle + `⟳ Reset` toggle.
- A Working Memory panel (collapsible, sits above the context bar — built in Session 7 second pass).
- The context bar (`Context: ~428 / 1,048,576 tokens (0%)`).
- The input area + Dump button.

The target chrome:

- **Sub-header row:** breadcrumb on the left (`ATX_BUILD ▾`) + a single ⚙ icon on the right that opens a **slide-out panel** containing the agent selector, Memory inspection, Reset Context, and the Working Memory readout — all session controls in one place.
- **Context bar:** kept (it's already model-aware from Session 2's fix — `gemini.contextWindow` / `anthropic.contextWindow` / `ai.contextWindow` routed by `activeProvider`). Make it ~4 px thinner cosmetically. No semantic change.
- **Input area:** unchanged (already minimal).
- **Title bar:** reduced to minimum height. The MAIN indicator + git controls relocate to the vertical sidebar footer (Part B). The breadcrumb (`Agenteryx / ATX_Build`) moves into the Scribe sub-header row.

The slide-out panel **replaces** the separate `MemoryPanel` drawer (currently triggered by the `Memory ▸` button in the chat header) AND the inline Working Memory panel from Session 7. One drawer for everything session-scoped.

**Slide-out internal organization (recommended).** A flat stack of 4 unrelated controls (agent + memory + reset + working-memory) will feel busy. Recommended layout — three labeled sections inside the drawer:

1. **Session** — Working Memory data (duration + exchanges + coherence) + the `⟲ Reset Context` button.
2. **Memory** — the existing `MemoryPanel.tsx` content (Honcho session id, dream insights, summaries, Dream Now, deep-link to Settings → Maintenance for destructive resets).
3. **Agent** — the provider/model picker (currently the `✦ Gemini Flash ▾` pill).

The existing `MemoryPanel.tsx` (408 LOC, fully built) should be **reused as the Memory section**, not rewritten. Same component, mounted inside the new drawer instead of as a standalone slide-down.

### 14.2 — Part B: Vertical sidebar navigation (~90 min)

The biggest restructure. Replaces the horizontal tab bar in `Shell.tsx` with a left-edge vertical icon strip.

**Dimensions:**
- **Collapsed:** 48 px wide, icons only, hover tooltip shows tab name.
- **Expanded:** ~160 px wide, icons + text labels.

**Collapse state persistence:** `sessionStore.navSidebarCollapsed: boolean` — survives app restarts.

**Contents (top to bottom):**

1. Toggle icon (collapse/expand the sidebar itself — a chevron)
2. HUD
3. Scribe
4. Codex
5. Foundry
6. Hive
7. Domains

Followed by a **footer region** for the MAIN branch indicator + git controls (the v13 controls that currently live in the title bar).

**Tab-order note.** Architecture-v4 Part 3 originally specified the horizontal order as `Scribe · Codex · Foundry · Hive · HUD · Domaines` (draggable). The UI Overhaul plan above lists HUD second (after Toggle). These differ — the next agent should confirm with Andy or default to **Andy's UI Overhaul order** (HUD first since it's the system glance — Part 13 §8 of this doc actually flagged that question and Andy left it open). Going with the UI Overhaul order is the cleaner default.

**The Scribe file explorer (sidebar)** already lives in a left panel and **stays where it is** — it opens to the right of the nav sidebar when Scribe is active. So when both are visible, the layout is `[Nav (48-160px)] [Scribe sidebar] [Editor] [Chat]`.

**Domaines navigation behavior preserved** — the Session-7-second-pass rule (same-tab click on Domaines = `backToIndex()`; cross-tab switch = restore last view) must carry over to the VerticalNav onClick handler.

**The `PanelToggleButton`** (chat collapse toggle, currently in the title bar) needs a new home. Recommended: relocate to the chat sub-header's right edge alongside the new ⚙ icon.

### 14.3 — Part C: Chat message redesign (~45 min)

The current `ChatMessage.tsx` uses chat-bubble styling on user messages (too SMS-like) and plain text on assistant messages.

**Target:**

- **User messages:** right-aligned, **no bubble**. A subtle left border or background tint preserves the "this is me" signal so the conversation rhythm reads correctly. **Recommended:** `max-width: 70%` on the user message text block + right-align so long messages don't span the full chat panel awkwardly on wide screens.
- **Agent responses:** full-width, proper markdown rendering (already working), no bubble.
- **Sticky user-message header:** when the user scrolls through a long agent reply, the user message that triggered the response stays pinned at the top of the viewport (Antigravity / claude.ai pattern). **Implementation:** `position: sticky; top: 0` on the user message wrapper is the simplest mechanism; the chat scroll container is the positioning ancestor. No IntersectionObserver gymnastics required for v1.
- **Markdown rendering verification:** the current renderer handles paragraphs + code blocks fine. Confirm headers (`#` `##` `###`), blockquotes (`>`), and nested lists render with the right styling in the new layout. Inline code chips + fenced code blocks already work.

### 14.4 — Why this order

- **Part A first** (slim chrome) — contained, mostly CSS + a new `<SessionDrawer>` component that REUSES `MemoryPanel.tsx`. ~30 min. Gives a visible vertical-real-estate win on its own.
- **Part B second** (vertical sidebar nav) — biggest structural change (`Shell.tsx` restructure touches every tab routing branch). Building this AFTER the slim chrome means the slim title bar is already the visual benchmark. ~90 min.
- **Part C last** (chat message redesign) — independent of the others; saved for last so the chat experience polish lands on top of an otherwise-finalized layout. ~45 min.

Total scope: ~165 min concrete work + verification. Realistic across one focused session if no surprises.

### 14.5 — Out of scope for the UI Overhaul session

- Fey theme palette (`themes.ts`) — still deferred, do-not-touch, Andy returns explicitly.
- Tab drag-to-reorder — moot now that the navigation is vertical and curated; deferred indefinitely.
- "Grounded in" pane (architecture-v4 §9's fourth Working-Memory row) — still gated on chat-path retrieval instrumentation, not in scope here.
- Per-tab keyboard shortcuts (Cmd-1 .. Cmd-7 to switch tabs) — nice-to-have, not in this session.
- Sidebar drag-to-resize — fixed widths (48 collapsed / 160 expanded) are the spec; don't add a third "custom width" state.

---

*End of Architecture V4 — Prepared May 2026. Part 14 added Session 7 sign-off as the next-session UI spec. Decisions in Part 13 gate Sessions 1, 2, 4, and 5 of Part 12; everything else can be settled during implementation. Sessions 1–7 are now complete (see HANDOFF_v14 through HANDOFF_v20).*
