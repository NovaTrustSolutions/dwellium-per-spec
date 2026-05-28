import fs from 'fs'
import path from 'path'

export interface FsEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  mtime: number
  size: number
}

export interface SessionInfo {
  id: string
  name: string
  path: string
  fileCount: number
  mtime: number
  isComplete: boolean
}

export function slugifySession(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'session'
}

export async function readDir(dirPath: string): Promise<FsEntry[]> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const result: FsEntry[] = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (e.name === 'thread.json') continue
      const fullPath = path.join(dirPath, e.name)
      let mtime = 0, size = 0
      try { const s = await fs.promises.stat(fullPath); mtime = s.mtimeMs; size = s.size } catch { /* skip */ }
      result.push({ name: e.name, path: fullPath, type: e.isDirectory() ? 'dir' : 'file', mtime, size })
    }
    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  } catch { return [] }
}

export async function listSessions(holocronRoot: string): Promise<SessionInfo[]> {
  if (!holocronRoot) return []
  const entries = await readDir(holocronRoot)
  const sessions: SessionInfo[] = []
  for (const e of entries) {
    if (e.type !== 'dir') continue
    const children = await readDir(e.path)
    const fileCount = children.filter(c => c.type === 'file').length
    const isComplete = children.some(c => c.name === '.complete')
    sessions.push({ id: slugifySession(e.name), name: e.name, path: e.path, fileCount, mtime: e.mtime, isComplete })
  }
  return sessions.sort((a, b) => b.mtime - a.mtime)
}

export async function createSession(holocronRoot: string, name: string): Promise<{ ok: boolean; path: string; id: string }> {
  const sessionPath = path.join(holocronRoot, name)
  await fs.promises.mkdir(sessionPath, { recursive: true })
  return { ok: true, path: sessionPath, id: slugifySession(name) }
}

export async function createFile(dirPath: string, name: string): Promise<{ ok: boolean; filePath: string }> {
  const filePath = path.join(dirPath, name)
  await fs.promises.writeFile(filePath, '', 'utf-8')
  return { ok: true, filePath }
}

export async function createDir(parentPath: string, name: string): Promise<{ ok: boolean; dirPath: string }> {
  const dirPath = path.join(parentPath, name)
  await fs.promises.mkdir(dirPath, { recursive: true })
  return { ok: true, dirPath }
}

export async function renameEntry(oldPath: string, newPath: string): Promise<{ ok: boolean }> {
  await fs.promises.rename(oldPath, newPath)
  return { ok: true }
}

export async function deleteEntry(entryPath: string): Promise<{ ok: boolean }> {
  const stat = await fs.promises.stat(entryPath)
  if (stat.isDirectory()) {
    await fs.promises.rm(entryPath, { recursive: true, force: true })
  } else {
    await fs.promises.unlink(entryPath)
  }
  return { ok: true }
}

export async function moveEntry(srcPath: string, destDir: string): Promise<{ ok: boolean; newPath: string }> {
  const name = path.basename(srcPath)
  const newPath = path.join(destDir, name)
  await fs.promises.rename(srcPath, newPath)
  return { ok: true, newPath }
}

export async function copyEntry(srcPath: string, destDir: string): Promise<{ ok: boolean; newPath: string }> {
  const name = path.basename(srcPath)
  const newPath = path.join(destDir, name)
  const stat = await fs.promises.stat(srcPath)
  if (stat.isDirectory()) {
    // fs.cp handles recursive directory copy (Node 16.7+)
    await fs.promises.cp(srcPath, newPath, { recursive: true })
  } else {
    await fs.promises.copyFile(srcPath, newPath)
  }
  return { ok: true, newPath }
}

export async function completeSession(sessionPath: string): Promise<void> {
  await fs.promises.writeFile(path.join(sessionPath, '.complete'), new Date().toISOString(), 'utf-8')
}
