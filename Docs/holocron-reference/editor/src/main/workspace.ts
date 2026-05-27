import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { loadConfig } from './config'

let watcher: FSWatcher | null = null

export type FileChangeType = 'add' | 'change' | 'unlink'
type FileChangeListener = (filePath: string, type: FileChangeType) => void
const subscribers = new Set<FileChangeListener>()

// ── Rename lock ───────────────────────────────────────────────────────────
// `fs.rename` of a project/thread folder triggers a storm of chokidar events
// (unlink + add for every descendant on most platforms). Without a gate,
// ingestion would race with our explicit SQL updates — re-ingesting moved
// files under the new path while we're still rewriting their rows. Counter
// (not boolean) so nested ops compose safely. Out-of-app fs activity during
// a rename window is also dropped; rename windows are brief.
let renameLockCount = 0

export async function withRenameLock<T>(fn: () => Promise<T>): Promise<T> {
  renameLockCount++
  try {
    return await fn()
  } finally {
    renameLockCount--
  }
}

/**
 * Subscribe to workspace file-change events from the main process. Used by
 * `ragIngest.ts` to drive ingestion in parallel with the renderer notification
 * (which still fires for sidebar refresh). Returns an unsubscribe function.
 */
export function subscribeWorkspaceFileChange(cb: FileChangeListener): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

function notifyAll(filePath: string, type: FileChangeType): void {
  if (!/\.(md|txt)$/i.test(filePath)) return
  if (renameLockCount > 0) return  // rename in progress — explicit SQL handles state
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('workspace:file-changed', { filePath, type })
    }
  }
  for (const sub of subscribers) {
    try { sub(filePath, type) } catch (err) {
      console.warn('[Workspace] subscriber threw:', (err as Error).message)
    }
  }
}

export function startWatcher(folderPath: string): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (!folderPath) return
  console.log('[Workspace] watching:', folderPath)
  watcher = chokidar.watch(folderPath, {
    ignored: /(^|[/\\])\../,
    persistent: true,
    // Don't fire 'add' for pre-existing files at startup — that's what the
    // sidebar's right-click "Re-ingest" is for. Manual control over backfill.
    ignoreInitial: true,
    // Unlimited descent.
    depth: undefined,
    // Polling instead of fsevents on macOS. The previous awaitWriteFinish-only
    // fix didn't catch new files dropped into pre-existing subdirectories —
    // fsevents on macOS misses subtree events in ways no chokidar option can
    // patch over. Polling at 1s is slower but deterministic; for a single-user
    // desktop app with a project tree of ~hundreds of files, the CPU cost is
    // negligible and the reliability is what matters.
    usePolling: true,
    interval: 1000,
    // Stabilize each detected write before firing — protects against polls
    // that catch a file mid-write (rare at 1s cadence, but free insurance).
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
  })
  watcher.on('add', (fp) => notifyAll(fp, 'add'))
  watcher.on('change', (fp) => notifyAll(fp, 'change'))
  watcher.on('unlink', (fp) => notifyAll(fp, 'unlink'))
  watcher.on('error', (err) => console.error('[Workspace] watcher error:', err))
}

export function stopWatcher(): void {
  watcher?.close()
  watcher = null
}

export function writeWorkspaceFile(workspacePath: string, relPath: string, content: string): string {
  const fullPath = path.join(workspacePath, relPath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf-8')
  console.log('[Workspace] wrote:', fullPath)
  return fullPath
}

export function initWorkspaceWatcher(): void {
  const cfg = loadConfig()
  const root = cfg.holocronRoot || cfg.workspace?.path || ''
  if (!root) return
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  startWatcher(root)
}
