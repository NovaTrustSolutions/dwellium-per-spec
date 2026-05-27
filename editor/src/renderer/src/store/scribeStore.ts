import { create } from 'zustand'

export interface FileEntry {
  path: string
  name: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type ScribeMode = 'document' | 'dump'

// Redline state — DATA_MODEL.md §6. Ephemeral, UI only, never persisted.
export interface Redline {
  id: string
  filePath: string
  // Range is in CodeMirror document positions captured at the moment the user
  // quoted via Cmd+L / Send to Chat. After Accept/Reject the doc may shift,
  // but we recompute on apply rather than tracking live deltas (P5 MVP scope).
  from: number
  to: number
  originalText: string
  proposedText: string
  state: 'pending' | 'accepted' | 'rejected'
  timestamp: string
  // When a redline was created from an inline comment (multi-comment flow),
  // we remember the source comment id so accepting the redline can mark the
  // comment as resolved automatically.
  commentId?: string
}

export interface RedlineSource {
  filePath: string
  from: number
  to: number
  text: string
  // Set when the source came from a specific inline comment (per-comment
  // Submit-to-Agent). Lets the resulting redline auto-resolve the comment
  // on Accept, the same way the multi-comment flow does.
  commentId?: string
}

// Comments (Fix 4): per-file inline annotations stored in a sidecar JSON.
export interface DocComment {
  id: string
  fromLine: number
  toLine: number
  originalText: string
  comment: string
  createdAt: string
  resolved: boolean
}

// Floating selection toolbar state (Fix 4). Set by the editor's selection
// observer; rendered by SelectionToolbar in viewport coordinates.
export interface SelectionToolbarState {
  filePath: string
  // Viewport-relative coords for placing the toolbar above the selection.
  x: number
  y: number
  from: number
  to: number
  fromLine: number
  toLine: number
  text: string
}

interface EditorState {
  openFiles: FileEntry[]
  activeFilePath: string | null
  /** VS Code-style preview tab. At most one entry in openFiles is the
   *  preview at any time — its tab title renders italic. Single-click in the
   *  Sidebar opens a file into the preview slot, replacing whatever was
   *  there. Double-click, or any edit via setFileContent, promotes it to
   *  permanent (this field becomes null and the tab renders normal). */
  previewFilePath: string | null
  editorMode: ScribeMode
  fileContents: Record<string, string>
  scrollPositions: Record<string, number>
  chatHistory: ChatMessage[]
  isStreaming: boolean
  pendingChatInput: string | null
  pendingChatPill: { id: string; displayLabel: string; agentText: string } | null
  pendingScrollTarget: { filePath: string; headingText: string } | null
  redlines: Redline[]
  // The Cmd+L / Send-to-Chat selection most recently used to seed a chat
  // message. The redline parser uses this as the target range for any
  // REDLINE blocks the agent returns next.
  lastRedlineSource: RedlineSource | null
  // Inline comments per file (loaded from Comments_<basename>.json sidecars).
  commentsByFile: Record<string, DocComment[]>
  // Comment currently open for editing (id), if any.
  openCommentId: string | null
  // Floating toolbar that appears above text selections.
  selectionToolbar: SelectionToolbarState | null
  honchoCtx: { sessionId: string } | null
  /** At most ONE entry: the most-recent summary used as a brief orienting
   *  paragraph in the system prompt. All older summaries stay on disk in
   *  the Memory file — they are NOT eagerly loaded (that was the pre-fix
   *  bug that left context at 62% post-compression). */
  sessionSummaries: string[]
  /** Absolute path to the thread's Memory_<Project>_<Thread>.json. Surfaced
   *  in the system prompt so the agent can cite it on demand. Empty string
   *  when no thread is active or the path hasn't been resolved yet. */
  memoryFilePath: string
  /** True when the Memory file exists on disk with at least one summary.
   *  Drives the chat-bar label that replaces "N summaries from Honcho". */
  memoryHasSummaries: boolean
  workspaceNotifications: Array<{ id: string; filePath: string; name: string; type: 'add' | 'change' }>

  addFile: (file: FileEntry) => void
  setActiveFile: (path: string) => void
  setEditorMode: (mode: ScribeMode) => void
  setFileContent: (path: string, content: string) => void
  setScrollPosition: (path: string, pos: number) => void
  openFileWithContent: (file: FileEntry, content: string) => void
  /** Single-click open: replaces the existing preview tab (if any) instead
   *  of stacking a new tab. If the file is already open (preview OR
   *  permanent), just activates it without changing its preview state. */
  openInPreview: (file: FileEntry, content: string) => void
  /** Explicitly promote the preview tab to permanent. No-op when path isn't
   *  the current preview. Used by the Sidebar double-click handler; the
   *  setFileContent path auto-promotes on user edits without needing this. */
  promoteToPermanent: (path: string) => void
  closeFile: (path: string) => void
  closeAllFiles: () => void
  addChatMessage: (message: ChatMessage) => void
  updateLastAssistantMessage: (content: string) => void
  removeLastAssistantMessage: () => void
  setIsStreaming: (streaming: boolean) => void
  setPendingChatInput: (text: string | null) => void
  setPendingChatPill: (pill: { id: string; displayLabel: string; agentText: string } | null) => void
  setPendingScrollTarget: (target: { filePath: string; headingText: string } | null) => void
  setLastRedlineSource: (src: RedlineSource | null) => void
  addRedlines: (lines: Redline[]) => void
  removeRedline: (id: string) => void
  clearRedlinesForFile: (filePath: string) => void
  // Replace all redlines belonging to filePath. Used by the position-mapping
  // updateListener after a doc change so pending redlines stay aligned with
  // the new text.
  setRedlinesForFile: (filePath: string, fileRedlines: Redline[]) => void
  setCommentsForFile: (filePath: string, comments: DocComment[]) => void
  upsertComment: (filePath: string, comment: DocComment) => void
  removeComment: (filePath: string, commentId: string) => void
  setOpenCommentId: (id: string | null) => void
  setSelectionToolbar: (state: SelectionToolbarState | null) => void
  clearChatHistory: () => void
  setChatHistory: (history: ChatMessage[]) => void
  setHonchoCtx: (ctx: { sessionId: string } | null) => void
  addSessionSummary: (summary: string) => void
  setSessionSummaries: (summaries: string[]) => void
  setMemoryFilePath: (filePath: string) => void
  setMemoryHasSummaries: (has: boolean) => void
  addWorkspaceNotification: (filePath: string, type: 'add' | 'change') => void
  dismissWorkspaceNotification: (id: string) => void
  renameOpenFile: (oldPath: string, newPath: string) => void
  /** Prefix-based remap — Session 10. Used when a parent folder is
   *  renamed on disk (e.g., an active thread is renamed via the in-Scribe
   *  pencil or the Domaines context menu): every open editor tab,
   *  fileContents entry, scroll-position entry, activeFilePath, and
   *  previewFilePath that lives inside `oldPrefix` is rewritten to point
   *  at the equivalent path under `newPrefix`. The match is exact-equal
   *  OR starts-with-`oldPrefix + '/'` so a sibling folder with a name
   *  that happens to start with the same characters doesn't get caught.
   *  Paths under any other folder are passed through unchanged. */
  remapPathsByPrefix: (oldPrefix: string, newPrefix: string) => void
}

export const useScribeStore = create<EditorState>((set) => ({
  openFiles: [],
  activeFilePath: null,
  previewFilePath: null,
  editorMode: 'document',
  fileContents: {},
  scrollPositions: {},
  chatHistory: [],
  isStreaming: false,
  pendingChatInput: null,
  pendingChatPill: null,
  pendingScrollTarget: null,
  redlines: [],
  lastRedlineSource: null,
  commentsByFile: {},
  openCommentId: null,
  selectionToolbar: null,
  honchoCtx: null,
  sessionSummaries: [],
  memoryFilePath: '',
  memoryHasSummaries: false,
  workspaceNotifications: [],

  addFile: (file) =>
    set((state) => ({
      openFiles: state.openFiles.some((f) => f.path === file.path)
        ? state.openFiles
        : [...state.openFiles, file]
    })),

  setActiveFile: (path) => set({ activeFilePath: path, editorMode: 'document' }),

  setEditorMode: (editorMode) => set({ editorMode }),

  setFileContent: (path, content) =>
    set((state) => {
      // Edit auto-promotes a preview tab — but ONLY when the content
      // actually changed. ScribePane's file-switch useEffect dispatches a
      // synthetic content swap to the editor whenever activeFilePath flips,
      // which fires updateListener → onDocChange → setFileContent with the
      // SAME content we just stored. Without this gate every preview-open
      // would self-promote in the same render cycle because the file-switch
      // sync trips the auto-promote even though the user never typed.
      const previous = state.fileContents[path]
      const changed = previous !== content
      return {
        fileContents: { ...state.fileContents, [path]: content },
        previewFilePath: changed && state.previewFilePath === path
          ? null
          : state.previewFilePath,
      }
    }),

  setScrollPosition: (path, pos) =>
    set((state) => ({
      scrollPositions: { ...state.scrollPositions, [path]: pos }
    })),

  openFileWithContent: (file, content) =>
    set((state) => ({
      openFiles: state.openFiles.some((f) => f.path === file.path)
        ? state.openFiles
        : [...state.openFiles, file],
      fileContents: { ...state.fileContents, [file.path]: content },
      activeFilePath: file.path,
      editorMode: 'document',
      // If we're re-opening what was just the preview, this counts as a
      // promotion. Other call sites land here with previewFilePath unrelated,
      // so the conditional makes the branch safe everywhere.
      previewFilePath: state.previewFilePath === file.path ? null : state.previewFilePath,
    })),

  openInPreview: (file, content) =>
    set((state) => {
      // Already open (preview or permanent) → just activate. Permanent tabs
      // stay permanent; preview tabs stay preview. No content overwrite.
      if (state.openFiles.some((f) => f.path === file.path)) {
        return {
          activeFilePath: file.path,
          editorMode: 'document',
        }
      }
      // A preview tab exists for a different file → swap that tab's entry
      // for this file. Drops the previous preview's content + scroll so the
      // memory footprint stays bounded as the user clicks around.
      if (state.previewFilePath) {
        const newOpenFiles = state.openFiles.map((f) =>
          f.path === state.previewFilePath ? file : f
        )
        const { [state.previewFilePath]: _droppedContent, ...restContents } = state.fileContents
        const { [state.previewFilePath]: _droppedScroll, ...restScrolls } = state.scrollPositions
        return {
          openFiles: newOpenFiles,
          fileContents: { ...restContents, [file.path]: content },
          scrollPositions: restScrolls,
          previewFilePath: file.path,
          activeFilePath: file.path,
          editorMode: 'document',
        }
      }
      // No preview tab → add as new preview at the end of the tab strip.
      return {
        openFiles: [...state.openFiles, file],
        fileContents: { ...state.fileContents, [file.path]: content },
        previewFilePath: file.path,
        activeFilePath: file.path,
        editorMode: 'document',
      }
    }),

  promoteToPermanent: (path) =>
    set((state) => state.previewFilePath === path
      ? { previewFilePath: null }
      : state),

  closeFile: (path) =>
    set((state) => {
      const remaining = state.openFiles.filter((f) => f.path !== path)
      const { [path]: _content, ...restContents } = state.fileContents
      const { [path]: _scroll, ...restScrolls } = state.scrollPositions

      let nextActive = state.activeFilePath
      if (state.activeFilePath === path) {
        const idx = state.openFiles.findIndex((f) => f.path === path)
        nextActive = remaining[idx]?.path ?? remaining[idx - 1]?.path ?? null
      }

      return {
        openFiles: remaining,
        fileContents: restContents,
        scrollPositions: restScrolls,
        activeFilePath: nextActive,
        previewFilePath: state.previewFilePath === path ? null : state.previewFilePath,
      }
    }),

  closeAllFiles: () =>
    set({ openFiles: [], fileContents: {}, scrollPositions: {}, activeFilePath: null, previewFilePath: null }),

  addChatMessage: (message) =>
    set((state) => ({ chatHistory: [...state.chatHistory, message] })),

  updateLastAssistantMessage: (content) =>
    set((state) => {
      const history = [...state.chatHistory]
      const last = history[history.length - 1]
      if (last?.role === 'assistant') {
        history[history.length - 1] = { ...last, content }
      }
      return { chatHistory: history }
    }),

  removeLastAssistantMessage: () =>
    set((state) => {
      const history = [...state.chatHistory]
      if (history[history.length - 1]?.role === 'assistant') {
        history.pop()
      }
      return { chatHistory: history }
    }),

  setIsStreaming: (isStreaming) => set({ isStreaming }),

  setPendingChatInput: (text) => set({ pendingChatInput: text }),

  setPendingChatPill: (pill) => set({ pendingChatPill: pill }),

  setPendingScrollTarget: (target) => set({ pendingScrollTarget: target }),

  setLastRedlineSource: (lastRedlineSource) => set({ lastRedlineSource }),
  addRedlines: (lines) => set((state) => ({ redlines: [...state.redlines, ...lines] })),
  removeRedline: (id) => set((state) => ({ redlines: state.redlines.filter((r) => r.id !== id) })),
  clearRedlinesForFile: (filePath) => set((state) => ({ redlines: state.redlines.filter((r) => r.filePath !== filePath) })),
  setRedlinesForFile: (filePath, fileRedlines) => set((state) => ({
    redlines: [...state.redlines.filter((r) => r.filePath !== filePath), ...fileRedlines],
  })),

  setCommentsForFile: (filePath, comments) => set((state) => ({
    commentsByFile: { ...state.commentsByFile, [filePath]: comments },
  })),
  upsertComment: (filePath, comment) => set((state) => {
    const existing = state.commentsByFile[filePath] ?? []
    const idx = existing.findIndex((c) => c.id === comment.id)
    const next = idx >= 0
      ? existing.map((c) => c.id === comment.id ? comment : c)
      : [...existing, comment]
    return { commentsByFile: { ...state.commentsByFile, [filePath]: next } }
  }),
  removeComment: (filePath, commentId) => set((state) => {
    const existing = state.commentsByFile[filePath] ?? []
    return {
      commentsByFile: { ...state.commentsByFile, [filePath]: existing.filter((c) => c.id !== commentId) },
      openCommentId: state.openCommentId === commentId ? null : state.openCommentId,
    }
  }),
  setOpenCommentId: (openCommentId) => set({ openCommentId }),
  setSelectionToolbar: (selectionToolbar) => set({ selectionToolbar }),

  clearChatHistory: () => set({ chatHistory: [] }),

  setChatHistory: (chatHistory) => set({ chatHistory }),

  setHonchoCtx: (honchoCtx) => set({ honchoCtx }),

  addSessionSummary: (summary) =>
    set((state) => ({ sessionSummaries: [...state.sessionSummaries, summary] })),

  setSessionSummaries: (summaries) =>
    set({ sessionSummaries: summaries }),

  setMemoryFilePath: (memoryFilePath) => set({ memoryFilePath }),
  setMemoryHasSummaries: (memoryHasSummaries) => set({ memoryHasSummaries }),

  addWorkspaceNotification: (filePath, type) =>
    set((state) => ({
      workspaceNotifications: [
        { id: crypto.randomUUID(), filePath, name: filePath.split('/').pop() ?? filePath, type },
        ...state.workspaceNotifications.slice(0, 4),
      ]
    })),

  dismissWorkspaceNotification: (id) =>
    set((state) => ({
      workspaceNotifications: state.workspaceNotifications.filter((n) => n.id !== id)
    })),

  renameOpenFile: (oldPath, newPath) =>
    set((state) => {
      const newName = newPath.split('/').pop() ?? newPath
      const openFiles = state.openFiles.map((f) =>
        f.path === oldPath ? { path: newPath, name: newName } : f
      )
      const fileContents: Record<string, string> = {}
      for (const [k, v] of Object.entries(state.fileContents)) {
        fileContents[k === oldPath ? newPath : k] = v
      }
      const scrollPositions: Record<string, number> = {}
      for (const [k, v] of Object.entries(state.scrollPositions)) {
        scrollPositions[k === oldPath ? newPath : k] = v
      }
      return {
        openFiles,
        fileContents,
        scrollPositions,
        activeFilePath: state.activeFilePath === oldPath ? newPath : state.activeFilePath,
        previewFilePath: state.previewFilePath === oldPath ? newPath : state.previewFilePath,
      }
    }),

  remapPathsByPrefix: (oldPrefix, newPrefix) =>
    set((state) => {
      // Exact-equal OR starts-with-`oldPrefix + '/'` so a sibling folder
      // whose name shares a prefix doesn't get caught. We don't use
      // path.sep — renderer paths come from main's path.join, which uses
      // '/' on macOS/Linux (the only platforms Holocron ships to today).
      const sep = '/'
      const remap = (p: string): string => {
        if (p === oldPrefix) return newPrefix
        if (p.startsWith(oldPrefix + sep)) return newPrefix + p.slice(oldPrefix.length)
        return p
      }
      const openFiles = state.openFiles.map((f) => {
        const np = remap(f.path)
        if (np === f.path) return f
        const newName = np.split(sep).pop() ?? np
        return { path: np, name: newName }
      })
      const fileContents: Record<string, string> = {}
      for (const [k, v] of Object.entries(state.fileContents)) {
        fileContents[remap(k)] = v
      }
      const scrollPositions: Record<string, number> = {}
      for (const [k, v] of Object.entries(state.scrollPositions)) {
        scrollPositions[remap(k)] = v
      }
      return {
        openFiles,
        fileContents,
        scrollPositions,
        activeFilePath:  state.activeFilePath  ? remap(state.activeFilePath)  : state.activeFilePath,
        previewFilePath: state.previewFilePath ? remap(state.previewFilePath) : state.previewFilePath,
      }
    }),
}))
