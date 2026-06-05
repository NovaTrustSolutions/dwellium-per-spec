# Dwellium Dashboard — Feature Update Specification
**From:** Andy Zohoury  
**For:** Ilya Klipinitser / Hearth Beacon  
**Version:** 2 · June 2026  

---

> **Purpose of this document:** This is a brain dump and gap analysis report compiled from Andy's review of the current build and the reference codebase he has developed in parallel. It is intended to be comprehensive — features listed here may already be present in the build, but they are documented so that a full gap analysis can be performed. If a feature is already in and working as described, great. If it is present but behaving differently than described, that is worth flagging. If it is absent entirely, that is what this document is designed to surface. The goal is to make sure nothing is left to chance before moving into active AstraStrata development.

---

## 1. Recent Updates Acknowledged

A number of updates and additions have been made to the build since the initial review. The following features are noted as recently added or improved. They are acknowledged here so this document can serve as a comprehensive gap analysis rather than a list of complaints. Features that are already present should still be verified against the behavior described in Sections 4 onward, as implementation details may differ from what was expected.

- **Timeline** — added
- **Kanban board with tag system** — complete tag system; tags can be added to any widget and route into the project
- **Multiple email accounts** — can link more than one email (not limited to one)
- **Autonomous run library** — agents can run for a configurable time window (2–8 hours) without stopping to request feedback; useful for overnight or background tasks
- **Task assignment with timestamps** — tasks can be assigned to self, Lisa, Stella, ARA, or anyone else; assigned agent completes the task independently and generates a report; all actions reversible; full audit log; custom fields for specialized assignees (lawyer, project manager, maintenance, etc.)
- **Speaker recognition library** — voice matching; can search all conversations a specific person participated in; ask "what did [person] tell me about X" and the system returns the answer with the source transcript
- **Full PDF suite** — complete PDF editor built in, plus Sterling PDF (open source) as a secondary option
- **Hermes** — present in the system
- **Skills and automations** — slash-command skills; drop-folder automations; Claude skills integration

**On the Electron jankiness:** Note — if AntiGravity is running on the same machine, its backend services use different localhost ports and conflict with Dwellium's services, causing slowness and erratic behavior. The fix is to fully clear the AntiGravity installation before running Dwellium. Several of the usability issues observed may stem from this conflict rather than from Dwellium itself, and will need to be re-evaluated after a clean setup on Friday.

---

## 2. Current Build — Observations

*Note: several of these were observed under the port-conflict environment described above. Items tagged "(verify Friday)" should be retested after a clean setup before being treated as confirmed bugs.*

### 2.1 — Theme and Color System *(verify Friday)*

In the version reviewed, theme switching did not apply uniformly — some panels updated correctly in light mode while others retained dark styling. Some button and pill elements appeared to have color values that did not respond to theme changes.

Ilya indicated that colors are set as defaults and are configurable in Settings. This could not be confirmed remotely — when attempting to change colors via Settings, the result was not as expected. This will be verified together in person. If colors are configurable in Settings, the issue may be a UI discoverability problem rather than a hardcoding problem.

**Desired outcome regardless:** All colors in all components should reference CSS custom properties so that implementing a new theme requires only updating the variable declarations, never touching individual component stylesheets.

### 2.2 — Module Connectivity and Error States *(verify Friday)*

Several modules showed error states or unconnected placeholder states. Some of this is likely the port conflict. The remaining issue: modules that are genuinely not yet connected should show a clean "not yet connected" placeholder rather than a React error state. Those are different things.

The Inbox widget opened too small to be usable. This may or may not be environment-related.

### 2.3 — API Connectivity *(verify Friday — will set up in person)*

After entering an Anthropic API key in Settings and switching the active provider to ARA, ARA reported an error and did not respond. This will be resolved in person. Going forward, the settings panel should make the active provider clearly visible, with a live connection status indicator and a "Test" button for each provider.

### 2.4 — Workspace and File Location

When files are created or saved, there is no visible indication of where they are stored. The workspace root path being visible somewhere in the interface, and saved files being navigable from within the file explorer, would address this.

### 2.5 — System-Wide Search

A system-wide content search — finding documents, notes, or any other content by keyword or natural language — does not appear to be present. The sidebar filter is a navigation aid, not a search. If a vector or semantic search capability has been built into the backend, it should be accessible through a prominent search interface.

### 2.6 — Version Button Does Not Increment

The version button in Scribe repeatedly saves as "version one" without incrementing. The correct behavior: each click creates a new numbered version (v1 → v2 → v3), preserving all prior versions. The reference implementation does this correctly.

### 2.7 — Panel Layout — Chrome Competing with Content

Several observations across multiple windows:

- **Tabs only visible in split-screen mode** — when apps are maximized/full-screen, tabs disappear. Tabs should be visible and usable regardless of window state.
- **Header area is too large** — In several windows (NotebookLM was one example), the title bar, "Drag outside window to pop out" banner, app name, and navigation tabs together consume the majority of the visible window height. The content area becomes a small strip. A good rule of thumb: content should occupy at least 70% of the available height. The "Drag outside window to pop out" text banner is the most obvious candidate for removal or replacement — this should be a tooltip on hover or a small icon, not a persistent full-width text row.
- **Minimap, ARA chat, and Contents panel all on the right** — when more than one is active they stack and overlap. These need assigned, non-conflicting positions: Contents on the left, minimap on the right edge of the editor, ARA chat as a docked right column. None should float over the document.

### 2.8 — Layout Grid Lines Always Visible

The widget layout grid renders its cell borders as permanent blue lines across the interface. These should only appear when the user is explicitly in layout-editing mode (dragging or resizing widgets). In normal use the grid should be invisible. This appears to be the layout system permanently in "edit mode."

### 2.9 — Tab Drag and Window Management

Three behaviors should work simultaneously:
1. **Drag by tab header** — reorder within a panel or move to another panel, like a browser tab
2. **Drag by widget title bar** — move the entire container
3. **Pull out to float** — drag a tab completely out to detach as a floating window; drag back in to re-dock

These should feel seamless, not resistant. Currently only one of these methods works, and even that feels unreliable.

### 2.10 — Text Size and Density

Text in several widgets and panels is too small to read comfortably at default settings. This is most noticeable in the File Explorer, Inbox Zero, and control panels. Enterprise software used for multiple hours daily needs comfortable reading size and adequate spacing between elements. Icons and controls that are too small or too close together to click reliably are not usable.

---

## 3. UI Design System — Target Aesthetic

The current build's UI does not feel like it was designed for daily professional use. The goal of this section is to describe the target aesthetic concisely so it can be implemented as a coherent design system rather than a collection of piecemeal fixes.

### 3.1 — Reference Implementation

The HTML reports that have been produced for this project (meeting prep documents, term sheets, strategy documents) use a design system that represents exactly the visual direction being requested. Those reports look significantly better than the current application because they use an intentional CSS variable-driven design system with specific card effects, typography, and spacing rules.

**This design system document will be provided separately (attached).**

This document should be provided to the implementation team as the primary visual reference. The application UI should reach the same standard of clarity, polish, and visual cohesion as those reports.

### 3.2 — CSS Variable-Driven Theming

All colors in all components must reference CSS custom properties — never hardcoded hex values anywhere in a component's stylesheet.

```css
/* Every color uses a token. Example tokens: */
--bg, --surface, --surface-2
--accent, --green, --amber, --red, --purple, --rose
--text, --muted, --ink
--border, --border-hover, --rule
--shadow-card, --spotlight
```

With this system, implementing a new theme requires only updating the variable values. Switching dark/light mode is a single `data-theme` attribute change on the root element. No component stylesheets need to change.

### 3.3 — Widget / Card Design

Widgets and cards should feel like premium bento boxes, not generic divs:

- **Subtle radial gradient spotlight** that follows the mouse cursor across the card surface — a soft glow from the cursor position that fades toward the edges. This is purely a CSS custom property + JavaScript mouse position trick (no heavy animation library needed).
- **Clean 1px border** using `var(--border)`, brightening to `var(--border-hover)` on hover
- **Slight lift on hover** — `translateY(-3px)` with `box-shadow` expanding — smooth, not dramatic
- **15px border-radius** on cards; 8px on smaller elements; 999px on pills/chips
- **200ms ease transitions** on all color, border, and shadow changes — makes theme switching feel like a dimmer, not a flash

### 3.4 — Icon System — No Emojis in UI Elements

Replace Unicode emoji in UI controls, buttons, navigation, and status indicators with a proper icon library. Recommended: **Lucide Icons** (lightweight, consistent visual weight, MIT license, 24x24 base size, scales cleanly).

Emoji are informal, render inconsistently across platforms, and cannot be precisely sized or colorized with CSS. Icon libraries can be tinted with `color: var(--accent)` or any theme token and scale predictably.

Emoji remain appropriate for: user-generated content, AI responses, document content where the user has typed them. They are not appropriate for: navigation items, button labels, status indicators, widget headers.

### 3.5 — Header / Chrome Ratio

The window chrome (title bar, navigation tabs, persistent banners) should consume no more than 15-20% of the available height. The content area is why the window exists.

Specific targets:
- **Window title bar:** 28–32px maximum including traffic light controls and app name
- **Remove persistent "Drag outside window to pop out" text** — replace with a pin/dock icon in the title bar that shows a tooltip on hover
- **Navigation tabs:** single row, 32–36px height
- **No other persistent chrome rows between the nav and the content area**

### 3.6 — Typography

- **Base font:** Inter Tight (already loaded in reports; matches the target aesthetic)
- **Body copy:** 15–16px, weight 400, line-height 1.65
- **Labels and secondary text:** 13px, weight 500
- **Smallest readable text:** 11px for chips, badges, metadata — never smaller
- **Heading hierarchy:** clear size steps (20px, 17px, 13px) with weight carrying the distinction
- **No gradient text in the application UI** — gradient text is a report decoration. Application headings and labels should use `var(--ink)` for maximum readability.

### 3.7 — Theme / Skin System

The CSS variable system described above makes theming trivial to implement. Goals:

- **Dark theme** (default): deep near-black backgrounds, subtle surface elevation, neon-adjacent accent colors
- **Light theme**: clean white surfaces, deep ink text, muted accent variants
- **"Fey" theme** (aspirational): a distinct third aesthetic — earthy, warm, unique palette distinct from standard dark/light. This is the premium skin.
- **User-customizable:** once the variable system is in place, custom themes should be creatable by editing the token values in Settings

---

## 4. File System & Workspace Organization

### 4.1 — Workspace Directory and iCloud Sync

The workspace should be linked to a directory on the local filesystem and optionally iCloud Drive. Changes in either direction — creating a file in the dashboard or dropping a file into the Finder folder — should be reflected automatically. A file watcher handles external changes; dashboard operations write directly to disk. Workspace root configurable and visible in the interface.

### 4.2 — Workspace Hierarchy

Suggested three-level hierarchy: **Domain → Project → Thread**

Each Thread folder contains: a brain dump file (append-only), a notes file, a versioned reports folder, a references folder, and a system folder for metadata. This structure corresponds to actual folders on disk. This is a recommendation — alternative organizational models are worth discussing.

### 4.3 — File Explorer

A comprehensive file manager in the style of AntiGravity × Obsidian × macOS Finder. Key capabilities:

**Open Files / Tab Bar:**
- Open files shown as tabs at the top; individually closeable; "Close All" button
- Download and split buttons in the header

**Navigation:**
- Click the expand arrow (▶) to expand the folder tree inline
- Double-click the folder name to navigate into it (Finder-style)
- Back button (up one level), home button (workspace root)
- Right-click any file → "Show in Finder"
- Quick jump to any Domain/Project/Thread without drilling the full tree
- Hierarchy scoping: lock a pane to a Thread when working in Scribe

**Sort and Display:**
- Toggle alphabetical ("A↓") or last-modified ("⏱") sort; folders first
- File type badges (.md, .pdf, .txt, .json, .docx)
- Expand/collapse individual folders; "Expand all" (BFS with depth limit) and "Collapse all"

**File Operations (toolbar and right-click):**
- New File / New Folder (with inline rename prompt, Finder-style)
- New File/Folder Inside — creates inside the right-clicked folder
- Rename, Delete (confirmation), Copy Path
- Move to Thread — modal listing all threads; moves file with a success toast
- Re-ingest — manually triggers RAG re-ingest
- Convert to Markdown — PDF, DOCX, XLSX, CSV; OCR option for images; batch on multi-select

**Drag and Drop:**
- Between panes and folders (move; Alt = copy)
- Into Scribe editor (inserts reference link)
- Into agent chat (attaches as context)
- Cmd+V in file pane: paste clipboard image as PNG with rename prompt

**Split Panes:**
- Up to three independent resizable panes stacked vertically, each with its own navigation state
- "Open in Split" right-click option on any folder

**Thread Switcher:**
- Footer strip showing the active thread; expandable drawer listing all threads
- Sortable by name or last modified; branched threads indent under parent with └─ prefix

### 4.4 — Domain Isolation and Scoped Views

Domains, Projects, and Threads should each be relatively self-contained knowledge spaces. Browsing and querying within a Thread stays scoped to that Thread unless explicitly expanded. Cross-Domain exploration should be a deliberate action, not something that happens automatically from common-word tag overlap.

---

## 5. Scribe — Document Editor

### 5.1 — Core Editor

- CodeMirror 6 with markdown syntax highlighting
- **Inline markdown rendering (Obsidian-style)** — formatting renders in the editor itself; raw syntax visible when cursor is on the line, formatted output shown when cursor moves away. No separate preview pane.
- Auto-save (debounced)
- Document versioning — saving a Report creates a new numbered version (v1, v2, v3…) rather than overwriting. Brain dumps and notes are append-only.
- **Contents panel** — persistent, left side of the editor; not a disappearing dropdown, not placed on the right

### 5.2 — Brain Dump / Intake Tab

A sticky, always-visible "Dump" tab in the Scribe header. Clicking it switches the center column to a full-height dump intake area. Submitting a dump auto-prepends a `# Prompt N` header with timestamp, saves to the thread's brain dump file, and sends to the agent as a user message. The chat shows a compact link, not the raw text. A "Report" button appears after the first dump to generate a structured report from accumulated dumps.

**This feature is not currently in the Dwellium build.**

### 5.3 — Right-Click Context Menu and Paste Variants

Right-click menu providing:
- Cut, Copy, Paste (verbatim)
- **Paste+** (`Cmd+Shift+V`) — smart paste respecting markdown structure
- **Paste++** (`Cmd+Shift+Alt+V`) — raw paste stripping all whitespace to flat string
- **Markdown submenu (▶)** — Bold, Italic, Strikethrough, H1–H3, Bullet List, Numbered List, Blockquote, Code Block
- Clear Formatting

### 5.4 — Citation Behavior (Cmd+L / Selection Toolbar)

Selecting text and triggering a citation creates a citation pill in the chat input area ("❖ citation: line X"). **The pill appears ready for the user to compose their own message — it does not auto-send or auto-ask the agent anything.** The user decides what to ask about the cited passage.

### 5.5 — AI Redlines

Agent-proposed edits displayed as tracked changes (original + proposed side-by-side). User accepts or rejects per change, or accepts all. Works for single edits and batches.

### 5.6 — Inline Comment System

Margin-anchored comments stored in a sidecar JSON file. Separate from document content, visible in the editor margin, each associated with a specific paragraph.

### 5.7 — Scribe Theme Customization

Independent syntax highlighting themes, separate from the application's dark/light theme. Color picker for every syntax element (H1–H4, Bold, Italic, Code, Code string, Blockquote, Horizontal rule, Link text, Link URL, Frontmatter/meta). Auto-fork on preset edit. Save custom themes. Live preview. App theme and editor theme are independent.

Reference: `editor/src/renderer/src/components/settings/ScribeTab.tsx` and `scribeThemes.ts`

### 5.8 — Panel Layout and Docking

Three-column layout (file explorer | editor | chat) — all docked, no overlapping:
- File explorer: `Cmd+Shift+1` to collapse
- Chat panel: `Cmd+Shift+3` to collapse; thin 12px re-expand strip when collapsed
- **Chat panel must never overlap the document**
- Resizable dividers: file explorer 160–480px, chat 200–520px

### 5.9 — Agent Chat — Sticky User Message

When scrolling through a long agent response, the user's original message stays pinned at the top of the viewport (`position: sticky; top: 0`). Collapses to a compact band while scrolled; expands when scrolled back.

### 5.10 — Drag-and-Drop and Clipboard

- Files from file explorer dropped onto editor: inserts reference
- Files from file explorer dropped onto chat: attaches as agent context
- Cmd+V when clipboard has an image: saves as PNG in active folder, inserts markdown reference

### 5.11 — Additional Editor Features

- **Markdown toolbar** — Undo/Redo (live history state), Bold/Italic/Strikethrough, H1–H3, lists, Blockquote, Code Block, flag markers, Focus Mode, word count. History boundary fix required before shipping undo/redo buttons.
- **Find and Replace** — `Cmd+F` / `Cmd+H` / `Escape`
- **Focus Mode** — `Cmd+Shift+F`; sidebar and chat hidden; editor expands full width
- **Inline flag/marker system** — `::flag::`, `::todo::`, `::question::` with colored indicators and Codex search integration
- **Document priority** — high/normal/low with badge in tab header and Codex list

---

## 6. Agent Context — Thread Assignment & Cross-Thread Access

### 6.1 — Thread Assignment

The agent in Scribe is always "homed" to the active Thread — all writes go there. The active Thread is always displayed at the top of the workspace. A home button in the file explorer instantly returns to the home Thread's directory. The file explorer can navigate freely throughout the workspace regardless of which Thread is home.

### 6.2 — Cross-Thread Document Access

- **Drag to chat (read-only):** dragging a document from any Thread into the agent chat gives read access without moving or re-tagging the document
- **Cross-Thread edits:** if the active agent edits a document belonging to a different Thread, a cross-thread association is created; the document surfaces in both threads' knowledge graph
- **Share vs. copy:** when moving a document between Threads, the user can share it (one file, edits reflected everywhere) or copy it (independent duplicate)

### 6.3 — Chat History and Compaction

"Clear conversation" does not delete history — it compresses it. On clear: summarization extracts key facts, decisions, and outputs into a Memory file stored in the Thread's `System/Memory/` folder as **human-readable markdown** (openable in Scribe at any time). Future sessions load the compressed Memory as context. Raw history is preserved in the database. A conversation history browser (Codex or Hive) enables navigation to past sessions.

---

## 7. Knowledge & Intelligence Layer

### 7.1 — RAG Ingestion Pipeline

Auto-ingest on file create/change via file watcher. AI-powered tag extraction per document. Namespace-aware (documents associated with their Domain/Project/Thread). Idempotent. Cost-logged. Tag-overlap edges for graph connections.

**Namespace term isolation:** Domain/Project/Thread names should be excluded from the tag vocabulary to prevent common structural labels from creating spurious cross-Domain connections.

### 7.2 — Three-Tier Wiki Compilation

Auto-generated synthesis pages at Thread, Project, and Domain levels via Claude Sonnet on each ingest. Each page: overview, key concepts, open questions, source citations. Cold-start bootstrap on first launch. Wiki pages themselves indexed as searchable documents.

### 7.3 — Synthesis Layer and Compounding Feedback

When a query produces a synthesized output, that output can be captured as a document and fed back into the corpus. Six-pass compounding loop: Ingest → Compile → Query & Synthesize → Capture → Return → Recompile. A "second-layer query" (re-query using first synthesis as additional context) is a named one-click operation.

### 7.4 — Foundry — Document Intake

Upstream intake pipeline: **Capture** (URL, paste, file upload, iCloud Drive watcher) → **Triage** (AI proposes tags, target location, quality assessment) → **Review** (user approves/modifies) → **Admit** (content enters the knowledge pipeline). Foundry items track separately from ingested documents.

### 7.5 — Knowledge Graph

d3-force visualization with tag-overlap edges and wiki citations. Domain filter. Betweenness centrality highlighting. Louvain community detection with cluster coloring. Structural gap detection. Double-click to open in Scribe.

### 7.6 — Multi-Layer Knowledge Architecture

The knowledge base compounds over time through a four-layer structure: Raw Source → Wiki Compilation → Synthesis → Agent-Built Connections. The system gets smarter the more it is used.

**MCP exposure:** If the knowledge base is accessible via MCP, it can be queried from any Claude session — not just within the dashboard. Suggested tools: `rag_ingest`, `rag_query`, `rag_compile`, `rag_interview`.

---

## 8. Agent Management — The Hive

- **Agent cards** — status (idle/running/error), last run, recent output
- **Cost attribution** by agent and by Domain
- **Manual trigger** for any agent
- **Dreams panel** — surface Honcho's derived insights from conversation history
- **CoPaw auto-capture** — silently extract key facts from every agent response and write to memory (~50 lines of code; makes memory compound continuously)
- **Schema Producer** — given a description of a data structure, produces a structured schema
- **PRD synthesis agent** — given multiple source documents, synthesizes into structured requirements
- **Gap analysis agent** — given a specification and implementation, identifies what is missing

---

## 9. Items to Verify Together on Friday

- [ ] API connectivity — configure Anthropic key, confirm ARA responds
- [ ] Color customization — verify colors are changeable via Settings as described
- [ ] Theme switching — confirm light mode applies uniformly after clean install
- [ ] Module error states — retest after clearing AntiGravity port conflict
- [ ] File explorer — test domain/project/thread structure, confirm it matches the hierarchy spec
- [ ] Domain/Project/Thread wiki system — Ilya confirmed it's in the shell; verify it matches the spec
- [ ] Version button — confirm proper v1→v2 incrementing
- [ ] Tab visibility in fullscreen — test whether tabs are visible when windows are maximized
- [ ] Scribe — test brain dump, redlines, versioning, drag-to-chat
- [ ] Text and icon sizing — evaluate on the clean Electron build

---

## 10. Goal

A dashboard that can be used comfortably for hours of daily work as the primary working environment for developing AstraStrata. The better this build is, the faster the PRD work can proceed — which is the critical path to completing the full project.

Success means: the system is installed and pleasant to use; files are organized and findable; the Scribe editor is a capable writing environment; the knowledge system is ingesting content and surfacing useful synthesis; agents can be configured and directed; schema and PRD tools are available; and the overall UI feels like it was designed by people who use it.

---

*Dwellium Feature Update Specification v2 | June 2026*  
*Reference codebase: `https://github.com/Agenteryx/agenteryx` — branch `architecture-v4-fey-theme`*  
*UI Reference: Combined HTML Report Design System (attached)*
