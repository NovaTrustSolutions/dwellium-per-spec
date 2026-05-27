import { ipcMain, IpcMainEvent, dialog, clipboard } from 'electron'
import { stat, copyFile, writeFile, readdir } from 'fs/promises'
import { basename, join, dirname, extname } from 'path'
import { convertFileToMarkdown, isConvertible, isImageFile } from './convert'
import { generateReport, createNextVersion } from './report'
import { readComments, writeComments, type Comment } from './comments'
import { initHoncho, createNewSession, addMessage, getMessages, getSessionContext, honchoDream, deleteSession, postConclusion, scheduleDream, type DreamContext, type DreamResult } from './honcho'
import { loadConfig, saveConfig, HolocronConfig } from './config'
import { exportAsPdf, exportAsDocx, exportAsHtml, exportAsText } from './export'
import { startWatcher, writeWorkspaceFile } from './workspace'
import { readDir, listSessions, createSession, createFile, createDir, renameEntry, deleteEntry, moveEntry, copyEntry, completeSession } from './sessionFs'
import { listProjects, createProject, listThreads, createThread, completeThread, bindThreadHoncho, readThreadMeta, branchThread, resetThreadContext, appendMemorySummary, readMemorySummaries, readFullMemoryFile, memoryFilePathFor, appendDreamInsight, appendBrainDumpPrompt, appendNote, addReferencesToThread, updateThreadMeta, type BranchInheritance, getProjectPurgeSummary, renameProject, moveProject, purgeProject, getThreadPurgeSummary, renameThread, moveThread, purgeThread, listAllThreadsFlat, moveDocumentToThread } from './projectFs'
import {
  listDomaines,
  listProjectDomaineMap,
  createDomaine,
  updateDomaine,
  deleteDomaine,
  getRenameSummary,
  type DeleteDomaineOptions,
} from './domaineFs'
import { chat, type Provider, type ChatMessage } from './llmClient'
import { ingestManual } from './ragIngest'
import { searchDocuments, type RagSearchArgs } from './ragSearch'
import { getDashboardStatus, getDashboardStats, getRecentActivity } from './dashboard'
import {
  listIngestedDocuments,
  listIngestActivity,
  getIngestCounts,
  type ListIngestedArgs,
} from './ingestQueries'
import { fetchGraph, type FetchGraphArgs } from './graphQueries'
import { computeGraphAnalytics, type ComputeArgs as GraphAnalyticsArgs } from './graphAnalytics'
import { gatherHiveHonchoStats, gatherValidationStats, listRecentSyntheses, generateGapBridge, gatherFoundryStats, type GenerateGapBridgeArgs } from './hive'
import {
  captureUrl as foundryCaptureUrl,
  captureText as foundryCaptureText,
  captureFile as foundryCaptureFile,
  captureFileBinary as foundryCaptureFileBinary,
  listFoundryItems,
  listTargetThreads,
  approveItem,
  rejectItem,
  deleteRejectedItem,
  deleteAllRejectedItems,
  deleteAllAdmittedItems,
  restoreRejectedItem,
  type FoundryTriageStatus,
  type FoundryTriageMode,
} from './foundry'
import {
  startHermesBot,
  stopHermesBot,
  startIcloudWatcher,
  stopIcloudWatcher,
  getHermesStatus,
} from './hermes'
import { getLibraryRoot } from './config'
import { ragQuery } from './ragDb'
import {
  deleteDocument,
  scanDeadLinks,
  purgeDeadLinks,
  scanOrphans,
  sweepOrphans,
  runHealthScan,
} from './cleanupOps'
import {
  listWikiPages,
  getWikiPage,
  getWikiPageSources,
  regenerateWikiPage,
  compileNow,
  importWikiToThread,
  useWikiAsReportDraft,
} from './ragWiki'
import { nuclearReset } from './maintenance'
import { registerFileIpcHandlers } from './ipc/fileHandlers'
import { registerServiceIpcHandlers } from './ipc/serviceHandlers'

let activeStreamController: AbortController | null = null

/**
 * Heuristic provider detection from the OpenAI-compatible base URL the
 * renderer sends today. Once the renderer threads `provider` through the
 * IPC payload (step 8 hot-swap pill), this fallback becomes redundant.
 */
function inferProvider(baseUrl: string): Provider {
  if (baseUrl.includes('googleapis.com')) return 'gemini'
  if (baseUrl.includes('anthropic.com')) return 'anthropic'
  return 'lmstudio'
}

export function registerIpcHandlers(): void {
  // ── File system ──────────────────────────────────────────────────────────
  registerFileIpcHandlers()

  // ── Config ───────────────────────────────────────────────────────────────
  ipcMain.handle('config:load', () => loadConfig())

  ipcMain.handle('config:save', (_, args: { config: HolocronConfig }) => {
    try {
      saveConfig(args.config)
      return { ok: true }
    } catch (err) {
      console.error('[Config] save failed:', err)
      return { ok: false }
    }
  })

  // ── Connection tests / Docker / Firecrawl ────────────────────────────────
  registerServiceIpcHandlers()

  // ── Honcho memory (v3) ───────────────────────────────────────────────────
  ipcMain.handle('honcho:init', async (_, args?: { sessionId?: string }) => {
    try {
      const cfg = loadConfig()
      const sid = args?.sessionId ?? cfg.activeSessionId ?? undefined
      const ctx = await initHoncho(cfg.honcho.url, sid || undefined)
      return { sessionId: ctx.sessionId }
    } catch (err) {
      console.error('[Honcho] init failed:', err)
      return null
    }
  })

  ipcMain.handle(
    'honcho:save-message',
    async (_, args: { sessionId: string; peerId: string; content: string }) => {
      try {
        const cfg = loadConfig()
        await addMessage(cfg.honcho.url, args.sessionId, args.peerId, args.content)
        return { ok: true }
      } catch (err) {
        console.error('[Honcho] save-message failed:', err)
        return { ok: false }
      }
    }
  )

  ipcMain.handle('honcho:get-messages', async (_, args: { sessionId: string }) => {
    try {
      const cfg = loadConfig()
      return await getMessages(cfg.honcho.url, args.sessionId)
    } catch (err) {
      console.error('[Honcho] get-messages failed:', err)
      return []
    }
  })

  ipcMain.handle('honcho:get-context', async (_, args: { sessionId: string; tokens?: number }) => {
    try {
      const cfg = loadConfig()
      return await getSessionContext(cfg.honcho.url, args.sessionId, args.tokens)
    } catch (err) {
      console.error('[Honcho] get-context failed:', err)
      return { messages: [], summary: null }
    }
  })

  ipcMain.handle('honcho:new-session', async () => {
    try {
      const cfg = loadConfig()
      const sessionId = await createNewSession(cfg.honcho.url)
      return sessionId
    } catch (err) {
      console.error('[Honcho] new-session failed:', err)
      return null
    }
  })

  // Dreaming Agent — primary trigger now schedule_dream (returns 204, async
  // server-side processing); falls back to dialectic /chat for synchronous
  // insight on deployments without schedule_dream. Result is a discriminated
  // union: 'scheduled' (no immediate content) | 'sync' (insight string).
  ipcMain.handle(
    'honcho:dream',
    async (_, args: { peerId?: string; sessionId: string; context: DreamContext }) => {
      try {
        const cfg = loadConfig()
        const peer = args.peerId ?? 'andy' // matches Honcho v3 init's PEER_USER
        const result: DreamResult = await honchoDream(cfg.honcho.url, peer, args.sessionId, args.context)
        return result
      } catch (err) {
        console.warn('[Honcho] dream IPC failed:', (err as Error).message)
        return { ok: false as const, error: (err as Error).message }
      }
    },
  )

  // Schedule Dream — direct trigger (no /chat fallback). The Hive Honcho card
  // exposes this as an explicit button so Andy can kick the server-side dream
  // processor without expecting an immediate synchronous insight.
  ipcMain.handle(
    'honcho:schedule-dream',
    async (_, args?: { dreamType?: 'omni' | 'theme' }) => {
      try {
        const cfg = loadConfig()
        const result = await scheduleDream(cfg.honcho.url, args?.dreamType ?? 'omni')
        return result
      } catch (err) {
        return { ok: false, status: 0, error: (err as Error).message }
      }
    },
  )

  // Post a Conclusion — CoPaw's write target. Body shape per Honcho v3:
  // POST /v3/workspaces/holocron/conclusions, observer/observed = 'andy'.
  // Fire-and-forget from the renderer (CoPaw doesn't await), but the handler
  // still returns ok/error for callers that want to log.
  ipcMain.handle(
    'honcho:post-conclusion',
    async (_, args: { content: string; sessionId?: string }) => {
      try {
        const cfg = loadConfig()
        const result = await postConclusion(cfg.honcho.url, {
          content: args.content,
          session_id: args.sessionId,
        })
        return result
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  // DELETE a Honcho session server-side. Falls back gracefully (supported=false)
  // when the deployment doesn't expose the endpoint — caller can still rotate
  // to a fresh session to abandon the old one.
  ipcMain.handle('honcho:delete-session', async (_, args: { sessionId: string }) => {
    try {
      const cfg = loadConfig()
      const result = await deleteSession(cfg.honcho.url, args.sessionId)
      return result
    } catch (err) {
      return { ok: false, supported: true, error: (err as Error).message }
    }
  })

  // Thread-scoped "Clear Honcho session" — best-effort DELETE on server,
  // always rotates the local thread.json to a fresh session id so the chat
  // unbinds from the old one even when DELETE isn't supported. Returns the
  // new session id so the renderer can rebind without a full thread reload.
  ipcMain.handle(
    'thread:clear-honcho-session',
    async (_, args: { threadPath: string; threadName: string; projectName: string }) => {
      try {
        const cfg = loadConfig()
        const baseUrl = cfg.honcho.url
        const meta = await readThreadMeta(args.threadPath)
        const oldSessionId = meta?.honchoSessionId ?? ''

        // Step 1 — try server-side delete (degrades silently if unsupported).
        let serverCleared = false
        if (oldSessionId) {
          const del = await deleteSession(baseUrl, oldSessionId).catch(() => ({ ok: false, supported: false } as const))
          serverCleared = del.ok
        }

        // Step 2 — rotate to a fresh session. Use an `-rN` suffix mirroring
        // resetThreadContext so the old session id is structurally distinct.
        const counter = (meta?.compressionCount ?? 0) + 1
        const candidate = `${args.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${args.threadName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-c${counter}`
        const init = await initHoncho(baseUrl, candidate)
        const newSessionId = init.sessionId

        // Step 3 — write the new id back to thread.json + bump compressionCount
        // so subsequent rotations don't collide.
        await updateThreadMeta(args.threadPath, {
          honchoSessionId: newSessionId,
          compressionCount: counter,
          lastModified: new Date().toISOString(),
        }).catch(() => null)

        console.log(`[Thread] Cleared Honcho session: ${oldSessionId} → ${newSessionId} (server cleared: ${serverCleared})`)
        return { ok: true, newSessionId, oldSessionId, serverCleared }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  // Append a Dreaming Agent insight to the Memory file's dreamInsights[].
  // Kept thin: the renderer (or the branch flow) calls honcho:dream first
  // and then archives the result via this handler.
  ipcMain.handle(
    'thread:append-dream-insight',
    async (_, args: { threadPath: string; projectName: string; threadName: string; trigger: string; insight: string }) => {
      try {
        await appendDreamInsight(args.threadPath, args.projectName, args.threadName, {
          queriedAt: new Date().toISOString(),
          trigger: args.trigger,
          insight: args.insight,
        })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  // Read the full memory file (summaries + dreamInsights + counts) for the
  // Memory inspection panel. Returns the resolved absolute path even when
  // no file exists yet — the renderer surfaces the path in the system
  // prompt so the agent can cite it on demand.
  ipcMain.handle(
    'thread:read-memory-file',
    async (_, args: { threadPath: string; projectName: string; threadName: string }) => {
      try {
        const doc = await readFullMemoryFile(args.threadPath, args.projectName, args.threadName)
        const filePath = memoryFilePathFor(args.threadPath, args.projectName, args.threadName)
        return { ok: true, memoryFile: doc, filePath }
      } catch (err) {
        return { ok: false, memoryFile: null, filePath: '', error: (err as Error).message }
      }
    },
  )

  // Clear ALL Honcho sessions for every thread under projectsRoot. Walks the
  // workspace (Domaine → Project → Thread), best-effort DELETE on each
  // server-side session, ALWAYS rotates thread.json to a fresh session id so
  // every thread unbinds from its old session locally. Honest: this does NOT
  // touch local Memory files (per panel copy). Returns a summary so the UI
  // can show "cleared N of M threads".
  ipcMain.handle('honcho:clear-all-sessions', async () => {
    try {
      const cfg = loadConfig()
      const baseUrl = cfg.honcho.url
      const root = cfg.projectsRoot
      if (!root) return { ok: false, totalThreads: 0, cleared: 0, errors: ['projectsRoot not set'] }

      const projects = await listProjects(root)
      let totalThreads = 0
      let cleared = 0
      const errors: string[] = []

      for (const p of projects) {
        const threads = await listThreads(p.path)
        for (const t of threads) {
          totalThreads++
          try {
            const meta = await readThreadMeta(t.path)
            const oldSessionId = meta?.honchoSessionId ?? ''
            if (oldSessionId) {
              await deleteSession(baseUrl, oldSessionId).catch(() => { /* unsupported deployments — fine */ })
            }
            // Rotate locally regardless of server outcome.
            const counter = (meta?.compressionCount ?? 0) + 1
            const candidate = `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-c${counter}`
            const init = await initHoncho(baseUrl, candidate)
            await updateThreadMeta(t.path, {
              honchoSessionId: init.sessionId,
              compressionCount: counter,
              lastModified: new Date().toISOString(),
            }).catch(() => null)
            cleared++
          } catch (err) {
            errors.push(`${p.name}/${t.name}: ${(err as Error).message}`)
          }
        }
      }
      console.log(`[Honcho] clear-all-sessions: cleared ${cleared}/${totalThreads} threads, ${errors.length} errors`)
      return { ok: true, totalThreads, cleared, errors }
    } catch (err) {
      return { ok: false, totalThreads: 0, cleared: 0, errors: [(err as Error).message] }
    }
  })

  // ── Editor insert ─────────────────────────────────────────────────────────
  ipcMain.on('scribe:insert-at-cursor', (event: IpcMainEvent, args: { content: string }) => {
    if (!event.sender.isDestroyed()) event.sender.send('scribe:insert', args.content)
  })

  // ── Export ───────────────────────────────────────────────────────────────
  ipcMain.handle('export:pdf', (_, args: { content: string; fileName: string }) =>
    exportAsPdf(args.content, args.fileName)
  )
  ipcMain.handle('export:docx', (_, args: { content: string; fileName: string }) =>
    exportAsDocx(args.content, args.fileName)
  )
  ipcMain.handle('export:html', (_, args: { content: string; fileName: string }) =>
    exportAsHtml(args.content, args.fileName)
  )
  ipcMain.handle('export:text', (_, args: { content: string; fileName: string }) =>
    exportAsText(args.content, args.fileName)
  )

  // ── Workspace ────────────────────────────────────────────────────────────
  ipcMain.handle('workspace:browse', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('workspace:set-path', (_, args: { folderPath: string }) => {
    const cfg = loadConfig()
    cfg.workspace = { path: args.folderPath }
    saveConfig(cfg)
    startWatcher(args.folderPath)
    return { ok: true }
  })

  ipcMain.handle('workspace:write-file', (_, args: { relPath: string; content: string }) => {
    const cfg = loadConfig()
    const baseDir = (cfg.holocronRoot && cfg.activeSessionId)
      ? require('path').join(cfg.holocronRoot, cfg.activeSessionId)
      : cfg.workspace?.path
    if (!baseDir) return { ok: false, filePath: '', error: 'No workspace set' }
    try {
      const filePath = writeWorkspaceFile(baseDir, args.relPath, args.content)
      return { ok: true, filePath }
    } catch (err) {
      console.error('[Workspace] write-file failed:', err)
      return { ok: false, filePath: '', error: (err as Error).message }
    }
  })

  // ── File system (session explorer) ──────────────────────────────────────
  ipcMain.handle('fs:readdir', async (_, args: { path: string }) => {
    return readDir(args.path)
  })

  ipcMain.handle('files:import', async (_, args: { destDir: string }) => {
    if (!args.destDir) return { ok: false, imported: [], skipped: [], canceled: false, error: 'No destination folder' }
    const picked = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'All Files', extensions: ['*'] }],
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: true, imported: [], skipped: [], canceled: true }
    }

    const imported: string[] = []
    const skipped: string[] = []

    for (const src of picked.filePaths) {
      const name = basename(src)
      const dest = join(args.destDir, name)

      let exists = false
      try { await stat(dest); exists = true } catch { /* not present */ }

      if (exists) {
        const choice = await dialog.showMessageBox({
          type: 'question',
          buttons: ['Replace', 'Skip', 'Cancel'],
          defaultId: 0,
          cancelId: 2,
          message: `A file named "${name}" already exists. Replace it?`,
          detail: `In: ${args.destDir}`,
        })
        if (choice.response === 2) {
          // Cancel — abort the entire import.
          // Arrow wrapper — `basename`'s overload takes (path, suffix?:string)
          // and `.map`'s callback passes (value, index:number); passing
          // basename directly leaks the numeric index into the suffix slot.
          return { ok: true, imported, skipped: [...skipped, ...picked.filePaths.slice(picked.filePaths.indexOf(src)).map((p) => basename(p))], canceled: true }
        }
        if (choice.response === 1) {
          skipped.push(name)
          continue
        }
        // 0 = Replace — fall through to copy
      }

      try {
        await copyFile(src, dest)
        imported.push(name)
        console.log(`[Files] Imported: ${name} → ${args.destDir}`)
      } catch (err) {
        skipped.push(name)
        console.error(`[Files] Import failed for ${name}:`, (err as Error).message)
      }
    }

    return { ok: true, imported, skipped, canceled: false }
  })

  // ── Document conversion (P3-B) ──────────────────────────────────────────
  ipcMain.handle('convert:check', (_, args: { filePath: string }) => {
    return { convertible: isConvertible(args.filePath), isImage: isImageFile(args.filePath) }
  })

  ipcMain.handle('convert:to-markdown', async (_, args: { filePath: string }) => {
    if (!args.filePath) return { ok: false, filePath: '', outputPath: '', error: 'no filePath' }
    if (!isConvertible(args.filePath)) {
      return { ok: false, filePath: args.filePath, outputPath: '', error: `Unsupported extension: ${extname(args.filePath)}` }
    }
    try {
      const { markdown, isOcrPlaceholder } = await convertFileToMarkdown(args.filePath)
      const outputPath = join(dirname(args.filePath), basename(args.filePath, extname(args.filePath)) + '.md')
      await writeFile(outputPath, markdown, 'utf-8')
      console.log(`[Convert] ${basename(args.filePath)} → ${basename(outputPath)}${isOcrPlaceholder ? ' (OCR placeholder)' : ''}`)
      return { ok: true, filePath: args.filePath, outputPath, isOcrPlaceholder }
    } catch (err) {
      console.error(`[Convert] failed for ${args.filePath}:`, (err as Error).message)
      return { ok: false, filePath: args.filePath, outputPath: '', error: (err as Error).message }
    }
  })

  ipcMain.handle('convert:to-markdown-batch', async (_, args: { filePaths: string[] }) => {
    const results: Array<{ ok: boolean; filePath: string; outputPath: string; isOcrPlaceholder?: boolean; error?: string }> = []
    for (const filePath of args.filePaths) {
      if (!isConvertible(filePath)) {
        results.push({ ok: false, filePath, outputPath: '', error: `Unsupported extension: ${extname(filePath)}` })
        continue
      }
      try {
        const { markdown, isOcrPlaceholder } = await convertFileToMarkdown(filePath)
        const outputPath = join(dirname(filePath), basename(filePath, extname(filePath)) + '.md')
        await writeFile(outputPath, markdown, 'utf-8')
        console.log(`[Convert] ${basename(filePath)} → ${basename(outputPath)}${isOcrPlaceholder ? ' (OCR placeholder)' : ''}`)
        results.push({ ok: true, filePath, outputPath, isOcrPlaceholder })
      } catch (err) {
        console.error(`[Convert] failed for ${filePath}:`, (err as Error).message)
        results.push({ ok: false, filePath, outputPath: '', error: (err as Error).message })
      }
    }
    return { results }
  })

  ipcMain.handle('fs:exists', async (_, args: { path: string }) => {
    if (!args.path) return { exists: false, isDirectory: false }
    try {
      const s = await stat(args.path)
      return { exists: true, isDirectory: s.isDirectory() }
    } catch {
      return { exists: false, isDirectory: false }
    }
  })

  ipcMain.handle('fs:create-file', async (_, args: { dirPath: string; name: string }) => {
    try { return await createFile(args.dirPath, args.name) }
    catch (err) { return { ok: false, filePath: '', error: (err as Error).message } }
  })

  // Paste clipboard image into a directory as a PNG. Triggered when the user
  // hits Cmd+V (or right-clicks → Paste) inside the sidebar with an image on
  // the system clipboard (e.g. macOS Cmd+Shift+4 screenshot). Uses Electron's
  // own clipboard module so the renderer doesn't need clipboard read perms.
  ipcMain.handle('fs:paste-clipboard-image', async (_, args: { dirPath: string }) => {
    try {
      const img = clipboard.readImage()
      if (img.isEmpty()) return { ok: false, error: 'No image on clipboard' }
      const png = img.toPNG()
      // Filename: "Screenshot YYYY-MM-DD HH-MM-SS.png" — sortable + recognisable.
      const d = new Date()
      const pad = (n: number): string => String(n).padStart(2, '0')
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
      let name = `Screenshot ${stamp}.png`
      let filePath = join(args.dirPath, name)
      // Disambiguate if a file already exists at this exact second.
      let n = 1
      while (await stat(filePath).then(() => true).catch(() => false)) {
        name = `Screenshot ${stamp} (${n}).png`
        filePath = join(args.dirPath, name)
        n++
      }
      await writeFile(filePath, png)
      console.log(`[Clipboard] Pasted image: ${filePath}`)
      return { ok: true, filePath, name }
    } catch (err) {
      console.error('[Clipboard] paste-image failed:', err)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:create-dir', async (_, args: { parentPath: string; name: string }) => {
    try { return await createDir(args.parentPath, args.name) }
    catch (err) { return { ok: false, dirPath: '', error: (err as Error).message } }
  })

  ipcMain.handle('fs:rename', async (_, args: { oldPath: string; newPath: string }) => {
    try { return await renameEntry(args.oldPath, args.newPath) }
    catch (err) { return { ok: false, error: (err as Error).message } }
  })

  ipcMain.handle('fs:delete', async (_, args: { path: string }) => {
    try { return await deleteEntry(args.path) }
    catch (err) { return { ok: false, error: (err as Error).message } }
  })

  ipcMain.handle('fs:move', async (_, args: { srcPath: string; destDir: string }) => {
    try { return await moveEntry(args.srcPath, args.destDir) }
    catch (err) { return { ok: false, newPath: '', error: (err as Error).message } }
  })

  ipcMain.handle('fs:copy', async (_, args: { srcPath: string; destDir: string }) => {
    try { return await copyEntry(args.srcPath, args.destDir) }
    catch (err) { return { ok: false, newPath: '', error: (err as Error).message } }
  })

  // ── Sessions ─────────────────────────────────────────────────────────────
  ipcMain.handle('session:list', async (_, args: { holocronRoot: string }) => {
    try { return await listSessions(args.holocronRoot) }
    catch (err) { console.error('[Session] list failed:', err); return [] }
  })

  ipcMain.handle('session:create', async (_, args: { holocronRoot: string; name: string; setAsGlobalRoot?: boolean }) => {
    try {
      const result = await createSession(args.holocronRoot, args.name)
      const cfg = loadConfig()
      cfg.activeSessionId = result.id
      cfg.activeSessionName = args.name
      if (args.setAsGlobalRoot !== false) cfg.holocronRoot = args.holocronRoot
      saveConfig(cfg)
      startWatcher(args.holocronRoot)
      return result
    } catch (err) {
      return { ok: false, path: '', id: '', error: (err as Error).message }
    }
  })

  ipcMain.handle('session:complete', async (_, args: { sessionPath: string }) => {
    try { await completeSession(args.sessionPath); return { ok: true } }
    catch (err) { return { ok: false, error: (err as Error).message } }
  })

  ipcMain.handle('session:set-active', (_, args: { id: string; name: string; holocronRoot: string }) => {
    const cfg = loadConfig()
    cfg.activeSessionId = args.id
    cfg.activeSessionName = args.name
    cfg.holocronRoot = args.holocronRoot
    saveConfig(cfg)
    return { ok: true }
  })

  // ── Domaines (organizational layer above Projects) ──────────────────────
  // (v11 reset removed ensureGeneralDomaine — General no longer exists.)
  // (migration 007 cleared all wiki pages — bootstrapMissingPages handles
  // the cold-start recompile under the new namespace-anchored model, so
  // the old backfillWikiDomaines call lives on only in git history.)

  ipcMain.handle('domaines:list', async () => {
    try {
      const cfg = loadConfig()
      return { ok: true, data: await listDomaines(cfg.projectsRoot) }
    } catch (err) {
      console.error('[domaines:list] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('domaines:project-map', async () => {
    try {
      return { ok: true, data: await listProjectDomaineMap() }
    } catch (err) {
      console.error('[domaines:project-map] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('domaines:create', async (_, args: { name: string; description?: string; color?: string }) => {
    try {
      const cfg = loadConfig()
      console.log('[domaines:create] IPC entry', { name: args.name, projectsRoot: cfg.projectsRoot })
      const result = await createDomaine(args, cfg.projectsRoot)
      console.log('[domaines:create] IPC exit', { ok: result.ok, id: result.id, error: result.error })
      return result
    } catch (err) {
      console.error('[domaines:create] threw:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('domaines:update', async (_, args: {
    id: string; name?: string; description?: string | null; color?: string | null; position?: number
  }) => {
    try {
      const cfg = loadConfig()
      return await updateDomaine(args, cfg.projectsRoot)
    } catch (err) {
      console.error('[domaines:update] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('domaines:rename-summary', async (_, args: { id: string }) => {
    try {
      const cfg = loadConfig()
      return await getRenameSummary(args.id, cfg.projectsRoot)
    } catch (err) {
      console.error('[domaines:rename-summary] failed:', (err as Error).message)
      return { documentCount: 0, projectCount: 0 }
    }
  })

  // New delete signature: discriminated union — either reassign every
  // project to a target Domaine, or purge everything (typed confirmation).
  // No fallback exists.
  ipcMain.handle('domaines:delete', async (_, args: { id: string; options: DeleteDomaineOptions }) => {
    try {
      const cfg = loadConfig()
      return await deleteDomaine(args.id, args.options, cfg.projectsRoot)
    } catch (err) {
      console.error('[domaines:delete] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  // ── Projects / Threads ───────────────────────────────────────────────────
  ipcMain.handle('projects:list', async (_, args: { projectsRoot: string; domaineId?: string }) => {
    const list = await listProjects(args.projectsRoot, args.domaineId)
    const scope = args.domaineId ? ` (domaine=${args.domaineId.slice(0, 8)}…)` : ''
    console.log(`[Projects] Loaded ${list.length} projects from ${args.projectsRoot || '(empty)'}${scope}`)
    return list
  })

  ipcMain.handle('projects:create', async (_, args: { projectsRoot: string; name: string; domaineId: string }) => {
    if (!args.domaineId) return { ok: false, path: '', error: 'Domaine is required' }
    const result = await createProject(args.projectsRoot, args.name, args.domaineId)
    if (result.ok) console.log(`[Projects] Created project: ${result.path}`)
    else console.error(`[Projects] createProject failed: ${result.error}`)
    return result
  })

  ipcMain.handle('projects:rename', async (_, args: { projectPath: string; newName: string }) => {
    const result = await renameProject(args.projectPath, args.newName)
    if (result.ok) console.log(`[Projects] Renamed: ${args.projectPath} → ${args.newName}`)
    else          console.error(`[Projects] renameProject failed: ${result.error}`)
    return result
  })

  ipcMain.handle('projects:move', async (_, args: { projectName: string; targetDomaineId: string }) => {
    const result = await moveProject(args.projectName, args.targetDomaineId)
    if (result.ok) console.log(`[Projects] Moved ${args.projectName} → Domaine ${args.targetDomaineId}`)
    else          console.error(`[Projects] moveProject failed: ${result.error}`)
    return result
  })

  ipcMain.handle('projects:purge-summary', async (_, args: { projectPath: string }) => {
    return await getProjectPurgeSummary(args.projectPath)
  })

  ipcMain.handle('projects:purge', async (_, args: { projectPath: string; confirmName: string }) => {
    const result = await purgeProject(args.projectPath, args.confirmName)
    if (result.ok) console.log(`[Projects] Purged ${args.projectPath}: ${result.deletedThreads} threads, ${result.deletedDocs} docs`)
    else          console.error(`[Projects] purgeProject failed: ${result.error}`)
    return result
  })

  // ── Maintenance ──────────────────────────────────────────────────────────
  // Nuclear Reset — wipes content tables + Domaines + user namespaces
  // (preserves bridge namespaces, config, API keys, migrations) and removes
  // every project folder under projectsRoot. Reproduces the manual SQL +
  // `rm -rf` dance from the v12 clean-slate session in one click.
  ipcMain.handle('maintenance:nuclear-reset', async () => {
    try {
      const result = await nuclearReset()
      if (result.ok) {
        const s = result.summary
        console.log(
          `[Maintenance] Nuclear reset: ` +
          `${s.documents} docs, ${s.tags} tags, ${s.wikiPages} wiki, ` +
          `${s.syntheses} syntheses, ${s.operations} ops, ` +
          `${s.domaines} domaines, ${s.namespaces} namespaces, ` +
          `${s.foldersRemoved} folders removed`,
        )
      } else {
        console.error('[Maintenance] Nuclear reset failed:', result.error)
      }
      return result
    } catch (err) {
      console.error('[Maintenance] Nuclear reset crashed:', (err as Error).message)
      return { ok: false, summary: null, error: (err as Error).message }
    }
  })

  ipcMain.handle('projects:threads:list', async (_, args: { projectPath: string }) => {
    const cfg = loadConfig()
    const list = await listThreads(args.projectPath, cfg.activeThreadPath)
    console.log(`[Projects] Loaded ${list.length} threads from ${args.projectPath || '(empty)'}`)
    return list
  })

  ipcMain.handle('projects:threads:create', async (_, args: { projectPath: string; name: string }) => {
    const result = await createThread(args.projectPath, args.name)
    if (result.ok) console.log(`[Projects] Created thread: ${result.path}`)
    else console.error(`[Projects] createThread failed: ${result.error}`)
    return result
  })

  ipcMain.handle('thread:rename', async (_, args: { projectPath: string; oldName: string; newName: string }) => {
    const result = await renameThread(args.projectPath, args.oldName, args.newName)
    if (result.ok) console.log(`[Threads] Renamed: ${args.oldName} → ${args.newName} (in ${args.projectPath})`)
    else          console.error(`[Threads] renameThread failed: ${result.error}`)
    return result
  })

  ipcMain.handle('thread:move', async (_, args: { srcProjectPath: string; threadName: string; targetProjectPath: string }) => {
    const result = await moveThread(args.srcProjectPath, args.threadName, args.targetProjectPath)
    if (result.ok) console.log(`[Threads] Moved ${args.threadName}: ${args.srcProjectPath} → ${args.targetProjectPath}`)
    else          console.error(`[Threads] moveThread failed: ${result.error}`)
    return result
  })

  ipcMain.handle('thread:purge-summary', async (_, args: { threadPath: string }) => {
    return await getThreadPurgeSummary(args.threadPath)
  })

  // Session 6 warmup — flat thread list across all Domaines/Projects for the
  // Scribe "Move to thread" picker. `excludeThreadPath` skips the active
  // thread (typically passed by the caller) so the picker never offers a
  // no-op destination.
  ipcMain.handle('doc:list-threads-flat', async (_, args: { excludeThreadPath?: string }) => {
    const cfg = loadConfig()
    const root = cfg.projectsRoot
    if (!root) return { ok: false, error: 'Workspace folder not set', threads: [] }
    try {
      const threads = await listAllThreadsFlat(root, args?.excludeThreadPath ?? '')
      return { ok: true, threads }
    } catch (err) {
      return { ok: false, error: (err as Error).message, threads: [] }
    }
  })

  // Session 6 warmup — move a single document file into the destination
  // thread's References/ folder. Chokidar's root watcher handles SQL state
  // (unlink → soft-delete old row, add → ingest new). See projectFs
  // moveDocumentToThread for why this intentionally bypasses withRenameLock.
  ipcMain.handle('doc:move-to-thread', async (_, args: { srcPath: string; destThreadPath: string }) => {
    const result = await moveDocumentToThread(args.srcPath, args.destThreadPath)
    if (result.ok) console.log(`[Docs] Moved ${args.srcPath} → ${result.newPath}`)
    else           console.error(`[Docs] moveDocumentToThread failed: ${result.error}`)
    return result
  })

  ipcMain.handle('thread:purge', async (_, args: { threadPath: string; confirmName: string }) => {
    const result = await purgeThread(args.threadPath, args.confirmName)
    if (result.ok) console.log(`[Threads] Purged ${args.threadPath}: ${result.deletedDocs} docs`)
    else          console.error(`[Threads] purgeThread failed: ${result.error}`)
    return result
  })

  ipcMain.handle(
    'projects:threads:load',
    (_, args: { projectName: string; projectPath: string; threadName: string; threadPath: string }) => {
      const cfg = loadConfig()
      cfg.activeProjectName = args.projectName
      cfg.activeProjectPath = args.projectPath
      cfg.activeThreadName = args.threadName
      cfg.activeThreadPath = args.threadPath
      saveConfig(cfg)
      console.log(`[Projects] Active thread set: ${args.projectName} / ${args.threadName}`)
      // Do NOT restart the watcher on thread switch — that closes the root
      // watcher and re-targets it to the thread folder, which silently breaks
      // ingestion for every other thread under the same root. The root
      // watcher started by initWorkspaceWatcher covers all thread folders
      // recursively; thread switching is a renderer-state concern.
      return { ok: true }
    },
  )

  ipcMain.handle('thread:complete', async (_, args: { threadPath: string }) => {
    try { await completeThread(args.threadPath); return { ok: true } }
    catch (err) { return { ok: false, error: (err as Error).message } }
  })

  ipcMain.handle('thread:bind-honcho', async (_, args: { threadPath: string; threadName: string; projectName: string }) => {
    try {
      const cfg = loadConfig()
      const baseUrl = cfg.honcho.url
      const result = await bindThreadHoncho(
        args.threadPath,
        args.threadName,
        args.projectName,
        async (candidate) => {
          const init = await initHoncho(baseUrl, candidate)
          return init.sessionId
        },
      )
      console.log(`[Thread] Bound to Honcho session: ${result.honchoSessionId}`)
      return { ok: true, sessionId: result.honchoSessionId }
    } catch (err) {
      console.error('[Thread] bind-honcho failed:', (err as Error).message)
      return { ok: false, sessionId: '', error: (err as Error).message }
    }
  })

  ipcMain.handle('thread:read-meta', async (_, args: { threadPath: string }) => {
    return readThreadMeta(args.threadPath)
  })

  // Reset Context: fold current Honcho-session summary into thread.json, swap
  // to a fresh session so future loads don't replay raw turns. The old
  // session is preserved server-side; the chat just stops carrying its raw
  // history. If Honcho hasn't auto-summarized yet (`getSessionContext` returns
  // summary: null — common on shorter sessions), fall back to a one-shot
  // lmComplete summarization using the active provider so the gist is never
  // lost. Every reset summary is also archived to Memory_<Project>_<Thread>.json
  // so resets are recallable later.
  ipcMain.handle(
    'thread:reset-context',
    async (_, args: {
      threadPath: string; threadName: string; projectName: string
      lm: { baseUrl: string; model: string; apiKey: string; provider?: Provider }
    }) => {
      try {
        const cfg = loadConfig()
        const honchoUrl = cfg.honcho.url
        const meta = await readThreadMeta(args.threadPath)
        const oldSessionId = meta?.honchoSessionId ?? ''

        // Single-call shape: /context returns BOTH the server-side summary
        // AND the recent messages in one token-limited response. We reuse
        // ctx.messages for the LM summarization fallback below — saving a
        // separate getMessages() roundtrip on the happy path. The two-call
        // pattern (Session 2) is preserved as a last-resort safety net for
        // deployments where /context misbehaves but /list works.
        let summary: string | null = null
        let summarySource: 'honcho' | 'fallback' | 'none' = 'none'
        let contextMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

        if (oldSessionId) {
          const ctx = await getSessionContext(honchoUrl, oldSessionId, 4000).catch(() => null)
          if (ctx) {
            contextMessages = ctx.messages
            if (ctx.summary && ctx.summary.trim()) {
              summary = ctx.summary.trim()
              summarySource = 'honcho'
            }
          }
        }

        // Helper — DRY for the LM-summarization fallback. Returns trimmed
        // summary or null on failure.
        const summarizeViaLM = async (messages: Array<{ role: string; content: string }>): Promise<string | null> => {
          if (messages.length === 0) return null
          if (!args.lm.baseUrl || !args.lm.model) return null
          const transcript = messages
            .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
            .join('\n\n')
            .slice(0, 24000) // keep prompt budget bounded
          const prompt: ChatMessage[] = [
            { role: 'system', content: 'Summarize the following conversation in 4-8 sentences. Capture decisions made, key facts established, open questions, and the user\'s active goals. Write in the third person ("the user asked...", "the assistant explained..."). No preamble.' },
            { role: 'user', content: transcript },
          ]
          try {
            const r = await chat({
              provider: args.lm.provider ?? inferProvider(args.lm.baseUrl),
              model: args.lm.model,
              apiKey: args.lm.apiKey,
              baseUrl: args.lm.baseUrl,
              messages: prompt,
              temperature: 0.2,
              maxTokens: 600,
              stream: false,
              task: 'reset-context-summary',
            })
            if (r.error) {
              console.warn('[Thread] reset-context summary fallback failed:', r.error)
              return null
            }
            return r.content.trim() || null
          } catch (err) {
            console.warn('[Thread] reset-context summary fallback failed:', (err as Error).message)
            return null
          }
        }

        // Step 2 — LM fallback using messages already in hand from /context.
        if (!summary && oldSessionId) {
          const fromContext = await summarizeViaLM(contextMessages)
          if (fromContext) {
            summary = fromContext
            summarySource = 'fallback'
          }
        }

        // Step 2b — last-resort: /context returned no messages (deployment
        // mismatch / empty response). Try the explicit /list endpoint as a
        // safety net. Preserves Session 2 behaviour for older Honchos where
        // /context might not include messages.
        if (!summary && oldSessionId && contextMessages.length === 0) {
          const fallbackMessages = await getMessages(honchoUrl, oldSessionId).catch(() => [])
          if (fallbackMessages.length > 0) {
            const fromList = await summarizeViaLM(fallbackMessages)
            if (fromList) {
              summary = fromList
              summarySource = 'fallback'
            }
          }
        }

        // Step 3 — rotate the Honcho session + persist summary to thread.json.
        const result = await resetThreadContext(
          args.threadPath, args.threadName, args.projectName, summary,
          async (candidate) => {
            const init = await initHoncho(honchoUrl, candidate)
            return init.sessionId
          },
        )
        if (!result.ok) {
          console.error('[Thread] reset-context failed:', result.error)
          return { ok: false, error: result.error }
        }

        // Step 4 — archive into Memory_<Project>_<Thread>.json so the summary
        // is durable and recallable beyond the next session.
        if (summary) {
          await appendMemorySummary(args.threadPath, args.projectName, args.threadName, {
            timestamp: new Date().toISOString(),
            trigger: 'reset',
            honchoSessionId: result.oldSessionId,
            summary,
          }).catch((err) => console.warn('[Thread] memory archive failed:', (err as Error).message))
        }

        console.log(`[Thread] Reset context: ${result.oldSessionId} → ${result.newSessionId}, summary source: ${summarySource}`)
        return {
          ok: true,
          newSessionId: result.newSessionId,
          summarySaved: !!summary,
          summarySource,
        }
      } catch (err) {
        console.error('[Thread] reset-context error:', err)
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  // Read the per-thread Memory file's summaries array so the renderer can
  // surface them in `sessionSummaries` on thread load.
  ipcMain.handle(
    'thread:read-memory-summaries',
    async (_, args: { threadPath: string; projectName: string; threadName: string }) => {
      try {
        const summaries = await readMemorySummaries(args.threadPath, args.projectName, args.threadName)
        return { ok: true, summaries }
      } catch (err) {
        return { ok: false, summaries: [], error: (err as Error).message }
      }
    },
  )

  ipcMain.handle(
    'dump:append',
    async (_, args: { threadPath: string; projectName: string; threadName: string; content: string }) => {
      const result = await appendBrainDumpPrompt(args.threadPath, args.projectName, args.threadName, args.content)
      if (result.ok) {
        console.log(`[Dump] Appended Prompt ${result.promptNumber} to ${result.filePath}`)
      } else {
        console.error('[Dump] append failed:', result.error)
      }
      return result
    },
  )

  // P6 — append a chat-saved note to Notes_[Project]_[Thread].md
  ipcMain.handle(
    'note:append',
    async (_, args: { threadPath: string; projectName: string; threadName: string; content: string }) => {
      const result = await appendNote(args.threadPath, args.projectName, args.threadName, args.content)
      if (result.ok) {
        console.log(`[Notes] Saved to ${result.filePath}`)
      } else {
        console.error('[Notes] save failed:', result.error)
      }
      return result
    },
  )

  // ── Intake (P3-C) ────────────────────────────────────────────────────────
  ipcMain.handle('intake:pick-references', async () => {
    const picked = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'All Files', extensions: ['*'] }],
    })
    if (picked.canceled) return { canceled: true, filePaths: [] as string[] }
    return { canceled: false, filePaths: picked.filePaths }
  })

  ipcMain.handle('intake:add-references', async (_, args: { threadPath: string; filePaths: string[] }) => {
    return addReferencesToThread(args.threadPath, args.filePaths)
  })

  ipcMain.handle('thread:mark-intake-shown', async (_, args: { threadPath: string }) => {
    const next = await updateThreadMeta(args.threadPath, { intakePromptShown: true }).catch(() => null)
    return { ok: !!next }
  })

  // ── Reports (P4-A) + Versioning (P4-B) ──────────────────────────────────
  ipcMain.handle(
    'report:generate',
    async (_, args: {
      threadPath: string
      projectName: string
      threadName: string
      namePrefix: string
      referenceFiles: string[]
    }) => {
      const cfg = loadConfig()
      return generateReport({
        threadPath: args.threadPath,
        projectName: args.projectName,
        threadName: args.threadName,
        namePrefix: args.namePrefix,
        referenceFiles: args.referenceFiles,
        agentName: cfg.agent.agentName,
        userName: cfg.agent.userName,
        lm: {
          baseUrl: cfg.ai.baseUrl,
          model: cfg.ai.model,
          apiKey: '',
          temperature: cfg.ai.temperature,
          // Reports tend to be longer than chat replies — give the model room.
          maxTokens: Math.max(cfg.ai.maxTokens, 2048),
        },
      })
    },
  )

  ipcMain.handle('version:create', async (_, args: { filePath: string }) => {
    return createNextVersion(args.filePath)
  })

  // ── Comments (Fix 4 — inline comment system) ────────────────────────────
  ipcMain.handle('comments:read', async (_, args: { docPath: string }) => {
    return readComments(args.docPath)
  })

  ipcMain.handle('comments:write', async (_, args: { docPath: string; comments: Comment[] }) => {
    try {
      const result = await writeComments(args.docPath, args.comments)
      console.log(`[Comments] Saved ${args.comments.length} comment(s) for ${args.docPath}`)
      return result
    } catch (err) {
      console.error('[Comments] write failed:', (err as Error).message)
      return { ok: false, filePath: '', error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'thread:branch',
    async (_, args: { projectPath: string; newThreadName: string; predecessorPath: string }) => {
      try {
        const cfg = loadConfig()
        const baseUrl = cfg.honcho.url

        const predMeta = await readThreadMeta(args.predecessorPath)
        if (!predMeta) {
          return { ok: false, path: '', error: 'predecessor thread metadata missing' }
        }
        const predSessionId = predMeta.honchoSessionId

        // Fetch summary + recent messages from predecessor's Honcho session.
        let summary: string | null = null
        let allMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
        if (predSessionId) {
          const ctx = await getSessionContext(baseUrl, predSessionId, 2000).catch(() => null)
          if (ctx) summary = ctx.summary
          allMessages = await getMessages(baseUrl, predSessionId).catch(() => [])
        }
        const recentMessages = allMessages.slice(-5)

        // Dreaming Agent: try schedule_dream first (preferred), fall back to
        // /chat for a synchronous insight. Best-effort — branch succeeds even
        // when both endpoints are unavailable. Only the 'sync' mode produces
        // an immediate insight string to fold into inheritedContext; in
        // 'scheduled' mode the dream runs server-side and the new branch
        // ships without inherited dream content (the dreamInsights[] will
        // populate later via dreamOnce on first load).
        let dreamInsight: string | null = null
        if (predSessionId) {
          const domaineName = basename(dirname(args.projectPath)) || null
          const dream = await honchoDream(baseUrl, 'andy', predSessionId, {
            threadName: args.newThreadName,
            projectName: basename(args.projectPath),
            domaineName,
          }).catch(() => null)
          if (dream && dream.ok && dream.mode === 'sync') {
            dreamInsight = dream.insight
            console.log(`[Thread/branch] Dreaming Agent returned ${dream.insight.length} chars (sync)`)
          } else if (dream && dream.ok && dream.mode === 'scheduled') {
            console.log('[Thread/branch] Dreaming Agent scheduled (no synchronous insight to inherit)')
          }
        }

        const inheritance: BranchInheritance = {
          predecessorName: predMeta.name,
          predecessorPath: args.predecessorPath,
          predecessorHonchoSessionId: predSessionId,
          predecessorCompressionCount: predMeta.compressionCount ?? 0,
          summary,
          recentMessages,
          dreamInsight,
        }

        const result = await branchThread(args.projectPath, args.newThreadName, inheritance)
        if (!result.ok) return result

        // Bind new thread's Honcho session immediately so the renderer can use it.
        const bound = await bindThreadHoncho(
          result.path,
          args.newThreadName,
          basename(args.projectPath),
          async (candidate) => {
            const init = await initHoncho(baseUrl, candidate)
            return init.sessionId
          },
        )
        // Don't restart the watcher on thread branch — see thread:set-active
        // for the reasoning. The root watcher covers the new branch folder
        // recursively from the moment it lands on disk.

        console.log(`[Thread] Branched from ${predMeta.name}, summary injected`)
        return { ok: true, path: result.path, honchoSessionId: bound.honchoSessionId }
      } catch (err) {
        console.error('[Thread] branch failed:', (err as Error).message)
        return { ok: false, path: '', error: (err as Error).message }
      }
    },
  )

  // ── RAG ingestion (manual / on-demand) ───────────────────────────────────
  // Auto-ingestion fires from the workspace watcher in ragIngest.ts. This
  // handler exists so the Library → Ingest tab (step 7) and any "Re-ingest"
  // affordance can trigger ingestion explicitly without touching the file.
  ipcMain.handle('rag:ingest-manual', async (_, args: { filePath: string }) => {
    // Per-row Re-ingest button → force=true. The user clicked specifically
    // because something's wrong with this doc (often 0 tags from a silent
    // Gemini failure on first ingest). Bypass content-hash dedup so tag
    // extraction gets a second shot against the existing document row.
    console.log('[rag:ingest-manual] invoked for', args.filePath)
    return ingestManual(args.filePath, { force: true })
  })

  // ── RAG search (Library → Search sub-tab) ────────────────────────────────
  ipcMain.handle('rag:search', async (_, args: RagSearchArgs) => {
    try {
      return { ok: true, results: await searchDocuments(args) }
    } catch (err) {
      console.error('[ragSearch] failed:', (err as Error).message)
      return { ok: false, results: [], error: (err as Error).message }
    }
  })

  // ── Dashboard ────────────────────────────────────────────────────────────
  ipcMain.handle('hud:status', async () => {
    try {
      return { ok: true, data: await getDashboardStatus() }
    } catch (err) {
      console.error('[dashboard:status] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('hud:stats', async () => {
    try {
      return { ok: true, data: await getDashboardStats() }
    } catch (err) {
      console.error('[dashboard:stats] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  // ── Ingest (Codex → Ingest sub-tab) ──────────────────────────────────────
  ipcMain.handle('ingest:list-documents', async (_, args: ListIngestedArgs = {}) => {
    try {
      const result = await listIngestedDocuments(args)
      return { ok: true, data: result.rows, total: result.totalCount }
    } catch (err) {
      console.error('[ingest:list-documents] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ingest:list-activity', async (_, args?: { limit?: number }) => {
    try {
      return { ok: true, data: await listIngestActivity(args?.limit) }
    } catch (err) {
      console.error('[ingest:list-activity] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ingest:counts', async () => {
    try {
      return { ok: true, data: await getIngestCounts() }
    } catch (err) {
      console.error('[ingest:counts] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  // ── Cleanup (Codex → Ingest sub-tab maintenance tools) ───────────────────
  ipcMain.handle('ingest:delete-document', async (_, args: { sourcePath: string }) => {
    return deleteDocument(args.sourcePath)
  })
  ipcMain.handle('ingest:scan-dead-links', async () => {
    try {
      return { ok: true, deadLinks: await scanDeadLinks() }
    } catch (err) {
      return { ok: false, deadLinks: [], error: (err as Error).message }
    }
  })
  ipcMain.handle('ingest:purge-dead-links', async (_, args?: { ids?: string[] }) => {
    return purgeDeadLinks(args?.ids)
  })
  ipcMain.handle('ingest:scan-orphans', async () => {
    try {
      const counts = await scanOrphans()
      return { ok: true, ...counts }
    } catch (err) {
      return { ok: false, orphanTags: 0, sourcelessWikiPages: 0, error: (err as Error).message }
    }
  })
  ipcMain.handle('ingest:sweep-orphans', async () => {
    return sweepOrphans()
  })
  ipcMain.handle('ingest:health-scan', async () => {
    try {
      const snap = await runHealthScan()
      return { ok: true, ...snap }
    } catch (err) {
      return { ok: false, orphanTags: 0, deadLinks: 0, sourcelessWikiPages: 0, error: (err as Error).message }
    }
  })

  // ── Graph (Codex → Graph sub-tab) ────────────────────────────────────────
  ipcMain.handle('graph:fetch', async (_, args?: FetchGraphArgs) => {
    try {
      const data = await fetchGraph(args ?? {})
      return { ok: true, data }
    } catch (err) {
      console.error('[graph:fetch] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  // ── Graph analytics (Codex → Syntheses + the Constellation graph theme) ─
  // Computed on demand; the renderer caches the last result and reruns when
  // the user reopens the tab or forces refresh. Louvain + Brandes are
  // ~O(VE) — fine at the corpus sizes Andy works at.
  ipcMain.handle('graph:analytics', async (_, args?: GraphAnalyticsArgs) => {
    try {
      const data = await computeGraphAnalytics(args ?? {})
      return { ok: true, data }
    } catch (err) {
      console.error('[graph:analytics] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  // ── Hive (architecture-v4 Part 5) ───────────────────────────────────────
  // Per-card stats aggregators. The renderer keeps a Zustand store with the
  // most recent result and a "refresh" action that re-fires these.

  ipcMain.handle('hive:honcho-stats', async () => {
    try {
      const cfg = loadConfig()
      const data = await gatherHiveHonchoStats(cfg.projectsRoot ?? '', cfg.honcho.url)
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('hive:validation-stats', async () => {
    try {
      const data = await gatherValidationStats()
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('hive:list-syntheses', async (_, args?: { limit?: number }) => {
    try {
      const drafts = await listRecentSyntheses(args?.limit ?? 10)
      return { ok: true, drafts }
    } catch (err) {
      return { ok: false, drafts: [], error: (err as Error).message }
    }
  })

  ipcMain.handle('hive:foundry-stats', async () => {
    try {
      const data = await gatherFoundryStats()
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ── Hermes (architecture-v4 §4.5 §10 — Session 5) ────────────────────────
  // Three IPCs: status (polled by the Hive card every few seconds),
  // start / stop (manual control from the Hive toggle and Settings save
  // hooks). start() flips both the Telegram poll loop AND the iCloud
  // watcher on so a single user-facing toggle controls both relay surfaces.

  ipcMain.handle('hermes:status', async () => {
    try {
      return { ok: true, data: getHermesStatus() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('hermes:start', async () => {
    try {
      // Fire both — either can return ok:false (e.g. iCloud path unset)
      // without preventing the other from starting. The Hive card reads
      // the combined status afterwards.
      const tg     = await startHermesBot()
      const icloud = await startIcloudWatcher()
      return { ok: tg.ok || icloud.ok, telegram: tg, icloud, data: getHermesStatus() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('hermes:stop', async () => {
    try {
      stopHermesBot()
      stopIcloudWatcher()
      return { ok: true, data: getHermesStatus() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Validation "Run sweep now" — runs the full set of read-only scans + the
  // destructive sweeps. Logs a row to rag_operations_log so the trend
  // sparkline can read it back later. The individual helpers are imported
  // from cleanupOps already.
  ipcMain.handle('hive:run-validation-sweep', async () => {
    try {
      const startedAt = new Date().toISOString()
      // Read-only scans
      const dead = await scanDeadLinks().catch(() => [] as { id: string; source_path: string; title: string }[])
      const orphans = await scanOrphans().catch(() => ({ orphanTags: 0, sourcelessWikiPages: 0 }))
      const health = await runHealthScan().catch(() => null)
      // Destructive sweeps
      const sweptOrphans = await sweepOrphans().catch(() => ({ ok: false, sweptTags: 0, sweptWikiPages: 0 }))
      const purgedDeadLinks = await purgeDeadLinks().catch(() => ({ ok: false, deleted: 0, sweptTags: 0, sweptWikiPages: 0 }))

      const summary = {
        startedAt,
        finishedAt: new Date().toISOString(),
        deadLinksFound: dead.length,
        deadLinksPurged: purgedDeadLinks.deleted ?? 0,
        orphanTagsFound: orphans.orphanTags ?? 0,
        orphanWikiPagesFound: orphans.sourcelessWikiPages ?? 0,
        orphanTagsSwept: sweptOrphans.sweptTags ?? 0,
        orphanWikiPagesSwept: sweptOrphans.sweptWikiPages ?? 0,
        health,
      }
      // Log it for the trend sparkline. Schema reality (migration 001) —
      // the column is `operation`, not `kind`, and the JSONB column is
      // `details`, not `payload`. Originally written with the wrong names
      // → INSERT failed silently into the catch below on every Run-sweep
      // click, so no sweep history ever landed. The hive.ts SELECT side
      // had the symmetric bug; both fixed together.
      await ragQuery(
        `INSERT INTO rag_operations_log (operation, details, created_at) VALUES ($1, $2::jsonb, NOW())`,
        ['validation_sweep', JSON.stringify(summary)],
      ).catch((err: unknown) => console.warn('[Hive] sweep log insert failed:', (err as Error).message))
      return { ok: true, summary }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Synthesis Agent — gap-bridge generator. Takes the gap descriptor from
  // the analytics layer, calls Claude Sonnet via the existing chat()
  // adapter, writes the markdown to disk + a rag_syntheses row.
  ipcMain.handle(
    'synthesis:generate-gap-bridge',
    async (_, args: {
      gapId: string
      clusterA: { id: number; name: string; topTags: string[] }
      clusterB: { id: number; name: string; topTags: string[] }
      topDocs: Array<{ title: string; sourcePath: string }>
      domaineId?: string | null
      synthesisType?: 'gap-bridge' | 'honcho-dream'
    }) => {
      try {
        const cfg = loadConfig()
        const apiKey = cfg.anthropic.apiKey
        const model  = cfg.anthropic.model || 'claude-sonnet-4-6'
        if (!apiKey) {
          return { ok: false, error: 'Anthropic API key not set — configure in Settings → Connections.' }
        }
        const libraryPath = getLibraryRoot(cfg)
        const generateArgs: GenerateGapBridgeArgs = {
          gapId: args.gapId,
          clusterA: args.clusterA,
          clusterB: args.clusterB,
          topDocs: args.topDocs,
          domaineId: args.domaineId ?? null,
          libraryPath,
          // llmClient's Anthropic adapter falls back to its internal
          // ANTHROPIC_API_BASE when baseUrl is undefined/empty — passing
          // the explicit URL keeps logs readable.
          lm: { provider: 'anthropic', model, apiKey, baseUrl: 'https://api.anthropic.com/v1' },
          synthesisType: args.synthesisType,
        }
        const result = await generateGapBridge(generateArgs, (opts) =>
          chat({
            provider: opts.provider,
            model: opts.model,
            apiKey: opts.apiKey,
            baseUrl: opts.baseUrl,
            messages: opts.messages,
            temperature: opts.temperature,
            maxTokens: opts.maxTokens,
            stream: opts.stream,
            task: opts.task,
          }),
        )
        return result
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  // ── Foundry (architecture-v4 Part 6 — Session 4) ─────────────────────
  // Capture surfaces are blocking on the row insert (renderer awaits the
  // id for its "captured" toast); triage runs fire-and-forget inside
  // foundry.ts and the renderer polls foundry:list to discover triaged
  // items. List is used by the Review interface (Part E) + the Foundry
  // Hive card (Part F).

  ipcMain.handle('foundry:capture-url', async (_, args: { url: string; triageMode?: FoundryTriageMode }) => {
    try {
      return await foundryCaptureUrl(args.url, args.triageMode ?? 'extract')
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('foundry:capture-text', async (_, args: { content: string; title: string; triageMode?: FoundryTriageMode }) => {
    try {
      return await foundryCaptureText(args.content, args.title, args.triageMode ?? 'convert')
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('foundry:capture-file', async (_, args: { content: string; filename: string; triageMode?: FoundryTriageMode }) => {
    try {
      return await foundryCaptureFile(args.content, args.filename, args.triageMode ?? 'extract')
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Binary file capture (Session 5 — PDF/DOCX warm-up). The renderer ships
  // an ArrayBuffer; Electron's structured-clone-over-IPC turns it into a
  // Buffer / Uint8Array on this side. We type-narrow defensively because
  // the structured clone can shape it as either depending on Electron
  // version. captureFileBinary picks the right text extractor by extension.
  ipcMain.handle('foundry:capture-file-binary', async (_, args: {
    bytes: ArrayBuffer | Uint8Array | Buffer
    filename: string
    triageMode?: FoundryTriageMode
  }) => {
    try {
      const buf = args.bytes instanceof Uint8Array
        ? args.bytes
        : new Uint8Array(args.bytes as ArrayBuffer)
      return await foundryCaptureFileBinary(buf, args.filename, args.triageMode ?? 'extract')
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'foundry:list',
    async (_, args?: { statuses?: FoundryTriageStatus[]; limit?: number }) => {
      try {
        const items = await listFoundryItems(args ?? {})
        return { ok: true, items }
      } catch (err) {
        return { ok: false, items: [], error: (err as Error).message }
      }
    },
  )

  ipcMain.handle('foundry:list-target-threads', async () => {
    try {
      const threads = await listTargetThreads()
      return { ok: true, threads }
    } catch (err) {
      return { ok: false, threads: [], error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'foundry:approve',
    async (_, args: {
      id: string
      content: string
      filename: string
      targetThreadPath?: string | null
      reviewerNotes?: string | null
    }) => {
      try {
        return await approveItem(args)
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  ipcMain.handle(
    'foundry:reject',
    async (_, args: { id: string; notes?: string | null }) => {
      try {
        return await rejectItem(args)
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  // Rejected-item cleanup — Session 4 UX redesign Part 5.
  ipcMain.handle('foundry:delete-rejected', async (_, args: { id: string }) => {
    try {
      return await deleteRejectedItem(args.id)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('foundry:delete-all-rejected', async () => {
    try {
      return await deleteAllRejectedItems()
    } catch (err) {
      return { ok: false, deleted: 0, error: (err as Error).message }
    }
  })

  ipcMain.handle('foundry:delete-all-admitted', async () => {
    try {
      return await deleteAllAdmittedItems()
    } catch (err) {
      return { ok: false, deleted: 0, error: (err as Error).message }
    }
  })

  ipcMain.handle('foundry:restore', async (_, args: { id: string }) => {
    try {
      return await restoreRejectedItem(args.id)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ingest:pick-and-ingest', async (_, args?: { defaultPath?: string }) => {
    try {
      const cfg = loadConfig()
      const root = cfg.holocronRoot || ''
      if (!root) {
        return { ok: false, ingested: 0, skipped: 0, errors: [{ filePath: '', error: 'Workspace root not configured' }] }
      }
      const result = await dialog.showOpenDialog({
        defaultPath: args?.defaultPath ?? root,
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Markdown / Text', extensions: ['md', 'txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, ingested: 0, skipped: 0, errors: [] }
      }
      // Workspace-restricted ingest: detectSourceType requires the file to
      // sit under holocronRoot so it can categorize as projects/library/inbox.
      const normalizedRoot = root.endsWith('/') ? root : root + '/'
      const errors: Array<{ filePath: string; error: string }> = []
      let ingested = 0
      let skipped = 0
      for (const filePath of result.filePaths) {
        if (!filePath.startsWith(normalizedRoot)) {
          errors.push({ filePath, error: 'File must be inside the workspace root' })
          continue
        }
        try {
          // "+ Ingest file…" picker → force=true. User explicitly picked
          // this file, so re-run tag extraction even on hash dedup.
          const r = await ingestManual(filePath, { force: true })
          if (r.ok && r.ingested) ingested++
          else if (r.ok && !r.ingested) skipped++
          else errors.push({ filePath, error: r.error ?? 'Unknown error' })
        } catch (err) {
          errors.push({ filePath, error: (err as Error).message })
        }
      }
      return { ok: true, ingested, skipped, errors }
    } catch (err) {
      console.error('[ingest:pick-and-ingest] failed:', (err as Error).message)
      return { ok: false, ingested: 0, skipped: 0, errors: [{ filePath: '', error: (err as Error).message }] }
    }
  })

  // Walks projectsRoot for every .md file (skipping dotfiles + dot-folders)
  // and ingests each one. ingestManual handles per-file domain resolution +
  // hash-dedup; this handler is just the tree-walk driver. Cap at 5000 files
  // as a runaway-protection guard; way more than any realistic workspace.
  ipcMain.handle('ingest:sync-workspace', async () => {
    try {
      const cfg = loadConfig()
      const root = cfg.projectsRoot || cfg.holocronRoot || ''
      if (!root) {
        return { ok: false, ingested: 0, skipped: 0, errors: [{ filePath: '', error: 'Workspace root not configured' }] }
      }

      const files: string[] = []
      const MAX_FILES = 5000
      async function walk(dir: string): Promise<void> {
        if (files.length >= MAX_FILES) return
        let entries
        try {
          entries = await readdir(dir, { withFileTypes: true })
        } catch (err) {
          console.warn('[ingest:sync-workspace] readdir failed for', dir, (err as Error).message)
          return
        }
        for (const e of entries) {
          if (e.name.startsWith('.')) continue  // skip .DS_Store, .git, etc.
          const full = join(dir, e.name)
          if (e.isDirectory()) {
            await walk(full)
          } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
            files.push(full)
            if (files.length >= MAX_FILES) return
          }
        }
      }
      await walk(root)

      const errors: Array<{ filePath: string; error: string }> = []
      let ingested = 0
      let skipped  = 0
      for (const filePath of files) {
        try {
          const r = await ingestManual(filePath)
          if (r.ok && r.ingested) ingested++
          else if (r.ok && !r.ingested) skipped++
          else errors.push({ filePath, error: r.error ?? 'Unknown error' })
        } catch (err) {
          errors.push({ filePath, error: (err as Error).message })
        }
      }
      console.log(`[ingest:sync-workspace] scanned ${files.length} .md file${files.length === 1 ? '' : 's'} under ${root}: ${ingested} ingested, ${skipped} skipped, ${errors.length} errors`)
      return { ok: true, scanned: files.length, ingested, skipped, errors }
    } catch (err) {
      console.error('[ingest:sync-workspace] failed:', (err as Error).message)
      return { ok: false, scanned: 0, ingested: 0, skipped: 0, errors: [{ filePath: '', error: (err as Error).message }] }
    }
  })

  ipcMain.handle('hud:recent-activity', async (_, args?: { limit?: number }) => {
    try {
      return { ok: true, data: await getRecentActivity(args?.limit) }
    } catch (err) {
      console.error('[dashboard:recent-activity] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  // ── Wiki (Library → Wiki sub-tab — UI lands in step 11) ──────────────────
  ipcMain.handle('wiki:list', async (_, args?: { domaineId?: string | null; crossDomaine?: boolean; tier?: 'thread' | 'project' | 'domaine' }) => {
    try {
      return { ok: true, data: await listWikiPages(args) }
    } catch (err) {
      console.error('[wiki:list] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wiki:get', async (_, args: { slug: string }) => {
    try {
      return { ok: true, data: await getWikiPage(args.slug) }
    } catch (err) {
      console.error('[wiki:get] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wiki:get-sources', async (_, args: { slug: string }) => {
    try {
      return { ok: true, data: await getWikiPageSources(args.slug) }
    } catch (err) {
      console.error('[wiki:get-sources] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wiki:regenerate', async (_, args: { slug: string }) => {
    try {
      return await regenerateWikiPage(args.slug)
    } catch (err) {
      console.error('[wiki:regenerate] failed:', (err as Error).message)
      return { ok: false, slug: args.slug, error: (err as Error).message }
    }
  })

  ipcMain.handle('wiki:compile-now', async () => {
    try {
      return { ok: true, data: await compileNow([]) }
    } catch (err) {
      console.error('[wiki:compile-now] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wiki:import-to-thread', async (_, args: {
    slug: string; projectName: string; threadName: string; overwrite?: boolean
  }) => {
    try {
      return await importWikiToThread(args)
    } catch (err) {
      console.error('[wiki:import-to-thread] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wiki:use-as-report-draft', async (_, args: {
    slug: string; projectName: string; threadName: string
  }) => {
    try {
      return await useWikiAsReportDraft(args)
    } catch (err) {
      console.error('[wiki:use-as-report-draft] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  // ── LM non-streaming (for summarization) ─────────────────────────────────
  ipcMain.handle(
    'lm:complete',
    async (_, args: {
      messages: Array<{ role: string; content: string }>
      baseUrl: string; model: string; apiKey: string
      temperature?: number; maxTokens?: number
      provider?: Provider; task?: string
    }): Promise<{ content: string; error: string | null }> => {
      const res = await chat({
        provider: args.provider ?? inferProvider(args.baseUrl),
        model: args.model,
        apiKey: args.apiKey,
        baseUrl: args.baseUrl,
        messages: args.messages as ChatMessage[],
        temperature: args.temperature ?? 0.3,
        maxTokens: args.maxTokens ?? 512,
        stream: false,
        task: args.task ?? 'lm-complete',
      })
      return { content: res.content, error: res.error ?? null }
    }
  )

  // ── LM streaming ─────────────────────────────────────────────────────────
  ipcMain.on('lm:abort', () => {
    if (activeStreamController) {
      activeStreamController.abort()
      activeStreamController = null
    }
  })

  ipcMain.on(
    'lm:start',
    (event: IpcMainEvent, args: {
      messages: Array<{ role: string; content: string }>
      baseUrl: string
      model: string
      apiKey: string
      temperature?: number
      maxTokens?: number
      provider?: Provider
      task?: string
    }) => {
      // Abort any in-flight stream before starting a new one
      if (activeStreamController) activeStreamController.abort()
      activeStreamController = new AbortController()
      const { signal } = activeStreamController

      // ChatDiag: authoritative log at the IPC boundary. This is what crosses
      // into the LLM adapter. If the renderer's send-build log and this log
      // disagree on shape, something is mutating mid-IPC (unlikely, but worth
      // confirming side-by-side when investigating context-bleed reports).
      const rolePattern = args.messages.map((m) => m.role[0]).join('')
      const totalChars = args.messages.reduce((sum, m) => sum + m.content.length, 0)
      const sysLen = args.messages[0]?.content.length ?? 0
      const lastMsg = args.messages[args.messages.length - 1]
      console.log(`[ChatDiag] send-ipc msgs=${args.messages.length} roles="${rolePattern}" totalChars=${totalChars} sysLen=${sysLen} provider=${args.provider ?? '?'} model=${args.model} task=${args.task ?? 'chat'}`)
      console.log(`[ChatDiag] send-ipc lastMsg(${lastMsg?.role}, ${lastMsg?.content.length ?? 0}c): ${JSON.stringify(lastMsg?.content.slice(0, 240) ?? '')}`)

      void (async () => {
        const res = await chat({
          provider: args.provider ?? inferProvider(args.baseUrl),
          model: args.model,
          apiKey: args.apiKey,
          baseUrl: args.baseUrl,
          messages: args.messages as ChatMessage[],
          temperature: args.temperature ?? 0.7,
          maxTokens: args.maxTokens ?? 1024,
          stream: true,
          task: args.task ?? 'chat',
          abortSignal: signal,
          onToken: (token) => {
            if (!event.sender.isDestroyed()) event.sender.send('lm:token', token)
          },
        })
        activeStreamController = null
        if (event.sender.isDestroyed()) return
        if (res.error === '__aborted__') {
          event.sender.send('lm:end', { error: '__aborted__' })
        } else if (res.error) {
          event.sender.send('lm:end', { error: res.error })
        } else {
          event.sender.send('lm:end', { error: null })
        }
      })()
    }
  )
}
