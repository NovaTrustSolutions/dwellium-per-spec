import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { config as loadDotenv } from 'dotenv'
import { registerIpcHandlers } from './ipc'
import { initWorkspaceWatcher } from './workspace'
import { validateActiveConfigPaths } from './orgOps'
import { initRagIngest, shutdownRagIngest } from './ragIngest'
import { bootstrapMissingPages } from './ragWiki'
import { deleteZombieWikiDocs, purgeLegacySentinelWikiPages, reconcileWikiSlugs, sweepOrphans } from './cleanupOps'
import { loadConfig, saveConfig, syncWorkspaceRoots } from './config'
import { runProjectsMigration } from './migration'
import { startHermesBot, startIcloudWatcher, stopHermesBot, stopIcloudWatcher } from './hermes'

// Load editor/.env so HOLOCRON_DB_URI (and any future env vars) reach the
// main-process modules that need them — currently the RAG cost-logging pool.
// Try cwd first (works when `npm run dev` is run from editor/), then walk up
// from the compiled main bundle (out/main/index.js → editor/.env).
loadDotenv()
if (!process.env.HOLOCRON_DB_URI) {
  loadDotenv({ path: join(__dirname, '../../.env') })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 10 },
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Prevent Electron from navigating away when files are dropped outside the DropZone
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let quitReady = false

app.on('before-quit', (event) => {
  if (quitReady) return
  event.preventDefault()
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.webContents.isDestroyed()) {
    quitReady = true
    app.quit()
    return
  }
  win.webContents.send('app:before-quit')
  const timer = setTimeout(() => {
    quitReady = true
    app.quit()
  }, 6000)
  ipcMain.once('app:quit-ready', () => {
    clearTimeout(timer)
    quitReady = true
    void shutdownRagIngest().finally(() => app.quit())
  })
})

app.whenReady().then(async () => {
  // Heal any drift between holocronRoot / projectsRoot / workspace.path. Old
  // configs from the flat-Sessions migration could have projectsRoot pointing
  // at a sibling dir that no longer exists, while the user picked a new
  // workspace via Settings → Connections (which only updates holocronRoot).
  // Bring them back into lockstep before anything else reads them.
  try {
    const cfg = loadConfig()
    const synced = syncWorkspaceRoots(cfg)
    if (synced.changed) {
      console.log('[Boot] Workspace roots resynced →', synced.config.holocronRoot)
      saveConfig(synced.config)
    }
  } catch (err) {
    console.error('[Boot] root sync error:', (err as Error).message)
  }

  // Migrate the flat Sessions model to Projects/Threads if needed.
  try {
    const cfg = loadConfig()
    const result = await runProjectsMigration(cfg)
    if (result.changed) saveConfig(result.config)
  } catch (err) {
    console.error('[Projects] migration error:', (err as Error).message)
  }

  // (v11 reset removed runDomaineFolderMigration — no auto-migrate. Users
  //  create Domaines + projects fresh; leftover flat folders are silently
  //  ignored by listProjects.)

  // Clear stale activeProject/activeThread config keys whose paths no longer
  // resolve on disk (rename/purge from another machine, crash mid-op, etc.)
  try {
    const v = await validateActiveConfigPaths()
    if (v.changed) console.log(`[Boot] Cleared stale config: ${v.cleared.join(', ')}`)
  } catch (err) {
    console.error('[Boot] config validation error:', (err as Error).message)
  }

  registerIpcHandlers()
  createWindow()
  initWorkspaceWatcher()
  // Ingestion subscribes to workspace events; must run AFTER initWorkspaceWatcher.
  initRagIngest()

  // v15 one-shot: purge pre-v15 sentinel-slug wiki pages
  // (`<dn>/<pn>/_project`, `<dn>/_domaine`) before bootstrap runs. The
  // sentinel suffixes were dropped in v15; existing rows from the older
  // compile path would otherwise sit forever in rag_wiki_pages with their
  // loop-back rag_documents rows showing "_project"/"_domaine" in the
  // Graph. The purge is idempotent — once the corpus is clean, the
  // DELETE matches zero rows and the function returns 0/0/0. Awaited
  // before bootstrap so the new compile fills in the corrected slugs.
  try {
    const purged = await purgeLegacySentinelWikiPages()
    if (purged.deletedPages > 0 || purged.deletedDocs > 0 || purged.deletedTags > 0) {
      console.log(`[Boot] legacy sentinel purge: deleted ${purged.deletedPages} wiki page${purged.deletedPages === 1 ? '' : 's'}, ${purged.deletedDocs} rag_documents row${purged.deletedDocs === 1 ? '' : 's'}, ${purged.deletedTags} orphan tag${purged.deletedTags === 1 ? '' : 's'}`)
    }
  } catch (err) {
    console.warn('[Boot] legacy sentinel purge failed:', (err as Error).message)
  }

  // Wiki slug reconciliation — catches rename-orphaned pages whose slug
  // no longer points at a live (Domaine, Project, Thread) triple. Belt-
  // and-suspenders for renames that happened before the v15 rename →
  // recompile wiring landed (see projectFs.ts:renameThread/renameProject).
  // Awaited before bootstrap so the new compile pass fills the gaps.
  // Idempotent — logs only when it actually deletes something.
  try {
    const reconciled = await reconcileWikiSlugs()
    if (reconciled.deletedPages > 0) {
      console.log(`[Boot] wiki slug reconciliation: deleted ${reconciled.deletedPages} rename-orphaned page${reconciled.deletedPages === 1 ? '' : 's'}`)
    }
  } catch (err) {
    console.warn('[Boot] wiki slug reconciliation failed:', (err as Error).message)
  }

  // One-shot wiki bootstrap. bootstrapMissingPages walks every tag with
  // ≥COLD_START_MIN_DOCS active sources and compiles a page for any tag
  // that doesn't already have one — catches docs ingested before the
  // threshold was dropped (which got tags but no page). Runs regardless of
  // how many wiki pages already exist, unlike compileNow([]) which only
  // does work when wiki count is 0. Fired async; failures are non-fatal.
  // Logs unconditionally so we can see it ran even when the result is 0/0.
  console.log('[Boot] wiki bootstrap: starting')
  void bootstrapMissingPages()
    .then((r) => {
      console.log(`[Boot] wiki bootstrap: compiled=${r.compiled.length} skipped=${r.skipped.length} alreadyExists=${r.alreadyExists}`)
      if (r.skipped.length > 0) {
        console.log(`[Boot] wiki bootstrap skipped: ${r.skipped.join(', ')}`)
      }
    })
    .catch((err) => console.warn('[Boot] wiki bootstrap failed:', (err as Error).message))
    // Second pass — runs after bootstrap settles so it sees any pages
    // bootstrap just (re)compiled. Sweeps every rag_documents row of
    // source_type='wiki' whose source_path no longer points at a live
    // rag_wiki_pages slug: zombie residue of migration 007 (which wiped
    // rag_wiki_pages but left those rows + their flat _Codex/Wiki/*.md
    // files behind), and the same hazard for any future migration that
    // touches the wiki table. Deletes the row, the disk file, and any tag
    // it sole-sourced (rag_document_tags cascades, rag_tags doesn't) so no
    // manual intervention is needed. Idempotent — a no-op once clean.
    // Fired async; failures are non-fatal; logs unconditionally.
    .finally(() => {
      void deleteZombieWikiDocs()
        .then((r) => {
          console.log(`[Boot] wiki zombie sweep: deleted=${r.deletedRows} doc rows, ${r.deletedTags} orphan tags (unlinked ${r.unlinkedFiles} file${r.unlinkedFiles === 1 ? '' : 's'})`)
        })
        .catch((err) => console.warn('[Boot] wiki zombie sweep failed:', (err as Error).message))
    })

  // Session 3 — sweepOrphans on boot (architecture-v4 Part 4.3 self-healing
  // pattern). Idempotent: drops orphan tags + sourceless wiki pages that
  // accumulated since the last sweep. Logs unconditionally so a no-op pass
  // is still visible. Was manual-only via the Ingest-tab button previously.
  void sweepOrphans()
    .then((r) => {
      if (r.ok) {
        console.log(`[Boot] orphan sweep: tags=${r.sweptTags} wikiPages=${r.sweptWikiPages}`)
      } else if (r.error) {
        console.warn('[Boot] orphan sweep failed:', r.error)
      }
    })
    .catch((err) => console.warn('[Boot] orphan sweep failed:', (err as Error).message))

  // Session 5 — Hermes auto-start. Both the Telegram bot and the iCloud
  // watcher are no-ops when their config fields are empty (start*
  // returns ok:false with a friendly reason); logging that reason at
  // boot helps Andy see why nothing's listening yet. Hive's Hermes card
  // gives him the manual Start/Stop toggle after he saves config.
  void startHermesBot()
    .then((r) => {
      if (r.ok) console.log('[Boot] Hermes Telegram bot started')
      else      console.log(`[Boot] Hermes Telegram bot not started: ${r.error}`)
    })
    .catch((err) => console.warn('[Boot] Hermes Telegram start crashed:', (err as Error).message))

  void startIcloudWatcher()
    .then((r) => {
      if (r.ok) console.log(`[Boot] iCloud watcher started: ${r.path}`)
      else      console.log(`[Boot] iCloud watcher not started: ${r.error}`)
    })
    .catch((err) => console.warn('[Boot] iCloud watcher start crashed:', (err as Error).message))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Graceful shutdown — stop Hermes loops so the dev hot-reload doesn't leak
// a poll loop or a chokidar handle into the next process. Wrapped in the
// existing before-quit handshake; failures here are non-fatal.
app.on('before-quit', () => {
  try { stopHermesBot() } catch { /* ignore */ }
  try { stopIcloudWatcher() } catch { /* ignore */ }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
