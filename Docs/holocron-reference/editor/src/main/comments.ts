import fs from 'fs'
import path from 'path'

export interface Comment {
  id: string
  fromLine: number  // 1-indexed
  toLine: number
  originalText: string
  comment: string
  createdAt: string
  resolved: boolean
}

/**
 * Walk up from docPath looking for the thread root (folder containing
 * thread.json). Returns null if not found within 10 levels (defensive
 * — thread folders shouldn't nest deep, this just bounds the climb).
 */
function findThreadRoot(docPath: string): string | null {
  let dir = path.dirname(docPath)
  for (let i = 0; i < 10; i++) {
    try {
      if (fs.statSync(path.join(dir, 'thread.json')).isFile()) return dir
    } catch { /* not present at this level */ }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * Sidecar file for a document's inline comments.
 *
 * New layout (threads created 2026-05-08+): `<threadRoot>/System/Comments_<stem>.json`
 *   — central location alongside other auto-generated files. Discriminator:
 *   the existence of `<threadRoot>/System/`.
 *
 * Legacy layout (old threads, or docs outside any thread): same folder as
 * the document, `<dir>/Comments_<stem>.json`. Behavior preserved verbatim.
 */
export function commentsFilePath(docPath: string): string {
  const filename = path.basename(docPath)
  const stem = filename.replace(/\.(md|markdown|txt)$/i, '')
  const threadRoot = findThreadRoot(docPath)
  if (threadRoot) {
    try {
      if (fs.statSync(path.join(threadRoot, 'System')).isDirectory()) {
        return path.join(threadRoot, 'System', `Comments_${stem}.json`)
      }
    } catch { /* no System/ — fall through to legacy */ }
  }
  return path.join(path.dirname(docPath), `Comments_${stem}.json`)
}

/** Legacy doc-adjacent sidecar path. Used as a read-fallback for old threads
 *  that may have comments at root before the System/ layout existed. */
function legacyCommentsFilePath(docPath: string): string {
  const dir = path.dirname(docPath)
  const filename = path.basename(docPath)
  const stem = filename.replace(/\.(md|markdown|txt)$/i, '')
  return path.join(dir, `Comments_${stem}.json`)
}

export async function readComments(docPath: string): Promise<Comment[]> {
  if (!docPath) return []
  // Try the canonical (System-aware) path first.
  const primary = commentsFilePath(docPath)
  try {
    const raw = await fs.promises.readFile(primary, 'utf-8')
    const data = JSON.parse(raw) as { comments?: Comment[] }
    return Array.isArray(data.comments) ? data.comments : []
  } catch { /* fall through */ }
  // Legacy fallback: old threads whose comments still live next to the doc.
  const legacy = legacyCommentsFilePath(docPath)
  if (legacy === primary) return []
  try {
    const raw = await fs.promises.readFile(legacy, 'utf-8')
    const data = JSON.parse(raw) as { comments?: Comment[] }
    return Array.isArray(data.comments) ? data.comments : []
  } catch {
    return []
  }
}

export async function writeComments(docPath: string, comments: Comment[]): Promise<{ ok: boolean; filePath: string }> {
  const sidecar = commentsFilePath(docPath)
  if (comments.length === 0) {
    // Clean up empty sidecars — both new and legacy locations to avoid drift.
    try { await fs.promises.unlink(sidecar) } catch { /* not present, fine */ }
    const legacy = legacyCommentsFilePath(docPath)
    if (legacy !== sidecar) {
      try { await fs.promises.unlink(legacy) } catch { /* not present, fine */ }
    }
    return { ok: true, filePath: sidecar }
  }
  // Ensure parent dir exists (System/ may not exist for very-old threads
  // that gain new System/-scoped comments mid-life — defensive mkdir).
  await fs.promises.mkdir(path.dirname(sidecar), { recursive: true })
  const payload = JSON.stringify({ docPath, comments }, null, 2)
  await fs.promises.writeFile(sidecar, payload, 'utf-8')
  return { ok: true, filePath: sidecar }
}
