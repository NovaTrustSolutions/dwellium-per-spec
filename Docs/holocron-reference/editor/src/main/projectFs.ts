import fs from 'fs'
import path from 'path'
import { ragQuery, withRagClient } from './ragDb'
import { withRenameLock } from './workspace'
import { loadConfig, saveConfig } from './config'
import { deleteSourcelessWikiPages, deleteWikiPageBySlug } from './cleanupOps'
import { slugComponent, bootstrapMissingPages } from './ragWiki'
import {
  ActiveStateError,
  assertNotActiveProject,
  assertNotActiveThread,
  cascadeUpdateContinuedFrom,
  clearActiveIfMatchesThread,
  clearActiveIfUnderProject,
} from './orgOps'

export const THREAD_META_FILENAME = 'thread.json'

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

const DEFAULT_META: Omit<ThreadMeta, 'name' | 'projectName' | 'createdAt' | 'lastModified'> = {
  honchoSessionId: '',
  status: 'active',
  stage: 1,
  continuedFrom: null,
  inheritedContext: null,
  compressionCount: 0,
  dumpCount: 0,
  reportCount: 0,
  lastDreamQuery: null,
  intakePromptShown: false,
}

export interface ProjectInfo {
  name: string
  path: string
  threadCount: number
  lastModified: number
}

export interface ThreadInfo {
  name: string
  path: string
  fileCount: number
  lastModified: number
  isComplete: boolean
  isActive: boolean
}

async function listSubdirs(dirPath: string): Promise<Array<{ name: string; path: string; mtime: number }>> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const out: Array<{ name: string; path: string; mtime: number }> = []
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      const full = path.join(dirPath, e.name)
      let mtime = 0
      try { mtime = (await fs.promises.stat(full)).mtimeMs } catch { /* skip */ }
      out.push({ name: e.name, path: full, mtime })
    }
    return out
  } catch {
    return []
  }
}

/**
 * List projects under `projectsRoot`. Strictly nested layout only:
 *   <projectsRoot>/<DomaineName>/<ProjectName>/
 * Top-level subdirs whose name doesn't match a Domaine in rag_domaines
 * are silently ignored (leftover folders from prior layouts, stray user
 * folders, etc. — they don't belong to any Domaine).
 *
 * If `domaineId` is provided, results are filtered to that Domaine.
 */
export async function listProjects(
  projectsRoot: string,
  domaineId?: string,
): Promise<ProjectInfo[]> {
  if (!projectsRoot) return []
  const topSubs = await listSubdirs(projectsRoot)
  if (topSubs.length === 0) return []

  const dRes = await ragQuery<{ id: string; name: string }>(
    `SELECT id::text, name FROM rag_domaines`,
  )
  const domaineNameToId = new Map((dRes?.rows ?? []).map((d) => [d.name, d.id]))

  const out: ProjectInfo[] = []
  for (const top of topSubs) {
    const matchedDomaineId = domaineNameToId.get(top.name)
    if (!matchedDomaineId) continue  // not a Domaine folder — ignore
    if (domaineId !== undefined && matchedDomaineId !== domaineId) continue
    const projects = await listSubdirs(top.path)
    for (const p of projects) {
      const threads = await listSubdirs(p.path)
      out.push({ name: p.name, path: p.path, threadCount: threads.length, lastModified: p.mtime })
    }
  }
  return out.sort((a, b) => b.lastModified - a.lastModified)
}

/**
 * Create a new project folder under `projectsRoot` and seed its namespace
 * row in the DB with the requested Domaine (default General). Seeding here
 * — rather than waiting for first ingestion — means a fresh project shows
 * up immediately when the Domaines tab filters by its Domaine, even before
 * any documents land in it.
 */
export async function createProject(
  projectsRoot: string,
  name: string,
  domaineId: string,
): Promise<{ ok: boolean; path: string; error?: string }> {
  try {
    if (!projectsRoot) return { ok: false, path: '', error: 'Workspace folder not set' }
    if (!domaineId)    return { ok: false, path: '', error: 'Domaine is required (no fallback exists)' }

    // Resolve Domaine name. Refuse if Domaine doesn't exist — there is no
    // longer a fallback (General was removed in the v11 reset).
    const dRes = await ragQuery<{ name: string }>(
      `SELECT name FROM rag_domaines WHERE id = $1 LIMIT 1`,
      [domaineId],
    )
    const domaineName = dRes?.rows[0]?.name
    if (!domaineName) return { ok: false, path: '', error: 'Target Domaine not found' }

    // Layout: <projectsRoot>/<DomaineName>/<ProjectName>/
    // Domaine folder must already exist (createDomaine creates it).
    const projectPath = path.join(projectsRoot, domaineName, name)
    await fs.promises.mkdir(projectPath, { recursive: true })

    // Seed namespace row. With the v11 schema (composite UNIQUE on
    // (name, domaine_id) NULLS NOT DISTINCT), the same project name can
    // exist in multiple Domaines. ON CONFLICT scoped to the constraint.
    await ragQuery(
      `INSERT INTO rag_namespaces (name, domaine_id) VALUES ($1, $2)
       ON CONFLICT ON CONSTRAINT rag_namespaces_name_domaine_unique DO NOTHING`,
      [name, domaineId],
    ).catch((err) => console.warn('[Projects] namespace seed failed:', (err as Error).message))

    return { ok: true, path: projectPath }
  } catch (err) {
    return { ok: false, path: '', error: (err as Error).message }
  }
}

export async function listThreads(projectPath: string, activeThreadPath = ''): Promise<ThreadInfo[]> {
  if (!projectPath) return []
  const subs = await listSubdirs(projectPath)
  const out: ThreadInfo[] = []
  for (const s of subs) {
    let fileCount = 0
    let isComplete = false
    try {
      const children = await fs.promises.readdir(s.path, { withFileTypes: true })
      for (const c of children) {
        if (c.isFile() && !c.name.startsWith('.')) fileCount++
        if (c.name === '.complete') isComplete = true
      }
    } catch { /* skip */ }
    out.push({
      name: s.name,
      path: s.path,
      fileCount,
      lastModified: s.mtime,
      isComplete,
      isActive: s.path === activeThreadPath,
    })
  }
  return out.sort((a, b) => b.lastModified - a.lastModified)
}

export async function createThread(
  projectPath: string,
  name: string,
): Promise<{ ok: boolean; path: string; error?: string }> {
  try {
    if (!projectPath) return { ok: false, path: '', error: 'projectPath is empty' }
    const threadPath = path.join(projectPath, name)
    await fs.promises.mkdir(threadPath, { recursive: true })
    // System/ holds all auto-generated files for new threads (BD, Notes,
    // Comments_*.json, Memory/). Reports/ and References/ stay at thread
    // root for direct user access. Old threads have neither — their
    // existence of System/ is the discriminator for the "new thread"
    // path used by the append/write functions below.
    await fs.promises.mkdir(path.join(threadPath, 'System', 'Memory'), { recursive: true })
    const now = new Date().toISOString()
    const meta: ThreadMeta = {
      name,
      projectName: path.basename(projectPath),
      createdAt: now,
      lastModified: now,
      ...DEFAULT_META,
    }
    await writeThreadMeta(threadPath, meta)
    return { ok: true, path: threadPath }
  } catch (err) {
    return { ok: false, path: '', error: (err as Error).message }
  }
}

export async function completeThread(threadPath: string): Promise<void> {
  await fs.promises.writeFile(path.join(threadPath, '.complete'), new Date().toISOString(), 'utf-8')
  await updateThreadMeta(threadPath, { status: 'complete' }).catch(() => { /* meta optional */ })
}

// ── Metadata helpers ──────────────────────────────────────────────────────

export async function readThreadMeta(threadPath: string): Promise<ThreadMeta | null> {
  try {
    const raw = await fs.promises.readFile(path.join(threadPath, THREAD_META_FILENAME), 'utf-8')
    return JSON.parse(raw) as ThreadMeta
  } catch {
    return null
  }
}

export async function writeThreadMeta(threadPath: string, meta: ThreadMeta): Promise<void> {
  await fs.promises.writeFile(
    path.join(threadPath, THREAD_META_FILENAME),
    JSON.stringify(meta, null, 2),
    'utf-8',
  )
}

export async function updateThreadMeta(threadPath: string, partial: Partial<ThreadMeta>): Promise<ThreadMeta | null> {
  const current = await readThreadMeta(threadPath)
  if (!current) return null
  const next: ThreadMeta = { ...current, ...partial }
  await writeThreadMeta(threadPath, next)
  return next
}

/**
 * Copy each picked file into the thread root. Session 7 fix #1 dropped the
 * `References/` subfolder — files now land directly in `<threadPath>/<name>`.
 * Existing References/ folders on disk are unaffected; they just stop being
 * created. Files at the thread root still classify as `source_type='reference'`
 * via the default branch of `detectSourceType` (path-position rule).
 */
export async function addReferencesToThread(
  threadPath: string,
  filePaths: string[],
): Promise<{ ok: boolean; copied: string[]; skipped: string[]; error?: string }> {
  if (!threadPath) return { ok: false, copied: [], skipped: [], error: 'threadPath empty' }
  if (filePaths.length === 0) return { ok: true, copied: [], skipped: [] }
  try {
    await fs.promises.mkdir(threadPath, { recursive: true })
    const copied: string[] = []
    const skipped: string[] = []
    for (const src of filePaths) {
      const name = path.basename(src)
      const dest = path.join(threadPath, name)
      try {
        await fs.promises.copyFile(src, dest)
        copied.push(name)
        console.log(`[Intake] Reference copied: ${name} → ${threadPath}`)
      } catch (err) {
        skipped.push(name)
        console.error(`[Intake] copy failed for ${name}:`, (err as Error).message)
      }
    }
    return { ok: true, copied, skipped }
  } catch (err) {
    return { ok: false, copied: [], skipped: [], error: (err as Error).message }
  }
}

/**
 * Read the thread's metadata; if no Honcho session is bound yet, create one
 * and persist the ID back. Returns the bound session ID.
 *
 * Pre-existing threads (created before thread.json existed) get a fresh
 * meta written here so they pick up the new model on first load.
 */
export async function bindThreadHoncho(
  threadPath: string,
  threadName: string,
  projectName: string,
  createSession: (sessionId: string) => Promise<string>,
): Promise<{ honchoSessionId: string; meta: ThreadMeta }> {
  let meta = await readThreadMeta(threadPath)
  if (!meta) {
    const now = new Date().toISOString()
    meta = {
      name: threadName,
      projectName,
      createdAt: now,
      lastModified: now,
      ...DEFAULT_META,
    }
  }

  if (!meta.honchoSessionId) {
    const candidate = `${slugForHoncho(projectName)}-${slugForHoncho(threadName)}`
    const created = await createSession(candidate)
    meta.honchoSessionId = created
  }

  await writeThreadMeta(threadPath, meta)
  return { honchoSessionId: meta.honchoSessionId, meta }
}

function slugForHoncho(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'thread'
}

// ── Memory file (per-thread durable summary archive) ──────────────────────
// Lives at <thread>/Memory/Memory_<Project>_<Thread>.json. Each entry archives
// what was in the chat at the time of a Reset (or Branch). On thread load the
// summaries[] is read back into sessionSummaries so the agent retains the gist
// across sessions, even if the Honcho session was rotated.

export interface MemorySummary {
  timestamp: string
  trigger: 'reset' | 'branch' | 'compression'
  honchoSessionId: string
  summary: string
}

export interface MemoryFile {
  threadName: string
  projectName: string
  honchoSessionId: string
  lastCompressed: string | null
  compressionCount: number
  summaries: MemorySummary[]
  dreamInsights: Array<{ queriedAt: string; trigger: string; insight: string }>
  keyFacts: Array<unknown>
  /** Hive synthesis-readiness flag. Flips true once the thread has
   *  accumulated enough memory artifacts to be worth synthesizing into the
   *  Codex (3+ summaries OR 3+ dream insights). Once true, stays true —
   *  the Hive Session 3 consumer reads this to decorate the thread with a
   *  "ready to admit" badge. Optional in the type for backwards compat:
   *  older memory files written without this field read as `undefined`
   *  → treated as `false`. */
  synthesisReady?: boolean
}

/**
 * Threshold rule for `synthesisReady` — single source of truth.
 * Used by `appendMemorySummary` and `appendDreamInsight` so both writers
 * compute the flag the same way.
 */
function computeSynthesisReady(doc: { summaries: unknown[]; dreamInsights: unknown[] }): boolean {
  return (doc.summaries?.length ?? 0) >= 3 || (doc.dreamInsights?.length ?? 0) >= 3
}

/**
 * Detect whether a thread uses the new System/-scoped layout (created
 * 2026-05-08). New threads get a System/ folder at creation; old threads
 * don't. Existence of `<threadPath>/System` is the canonical discriminator
 * — we never auto-create it for old threads (see commit message).
 */
function hasSystemFolder(threadPath: string): boolean {
  try {
    return fs.statSync(path.join(threadPath, 'System')).isDirectory()
  } catch {
    return false
  }
}

function memoryDirAndPath(threadPath: string, projectName: string, threadName: string): { dir: string; file: string } {
  const dir = hasSystemFolder(threadPath)
    ? path.join(threadPath, 'System', 'Memory')
    : path.join(threadPath, 'Memory')
  const file = path.join(dir, memoryFilename(projectName, threadName))
  return { dir, file }
}

async function readMemoryFile(threadPath: string, projectName: string, threadName: string): Promise<MemoryFile | null> {
  // Try the canonical (System-aware) path first.
  const primary = memoryDirAndPath(threadPath, projectName, threadName).file
  try {
    const raw = await fs.promises.readFile(primary, 'utf-8')
    return JSON.parse(raw) as MemoryFile
  } catch { /* fall through */ }
  // Legacy fallback: old threads with System/ but a stray Memory/ at root,
  // or new threads where someone moved the file. Last resort.
  const legacy = path.join(threadPath, 'Memory', memoryFilename(projectName, threadName))
  if (legacy === primary) return null
  try {
    const raw = await fs.promises.readFile(legacy, 'utf-8')
    return JSON.parse(raw) as MemoryFile
  } catch { return null }
}

async function writeMemoryFile(threadPath: string, projectName: string, threadName: string, doc: MemoryFile): Promise<void> {
  const { dir, file } = memoryDirAndPath(threadPath, projectName, threadName)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.writeFile(file, JSON.stringify(doc, null, 2), 'utf-8')
}

export async function appendMemorySummary(
  threadPath: string,
  projectName: string,
  threadName: string,
  entry: MemorySummary,
): Promise<void> {
  let doc = await readMemoryFile(threadPath, projectName, threadName)
  if (!doc) {
    doc = {
      threadName,
      projectName,
      honchoSessionId: entry.honchoSessionId,
      lastCompressed: null,
      compressionCount: 0,
      summaries: [],
      dreamInsights: [],
      keyFacts: [],
    }
  }
  // Append (NEVER overwrite) — accumulated summaries live on disk.
  doc.summaries.push(entry)
  doc.lastCompressed = entry.timestamp
  doc.compressionCount = doc.summaries.length
  doc.honchoSessionId = entry.honchoSessionId
  // Sticky synthesisReady — once true, never falls back to false.
  doc.synthesisReady = doc.synthesisReady || computeSynthesisReady(doc)
  await writeMemoryFile(threadPath, projectName, threadName, doc)
}

export async function readMemorySummaries(
  threadPath: string,
  projectName: string,
  threadName: string,
): Promise<MemorySummary[]> {
  const doc = await readMemoryFile(threadPath, projectName, threadName)
  return doc?.summaries ?? []
}

/**
 * Read the full memory file (summaries + dreamInsights + counts) so the
 * Memory inspection panel can render all of it. Returns null when no file
 * exists yet (a brand-new thread that hasn't compressed or branched).
 */
export async function readFullMemoryFile(
  threadPath: string,
  projectName: string,
  threadName: string,
): Promise<MemoryFile | null> {
  return await readMemoryFile(threadPath, projectName, threadName)
}

/**
 * Resolve the absolute path the Memory file lives at for a thread. The
 * file may not exist yet — this just returns where it would be written.
 * Honours the System/-aware layout discriminator so callers don't have
 * to duplicate the legacy-vs-new resolution.
 */
export function memoryFilePathFor(threadPath: string, projectName: string, threadName: string): string {
  return memoryDirAndPath(threadPath, projectName, threadName).file
}

/**
 * Append a Dreaming Agent insight to the Memory file's `dreamInsights[]`
 * per DATA_MODEL §2.6. Creates the file if it doesn't exist yet (mirrors
 * `appendMemorySummary`). Updates `thread.json.lastDreamQuery` so callers
 * can dedupe (e.g. once-per-app-launch per thread).
 */
export async function appendDreamInsight(
  threadPath: string,
  projectName: string,
  threadName: string,
  entry: { queriedAt: string; trigger: string; insight: string },
): Promise<void> {
  let doc = await readMemoryFile(threadPath, projectName, threadName)
  if (!doc) {
    doc = {
      threadName,
      projectName,
      honchoSessionId: '',
      lastCompressed: null,
      compressionCount: 0,
      summaries: [],
      dreamInsights: [],
      keyFacts: [],
    }
  }
  if (!Array.isArray(doc.dreamInsights)) doc.dreamInsights = []
  doc.dreamInsights.push(entry)
  // Sticky synthesisReady — once true, never falls back.
  doc.synthesisReady = doc.synthesisReady || computeSynthesisReady(doc)
  await writeMemoryFile(threadPath, projectName, threadName, doc)

  // Update thread.json.lastDreamQuery so the renderer can dedupe queries.
  await updateThreadMeta(threadPath, { lastDreamQuery: entry.queriedAt }).catch(() => { /* non-fatal */ })
}

// ── Reset Context ─────────────────────────────────────────────────────────

/**
 * In-place reset of the active thread's chat context. The current session's
 * Honcho summary is folded into thread.json's `inheritedContext`; the thread
 * is rebound to a fresh Honcho session so future loads don't replay raw
 * turns. The old session is preserved on the Honcho server (memory not lost,
 * just no longer in the chat replay path).
 *
 * Use this when prior turns are biasing the model (e.g. redline-saturated
 * history dragging clarifying questions back into REDLINE responses) but you
 * don't want to lose what the conversation was actually about.
 */
export async function resetThreadContext(
  threadPath: string,
  threadName: string,
  projectName: string,
  summary: string | null,
  createSession: (sessionId: string) => Promise<string>,
): Promise<{ ok: boolean; newSessionId: string; oldSessionId: string; error?: string }> {
  try {
    let meta = await readThreadMeta(threadPath)
    if (!meta) {
      const now = new Date().toISOString()
      meta = {
        name: threadName,
        projectName,
        createdAt: now,
        lastModified: now,
        ...DEFAULT_META,
      }
    }
    const oldSessionId = meta.honchoSessionId

    const counter = (meta.compressionCount ?? 0) + 1
    const candidate = `${slugForHoncho(projectName)}-${slugForHoncho(threadName)}-r${counter}`
    const newSessionId = await createSession(candidate)

    const now = new Date()
    const stamp = formatStamp(now)
    let nextInherited = meta.inheritedContext ?? ''
    if (summary && summary.trim()) {
      const block = `[Context summary preserved at reset on ${stamp}]\n${summary.trim()}`
      nextInherited = nextInherited ? `${nextInherited}\n\n${block}` : block
    }

    meta.honchoSessionId = newSessionId
    meta.inheritedContext = nextInherited || null
    meta.compressionCount = counter
    meta.lastModified = now.toISOString()
    await writeThreadMeta(threadPath, meta)

    return { ok: true, newSessionId, oldSessionId }
  } catch (err) {
    return { ok: false, newSessionId: '', oldSessionId: '', error: (err as Error).message }
  }
}

// ── Branching ─────────────────────────────────────────────────────────────

export interface BranchInheritance {
  predecessorName: string
  predecessorPath: string
  predecessorHonchoSessionId: string
  predecessorCompressionCount: number
  summary: string | null
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  dreamInsight: string | null
}

/**
 * Create a branched thread inside the same project. Writes thread.json with
 * `continuedFrom` populated, persists the inherited context as a string in
 * `inheritedContext`, and writes a Memory file under memory/ with the
 * dreamInsights placeholder per DATA_MODEL §2.6.
 */
export async function branchThread(
  projectPath: string,
  newThreadName: string,
  inheritance: BranchInheritance,
): Promise<{ ok: boolean; path: string; error?: string }> {
  try {
    const threadPath = path.join(projectPath, newThreadName)
    await fs.promises.mkdir(threadPath, { recursive: true })

    const now = new Date().toISOString()
    const inheritedContext = formatInheritanceForPrompt(inheritance)
    const meta: ThreadMeta = {
      name: newThreadName,
      projectName: path.basename(projectPath),
      createdAt: now,
      lastModified: now,
      ...DEFAULT_META,
      continuedFrom: {
        threadName: inheritance.predecessorName,
        threadPath: inheritance.predecessorPath,
        honchoSessionId: inheritance.predecessorHonchoSessionId,
        branchedAt: now,
        compressionCountAtBranch: inheritance.predecessorCompressionCount,
      },
      inheritedContext,
      lastDreamQuery: inheritance.dreamInsight ? now : null,
    }
    await writeThreadMeta(threadPath, meta)

    // Memory file: per DATA_MODEL §2.6 — created on first compression OR branch.
    const memoryDir = path.join(threadPath, 'Memory')
    await fs.promises.mkdir(memoryDir, { recursive: true })
    const memoryFile = path.join(memoryDir, memoryFilename(meta.projectName, newThreadName))
    const memoryDoc = {
      threadName: newThreadName,
      projectName: meta.projectName,
      honchoSessionId: '', // populated by bind on first load
      lastCompressed: null,
      compressionCount: 0,
      summaries: [] as Array<unknown>,
      dreamInsights: inheritance.dreamInsight
        ? [{
            queriedAt: now,
            trigger: 'branch',
            insight: inheritance.dreamInsight,
          }]
        : [],
      keyFacts: [] as Array<unknown>,
    }
    await fs.promises.writeFile(memoryFile, JSON.stringify(memoryDoc, null, 2), 'utf-8')

    return { ok: true, path: threadPath }
  } catch (err) {
    return { ok: false, path: '', error: (err as Error).message }
  }
}

function safeNamePart(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 20)
}

function memoryFilename(projectName: string, threadName: string): string {
  return `Memory_${safeNamePart(projectName)}_${safeNamePart(threadName)}.json`
}

export function brainDumpFilename(projectName: string, threadName: string): string {
  return `BD_${safeNamePart(projectName)}_${safeNamePart(threadName)}.md`
}

/**
 * Single source of truth for Brain Dump timestamps. Format:
 *   MM-DD-YYYY HH:MM AM/PM   (12-hour clock, locale-independent)
 * Used for the BD file's Created header, every Submitted line, and the
 * compact chat link displayed in the chat panel.
 */
function formatStamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const hours24 = d.getHours()
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24
  const ampm = hours24 < 12 ? 'AM' : 'PM'
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()} ${pad(hours12)}:${pad(d.getMinutes())} ${ampm}`
}

/**
 * Append a Brain Dump prompt block to BD_[Project]_[Thread].md per DATA_MODEL §2.3.
 * Creates the file with its header on first use. Increments thread.json dumpCount
 * and lastModified. Returns the new prompt number + the formatted timestamp.
 */
export async function appendBrainDumpPrompt(
  threadPath: string,
  projectName: string,
  threadName: string,
  content: string,
): Promise<{ ok: boolean; filePath: string; promptNumber: number; timestamp: string; headingText: string; error?: string }> {
  try {
    if (!threadPath) return { ok: false, filePath: '', promptNumber: 0, timestamp: '', headingText: '', error: 'threadPath empty' }

    const filename = brainDumpFilename(projectName, threadName)
    // New threads (have System/) → System/BD_*.md. Old threads → root.
    const targetDir = hasSystemFolder(threadPath) ? path.join(threadPath, 'System') : threadPath
    const filePath = path.join(targetDir, filename)
    const now = new Date()
    const timestamp = formatStamp(now)

    // Read meta to determine prompt number; default to 0 → new prompt is 1.
    let meta = await readThreadMeta(threadPath)
    if (!meta) {
      meta = {
        name: threadName,
        projectName,
        createdAt: now.toISOString(),
        lastModified: now.toISOString(),
        ...DEFAULT_META,
      }
    }
    const promptNumber = (meta.dumpCount ?? 0) + 1
    const headingText = `# Prompt ${promptNumber}`

    // Create header on first dump.
    let exists = false
    try { await fs.promises.stat(filePath); exists = true } catch { /* not present */ }
    if (!exists) {
      const header = `# Brain Dump — ${projectName} / ${threadName}\n*Created: ${timestamp}*\n\n---\n`
      await fs.promises.writeFile(filePath, header, 'utf-8')
    }

    const block = `\n\n${headingText}\n${content}\n\n*Submitted: ${timestamp}*\n\n---\n`
    await fs.promises.appendFile(filePath, block, 'utf-8')

    meta.dumpCount = promptNumber
    meta.lastModified = now.toISOString()
    await writeThreadMeta(threadPath, meta)

    return { ok: true, filePath, promptNumber, timestamp, headingText }
  } catch (err) {
    return { ok: false, filePath: '', promptNumber: 0, timestamp: '', headingText: '', error: (err as Error).message }
  }
}

export function notesFilename(projectName: string, threadName: string): string {
  return `Notes_${safeNamePart(projectName)}_${safeNamePart(threadName)}.md`
}

/**
 * Append a saved-from-chat note to Notes_[Project]_[Thread].md (P6).
 * Auto-creates the file with a header on first save. Each save appends a
 * timestamped section with the full agent response. Never overwrites.
 */
export async function appendNote(
  threadPath: string,
  projectName: string,
  threadName: string,
  content: string,
): Promise<{ ok: boolean; filePath: string; timestamp: string; createdFile: boolean; error?: string }> {
  try {
    if (!threadPath) return { ok: false, filePath: '', timestamp: '', createdFile: false, error: 'threadPath empty' }

    const filename = notesFilename(projectName, threadName)
    // New threads (have System/) → System/Notes_*.md. Old threads → root.
    const targetDir = hasSystemFolder(threadPath) ? path.join(threadPath, 'System') : threadPath
    const filePath = path.join(targetDir, filename)
    const now = new Date()
    const timestamp = formatStamp(now)

    let createdFile = false
    let exists = false
    try { await fs.promises.stat(filePath); exists = true } catch { /* not present */ }
    if (!exists) {
      const header = `# Notes — ${projectName} / ${threadName}\n*Started: ${timestamp}*\n\n---\n`
      await fs.promises.writeFile(filePath, header, 'utf-8')
      createdFile = true
    }

    const block = `\n\n## Note — ${timestamp}\n${content}\n\n---\n`
    await fs.promises.appendFile(filePath, block, 'utf-8')

    // Touch lastModified on the thread for sidebar / sort behavior.
    const meta = await readThreadMeta(threadPath)
    if (meta) {
      meta.lastModified = now.toISOString()
      await writeThreadMeta(threadPath, meta)
    }

    return { ok: true, filePath, timestamp, createdFile }
  } catch (err) {
    return { ok: false, filePath: '', timestamp: '', createdFile: false, error: (err as Error).message }
  }
}

function formatInheritanceForPrompt(i: BranchInheritance): string {
  const parts: string[] = []
  parts.push(`--- Branched from: ${i.predecessorName} ---`)
  if (i.summary) {
    parts.push(`Honcho Summary: ${i.summary}`)
  }
  if (i.dreamInsight) {
    parts.push(`Key Insights from Dreaming Agent: ${i.dreamInsight}`)
  }
  if (i.recentMessages.length > 0) {
    parts.push(`Last ${i.recentMessages.length} messages:`)
    for (const m of i.recentMessages) {
      const tag = m.role === 'assistant' ? 'Assistant' : 'User'
      parts.push(`[${tag}] ${m.content}`)
    }
  }
  parts.push(`--- End of inherited context ---`)
  return parts.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────
// Project / Thread mutations (rename / move / purge)
//
// Two-operation model:
//   REORGANIZE — rename + move (filesystem + DB updates, branch cascade,
//                memory file rename, watcher pause)
//   PURGE      — irreversible deletion (folder + DB rows + orphan sweep)
//
// Active-state guards refuse the operation if the active thread is involved.
// All filesystem mutations run inside `withRenameLock` so chokidar drops
// the storm of unlink+add events that fs.rename triggers.
// ─────────────────────────────────────────────────────────────────────────

function isValidOrgName(name: string): { ok: boolean; error?: string } {
  if (!name || name.trim() !== name) return { ok: false, error: 'Name cannot be empty or have leading/trailing whitespace' }
  if (name.startsWith('.')) return { ok: false, error: 'Name cannot start with a dot' }
  if (/[/\\:*?"<>|]/.test(name)) return { ok: false, error: 'Name contains invalid characters' }
  if (name === '.' || name === '..') return { ok: false, error: 'Reserved name' }
  if (name.length > 200) return { ok: false, error: 'Name too long (>200 chars)' }
  return { ok: true }
}

function mapErrToResult<T extends { ok: boolean; error?: string }>(err: unknown, base: T): T {
  const message = err instanceof Error ? err.message : String(err)
  return { ...base, ok: false, error: message }
}

/** Rename Memory_<oldProj>_<thread>.json → Memory_<newProj>_<thread>.json
 *  in whichever Memory dir variant exists (System/Memory/ or Memory/).
 *  Best-effort: missing files are silently ignored (a thread may have
 *  never compressed and have no memory file yet). */
async function renameThreadMemoryFile(
  threadPath: string,
  oldProjectName: string, oldThreadName: string,
  newProjectName: string, newThreadName: string,
): Promise<void> {
  const oldFile = memoryFilename(oldProjectName, oldThreadName)
  const newFile = memoryFilename(newProjectName, newThreadName)
  if (oldFile === newFile) return  // sanitize collision — no rename needed
  const candidates = [
    path.join(threadPath, 'System', 'Memory'),
    path.join(threadPath, 'Memory'),
  ]
  for (const dir of candidates) {
    const oldPath = path.join(dir, oldFile)
    const newPath = path.join(dir, newFile)
    try {
      await fs.promises.rename(oldPath, newPath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[projectFs] memory rename failed:', oldPath, '→', newPath, (err as Error).message)
      }
    }
  }
}

// ── Project mutations ─────────────────────────────────────────────────────

export interface ProjectPurgeSummary {
  threadCount:   number
  documentCount: number
}

/**
 * Summary fetch for the Purge modal. Path-based so it works under nested
 * layout (`<projectsRoot>/<DomaineName>/<ProjectName>/`); document count
 * filters by source_path prefix, which is universally unique even when the
 * same project name exists in another Domaine.
 */
export async function getProjectPurgeSummary(projectPath: string): Promise<ProjectPurgeSummary> {
  const threads = await listSubdirs(projectPath)
  const prefix = projectPath + path.sep
  const docs = await ragQuery<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM rag_documents
      WHERE source_path = $1 OR source_path LIKE $2`,
    [projectPath, prefix + '%'],
  )
  return {
    threadCount:   threads.length,
    documentCount: Number(docs?.rows[0]?.cnt ?? '0'),
  }
}

/** Look up the Domaine that a project's parent dir corresponds to. Returns
 *  the Domaine id, or null if no matching row exists. */
async function resolveDomaineIdForProjectPath(projectPath: string): Promise<string | null> {
  const domaineName = path.basename(path.dirname(projectPath))
  if (!domaineName) return null
  const res = await ragQuery<{ id: string }>(
    `SELECT id::text FROM rag_domaines WHERE name = $1 LIMIT 1`,
    [domaineName],
  )
  return res?.rows[0]?.id ?? null
}

/**
 * Rename a project on disk + cascade DB updates. Takes the full nested
 * `projectPath` (`<projectsRoot>/<DomaineName>/<ProjectName>/`) rather than
 * `(projectsRoot, oldName)` because under the v11 nested layout the parent
 * dir matters. Bug 6 fix.
 */
export async function renameProject(
  projectPath: string,
  newName: string,
): Promise<{ ok: boolean; error?: string }> {
  const oldName = path.basename(projectPath)
  if (oldName === newName) return { ok: true }
  const valid = isValidOrgName(newName)
  if (!valid.ok) return { ok: false, error: valid.error }

  try {
    await assertNotActiveProject(projectPath)

    try { await fs.promises.stat(projectPath) } catch { return { ok: false, error: `Project "${oldName}" not found on disk` } }

    const parentDir    = path.dirname(projectPath)   // <projectsRoot>/<DomaineName>
    const projectsRoot = path.dirname(parentDir)     // <projectsRoot>
    const newPath      = path.join(parentDir, newName)

    let newExists = false
    try { await fs.promises.stat(newPath); newExists = true } catch { /* good */ }
    if (newExists) return { ok: false, error: `A project named "${newName}" already exists in this Domaine` }

    // The namespace row's UNIQUE is (name, domaine_id) so same name can live
    // in two Domaines. Scope updates by domaine_id rather than just name.
    const domaineId = await resolveDomaineIdForProjectPath(projectPath)

    return await withRenameLock(async () => {
      // 1. Atomic folder rename
      await fs.promises.rename(projectPath, newPath)

      // 2. Update each thread.json under the new path + rename its memory file
      const threads = await listSubdirs(newPath)
      for (const t of threads) {
        const meta = await readThreadMeta(t.path)
        if (meta) {
          meta.projectName  = newName
          meta.lastModified = new Date().toISOString()
          await writeThreadMeta(t.path, meta)
        }
        await renameThreadMemoryFile(t.path, oldName, t.name, newName, t.name)
      }

      // 3. Cascade descendants' continuedFrom.threadPath
      const oldPrefix = projectPath + path.sep
      const newPrefix = newPath + path.sep
      await cascadeUpdateContinuedFrom(projectsRoot, (cf) => {
        if (cf.threadPath === projectPath) return { ...cf, threadPath: newPath }
        if (cf.threadPath.startsWith(oldPrefix)) {
          return { ...cf, threadPath: newPrefix + cf.threadPath.slice(oldPrefix.length) }
        }
        return cf
      })

      // 4. SQL — namespace scoped by (name, domaine_id); documents scoped by
      //    source_path prefix (unique even with same-name projects across
      //    Domaines). Bug 4 fix.
      const dbResult = await withRagClient(async (client) => {
        await client.query('BEGIN')
        try {
          if (domaineId) {
            await client.query(
              `UPDATE rag_namespaces SET name = $1 WHERE name = $2 AND domaine_id = $3`,
              [newName, oldName, domaineId],
            )
          }
          await client.query(
            `UPDATE rag_documents
               SET project_name = $1,
                   source_path  = REPLACE(source_path, $2, $3)
             WHERE source_path = $4 OR source_path LIKE $5`,
            [newName, oldPrefix, newPrefix, projectPath, oldPrefix + '%'],
          )
          await client.query('COMMIT')
          return { ok: true as const }
        } catch (err) {
          await client.query('ROLLBACK').catch(() => { /* swallow */ })
          throw err
        }
      })
      if (!dbResult || !dbResult.ok) {
        console.error('[projectFs] CRITICAL: project renamed on disk but DB update failed', { oldName, newName })
        return { ok: false, error: 'Folder renamed but database update failed; manual reconciliation required' }
      }

      // 5. Active config rewrite if it pointed into the renamed project
      const cfg = loadConfig()
      let dirty = false
      if (cfg.activeProjectPath === projectPath) {
        cfg.activeProjectName = newName
        cfg.activeProjectPath = newPath
        dirty = true
      }
      if (cfg.activeThreadPath && cfg.activeThreadPath.startsWith(oldPrefix)) {
        cfg.activeThreadPath = newPrefix + cfg.activeThreadPath.slice(oldPrefix.length)
        dirty = true
      }
      if (dirty) saveConfig(cfg)

      // 6. Invalidate stale wiki pages — both the tier-2 page (slug
      // `<dn>/<oldPn>`) and EVERY tier-1 page beneath this project
      // (slug starts with `<dn>/<oldPn>/`). Slugs encode the folder
      // hierarchy, so every page under the renamed project is now
      // orphaned. Drop them + their disk files + loop-back doc rows;
      // bootstrap recompiles under the new slug + title.
      const domaineName = path.basename(parentDir)
      if (domaineName) {
        const dnSlug = slugComponent(domaineName)
        const oldPnSlug = slugComponent(oldName)
        const orphanedTier2 = `${dnSlug}/${oldPnSlug}`
        const orphanedTier1Prefix = `${orphanedTier2}/`
        try {
          // Find every tier-1 wiki under the old project name.
          const tier1 = await ragQuery<{ slug: string }>(
            `SELECT slug FROM rag_wiki_pages
              WHERE tier = 'thread' AND slug LIKE $1`,
            [orphanedTier1Prefix + '%'],
          )
          for (const row of tier1?.rows ?? []) {
            await deleteWikiPageBySlug(row.slug)
          }
          await deleteWikiPageBySlug(orphanedTier2)
        } catch (err) {
          console.warn('[renameProject] wiki invalidate failed:', (err as Error).message)
        }
        void bootstrapMissingPages().catch((err) =>
          console.warn('[renameProject] post-rename wiki bootstrap failed:', (err as Error).message),
        )
      }

      return { ok: true }
    })
  } catch (err) {
    if (err instanceof ActiveStateError) return { ok: false, error: err.message }
    return mapErrToResult(err, { ok: false, error: '' })
  }
}

export async function moveProject(
  projectName: string,
  targetDomaineId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Verify target Domaine exists
    const dom = await ragQuery<{ id: string }>(
      `SELECT id::text FROM rag_domaines WHERE id = $1`,
      [targetDomaineId],
    )
    if (!dom?.rows[0]) return { ok: false, error: 'Target Domaine not found' }

    // Verify the project's namespace row exists (created by createProject or
    // first ingestion). If missing, seed it under the target Domaine.
    const ns = await ragQuery<{ name: string }>(
      `SELECT name FROM rag_namespaces WHERE name = $1`,
      [projectName],
    )
    if (!ns?.rows[0]) {
      await ragQuery(
        `INSERT INTO rag_namespaces (name, domaine_id) VALUES ($1, $2)`,
        [projectName, targetDomaineId],
      )
      return { ok: true }
    }

    await ragQuery(
      `UPDATE rag_namespaces SET domaine_id = $1 WHERE name = $2`,
      [targetDomaineId, projectName],
    )
    return { ok: true }
  } catch (err) {
    return mapErrToResult(err, { ok: false, error: '' })
  }
}

/**
 * Purge a project (irreversible). Takes the full nested `projectPath`
 * (Bug 6 fix). SQL deletes scope by source_path prefix so a same-named
 * project in another Domaine isn't collateral-damaged (Bug 4 fix). If the
 * active thread lives inside this project, the active config is cleared
 * rather than refusing the operation (Bug 5 fix).
 */
export async function purgeProject(
  projectPath: string,
  confirmName: string,
): Promise<{ ok: boolean; deletedDocs?: number; deletedThreads?: number; error?: string }> {
  const projectName = path.basename(projectPath)
  if (confirmName !== projectName) return { ok: false, error: 'Confirmation name does not match' }

  try {
    // Bug 5: clear matching active config keys instead of refusing
    clearActiveIfUnderProject(projectPath)

    const threads     = await listSubdirs(projectPath)
    const threadCount = threads.length
    const domaineId   = await resolveDomaineIdForProjectPath(projectPath)

    return await withRenameLock(async () => {
      // 1. Wipe filesystem (irreversible)
      await fs.promises.rm(projectPath, { recursive: true, force: true })

      // 2. SQL — delete documents by source_path prefix; delete the
      //    namespace row scoped by (name, domaine_id).
      const prefix = projectPath + path.sep
      const deletedDocs = await withRagClient(async (client) => {
        await client.query('BEGIN')
        try {
          const docRes = await client.query(
            `DELETE FROM rag_documents WHERE source_path = $1 OR source_path LIKE $2`,
            [projectPath, prefix + '%'],
          )
          if (domaineId) {
            await client.query(
              `DELETE FROM rag_namespaces WHERE name = $1 AND domaine_id = $2`,
              [projectName, domaineId],
            )
          }
          await client.query('COMMIT')
          return docRes.rowCount ?? 0
        } catch (err) {
          await client.query('ROLLBACK').catch(() => { /* swallow */ })
          throw err
        }
      })

      // 3. Orphan sweep — tags + tier-aware wiki sweep via cleanupOps. The
      // wiki sweep unlinks disk files + drops corresponding rag_documents
      // rows so dead links don't accumulate (the v007 three-tier bug).
      await ragQuery(`
        DELETE FROM rag_tags
         WHERE id NOT IN (SELECT DISTINCT tag_id FROM rag_document_tags WHERE tag_id IS NOT NULL)
      `).catch((err) => console.warn('[purgeProject] orphan-tag sweep failed:', (err as Error).message))
      await deleteSourcelessWikiPages()
        .catch((err) => console.warn('[purgeProject] orphan-wiki sweep failed:', (err as Error).message))

      // TODO: Honcho session cleanup for each thread's honchoSessionId.
      // Sessions remain on Honcho server, no disk impact, no chat impact
      // (sessions are scoped per-thread). Defer to a separate cleanup pass.

      return { ok: true, deletedDocs: deletedDocs ?? 0, deletedThreads: threadCount }
    })
  } catch (err) {
    if (err instanceof ActiveStateError) return { ok: false, error: err.message }
    return mapErrToResult(err, { ok: false, error: '' })
  }
}

// ── Thread mutations ──────────────────────────────────────────────────────

export interface ThreadPurgeSummary {
  documentCount: number
}

export async function getThreadPurgeSummary(threadPath: string): Promise<ThreadPurgeSummary> {
  const prefix = threadPath + path.sep
  const docs = await ragQuery<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM rag_documents
      WHERE source_path = $1 OR source_path LIKE $2`,
    [threadPath, prefix + '%'],
  )
  return { documentCount: Number(docs?.rows[0]?.cnt ?? '0') }
}

/**
 * Result shape carries the resolved new path/name so the renderer can
 * remap any state that holds the old path (open editor tabs, active
 * config, sidebar selection). Session 10 widened this from `{ ok }` to
 * include `newPath` + `newName` for the active-thread rename path —
 * inactive renames return the same fields for symmetry.
 */
export interface RenameThreadResult {
  ok:        boolean
  error?:    string
  newPath?:  string
  newName?:  string
  /** Set when the renamed thread was the active thread at the moment of
   *  rename. The renderer uses this to gate scribeStore remapping +
   *  config re-hydration so a Domaines-tab rename of an inactive thread
   *  doesn't redundantly poke the active state. */
  wasActive?: boolean
}

export async function renameThread(
  projectPath: string,
  oldName: string,
  newName: string,
): Promise<RenameThreadResult> {
  if (oldName === newName) return { ok: true, newPath: path.join(projectPath, newName), newName }
  const valid = isValidOrgName(newName)
  if (!valid.ok) return { ok: false, error: valid.error }

  const oldPath = path.join(projectPath, oldName)
  const newPath = path.join(projectPath, newName)

  try {
    // Session 10 — the pre-Session-10 hard guard via assertNotActiveThread()
    // is gone. The withRenameLock + wikilink-writeback guards
    // (ragIngest.ts:710 fs.stat + is_active=true OR) make the rename safe
    // even with an active thread; what was missing was the renderer-side
    // state sync. We detect the active case here so we can update the
    // persisted config inside the lock, and signal `wasActive` back to
    // the renderer so it can remap scribeStore.openFiles / activeFilePath.
    const cfgBeforeRename = loadConfig()
    const wasActive = cfgBeforeRename.activeThreadPath === oldPath

    try { await fs.promises.stat(oldPath) } catch { return { ok: false, error: `Thread "${oldName}" not found on disk` } }
    let newExists = false
    try { await fs.promises.stat(newPath); newExists = true } catch { /* good */ }
    if (newExists) return { ok: false, error: `A thread named "${newName}" already exists in this project` }

    const projectName = path.basename(projectPath)
    const projectsRoot = path.dirname(projectPath)

    return await withRenameLock(async () => {
      // 1. Atomic folder rename
      await fs.promises.rename(oldPath, newPath)

      // 2. Update thread.json
      const meta = await readThreadMeta(newPath)
      if (meta) {
        meta.name         = newName
        meta.lastModified = new Date().toISOString()
        await writeThreadMeta(newPath, meta)
      }

      // 3. Rename memory file
      await renameThreadMemoryFile(newPath, projectName, oldName, projectName, newName)

      // 4. Cascade descendants (any thread anywhere whose continuedFrom
      //    pointed at oldPath OR carried oldName in threadName).
      await cascadeUpdateContinuedFrom(projectsRoot, (cf) => {
        if (cf.threadPath === oldPath) {
          return { ...cf, threadPath: newPath, threadName: newName }
        }
        return cf
      })

      // 5. SQL — update document rows for this thread
      await ragQuery(
        `UPDATE rag_documents
            SET thread_name = $1,
                source_path = REPLACE(source_path, $2, $3)
          WHERE project_name = $4 AND thread_name = $5`,
        [newName, oldPath + path.sep, newPath + path.sep, projectName, oldName],
      )

      // 6. Invalidate stale wiki — the tier-1 page's slug encodes the old
      // thread name (`<dn>/<pn>/<oldTn>`), so it's now orphaned. Drop it
      // + its disk file + the loop-back rag_documents row; bootstrap then
      // recompiles under the new slug + title. Fire-and-forget — the
      // rename succeeds even if the recompile times out (no Gemini key,
      // network blip, etc.). The boot-time reconcileWikiSlugs() is the
      // belt-and-suspenders for renames that happened before this hook
      // landed. Domaine name is the segment above the project folder:
      // `<projectsRoot>/<DomaineName>/<ProjectName>/<ThreadName>/`.
      const domaineName = path.basename(path.dirname(projectPath))
      if (domaineName) {
        const oldSlug = `${slugComponent(domaineName)}/${slugComponent(projectName)}/${slugComponent(oldName)}`
        try { await deleteWikiPageBySlug(oldSlug) } catch (err) {
          console.warn('[renameThread] wiki invalidate failed:', (err as Error).message)
        }
        void bootstrapMissingPages().catch((err) =>
          console.warn('[renameThread] post-rename wiki bootstrap failed:', (err as Error).message),
        )
      }

      // 7. Active-thread config sync (Session 10). Done INSIDE the lock so
      //    a competing fs/db operation can't read a half-renamed state.
      //    If the active thread carried the old path, rewrite both
      //    activeThreadPath and activeThreadName in the persisted config.
      //    The renderer separately re-hydrates from this on success.
      if (wasActive) {
        const cfg = loadConfig()
        // Re-read here rather than reusing cfgBeforeRename — a parallel
        // config write could have changed an unrelated field between the
        // pre-flight check and now; only mutate what we own.
        saveConfig({
          ...cfg,
          activeThreadPath: newPath,
          activeThreadName: newName,
        })
      }

      return { ok: true, newPath, newName, wasActive }
    })
  } catch (err) {
    if (err instanceof ActiveStateError) return { ok: false, error: err.message }
    return mapErrToResult(err, { ok: false, error: '' })
  }
}

export async function moveThread(
  srcProjectPath: string,
  threadName: string,
  targetProjectPath: string,
): Promise<{ ok: boolean; error?: string }> {
  if (srcProjectPath === targetProjectPath) return { ok: true }

  const oldPath = path.join(srcProjectPath, threadName)
  const newPath = path.join(targetProjectPath, threadName)

  try {
    await assertNotActiveThread(oldPath)

    try { await fs.promises.stat(oldPath) } catch { return { ok: false, error: `Thread "${threadName}" not found in source project` } }
    try { await fs.promises.stat(targetProjectPath) } catch { return { ok: false, error: 'Target project not found' } }
    let newExists = false
    try { await fs.promises.stat(newPath); newExists = true } catch { /* good */ }
    if (newExists) return { ok: false, error: `A thread named "${threadName}" already exists in the target project` }

    const oldProjectName = path.basename(srcProjectPath)
    const newProjectName = path.basename(targetProjectPath)
    // projectsRoot is the common parent. Refuse cross-root moves to keep
    // things simple — no current UX exposes that anyway.
    const oldRoot = path.dirname(srcProjectPath)
    const newRoot = path.dirname(targetProjectPath)
    if (oldRoot !== newRoot) return { ok: false, error: 'Cross-root project moves are not supported' }
    const projectsRoot = oldRoot

    return await withRenameLock(async () => {
      // 1. Atomic move (cross-folder rename works on same filesystem)
      await fs.promises.rename(oldPath, newPath)

      // 2. Update thread.json projectName
      const meta = await readThreadMeta(newPath)
      if (meta) {
        meta.projectName  = newProjectName
        meta.lastModified = new Date().toISOString()
        await writeThreadMeta(newPath, meta)
      }

      // 3. Memory file: project name changed → filename changes
      await renameThreadMemoryFile(newPath, oldProjectName, threadName, newProjectName, threadName)

      // 4. Cascade descendants
      await cascadeUpdateContinuedFrom(projectsRoot, (cf) => {
        if (cf.threadPath === oldPath) return { ...cf, threadPath: newPath }
        return cf
      })

      // 5. SQL — update project_name + source_path for documents in this thread
      await ragQuery(
        `UPDATE rag_documents
            SET project_name = $1,
                source_path  = REPLACE(source_path, $2, $3)
          WHERE project_name = $4 AND thread_name = $5`,
        [newProjectName, oldPath + path.sep, newPath + path.sep, oldProjectName, threadName],
      )

      return { ok: true }
    })
  } catch (err) {
    if (err instanceof ActiveStateError) return { ok: false, error: err.message }
    return mapErrToResult(err, { ok: false, error: '' })
  }
}

/** Flat thread list across every Domaine + Project under `projectsRoot`,
 *  alphabetical by `<Domaine› Project› Thread>` for the Scribe "Move to
 *  thread" picker. Each entry carries the breadcrumb so the picker can
 *  render the destination unambiguously without a second IPC.
 *
 *  `excludeThreadPath` (typically the active thread's path) is omitted —
 *  moving a doc into its own thread is a no-op, so the picker shouldn't
 *  offer it. Pass '' to include every thread. */
export async function listAllThreadsFlat(
  projectsRoot: string,
  excludeThreadPath = '',
): Promise<Array<{ threadPath: string; threadName: string; projectName: string; domaineName: string }>> {
  if (!projectsRoot) return []
  const out: Array<{ threadPath: string; threadName: string; projectName: string; domaineName: string }> = []
  const domaines = await listSubdirs(projectsRoot)
  for (const d of domaines) {
    const projects = await listSubdirs(d.path)
    for (const p of projects) {
      const threads = await listSubdirs(p.path)
      for (const t of threads) {
        if (t.path === excludeThreadPath) continue
        out.push({
          threadPath:  t.path,
          threadName:  t.name,
          projectName: p.name,
          domaineName: d.name,
        })
      }
    }
  }
  return out.sort((a, b) => {
    const c1 = a.domaineName.localeCompare(b.domaineName)
    if (c1 !== 0) return c1
    const c2 = a.projectName.localeCompare(b.projectName)
    if (c2 !== 0) return c2
    return a.threadName.localeCompare(b.threadName)
  })
}

/** Move a document file from its current location to the destination
 *  thread root. Session 7 fix #1 dropped the `References/` subfolder —
 *  files land directly in `<destThreadPath>/<basename>`. Source may live
 *  anywhere under the workspace tree (the thread root, an existing
 *  `References/` subfolder, `Notes/`, `Drafts/`, etc. — `detectSourceType`
 *  does path-position classification per the v13 gotcha line 65, and
 *  files at the thread root default to `source_type='reference'`).
 *
 *  This intentionally does NOT use `withRenameLock`: we WANT chokidar's
 *  root watcher (gotcha line 41 — there's only one) to fire `unlink(src)`
 *  + `add(dest)` so ragIngest soft-deletes the old `rag_documents` row
 *  and ingests the new one. Cost: a re-run of Gemini tag extraction, same
 *  as the existing manual workaround (user copies content into a new
 *  file + deletes the original). This function codifies that flow in one
 *  atomic operation.
 *
 *  Filename collision in the destination thread root is handled by
 *  appending ` (2)`, ` (3)`, … before the extension. */
export async function moveDocumentToThread(
  srcPath: string,
  destThreadPath: string,
): Promise<{ ok: boolean; newPath?: string; error?: string }> {
  try {
    if (!srcPath || !destThreadPath) return { ok: false, error: 'srcPath or destThreadPath empty' }

    let srcStat: fs.Stats
    try { srcStat = await fs.promises.stat(srcPath) }
    catch { return { ok: false, error: 'Source file not found on disk' } }
    if (!srcStat.isFile()) return { ok: false, error: 'Source is not a file' }

    try {
      const dstat = await fs.promises.stat(destThreadPath)
      if (!dstat.isDirectory()) return { ok: false, error: 'Destination thread path is not a directory' }
    } catch { return { ok: false, error: 'Destination thread not found on disk' } }

    // Refuse no-op: src already sits directly at destThreadPath root. Files
    // in a subfolder of destThreadPath ARE allowed to move (e.g. moving a
    // file out of an old References/ subfolder up to the thread root, or
    // out of Notes/ etc.). Session 7 fix #1 dropped the References/ branch
    // — destination is always the thread root now.
    if (path.dirname(srcPath) === destThreadPath) {
      return { ok: false, error: 'File is already in this thread' }
    }

    // Destination = thread root (no References/ subfolder). Session 7 fix #1.
    const destDir = destThreadPath
    await fs.promises.mkdir(destDir, { recursive: true })

    // Collision avoidance — try basename, then `${stem} (2)${ext}`, etc.
    const basename = path.basename(srcPath)
    const ext = path.extname(basename)
    const stem = ext ? basename.slice(0, -ext.length) : basename
    let candidate = path.join(destDir, basename)
    let n = 2
    while (true) {
      try {
        await fs.promises.stat(candidate)
        candidate = path.join(destDir, `${stem} (${n})${ext}`)
        n++
        if (n > 999) return { ok: false, error: 'Could not find a free filename in destination' }
      } catch {
        break  // free
      }
    }

    // fs.rename is atomic on a single filesystem (the common case inside an
    // iCloud-synced workspace tree). Fall back to copy+unlink on EXDEV.
    try {
      await fs.promises.rename(srcPath, candidate)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await fs.promises.copyFile(srcPath, candidate)
        await fs.promises.unlink(srcPath)
      } else {
        throw err
      }
    }
    return { ok: true, newPath: candidate }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function purgeThread(
  threadPath: string,
  confirmName: string,
): Promise<{ ok: boolean; deletedDocs?: number; error?: string }> {
  const threadName = path.basename(threadPath)
  if (confirmName !== threadName) return { ok: false, error: 'Confirmation name does not match' }

  try {
    // Bug 5: if this is the active thread, clear it from config first
    // rather than refusing — the user has typed-confirmed destruction.
    clearActiveIfMatchesThread(threadPath)

    return await withRenameLock(async () => {
      // 1. Wipe filesystem
      await fs.promises.rm(threadPath, { recursive: true, force: true })

      // 2. SQL — delete documents under this thread by source_path prefix.
      //    Prefer path-based delete over (project_name, thread_name) because
      //    path is universally unique (avoids accidentally deleting same-
      //    named threads in other projects, though that wouldn't compile
      //    here either).
      const prefix = threadPath + path.sep
      const docRes = await ragQuery<{ id: string }>(
        `DELETE FROM rag_documents
          WHERE source_path = $1 OR source_path LIKE $2
        RETURNING id::text`,
        [threadPath, prefix + '%'],
      )
      const deletedDocs = docRes?.rowCount ?? 0

      // 3. Orphan sweep — same shape as purgeProject; wiki sweep is the
      // tier-aware cleanupOps helper.
      await ragQuery(`
        DELETE FROM rag_tags
         WHERE id NOT IN (SELECT DISTINCT tag_id FROM rag_document_tags WHERE tag_id IS NOT NULL)
      `).catch((err) => console.warn('[purgeThread] orphan-tag sweep failed:', (err as Error).message))
      await deleteSourcelessWikiPages()
        .catch((err) => console.warn('[purgeThread] orphan-wiki sweep failed:', (err as Error).message))

      // TODO: Honcho session cleanup using meta.honchoSessionId. Deferred
      // for the same reasons as purgeProject.

      return { ok: true, deletedDocs }
    })
  } catch (err) {
    if (err instanceof ActiveStateError) return { ok: false, error: err.message }
    return mapErrToResult(err, { ok: false, error: '' })
  }
}

