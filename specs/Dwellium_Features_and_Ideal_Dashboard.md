# Dwellium — Complete Feature List & Ideal Dashboard

**Source:** `DWELLIUM_FEATURE_SPEC_v2.md` (Andy Zohoury, June 2026) + `Combined HTML Report Design System.md`
**Compiled:** June 4, 2026 · for Ilya Klipinitser / Hearth Beacon

**Status legend**

| Mark | Meaning |
|---|---|
| ✅ | Acknowledged as added/improved (verify behavior matches spec) |
| 🔁 | Present but behaving differently / needs a fix |
| ⚠️ | Verify Friday (observed under AntiGravity port-conflict env) |
| ❌ | Explicitly absent / "not in build" |
| ➕ | Target capability to build (no current-state claim in spec) |

---

# PART A — Complete Feature List

## 1. Recently Added / Acknowledged (verify behavior)

| # | Feature | Status |
|---|---|---|
| 1.1 | **Timeline** view | ✅ |
| 1.2 | **Kanban board with full tag system** — tags addable to any widget, route into the project | ✅ |
| 1.3 | **Multiple email accounts** — link more than one email | ✅ |
| 1.4 | **Autonomous run library** — agents run unattended for a configurable 2–8h window | ✅ |
| 1.5 | **Task assignment + timestamps** — assign to self/Lisa/Stella/ARA/anyone; independent completion + report; all reversible; full audit log; custom fields per assignee type (lawyer, PM, maintenance…) | ✅ |
| 1.6 | **Speaker-recognition library** — voice matching; search all conversations a person was in; "what did [person] tell me about X" → answer + source transcript | ✅ |
| 1.7 | **Full PDF suite** — built-in PDF editor + Sterling PDF (open-source) as secondary | ✅ |
| 1.8 | **Hermes** — present in system | ✅ |
| 1.9 | **Skills & automations** — slash-command skills, drop-folder automations, Claude skills integration | ✅ |

## 2. Current-Build Observations (fixes & checks)

| # | Item | Status |
|---|---|---|
| 2.1 | **Theme/color uniformity** — some panels don't switch theme; buttons/pills with non-responsive colors. Target: every color = CSS custom property | ⚠️🔁 |
| 2.2 | **Module error states** — unconnected modules must show a clean "not yet connected" placeholder, not a React error | 🔁 |
| 2.2b | **Inbox widget** opens too small to use | 🔁 |
| 2.3 | **API connectivity** — active provider clearly visible + live connection-status indicator + per-provider "Test" button | ⚠️❌ |
| 2.4 | **Workspace path visibility** — show workspace root in UI; saved files navigable in file explorer | ❌ |
| 2.5 | **System-wide content search** — keyword/semantic search across all content (sidebar filter ≠ search) | ❌ |
| 2.6 | **Version button increments** — each save → v1→v2→v3, preserving prior versions (currently stuck at "v1") | 🔁 |
| 2.7a | **Tabs visible in all window states** — currently disappear when maximized | 🔁 |
| 2.7b | **Reduce header chrome** — content should be ≥70% of height; remove persistent "Drag outside window to pop out" banner | 🔁 |
| 2.7c | **Panel positions** — Contents left, minimap right edge, ARA chat docked right column; none floating over the doc | 🔁 |
| 2.8 | **Layout grid lines** — only show in layout-edit mode; invisible in normal use | 🔁 |
| 2.9 | **Window management (3 simultaneous)** — drag by tab header (reorder/move), drag by title bar (move container), pull out to float + re-dock | 🔁 |
| 2.10 | **Text size & density** — larger, readable defaults; comfortable spacing; clickable control sizes (esp. File Explorer, Inbox Zero, control panels) | 🔁 |
| — | **Env fix:** clear AntiGravity install (port conflict on localhost) before running Dwellium | ⚠️ |

## 3. UI Design System — Target Aesthetic

| # | Feature |
|---|---|
| 3.1 | Match the **HTML-report design system** (attached) as the primary visual reference |
| 3.2 | **CSS-variable-driven theming** — no hardcoded hex anywhere; theme = swap token values; dark/light = single `data-theme` change |
| 3.3 | **Premium "bento" cards** — cursor-tracked radial spotlight, 1px `--border` → `--border-hover`, `translateY(-3px)` hover lift, 15px radius (8px small / 999px pills), 200ms ease transitions |
| 3.4 | **Icon system — no emojis in UI controls** — use **Lucide Icons** (24×24, CSS-tintable). Emoji OK only in user/AI/document content |
| 3.5 | **Header/chrome ratio ≤15–20%** — title bar 28–32px, nav tabs single row 32–36px, no extra persistent chrome rows, replace pop-out banner with pin/dock icon |
| 3.6 | **Typography** — Inter Tight; body 15–16px/400/1.65; labels 13px/500; min 11px; heading steps 20/17/13px; no gradient text in app UI (use `--ink`) |
| 3.7 | **Theme/skin system** — Dark (default), Light, **"Fey"** (aspirational premium earthy/warm), user-customizable via Settings token editor |

## 4. File System & Workspace

| # | Feature |
|---|---|
| 4.1 | **Workspace dir + optional iCloud sync** — two-way (dashboard ↔ Finder) via file watcher; root configurable + visible |
| 4.2 | **Hierarchy: Domain → Project → Thread** — each Thread = brain-dump (append-only) + notes + versioned reports + references + system/metadata; maps to real folders |
| 4.3 | **File Explorer** (AntiGravity × Obsidian × Finder) — see sub-list below |
| 4.4 | **Domain isolation & scoped views** — querying stays scoped to Thread unless explicitly expanded; cross-Domain is deliberate, not auto from tag overlap |

**4.3 — File Explorer capabilities**

- *Tabs:* open files as closeable tabs, "Close All", download + split buttons
- *Navigation:* expand arrow (▶) inline; double-click folder to enter; back/home buttons; right-click → "Show in Finder"; quick-jump to any Domain/Project/Thread; lock a pane to a Thread
- *Sort/display:* A↓ / ⏱ toggle (folders first); file-type badges (.md/.pdf/.txt/.json/.docx); expand/collapse + "Expand all" (BFS depth limit) / "Collapse all"
- *Operations:* New File/Folder (inline rename), New inside folder, Rename, Delete (confirm), Copy Path, **Move to Thread** (modal + toast), **Re-ingest** (RAG), **Convert to Markdown** (PDF/DOCX/XLSX/CSV, OCR images, batch)
- *Drag & drop:* between panes (move; Alt=copy), into Scribe (reference link), into chat (context attach), Cmd+V image → PNG with rename
- *Split panes:* up to 3 resizable vertical panes, independent nav state, "Open in Split"
- *Thread switcher:* footer strip + expandable drawer, sortable, branched threads indented `└─`

## 5. Scribe — Document Editor

| # | Feature | Status |
|---|---|---|
| 5.1 | CodeMirror 6; **inline (Obsidian-style) markdown rendering**; debounced auto-save; **Report versioning** (v1/v2/v3, brain-dump/notes append-only); **Contents panel docked left** | ➕/🔁 |
| 5.2 | **Brain Dump / Intake tab** — sticky "Dump" tab; auto-prepends `# Prompt N` + timestamp; saves to brain-dump file; sends to agent; chat shows compact link; "Report" button after first dump | ❌ |
| 5.3 | **Right-click menu + paste variants** — Cut/Copy/Paste, **Paste+** (`⌘⇧V` smart), **Paste++** (`⌘⇧⌥V` flat), Markdown submenu (Bold/Italic/Strike/H1–H3/lists/quote/code), Clear Formatting | ➕ |
| 5.4 | **Citation (⌘L / selection toolbar)** — creates a citation pill in chat input; **does NOT auto-send**; user composes the ask | ➕ |
| 5.5 | **AI Redlines** — tracked-changes (orig + proposed); accept/reject per change or all; single + batch | ➕ |
| 5.6 | **Inline comments** — margin-anchored, sidecar JSON, per-paragraph | ➕ |
| 5.7 | **Scribe theme customization** — independent syntax theme (separate from app theme); color picker per element; auto-fork on edit; save/preview | ➕ |
| 5.8 | **3-column docking** (explorer \| editor \| chat) — `⌘⇧1` / `⌘⇧3` collapse; chat **never overlaps** doc; resizable dividers (explorer 160–480px, chat 200–520px) | 🔁 |
| 5.9 | **Sticky user message** — original message pins to top while scrolling long responses; collapses/expands | ➕ |
| 5.10 | **Drag-drop & clipboard** — explorer→editor (reference), explorer→chat (context), Cmd+V image → PNG + markdown ref | ➕ |
| 5.11 | **Editor extras** — markdown toolbar (undo/redo live, formatting, focus mode, word count), Find/Replace (`⌘F`/`⌘H`/Esc), **Focus Mode** (`⌘⇧F`), inline flags (`::flag::`/`::todo::`/`::question::`), document priority (high/normal/low badge) | ➕ |

## 6. Agent Context — Thread Assignment & Cross-Thread

| # | Feature |
|---|---|
| 6.1 | **Thread assignment** — agent "homed" to active Thread (all writes go there); active Thread shown at top; home button; explorer navigates freely regardless of home |
| 6.2 | **Cross-thread access** — drag-to-chat = read-only access (no move/re-tag); cross-thread edits create association (surfaces in both graphs); **share vs. copy** on move |
| 6.3 | **Chat history & compaction** — "Clear conversation" compresses (not deletes); extracts facts/decisions/outputs into **human-readable Memory markdown** in `System/Memory/`; raw history kept in DB; history browser (Codex/Hive) |

## 7. Knowledge & Intelligence Layer

| # | Feature |
|---|---|
| 7.1 | **RAG ingestion pipeline** — auto-ingest on create/change; AI tag extraction; namespace-aware; idempotent; cost-logged; tag-overlap edges. **Namespace term isolation** (exclude Domain/Project/Thread names from tag vocab) |
| 7.2 | **Three-tier wiki compilation** — auto synthesis pages at Thread/Project/Domain via Sonnet each ingest (overview, key concepts, open questions, citations); cold-start bootstrap; wiki pages indexed |
| 7.3 | **Synthesis layer + compounding** — capture synthesized output back into corpus; 6-pass loop (Ingest→Compile→Query&Synthesize→Capture→Return→Recompile); one-click "second-layer query" |
| 7.4 | **Foundry — document intake** — Capture (URL/paste/upload/iCloud watcher) → Triage (AI tags/location/quality) → Review (user approve) → Admit; tracked separately from ingested docs |
| 7.5 | **Knowledge graph** — d3-force, tag-overlap edges + wiki citations, Domain filter, betweenness centrality, Louvain communities + coloring, structural gap detection, double-click → Scribe |
| 7.6 | **Multi-layer architecture** — Raw Source → Wiki → Synthesis → Agent-Built Connections (compounds over time). **MCP exposure**: `rag_ingest`, `rag_query`, `rag_compile`, `rag_interview` |

## 8. Agent Management — The Hive

| # | Feature |
|---|---|
| 8.1 | **Agent cards** — status (idle/running/error), last run, recent output |
| 8.2 | **Cost attribution** — by agent and by Domain |
| 8.3 | **Manual trigger** for any agent |
| 8.4 | **Dreams panel** — surface Honcho's derived insights from conversation history |
| 8.5 | **CoPaw auto-capture** — silently extract key facts from every agent response → memory (continuous compounding) |
| 8.6 | **Schema Producer** — description → structured schema |
| 8.7 | **PRD synthesis agent** — multiple source docs → structured requirements |
| 8.8 | **Gap analysis agent** — spec + implementation → what's missing |

## 9. Friday Verification Checklist

API connectivity (Anthropic key → ARA responds) · color customization via Settings · uniform theme switching · module error states (post port-fix) · file explorer Domain/Project/Thread structure · D/P/T wiki system · version v1→v2 increment · tab visibility in fullscreen · Scribe (brain dump, redlines, versioning, drag-to-chat) · text & icon sizing.

---

# PART B — Ideal Dashboard

The dashboard the spec is aiming for: a **daily-driver workspace** for building AstraStrata — organized, findable, comfortable for multi-hour use, and visually on par with the HTML reports.

## B1. Global shell standards (apply to every widget)

| Standard | Target |
|---|---|
| **Chrome ratio** | Title bar 28–32px; nav tabs 32–36px single row; **content ≥70–85%** of window height |
| **Theme toggle** | Floating pill, top-right, persists to localStorage, respects OS `prefers-color-scheme`; Dark default + Light + Fey |
| **System-wide search** | Prominent global search bar (keyword + semantic) — distinct from the sidebar filter |
| **Workspace path** | Root path always visible; saved files navigable in File Explorer |
| **Layout grid** | Hidden in normal use; cell borders only while dragging/resizing widgets |
| **Window management** | Tab-header drag (reorder/move), title-bar drag (move container), pull-out-to-float + re-dock — all three, seamless |
| **Icons** | Lucide everywhere in controls; no emoji in chrome |
| **Typography** | Inter Tight; body 15–16px; min 11px; comfortable spacing |
| **Not-connected state** | Clean placeholder card, never a raw React error |

## B2. Ideal widget roster (grouped)

**Workspace & Writing**
- **Scribe** — primary editor (3-column docked: Contents-left \| editor \| chat-right), inline markdown, versioning, redlines, comments, brain-dump tab, focus mode
- **File Explorer** — full file manager (tabs, split panes, convert-to-markdown, move-to-thread, thread switcher)
- **Notepad / Docs** — quick notes + document viewing
- **Tag File** — app-wide tagging that routes items into projects

**Knowledge & Intelligence**
- **Knowledge Graph** — d3-force map with communities, gap detection
- **Wiki (3-tier)** — auto Thread/Project/Domain synthesis pages
- **Foundry** — capture → triage → review → admit intake pipeline
- **Global Search / Synthesis** — semantic search + one-click second-layer query
- **Codex / Hive History** — conversation + version history browser

**Agents & Automation**
- **The Hive** — agent cards, cost attribution, manual triggers, Dreams panel (Honcho), CoPaw capture
- **ARA / Stella / Hydra / Honcho / Two Brains / Hermes** — assistant agents (docked chat, never floating over content)
- **Automations & Skills** — slash-command skills, drop-folder automations, autonomous-run library (2–8h)
- **Schema Producer · PRD Synthesis · Gap Analysis** — builder agents

**Capture & Communication**
- **Inbox** (sized usable) — multi-account email
- **Transcribe + Speaker Recognition** — voice matching, "what did [person] say about X"
- **Thought Weaver** — capture/organize thoughts → tasks/people/meetings
- **Fact Check** — claim verification

**Tasks & Planning**
- **Task Board (Kanban)** — tags, assignment + timestamps, audit log, reversible actions, AI-file-backlog
- **Timeline** — chronological project view
- **Upkeep AI** — maintenance tasks

**Documents**
- **PDF Gear / PDF Suite** — built-in editor + Sterling PDF fallback

**Property Management (AstraStrata)**
- **Strata Dashboard** — properties, residents, leasing, vendors, owners, accounting, compliance, maintenance

**System**
- **Settings / Control Panel** — per-user integrations (LLM keys + live status + Test button), theme/token editor, workspace config
- **Terminal · Workspace** — power-user surfaces

## B3. Design tokens (from the report design system)

```
--bg --surface --surface-2
--accent(blue/cyan) --green --amber --red --purple --rose   (+ *-rgb)
--text --muted --ink
--border --border-hover --rule
--shadow-card --spotlight
```
Color = meaning: **blue/cyan = info · green = done · amber = pending · red = urgent · purple = queued**. Cards: radial cursor-spotlight, 15px radius, hover lift, 200ms transitions. Dark = neon palette; Light = deep-ink; both from the same variables.

## B4. North-star

> Installed and pleasant to use for hours · files organized and findable · Scribe a capable writing environment · knowledge system ingesting + surfacing synthesis · agents configurable and directable · schema/PRD tools available · UI that feels designed by people who use it.

---

*Reference codebase: `github.com/Agenteryx/agenteryx` (branch `architecture-v4-fey-theme`). UI reference: Combined HTML Report Design System.*
