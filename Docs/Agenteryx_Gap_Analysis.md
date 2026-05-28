# Agenteryx ↔ Dwellium Gap Analysis

**Date:** 2026-05-28
**Source A:** `github.com/Agenteryx/agenteryx` — **PRIVATE** (HTTP 404 on direct URL; the Agenteryx org profile shows 19 repos, 0 publicly visible, so source code is not fetchable without access)
**Source B:** Screenshots Ilya provided in chat (4 of 5 visible tabs + 3 filter dropdowns)
**Source C:** Current `dwellium-per-spec` `main` @ commit `80b7021`

---

## 1. What Agenteryx exposes (observable from screenshots)

### 1.1 Top-level tabs
1. **Search**
2. **Wiki**
3. **Ingest** *(screenshot 1)*
4. **Graph** *(screenshot 2)*
5. **Syntheses**

### 1.2 The three primary axes for filtering documents
| Axis | Values seen |
|---|---|
| **Type** | All Types, Brain Dump, Note, Report, Reference, Wiki, Synthesis, Inbox |
| **Tier** | All Tiers, Thread, Project, Overview |
| **Domain** | (All Domaines), AI_Dev, Creative_Writing, Random |

This is a **3-axis taxonomy** — every document gets a type + a tier + a domain. Tiers map to a hierarchy (Thread < Project < Overview).

### 1.3 Ingest tab
- Document table at the project root: `122 docs · 785 tags · 307,512 rel · 1m ago · ● Clean`
- Columns: `# · TITLE · TYPE · PROJ · TAGS · EDGES · INGESTED`
- Inline status indicators: ✓ ingested, ✗ failed, retry icon, trash icon
- Search by title or path
- "Across all" toggle, "122 of 122 docs" cursor, Refresh, Sync workspace, Retry failed (4), `+ Ingest file…`
- **Right side-pane preview:** rendered Markdown with footnote-style citations `[1]` (the Agenteryx wiki "Project Overview" with bold-headlined paragraphs, key-concept bullets)
- Edit / Download / Delete / Collapse buttons on the preview
- Bottom: collapsible `ACTIVITY LOG ▶` (100 recent events)

### 1.4 Graph tab
- **Force-directed knowledge graph** centered on a selected node (AstraStrata)
- Domain-colored bubbles (AI_Dev cluster, Creative_Writing cluster, AI Research cluster)
- Node size = degree (number of incoming/outgoing edges)
- "Highlight nodes by title…" search input
- "Across all", "Show orphans" toggles
- **Theme · Constellation** dropdown — visual themes (constellation/galaxy/etc.)
- `91 of 122 nodes · 308 edges`, Reset view, Re-layout, Refresh
- Click a node → right pane with: title, file path, KIND, PROJECT, DEGREE (13), DOMAIN (AI_Dev), buttons **Open in Codex** + **Edit in Scribe**, and a **CONNECTIONS (18)** list with edge type (wikilink / tag-shared)
- "Dictating with Wispr Flow" badge — voice-controlled querying

### 1.5 Architecture clues from the doc content visible
- "Holocron PRD", "Local-First / AI-Native Architecture", "uses Electron, PostgreSQL, and a local LLM (Gemma 4 31B)"
- Bibliography-style `[1]` citations rendered inline
- The data shape is essentially: **document → has type, has tier, has domain → has tags → has edges (wikilink, tag-shared, …) → ingested at, status**

---

## 2. What Dwellium currently has (verified by grep against repo)

### 2.1 Scribe (the editor)
- CodeMirror 6 editor + DocumentToolbar + TabBar + Minimap + TableOfContents
- ScribeStore (tabs, file IO, redlines, comments)
- SelectionToolbar (💬 Comment, 🤖 Send to ARA, ✦ Redline) — *shipped this session*
- AraMiniPanel floating top-right *(shipped this session)*
- ContextMenu (Paste/Paste+/Paste++, Markdown submenu) *(shipped earlier)*
- Drag-and-drop: text/HTML, files, URLs, inter-widget bridge *(shipped earlier)*
- Themes (Light/Dark/Solarized, etc.)
- Auto-save
- Resizable boundaries (TOC, Minimap, TabBar)

### 2.2 FileExplorer (Filing Cabinet)
- 3-tier hierarchy: **domain → project → thread** *(matches Agenteryx's Tier axis exactly: Thread / Project / Overview = "domain" at the top)*
- Tree + flat view modes
- Multi-select + drag/drop between folders
- Cmd+V screenshot paste
- Lock + sort dropdown
- Backend at `/api/file-explorer/tree` walking `~/.dwellium/files/<userId>/`

### 2.3 Honcho (inside Stella)
- Tabs: memory-explorer · memory-network · peers-sessions · chat · data-ingestion · ambient · search · memory-map · **dream** · **interactions** · setup *(dream + interactions shipped this session)*
- Memory CRUD via `/api/honcho/memories`
- "Memory Map" (radial canvas, peers + memory-type clusters, edges)
- Honcho-learn daemon: every 15s capture window-title + open widgets + recent files snapshot → POST `/memories/extract`
- Browser-interaction recorder: rolling 200-event buffer per user
- Dream mode: on-demand or 10-min auto LLM synthesis over memories + TW captures

### 2.4 ThoughtWeaver
- Tabs: Capture · **Today** · Dashboard · Timeline *(Today tab shipped this session)*
- 4 buckets: People · Projects · Ideas · Tasks (admin)
- Per-user local persistence (`thoughtWeaverStore` + dynamic-key factory)
- Per-user to-do list with priority + check-off
- Backend at `/api/thought-weaver/capture`

### 2.5 NotebookLM
- NotebookLMContext widget — list/enable/disable user-added notebooks
- Open notebook with `?authuser=<email>` deep-link
- NotebookLM MCP server installed + 32 tools + 35 owned notebooks reachable *(this session)*

### 2.6 TranscriptionHub / Legal Shield
- Real-time audio capture + speaker ID + fact-check + Legal Shield (Georgia code via per-user LLM with code-specific prompt + Consult NotebookLM deep-link button) *(shipped this session)*

---

## 3. Gap matrix (Agenteryx feature → Dwellium status)

| Agenteryx feature | Dwellium status | Gap severity | Notes |
|---|---|---|---|
| **Top tab: Search** (cross-corpus unified search) | ❌ MISSING | **HIGH** | No cross-widget search panel. Per-widget search exists (sidebar search, file explorer) but no unified ranker. |
| **Top tab: Wiki** (rendered Markdown index with footnote citations) | ⚠️ PARTIAL | **MEDIUM** | Scribe renders Markdown, but there is no "Wiki" index view that lists every wiki entry and lets you open one in read mode. |
| **Top tab: Ingest** (document ingestion pipeline with status, retry, edge count) | ⚠️ PARTIAL | **HIGH** | FileExplorer reads `~/.dwellium/files/<userId>/` for storage, ThoughtWeaver captures thoughts, but there's no central **ingest pipeline** that scans a workspace folder, classifies docs, extracts tags + edges + relationships, tracks per-doc ingestion state, retries failures. |
| **Top tab: Graph** (force-directed multi-domain knowledge graph) | ⚠️ PARTIAL | **HIGH** | Honcho Memory Map is a radial canvas with peers + memory-type clusters, ~25 nodes max. NOT a force-directed full-corpus graph showing wikilink + tag-shared edges across all 122-style documents. |
| **Top tab: Syntheses** (LLM-generated cross-document synthesis pages persisted as their own doc type) | ⚠️ PARTIAL | **MEDIUM** | Honcho Dream produces single-shot LLM reflections persisted per user, but they're not first-class "Synthesis" documents indexed in the corpus or filterable as Type=Synthesis. |
| **3-axis taxonomy: Type / Tier / Domain** | ⚠️ PARTIAL | **HIGH** | Dwellium FileExplorer has the 3-tier hierarchy (domain→project→thread = Tier axis). Type and Domain axes are NOT modeled as filterable metadata. Documents have no explicit `type` field. |
| **Type values (Brain Dump, Note, Report, Reference, Wiki, Synthesis, Inbox)** | ❌ MISSING | **HIGH** | None of these types exist in the data model. ThoughtWeaver buckets (People/Projects/Ideas/Tasks) are a different taxonomy. |
| **Document edges (wikilink + tag-shared + custom)** | ❌ MISSING | **HIGH** | No edge model in the file store. Markdown content may contain wikilinks but they're never extracted into a queryable edge table. Honcho memories have a graph of their own that is NOT linked to user documents. |
| **Tags as first-class atoms (785 tags in the screenshot)** | ❌ MISSING | **HIGH** | Tags exist on Honcho memories and ThoughtWeaver items but not on documents. |
| **Doc-level ingestion status (Clean / failed / retry)** | ❌ MISSING | **MEDIUM** | No ingestion pipeline → no status field. |
| **Inline citation rendering `[1]` with sources panel** | ❌ MISSING | **MEDIUM** | Scribe renders standard Markdown but has no first-class citation/footnote primitive. |
| **Graph node theme (Constellation, …) + Reset view + Re-layout** | ❌ MISSING | **LOW** | Memory Map's canvas drawing doesn't expose themes or layout controls. |
| **"Open in Codex" + "Edit in Scribe" actions on graph node** | ⚠️ PARTIAL | **MEDIUM** | "Edit in Scribe" can be wired via existing `dwellium:open-widget` bus we shipped this turn (Stella self-diagnose CTA reused). "Codex" has no equivalent. |
| **Activity log (last 100 events, collapsible footer)** | ❌ MISSING | **LOW** | No global activity log. Per-widget toasts only. |
| **Across-all toggle (search/filter across every workspace)** | ❌ MISSING | **LOW** | All widgets are workspace-scoped today. |
| **Wispr Flow / voice dictation badge** | ❌ MISSING | **LOW** | ARA has TTS voice picker + Humanize but no STT-driven dictation badge in Scribe. |
| **Local LLM via Gemma 4 31B mentioned in Agenteryx doc** | ⚠️ DIFFERENT | — | Dwellium routes to user-configured cloud LLM (OpenAI/Anthropic/Gemini) — same effect, different architectural choice. |
| **Local Electron + PostgreSQL + Redis stack** | ⚠️ DIFFERENT | — | Dwellium is React + RR v7 + Express + SQLite — same local-first ethos, different stack. |

---

## 4. What Dwellium has that Agenteryx (visibly) doesn't

These are present in Dwellium but not in the screenshots — included for fairness, not a gap on the Dwellium side:

- Sidebar with hierarchical Domains panel (3-tier) + click-to-open/close widgets *(this session)*
- Per-user LLM integrations bundle with provider picker *(prior session)*
- ARA voice picker + Humanize toggle + TTS *(this session)*
- PDF Gear: rotate/delete/watermark/page-numbers/extract/compress + 4 client-side conversion formats + LibreOffice backend *(this session)*
- Terminal widget with backend `child_process.spawn` shells *(this session)*
- TranscriptionHub with Legal Shield + fact-check + NotebookLM consult *(this session)*
- App Updates section with git pull + rebuild + restart *(this session)*
- Honcho Dream mode + interactions recorder *(this session)*
- ThoughtWeaver local persistence + Today to-do list *(this session)*
- Multi-window dashboard shell (quadrant snap, saved layouts, drag/dock)

---

## 5. Prioritized closure recommendations

Ranked by **architectural leverage × user-visible value**.

### Tier 1 — Architectural prerequisites (high leverage, must come first)

1. **Document metadata model** (`type` + `tier` + `domain` + `tags[]`). Without this, none of the Agenteryx tabs make sense. Frontmatter convention or sidecar `.dwellium.json` per doc.
2. **Ingestion pipeline** — service that walks `~/.dwellium/files/<userId>/`, parses frontmatter, extracts wikilinks, builds an edge table in SQLite. Per-doc status with retry. Reuses the existing FileExplorer backend.
3. **Edge model** — `(source_doc_id, target_doc_id, edge_type, weight)` table, populated by the ingest pipeline.

### Tier 2 — The five tabs (build on Tier 1)

4. **Wiki tab** — index view that lists all docs filtered by `type=wiki`, opens them in read-mode rendering Scribe content.
5. **Search tab** — unified ranker over the document corpus + Honcho memories + ThoughtWeaver captures. Probably starts as full-text + tag match.
6. **Ingest tab** — table view of the ingestion queue with status, retry, source-pane preview. Reuses existing FileExplorer API for the data, adds status from the new pipeline.
7. **Graph tab** — force-directed layout (d3-force or react-force-graph) over the document × edge table. Domain coloring, node-size by degree, click → side pane. "Edit in Scribe" via existing `dwellium:open-widget` event bus shipped this session.
8. **Syntheses tab** — promote Honcho dreams to first-class `type=synthesis` documents persisted via the ingestion pipeline.

### Tier 3 — Polish

9. Activity log footer (rolling 100 events)
10. Citation footnote primitive in Scribe rendering
11. Across-all workspace toggle
12. Graph node-theme presets

---

## 6. Estimated build effort

| Tier | Items | Rough effort |
|---|---|---|
| Tier 1 | 1-3 | 6-10 hours (data model + ingest pipeline + edge extractor) |
| Tier 2 | 4-8 | 12-18 hours (4 new widget tabs + reuses Tier 1 backend) |
| Tier 3 | 9-12 | 4-6 hours (polish items, each ~1h) |

Total: ~25-35 hours of focused build to reach Agenteryx-parity. The architectural Tier 1 is the gate — Tier 2 and 3 collapse into clean UI work once the data model and ingestion are in place.

---

## 7. Important caveat

This analysis is based on **screenshots only**. I do not have access to Agenteryx source code. Specifics I cannot verify:
- Whether Type/Tier/Domain are stored as frontmatter, sidecar files, or DB columns
- Whether the graph is force-directed via d3-force, react-force-graph, vis.js, or a custom canvas
- Whether ingestion is incremental (file watcher) or batch (sync button)
- Whether edges are extracted at write-time or via background job
- Internal naming conventions

If you can share a tarball, or grant me access, I can replace each `(inferred from screenshot)` cell with verified architecture and tighten the effort estimates.

---

**Recommendation:** start with Tier 1 item #1 (document metadata model). Everything else is downstream of that.
