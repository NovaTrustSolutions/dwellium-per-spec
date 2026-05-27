import type { HolocronConfig, DockerStatus } from '../store/settingsStore'

export interface FsEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  mtime: number
  size: number
}

export interface DomaineInfo {
  id:           string
  name:         string
  description:  string | null
  color:        string | null
  position:     number
  created_at:   string
  projectCount: number
}

export interface ProjectInfo {
  name: string
  path: string
  threadCount: number
  lastModified: number
}

export interface Comment {
  id: string
  fromLine: number    // 1-indexed lines
  toLine: number
  originalText: string
  comment: string
  createdAt: string
  resolved: boolean
}

export interface ContinuedFrom {
  threadName: string
  threadPath: string
  honchoSessionId: string
  branchedAt: string
  compressionCountAtBranch: number
}

export interface ThreadMeta {
  name: string
  projectName: string
  createdAt: string
  lastModified: string
  honchoSessionId: string
  status: 'active' | 'complete'
  stage: number
  continuedFrom: ContinuedFrom | null
  inheritedContext: string | null
  compressionCount: number
  dumpCount: number
  reportCount: number
  lastDreamQuery: string | null
  intakePromptShown: boolean
}

export interface ThreadInfo {
  name: string
  path: string
  fileCount: number
  lastModified: number
  isComplete: boolean
  isActive: boolean
}

export interface SessionInfo {
  id: string
  name: string
  path: string
  fileCount: number
  mtime: number
  isComplete: boolean
}

export interface TestResult { ok: boolean; message: string }
export interface ScrapeResult { markdown: string; title: string; url: string; error?: string }
export interface SearchResult { results: Array<{ title: string; url: string; markdown: string }>; error?: string }

export interface ElectronAPI {
  // File system
  openFileDialog: (defaultPath?: string) => Promise<string | null>
  readFile: (filePath: string) => Promise<{ content: string; filePath: string }>
  readFileAsBuffer: (filePath: string) => Promise<{ base64: string; filePath: string }>
  writeFile: (filePath: string, content: string) => Promise<{ ok: boolean }>
  dropResolve: (paths: string[]) => Promise<{ resolvedPaths: string[] }>
  revealInFinder: (filePath: string) => Promise<void>

  // Config
  configLoad: () => Promise<HolocronConfig>
  configSave: (config: HolocronConfig) => Promise<{ ok: boolean }>

  // Connection tests
  connectionTestAi: (baseUrl: string, model: string, apiKey: string) => Promise<TestResult>
  connectionTestHoncho: (url: string) => Promise<TestResult>
  connectionTestFirecrawl: (apiKey: string, baseUrl: string) => Promise<TestResult>

  // Docker
  dockerStatus: () => Promise<DockerStatus>
  dockerStart: () => Promise<{ ok: boolean; output: string }>
  dockerStop: () => Promise<{ ok: boolean; output: string }>

  // Firecrawl
  firecrawlScrape: (apiKey: string, baseUrl: string, url: string) => Promise<ScrapeResult>
  firecrawlSearch: (apiKey: string, baseUrl: string, query: string) => Promise<SearchResult>

  // Editor insert
  scribeInsertAtCursor: (content: string) => void
  onScribeInsert: (callback: (content: string) => void) => () => void

  // LM Studio streaming
  startLMStream: (
    messages: Array<{ role: string; content: string }>,
    opts: {
      baseUrl: string; model: string; apiKey: string
      temperature?: number; maxTokens?: number
      provider?: 'gemini' | 'anthropic' | 'lmstudio'
      task?: string
    }
  ) => void
  onLMToken: (callback: (token: string) => void) => () => void
  onLMEnd: (callback: (error: string | null) => void) => () => void

  // File system (session explorer)
  fsReaddir: (path: string) => Promise<FsEntry[]>
  fsCreateFile: (dirPath: string, name: string) => Promise<{ ok: boolean; filePath: string; error?: string }>
  fsPasteClipboardImage: (dirPath: string) => Promise<{ ok: boolean; filePath?: string; name?: string; error?: string }>
  fsCreateDir: (parentPath: string, name: string) => Promise<{ ok: boolean; dirPath: string; error?: string }>
  fsRename: (oldPath: string, newPath: string) => Promise<{ ok: boolean; error?: string }>
  fsDelete: (path: string) => Promise<{ ok: boolean; error?: string }>
  fsMove: (srcPath: string, destDir: string) => Promise<{ ok: boolean; newPath: string; error?: string }>
  fsCopy: (srcPath: string, destDir: string) => Promise<{ ok: boolean; newPath: string; error?: string }>
  fsExists: (path: string) => Promise<{ exists: boolean; isDirectory: boolean }>
  filesImport: (destDir: string) => Promise<{ ok: boolean; imported: string[]; skipped: string[]; canceled: boolean; error?: string }>

  // Document conversion (P3-B)
  convertCheck: (filePath: string) => Promise<{ convertible: boolean; isImage: boolean }>
  convertToMarkdown: (filePath: string) => Promise<{ ok: boolean; filePath: string; outputPath: string; isOcrPlaceholder?: boolean; error?: string }>
  convertToMarkdownBatch: (filePaths: string[]) => Promise<{ results: Array<{ ok: boolean; filePath: string; outputPath: string; isOcrPlaceholder?: boolean; error?: string }> }>

  // Sessions
  sessionList: (holocronRoot: string) => Promise<SessionInfo[]>
  sessionCreate: (holocronRoot: string, name: string, setAsGlobalRoot?: boolean) => Promise<{ ok: boolean; path: string; id: string; error?: string }>
  sessionComplete: (sessionPath: string) => Promise<{ ok: boolean; error?: string }>
  sessionSetActive: (id: string, name: string, holocronRoot: string) => Promise<{ ok: boolean }>

  // Projects / Threads
  // Domaines (top organizational layer above Projects)
  domainesList: () => Promise<{ ok: boolean; data?: DomaineInfo[]; error?: string }>
  /** Returns project-name → domaine_id mapping for every namespace row.
   *  Renderer composes with domainesList() to look up which Domaine a doc
   *  belongs to via its project_name. */
  domainesProjectMap: () => Promise<{
    ok: boolean
    data?: Array<{ name: string; domaine_id: string }>
    error?: string
  }>
  domainesCreate: (args: { name: string; description?: string; color?: string })
    => Promise<{ ok: boolean; id?: string; error?: string }>
  domainesUpdate: (args: {
    id: string
    name?: string
    description?: string | null
    color?: string | null
    position?: number
  }) => Promise<{ ok: boolean; error?: string }>
  /** v11 reset: delete a Domaine via reassign or purge. No fallback exists. */
  domainesDelete: (
    id:      string,
    options: { mode: 'reassign'; targetDomaineId: string } | { mode: 'purge'; confirmName: string },
  ) => Promise<{ ok: boolean; reassigned?: number; purgedDocs?: number; error?: string }>
  /** Cheap pre-fetch for the rename modal: how many docs would have their
   *  source_path rewritten if this Domaine's folder is renamed. */
  domainesRenameSummary: (id: string) => Promise<{ documentCount: number; projectCount: number }>

  // `domaineId` filters the list (or assigns the new project) to a specific
  // Domaine. Omit to list all projects regardless of Domaine (legacy behavior),
  // or to create with the default General Domaine.
  projectsList: (projectsRoot: string, domaineId?: string) => Promise<ProjectInfo[]>
  projectsCreate: (projectsRoot: string, name: string, domaineId?: string)
    => Promise<{ ok: boolean; path: string; error?: string }>
  // CRUD: Reorganize (rename / move) and Purge (irreversible delete with typed confirmation).
  // v12 Bug 6: path-based — caller supplies the full nested project path
  // (`<projectsRoot>/<DomaineName>/<ProjectName>/`) so the backend can derive
  // parent dir and Domaine id without rebuilding from flat assumptions.
  projectsRename: (projectPath: string, newName: string)
    => Promise<{ ok: boolean; error?: string }>
  projectsMove: (projectName: string, targetDomaineId: string)
    => Promise<{ ok: boolean; error?: string }>
  projectsPurgeSummary: (projectPath: string)
    => Promise<{ threadCount: number; documentCount: number }>
  projectsPurge: (projectPath: string, confirmName: string)
    => Promise<{ ok: boolean; deletedDocs?: number; deletedThreads?: number; error?: string }>

  // Nuclear Reset (Maintenance tab) — wipes content tables + Domaines +
  // user namespaces (preserves bridges + config + migrations) and removes
  // every project folder under projectsRoot. Irreversible.
  maintenanceNuclearReset: () => Promise<{
    ok:    boolean
    error?: string
    summary: {
      documents:      number
      tags:           number
      wikiPages:      number
      syntheses:      number
      operations:     number
      domaines:       number
      namespaces:     number
      foldersRemoved: number
    } | null
  }>
  threadsList: (projectPath: string) => Promise<ThreadInfo[]>
  threadsCreate: (projectPath: string, name: string) => Promise<{ ok: boolean; path: string; error?: string }>
  // Session 10 — return widened with newPath / newName / wasActive so the
  // renderer can remap scribeStore + re-hydrate config when an active
  // thread is renamed. Inactive renames return the same fields for
  // symmetry; `wasActive` is false in that case.
  threadsRename: (projectPath: string, oldName: string, newName: string)
    => Promise<{ ok: boolean; error?: string; newPath?: string; newName?: string; wasActive?: boolean }>
  threadsMove: (srcProjectPath: string, threadName: string, targetProjectPath: string)
    => Promise<{ ok: boolean; error?: string }>
  // Session 6 warmup — flat thread list for the Scribe "Move to thread"
  // picker (across all Domaines/Projects). Sorted alphabetically by the
  // <Domaine› Project› Thread> breadcrumb.
  docListThreadsFlat: (excludeThreadPath?: string) => Promise<{
    ok: boolean
    error?: string
    threads: Array<{ threadPath: string; threadName: string; projectName: string; domaineName: string }>
  }>
  // Session 6 warmup — atomic move of a single document file into the
  // destination thread's References/ folder. Chokidar handles SQL state via
  // unlink/add events; ragIngest re-runs Gemini tag extraction at the new
  // path (same cost as the manual workaround this codifies).
  docMoveToThread: (srcPath: string, destThreadPath: string)
    => Promise<{ ok: boolean; newPath?: string; error?: string }>
  threadsPurgeSummary: (threadPath: string)
    => Promise<{ documentCount: number }>
  threadsPurge: (threadPath: string, confirmName: string)
    => Promise<{ ok: boolean; deletedDocs?: number; error?: string }>
  threadsLoad: (projectName: string, projectPath: string, threadName: string, threadPath: string) => Promise<{ ok: boolean }>
  threadComplete: (threadPath: string) => Promise<{ ok: boolean; error?: string }>
  threadBindHoncho: (threadPath: string, threadName: string, projectName: string) => Promise<{ ok: boolean; sessionId: string; error?: string }>
  threadReadMeta: (threadPath: string) => Promise<ThreadMeta | null>
  threadBranch: (projectPath: string, newThreadName: string, predecessorPath: string) => Promise<{ ok: boolean; path: string; honchoSessionId?: string; error?: string }>
  threadResetContext: (
    threadPath: string, threadName: string, projectName: string,
    lm: {
      baseUrl: string; model: string; apiKey: string
      provider?: 'gemini' | 'anthropic' | 'lmstudio'
    },
  ) => Promise<{ ok: boolean; newSessionId?: string; summarySaved?: boolean; summarySource?: 'honcho' | 'fallback' | 'none'; error?: string }>
  threadReadMemorySummaries: (threadPath: string, projectName: string, threadName: string) => Promise<{ ok: boolean; summaries: Array<{ timestamp: string; trigger: string; honchoSessionId: string; summary: string }>; error?: string }>
  dumpAppend: (threadPath: string, projectName: string, threadName: string, content: string) => Promise<{ ok: boolean; filePath: string; promptNumber: number; timestamp: string; headingText: string; error?: string }>
  noteAppend: (threadPath: string, projectName: string, threadName: string, content: string) => Promise<{ ok: boolean; filePath: string; timestamp: string; createdFile: boolean; error?: string }>

  // Intake (P3-C)
  intakePickReferences: () => Promise<{ canceled: boolean; filePaths: string[] }>
  intakeAddReferences: (threadPath: string, filePaths: string[]) => Promise<{ ok: boolean; copied: string[]; skipped: string[]; error?: string }>
  threadMarkIntakeShown: (threadPath: string) => Promise<{ ok: boolean }>

  // Reports (P4-A) + Versioning (P4-B)
  reportGenerate: (threadPath: string, projectName: string, threadName: string, namePrefix: string, referenceFiles: string[]) => Promise<{ ok: boolean; filePath: string; versionNumber: number; error?: string }>
  versionCreate: (filePath: string) => Promise<{ ok: boolean; filePath: string; newVersionNumber: number; renamedOriginal?: { from: string; to: string }; error?: string }>

  // Comments (Fix 4)
  commentsRead: (docPath: string) => Promise<Comment[]>
  commentsWrite: (docPath: string, comments: Comment[]) => Promise<{ ok: boolean; filePath: string; error?: string }>

  // Honcho memory (v3)
  honchoInit: (sessionId?: string) => Promise<{ sessionId: string } | null>
  honchoSaveMessage: (sessionId: string, peerId: string, content: string) => Promise<{ ok: boolean }>
  honchoGetMessages: (sessionId: string) => Promise<Array<{ role: 'user' | 'assistant'; content: string }>>
  honchoGetContext: (sessionId: string, tokens?: number) => Promise<{
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    summary: string | null
  }>
  honchoNewSession: () => Promise<string | null>

  // Dreaming Agent — primary trigger now schedule_dream (returns 204, no
  // synchronous content); falls back to dialectic /chat for an immediate
  // insight on deployments without schedule_dream. Discriminated union: the
  // 'scheduled' mode has no insight string; the 'sync' mode does.
  honchoDream: (
    sessionId: string,
    context: { threadName: string; projectName: string; domaineName: string | null },
    peerId?: string,
  ) => Promise<
    | { ok: true; mode: 'scheduled' }
    | { ok: true; mode: 'sync'; insight: string }
    | { ok: false; error: string }
  >

  // Direct schedule_dream trigger — Hive Honcho card uses this for the
  // "Schedule Dream" button (no synchronous insight expected).
  honchoScheduleDream: (dreamType?: 'omni' | 'theme') => Promise<{ ok: boolean; status: number; error?: string }>

  // Post a Honcho Conclusion — CoPaw's write target. Fire-and-forget from
  // the renderer; the IPC still returns ok/error for callers that want it.
  honchoPostConclusion: (content: string, sessionId?: string) => Promise<{ ok: boolean; error?: string }>

  // Server-side Honcho session deletion. Returns { supported: false } on
  // deployments that don't expose DELETE — caller should rotate to a fresh
  // session as a fallback.
  honchoDeleteSession: (sessionId: string) => Promise<{ ok: boolean; supported: boolean; error?: string }>

  // Clear the active thread's Honcho session: best-effort server-side DELETE,
  // ALWAYS rotates thread.json to a fresh session id. Honest copy: the local
  // Memory file is untouched (per spec).
  threadClearHonchoSession: (threadPath: string, threadName: string, projectName: string) => Promise<{
    ok: boolean
    newSessionId?: string
    oldSessionId?: string
    serverCleared?: boolean
    error?: string
  }>

  // Archive a Dreaming Agent insight into the Memory file (dreamInsights[]).
  threadAppendDreamInsight: (threadPath: string, projectName: string, threadName: string, trigger: string, insight: string) => Promise<{ ok: boolean; error?: string }>

  // Read the full Memory file (summaries + dreamInsights + counts) for the
  // Memory inspection panel. Returns memoryFile=null when none exists yet,
  // but always returns the resolved absolute filePath the file would live
  // at so the renderer can cite it in the system prompt.
  threadReadMemoryFile: (threadPath: string, projectName: string, threadName: string) => Promise<{
    ok: boolean
    memoryFile: {
      threadName: string
      projectName: string
      honchoSessionId: string
      lastCompressed: string | null
      compressionCount: number
      summaries: Array<{ timestamp: string; trigger: string; honchoSessionId: string; summary: string }>
      dreamInsights: Array<{ queriedAt: string; trigger: string; insight: string }>
      keyFacts: unknown[]
      synthesisReady?: boolean
    } | null
    filePath: string
    error?: string
  }>

  // Walk every project/thread under projectsRoot and rotate each Honcho
  // session. Best-effort server-side DELETE; thread.json is always rotated
  // locally. Honest copy: local Memory files are NOT touched.
  honchoClearAllSessions: () => Promise<{
    ok: boolean
    totalThreads: number
    cleared: number
    errors: string[]
  }>

  // Hive aggregator stats — architecture-v4 Part 5.
  hiveHonchoStats: () => Promise<{
    ok: boolean
    data?: {
      activeSessionsCount: number
      totalThreadCount: number
      synthesisReadyCount: number
      conclusionsCount: number | null
      dreams: Array<{
        id: string
        threadPath: string
        threadName: string
        projectName: string
        queriedAt: string
        trigger: string
        insight: string
      }>
    }
    error?: string
  }>
  hiveValidationStats: () => Promise<{
    ok: boolean
    data?: {
      lastSweepAt: string | null
      orphanTagCount: number | null
      zombieWikiDocCount: number | null
      deadLinkCount: number | null
      recentSweeps: Array<{ at: string; kind: string; payload: string | null }>
    }
    error?: string
  }>
  hiveRunValidationSweep: () => Promise<{
    ok: boolean
    summary?: {
      startedAt: string
      finishedAt: string
      deadLinksFound: number
      deadLinksPurged: number
      orphanTagsFound: number
      orphanWikiPagesFound: number
      orphanTagsSwept: number
      orphanWikiPagesSwept: number
      health: unknown
    }
    error?: string
  }>
  hiveListSyntheses: (limit?: number) => Promise<{
    ok: boolean
    drafts: Array<{
      id: string
      title: string
      synthesisType: string | null
      diskPath: string | null
      createdAt: string
      gapId: string | null
      dreamId: string | null
    }>
    error?: string
  }>
  hiveFoundryStats: () => Promise<{
    ok: boolean
    data?: {
      pendingCount: number
      admittedCount: number
      rejectedCount: number
      totalCount: number
      lastCapturedAt: string | null
    }
    error?: string
  }>

  // Hermes (architecture-v4 §4.5 §10 — Session 5)
  hermesStatus: () => Promise<{
    ok: boolean
    data?: {
      running: boolean
      configured: boolean
      lastMessageAt: string | null
      lastError: string | null
      icloudWatching: string | null
    }
    error?: string
  }>
  hermesStart: () => Promise<{
    ok: boolean
    telegram?: { ok: boolean; error?: string }
    icloud?: { ok: boolean; error?: string; path?: string }
    data?: {
      running: boolean
      configured: boolean
      lastMessageAt: string | null
      lastError: string | null
      icloudWatching: string | null
    }
    error?: string
  }>
  hermesStop: () => Promise<{
    ok: boolean
    data?: {
      running: boolean
      configured: boolean
      lastMessageAt: string | null
      lastError: string | null
      icloudWatching: string | null
    }
    error?: string
  }>
  synthesisGenerateGapBridge: (args: {
    gapId: string
    clusterA: { id: number; name: string; topTags: string[] }
    clusterB: { id: number; name: string; topTags: string[] }
    topDocs: Array<{ title: string; sourcePath: string }>
    domaineId?: string | null
    synthesisType?: 'gap-bridge' | 'honcho-dream'
  }) => Promise<{ ok: boolean; filePath?: string; synthesisId?: string; error?: string }>

  // Foundry (architecture-v4 Part 6) — capture surfaces + Review-queue list.
  foundryCaptureUrl: (url: string, triageMode?: 'extract' | 'convert') => Promise<{ ok: boolean; id?: string; error?: string }>
  foundryCaptureText: (content: string, title: string, triageMode?: 'extract' | 'convert') => Promise<{ ok: boolean; id?: string; error?: string }>
  foundryCaptureFile: (content: string, filename: string, triageMode?: 'extract' | 'convert') => Promise<{ ok: boolean; id?: string; error?: string }>
  /** PDF/DOCX capture — renderer reads via FileReader.readAsArrayBuffer
   *  and ships the bytes to the main process, which decodes via pdf-parse
   *  / mammoth then re-uses the text `captureFile` path. */
  foundryCaptureFileBinary: (bytes: ArrayBuffer, filename: string, triageMode?: 'extract' | 'convert') => Promise<{ ok: boolean; id?: string; error?: string }>
  foundryList: (args?: {
    statuses?: Array<'pending' | 'triaged' | 'approved' | 'rejected'>
    limit?: number
  }) => Promise<{
    ok: boolean
    items: Array<{
      id: string
      createdAt: string
      updatedAt: string
      sourceType: 'url' | 'paste' | 'file' | 'telegram' | 'icloud'
      sourceUrl: string | null
      sourceFilename: string | null
      rawContent: string
      cleanedContent: string | null
      triageMode: 'extract' | 'convert'
      triageStatus: 'pending' | 'triaged' | 'approved' | 'rejected'
      proposedTags: string[] | null
      proposedDomain: string | null
      qualityScore: number | null
      signalAssessment: string | null
      proposedConnections: string[] | null
      triageCompletedAt: string | null
      reviewedAt: string | null
      reviewerNotes: string | null
      admittedAt: string | null
      admittedDocId: string | null
      targetThread: string | null
    }>
    error?: string
  }>
  foundryListTargetThreads: () => Promise<{
    ok: boolean
    threads: Array<{
      projectName: string
      threadName: string
      threadPath: string
      lastModified: number
    }>
    error?: string
  }>
  foundryApprove: (args: {
    id: string
    content: string
    filename: string
    targetThreadPath?: string | null
    reviewerNotes?: string | null
  }) => Promise<{ ok: boolean; filePath?: string; error?: string }>
  foundryReject: (args: { id: string; notes?: string | null }) => Promise<{ ok: boolean; error?: string }>
  foundryDeleteRejected: (id: string) => Promise<{ ok: boolean; error?: string }>
  foundryDeleteAllRejected: () => Promise<{ ok: boolean; deleted: number; error?: string }>
  foundryDeleteAllAdmitted: () => Promise<{ ok: boolean; deleted: number; error?: string }>
  foundryRestore: (id: string) => Promise<{ ok: boolean; error?: string }>

  // RAG ingestion (manual / re-ingest)
  ragIngestManual: (filePath: string) => Promise<{
    ok: boolean
    ingested: boolean
    documentId?: string
    tagCount?: number
    relationshipCount?: number
    error?: string
  }>

  // RAG search (Codex → Search). Scoped to a Domaine by default; bridge
  // namespaces are always included regardless of Domaine. Toggle
  // crossDomaine=true to search every Domaine explicitly.
  ragSearch: (args: {
    query: string
    domaineId: string | null
    crossDomaine: boolean
    sourceRoot?: 'projects' | 'library' | 'inbox' | null
    sourceType?: string | null
    limit?: number
  }) => Promise<{
    ok: boolean
    results: Array<{
      id: string
      title: string
      source_path: string
      source_type: string
      source_root: string
      project_name: string | null
      rank: number
      snippet: string
      tags: string[]
    }>
    error?: string
  }>

  // Dashboard
  hudStatus: () => Promise<{
    ok: boolean
    data?: {
      postgres: boolean
      honcho: boolean
      redis: boolean
      geminiKey: boolean
      anthropicKey: boolean
      spendToday: number
      dailyBudget: number
      hardStop: boolean
    }
    error?: string
  }>
  hudStats: () => Promise<{
    ok: boolean
    data?: {
      documents: number
      tags: number
      relationships: number
      wikiPages: number
      syntheses: number
      notesThisWeek: number
    }
    error?: string
  }>
  hudRecentActivity: (limit?: number) => Promise<{
    ok: boolean
    data?: Array<{
      id: string
      operation: string
      target_type: string | null
      source_path: string | null
      source_type: string | null
      tag_count: number | null
      skipped: boolean | null
      cost_usd: number | null
      provider: string | null
      model: string | null
      duration_ms: number | null
      created_at: string
    }>
    error?: string
  }>

  // Ingest (Codex → Ingest sub-tab) — inspection + manual control on top
  // of the auto-ingestion pipeline.
  ingestListDocuments: (args?: {
    domaineId?: string | null
    crossDomaine?: boolean
    sourceType?: string | null
    tier?: 'thread' | 'project' | 'domaine' | null
    search?: string | null
    limit?: number
    offset?: number
  }) => Promise<{
    ok: boolean
    data?: Array<{
      id: string
      source_path: string
      source_root: string
      source_type: string
      project_name: string | null
      title: string
      word_count: number
      ingested_at: string
      last_modified: string
      is_active: boolean
      tag_count: number
      relationship_count: number
      domaine_id: string | null
      last_error: string | null
    }>
    total?: number
    error?: string
  }>
  ingestListActivity: (limit?: number) => Promise<{
    ok: boolean
    data?: Array<{
      id: string
      operation: string
      source_path: string | null
      source_type: string | null
      tag_count: number | null
      skipped: boolean | null
      error: string | null
      duration_ms: number | null
      cost_usd: number | null
      provider: string | null
      model: string | null
      created_at: string
    }>
    error?: string
  }>
  ingestCounts: () => Promise<{
    ok: boolean
    data?: {
      documents: number
      tags: number
      relationships: number
      lastIngestAt: string | null
    }
    error?: string
  }>
  ingestPickAndIngest: (defaultPath?: string) => Promise<{
    ok: boolean
    ingested: number
    skipped: number
    errors: Array<{ filePath: string; error: string }>
  }>

  /** Walks projectsRoot recursively for every .md file (skipping dotfiles
   *  + dot-folders) and runs ingestManual on each. Returns total scanned
   *  alongside ingested/skipped/errors so the UI can report the full
   *  picture (some scanned files may not match a recognized source root). */
  ingestSyncWorkspace: () => Promise<{
    ok: boolean
    scanned: number
    ingested: number
    skipped: number
    errors: Array<{ filePath: string; error: string }>
  }>

  // Cleanup (Ingest sub-tab maintenance tools).
  ingestDeleteDocument: (sourcePath: string) => Promise<{
    ok: boolean
    deletedDocId: string | null
    sweptTags: number
    sweptWikiPages: number
    error?: string
  }>
  ingestScanDeadLinks: () => Promise<{
    ok: boolean
    deadLinks: Array<{ id: string; source_path: string; title: string }>
    error?: string
  }>
  ingestPurgeDeadLinks: (ids?: string[]) => Promise<{
    ok: boolean
    deleted: number
    sweptTags: number
    sweptWikiPages: number
    error?: string
  }>
  ingestScanOrphans: () => Promise<{
    ok: boolean
    orphanTags: number
    sourcelessWikiPages: number
    error?: string
  }>
  ingestSweepOrphans: () => Promise<{
    ok: boolean
    sweptTags: number
    sweptWikiPages: number
    error?: string
  }>
  ingestHealthScan: () => Promise<{
    ok: boolean
    orphanTags: number
    deadLinks: number
    sourcelessWikiPages: number
    error?: string
  }>

  // Graph (Codex → Graph sub-tab) — relationship graph view. Same Domaine-
  // scope semantics as Ingest/Search; bridge namespaces always included.
  graphFetch: (args?: { domaineId?: string | null; domaineIds?: string[] | null; crossDomaine?: boolean }) => Promise<{
    ok: boolean
    data?: {
      nodes: Array<{
        id:           string
        title:        string
        source_path:  string
        source_root:  string
        source_type:  string
        project_name: string | null
        domaine_id:   string | null
        domaine_name: string | null
        namespace:    string | null
        tier:         string | null
        degree:       number
      }>
      edges: Array<{
        id:           string
        source:       string
        target:       string
        relationship: string
        strength:     number
      }>
    }
    error?: string
  }>

  // Graph analytics (Codex → Syntheses + the Constellation graph theme).
  // Louvain communities + betweenness centrality + structural gaps +
  // topical diversity, computed over the same scope as graphFetch. See
  // src/main/graphAnalytics.ts for the algorithms.
  graphAnalytics: (args?: {
    domaineId?:      string | null
    domaineIds?:     string[] | null
    crossDomaine?:   boolean
    topInfluential?: number
    topGaps?:        number
  }) => Promise<{
    ok: boolean
    data?: {
      communities: Array<{
        id:           number
        name:         string
        memberIds:    string[]
        memberCount:  number
        domaineIds:   string[]
        domaineNames: string[]
        topTags:      Array<{ tag: string; share: number }>
      }>
      topByBetweenness: Array<{
        docId:       string
        title:       string
        betweenness: number
        domaineId:   string | null
        domaineName: string | null
        sourceType:  string
      }>
      structuralGaps: Array<{
        id:            string
        communityA:    { id: number; name: string; memberCount: number }
        communityB:    { id: number; name: string; memberCount: number }
        gapSize:       number
        interEdgeCount: number
      }>
      topicalDiversity: {
        modularity:     number
        communityCount: number
        largestShare:   number
        score:          number
        band:           'focused' | 'balanced' | 'scattered'
        recommendation: string
      } | null
      metrics: {
        nodeCount:  number
        edgeCount:  number
        computedAt: string
        degenerate: boolean
      }
    }
    error?: string
  }>

  // Wiki (Codex → Wiki sub-tab). Optional Domaine filter args mirror
  // ragSearch — pass null/omit for legacy "all pages" behavior. `tier`
  // filter was added with migration 007 to scope by Thread/Project/Domaine.
  wikiList: (args?: {
    domaineId?: string | null
    crossDomaine?: boolean
    tier?: 'thread' | 'project' | 'domaine'
  }) => Promise<{
    ok: boolean
    data?: Array<{
      slug: string
      title: string
      source_count: number
      created_at: string
      updated_at: string
      content_head: string
      domaine_id: string | null
      domaine_overflow_count: number
      tier: 'thread' | 'project' | 'domaine' | null
      namespace: string | null
    }>
    error?: string
  }>
  wikiGet: (slug: string) => Promise<{
    ok: boolean
    data?: { id: string; slug: string; title: string; content: string; source_count: number; updated_at: string } | null
    error?: string
  }>
  wikiGetSources: (slug: string) => Promise<{
    ok: boolean
    data?: Array<{
      id: string
      title: string
      source_path: string
      source_type: string
      source_root: string
      project_name: string | null
    }>
    error?: string
  }>
  wikiRegenerate: (slug: string) => Promise<{
    ok: boolean
    slug: string
    content?: string
    error?: string
  }>
  wikiCompileNow: () => Promise<{
    ok: boolean
    data?: { compiled: string[]; skipped: string[] }
    error?: string
  }>
  wikiImportToThread: (
    slug: string,
    projectName: string,
    threadName: string,
    overwrite?: boolean,
  ) => Promise<{
    ok: boolean
    destPath?: string
    alreadyExists?: boolean
    error?: string
  }>
  wikiUseAsReportDraft: (
    slug: string,
    projectName: string,
    threadName: string,
  ) => Promise<{
    ok: boolean
    destPath?: string
    versionNumber?: number
    error?: string
  }>

  // LM non-streaming
  lmComplete: (
    messages: Array<{ role: string; content: string }>,
    opts: {
      baseUrl: string; model: string; apiKey: string
      temperature?: number; maxTokens?: number
      provider?: 'gemini' | 'anthropic' | 'lmstudio'
      task?: string
    }
  ) => Promise<{ content: string; error: string | null }>

  // Export
  exportPdf: (content: string, fileName: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string }>
  exportDocx: (content: string, fileName: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string }>
  exportHtml: (content: string, fileName: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string }>
  exportText: (content: string, fileName: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string }>

  // Workspace
  workspaceBrowse: () => Promise<string | null>
  workspaceSetPath: (folderPath: string) => Promise<{ ok: boolean }>
  workspaceWriteFile: (relPath: string, content: string) => Promise<{ ok: boolean; filePath: string; error?: string }>
  onWorkspaceFileChange: (callback: (data: { filePath: string; type: 'add' | 'change' }) => void) => () => void

  // LM abort
  abortLMStream: () => void

  // App lifecycle
  onBeforeQuit: (callback: () => void) => () => void
  signalQuitReady: () => void
}

declare global {
  interface Window { electronAPI: ElectronAPI }
}
