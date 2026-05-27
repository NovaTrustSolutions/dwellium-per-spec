# Holocron — Architecture v2 (Phase 3 Build Spec)

**Version:** 2.0
**Date:** 2026-05-06
**Replaces:** the looser Phase-3 sketch in MVP.md §Phase 3 and the spec at `_Notes/Library.md`. This document is canonical for the next build phase.

This spec captures the decisions reached in conversation between Andy and Claude (Opus 4.7) after reading the Carpathia RAG TikTok transcripts, the "7 Levels of Claude Code & RAG" transcript, and Sonnet's earlier `Codex.md` proposal. It corrects three things in the earlier spec and adds key insights from the source material.

---

## Vision

Holocron transforms from a document-production tool into a **personal knowledge operating system**. Brain dumps at the bottom of a layered structure synthesize upward into wiki pages and a connection graph. Every cycle through the compounding loop makes the next synthesis richer because syntheses feed back as new source material.

The user-facing surface is a 5-tab Electron app. The data lives on disk as markdown files in an iCloud-synced folder, accessible from any device via Files (iOS/macOS) for read-only inspection. Holocron is the only application that ingests, indexes, and synthesizes the corpus. A PostgreSQL database serves as the index/cache, rebuildable from disk at any time.

---

## Layer model — Build Level 4, defer Levels 5-6

The "7 Levels" transcript gives a clear progression of memory architectures. We build at Level 4 first (Obsidian-style structured wiki + agent-curated relationships), measure whether it's enough, only level up if we hit a wall. Levels 5 (naive vector RAG) and 6 (graph RAG) add infrastructure that may not be needed for the volumes Andy works with.

| Level | Architecture | Holocron status |
|---|---|---|
| 1 | Auto-memory (CLAUDE.md auto-generated) | Already have |
| 2 | Manual CLAUDE.md | Already have |
| 3 | Multiple state files (project.md, requirements.md) | Already have via thread.json + spec docs |
| **4** | **Structured wiki + master index + agent-curated relationships** | **Phase 3 builds this** |
| 5 | Naive vector RAG (chunking + embeddings) | Skip — "crappy search engine with extra steps" |
| 6 | Graph RAG (entities + relationships, e.g. LightRAG) | Optional Phase 3.5 if Level 4 hits limits |
| 7 | Agentic RAG (multimodal + ingestion pipelines) | Out of scope |

The Carpathia RAG that the speaker cried over is Level 4. The "magic" comes from the **structure**, not vector math.

---

## 5-Tab UI

```
┌────────────────────────────────────────────────────────────────────┐
│  [📊 HUD]  [📝 Scribe]  [⊞ Projects]  [📚 Codex]  [✦ Mind] │
└────────────────────────────────────────────────────────────────────┘
```

Each tab is a primary surface, default on app launch is HUD.

### HUD tab — landing page

Fixed layout, no widget reordering in v1. About a day of UI work.

```
┌──────────────────────────────────────────────────────────────────┐
│ STATUS STRIP                                                      │
│ ● Postgres │ ● Honcho │ ● Redis │ API key OK │ Today: $0.47/$5.00│
├──────────────────────────────────────────────────────────────────┤
│ RECENT INSIGHT (Honcho)                                  [Open ▶]│
│ "Across 4 case-management threads this week you keep returning   │
│  to whether Anchors persist across Workspaces. Wiki page         │
│  recompiled 2 hours ago — 8 sources."                            │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│ Documents   │ Wiki Pages  │ Connections │ Notes(week) │ Redlines │
│   247       │   14        │   312       │   23        │   8 acc  │
├─────────────┴─────────────┴─────────────┴─────────────┴─────────┤
│ PENDING ACTIONS                                                   │
│ • 3 documents queued for re-ingest                                │
│ • 1 wiki page recompilation pending                               │
├──────────────────────────────────────────────────────────────────┤
│ RECENT ACTIVITY                                                   │
│ 09:42 • Ingested BD_AstraStrata_PRD03.md (4 chunks)               │
│ 09:38 • Recompiled wiki: case-file-management (8 sources)         │
│ 09:15 • Captured synthesis: "Anchors and persistent state"        │
└──────────────────────────────────────────────────────────────────┘
```

- Status dots auto-poll every 30s
- Cost tracking polls daily-spend totals from `rag_operations_log`
- Recent Insight pulls the latest Honcho dream surfaced today; Open button jumps to Mind tab
- No charts in v1. Numbers and dots only. Add trendlines in v1.5 if any number turns out to want one.

### Scribe tab — current Holocron functionality

Existing TabBar + DocumentToolbar + editor area, unchanged from current state. Adds:

- **Double-space → period** keymap (small CodeMirror addition, ~15 LOC)
- **Cmd+K wikilink picker** — fuzzy-search wiki pages and synthesis essays, insert `[[Title]]` at cursor
- **"Pull from Codex" button** in DocumentToolbar (hidden when no Codex content available)

### Domaines tab — current sidebar functionality

The existing left sidebar with file tree and ThreadSwitcherFooter, promoted to a top-level tab (or kept as-is in the sidebar — UX decision deferred to implementation; tabs can shadow sidebar content if convenient).

### Codex tab — knowledge base surface

Five sub-tabs inside Codex:

| Sub-tab | What |
|---|---|
| **Search** | Default sub-tab. Keyword + tag search across all roots. Filter by source_type, project, date. |
| **Wiki** | Grid of compiled wiki pages, click to open in readable view. Read-only with "Regenerate" button. |
| **Graph** | Cytoscape.js mind map. Zoom, pan, filter by tag/project. Click node → side panel with doc excerpt + connections. |
| **Ingest** | Drag-drop file upload. Manual ingest button. Queue view: pending / processing / complete / failed. |
| **Syntheses** | History of generated synthesis essays. Capture-back-to-RAG button per row. |

Each sub-tab gets a **collapsible agent chat sidebar** scoped to that tab's data. Wiki tab's agent biases toward wiki content; Search tab's agent crosses everything.

### Mind tab — Honcho-as-orchestrator surface

The user-facing layer for cross-thread synthesis. Honcho's dreaming runs nightly; surfaces appear here.

**Layout:**

- **Recent Insights feed** (top): list of Honcho-generated cross-thread observations, dated, with "Capture to Codex" and "Pull into [active thread]" actions
- **Talk to the Mind** (bottom): chat interface where the agent's context is global (all projects, all threads, the whole RAG). For "what do I know about X across everything" queries.
- **Manual Synthesis trigger:** button "Synthesize on: [topic]" — runs Pass 4 of the compounding loop, generates an essay, displays for review

The Mind is the only chat surface that crosses thread boundaries by default. All other chats are thread-scoped.

---

## Read/Write Surface Split

Holocron has two top-level surfaces for documents, and they have different responsibilities. Decided 2026-05-08 while scoping Phase 3b step 11.

**Scribe tab is the canonical WRITE surface for the active thread.** Files belonging to the active project + thread (matched against `cfg.activeProjectName` + `cfg.activeThreadName`) open here on click. Editing, saving, redlines, comments, brain-dump intake — all happen here. Sidebar's file tree is the launcher.

**Codex tab is the canonical READ surface for ALL ingested RAG documents.** Search results and Wiki pages render in an in-tab preview, never auto-open in Scribe. The Codex is where users explore the corpus across thread boundaries; Scribe is where they work in a single thread.

The dispatch is per-document, driven by `source_type` and active-thread membership:

| Document relationship | Click behavior | Toolbar |
|---|---|---|
| Active thread file | open in Scribe (existing) | Standard editor chrome |
| Cross-thread reference / note / report | Codex preview, Edit toggle, in-place save | Disclosure: "From {project} / {thread}" |
| Wiki page (`source_type='wiki'`) | Codex preview, **never editable in place** | "Import to Thread" + "Use as Report Draft" buttons |
| Synthesis (`source_type='synthesis'`, Phase 3c) | Codex preview, never editable in place | Same as wiki: Import + Use as Report Draft |
| Inbox doc | open in Scribe (treated as a normal markdown file) | Standard editor chrome |

### Why wiki and synthesis are read-only

Wiki pages and syntheses are agent-written artifacts compiled from source documents. The compounding loop overwrites `_Library/Wiki/<slug>.md` on every recompile (every 5 ingests, or manual Regenerate). Edits made directly to the disk file would be silently lost. **The correct workflow is "Import to Thread"** — copy the wiki content into `<active thread>/References/<slug>.md` where it becomes a reference document the user can edit, version, and treat as their own. The same rule applies to syntheses.

### Why cross-thread references are editable in place

References under `<project>/<thread>/References/` belong to a specific project/thread. When the user opens one from another thread's Codex search, they can edit it — the file's owning thread is unambiguous (it's in the path), and the toolbar disclosure makes the source thread visible. On save, chokidar fires `change` → re-ingest runs against the original location. This is the user's data, not agent output.

### useFileRelationship hook — single source of truth

The renderer has one canonical helper for the Scribe-vs-Codex dispatch. It returns one of `'active' | 'cross-thread' | 'wiki' | 'synthesis' | 'inbox'` given a `RagDocument` row plus the current config. Both Codex/Search and Codex/Wiki consume it. Don't duplicate the dispatch logic across components — every divergence is a future bug.

### Search result badges

To make click outcomes predictable from the result list (not surprising on click), each Search result card carries a small badge:

- ✎ **Open** — active-thread file, opens in Scribe
- 📖 **Preview** — wiki / synthesis / active-thread reference, opens preview
- ↗ **Preview (other thread)** — cross-thread reference

The badge is computed from `useFileRelationship(doc)` so it stays consistent with the click handler.

### Implications for future surfaces

- **Mind tab** (Phase 3c) follows the same Codex pattern for any RAG documents it shows. Pull-into-thread is the cross-surface bridge, not in-place edit.
- **Telegram Inbox v1** lands files at `_Inbox/Inbox.md` which gets opened in Scribe (active-thread-style) since the Inbox is a single growing append file with no project/thread parent.

### Implementation steps

- **Step 11** (HANDOFF_v07) — build `CodexPreview` component with `{ document, mode }` props + Wiki sub-tab; wire wiki actions Import-to-Thread and Use-as-Report-Draft.
- **Step 11.5** — reroute Search.tsx click to use CodexPreview for all source types; add badges; introduce `useFileRelationship` as a shared hook.

Both ship the same conceptual surface; splitting reduces commit risk.

---

## Filesystem layout — iCloud as transport (Holocron-native)

**Single root directory in iCloud Drive. Holocron does all reading, writing, ingestion, and synthesis natively** — no Obsidian dependency at runtime. Karpathy's Obsidian-style structured-wiki RAG is the *conceptual model*, not a vendor we integrate with. Wikilinks (`[[Page Name]]`) stay because they're a useful markdown convention for encoding relationships, not because anything else needs to render them.

iCloud's role is purely cross-device file access (e.g., reading a file from iPhone Files app, mobile capture via Telegram Inbox → iCloud → Mac).

```
~/Library/Mobile Documents/com~apple~CloudDocs/Holocron/
├── _Inbox/                       ← Telegram Inbox lands here
│   └── Inbox.md                  ← appended-to from mobile
├── _Projects/                    ← active work root
│   └── AstraStrata_PRDs/
│       └── PRD-01-Global/
│           ├── thread.json       ← Holocron metadata
│           ├── BD_AstraStrata_PRD01.md
│           ├── Notes_AstraStrata_PRD01.md
│           ├── Reports/*.md
│           ├── References/*
│           ├── Memory/           ← Honcho snapshots + Reset Context summaries
│           └── Comments_*.json   ← comment sidecars
└── _Library/                     ← knowledge base root
    ├── AI_Topics/
    ├── AstraStrata_Reference/
    ├── Work_Research/
    ├── Personal/
    ├── Wiki/                     ← compiled wiki pages (written by Pass 2)
    └── Syntheses/                ← captured synthesis essays (written by Pass 5)
```

**Migration from current setup:** move existing `_Projects/` and `_Library/` directories under the iCloud path. Update `holocronRoot` setting. iCloud Drive syncs the rest.

**Holocron-side notes:**
- Hide any `.dotfolders` from the file tree (one regex check in SidebarCell — already filters dotfiles)
- Debounce chokidar events to 2 seconds so rapid saves don't trigger N parallel ingestions (see phase-3a-execution §"Settled decisions")

**No direct Google Drive API integration.** iCloud Drive does the syncing transparently; we don't write OAuth code.

---

## The wikilink-as-edge pipeline (key insight)

`[[Page Name]]` is a lightweight markdown convention for encoding inline references. The ingestion agent **inserts wikilinks into documents during ingestion**, creating a relationship signal that:

1. **Renders as clickable links in Holocron's editor** (we own the parser; see `markdownConfig.ts` extension surface)
2. **Populates `rag_relationships`** as `discovered_by: 'agent'` edges
3. **Drives the Codex Graph view** (Cytoscape uses the same edge data)
4. **Enables Cmd+K wikilink insert** in the editor (search by existing wiki page titles)

The format is intentionally a markdown-native convention (not a custom syntax) so files remain readable in any markdown viewer if you ever export them.

**Pipeline insertion (Pass 1 of compounding loop):**

```
After tagging:
  for each existing wiki page title in rag_wiki_pages:
    scan content for case-insensitive matches
    for each match: insert [[Title]] in place
  re-write the file to disk with links inserted
  log relationships in rag_relationships (discovered_by='agent')
```

**Implications:**
- The agent does this once per file at ingestion time. Not periodic.
- If a new wiki page is created later, existing docs DON'T retroactively get linked unless re-ingested. Add a "Re-link existing documents" button on the Wiki tab.
- The agent uses Gemini Flash for this — pure structural transformation, speed matters.

---

## Database schema (Level 4 — no pgvector)

PostgreSQL, all tables prefixed `rag_`. **No vector columns in v1.** Use `tsvector` for full-text search.

```sql
CREATE TABLE rag_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path     TEXT NOT NULL,
  source_root     TEXT NOT NULL,        -- 'projects' | 'library' | 'inbox'
  source_type     TEXT NOT NULL,        -- 'brain_dump' | 'report' | 'note' |
                                         -- 'reference' | 'wiki' | 'synthesis' | 'inbox'
  project_name    TEXT,
  thread_name     TEXT,
  title           TEXT,
  content         TEXT NOT NULL,
  word_count      INTEGER,
  ingested_at     TIMESTAMPTZ DEFAULT NOW(),
  last_modified   TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE,
  -- Generated tsvector column for full-text search; auto-updates on insert/update
  content_tsv     tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))
  ) STORED
);
CREATE INDEX rag_documents_tsv_idx ON rag_documents USING GIN (content_tsv);
CREATE INDEX rag_documents_source_idx ON rag_documents(source_root, source_type);
CREATE INDEX rag_documents_project_idx ON rag_documents(project_name, thread_name);

CREATE TABLE rag_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,      -- e.g. 'case-management', 'astra-strata'
  category   TEXT,                      -- 'topic' | 'person' | 'property' | 'project'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rag_document_tags (
  document_id UUID REFERENCES rag_documents(id) ON DELETE CASCADE,
  tag_id      UUID REFERENCES rag_tags(id) ON DELETE CASCADE,
  confidence  FLOAT DEFAULT 1.0,
  PRIMARY KEY (document_id, tag_id)
);

CREATE TABLE rag_relationships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_a_id   UUID REFERENCES rag_documents(id) ON DELETE CASCADE,
  document_b_id   UUID REFERENCES rag_documents(id) ON DELETE CASCADE,
  relationship    TEXT NOT NULL,         -- 'wikilink' | 'tag-shared' | 'contradicts' |
                                          -- 'expands' | 'summarizes' | 'references'
  strength        FLOAT DEFAULT 0.5,
  discovered_by   TEXT DEFAULT 'agent',  -- 'agent' | 'user' | 'tag-overlap'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX rag_relationships_a_idx ON rag_relationships(document_a_id);
CREATE INDEX rag_relationships_b_idx ON rag_relationships(document_b_id);

CREATE TABLE rag_wiki_pages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,     -- 'case-file-management'
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,            -- compiled markdown
  source_count INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  compiled_by  TEXT DEFAULT 'agent'
);
-- Wiki pages also written to disk under _Library/Wiki/ as .md files —
-- the markdown file is the durable artifact (rebuildable index pattern;
-- DB can be dropped and rebuilt from files). DB row is metadata cache.

CREATE TABLE rag_syntheses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT,
  query          TEXT NOT NULL,
  content        TEXT NOT NULL,
  source_doc_ids UUID[],
  captured_back  BOOLEAN DEFAULT FALSE,
  captured_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rag_operations_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation   TEXT NOT NULL,             -- 'ingest' | 'compile' | 'query' |
                                          -- 'synthesize' | 'capture' | 'connect'
  target_id   UUID,
  target_type TEXT,
  details     JSONB,
  duration_ms INTEGER,
  cost_usd    NUMERIC(10,6),             -- per-call cost for budget tracking
  provider    TEXT,                      -- 'gemini' | 'anthropic' | 'lmstudio'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX rag_operations_log_date_idx ON rag_operations_log(created_at DESC);

CREATE TABLE rag_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Critical fixes vs Sonnet's earlier spec:**
1. SQLite `CREATE VIRTUAL TABLE ... USING fts5` replaced with Postgres `tsvector` column + GIN index (Sonnet copied SQLite syntax accidentally)
2. Vector columns dropped (Level 4 = no embeddings)
3. `source_root` column added to support Projects vs Codex scoping
4. `cost_usd` and `provider` columns added to operations log for budget tracking

---

## Namespace & Context Isolation

Holocron is used for both professional and personal knowledge management. The RAG database and relationship engine must support controlled isolation between domains to prevent unwanted context bleed, while allowing selective bridging where the user explicitly wants cross-domain synthesis.

### Namespace Design

Every Project maps to a namespace. Namespaces are defined at the Project level and fall into two categories:

**Isolated namespaces** — relationships and search results never cross namespace boundaries unless explicitly requested:
- Work projects (AstraStrata, Holocron, client work, etc.)
- Health
- Relationships
- Finance

**Bridge namespaces** — allowed to form tag-overlap relationships with any other namespace, both isolated and bridge:
- AI Research
- Learning / Reading
- Any namespace the user explicitly marks as bridgeable

### Implementation Requirements

1. Add a `namespace` column to `rag_documents` (string, indexed). Populated at ingest time from the Project name.

2. Add a `is_bridge_namespace` boolean to a new `rag_namespaces` config table. User-configurable. Defaults to `false`.

3. Tag-overlap relationship logic in `ragIngest.ts` must be updated:
   - If both documents are in the same namespace → always form relationship
   - If documents are in different namespaces AND either namespace is a bridge namespace → form relationship
   - If documents are in different namespaces AND neither is a bridge namespace → do NOT form relationship (skip silently)

4. All search and synthesis queries must accept an optional namespace filter. Default behavior: return results from the active Project namespace only. Cross-namespace results require explicit opt-in.

5. The HUD (Step 6) should display namespace as a filter dimension so the user can scope cost tracking and activity views by domain.

### Example

AI Research is a bridge namespace. A note about LLM memory systems in AI Research can form relationships with an AstraStrata PRD about agent architecture AND with a Health note about cognitive load. Health is isolated — it will receive connections FROM bridge namespaces but will never reach OUT to work or relationship documents on its own.

### Migration Note

This requires a small schema addition before Step 7 (Codex/Search) is built. Add as migration `002_namespaces.sql`. Do not retrofit into `001_rag_schema.sql`.

---

## Ingestion — three entry paths, one pipeline

| Path | Trigger | Source type | UX |
|---|---|---|---|
| **Auto-pipeline** | chokidar fires on new BD_*.md, Notes_*.md, Reports/*.md anywhere under `_Projects/` | brain_dump / note / report | Background; HUD activity feed shows it |
| **Auto-watched** | chokidar fires on new files anywhere under `_Library/` | reference | Same |
| **Manual** | Codex → Ingest tab → drag-drop or click "+ Add" | reference (or selectable) | Foreground with progress bar |

**Re-ingestion:** edits to existing files do NOT auto-re-ingest (would burn API calls on every keystroke save). Instead:
- HUD "Pending Actions" card shows "Re-ingest queued: N files"
- Manual "Re-ingest" button per-file in Codex
- Or "Re-ingest all changed files" bulk action

**The pipeline (Pass 1, expanded):**

```
1. chokidar / manual trigger fires with file path
2. Push to Redis queue (already in Docker stack)
3. Worker picks up job:
   a. Read file content
   b. Compute content hash; check rag_documents for source_path + hash match
      → if same: skip
      → if different: mark old row is_active=FALSE, proceed
   c. Insert row in rag_documents with source_root, source_type, project, thread
   d. Call Gemini Flash for tag extraction (returns tags + confidence)
      Insert rows in rag_tags (if new) and rag_document_tags
   e. Scan content against existing rag_wiki_pages.title for [[wikilink]] insertion
      Re-write file to disk with [[wikilinks]] inserted
      Insert rows in rag_relationships (discovered_by='wikilink')
   f. Compute tag-overlap relationships: for each shared tag with another doc,
      insert rag_relationships row (discovered_by='tag-overlap', strength=N/total_tags)
   g. Queue affected wiki pages for recompilation (Pass 2)
   h. Log rag_operations_log entry with cost
4. Activity feed update on HUD
```

Per-doc cost: ~$0.001 with Gemini Flash. 100 docs/month = ~$0.10. Within free tier.

---

## The compounding loop — six passes

| Pass | What | Trigger | Provider |
|---|---|---|---|
| 1 | **Ingest** | New file or manual | Gemini Flash (tag extract + wikilink insert) |
| 2 | **Compile** | After every 5 ingests, or manual "Recompile" | Gemini Flash (multi-doc structuring) |
| 3 | **Query & Retrieve** | User search or agent context request | Gemini Flash (FTS + tag-scoped search) |
| 4 | **Synthesize** | Codex → Syntheses → "Generate" or Mind → "Synthesize on: X" | **Claude Sonnet** (essay quality matters) |
| 5 | **Capture** | User clicks "Capture to Knowledge Base" | Re-runs Pass 1 on the synthesis |
| 6 | **Recompile** | After capture | Gemini Flash (recompile affected wiki pages) |

Passes 1-3 + 5-6 use Flash. Only Pass 4 uses Sonnet. Cost asymmetry intentional: bulk infrastructure work goes to the cheap fast model; the high-quality user-facing synthesis goes to the premium model.

---

## Planned: Audit Pass

The six-pass compounding loop assumes the index stays consistent with the source corpus. In practice, drift is inevitable: a wiki page is compiled from sources A/B/C, then source A gets re-ingested with different content, then a wikilink to a now-renamed page becomes a dangling reference, etc. Karpathy's wiki has the same drift problem and addresses it by hand — the user reads the wiki periodically and notices what's stale.

A small **audit pass** addresses this systematically without adding a 7th compile-style pass. It's a read-only integrity check that surfaces problems for the user to act on. Surfaces on the HUD's "Pending Actions" card (currently empty in v1) and as an explicit `audit:run` IPC.

### What the audit pass checks

1. **Wiki pages drifted from sources.** For each row in `rag_wiki_pages`, compare its `updated_at` to the latest `last_modified` across its `rag_wiki_page_sources` documents. If any source changed after the wiki page was compiled, flag the page as stale. User remediation: click "Regenerate" (already shipped in step 10).

2. **Raw docs ingested but never compiled into a wiki page.** Documents in `rag_documents` (excluding `source_type='wiki'`) that share tags with ≥3 other docs but have NO entry in `rag_wiki_page_sources` for any wiki page. Indicates a topic that's reached the cold-start threshold for compilation but the auto-compile hasn't fired (e.g., the 5-ingest counter cycled before this doc joined the cohort). User remediation: trigger `wiki:compile-now` manually.

3. **Broken `[[wikilinks]]`** (after step 12 ships). Scan source documents (`source_type IN ('brain_dump','note','report','reference')`) for `[[Page Title]]` patterns whose target doesn't exist in `rag_wiki_pages.title`. User remediation: rename the wikilink, create the target page, or delete the link.

4. **Stale `rag_wiki_page_sources` rows.** Rows where `document_id` references a `rag_documents` row that's been marked `is_active=FALSE` (typical after content-changed re-ingest creates a new active row, marking the old one inactive). User remediation: cleanup query removes them; alternatively, the next compile recomputes the source set.

### Why it's a separate pass, not built into the compile

The compile loop runs every 5 ingests OR on user trigger. It's bounded — it touches only "affected" pages by tag overlap. The audit pass is corpus-wide and read-only; running it at compile-time would slow the ingest pipeline. Better: run on HUD load, on a manual "Audit now" button, or on a daily schedule once the audit logic has settled.

### Why it surfaces and doesn't auto-fix

Each finding has a clear remediation but the *correct* remediation depends on user intent: "this wiki is stale" might mean "regenerate it" OR "this source moved out of scope, drop it." The audit pass reports; the user (or a future agent acting on user permission) decides.

### Implementation sketch (NOT to be built yet)

- New `editor/src/main/ragAudit.ts` with `runAudit(): Promise<AuditReport>` exporting `{ staleWikis: [...], uncompiledClusters: [...], brokenWikilinks: [...], staleSourceRefs: [...] }`
- New `audit:run` IPC; HUD's `dashboard:status` extends to surface the four counts
- Pending Actions card on HUD renders the counts with action buttons per category
- No new schema; all four checks are SQL queries against existing tables

### Effort estimate

~3 hours: 4 SQL queries, the IPC, the HUD widget integration. No model calls. No new schema.

### When to build it

Defer to after Phase 3b step 14 (Cmd+K wikilink picker) ships — that's when broken-wikilinks-as-a-class becomes real. Until then, the audit pass would only check items 1, 2, and 4. Reasonable to ship the partial audit earlier if the HUD's empty Pending Actions card starts to feel hollow.

---

## Planned: Thread Memory Management

Users need the ability to inspect and selectively manage Honcho session memory per thread. The current Clear button only resets UI state — Honcho persists history server-side and restores it on the next thread load. There is no surface for inspecting what's actually stored, and no way to selectively prune.

### Bug to flag — Clear button is misleading

The current Clear button behavior is misleading: it resets the UI but not Honcho's server-side memory, so on the next thread load the cleared messages re-appear from Honcho. Two acceptable fixes:

- **Option A:** Fix the Clear button to actually wipe the Honcho session (call a Honcho delete-messages endpoint, then clear UI state). One-step destructive action with confirmation.
- **Option B (recommended):** Rename the existing button to "Clear View" (UI-only reset, current behavior) and add a separate **"Reset Memory"** button that performs the permanent server-side wipe with a confirmation dialog. Two distinct affordances for two distinct intents — a user clearing the view to focus on a fresh exchange is doing something different from a user wanting to actually erase history.

Recommendation: Option B. The current name "Clear" implies destructive action; renaming to "Clear View" makes the UI-only behavior explicit and surfaces the gap that motivates the new "Reset Memory" button.

### Planned features for a Thread Settings panel

A new "Thread Settings" surface — likely accessible from the chat panel header or the sidebar's thread switcher footer — exposing per-thread memory inspection and management:

1. **View full Honcho message history** for the active thread, with timestamps. Scrollable, search-friendly.
2. **Selective delete** of individual messages OR date ranges. Confirmation per delete; persists to Honcho server-side.
3. **Permanent session wipe** ("Reset Memory" button per the bug fix above). True clear — destroys the Honcho session and starts fresh. Confirmation dialog with explicit "Type the thread name to confirm" gate, since this is irreversible.
4. **View Honcho compression summaries** for this thread. The summaries Honcho generates server-side during compression are normally invisible; surfacing them lets the user see what the agent actually remembers vs the raw transcript.
5. **View dream insights stored in Memory file** — the `Memory_<Project>_<Thread>.json` summaries from Reset Context + future Honcho dreaming, with timestamps and triggers. Read-only in v1; future versions could allow editing or capturing back into the Codex.

### Where this fits in the data model

No new schema. All five features operate against existing data:

- Honcho server-side session messages (already exposed via `/v3/workspaces/.../sessions/.../messages/list`)
- Honcho server-side session context (already exposed via `getSessionContext`)
- The local `Memory_<Project>_<Thread>.json` file (already read by `threadActions.ts` for `sessionSummaries`)

What's missing from the IPC surface today:

- A delete-messages endpoint pass-through (`honcho:delete-message` and `honcho:wipe-session`)
- A read-summaries endpoint pass-through (`honcho:list-summaries` if Honcho exposes one; otherwise compute from `getSessionContext` calls over time)

### When to build

Defer until after Phase 3b ships — the chat hallucination investigation (commit `d15416e`) may surface root causes that change the design (e.g., if Honcho duplicates writes, the "Reset Memory" affordance becomes more important than originally scoped). The Clear-button rename is the smallest piece and could ship independently as a UX polish if the misleading behavior bites a user.

---

## Mind tab — Honcho-as-orchestrator detail

Honcho already runs in Docker. v3 supports a "dreaming" agent that synthesizes session content. We expose this surface in the Mind tab.

**Components:**

1. **Recent Insights feed** — pulls Honcho's overnight syntheses + any captured Codex syntheses, dated, ranked by recency
2. **Capture-to-Codex button per insight** — runs Pass 5 of the compounding loop on that insight: stores in `rag_documents` as `source_type='synthesis'`
3. **Pull-into-thread action** — right-click insight → select active thread → insight inserted as system context in next agent message in that thread
4. **Talk to the Mind chat** — agent has read access to all `rag_documents`, all wiki pages, all syntheses. Default model: Claude Sonnet (quality matters here).
5. **Manual Synthesis trigger** — input "Synthesize on: [topic]" → runs Pass 4 → essay shown with Capture/Save-as-Report/Discard buttons

**Honcho dreaming integration:**
- Honcho v3 generates syntheses based on chat session patterns
- We poll Honcho for new syntheses on app launch + every 6 hours
- New syntheses appear in the Insights feed
- User can Capture them (which copies to RAG and writes to disk under `_Library/Syntheses/`)

---

## Project ↔ Codex bridge — three concrete affordances

The two roots are filesystem-separate but data-connected. The user can pull Codex content into Projects via:

### 1. Cmd+K wikilink picker

In the Scribe, **Cmd+K** opens a fuzzy-search overlay across `rag_wiki_pages.title` and `rag_syntheses.title`. Pick one → inserts `[[Title]]` at cursor. Renders as a clickable link in Holocron's editor.

### 2. "Save as Report" button

In Codex → Syntheses tab, every synthesis card has a "Save as Report" action. Click → pick active thread → synthesis content saved as a versioned report in `_Projects/<project>/<thread>/Reports/`. Uses existing report-versioning pipeline.

### 3. Pull-into-thread action

In Mind tab → right-click any insight → "Pull into [active thread]". The insight is inserted as one-shot system context in the next agent message in that thread. Doesn't modify the chat history; just informs the next response. Useful when the user is stuck and wants the orchestrator's perspective on the current work.

---

## Telegram Inbox v1 (no Interactive mode)

Mobile capture without requiring the Mac to be on. Two-mode design described in conversation; v1 implements only Inbox mode.

**Architecture:**

```
You text Holocron bot from any device
  ↓
Telegram → Cloudflare Worker (or Vercel Function)
  ↓
Worker auth-checks user ID, then writes to:
  ~/Library/Mobile Documents/com~apple~CloudDocs/Holocron/_Inbox/Inbox.md
  via iCloud's WebDAV-compatible endpoint OR via a service-account flow
  ↓
File appended:
  ## 2026-05-06 09:42 AM (mobile via Telegram)
  case file management — should anchors persist?
  ↓
iCloud syncs to Mac within seconds
  ↓
Holocron's chokidar fires on Inbox.md mtime change
  ↓
Ingestion pipeline runs with source_type='inbox'
  ↓
Tagged, wikilinked, indexed; Honcho's next dream cycle sees it
```

**Setup once:**
- Get Telegram bot token (BotFather)
- Deploy Cloudflare Worker (~50 lines of code) with bot token + iCloud auth
- Bot whitelists Andy's Telegram user ID (rejects all other senders)

**Total custom code:** ~50 lines for the Worker + ~15 lines in Holocron's chokidar config to recognize `_Inbox/Inbox.md` as a special-case append-only file (vs. the normal "new file" flow).

**Interactive mode (TG → Holocron RAG → reply) is deferred to v2.** Requires Holocron to be running and a way for the Worker to reach the local Holocron instance — needs a tunnel (cloudflared, ngrok) or an exposed API endpoint with auth. Not worth the security complexity for v1.

---

## Provider matrix + task routing + hot-swap

### Configured providers

| Provider | Where | Use |
|---|---|---|
| **Gemini 2.5 Flash** (cloud) | Settings → Connections → Gemini | Default for most tasks |
| **Claude Sonnet 4.6** (cloud) | Settings → Connections → Anthropic (NEW) | Premium synthesis |
| **LM Studio** (local) | Settings → Connections → LM Studio | Privacy / offline / experiments |

### Default task routing

| Task | Default Provider | Why |
|---|---|---|
| Conversational chat | Gemini Flash | Speed |
| Redline requests | Gemini Flash | Pattern-following, speed |
| Ingestion: tag + entity extract | Gemini Flash | Transformation, speed |
| Ingestion: insert wikilinks | Gemini Flash | Structural rewrite |
| Wiki compilation | Gemini Flash | Multi-doc structuring |
| Connection discovery | Gemini Flash | Many lightweight calls |
| Brain dump intake processing | Gemini Flash | Structuring raw thoughts |
| **Synthesis essays** | **Claude Sonnet** | Original cross-domain prose; quality is the point |
| **Report generation** | **Claude Sonnet** | Long-form output; reads matter |
| **Mind tab dream surfacing** | **Claude Sonnet** | Insight quality |

### Hot-swap dropdown (chat header placement)

In the chat panel header, alongside the AGENT label / Reset / Clear buttons. The currently active model name is the visible affordance; clicking opens a dropdown of configured providers.

```
┌──────────────────────────────────────────────────────────────────┐
│ AGENT  ⚡ Gemini Flash ▼     [Reset]  [Clear]                    │
│        ─────────────────                                          │
│        • LM Studio (Llama 3.1 8B)                                 │
│        • Gemini 2.5 Flash  ✓                                      │
│        • Claude Sonnet 4.6                                        │
│        ─────────────────                                          │
│        Settings →                                                 │
└──────────────────────────────────────────────────────────────────┘
```

**Why header, not bottom of input:** the dropdown is a thread-level/agent-level concern. It should live where AGENT lives. The chat input area stays focused on the act of writing a message.

**Behavior:** selection persists until changed (no per-message override). Disabled providers grayed out (unconfigured API key). About 60 LOC, builds on the existing provider toggle in `useSettingsStore`.

---

## Cost ceiling implementation

### Settings → Connections → Cost Limits (NEW)

```
DAILY BUDGET:        $5.00      [edit]
MONTHLY BUDGET:      $30.00     [edit]
HARD STOP:           [On  ●]   At 100% of daily budget, pause cloud calls
WARN AT:             80%        [edit]
```

### Implementation

- Every cloud LLM call writes a row to `rag_operations_log` with `cost_usd` and `provider`
- A small middleware function (`checkBudget()`) runs before every cloud call:
  - Queries today's sum: `SELECT COALESCE(SUM(cost_usd),0) FROM rag_operations_log WHERE created_at >= CURRENT_DATE`
  - If >= 100% of daily budget AND hard-stop on: throw "Budget reached"
  - If >= 80% AND not warned today: trigger HUD warning + system notification
- Local model calls bypass `checkBudget()` entirely (zero cost)
- The pause auto-clears at midnight (next day's budget resets)

HUD status strip shows live spend; the "$0.47/$5.00" piece in the layout is wired to this.

---

## Cost Tracking & HUD

### Source of truth

`rag_operations_log` is the single source of truth for all cloud model usage and cost. Every cloud call routed through `llmClient.chat()` writes one row. Schema captures:

- `provider` — `'gemini' | 'anthropic' | 'lmstudio'`
- `details->>'model'` — exact model ID sent to the API (e.g. `gemini-2.5-flash`)
- `details->>'task'` — semantic tag (`'chat'`, `'reset-context-summary'`, `'tag-extract'`, …)
- `details->>'input_tokens'` / `details->>'output_tokens'` — usage from provider response when available, otherwise estimated as `chars/4`
- `cost_usd` — computed via per-provider input/output rates in `PRICING` (constants in `llmClient.ts`)
- `duration_ms` — wall-clock latency for the call
- `created_at` — UTC timestamp

**LM Studio calls are deliberately not logged.** Local model = $0; logging would pollute the table with noise. The skip is implemented in `chat()`: `if (req.provider !== 'lmstudio') { logOperation(...) }`.

### Current model IDs and approximate costs (USD per 1M tokens)

| Model ID | Provider | Input | Output | Recommended use |
|---|---|---|---|---|
| `gemini-2.5-flash` | gemini | $0.075 | $0.30 | Cheap; default for ingestion, tagging, wikilinking, conversational chat |
| `gemini-2.5-pro` | gemini | (TBD) | (TBD) | Heavier reasoning / synthesis where Flash isn't enough |
| `claude-sonnet-4-6` | anthropic | $3.00 | $15.00 | Synthesis essays, report generation; logs end-to-end once Phase 3a step 5 is verified |
| `gemma-4-31b-it` (LM Studio) | lmstudio | $0 | $0 | Offline / privacy mode; not logged |

Pricing constants live in `editor/src/main/llmClient.ts` `PRICING` and require manual update when published rates change.

### Planned cost dashboard (future phase, not built yet)

The dashboard widget should query `rag_operations_log` with these aggregations. All `WHERE` clauses include `provider != 'lmstudio'` implicitly because LM Studio rows don't exist in the table.

**Daily spend by provider:**
```sql
SELECT provider, COALESCE(SUM(cost_usd), 0)::text AS spend_usd
FROM rag_operations_log
WHERE created_at >= date_trunc('day', NOW())
GROUP BY provider
ORDER BY spend_usd DESC;
```

**Daily spend by model:**
```sql
SELECT details->>'model' AS model, COALESCE(SUM(cost_usd), 0)::text AS spend_usd
FROM rag_operations_log
WHERE created_at >= date_trunc('day', NOW())
GROUP BY details->>'model'
ORDER BY spend_usd DESC;
```

**Daily spend by task type:**
```sql
SELECT details->>'task' AS task, COALESCE(SUM(cost_usd), 0)::text AS spend_usd
FROM rag_operations_log
WHERE created_at >= date_trunc('day', NOW())
GROUP BY details->>'task'
ORDER BY spend_usd DESC;
```

**Running monthly total:**
```sql
SELECT COALESCE(SUM(cost_usd), 0)::text AS month_to_date_usd
FROM rag_operations_log
WHERE created_at >= date_trunc('month', NOW());
```

**Budget limit status:** call `checkBudget()` from `llmClient.ts`. Returns `{ allowed, spentToday, limit, hardStop }`. The widget should surface `spentToday/limit` as a progress bar and a hard-stop indicator dot.

### Budget configuration storage

Budget config lives in the `rag_config` key/value table:

| Key | Default value | Type |
|---|---|---|
| `daily_budget_usd` | `'5'` | numeric (string-encoded) |
| `budget_hard_stop` | `'false'` | boolean (string `'true'`/`'false'`) |

Defaults are inserted lazily by `ensureBudgetDefaults()` on the first `checkBudget()` call (idempotent `INSERT … ON CONFLICT DO NOTHING`). The Settings UI for these limits (per the "Cost ceiling implementation" section above) writes back into `rag_config` via a small IPC handler — yet to be built.

**Don't build the dashboard yet.** This section is a spec for whoever picks up the dashboard step. The data model is stable; the widget is pure read-side.

---

## Scribe minor improvements

### Spell check (native browser, free)

Enable browser-native spell check on the CodeMirror editor by adding a `contentAttributes` extension:

```ts
EditorView.contentAttributes.of({ spellcheck: 'true' })
```

About 5 LOC in `markdownConfig.ts`. Uses the OS dictionary; words show the standard red underline. **No API calls, zero cost.**

**User-added words:** punted to OS-level. macOS handles user dictionary at System Settings → Keyboard → Text Replacements + the per-app dictionary that builds up via the right-click "Learn Spelling" action. Don't try to maintain a separate Holocron dictionary — too much friction for too little gain.

**Predictive text (LLM-driven completions):** explicitly out of scope for v1. Reasons:
- Per-keystroke or per-pause API calls add up quickly. With Sonnet, this is cost-prohibitive. With Flash, latency + quality drift make it more annoying than helpful.
- Flow-state writers (Andy dictates with Whisper Flow as the primary text-input path) are interrupted by inline AI suggestions.
- If we want it later, gate behind a Settings toggle (default off), use Flash, debounce to 1.5s after typing stops, and only fire on contiguous text (skip code blocks, tables, redlines).

### Double-space → period

Standard Apple/iOS keyboard behavior. Add to CodeMirror's keymap:

```ts
{ key: ' ', run(view) {
    const { from } = view.state.selection.main
    if (from < 2) return false
    const prev = view.state.doc.sliceString(from - 2, from)
    if (prev === ' ' && /[A-Za-z0-9]/.test(view.state.doc.sliceString(from - 3, from - 2) || '')) {
      view.dispatch({
        changes: { from: from - 1, to: from, insert: '. ' },
        selection: { anchor: from + 1 },
      })
      return true
    }
    return false
  }
}
```

About 15 LOC in `markdownConfig.ts`. Standard behavior, no toggle needed.

### Cmd+K wikilink picker

New keymap binding. Triggers a modal overlay (similar shape to TableOfContents but smaller — ~50 LOC). Searches `rag_wiki_pages.title` and `rag_syntheses.title`. Insert selected as `[[Title]]`.

Implementation: `WikilinkPicker.tsx` + IPC `wiki:listTitles` returning `Array<{slug, title, kind}>`.

---

## Planned: Scribe Enhancements

Two editor-level features captured here for future implementation. Both are CodeMirror-side changes; neither touches the RAG/wiki/Honcho pipelines.

### Feature 1 — Markdown Syntax Color Customization

A new **"Scribe"** tab in Settings exposes per-element color customization for CodeMirror's markdown syntax highlighting. The user can assign colors to:

- **Headers:** `# h1`, `## h2`, `### h3`, `#### h4`, plus h5/h6 for completeness
- **Inline emphasis:** bold, italic, bold-italic, strikethrough
- **Code:** inline code, code-block fence, code-block content (and per-language tokens if feasible — defer until v1.5)
- **Links:** link text, link URL, image alt text, image URL
- **Block elements:** blockquote `>`, horizontal rule, list items (bullet, ordered number, nested)
- **Tables:** header row, cell separator, cell content
- **Frontmatter:** YAML keys, YAML values
- **Wikilinks:** `[[link]]` text, `[[link]]` brackets (separate so the user can de-emphasize the brackets while keeping the link text vivid)
- **Special markers:** redline anchors, comment markers — anything Holocron's CodeMirror plugins introduce
- **Plus all other formatting features** that have an associated color in the current theme

#### Affordances

- **Color picker per element.** Native `<input type="color">` is fine for v1; consider a richer picker (with swatches + hex paste) only if user feedback demands it.
- **Preset themes.** Ship at least: Holocron Default (current), Fey (matches the Fey app theme's accent palette), Minimal (mostly off-white with one accent), High Contrast (WCAG AAA on every pair).
- **Save custom themes** with user-defined names. Listed alongside presets.
- **Live preview** in a sample markdown block embedded in the Settings tab — show all syntax elements at once so the user can tune side-by-side.
- **Reset to preset** per-theme.

#### Constraint

The Scribe color theme applies to **CodeMirror syntax highlighting only**. It does NOT affect the app chrome (panels, sidebars, buttons, dashboard widgets) — those continue to follow the existing app-wide theme system in `themes.ts` (Holocron Dark / Tokyo Night / Dracula / Nord / Solarized / Light / Midnight Blue / Fey). Two distinct theme axes; mixing them is intentional.

#### Persistence

Custom themes persist via `electron-store` (or the existing config mechanism if it can hold the schema). One JSON object per saved theme: `{ name, isCustom, tokens: { h1: '#...', h2: '#...', ... } }`. The active theme name lives in the main config alongside the existing `appearance.theme` field — separate keys so swapping the app theme doesn't reset the editor theme and vice versa.

#### Implementation sketch

CodeMirror 6 uses `HighlightStyle.define([...])` for syntax color rules. The Scribe tab in Settings reads the current theme's token map, renders a color-picker grid, and on save:

1. Writes the theme to `electron-store`
2. Triggers a CodeMirror reconfigure that swaps the active `HighlightStyle` extension
3. The change is visible immediately in the open editor without a reload

No DB migration. No IPC contract changes beyond a `editor-theme:save`/`:list`/`:set-active` triplet.

### Feature 2 — Smart Paste (`Cmd+Shift+V`)

**Problem:** pasting text from Claude/Opus chat output (or any LLM that word-wraps in its response) introduces hard line breaks every ~80 characters. These break markdown formatting in the Holocron editor — what reads as a flowing paragraph in the chat becomes a series of short lines, each interpreted as its own line in markdown. Currently the user has to manually re-flow the text after paste.

#### Two paste modes

| Mode | Shortcut | Behavior |
|---|---|---|
| **Smart Paste** | `Cmd+Shift+V` | Strips hard line breaks where a line ends without terminal punctuation (`.!?:;`) AND the next line starts with a lowercase letter or continues a sentence. Preserves intentional paragraph breaks (double newlines). Result: clean flowing paragraphs with no artificial wrapping artifacts. |
| **Raw Paste** | `Cmd+Shift+Opt+V` | Strips ALL formatting including paragraph breaks. Single space joins everything. One wall of text. For edge cases where even Smart Paste's structure is wrong. |

`Cmd+V` (default) remains untouched — pastes verbatim.

#### Smart Paste heuristic

Process the clipboard text as a sequence of lines. For each adjacent pair (line N, line N+1):

1. If the join point sits between paragraphs (line N is empty OR line N+1 is empty) → preserve the break.
2. If line N ends with terminal punctuation (`.`, `!`, `?`, `:`, `;`) → preserve the break.
3. If line N+1 starts with markdown structure (`#`, `>`, `-`, `*`, `1.` etc., backtick fence, `|` for tables) → preserve the break.
4. If line N+1 starts with a lowercase letter OR a continuing-sentence pattern (e.g., starts with `and `, `but `, `or `, `however`, `because`) → MERGE with a single space.
5. Default: preserve the break (conservative — don't merge when uncertain).

Code blocks (between ``` fences) are preserved verbatim — no merging inside them.

#### Raw Paste heuristic

Replace all whitespace runs (any combination of spaces, tabs, newlines) with a single space. Trim. Insert.

#### Implementation

CodeMirror 6 keymap extension. No clipboard-API hacks, no nasty intercepts:

```ts
keymap.of([
  { key: 'Mod-Shift-v', run: smartPaste },
  { key: 'Mod-Shift-Alt-v', run: rawPaste },
])
```

Each handler:
1. `await navigator.clipboard.readText()`
2. Apply the relevant transform
3. `view.dispatch(view.state.replaceSelection(transformed))`
4. Return `true` to consume the event

Lives in `editor/src/renderer/src/components/scribe/markdownConfig.ts` alongside the existing keymap extensions (double-space-period, etc.). ~80 LOC for both modes including the heuristic.

#### Edge cases to handle

- **Multi-line code blocks in clipboard:** detect ``` fences, preserve internal newlines verbatim, only merge prose around them.
- **Lists:** every list item starts with `-`, `*`, or `N.` — heuristic rule 3 catches these. Sub-list items (indented) also caught by leading whitespace.
- **Tables:** rows start with `|` — caught by rule 3.
- **Mixed:** a paste that's part-prose, part-code-block, part-list — handled by processing per-block (split on double newlines, classify each block, merge prose blocks only).
- **Empty clipboard:** no-op, return `false` so the event falls through (matches default Cmd+V behavior).
- **Permission denied on `readText()`:** rare but possible — fall back to default paste with a console warning.

---

## Planned: Component Codex & Code Reuse

As Holocron matures, individual modules have standalone value beyond this project. The goal is to build a personal component library that future agents and projects can draw from — the same way an experienced developer accumulates reusable parts over time, making each new project faster to build.

This is a north star, not an implementation step. Details below will evolve; the vision should be preserved.

### Modules with standalone extraction potential

**Markdown Scribe (high value)**
CodeMirror 6 with custom plugins: redlines, comments, minimap, syntax color theming, smart paste, floating toolbar, TOC overlay. No Holocron-specific dependencies in the core editor. Could be packaged as a standalone React component with a clean API and dropped into any web application. Comparable to or better than Obsidian's editor surface. Potential to share with other developers or use in future projects.

**RAG Pipeline (high value)**
File watching → ingestion → tag extraction → tsvector FTS → wiki compilation → namespace isolation. Complete knowledge pipeline with cost tracking. Any application needing document intelligence could use this. The PostgreSQL schema + migration system is production-grade and reusable.

**Multi-provider LLM Client (high value)**
Single `chat()` function routing between Gemini, Anthropic, and local LM Studio with automatic cost logging, budget enforcement, and streaming support. Provider-agnostic. No Holocron-specific dependencies. Directly reusable in any Node.js/Electron project.

**Namespace Isolation System (medium value)**
Project/thread/namespace model with bridge namespace support. Useful for any multi-domain knowledge system where context isolation matters.

**Cost Tracking Middleware (medium value)**
`rag_operations_log` + `checkBudget()` + dashboard widgets. Reusable cost observability layer for any AI application.

### The component library approach

Inspired by how experienced developers accumulate reusable parts:

- Each completed project contributes components to a personal library.
- Future projects draw from the library instead of rebuilding from scratch.
- Agents working on future projects can search the library and adapt existing code.

**Implementation:** When Phase 3b is complete, a `_Library/Components/` section in Holocron will contain wiki pages describing each reusable module — what it does, what it depends on, how to extract it, and links to the source files. The RAG system indexes these automatically, making them searchable.

### Marking reusable modules

During development, files with standalone extraction potential should be marked with a comment at the top:

```ts
// REUSABLE: no Holocron-specific dependencies — extractable
```

This makes future extraction trivial — `grep -rn "REUSABLE:"` over the codebase yields the full inventory in one pass.

---

## Future: Local Inference Candidates

Forward-looking notes on local-inference engines worth re-evaluating once Phase 3b ships and we have real workload data. Holocron currently routes to LM Studio (Gemma) for local + Gemini Flash / Anthropic for cloud (see "Task-based provider routing"). Local inference is a long-tail concern — only revisit if/when local quality becomes a bottleneck.

### ds4 (Salvatore Sanfilippo)

`ds4` is a native Metal-optimized inference engine for DeepSeek V4 Flash on Apple Silicon, by the creator of Redis. **Key differentiator:** treats the KV cache as a persistent resumable artifact on SSD rather than RAM-resident state. This means exact context resumption across restarts rather than Honcho-style summary reconstruction.

**Relevant to Holocron if:**
- Per-thread KV cache persistence is confirmed (not one global cache).
- DeepSeek V4 Flash quality validates against real AstraStrata workloads.

**Revisit when:** Phase 3b complete, real document ingestion pass done, local inference quality identified as a bottleneck. Do not integrate before then.

GitHub: https://github.com/antirez/ds4

---

## Out of scope for v1

Explicitly deferred to keep scope finite:

- **Configurable widget dashboard** (drag-drop layout) — fixed v1 layout
- **Telegram Interactive mode** (Inbox only)
- **pgvector embeddings + semantic search** (Level 5 — Level 4 first)
- **Graph RAG / LightRAG entity extraction** (Level 6 — only if Level 4 hits limits)
- **Voice input** (Phase 4)
- **Multimodal ingestion** (PDFs, images, video — Level 7)
- **Per-task auto-routing override beyond manual swap** (manual hot-swap only)
- **HUD charts/graphs** (text + numbers + dots only in v1)
- **Cross-thread permission modal** (deferred from MVP)
- **MCP integration** (Holocron uses IPC; MCP could be added later for external clients)
- **Direct cloud API integrations** (Google Drive API, etc. — iCloud-only sync)

If Level 4 turns out insufficient for retrieval quality, Level 5/6 upgrade is straightforward — add `embedding vector(768)` columns and pgvector index without breaking existing queries.

---

## Implementation phases

Phase 3 splits into three sub-phases. Each ships usable value; if anything stalls, you have a working product at the previous phase boundary.

### Phase 3a — Search foundation (1-2 weeks)

Goal: end with a working Search tab in Codex, ingestion happening automatically.

| # | Step | Files touched |
|---|---|---|
| 1 | Postgres schema migration: rag_documents + rag_tags + rag_document_tags + rag_operations_log + rag_config + indexes | `editor/scripts/db-setup.ts`, new migration file |
| 2 | iCloud root migration helper: detect existing `_Projects` and `_Library`, prompt to move to iCloud path | `Settings → Connections → Holocron Root` enhancement |
| 3 | Ingestion pipeline (Pass 1): chokidar trigger → Redis queue → Gemini Flash tag extract → DB insert | `src/main/ragIngest.ts` (new), `src/main/ipc.ts` |
| 4 | Cost-tracking middleware: every LLM call writes rag_operations_log with cost_usd | `src/main/llmClient.ts` (new) |
| 5 | Anthropic SDK integration: add Claude Sonnet provider | `src/main/llmClient.ts`, `Settings → Connections` |
| 6 | HUD tab + widgets (status strip, stats grid, recent activity, recent insight placeholder) | `src/renderer/src/components/hud/` (new tree) |
| 7 | Codex tab shell + Search sub-tab: keyword search via tsvector, filter by root/source_type/project | `src/renderer/src/components/codex/` (new tree) |
| 8 | Hot-swap provider pill in chat input | `ChatPane.tsx` enhancement |
| 9 | Double-space → period keymap | `markdownConfig.ts` |

**Ship gate:** can drop a markdown file into `_Library/`, see it appear in Search results within 30 seconds, click through to read it. HUD shows the document count incrementing.

### Phase 3b — Wiki + connections + Codex Mind affordances (1-2 weeks)

Goal: end with compiled wiki pages, connection graph, and the Codex ↔ Projects bridges.

| # | Step | Files touched |
|---|---|---|
| 10 | Wiki compilation pipeline (Pass 2): after every 5 ingests, recompile affected wiki pages via Gemini Flash | `src/main/ragWiki.ts` (new) |
| 11 | Wiki sub-tab UI: grid of pages, readable view, regenerate button | `library/Wiki.tsx` (new) |
| 12 | Wikilink-as-edge insertion (Pass 1 step e): scan ingested doc against wiki titles, insert `[[wikilinks]]`, write back to disk, log relationships | `ragIngest.ts` extension |
| 13 | Tag-overlap relationship discovery (Pass 1 step f): batch insert relationships for shared tags | `ragIngest.ts` extension |
| 14 | Cmd+K wikilink picker | `WikilinkPicker.tsx` (new), keymap |
| 15 | Per-tab agent chat sidebar in Codex | `library/AgentSidebar.tsx` (new) |
| 16 | Re-ingest trigger UI: Pending Actions card on HUD, Re-ingest button per file | `HUD.tsx`, `Codex/Search.tsx` |
| 17 | Telegram Inbox: Cloudflare Worker + chokidar special-case for `_Inbox/Inbox.md` | external (Worker repo) + `ragIngest.ts` |

**Ship gate:** a fresh document gets ingested, automatically wikilinked to existing concepts, surfaces in Search and Wiki views. Cmd+K in editor picks from compiled wiki pages. Telegram message lands as an `_Inbox/Inbox.md` entry within 30 seconds, gets ingested.

### Phase 3c — Synthesis + Mind + Graph (2-3 weeks)

Goal: end with the full compounding loop — synthesis essays generated and captured back, Mind tab functional, graph view rendering.

| # | Step | Files touched |
|---|---|---|
| 18 | Synthesis pipeline (Pass 4): query → retrieve top chunks via FTS+tags → Sonnet synthesizes essay → store in rag_syntheses | `src/main/ragSynthesize.ts` (new) |
| 19 | Syntheses sub-tab UI: list of essays, Capture button, Save as Report button | `library/Syntheses.tsx` (new) |
| 20 | Capture-to-RAG (Pass 5+6): re-ingest synthesis as source_type='synthesis', recompile affected wiki pages | `ragIngest.ts` extension |
| 21 | Mind tab: Insights feed (Honcho dreams + captured syntheses), Talk-to-Mind chat, Manual Synthesis trigger | `src/renderer/src/components/mind/` (new tree) |
| 22 | Honcho dream polling: every 6h + on app launch, fetch new syntheses from Honcho | `src/main/honchoBridge.ts` (extension) |
| 23 | Pull-into-thread action: Mind insight → active thread system context | `Mind.tsx`, `useLMStream.ts` extension |
| 24 | Graph sub-tab UI: Cytoscape.js mind map, zoom/pan, filter by tag/project, click node → side panel | `library/Graph.tsx` (new), Cytoscape dep |
| 25 | Cost ceiling enforcement: hard-stop at 100% of daily budget if enabled | `llmClient.ts` extension |

**Ship gate:** generate a synthesis essay from "Talk to the Mind" → review it → Capture → see it appear in Codex Search + drive a wiki page recompile. The compounding loop is closed.

---

## Phase 5: Project Finalization Checklist

When Holocron reaches feature-complete status, before declaring it done, run through this finalization process. This is the closeout protocol — what gets done after Phase 3c ships and before Holocron transitions from "in-development" to "in-use as a stable foundation."

### Code health

- [ ] Run full codebase audit — find and remove dead code, unused exports, redundant state, oversized files
- [ ] Remove all diagnostic logging (`[ChatDiag]`, etc.)
- [ ] Verify `tsc --noEmit` clean with zero warnings
- [ ] Verify `npm run build` produces no warnings
- [ ] Review `ipc.ts` for handlers with no renderer consumers
- [ ] Review all stores for unused state fields

### Component library extraction

- [ ] Produce component inventory — list every module, its dependencies, and extraction potential (the `REUSABLE:` grep from §"Planned: Component Codex & Code Reuse" produces the v0 of this list)
- [ ] Extract the markdown editor as a standalone npm package
- [ ] Extract the RAG pipeline as a standalone module
- [ ] Extract the LLM client as a standalone module
- [ ] Create `_Library/Components/` wiki pages for each
- [ ] Document each component's API surface and usage examples

### Documentation

- [ ] Update all architecture docs to reflect final state
- [ ] Ensure `DATA_MODEL.md` matches actual implementation
- [ ] Write a "How to deploy Holocron fresh" guide
- [ ] Write a "How to extend Holocron" guide for future agents

### Packaging

- [ ] Build and test the distributable Electron app
- [ ] Verify the app runs clean on a fresh machine with no development dependencies
- [ ] Consider a stripped-down "Holocron Scribe" build — just the markdown editor and LLM chat, no RAG pipeline, for sharing with others
- [ ] Document what a "Holocron Scribe" minimal build would include and exclude

### Agenteryx readiness

- [ ] Expose Holocron HTTP API surface for Agenteryx integration
- [ ] Document all API endpoints in `architecture-v3.md`
- [ ] Verify namespace isolation is clean enough for multi-module federation
- [ ] Write Agenteryx integration spec

### Knowledge library

- [ ] Populate `_Library/Components/` with all reusable modules
- [ ] Ensure the RAG system has indexed all component docs
- [ ] Test that an agent can find and adapt components via search
- [ ] This library becomes the foundation for all future projects

---

## Cross-references

| Decision | Source |
|---|---|
| Level 4 first, defer 5-6 | "7 Levels of Claude Code & RAG" transcript |
| iCloud as transport | Conversation 2026-05-06 |
| Wikilink-as-edge | Conversation 2026-05-06 |
| Hot-swap provider pill | Conversation 2026-05-06 |
| Sonnet for synthesis, Flash for transformation | Conversation 2026-05-06 |
| Compounding loop 6 passes | Carpathia RAG TikTok transcript (1) + (2) |
| Mind tab as Honcho surface | Conversation 2026-05-06 |
| FTS5 → tsvector correction | gotcha.md discipline + this spec |
| No pgvector in v1 | Conversation 2026-05-06, "7 Levels" transcript |
| Telegram Inbox-only v1 | Conversation 2026-05-06 + memory-engine-evaluation.md |

---

## Open items (deferred design decisions, not blockers)

- **Wiki page disk format:** write each compiled wiki page to disk under `_Library/Wiki/<slug>.md`. The DB row is a metadata cache; the markdown file is the durable artifact (rebuildable index pattern from §"Architectural decisions"). Confirm during 3b.
- **Inbox auth:** what's the Telegram user-ID whitelist mechanism — env var, settings field, hardcoded? Recommend: env var on the Worker. Confirm during 3b.
- **Honcho dream polling cadence:** every 6h is a guess. May want it event-driven (Honcho push) or longer (every 12h). Confirm during 3c after observing first dreams.
- **Graph layout algorithm:** Cytoscape default vs `dagre` (hierarchical) vs `cose-bilkent` (force-directed). Confirm during 3c after testing with real data.
- **Per-task auto-routing override file:** future addition that lets user configure "always Sonnet for X" without manual swap. Out of scope v1; add to Settings later if requested.
