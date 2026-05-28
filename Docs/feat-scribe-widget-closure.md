# feat/scribe-widget — Closure Report

**Branch:** `feat/scribe-widget`
**Base HEAD:** `7f3b548` (main)
**Close HEAD:** see Cycle 12 commit
**Cycles:** 12 (1 subtree-add + 1 plan + 9 porting + 1 close)
**Duration:** 2026-05-27 (single day)
**Status:** Ready for PR review

---

## Summary

Ports Holocron/Agenteryx's Scribe markdown editor into Dwellium as a new widget. CodeMirror 6 editor with AI redlines via per-user llmClient, inline comments with anchor remapping, document versioning, Table of Contents, Minimap, 4 theme presets with per-user persistence, keyboard shortcuts, and right-click context menu. Filesystem-backed via new `/api/scribe/*` routes in the sibling backend repo (captured in `Docs/backend-A-routes.patch`).

**Key metrics:**
- 23 new files in `qualia-shell/src/components/Scribe/` (3,453 + 265 CSS = 3,718 LOC)
- 8 new npm packages (7 CodeMirror 6 + Zustand)
- 7 backend routes in `Docs/backend-A-routes.patch` (612 lines total, ~250 Scribe-specific)
- Bundle: ~650 KB lazy-loaded (25K component JS + 621K CodeMirror chunk + 3.4K CSS)
- Strict gate 6/6 green across all 10 code cycles
- vitest 278/278 maintained throughout (zero test regressions)

---

## Cycle-by-cycle log

| Cycle | SHA | Summary | Files |
|-------|-----|---------|-------|
| 1 | `ed11144` | Branch creation + git subtree add of Agenteryx mirror at `Docs/holocron-reference/` | 2 commits (squash + merge) |
| 2 | — (no commit) | Discovery + PORTING_PLAN.md written (379 lines, 9 sections) | 1 new doc |
| 3 | `3ecf54b` | Scaffold: empty Scribe widget + CodeMirror 6 deps + sidebar registration + PenTool icon | 7 files |
| 4 | `15ab0c5` | Basic CodeMirror editor + markdownConfig (all ViewPlugins) + scribeThemes + scribeStore + Zustand | 8 files |
| 5 | `982321e` | Backend file CRUD (5 routes) + multi-tab editing + useAutoSave + TabBar | 6 files |
| 6 | `40ecb7a` | AI redlines: redlinePlugin + selectionObserver + SelectionToolbar + RedlineNavigator + redlinePrompt | 9 files |
| 7 | `d45b11d` | Inline comments: commentPlugin + CommentEditor + sidecar persistence (2 backend routes) | 8 files |
| 8 | `93bd4e6` | Document versioning + DocumentToolbar + TableOfContents (1 backend route) | 6 files |
| 9 | `e408fbc` | Minimap: 64px strip with heading colors, comment/redline markers, viewport indicator, click/drag | 5 files |
| 10 | `74007a2` | Theme settings UI + per-user persistence via createLocalStorageStore dynamic-key | 5 files |
| 11 | `7a5be6e` | Keyboard shortcuts (7 bindings) + right-click context menu + UX sweep | 5 files |
| 12 | (this commit) | Closure report, acceptance criteria — no new code | 1 doc |

---

## File map

| File | Lines | Description |
|------|-------|-------------|
| `markdownConfig.ts` | 548 | All CodeMirror extensions: ViewPlugins (mark-hiding, list-marker, blockquote, HR, highlight, fenced-code), smart paste, double-space-period, code-block auto-close, theme compartment, extension bundler |
| `scribeStore.ts` | 332 | Zustand store: open files, active file, comments, redlines, selection toolbar, loading/error states, all CRUD actions |
| `CommentEditor.tsx` | 268 | Popup editor for inline comments with view/edit/resolve/delete + Submit to Agent |
| `Scribe.css` | 265 | All Scribe styles: layout, editor area, toolbar, TOC sidebar, minimap, empty state, file list |
| `Minimap.tsx` | 232 | 64px right-edge strip: heading colors, comment/redline markers, viewport indicator, click/drag scroll |
| `ContextMenu.tsx` | 222 | Right-click context menu: clipboard ops + Redline + Comment + toggle Minimap/TOC |
| `scribeThemes.ts` | 175 | 4 preset themes + buildHighlightStyle + resolveTheme |
| `redlinePlugin.ts` | 168 | CodeMirror StateField + ViewPlugin subscriber for redline decorations + accept/reject |
| `SelectionToolbar.tsx` | 163 | Floating toolbar on text selection: Redline + Comment buttons |
| `Scribe.tsx` | 161 | Main widget component: multi-tab layout, editor mount, empty state |
| `RedlineNavigator.tsx` | 149 | "Redline N of M" pill with prev/next + Accept All / Reject All |
| `commentPlugin.ts` | 148 | CodeMirror StateField for comment decorations + anchor remapping |
| `scribeKeymap.ts` | 129 | 7 keyboard shortcuts as CodeMirror keymap extension |
| `DocumentToolbar.tsx` | 124 | Toolbar: Contents toggle, Minimap toggle, Version, Delete |
| `TabBar.tsx` | 123 | Multi-tab bar with dirty indicator, close-with-confirm, + New button |
| `tablePlugin.ts` | 113 | GFM table live-preview: cursor-outside → HTML table, cursor-inside → source |
| `ScribeSettings.tsx` | 87 | Preset theme picker rendered in ControlPanel |
| `selectionObserver.ts` | 84 | CodeMirror plugin publishing selection coords to scribeStore |
| `TableOfContents.tsx` | 78 | Sidebar: regex heading parse, hierarchical click-to-jump list |
| `redlinePrompt.ts` | 43 | REDLINE_SYSTEM_PROMPT + COMMENT_REDLINE_SYSTEM_PROMPT + JSON parser |
| `useScribeTheme.ts` | 40 | Hook: per-user theme via scribeThemeStore + live applyEditorThemeToAllViews |
| `useAutoSave.ts` | 26 | 500ms debounced PUT to /api/scribe/files/:filepath |
| `scribeThemeStore.ts` | 25 | createLocalStorageStore dynamic-key for per-user theme persistence |
| `scribeUtils.ts` | 15 | getIntegrationsSnapshot() for keymap/context-menu LLM access outside React |

**Total:** 3,718 lines (3,453 TS/TSX + 265 CSS)

---

## Backend routes added

All routes in `Docs/backend-A-routes.patch` under `/api/scribe/`, authenticated via `authenticate` middleware, sandboxed to `~/.dwellium/scribe/<userId>/`.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/scribe/files` | POST | Create new file |
| `/api/scribe/files` | GET | List all files (recursive, with metadata) |
| `/api/scribe/files/*` | GET | Read file content (UTF-8) |
| `/api/scribe/files/*` | PUT | Save file content (auto-save target) |
| `/api/scribe/files/*` | DELETE | Delete file |
| `/api/scribe/comments/*` | GET | Read comment sidecar JSON |
| `/api/scribe/comments/*` | PUT | Save comment sidecar (atomic write) |
| `/api/scribe/version` | POST | Create versioned snapshot |

Path traversal guarded: rejects `..`, absolute paths, `resolve+startsWith(base+sep)` check.

---

## Per-user storage

```
~/.dwellium/scribe/<userId>/
  ├── *.md                     # Document files
  ├── *_v1.md, *_v2.md, ...    # Version snapshots
  └── .comments/
      └── <filepath>.json      # Comment sidecar per document
```

Theme preference: `localStorage` key `scribe-theme:<userId>` via `createLocalStorageStore` dynamic-key (sister-shape to `integrationsStore` + `savedLayoutsStore` from Phase-8+ Task 8.10 Option Beta).

---

## Decision log

| Decision | Rationale |
|----------|-----------|
| Subtree via `Docs/holocron-reference/` | Read-only reference; no build dependency on Agenteryx |
| Storage at `~/.dwellium/scribe/<userId>/` | Per-user namespaced, filesystem-first (matches Agenteryx's "filesystem is truth" invariant) |
| Sidebar group: Filing Cabinet | Adjacent to Notepad, Docs, PDF Gear — editor tools cluster |
| Coexist with Notepad | No removal risk; Scribe is superset but Notepad is proven stable |
| Backend routes via `Docs/backend-A-routes.patch` | Backend repo has leaked token in remote — can't push; patch captures diff |
| Self-contained Send-to-Agent | No external chat panel; `callLlm` → redlines inline (architecture decision section 8) |
| PDFViewer skipped | Dwellium already has PDFGear widget |
| DumpMode deferred | Brain Dump needs thread metadata + Honcho — slated for `feat/workspace-widget` |
| Zustand as state manager | 5 KB, already used by Holocron's Scribe; first Zustand usage in Dwellium |
| React 19 JSX namespace | Global `JSX` removed in React 19; fixed with inferred return types |
| CM6 Transaction lacks `tr.view` | StateField update can't access EditorView; use `buildDecorations(tr.state)` directly |
| `Cmd+L` for redline (not `Cmd+Shift+R`) | `Cmd+Shift+R` conflicts with browser hard-reload; `Cmd+L` matches Holocron |
| Compartment-based theme swap | `HighlightStyle` needs font-size/weight/style metadata that CSS vars can't carry |
| Versioning: snapshot model | Current file stays as live doc; `_v1.md`, `_v2.md` are snapshots — no rename complexity |

---

## Bundle size

| Chunk | Size | Loaded |
|-------|------|--------|
| `Scribe-D9xO1SBm.js` | 25 KB | On widget open (lazy) |
| `useScribeTheme-9p2Wk4ZU.js` | 621 KB | On widget open (CodeMirror + deps) |
| `Scribe-CLeAWgCi.css` | 3.4 KB | On widget open |
| **Total Scribe** | **~650 KB** | **Lazy-loaded** |

Total client assets: 90 MB (includes nebula-bg.mp4 at 71 MB). Scribe adds < 1% to the non-video asset footprint.

---

## Acceptance criteria

Ilya should walk through in browser after applying the backend patch + restarting:

- [ ] Scribe widget opens from Filing Cabinet sidebar (next to Notepad)
- [ ] Empty state shows file list + "+ New File" button
- [ ] Multi-tab editing works (open multiple files, switch between them)
- [ ] Auto-save fires 500ms after last edit
- [ ] AI redlines work end-to-end: select text → Cmd+L or ✦ Redline → LLM proposes edits → Accept/Reject inline
- [ ] RedlineNavigator pill shows "Redline N of M" with prev/next/Accept All/Reject All
- [ ] Comments: select text → Cmd+Shift+C or 💬 Comment → amber underline + 💬 indicator → edit/resolve/delete
- [ ] Comment "Submit to Agent" sends comment-as-instruction to LLM → redlines appear
- [ ] Comments persist across reload (sidecar JSON at `~/.dwellium/scribe/<userId>/.comments/`)
- [ ] Comment anchors shift correctly when text is inserted/deleted before them
- [ ] Version snapshot: click 🕒 Version → creates `_v1.md` → opens in new tab
- [ ] TOC: click ☰ Contents → sidebar shows headings → click heading → editor scrolls
- [ ] Minimap: 64px strip on right → heading colors + markers → click/drag scrolls editor
- [ ] Theme switching: Control Panel → "Scribe — Editor Theme" → click preset → editor updates live
- [ ] Theme persists across reload + is per-user (different users see different themes)
- [ ] All keyboard shortcuts fire (Cmd+S, Cmd+L, Cmd+Shift+C, Cmd+]/[, Cmd+Shift+K, Cmd+Shift+T)
- [ ] Right-click context menu shows state-aware items (Cut/Copy only with selection)
- [ ] No regressions in existing widgets (Strata Dashboard, ThoughtWeaver, FactCheck, Stella)

---

## Carry-forward (Ilya-gated, OUT OF SCOPE)

- Custom per-token color overrides in ScribeSettings (Holocron's ScribeTab has color pickers per token — ~100 LOC, power-user feature)
- Clipboard image paste → save as PNG (needs backend `/api/scribe/upload` route)
- PDFViewer inline in Scribe tabs (delegated to existing PDFGear widget)
- DumpMode brain-dump UI (slated for `feat/workspace-widget` branch)
- "Send to Agent" external chat panel integration (deferred per architecture decision section 8)
- File rename within Scribe (currently requires delete + create)
- Drag-and-drop file reorder in TabBar
- Search within document (Cmd+F — CodeMirror's `@codemirror/search` is installed but not wired)

---

## Next branch

After PR merges to main, autorun advances to `feat/file-explorer-enhanced` per the 4-branch plan in `Scripts/autorun/PORTING_PLAN.md`.
