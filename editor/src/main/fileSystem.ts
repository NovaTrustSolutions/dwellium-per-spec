import { dialog } from 'electron'
import { readFile, writeFile, stat } from 'fs/promises'
import { extname, relative, resolve } from 'path'
import { docxToMarkdown } from './convert'
import { loadConfig } from './config'

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.pdf', '.docx'])
const approvedExternalPaths = new Set<string>()

function normalizePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') throw new Error('Invalid file path')
  return resolve(filePath)
}

function isInside(root: string, filePath: string): boolean {
  const rel = relative(root, filePath)
  return rel === '' || (!!rel && !rel.startsWith('..') && !rel.startsWith('/'))
}

function trustedRoots(): string[] {
  const cfg = loadConfig()
  return [
    cfg.holocronRoot,
    cfg.projectsRoot,
    cfg.workspace?.path,
    cfg.libraryPath,
    cfg.activeProjectPath,
    cfg.activeThreadPath,
    cfg.icloudInboxPath,
  ]
    .filter((root): root is string => !!root && root.trim().length > 0)
    .map((root) => resolve(root))
}

function isTrustedPath(filePath: string): boolean {
  const abs = normalizePath(filePath)
  return trustedRoots().some((root) => isInside(root, abs))
}

function approveExternalPath(filePath: string): void {
  approvedExternalPaths.add(normalizePath(filePath))
}

function assertSupportedExtension(filePath: string): void {
  const ext = extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file extension: ${ext || '(none)'}`)
  }
}

function assertReadablePath(filePath: string): string {
  const abs = normalizePath(filePath)
  assertSupportedExtension(abs)
  if (!isTrustedPath(abs) && !approvedExternalPaths.has(abs)) {
    throw new Error('File access denied outside the configured workspace')
  }
  return abs
}

function assertWritablePath(filePath: string): string {
  const abs = normalizePath(filePath)
  assertSupportedExtension(abs)
  if (!isTrustedPath(abs)) {
    throw new Error('File write denied outside the configured workspace')
  }
  return abs
}

export async function openFileDialog(defaultPath?: string): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    defaultPath,
    filters: [
      { name: 'Documents', extensions: ['md', 'markdown', 'txt', 'pdf', 'docx'] },
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'PDF Documents', extensions: ['pdf'] },
      { name: 'Word Documents', extensions: ['docx'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return null
  approveExternalPath(filePaths[0])
  return filePaths[0]
}

export async function readFileFromDisk(
  filePath: string
): Promise<{ content: string; filePath: string }> {
  const abs = assertReadablePath(filePath)
  const ext = extname(abs).toLowerCase()

  if (ext === '.pdf') {
    // PDFs render via pdf.js in renderer — no text content needed
    return { content: '', filePath: abs }
  }

  if (ext === '.docx') {
    const content = await docxToMarkdown(abs)
    return { content, filePath: abs }
  }

  const content = await readFile(abs, 'utf-8')
  return { content, filePath: abs }
}

export async function writeFileToDisk(
  filePath: string,
  content: string
): Promise<{ ok: boolean }> {
  const abs = assertWritablePath(filePath)
  await writeFile(abs, content, 'utf-8')
  return { ok: true }
}

export async function readFileAsBuffer(
  filePath: string
): Promise<{ base64: string; filePath: string }> {
  const abs = assertReadablePath(filePath)
  const buf = await readFile(abs)
  return { base64: buf.toString('base64'), filePath: abs }
}

export async function resolveDroppedPaths(
  paths: string[]
): Promise<{ resolvedPaths: string[] }> {
  const resolved: string[] = []
  for (const p of paths) {
    try {
      const abs = resolve(p)
      const stats = await stat(abs)
      const ext = extname(abs).toLowerCase()
      if (stats.isFile() && SUPPORTED_EXTENSIONS.has(ext)) {
        approveExternalPath(abs)
        resolved.push(abs)
      }
    } catch {
      // skip unreadable or unsupported files
    }
  }
  return { resolvedPaths: resolved }
}
