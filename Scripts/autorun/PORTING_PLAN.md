# Scribe Widget Porting Plan — Holocron → Dwellium

**Branch:** `feat/scribe-widget` at `ed11144`
**Created:** 2026-05-27
**Author:** Claude Opus 4.7 (Cycle 2 — discovery + plan)
**Status:** Awaiting Ilya review before Cycle 3 begins

---

## 1. Architecture Summary

### What Scribe Is

Scribe is a CodeMirror 6 markdown editor with AI-assisted editing capabilities. In Holocron/Agenteryx, it serves as the primary write surface — the place where the user drafts, edits, and refines documents. It is built on CodeMirror 6's extension system: a base markdown parser (`@codemirror/lang-markdown` with GFM Table support via `@lezer/markdown`), layered with custom ViewPlugins and StateFields for live-preview rendering (hiding markup characters, rendering tables as HTML, colorizing list markers and blockquote marks, replacing horizontal rules with styled `<hr>` elements, highlighting `==text==` spans), plus three domain-specific plugin systems:

1. **AI Redlines** (`redlinePlugin.ts`, 241 lines): An LLM proposes replacement text for a selected passage. The original text is highlighted with a red tint; a green block widget renders below it with the proposed replacement and Accept/Reject buttons. Accepting replaces the text inline; rejecting removes the widget. A `RedlineNavigator` provides "Redline N of M" navigation with Accept All / Reject All bulk actions. Redlines integrate with comments — accepting a redline that originated from a comment auto-resolves that comment.

2. **Inline Comments** (`commentPlugin.ts`, 155 lines): Users annotate text ranges with comments. An amber underline marks the commented range; a 💬 indicator widget sits at the end. Clicking opens a `CommentEditor` overlay positioned at the comment's first line. Comments can be edited, deleted, resolved, or "Submitted to Agent" (which sends the comment text + original passage as a citation pill to the chat, triggering a redline response).

3. **Smart Paste** (in `markdownConfig.ts`): Three paste modes — Cmd+V (verbatim), Cmd+Shift+V (smart: strips hard line breaks from LLM output while preserving markdown structure), Cmd+Shift+Alt+V (raw: collapses all whitespace). A double-space-period auto-correction (iOS-style) also lives here.

Additional UI components include:
- **TabBar**: VS Code-style preview tabs (italic for preview, double-click to pin, close button)
- **DocumentToolbar**: Persistent per-document actions (+ Version, Table of Contents, Delete)
- **Minimap**: A 64px right-edge strip showing a scaled-down view of the document with heading colors and comment markers, plus a viewport indicator and click-to-scroll
- **TableOfContents**: A floating overlay listing all markdown headings with click-to-jump
- **DumpMode**: A "Brain Dump" compose surface — a separate CodeMirror instance with the same markdown config, for stream-of-consciousness writing that gets appended to a dump file and sent to the LLM
- **PDFViewer**: Reads a PDF file via Electron IPC, creates a blob URL, renders in an iframe

### How It's Wired in Holocron (Electron)

Holocron is an Electron app. The architecture is split:

- **Main process** (`projectFs.ts`, 1526 lines + `sessionFs.ts`, 114 lines): All file system operations run in Node.js. Functions like `readDir`, `createFile`, `readFile`, `writeFile`, `versionCreate`, `commentsRead`, `commentsWrite`, `dumpAppend`, `reportGenerate`, and `ingestDeleteDocument` are exposed to the renderer via Electron's IPC bridge (`window.electronAPI.*`). The main process also handles project/thread CRUD, thread metadata, memory files, branching, and rename cascades — all backed by `fs.promises` for disk and PostgreSQL queries via `pg` for the RAG database.

- **Renderer process**: React components call `window.electronAPI.readFile(path)`, `window.electronAPI.writeFile(path, content)`, `window.electronAPI.commentsRead(path)`, etc. State is managed with Zustand stores (`scribeStore`, `settingsStore`). Auto-save fires 1 second after the last edit via `useAutoSave`.

### How It Needs to Be Rewired in Dwellium (Express + React)

Dwellium is a web app (React 19 + React Router v7 framework-mode), not an Electron app. The `window.electronAPI` bridge does not exist. The rewiring strategy:

1. **File ops become Express routes.** Every `window.electronAPI.*` call in Scribe maps to a REST endpoint on Dwellium's Express backend (the sibling `ai-dashboard369-file-manager` repo, or inline routes if the backend doesn't exist for Scribe-specific ops). The Scribe widget calls `fetch('/api/scribe/files/...')` instead of `window.electronAPI.readFile(...)`.

2. **Scribe registers as a widget.** It gets an entry in `widgetRegistry.ts` (like every other widget — `id: 'scribe'`, icon, lazy component, min dimensions) and a dock item in `hierarchy.ts` (group: `'Filing Cabinet'` or `'AI Tools'` — Ilya's call).

3. **No Electron-specific APIs.** `window.electronAPI.readFileAsBuffer` (used by PDFViewer for binary PDF reads) → skip; Dwellium already has PDFGear. `window.electronAPI.onScribeInsert` (IPC listener for chat-to-editor inserts) → replaced by a Zustand store action. `window.electronAPI.threadsRename` → backend route.

4. **Zustand stores carry over almost directly.** Holocron's `scribeStore` manages `openFiles`, `activeFilePath`, `fileContents`, `redlines`, `commentsByFile`, `editorMode`, `selectionToolbar`, etc. This translates 1:1 to a Dwellium-side `scribeStore` with the same shape, just replacing the persistence layer (localStorage or backend calls instead of Electron config).

### Where LLM Calls Integrate

Dwellium already has a central LLM router at `qualia-shell/src/lib/llmClient.ts` with a `callLlm(req, bundle.llm)` function that routes to the user's active provider (Anthropic/OpenAI/Gemini/Local/Custom). The per-user integrations bundle is accessed via the `useIntegrations` hook (`qualia-shell/src/hooks/useIntegrations.ts`).

Scribe's AI redlines will call `callLlm` with:
- A system prompt instructing the model to return a JSON array of redline suggestions
- The user's selected text as the prompt
- `responseFormat: 'json'`

The response is parsed into `Redline[]` objects and pushed into the scribeStore, which triggers the `redlinePlugin` to render the inline widgets.

### State Management Approach

CodeMirror 6 owns the editor state (document text, cursor position, selection, decorations). The Zustand `scribeStore` owns the application-level state (which files are open, which is active, redlines, comments, scroll positions, selection toolbar state). The two are bridged by:
- An `EditorView.updateListener` that pushes doc changes from CodeMirror → scribeStore
- ViewPlugins that subscribe to scribeStore changes and dispatch CodeMirror effects to rebuild decorations

This pattern carries over unchanged to Dwellium. No per-user namespacing is needed for the editor state itself (it's ephemeral — one user, one browser session). File storage on the backend should be namespaced by `user.id` if multi-user, following the existing `integrationsUserIdHolder` pattern.

---

## 2. File-by-File Port Map

| # | Holocron Source | Dwellium Target | Notes |
|---|----------------|-----------------|-------|
| 1 | `scribe/ScribePane.tsx` (999 L) | `qualia-shell/src/components/Scribe/ScribePane.tsx` | **Entry point.** Remove `window.electronAPI.*` calls → replace with fetch to `/api/scribe/*`. Remove `ScribeSubHeader` (breadcrumb is Holocron-specific — project/thread/domaine). Remove `RenameOrgModal` import (Holocron rename UX). Keep: CodeMirror mount, plugin composition, context menu, markdown formatting actions, doc-change listener, redline/comment position mapping. Props change: no `sidebarCollapsed`/`onToggleSidebar` — Dwellium widgets manage their own chrome. |
| 2 | `scribe/redlinePlugin.ts` (241 L) | `qualia-shell/src/components/Scribe/redlinePlugin.ts` | **Port verbatim.** Only dependency on scribeStore (Zustand) — same pattern works. Remove `console.log` debug lines. Replace `window.electronAPI.commentsWrite` in `acceptRedline` → fetch to backend. |
| 3 | `scribe/commentPlugin.ts` (155 L) | `qualia-shell/src/components/Scribe/commentPlugin.ts` | **Port verbatim.** Pure CodeMirror + Zustand. No Electron deps. |
| 4 | `scribe/tablePlugin.ts` (176 L) | `qualia-shell/src/components/Scribe/tablePlugin.ts` | **Port verbatim.** Pure CodeMirror StateField. Zero external deps. |
| 5 | `scribe/selectionObserver.ts` (115 L) | `qualia-shell/src/components/Scribe/selectionObserver.ts` | **Port verbatim.** Pure CodeMirror ViewPlugin + Zustand. Remove `console.log` diagnostics. |
| 6 | `scribe/markdownConfig.ts` (739 L) | `qualia-shell/src/components/Scribe/markdownConfig.ts` | **Port with theme adaptation.** The `holocronTheme` (`EditorView.theme`) uses hardcoded hex colors — adapt to use Dwellium's CSS custom properties (`var(--bg-base)`, `var(--text-primary)`, etc.) where possible, keep CodeMirror-specific colors for syntax elements. Smart paste + raw paste + double-space-period carry over unchanged. The mark-hiding, list-marker, blockquote-mark, HR, highlight, and fenced-code plugins are all self-contained. |
| 7 | `scribe/scribeThemes.ts` (206 L) | `qualia-shell/src/components/Scribe/scribeThemes.ts` | **Port verbatim.** Pure data + a `buildHighlightStyle` factory. Rename presets from "Holocron Default" / "Agenteryx Default" → "Dwellium Default" or keep as-is (cosmetic). |
| 8 | `scribe/useAutoSave.ts` (31 L) | `qualia-shell/src/components/Scribe/useAutoSave.ts` | **Rewrite.** Replace `window.electronAPI.writeFile` → `fetch('PUT /api/scribe/files/:path')`. Same debounce logic (1s timer). |
| 9 | `scribe/DocumentToolbar.tsx` (213 L) | `qualia-shell/src/components/Scribe/DocumentToolbar.tsx` | **Port with simplification.** Remove `window.electronAPI.versionCreate` → backend route or defer versioning to later cycle. Remove `window.electronAPI.ingestDeleteDocument` → backend route. Remove `triggerSidebarRefresh` (Holocron-specific). Keep `+ Version` and `☰ Contents` buttons. |
| 10 | `scribe/SelectionToolbar.tsx` (134 L) | `qualia-shell/src/components/Scribe/SelectionToolbar.tsx` | **Port verbatim.** Pure React + Zustand. No Electron deps. |
| 11 | `scribe/TabBar.tsx` (167 L) | `qualia-shell/src/components/Scribe/TabBar.tsx` | **Port with simplification.** Remove `window.electronAPI.readFile` → fetch. Remove DumpMode tab (Brain Dump is Holocron-specific — a separate feature branch could add it later). Keep multi-tab management + preview-tab convention. |
| 12 | `scribe/Minimap.tsx` (304 L) | `qualia-shell/src/components/Scribe/Minimap.tsx` | **Port verbatim.** Pure React + CodeMirror view access. No Electron deps. |
| 13 | `scribe/TableOfContents.tsx` (215 L) | `qualia-shell/src/components/Scribe/TableOfContents.tsx` | **Port verbatim.** Pure React + CodeMirror view access. No Electron deps. |
| 14 | `scribe/RedlineNavigator.tsx` (195 L) | `qualia-shell/src/components/Scribe/RedlineNavigator.tsx` | **Port with minor change.** Remove `window.electronAPI.commentsWrite` → fetch to backend. Rest is pure React + Zustand. |
| 15 | `scribe/CommentEditor.tsx` (294 L) | `qualia-shell/src/components/Scribe/CommentEditor.tsx` | **Port with minor change.** Replace `window.electronAPI.commentsWrite` with fetch. Rest is pure React + Zustand. |
| 16 | `scribe/DumpMode.tsx` (303 L) | **SKIP for now** | Brain Dump is a separate feature — it involves thread metadata, Honcho integration, report generation. Port in a later feature branch if desired. |
| 17 | `scribe/PDFViewer.tsx` (72 L) | **SKIP** | Dwellium already has PDFGear widget. No need to duplicate. |
| 18 | `main/projectFs.ts` (1526 L) | Express routes at `/api/scribe/*` (see §3) | **Translate Electron-main functions → Express routes.** Only the file CRUD subset is needed for Scribe (readDir, readFile, writeFile, createFile, deleteFile, versionCreate, commentsRead, commentsWrite). The project/thread/domaine CRUD, rename cascades, memory files, branching, and RAG database operations are out of scope for the Scribe widget — they belong in `feat/workspace-widget` and `feat/foundry-ingestion`. |
| 19 | `main/sessionFs.ts` (114 L) | Express routes (partial) | **Translate selectively.** Only `readDir`, `createFile`, `renameEntry`, `deleteEntry` are needed. `listSessions`, `createSession`, `completeSession` are workspace-level — defer to `feat/workspace-widget`. |
| 20 | `settings/ScribeTab.tsx` (204 L) | `qualia-shell/src/components/Scribe/ScribeSettings.tsx` | **Port with adaptation.** Replace `useSettingsStore().config.editorTheme` → a Scribe-specific localStorage store (or integrate into the existing Control Panel). The color picker grid, preset management, and custom theme CRUD carry over. |
| — | (new) `scribeStore.ts` | `qualia-shell/src/components/Scribe/scribeStore.ts` | **New file.** Zustand store matching Holocron's `scribeStore` shape: `openFiles`, `activeFilePath`, `fileContents`, `redlines`, `commentsByFile`, `editorMode`, `selectionToolbar`, `scrollPositions`, `openCommentId`. Stripped of Holocron-specific fields (`honchoCtx`, `pendingChatPill`, `lastRedlineSource`, `pendingScrollTarget`). |

---

## 3. Backend Routes Needed

Scribe needs a minimal filesystem API. Dwellium's backend is in the sibling repo (`ai-dashboard369-file-manager`), but these routes could also be added as a lightweight Express middleware in the Vite dev server for local development.

| Route | Method | Body | Returns | Replaces (Holocron) |
|-------|--------|------|---------|---------------------|
| `/api/scribe/files` | `GET` | Query: `?dir=<path>` | `FsEntry[]` (name, path, type, mtime, size) | `sessionFs.readDir` / `window.electronAPI.readDir` |
| `/api/scribe/files/:path` | `GET` | — | `{ content: string }` | `window.electronAPI.readFile` |
| `/api/scribe/files/:path` | `PUT` | `{ content: string }` | `{ ok: true }` | `window.electronAPI.writeFile` (auto-save target) |
| `/api/scribe/files` | `POST` | `{ dir: string, name: string }` | `{ ok: true, filePath: string }` | `sessionFs.createFile` |
| `/api/scribe/files/:path` | `DELETE` | — | `{ ok: true }` | `sessionFs.deleteEntry` |
| `/api/scribe/files/rename` | `POST` | `{ oldPath: string, newPath: string }` | `{ ok: true }` | `sessionFs.renameEntry` |
| `/api/scribe/comments/:path` | `GET` | — | `DocComment[]` | `window.electronAPI.commentsRead` (reads `Comments_*.json` sidecar) |
| `/api/scribe/comments/:path` | `PUT` | `DocComment[]` | `{ ok: true }` | `window.electronAPI.commentsWrite` |
| `/api/scribe/version` | `POST` | `{ filePath: string }` | `{ ok: true, filePath: string, renamedOriginal?: {...} }` | `window.electronAPI.versionCreate` |
| `/api/scribe/redline` | `POST` | `{ text: string, systemPrompt: string }` | `{ suggestions: Redline[] }` | Not an IPC — currently the renderer calls the LLM directly. This route is optional; the widget can call `callLlm` directly in-browser. |

**Comment storage model:** Comments are stored as JSON sidecar files (`<filename>.comments.json`) adjacent to the document file, mirroring Holocron's approach. This is simpler than a database table and keeps comments tied to the filesystem (movable, deletable alongside the doc).

**Version storage model:** `versionCreate` copies the current file to `<stem>_v<N>.md` in the same directory. Straightforward filesystem operation.

---

## 4. Database Schema Additions

**None required for v1.**

Holocron stored documents, tags, and relationships in PostgreSQL (`rag_documents`, `rag_tags`, etc.) — but those are part of the RAG ingestion pipeline, not the editor itself. Scribe's own data (open file state, redlines, comments) is either ephemeral (Zustand store, dies with the session) or filesystem-based (comment sidecars, version copies).

Dwellium already has 47 tables in better-sqlite3. Scribe does not need any new tables because:
- **Documents live on the filesystem** (read/written via the Express routes above)
- **Comments are JSON sidecar files** (not DB rows)
- **Redlines are transient** (generated by LLM, accepted or rejected in-session, not persisted)
- **Editor theme preferences** can live in localStorage (per-user, via the existing `createLocalStorageStore` factory)

If Scribe files eventually need to be indexed/searchable, that's the `feat/foundry-ingestion` branch's concern.

---

## 5. npm Dependencies to Add

From Holocron's `package.json`, the CodeMirror 6 ecosystem packages needed:

| Package | Holocron Version | Purpose |
|---------|-----------------|---------|
| `codemirror` | `^6.0.1` | Metapackage (pulls in basicSetup) |
| `@codemirror/state` | `^6.4.1` | EditorState, StateField, StateEffect, Extension |
| `@codemirror/view` | `^6.33.0` | EditorView, ViewPlugin, Decoration, WidgetType, keymap |
| `@codemirror/lang-markdown` | `^6.3.1` | Markdown language support |
| `@codemirror/language` | `^6.12.3` | syntaxHighlighting, syntaxTree, HighlightStyle |
| `@codemirror/autocomplete` | `^6.20.1` | closeBrackets (used in markdownConfig) |
| `@lezer/highlight` | `^1.2.3` | tags (heading1, strong, emphasis, etc.) |
| `@lezer/markdown` | (transitive) | Table extension for GFM table support |

**Not needed from Holocron:**
- `@mdxeditor/editor` — Holocron has it but doesn't use it in Scribe
- `mammoth`, `pdf-parse`, `pdfjs-dist` — document conversion, not Scribe editor
- `pg`, `bullmq`, `chokidar` — backend/ingestion, not editor
- `graphology*`, `d3` — graph visualization, not editor
- `marked`, `react-markdown`, `sanitize-html` — chat rendering, not editor

**Install command (Cycle 3):**
```bash
cd qualia-shell && npm install codemirror @codemirror/state @codemirror/view @codemirror/lang-markdown @codemirror/language @codemirror/autocomplete @lezer/highlight
```

Bundle impact estimate: CodeMirror 6 core is ~150-200 KB minified+gzipped. This is comparable to other large deps already in the bundle.

---

## 6. AI Redline Integration Plan

### Flow

1. User selects text in the editor and clicks "Send to Agent" (SelectionToolbar) or presses Cmd+L
2. The selected text + a system prompt are sent to `callLlm()` via the user's active provider
3. The response is parsed as JSON containing one or more redline suggestions
4. Each suggestion is pushed into `scribeStore.redlines[]` with `state: 'pending'`
5. The `redlinePlugin` detects the store change, dispatches a refresh effect, and CodeMirror renders the inline widgets
6. User accepts (text is replaced inline) or rejects (widget removed)

### System Prompt

```
You are an expert editor. The user has selected a passage from their document and is asking for improvements. Return a JSON array of suggested replacements. Each suggestion should improve clarity, conciseness, or correctness while preserving the author's voice and intent.

Response format (strict JSON, no markdown fences):
[
  {
    "from_text": "the exact original text being replaced",
    "to_text": "the improved replacement text",
    "reason": "brief explanation of the change"
  }
]

If no improvements are needed, return an empty array: []
```

### JSON Response Shape

```typescript
interface RedlineSuggestion {
  from_text: string;   // substring of the selected text
  to_text: string;     // proposed replacement
  reason: string;      // brief explanation
}
```

The widget code will find `from_text` within the selection range to compute `from`/`to` character offsets, then create a `Redline` object:

```typescript
interface Redline {
  id: string;           // crypto.randomUUID()
  filePath: string;
  from: number;         // character offset in doc
  to: number;
  originalText: string;
  proposedText: string;
  state: 'pending' | 'accepted' | 'rejected';
  commentId?: string;   // if generated from a comment submission
}
```

### Provider Routing

Redlines route through `callLlm(req, bundle.llm)` — the user's active provider handles it. No special provider logic needed. The `responseFormat: 'json'` hint is passed for providers that support structured output.

---

## 7. Cycle-by-Cycle Port Sequence

Each cycle is designed to be completable in one session, end with a green strict gate (no `qualia-shell/src/**` regressions), and produce a reviewable commit.

### Cycle 3 — Scaffold + CodeMirror deps
- Install CodeMirror 6 npm packages (see §5)
- Create `qualia-shell/src/components/Scribe/` directory
- Create empty `ScribePane.tsx` that renders a placeholder ("Scribe widget — editor loading")
- Register in `widgetRegistry.ts` (id: `'scribe'`, icon: `'pen-tool'`, category: `'tools'`)
- Add dock item in `hierarchy.ts` (group: `'Filing Cabinet'`, after Notepad)
- Verify: widget opens from sidebar, shows placeholder, strict gate green
- **Commit (no push)**

### Cycle 4 — Basic CodeMirror editor (read-only sample)
- Port `markdownConfig.ts` (all ViewPlugins: mark-hiding, list-marker, blockquote, HR, highlight, fenced-code, table, smart paste, double-space-period)
- Port `scribeThemes.ts` (presets + `buildHighlightStyle`)
- Create `scribeStore.ts` (Zustand: `openFiles`, `activeFilePath`, `fileContents`, `editorMode`, `scrollPositions`)
- Wire `ScribePane.tsx` to mount CodeMirror with the markdown extensions, load a hardcoded sample markdown doc
- Adapt `holocronTheme` in markdownConfig to use Dwellium CSS vars where possible
- Verify: editor renders markdown with syntax highlighting, strict gate green
- **Commit**

### Cycle 5 — Backend file CRUD + live editing
- Add Express routes: `GET /api/scribe/files`, `GET /api/scribe/files/:path`, `PUT /api/scribe/files/:path`, `POST /api/scribe/files`, `DELETE /api/scribe/files/:path`
- Port `useAutoSave.ts` (replace `electronAPI.writeFile` → `fetch PUT`)
- Port `TabBar.tsx` (without DumpMode tab)
- Wire ScribePane to load files from the backend, support multi-tab editing
- Verify: can open a file, edit it, auto-save fires, reopen shows saved content, strict gate green
- **Commit**

### Cycle 6 — AI redline plugin
- Port `redlinePlugin.ts` (remove debug console.logs)
- Port `RedlineNavigator.tsx`
- Port `selectionObserver.ts` + `SelectionToolbar.tsx` (the "Send to Agent" flow)
- Wire the redline flow to `callLlm()` via `useIntegrations`
- Create the redline system prompt + JSON parsing logic
- Verify: select text → send to agent → redlines appear inline → accept/reject works, strict gate green
- **Commit**

### Cycle 7 — Comment plugin
- Port `commentPlugin.ts`
- Port `CommentEditor.tsx`
- Add backend routes: `GET/PUT /api/scribe/comments/:path`
- Wire "Add Comment" (SelectionToolbar) + "Submit to Agent" (CommentEditor → redline pipeline)
- Verify: add comment → amber underline + 💬 indicator → edit/delete/submit-to-agent all work, strict gate green
- **Commit**

### Cycle 8 — Document versioning
- Port version logic: `POST /api/scribe/version` backend route
- Port `DocumentToolbar.tsx` (+ Version button, ☰ Contents, Delete)
- Port `TableOfContents.tsx`
- Verify: version creates `_v1.md` + new file opens, TOC lists headings + click-to-jump, strict gate green
- **Commit**

### Cycle 9 — Minimap + navigation polish
- Port `Minimap.tsx` (64px right-edge strip with heading colors, comment markers, viewport indicator, click-to-scroll)
- Verify: minimap renders alongside editor, click-to-scroll works, comment markers show, strict gate green
- **Commit**

### Cycle 10 — Editor theme settings
- Port `ScribeTab.tsx` → `ScribeSettings.tsx`
- Create a localStorage-backed theme store using `createLocalStorageStore`
- Wire theme picker into the existing Control Panel (add a "Scribe Editor" section)
- Wire `applyEditorThemeToAllViews` so theme changes apply live
- Verify: switch themes → editor colors update immediately, custom themes persist, strict gate green
- **Commit**

### Cycle 11 — Context menu + final polish
- Port the context menu (Cut/Copy/Paste/Paste+/Paste++/Markdown submenu/Clear Formatting)
- Wire Cmd+L (send selection to redline pipeline)
- Port code block auto-close keymap (Enter on opening ``` inserts closing fence)
- Final CSS polish — ensure Scribe's editor area respects Dwellium's design system (dark theme, border-radius, shadow consistent with other widgets)
- Verify: full feature set works end-to-end, strict gate green
- **Commit**

### Cycle 12 — Acceptance + close
- Run full strict gate
- Write acceptance criteria checklist + test results
- Update `Scripts/autorun/STATUS.md`
- Final commit with summary
- **STOP — Ilya reviews + pushes**

**Total: 10 porting cycles (Cycles 3-12)**

---

## 8. Open Questions for Ilya

1. **Where do Scribe files live on disk?** Holocron uses a nested filesystem (`_Domaines/<Domaine>/<Project>/<Thread>/`). Dwellium's file storage model for the Scribe widget needs a root directory. Options:
   - A configurable workspace root per user (like Holocron's `projectsRoot`)
   - A fixed directory under the app's data dir (e.g., `~/.dwellium/scribe/`)
   - Server-managed workspace at a path the backend controls
   - **Recommendation:** Start with a configurable root passed as an env var or stored in the user's integrations bundle.

2. **Per-user file separation?** Should each user's Scribe files be namespaced by `user.id` (e.g., `/scribe-data/<userId>/`)? This would be the sister pattern to per-user integrations (`integrationsUserIdHolder`). If Dwellium is single-user for now, this can be deferred.

3. **Should Scribe replace Notepad or coexist?** Dwellium already has a `notepad` widget in `hierarchy.ts` (group: Filing Cabinet). Scribe is strictly a superset of Notepad (CodeMirror 6 vs. a basic textarea). Options:
   - **Replace Notepad** — remove the dock item, redirect to Scribe
   - **Coexist** — keep both; Notepad for quick notes, Scribe for serious editing
   - **Recommendation:** Coexist for now (no removals in this branch), consider replacing after Scribe proves stable.

4. **Sidebar group?** Where should Scribe appear in the sidebar hierarchy? Current groups: `Property Management`, `AI Tools`, `Filing Cabinet`. Scribe is an editor tool — `Filing Cabinet` (next to Notepad, Docs, PDF Gear) seems natural. Or a new `Editor` group. Ilya's call.

5. **Backend repo decision.** Should the `/api/scribe/*` routes live in:
   - The sibling `ai-dashboard369-file-manager` repo (keeps backend centralized)
   - A new lightweight Express server in `qualia-shell/` (self-contained)
   - A Vite plugin/middleware for dev mode (simplest, but not production-ready)
   - **Recommendation:** Vite middleware for dev (Cycle 5), migrate to the backend repo later.

6. **PDF preview:** Holocron's `PDFViewer.tsx` reads files via Electron IPC. Dwellium already has PDFGear. Should Scribe's tab bar show PDFs inline (when user opens a `.pdf` from the file tree) or delegate to PDFGear? **Recommendation:** Skip PDFViewer, delegate to PDFGear.

7. **DumpMode (Brain Dump):** Port it as part of Scribe, or save for a later feature branch? It involves thread metadata, Honcho integration, and report generation — substantially more backend work. **Recommendation:** Defer to `feat/workspace-widget` or a dedicated branch.

8. **"Send to Agent" target:** In Holocron, Cmd+L / "Send to Agent" sends a citation pill to the chat panel (a separate `ChatPane` component with Honcho integration). In Dwellium, what's the target? Options:
   - Wire to Stella (the existing AI chat widget)
   - Wire to Thought Weaver (categorization)
   - Keep self-contained: "Send to Agent" triggers the redline flow directly within Scribe (no external chat panel needed — the LLM response comes back as inline redlines)
   - **Recommendation:** Self-contained for v1 — "Send to Agent" triggers `callLlm` → redlines appear inline. External chat integration is a future enhancement.

---

## 9. Risks + Carry-Forward

### Risks

1. **Bundle size.** CodeMirror 6 adds ~150-200 KB (gzipped) to the client bundle. Dwellium is already at ~2.4 MB for the main chunk (per Phase-7 analysis). CodeMirror is lazy-loaded via `lazyWithReload` so it only loads when Scribe opens — but it's a material addition. Monitor with `npx vite-bundle-visualizer` after Cycle 3.

2. **React 19 + CodeMirror 6 interaction.** Holocron uses React 18; Dwellium uses React 19 with concurrent features. CodeMirror 6 manages its own DOM — it should be immune to React's scheduling, but the `useEffect`-based mount/destroy lifecycle needs testing. The Holocron code uses `useEffect([], [])` for mount (correct pattern) and refs for the EditorView (also correct). No anticipated issue, but flagged.

3. **SSR safety.** CodeMirror accesses `document` and `window` during `EditorView` construction. Dwellium uses React Router v7 framework-mode with SSR. The Scribe widget must be wrapped in a dynamic import (`lazyWithReload`) and the EditorView must only be created inside `useEffect` (client-side). The current Holocron code already does this — but verify with the SSR smoke test (`SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs`).

4. **Backend dependency.** Cycles 5-8 require backend routes. If the backend is not available, those cycles need a local file API alternative (e.g., Vite dev middleware that reads/writes from a local `./scribe-workspace/` directory). Plan for this fallback.

5. **`scribeStore` shape.** Holocron's `scribeStore` has 30+ fields — many are Holocron-specific (honchoCtx, chatPill, pendingScrollTarget, etc.). The Dwellium port must cherry-pick only the fields Scribe needs. Missing a field will cause a runtime error; including too many will create dead state. Careful enumeration in Cycle 4.

6. **CSS variable mismatch.** Holocron's `markdownConfig.ts` hardcodes colors like `#141414`, `rgba(10,132,255,0.3)`, etc. Dwellium uses CSS custom properties (`var(--bg-base)`, `var(--text-primary)`). The `holocronTheme` in CodeMirror's `EditorView.theme` needs manual adaptation in Cycle 4. Some CodeMirror-internal selectors (`.cm-cursor`, `.cm-selectionBackground`) may not support CSS vars — hardcoded dark-theme colors are acceptable there.

7. **Comment sidecar persistence.** Holocron stores comments as `Comments_<Project>_<Thread>.json` files via Electron IPC. The Dwellium equivalent (`/api/scribe/comments/:path`) needs a convention for where sidecar files live relative to the document. Recommendation: `<dir>/.scribe/<filename>.comments.json` (hidden directory, won't clutter the workspace).

### Carry-Forward (Not in Scope)

- **DumpMode / Brain Dump** — defer to `feat/workspace-widget`
- **PDFViewer** — Dwellium has PDFGear
- **Project/Thread CRUD** — defer to `feat/workspace-widget`
- **RAG ingestion integration** — defer to `feat/foundry-ingestion`
- **Honcho memory** — not applicable to Dwellium
- **Domaine/namespace management** — defer to `feat/workspace-widget`
- **Chat panel integration** (sending citation pills to an external chat) — future enhancement

---

*End of Porting Plan — Cycle 2 complete. Awaiting Ilya's review before Cycle 3.*
