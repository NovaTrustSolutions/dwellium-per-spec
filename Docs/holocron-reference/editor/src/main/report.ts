import fs from 'fs'
import path from 'path'
import { readThreadMeta, updateThreadMeta, type ThreadMeta } from './projectFs'

const REPORTS_DIRNAME = 'Reports'

function safeNamePart(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 20)
}

function brainDumpFilename(projectName: string, threadName: string): string {
  return `BD_${safeNamePart(projectName)}_${safeNamePart(threadName)}.md`
}

function reportBasename(prefix: string, projectName: string, threadName: string): string {
  // `<Prefix>_<Project>_<Thread>` — version suffix appended separately.
  const safePrefix = safeNamePart(prefix || 'Report')
  return `${safePrefix}_${safeNamePart(projectName)}_${safeNamePart(threadName)}`
}

/**
 * Returns the next version number to use for a report, given existing files
 * in `reports/`. v1 if no prior versions; otherwise highest + 1.
 */
async function nextVersionNumber(reportsDir: string, baseName: string): Promise<number> {
  let entries: string[] = []
  try { entries = await fs.promises.readdir(reportsDir) } catch { return 1 }
  let max = 0
  const re = new RegExp(`^${escapeRegex(baseName)}_v(\\d+)\\.md$`)
  for (const name of entries) {
    const m = name.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface LmConfig {
  baseUrl: string
  model: string
  apiKey: string
  temperature: number
  maxTokens: number
}

interface ReportArgs {
  threadPath: string
  projectName: string
  threadName: string
  namePrefix: string  // empty string → defaults to "Report"
  referenceFiles: string[]
  agentName: string
  userName: string
  lm: LmConfig
}

export interface GenerateReportResult {
  ok: boolean
  filePath: string
  versionNumber: number
  error?: string
}

/**
 * P4-A: generate a structured markdown report from the thread's BD file and
 * any open reference docs. Writes to `<thread>/Reports/<basename>_v<N>.md`,
 * mkdir-ing `reports/` on first use. Bumps thread.json reportCount.
 */
export async function generateReport(args: ReportArgs): Promise<GenerateReportResult> {
  try {
    const bdPath = path.join(args.threadPath, brainDumpFilename(args.projectName, args.threadName))
    let bdContent = ''
    try { bdContent = await fs.promises.readFile(bdPath, 'utf-8') } catch { /* allow no BD yet */ }

    // Pull each reference file's content — silently skip unreadables.
    const refSections: string[] = []
    for (const refPath of args.referenceFiles) {
      try {
        const content = await fs.promises.readFile(refPath, 'utf-8')
        const name = path.basename(refPath)
        refSections.push(`### Reference: ${name}\n\n${content}`)
      } catch { /* skip */ }
    }

    const refsBlock = refSections.length > 0
      ? `\n\n---\n\n## Reference Documents\n\n${refSections.join('\n\n---\n\n')}`
      : ''

    const systemPrompt = [
      `You are ${args.agentName}, a report writer for ${args.userName}.`,
      `Produce a single, structured markdown report based on the brain dump and reference documents below.`,
      `The report should:`,
      `- Open with a brief executive summary (3-5 bullets).`,
      `- Use clear ## section headings to organize the analysis.`,
      `- Cite reference documents inline when their content informs a point.`,
      `- End with a "Next Actions" section if directives or open questions are present.`,
      `Output only the markdown report — no preamble, no commentary, no code fences.`,
    ].join(' ')

    const userPrompt = [
      `Project: ${args.projectName}`,
      `Thread: ${args.threadName}`,
      ``,
      `## Brain Dump`,
      bdContent || '*(no brain dump content yet)*',
      refsBlock,
    ].join('\n')

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (args.lm.apiKey) headers['Authorization'] = `Bearer ${args.lm.apiKey}`

    const res = await fetch(`${args.lm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: args.lm.model,
        messages,
        temperature: args.lm.temperature,
        max_tokens: args.lm.maxTokens,
        stream: false,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, filePath: '', versionNumber: 0, error: `LM ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!content) {
      return { ok: false, filePath: '', versionNumber: 0, error: 'Empty response from LM' }
    }

    // Compute filename + write.
    const reportsDir = path.join(args.threadPath, REPORTS_DIRNAME)
    await fs.promises.mkdir(reportsDir, { recursive: true })
    const baseName = reportBasename(args.namePrefix, args.projectName, args.threadName)
    const versionNumber = await nextVersionNumber(reportsDir, baseName)
    const filePath = path.join(reportsDir, `${baseName}_v${versionNumber}.md`)
    await fs.promises.writeFile(filePath, content, 'utf-8')

    // Increment reportCount in thread.json.
    const meta = await readThreadMeta(args.threadPath)
    if (meta) {
      const next: Partial<ThreadMeta> = {
        reportCount: (meta.reportCount ?? 0) + 1,
        lastModified: new Date().toISOString(),
      }
      await updateThreadMeta(args.threadPath, next).catch(() => null)
    }

    console.log(`[Report] Generated ${path.basename(filePath)} (v${versionNumber})`)
    return { ok: true, filePath, versionNumber }
  } catch (err) {
    console.error('[Report] generateReport failed:', (err as Error).message)
    return { ok: false, filePath: '', versionNumber: 0, error: (err as Error).message }
  }
}

// ── Content-driven report write (used by Library "Use as Report Draft") ────

export interface WriteReportFromContentArgs {
  threadPath: string
  baseName: string  // typically the wiki slug, e.g. 'case-file-management'
  content: string
}

export interface WriteReportFromContentResult {
  ok: boolean
  filePath: string
  versionNumber: number
  error?: string
}

/**
 * Write `content` into <threadPath>/Reports/<baseName>_v<N>.md, where N is the
 * next free version slot. Bumps thread.json reportCount. No LLM call — used
 * when the user wants to seed a report from existing content (a wiki page,
 * a synthesis, a draft they have in hand).
 */
export async function writeReportFromContent(
  args: WriteReportFromContentArgs,
): Promise<WriteReportFromContentResult> {
  try {
    const safeBase = safeNamePart(args.baseName || 'Draft')
    const reportsDir = path.join(args.threadPath, REPORTS_DIRNAME)
    await fs.promises.mkdir(reportsDir, { recursive: true })
    const versionNumber = await nextVersionNumber(reportsDir, safeBase)
    const filePath = path.join(reportsDir, `${safeBase}_v${versionNumber}.md`)
    await fs.promises.writeFile(filePath, args.content, 'utf-8')

    const meta = await readThreadMeta(args.threadPath)
    if (meta) {
      await updateThreadMeta(args.threadPath, {
        reportCount: (meta.reportCount ?? 0) + 1,
        lastModified: new Date().toISOString(),
      }).catch(() => null)
    }
    console.log(`[Report] Draft from content: ${path.basename(filePath)} (v${versionNumber})`)
    return { ok: true, filePath, versionNumber }
  } catch (err) {
    return { ok: false, filePath: '', versionNumber: 0, error: (err as Error).message }
  }
}

// ── P4-B: Versioning ────────────────────────────────────────────────────────

const VERSION_RE = /^(.+)_v(\d+)\.md$/

export interface VersionResult {
  ok: boolean
  filePath: string
  newVersionNumber: number
  // Set when the source was un-versioned and we renamed it to `_v1.md` as
  // part of creating the first new version. Renderer uses this to update
  // any open tab pointing at the old path.
  renamedOriginal?: { from: string; to: string }
  error?: string
}

/**
 * Create the next version of an open document. If the input filename already
 * ends with `_v<N>.md`, the new file is `_v<N+1>.md`. If not (first-time
 * versioning), the source is renamed `<base>.md` → `<base>_v1.md` and the
 * new file is `<base>_v2.md` so the version chain reads cleanly (v1, v2…)
 * instead of mixing an un-suffixed original with v2+. The rename is skipped
 * if `_v1.md` already exists, to avoid clobbering existing files.
 */
export async function createNextVersion(filePath: string): Promise<VersionResult> {
  try {
    if (!filePath) return { ok: false, filePath: '', newVersionNumber: 0, error: 'no filePath' }
    if (path.extname(filePath).toLowerCase() !== '.md') {
      return { ok: false, filePath: '', newVersionNumber: 0, error: 'Versioning only supports .md files' }
    }

    const dir = path.dirname(filePath)
    const filename = path.basename(filePath)
    const content = await fs.promises.readFile(filePath, 'utf-8')

    const m = filename.match(VERSION_RE)
    const baseName = m ? m[1] : filename.replace(/\.md$/i, '')

    let renamedOriginal: { from: string; to: string } | undefined
    if (!m) {
      const v1Path = path.join(dir, `${baseName}_v1.md`)
      let v1Exists = false
      try { await fs.promises.stat(v1Path); v1Exists = true } catch { /* not present */ }
      if (!v1Exists) {
        await fs.promises.rename(filePath, v1Path)
        renamedOriginal = { from: filePath, to: v1Path }
        console.log(`[Version] Renamed original: ${filename} → ${path.basename(v1Path)}`)
      }
    }

    // Find a free version slot — guard against pre-existing higher versions
    // and pick up the just-renamed v1 if applicable.
    let entries: string[] = []
    try { entries = await fs.promises.readdir(dir) } catch { /* dir created below if needed */ }
    const re = new RegExp(`^${escapeRegex(baseName)}_v(\\d+)\\.md$`)
    let highest = 0
    for (const name of entries) {
      const x = name.match(re)
      if (x) highest = Math.max(highest, parseInt(x[1], 10))
    }
    const startN = m ? parseInt(m[2], 10) + 1 : 2
    const nextN = Math.max(startN, highest + 1)

    const newPath = path.join(dir, `${baseName}_v${nextN}.md`)
    await fs.promises.writeFile(newPath, content, 'utf-8')
    console.log(`[Version] Created: ${path.basename(newPath)}`)
    return { ok: true, filePath: newPath, newVersionNumber: nextN, renamedOriginal }
  } catch (err) {
    console.error('[Version] createNextVersion failed:', (err as Error).message)
    return { ok: false, filePath: '', newVersionNumber: 0, error: (err as Error).message }
  }
}
