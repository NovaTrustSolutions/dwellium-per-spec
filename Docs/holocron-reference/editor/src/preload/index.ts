import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── File system ──────────────────────────────────────────────────────────
  openFileDialog: (defaultPath?: string) =>
    ipcRenderer.invoke('file:open-dialog', { defaultPath }),
  readFile: (filePath: string) =>
    ipcRenderer.invoke('file:read', { filePath }),
  readFileAsBuffer: (filePath: string) =>
    ipcRenderer.invoke('file:read-buffer', { filePath }),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:write', { filePath, content }),
  dropResolve: (paths: string[]) =>
    ipcRenderer.invoke('file:drop-resolve', { paths }),
  revealInFinder: (filePath: string) =>
    ipcRenderer.invoke('shell:reveal', { filePath }),

  // ── Config ───────────────────────────────────────────────────────────────
  configLoad: () =>
    ipcRenderer.invoke('config:load'),
  configSave: (config: unknown) =>
    ipcRenderer.invoke('config:save', { config }),

  // ── Connection tests ─────────────────────────────────────────────────────
  connectionTestAi: (baseUrl: string, model: string, apiKey: string) =>
    ipcRenderer.invoke('connection:test-ai', { baseUrl, model, apiKey }),
  connectionTestHoncho: (url: string) =>
    ipcRenderer.invoke('connection:test-honcho', { url }),
  connectionTestFirecrawl: (apiKey: string, baseUrl: string) =>
    ipcRenderer.invoke('connection:test-firecrawl', { apiKey, baseUrl }),

  // ── Docker ───────────────────────────────────────────────────────────────
  dockerStatus: () =>
    ipcRenderer.invoke('docker:status'),
  dockerStart: () =>
    ipcRenderer.invoke('docker:start'),
  dockerStop: () =>
    ipcRenderer.invoke('docker:stop'),

  // ── Firecrawl ────────────────────────────────────────────────────────────
  firecrawlScrape: (apiKey: string, baseUrl: string, url: string) =>
    ipcRenderer.invoke('firecrawl:scrape', { apiKey, baseUrl, url }),
  firecrawlSearch: (apiKey: string, baseUrl: string, query: string) =>
    ipcRenderer.invoke('firecrawl:search', { apiKey, baseUrl, query }),

  // ── Editor insert ────────────────────────────────────────────────────────
  scribeInsertAtCursor: (content: string) =>
    ipcRenderer.send('scribe:insert-at-cursor', { content }),
  onScribeInsert: (callback: (content: string) => void) => {
    const handler = (_: IpcRendererEvent, content: string) => callback(content)
    ipcRenderer.on('scribe:insert', handler)
    return () => ipcRenderer.removeListener('scribe:insert', handler)
  },

  // ── LM Studio streaming ──────────────────────────────────────────────────
  startLMStream: (
    messages: Array<{ role: string; content: string }>,
    opts: {
      baseUrl: string; model: string; apiKey: string
      temperature?: number; maxTokens?: number
      provider?: 'gemini' | 'anthropic' | 'lmstudio'
      task?: string
    }
  ) => ipcRenderer.send('lm:start', { messages, ...opts }),
  onLMToken: (callback: (token: string) => void) => {
    const handler = (_: IpcRendererEvent, token: string) => callback(token)
    ipcRenderer.on('lm:token', handler)
    return () => ipcRenderer.removeListener('lm:token', handler)
  },
  onLMEnd: (callback: (error: string | null) => void) => {
    const handler = (_: IpcRendererEvent, data: { error: string | null }) => callback(data.error)
    ipcRenderer.on('lm:end', handler)
    return () => ipcRenderer.removeListener('lm:end', handler)
  },

  // ── Honcho memory (v3) ──────────────────────────────────────────────────
  honchoInit: (sessionId?: string): Promise<{ sessionId: string } | null> =>
    ipcRenderer.invoke('honcho:init', sessionId ? { sessionId } : undefined),
  honchoSaveMessage: (sessionId: string, peerId: string, content: string) =>
    ipcRenderer.invoke('honcho:save-message', { sessionId, peerId, content }),
  honchoGetMessages: (sessionId: string) =>
    ipcRenderer.invoke('honcho:get-messages', { sessionId }),
  honchoGetContext: (sessionId: string, tokens?: number) =>
    ipcRenderer.invoke('honcho:get-context', { sessionId, tokens }),
  honchoNewSession: (): Promise<string | null> =>
    ipcRenderer.invoke('honcho:new-session'),
  honchoDream: (sessionId: string, context: { threadName: string; projectName: string; domaineName: string | null }, peerId?: string) =>
    ipcRenderer.invoke('honcho:dream', { sessionId, context, peerId }),
  honchoScheduleDream: (dreamType?: 'omni' | 'theme') =>
    ipcRenderer.invoke('honcho:schedule-dream', { dreamType }),
  honchoPostConclusion: (content: string, sessionId?: string) =>
    ipcRenderer.invoke('honcho:post-conclusion', { content, sessionId }),
  honchoDeleteSession: (sessionId: string) =>
    ipcRenderer.invoke('honcho:delete-session', { sessionId }),
  threadClearHonchoSession: (threadPath: string, threadName: string, projectName: string) =>
    ipcRenderer.invoke('thread:clear-honcho-session', { threadPath, threadName, projectName }),
  threadAppendDreamInsight: (threadPath: string, projectName: string, threadName: string, trigger: string, insight: string) =>
    ipcRenderer.invoke('thread:append-dream-insight', { threadPath, projectName, threadName, trigger, insight }),
  threadReadMemoryFile: (threadPath: string, projectName: string, threadName: string) =>
    ipcRenderer.invoke('thread:read-memory-file', { threadPath, projectName, threadName }),
  honchoClearAllSessions: () =>
    ipcRenderer.invoke('honcho:clear-all-sessions'),

  // ── Hive (architecture-v4 Part 5) ───────────────────────────────────────
  hiveHonchoStats: () => ipcRenderer.invoke('hive:honcho-stats'),
  hiveValidationStats: () => ipcRenderer.invoke('hive:validation-stats'),
  hiveRunValidationSweep: () => ipcRenderer.invoke('hive:run-validation-sweep'),
  hiveListSyntheses: (limit?: number) =>
    ipcRenderer.invoke('hive:list-syntheses', { limit }),
  hiveFoundryStats: () => ipcRenderer.invoke('hive:foundry-stats'),

  // ── Hermes (architecture-v4 §4.5 §10 — Session 5) ────────────────────────
  // hermesStatus is polled by the Hive Hermes card; hermesStart/Stop are
  // user-toggled from the same card. Single toggle controls both the
  // Telegram poll loop and the iCloud watcher.
  hermesStatus: () => ipcRenderer.invoke('hermes:status'),
  hermesStart:  () => ipcRenderer.invoke('hermes:start'),
  hermesStop:   () => ipcRenderer.invoke('hermes:stop'),
  synthesisGenerateGapBridge: (args: {
    gapId: string
    clusterA: { id: number; name: string; topTags: string[] }
    clusterB: { id: number; name: string; topTags: string[] }
    topDocs: Array<{ title: string; sourcePath: string }>
    domaineId?: string | null
    synthesisType?: 'gap-bridge' | 'honcho-dream'
  }) => ipcRenderer.invoke('synthesis:generate-gap-bridge', args),

  // ── Foundry (architecture-v4 Part 6 — Session 4) ─────────────────────────
  // Capture is blocking on insert (renderer awaits the id for the toast);
  // triage fires server-side fire-and-forget; the Review interface polls
  // foundryList to discover triaged items. statuses defaults to all four
  // when omitted.
  foundryCaptureUrl: (url: string, triageMode?: 'extract' | 'convert') =>
    ipcRenderer.invoke('foundry:capture-url', { url, triageMode }),
  foundryCaptureText: (content: string, title: string, triageMode?: 'extract' | 'convert') =>
    ipcRenderer.invoke('foundry:capture-text', { content, title, triageMode }),
  foundryCaptureFile: (content: string, filename: string, triageMode?: 'extract' | 'convert') =>
    ipcRenderer.invoke('foundry:capture-file', { content, filename, triageMode }),
  // Binary (PDF/DOCX) capture — main-side decodes via pdf-parse / mammoth.
  // ArrayBuffer rides Electron's structured-clone IPC; the main handler
  // wraps it back into a Uint8Array before invoking captureFileBinary.
  foundryCaptureFileBinary: (bytes: ArrayBuffer, filename: string, triageMode?: 'extract' | 'convert') =>
    ipcRenderer.invoke('foundry:capture-file-binary', { bytes, filename, triageMode }),
  foundryList: (args?: { statuses?: Array<'pending' | 'triaged' | 'approved' | 'rejected'>; limit?: number }) =>
    ipcRenderer.invoke('foundry:list', args),
  foundryListTargetThreads: () =>
    ipcRenderer.invoke('foundry:list-target-threads'),
  foundryApprove: (args: {
    id: string
    content: string
    filename: string
    targetThreadPath?: string | null
    reviewerNotes?: string | null
  }) => ipcRenderer.invoke('foundry:approve', args),
  foundryReject: (args: { id: string; notes?: string | null }) =>
    ipcRenderer.invoke('foundry:reject', args),
  foundryDeleteRejected: (id: string) =>
    ipcRenderer.invoke('foundry:delete-rejected', { id }),
  foundryDeleteAllRejected: () =>
    ipcRenderer.invoke('foundry:delete-all-rejected'),
  foundryDeleteAllAdmitted: () =>
    ipcRenderer.invoke('foundry:delete-all-admitted'),
  foundryRestore: (id: string) =>
    ipcRenderer.invoke('foundry:restore', { id }),

  // ── RAG ingestion (manual / re-ingest) ───────────────────────────────────
  ragIngestManual: (filePath: string) =>
    ipcRenderer.invoke('rag:ingest-manual', { filePath }),

  // ── RAG search (Library → Search) ────────────────────────────────────────
  ragSearch: (args: {
    query: string
    domaineId: string | null
    crossDomaine: boolean
    sourceRoot?: 'projects' | 'library' | 'inbox' | null
    sourceType?: string | null
    limit?: number
  }) => ipcRenderer.invoke('rag:search', args),

  // ── Dashboard ────────────────────────────────────────────────────────────
  hudStatus: () => ipcRenderer.invoke('hud:status'),
  hudStats: () => ipcRenderer.invoke('hud:stats'),
  hudRecentActivity: (limit?: number) =>
    ipcRenderer.invoke('hud:recent-activity', { limit }),

  // ── Ingest (Codex → Ingest sub-tab) ──────────────────────────────────────
  ingestListDocuments: (args?: {
    domaineId?: string | null
    crossDomaine?: boolean
    sourceType?: string | null
    tier?: 'thread' | 'project' | 'domaine' | null
    search?: string | null
    limit?: number
    offset?: number
  }) => ipcRenderer.invoke('ingest:list-documents', args ?? {}),
  ingestListActivity: (limit?: number) =>
    ipcRenderer.invoke('ingest:list-activity', { limit }),
  ingestCounts: () => ipcRenderer.invoke('ingest:counts'),
  ingestPickAndIngest: (defaultPath?: string) =>
    ipcRenderer.invoke('ingest:pick-and-ingest', { defaultPath }),
  ingestSyncWorkspace: () =>
    ipcRenderer.invoke('ingest:sync-workspace'),

  // ── Cleanup (Ingest sub-tab maintenance tools) ───────────────────────────
  ingestDeleteDocument: (sourcePath: string) =>
    ipcRenderer.invoke('ingest:delete-document', { sourcePath }),
  ingestScanDeadLinks: () => ipcRenderer.invoke('ingest:scan-dead-links'),
  ingestPurgeDeadLinks: (ids?: string[]) =>
    ipcRenderer.invoke('ingest:purge-dead-links', { ids }),
  ingestScanOrphans: () => ipcRenderer.invoke('ingest:scan-orphans'),
  ingestSweepOrphans: () => ipcRenderer.invoke('ingest:sweep-orphans'),
  ingestHealthScan: () => ipcRenderer.invoke('ingest:health-scan'),

  // ── Graph (Codex → Graph sub-tab) ────────────────────────────────────────
  // Session 7 second-pass — `domaineIds` is the multi-select filter; the
  // legacy `domaineId` is retained for backwards compat (single-Domaine
  // callers that haven't migrated).
  graphFetch: (args?: { domaineId?: string | null; domaineIds?: string[] | null; crossDomaine?: boolean }) =>
    ipcRenderer.invoke('graph:fetch', args ?? {}),
  // ── Graph analytics (Codex → Syntheses + Constellation theme) ─────────
  graphAnalytics: (args?: {
    domaineId?: string | null
    domaineIds?: string[] | null
    crossDomaine?: boolean
    topInfluential?: number
    topGaps?: number
  }) => ipcRenderer.invoke('graph:analytics', args ?? {}),

  // ── Wiki (Library → Wiki sub-tab UI lands in step 11) ────────────────────
  wikiList: (args?: {
    domaineId?: string | null
    crossDomaine?: boolean
    tier?: 'thread' | 'project' | 'domaine'
  }) =>
    ipcRenderer.invoke('wiki:list', args),
  wikiGet: (slug: string) => ipcRenderer.invoke('wiki:get', { slug }),
  wikiGetSources: (slug: string) => ipcRenderer.invoke('wiki:get-sources', { slug }),
  wikiRegenerate: (slug: string) => ipcRenderer.invoke('wiki:regenerate', { slug }),
  wikiCompileNow: () => ipcRenderer.invoke('wiki:compile-now'),
  wikiImportToThread: (slug: string, projectName: string, threadName: string, overwrite?: boolean) =>
    ipcRenderer.invoke('wiki:import-to-thread', { slug, projectName, threadName, overwrite }),
  wikiUseAsReportDraft: (slug: string, projectName: string, threadName: string) =>
    ipcRenderer.invoke('wiki:use-as-report-draft', { slug, projectName, threadName }),

  // ── LM non-streaming ─────────────────────────────────────────────────────
  lmComplete: (
    messages: Array<{ role: string; content: string }>,
    opts: {
      baseUrl: string; model: string; apiKey: string
      temperature?: number; maxTokens?: number
      provider?: 'gemini' | 'anthropic' | 'lmstudio'
      task?: string
    }
  ) => ipcRenderer.invoke('lm:complete', { messages, ...opts }),

  // ── Export ───────────────────────────────────────────────────────────────
  exportPdf: (content: string, fileName: string) =>
    ipcRenderer.invoke('export:pdf', { content, fileName }),
  exportDocx: (content: string, fileName: string) =>
    ipcRenderer.invoke('export:docx', { content, fileName }),
  exportHtml: (content: string, fileName: string) =>
    ipcRenderer.invoke('export:html', { content, fileName }),
  exportText: (content: string, fileName: string) =>
    ipcRenderer.invoke('export:text', { content, fileName }),

  // ── File system (session explorer) ──────────────────────────────────────
  fsReaddir: (path: string) =>
    ipcRenderer.invoke('fs:readdir', { path }),
  fsCreateFile: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:create-file', { dirPath, name }),
  fsPasteClipboardImage: (dirPath: string) =>
    ipcRenderer.invoke('fs:paste-clipboard-image', { dirPath }),
  fsCreateDir: (parentPath: string, name: string) =>
    ipcRenderer.invoke('fs:create-dir', { parentPath, name }),
  fsRename: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('fs:rename', { oldPath, newPath }),
  fsDelete: (path: string) =>
    ipcRenderer.invoke('fs:delete', { path }),
  fsMove: (srcPath: string, destDir: string) =>
    ipcRenderer.invoke('fs:move', { srcPath, destDir }),
  fsCopy: (srcPath: string, destDir: string) =>
    ipcRenderer.invoke('fs:copy', { srcPath, destDir }),
  fsExists: (path: string) =>
    ipcRenderer.invoke('fs:exists', { path }),
  filesImport: (destDir: string) =>
    ipcRenderer.invoke('files:import', { destDir }),
  convertCheck: (filePath: string) =>
    ipcRenderer.invoke('convert:check', { filePath }),
  convertToMarkdown: (filePath: string) =>
    ipcRenderer.invoke('convert:to-markdown', { filePath }),
  convertToMarkdownBatch: (filePaths: string[]) =>
    ipcRenderer.invoke('convert:to-markdown-batch', { filePaths }),

  // ── Sessions ──────────────────────────────────────────────────────────────
  sessionList: (holocronRoot: string) =>
    ipcRenderer.invoke('session:list', { holocronRoot }),
  sessionCreate: (holocronRoot: string, name: string, setAsGlobalRoot = true) =>
    ipcRenderer.invoke('session:create', { holocronRoot, name, setAsGlobalRoot }),
  sessionComplete: (sessionPath: string) =>
    ipcRenderer.invoke('session:complete', { sessionPath }),
  sessionSetActive: (id: string, name: string, holocronRoot: string) =>
    ipcRenderer.invoke('session:set-active', { id, name, holocronRoot }),

  // ── Domaines ──────────────────────────────────────────────────────────
  domainesList: () => ipcRenderer.invoke('domaines:list'),
  domainesProjectMap: () => ipcRenderer.invoke('domaines:project-map'),
  domainesCreate: (args: { name: string; description?: string; color?: string }) =>
    ipcRenderer.invoke('domaines:create', args),
  domainesUpdate: (args: {
    id: string; name?: string; description?: string | null; color?: string | null; position?: number
  }) => ipcRenderer.invoke('domaines:update', args),
  // v11 reset: discriminated union — reassign or purge. No fallback.
  domainesDelete: (
    id:      string,
    options: { mode: 'reassign'; targetDomaineId: string } | { mode: 'purge'; confirmName: string },
  ) => ipcRenderer.invoke('domaines:delete', { id, options }),
  domainesRenameSummary: (id: string) =>
    ipcRenderer.invoke('domaines:rename-summary', { id }),

  // ── Projects / Threads ───────────────────────────────────────────────────
  projectsList: (projectsRoot: string, domaineId?: string) =>
    ipcRenderer.invoke('projects:list', { projectsRoot, domaineId }),
  projectsCreate: (projectsRoot: string, name: string, domaineId?: string) =>
    ipcRenderer.invoke('projects:create', { projectsRoot, name, domaineId }),
  projectsRename: (projectPath: string, newName: string) =>
    ipcRenderer.invoke('projects:rename', { projectPath, newName }),
  projectsMove: (projectName: string, targetDomaineId: string) =>
    ipcRenderer.invoke('projects:move', { projectName, targetDomaineId }),
  projectsPurgeSummary: (projectPath: string) =>
    ipcRenderer.invoke('projects:purge-summary', { projectPath }),
  projectsPurge: (projectPath: string, confirmName: string) =>
    ipcRenderer.invoke('projects:purge', { projectPath, confirmName }),

  // ── Maintenance ───────────────────────────────────────────────────────
  maintenanceNuclearReset: () =>
    ipcRenderer.invoke('maintenance:nuclear-reset'),
  threadsList: (projectPath: string) =>
    ipcRenderer.invoke('projects:threads:list', { projectPath }),
  threadsCreate: (projectPath: string, name: string) =>
    ipcRenderer.invoke('projects:threads:create', { projectPath, name }),
  threadsRename: (projectPath: string, oldName: string, newName: string) =>
    ipcRenderer.invoke('thread:rename', { projectPath, oldName, newName }),
  threadsMove: (srcProjectPath: string, threadName: string, targetProjectPath: string) =>
    ipcRenderer.invoke('thread:move', { srcProjectPath, threadName, targetProjectPath }),
  // Session 6 warmup — flat thread list for the Scribe "Move to thread"
  // picker. excludeThreadPath skips the active thread (no-op destination).
  docListThreadsFlat: (excludeThreadPath?: string) =>
    ipcRenderer.invoke('doc:list-threads-flat', { excludeThreadPath }),
  // Session 6 warmup — atomic move into <destThreadPath>/References/.
  docMoveToThread: (srcPath: string, destThreadPath: string) =>
    ipcRenderer.invoke('doc:move-to-thread', { srcPath, destThreadPath }),
  threadsPurgeSummary: (threadPath: string) =>
    ipcRenderer.invoke('thread:purge-summary', { threadPath }),
  threadsPurge: (threadPath: string, confirmName: string) =>
    ipcRenderer.invoke('thread:purge', { threadPath, confirmName }),
  threadsLoad: (projectName: string, projectPath: string, threadName: string, threadPath: string) =>
    ipcRenderer.invoke('projects:threads:load', { projectName, projectPath, threadName, threadPath }),
  threadComplete: (threadPath: string) =>
    ipcRenderer.invoke('thread:complete', { threadPath }),
  threadBindHoncho: (threadPath: string, threadName: string, projectName: string) =>
    ipcRenderer.invoke('thread:bind-honcho', { threadPath, threadName, projectName }),
  threadReadMeta: (threadPath: string) =>
    ipcRenderer.invoke('thread:read-meta', { threadPath }),
  threadBranch: (projectPath: string, newThreadName: string, predecessorPath: string) =>
    ipcRenderer.invoke('thread:branch', { projectPath, newThreadName, predecessorPath }),
  threadResetContext: (
    threadPath: string, threadName: string, projectName: string,
    lm: {
      baseUrl: string; model: string; apiKey: string
      provider?: 'gemini' | 'anthropic' | 'lmstudio'
    },
  ) => ipcRenderer.invoke('thread:reset-context', { threadPath, threadName, projectName, lm }),
  threadReadMemorySummaries: (threadPath: string, projectName: string, threadName: string) =>
    ipcRenderer.invoke('thread:read-memory-summaries', { threadPath, projectName, threadName }),
  dumpAppend: (threadPath: string, projectName: string, threadName: string, content: string) =>
    ipcRenderer.invoke('dump:append', { threadPath, projectName, threadName, content }),
  noteAppend: (threadPath: string, projectName: string, threadName: string, content: string) =>
    ipcRenderer.invoke('note:append', { threadPath, projectName, threadName, content }),
  intakePickReferences: () =>
    ipcRenderer.invoke('intake:pick-references'),
  intakeAddReferences: (threadPath: string, filePaths: string[]) =>
    ipcRenderer.invoke('intake:add-references', { threadPath, filePaths }),
  threadMarkIntakeShown: (threadPath: string) =>
    ipcRenderer.invoke('thread:mark-intake-shown', { threadPath }),
  reportGenerate: (threadPath: string, projectName: string, threadName: string, namePrefix: string, referenceFiles: string[]) =>
    ipcRenderer.invoke('report:generate', { threadPath, projectName, threadName, namePrefix, referenceFiles }),
  versionCreate: (filePath: string) =>
    ipcRenderer.invoke('version:create', { filePath }),
  commentsRead: (docPath: string) =>
    ipcRenderer.invoke('comments:read', { docPath }),
  commentsWrite: (docPath: string, comments: unknown[]) =>
    ipcRenderer.invoke('comments:write', { docPath, comments }),

  // ── Workspace ────────────────────────────────────────────────────────────
  workspaceBrowse: (): Promise<string | null> =>
    ipcRenderer.invoke('workspace:browse'),
  workspaceSetPath: (folderPath: string) =>
    ipcRenderer.invoke('workspace:set-path', { folderPath }),
  workspaceWriteFile: (relPath: string, content: string) =>
    ipcRenderer.invoke('workspace:write-file', { relPath, content }),
  onWorkspaceFileChange: (callback: (data: { filePath: string; type: 'add' | 'change' }) => void) => {
    const handler = (_: IpcRendererEvent, data: { filePath: string; type: 'add' | 'change' }) => callback(data)
    ipcRenderer.on('workspace:file-changed', handler)
    return () => ipcRenderer.removeListener('workspace:file-changed', handler)
  },

  // ── LM abort ─────────────────────────────────────────────────────────────
  abortLMStream: () => ipcRenderer.send('lm:abort'),

  // ── App lifecycle ─────────────────────────────────────────────────────────
  onBeforeQuit: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.once('app:before-quit', handler)
    return () => ipcRenderer.removeListener('app:before-quit', handler)
  },
  signalQuitReady: () => ipcRenderer.send('app:quit-ready'),
})
