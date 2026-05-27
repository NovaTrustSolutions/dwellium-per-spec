/**
 * Foundry main-process module — architecture-v4 Part 6, Session 4.
 *
 * The intake pipeline:
 *
 *   captureUrl(url)        →  Firecrawl scrape  →  foundry_items row  →  triageItem (async)
 *   captureText(text,title)→                       foundry_items row  →  triageItem (async)
 *
 * Capture is synchronous (the renderer awaits the row id so it can show
 * a "captured!" confirmation). Triage is fire-and-forget — the renderer
 * polls `foundry:list` to discover triaged items.
 *
 * Admission (Part E) writes a disk file under `_Codex/References/` or a
 * thread folder; chokidar picks it up and the existing ingestion
 * pipeline classifies + tags it. Once `processIngest` returns we link
 * the resulting `rag_documents.id` back onto the foundry_items row via
 * `admitted_doc_id` so the audit trail closes.
 */
import fs from 'fs'
import path from 'path'
import { ragQuery } from './ragDb'
import { firecrawlScrape } from './firecrawl'
import { loadConfig, getLibraryRoot } from './config'
import { chat } from './llmClient'
import { listProjects, listThreads } from './projectFs'
import { pdfToText, docxToText } from './convert'

// ── Triage Agent constants ───────────────────────────────────────────────
// Mirror ragIngest.ts's tag-extract pattern — same model, same base URL,
// same task=… for the Hive's cost-by-task accounting.
//
// No per-source-type content caps — Session 7 fix dropped the 8 KB / 24 KB
// pre-truncation. Gemini Flash has a 1 M-token context window; a typical
// document is 10–50 KB which is trivially small. URL captures still get
// stripCookieBoilerplate() applied before the prompt (cookie walls are
// pure noise), but nothing further is sliced off — Gemini sees the full
// post-strip content and decides what to keep via cleaned_content.
const TRIAGE_MODEL                = 'gemini-2.5-flash'
const TRIAGE_BASE_URL             = 'https://generativelanguage.googleapis.com/v1beta/openai'

const TRIAGE_SYSTEM =
  'You are a knowledge triage agent. Analyze the content and output a JSON object. ' +
  'Return ONLY valid JSON, no markdown, no code fences, no preamble, no explanation.'

// ── Types ────────────────────────────────────────────────────────────────

export type FoundrySourceType = 'url' | 'paste' | 'file' | 'telegram' | 'icloud'
export type FoundryTriageStatus = 'pending' | 'triaged' | 'approved' | 'rejected'
/** 'extract' = Triage Agent cleans + tags + scores; cleaned_content gets
 *  written to disk on Approve. 'convert' = tags + scores only; raw_content
 *  is preserved verbatim and written to disk. Defaults to 'extract' for
 *  URL/file captures, hard-set to 'convert' for paste captures (the user
 *  already curated that text). Stored on foundry_items.triage_mode. */
export type FoundryTriageMode = 'extract' | 'convert'

export interface FoundryItem {
  id: string
  createdAt: string
  updatedAt: string
  sourceType: FoundrySourceType
  sourceUrl: string | null
  sourceFilename: string | null
  rawContent: string
  /** Triage Agent's cleaned version of rawContent (boilerplate stripped).
   *  NULL until triage completes, when Gemini omitted the field, OR when
   *  triageMode === 'convert' (cleaning skipped by design). The Approve
   *  flow + Review preview default to this when present, falling back to
   *  rawContent. */
  cleanedContent: string | null
  triageMode: FoundryTriageMode
  triageStatus: FoundryTriageStatus
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
}

export interface CaptureResult {
  ok: boolean
  id?: string
  error?: string
}

// Wire row → camelCase domain object. Postgres returns null for empty
// arrays here because the columns default to NULL; the renderer treats
// `null` and `[]` identically for display purposes.
function rowToItem(r: {
  id: string
  created_at: string
  updated_at: string
  source_type: string
  source_url: string | null
  source_filename: string | null
  raw_content: string
  cleaned_content: string | null
  triage_mode: string
  triage_status: string
  proposed_tags: string[] | null
  proposed_domain: string | null
  quality_score: number | null
  signal_assessment: string | null
  proposed_connections: string[] | null
  triage_completed_at: string | null
  reviewed_at: string | null
  reviewer_notes: string | null
  admitted_at: string | null
  admitted_doc_id: string | null
  target_thread: string | null
}): FoundryItem {
  return {
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sourceType: r.source_type as FoundrySourceType,
    sourceUrl: r.source_url,
    sourceFilename: r.source_filename,
    rawContent: r.raw_content,
    cleanedContent: r.cleaned_content,
    triageMode: r.triage_mode as FoundryTriageMode,
    triageStatus: r.triage_status as FoundryTriageStatus,
    proposedTags: r.proposed_tags,
    proposedDomain: r.proposed_domain,
    qualityScore: r.quality_score,
    signalAssessment: r.signal_assessment,
    proposedConnections: r.proposed_connections,
    triageCompletedAt: r.triage_completed_at,
    reviewedAt: r.reviewed_at,
    reviewerNotes: r.reviewer_notes,
    admittedAt: r.admitted_at,
    admittedDocId: r.admitted_doc_id,
    targetThread: r.target_thread,
  }
}

// ── Capture surfaces ─────────────────────────────────────────────────────

/**
 * Capture from a URL via Firecrawl. Inserts a foundry_items row with the
 * scraped markdown + title and fires triage in the background.
 *
 * Common failure modes (surfaced verbatim to the renderer so the user
 * sees the actual issue, not a generic "capture failed"):
 *   - Firecrawl key missing → "Firecrawl API key not configured…"
 *   - 401 / network errors → forwarded from firecrawlScrape's `throw`
 *   - Empty markdown      → "Firecrawl returned empty markdown…"
 */
export async function captureUrl(url: string, triageMode: FoundryTriageMode = 'extract'): Promise<CaptureResult> {
  const cleaned = url.trim()
  if (!cleaned) return { ok: false, error: 'URL is required' }

  const cfg = loadConfig()
  const apiKey  = cfg.firecrawl?.apiKey ?? ''
  const baseUrl = cfg.firecrawl?.baseUrl ?? 'https://api.firecrawl.dev'
  if (!apiKey.trim()) {
    return { ok: false, error: 'Firecrawl API key not configured — Settings → Connections.' }
  }

  let scrape
  try {
    scrape = await firecrawlScrape(apiKey, baseUrl, cleaned)
  } catch (err) {
    return { ok: false, error: `Firecrawl: ${(err as Error).message}` }
  }
  if (!scrape.markdown.trim()) {
    return { ok: false, error: 'Firecrawl returned empty markdown for that URL.' }
  }

  let id: string | undefined
  try {
    const ins = await ragQuery<{ id: string }>(
      `INSERT INTO foundry_items (source_type, source_url, source_filename, raw_content, triage_mode)
       VALUES ('url', $1, $2, $3, $4)
       RETURNING id::text AS id`,
      [scrape.url, scrape.title, scrape.markdown, triageMode],
    )
    id = ins?.rows[0]?.id
  } catch (err) {
    return { ok: false, error: `DB insert failed: ${(err as Error).message}` }
  }
  if (!id) return { ok: false, error: 'DB insert returned no id' }

  // Fire triage in the background — don't block the renderer's "captured"
  // toast on Gemini latency.
  void triageItem(id).catch((err) => {
    console.warn(`[Foundry] triage failed for ${id}:`, (err as Error).message)
  })

  console.log(`[Foundry] captured URL ${cleaned} → item ${id} (${scrape.markdown.length} chars, mode=${triageMode})`)
  return { ok: true, id }
}

/**
 * Capture pasted text with a user-supplied title. Title becomes both the
 * `source_filename` (for display in the Review queue) and — when admitted
 * later — the disk-file basename. Paste captures are always 'convert'
 * mode by convention (the user already curated the text); the renderer
 * passes it explicitly but we default to 'convert' here as a safety net.
 */
export async function captureText(
  content: string,
  title: string,
  triageMode: FoundryTriageMode = 'convert',
): Promise<CaptureResult> {
  const trimmedContent = content.trim()
  const trimmedTitle   = title.trim()
  if (!trimmedContent) return { ok: false, error: 'Content is required' }
  if (!trimmedTitle)   return { ok: false, error: 'Title is required' }

  let id: string | undefined
  try {
    const ins = await ragQuery<{ id: string }>(
      `INSERT INTO foundry_items (source_type, source_filename, raw_content, triage_mode)
       VALUES ('paste', $1, $2, $3)
       RETURNING id::text AS id`,
      [trimmedTitle, trimmedContent, triageMode],
    )
    id = ins?.rows[0]?.id
  } catch (err) {
    return { ok: false, error: `DB insert failed: ${(err as Error).message}` }
  }
  if (!id) return { ok: false, error: 'DB insert returned no id' }

  void triageItem(id).catch((err) => {
    console.warn(`[Foundry] triage failed for ${id}:`, (err as Error).message)
  })

  console.log(`[Foundry] captured paste "${trimmedTitle}" → item ${id} (${trimmedContent.length} chars, mode=${triageMode})`)
  return { ok: true, id }
}

/**
 * Capture a file already decoded to a string (.txt / .md from the renderer's
 * FileReader, or `.pdf` / `.docx` after `captureFileBinary` extracted text).
 * Identical shape to captureText except source_type is 'file' so the Review
 * queue can chip-label it accurately.
 */
export async function captureFile(
  content: string,
  filename: string,
  triageMode: FoundryTriageMode = 'extract',
): Promise<CaptureResult> {
  const trimmedContent = content.trim()
  const trimmedFilename = filename.trim()
  if (!trimmedContent)  return { ok: false, error: 'File appears to be empty' }
  if (!trimmedFilename) return { ok: false, error: 'Filename is required' }

  let id: string | undefined
  try {
    const ins = await ragQuery<{ id: string }>(
      `INSERT INTO foundry_items (source_type, source_filename, raw_content, triage_mode)
       VALUES ('file', $1, $2, $3)
       RETURNING id::text AS id`,
      [trimmedFilename, trimmedContent, triageMode],
    )
    id = ins?.rows[0]?.id
  } catch (err) {
    return { ok: false, error: `DB insert failed: ${(err as Error).message}` }
  }
  if (!id) return { ok: false, error: 'DB insert returned no id' }

  void triageItem(id).catch((err) => {
    console.warn(`[Foundry] triage failed for ${id}:`, (err as Error).message)
  })

  console.log(`[Foundry] captured file "${trimmedFilename}" → item ${id} (${trimmedContent.length} chars, mode=${triageMode})`)
  return { ok: true, id }
}

/**
 * Capture a binary file by extension. The renderer ships raw bytes
 * (ArrayBuffer over IPC, materialized as `Uint8Array` on the main side).
 * We decode to text here, then delegate to `captureFile` so the same
 * triage / approve / disk pipeline applies.
 *
 *   - `.pdf`  → `pdfToText`  (pdf-parse@2)
 *   - `.docx` → `docxToText` (mammoth.extractRawText)
 *
 * Any other extension returns `{ ok: false }` — the renderer is supposed
 * to gate on extension before calling us; this is a belt-and-braces guard
 * against malformed IPC payloads (and surfaces a useful error if the
 * gating ever slips). The renderer's `captureFileBinary` plumbing routes
 * .txt/.md through the existing text `captureFile` (it already has the
 * decoded string), so this function only needs to handle binary types.
 *
 * Extraction failures (corrupt PDF, password-protected docx) are caught
 * and returned to the renderer so the user sees the actual cause inline
 * on the drop zone instead of a silent failure.
 */
export async function captureFileBinary(
  bytes: Uint8Array,
  filename: string,
  triageMode: FoundryTriageMode = 'extract',
): Promise<CaptureResult> {
  const trimmedFilename = filename.trim()
  if (!trimmedFilename) return { ok: false, error: 'Filename is required' }
  if (!bytes || bytes.byteLength === 0) return { ok: false, error: 'File appears to be empty' }

  // pdf-parse expects a Node Buffer for performance + worker compatibility;
  // mammoth.extractRawText takes a Buffer too. Wrap once to avoid two
  // allocations.
  const buf = Buffer.from(bytes)
  const ext = path.extname(trimmedFilename).toLowerCase()

  let text: string
  try {
    if (ext === '.pdf') {
      text = await pdfToText(buf)
    } else if (ext === '.docx') {
      text = await docxToText(buf)
    } else {
      return {
        ok: false,
        error: `Unsupported binary type: ${ext || '(no extension)'}. Drop .pdf or .docx; .txt/.md use the text capture path.`,
      }
    }
  } catch (err) {
    return { ok: false, error: `Extraction failed: ${(err as Error).message}` }
  }

  if (!text.trim()) {
    return { ok: false, error: `${ext.toUpperCase().slice(1)} contained no extractable text (image-only PDF or scanned doc?).` }
  }

  console.log(`[Foundry] extracted ${ext} "${trimmedFilename}" → ${text.length} chars`)
  // Reuse the text-capture path so triage/insert/admit are identical.
  return captureFile(text, trimmedFilename, triageMode)
}

// ── Triage Agent — Gemini Flash ─────────────────────────────────────────
//
// Reads the captured content, asks Gemini Flash for a 4-field JSON triage
// output, validates + persists it. Fires fire-and-forget from the capture
// path; the renderer polls `foundry:list` to discover triaged items.
//
// Two-shot retry: on parse failure, a second attempt is made with the
// same prompt (the system instruction already says "return ONLY valid
// JSON"; the retry handles transient cases where Gemini emits prose
// despite the directive). After two failures the row stays at `pending`
// — the user sees the spinner indefinitely, which is honest about the
// triage having failed.

interface TriageOutput {
  proposed_tags: string[]
  proposed_domain: string | null
  quality_score: number
  signal_assessment: string
  cleaned_content: string | null      // null when Gemini omitted / parser couldn't validate it
}

// Cookie-wall heuristic for URL scrapes. Many sites lead with a privacy
// modal whose text Firecrawl captures verbatim; if we feed that as the
// prompt's opening 8 KB, Gemini ends up classifying + cleaning the
// consent banner instead of the article. Strategy:
//   1. Find the LAST occurrence of any of these cookie phrases (case-
//      insensitive).
//   2. From there, find the next `\n## ` or `\n# ` markdown heading —
//      that's where the real article body starts.
//   3. Slice from that heading; return how many chars we skipped.
// If no cookie phrase is found, or no heading appears after it, return
// the content unchanged. URL-only — paste/file/telegram/icloud captures
// are user-authored and don't carry cookie walls.
const COOKIE_PHRASES = [
  'we value your privacy',
  'customize consent',
  'accept all',
  'cookieyes',
]

function stripCookieBoilerplate(content: string): { trimmed: string; skipped: number } {
  const lowered = content.toLowerCase()
  let lastBoilerplateEnd = -1
  for (const phrase of COOKIE_PHRASES) {
    // lastIndexOf gives the latest occurrence — important for "Accept All"
    // which can plausibly appear in article body too; we want to anchor
    // after the *last* time any cookie phrase shows up.
    const idx = lowered.lastIndexOf(phrase)
    if (idx >= 0) {
      lastBoilerplateEnd = Math.max(lastBoilerplateEnd, idx + phrase.length)
    }
  }
  if (lastBoilerplateEnd < 0) return { trimmed: content, skipped: 0 }

  // Next markdown heading after the boilerplate. Match `\n## ` or `\n# `
  // (with the trailing space so we don't catch `\n#tag` or `\n#!shebang`).
  // Take whichever comes first.
  const idxH2 = content.indexOf('\n## ', lastBoilerplateEnd)
  const idxH1 = content.indexOf('\n# ',  lastBoilerplateEnd)
  let next = -1
  if (idxH1 >= 0 && idxH2 >= 0) next = Math.min(idxH1, idxH2)
  else if (idxH1 >= 0)          next = idxH1
  else if (idxH2 >= 0)          next = idxH2

  if (next < 0) return { trimmed: content, skipped: 0 }

  // Slice past the leading newline so the trimmed content starts at the
  // `#`/`##` itself — clean start for the model.
  const articleStart = next + 1
  return { trimmed: content.slice(articleStart), skipped: articleStart }
}

/** Build the user-side triage prompt. Domain list is fetched fresh per
 *  call so newly-created Domaines are available immediately without a
 *  restart.
 *
 *  Mode shapes the prompt:
 *    'extract' — ask for tags + domain + score + signal + cleaned_content.
 *                Cleaned_content is the boilerplate-stripped rewrite that
 *                makes the agent useful beyond classification.
 *    'convert' — same metadata, NO cleaned_content. Cap output tokens
 *                tightly since no large rewrite is needed. raw_content
 *                is preserved verbatim and written to disk on Approve.
 */
function triagePrompt(
  content: string,
  domainNames: string[],
  _sourceType: FoundrySourceType,
  mode: FoundryTriageMode,
): string {
  // No content cap — Session 7 fix removed the 8 KB / 24 KB pre-truncation.
  // The full post-cookie-strip content goes into the prompt. _sourceType
  // is retained in the signature so future per-source prompt tweaks have
  // a hook without a call-site change.
  const truncated = content
  const domainList = domainNames.length > 0
    ? `[${domainNames.map((d) => `"${d}"`).join(', ')}]`
    : '[] (no domains configured yet — return null)'
  const baseFields =
    `- "proposed_tags": array of 3-7 kebab-case tags (lowercase, hyphen-separated, e.g. "case-management")\n` +
    `- "proposed_domain": string — the most relevant domain from this list: ${domainList}, or null if none fits well\n` +
    `- "quality_score": number 0.0-1.0 (0 = noise / low signal, 1 = highly relevant / actionable)\n` +
    `- "signal_assessment": one sentence describing what this is and why it's useful or not\n`
  const cleaningField = mode === 'extract'
    ? (
        `- "cleaned_content": rewrite the content keeping ONLY the core article signal. ` +
        `Remove: cookie consent text, navigation menus, advertisements, marketing copy, ` +
        `image markdown (![...](...)), "Related Articles" sections, email signup forms, ` +
        `cookie policy tables, social-share buttons, comment-section preamble, and any text ` +
        `that is not part of the main article. Preserve: article title, all substantive ` +
        `paragraphs, code blocks, headers, and lists that contain real information. ` +
        `Output clean markdown. If the content is already clean (e.g. a hand-written note), ` +
        `return it largely unchanged.\n`
      )
    : ''
  return (
    `Analyze this content and return a JSON object with EXACTLY these fields:\n` +
    baseFields +
    cleaningField +
    `\nContent to analyze:\n${truncated}\n\n` +
    `Return ONLY valid JSON, no markdown wrapper, no explanation.`
  )
}

/** Tolerant JSON-object parser. Strips fences, finds the first `{…}`
 *  block, validates field types, clamps the score to [0,1]. Returns null
 *  on any structural failure so the caller can retry. Exported for
 *  unit-test coverage (future). */
export function parseTriageResponse(s: string): TriageOutput | null {
  if (!s) return null
  let t = s.trim()
  // Strip ```json … ``` or ``` … ``` fences if Gemini wrapped despite the directive.
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  // First {...} block — handles cases where Gemini emits prose before/after.
  const m = t.match(/\{[\s\S]*\}/)
  if (!m) return null
  let parsed: unknown
  try { parsed = JSON.parse(m[0]) } catch { return null }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>

  // proposed_tags — 3-7 kebab-case strings, dedup, length-cap, drop empties.
  if (!Array.isArray(p.proposed_tags)) return null
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of p.proposed_tags) {
    if (typeof item !== 'string') continue
    const norm = item.trim().toLowerCase()
    if (!norm || seen.has(norm) || norm.length > 60) continue
    seen.add(norm)
    tags.push(norm)
    if (tags.length >= 7) break
  }
  if (tags.length === 0) return null

  // proposed_domain — string or null. We don't validate against the
  // domain list here; the renderer can show "(invalid)" if it doesn't
  // match a current Domaine, and the Edit-then-Approve path lets Andy
  // override.
  const rawDom = p.proposed_domain
  const proposed_domain = typeof rawDom === 'string' && rawDom.trim().length > 0
    ? rawDom.trim()
    : null

  // quality_score — number, clamped to [0,1]. Gemini occasionally emits
  // a percent (0..100); detect and divide.
  let score = 0
  if (typeof p.quality_score === 'number' && Number.isFinite(p.quality_score)) {
    score = p.quality_score > 1 && p.quality_score <= 100 ? p.quality_score / 100 : p.quality_score
    score = Math.max(0, Math.min(1, score))
  }

  // signal_assessment — required non-empty string; fall back if missing.
  const signal_assessment =
    typeof p.signal_assessment === 'string' && p.signal_assessment.trim().length > 0
      ? p.signal_assessment.trim().slice(0, 500)
      : 'No assessment.'

  // cleaned_content — optional, may be omitted by older prompts or
  // truncated by maxTokens. Accept any non-empty string; the Approve
  // flow falls back to raw_content if this is null.
  const cleaned_content =
    typeof p.cleaned_content === 'string' && p.cleaned_content.trim().length > 0
      ? p.cleaned_content
      : null

  return { proposed_tags: tags, proposed_domain, quality_score: score, signal_assessment, cleaned_content }
}

export async function triageItem(id: string): Promise<void> {
  // Entry-point trace so we can confirm in the *terminal* (not DevTools —
  // see gotcha.md line 19 on main-process vs. renderer consoles) whether
  // triage ever ran for a given capture. This was added after a
  // triage-not-firing investigation that turned out to be DevTools console
  // confusion; keeping the log so the next ambiguous case resolves fast.
  console.log(`[Foundry/triage] starting for item ${id}`)

  const cfg = loadConfig()
  const apiKey = cfg.gemini.apiKey
  if (!apiKey.trim()) {
    console.warn(`[Foundry/triage] Gemini API key missing — leaving item ${id} at pending`)
    return
  }

  // Load the content + source type + triage mode + the current Domain
  // list. The status='pending' guard makes triageItem safe to call twice
  // (Approve → re-triage in the future, etc.) — it short-circuits
  // silently if someone already moved the row past pending. Source type
  // drives the per-source content cap; mode drives whether we ask Gemini
  // for cleaned_content.
  const itemRes = await ragQuery<{ raw_content: string; source_type: string; triage_mode: string }>(
    `SELECT raw_content, source_type, triage_mode FROM foundry_items
      WHERE id = $1 AND triage_status = 'pending'`,
    [id],
  )
  const content = itemRes?.rows[0]?.raw_content
  const sourceType = itemRes?.rows[0]?.source_type as FoundrySourceType | undefined
  const triageMode = (itemRes?.rows[0]?.triage_mode as FoundryTriageMode | undefined) ?? 'extract'
  if (!content || !sourceType) {
    console.warn(`[Foundry/triage] item ${id} not found or already triaged — skip`)
    return
  }

  const domRes = await ragQuery<{ name: string }>(
    `SELECT name FROM rag_domaines ORDER BY position NULLS LAST, name`,
  )
  const domainNames = (domRes?.rows ?? []).map((r) => r.name)

  // Strip cookie-wall boilerplate before slicing into the prompt — only
  // for URL captures (paste/file/etc. are user-authored, no cookie walls).
  // If the heuristic doesn't fire (no known phrase, or no following
  // heading), we keep the content unchanged and Gemini handles cleanup
  // alone via its cleaned_content instruction.
  const stripped = sourceType === 'url'
    ? stripCookieBoilerplate(content)
    : { trimmed: content, skipped: 0 }
  if (stripped.skipped > 0) {
    console.log(`[Foundry/triage] skipped ${stripped.skipped} chars of boilerplate before first article heading`)
  }
  const promptContent = stripped.trimmed

  // One-shot log of what the model actually sees post-strip. Pre-Session-7
  // there was an 8 KB / 24 KB cap here; now Gemini Flash takes the full
  // content (1 M-token context window) so this log is the truth source
  // for "what did we actually send" when triage quality is debugged.
  console.log(`[Foundry/triage] sending ${promptContent.length} chars to Gemini (mode=${triageMode})`)

  let parsed: TriageOutput | null = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await chat({
      provider: 'gemini',
      model: TRIAGE_MODEL,
      apiKey,
      baseUrl: TRIAGE_BASE_URL,
      messages: [
        { role: 'system', content: TRIAGE_SYSTEM },
        { role: 'user',   content: triagePrompt(promptContent, domainNames, sourceType, triageMode) },
      ],
      temperature: 0.2,
      // 'extract' needs headroom for the full cleaned_content rewrite.
      // Session 7 bump 8192 → 16384: now that we send the full document
      // (no pre-truncation cap), the cleaned rewrite can be proportionally
      // larger — a 30 KB article cleans to ~10-15 KB ≈ 5-8 K output tokens
      // plus Gemini's thinking-token budget + JSON wrapper.
      // 'convert' still only needs the 4 metadata fields — 1024 cap is
      // plenty and saves Gemini latency / token spend on every paste/file
      // capture that doesn't need cleaning.
      maxTokens: triageMode === 'extract' ? 16384 : 1024,
      stream: false,
      task: 'foundry-triage',
    })
    if (res.error) {
      console.warn(`[Foundry/triage] item ${id} attempt ${attempt} chat error: ${res.error}`)
      continue
    }
    parsed = parseTriageResponse(res.content)
    if (parsed) break
    console.warn(
      `[Foundry/triage] item ${id} attempt ${attempt} parse failed — Gemini response preview: ` +
      JSON.stringify((res.content ?? '').slice(0, 250)),
    )
  }

  if (!parsed) {
    console.warn(`[Foundry/triage] item ${id} triage failed after 2 attempts — leaving at pending`)
    return
  }

  // In 'convert' mode we never want cleaned_content stored, even if
  // Gemini went off-script and returned it anyway. Force NULL.
  const finalCleaned = triageMode === 'convert' ? null : parsed.cleaned_content

  try {
    await ragQuery(
      `UPDATE foundry_items SET
         triage_status        = 'triaged',
         proposed_tags        = $1,
         proposed_domain      = $2,
         quality_score        = $3,
         signal_assessment    = $4,
         cleaned_content      = $5,
         triage_completed_at  = NOW()
       WHERE id = $6`,
      [
        parsed.proposed_tags,
        parsed.proposed_domain,
        parsed.quality_score,
        parsed.signal_assessment,
        finalCleaned,
        id,
      ],
    )
    console.log(
      `[Foundry/triage] item ${id} triaged (mode=${triageMode}, ` +
      `${parsed.proposed_tags.length} tags, domain=${parsed.proposed_domain ?? 'none'}, ` +
      `q=${parsed.quality_score.toFixed(2)}, ` +
      `cleaned=${finalCleaned ? `${finalCleaned.length} chars` : 'none'})`,
    )
  } catch (err) {
    console.warn(`[Foundry/triage] item ${id} DB update failed:`, (err as Error).message)
  }
}

// ── Review queue list/get ───────────────────────────────────────────────
//
// Part E consumes these; staging here so Part C's verify gate exercises
// the same query path. Returns rows in the canonical newest-first order.

// ── Approve dialog: thread list ──────────────────────────────────────────
//
// Flat list of every (projectName, threadName, threadPath) under the
// active projectsRoot. The Approve dropdown shows "<project> / <thread>"
// so Andy can pick the destination without drilling. listProjects walks
// every Domaine; listThreads walks one project — composing them gives
// the flat list. Sorted by last-modified, newest first.

export interface FoundryThreadTarget {
  projectName: string
  threadName: string
  threadPath: string
  lastModified: number
}

export async function listTargetThreads(): Promise<FoundryThreadTarget[]> {
  const cfg = loadConfig()
  const projectsRoot = cfg.projectsRoot || cfg.holocronRoot || cfg.workspace?.path || ''
  if (!projectsRoot) return []

  const projects = await listProjects(projectsRoot)
  const out: FoundryThreadTarget[] = []
  for (const p of projects) {
    const threads = await listThreads(p.path)
    for (const t of threads) {
      out.push({
        projectName: p.name,
        threadName: t.name,
        threadPath: t.path,
        lastModified: t.lastModified,
      })
    }
  }
  return out.sort((a, b) => b.lastModified - a.lastModified)
}

// ── Admission ────────────────────────────────────────────────────────────
//
// Approve writes the (possibly-edited) content to disk under either the
// assigned thread's References/ folder OR `_Codex/References/` for
// unassigned items (per architecture-v4 Part 13 §7 recommendation).
// Chokidar's root watcher picks the file up automatically and the
// existing ingestion pipeline classifies it as source_type='reference'
// (via the References/ folder hint in ragIngest.detectSourceType).
//
// We don't link admitted_doc_id synchronously — processIngest runs
// debounced on a 2-second timer + BullMQ queue, so by the time it
// resolves the renderer has already moved on. A follow-up enhancement
// could backfill admitted_doc_id by source_path match on a periodic
// sweep, but Session 4 leaves it NULL.

export interface ApproveArgs {
  id: string
  content: string                         // raw_content OR edited version
  filename: string                        // user-supplied, will be slugified
  targetThreadPath?: string | null        // null/undefined → _Codex/References/
  reviewerNotes?: string | null
}

export interface ApproveResult {
  ok: boolean
  filePath?: string
  error?: string
}

/** Make a filesystem-safe filename. Strips path separators, leading dots,
 *  null bytes, and trailing whitespace. Adds `.md` if missing.
 *  Hard cap at 60 chars of base name (excluding `.md`) — defensive against
 *  the auto-derived filename in the UI, which used to emit 80-char slugs.
 *  Most FSes allow 255; we cap tighter for readability in the Codex tree. */
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\x00<>:"/\\|?*]+/g, '-')   // path-unsafe + control chars
    .replace(/^\.+/, '')                  // leading dots → hidden files
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)                         // base-name cap; .md added below
  if (!cleaned) return 'untitled.md'
  return cleaned.toLowerCase().endsWith('.md') ? cleaned : `${cleaned}.md`
}

export async function approveItem(args: ApproveArgs): Promise<ApproveResult> {
  // Verify the row exists + is in a state we can approve from. Pending
  // OR triaged both qualify — the user can approve before triage finishes
  // (we don't gate on triage completion). Session 7 second-pass — also pull
  // source_type + source_filename so we can clean up the iCloud inbox file
  // on successful admit (Item 1 — auto-delete after admission).
  const itemRes = await ragQuery<{
    triage_status: string
    source_type:   string
    source_filename: string | null
  }>(
    `SELECT triage_status, source_type, source_filename FROM foundry_items WHERE id = $1`,
    [args.id],
  )
  const row = itemRes?.rows[0]
  if (!row) return { ok: false, error: 'Item not found' }
  const { triage_status: status, source_type: sourceType, source_filename: sourceFilename } = row
  if (status === 'approved') return { ok: false, error: 'Already approved' }
  if (status === 'rejected') return { ok: false, error: 'Cannot approve a rejected item; re-capture it instead.' }

  // Resolve destination directory. Thread-target writes land at the THREAD
  // ROOT (no References/ subfolder — Session 7 fix #1). Files in the thread
  // root still classify as source_type='reference' via the default branch of
  // detectSourceType (path-position rule, see gotcha v13 priors). The _Codex
  // fallback for unassigned items keeps its References/ subfolder — that's
  // a structured cross-Codex cache, not a thread destination, and it sits
  // alongside _Codex/Wiki/ and _Codex/Syntheses/.
  const cfg = loadConfig()
  let dir: string
  if (args.targetThreadPath && args.targetThreadPath.trim().length > 0) {
    dir = args.targetThreadPath
  } else {
    const libraryRoot = getLibraryRoot(cfg)
    if (!libraryRoot) return { ok: false, error: 'Library root (_Codex) not configured' }
    dir = path.join(libraryRoot, 'References')
  }

  const filename = sanitizeFilename(args.filename)
  const filePath = path.join(dir, filename)

  // Refuse to silently overwrite. If the user wants to replace, they can
  // delete the existing file first or rename.
  try {
    await fs.promises.access(filePath)
    return { ok: false, error: `File already exists: ${filename}. Pick a different filename.` }
  } catch {
    // doesn't exist → good
  }

  try {
    await fs.promises.mkdir(dir, { recursive: true })
    // Diagnostic: tracks every Foundry approve write so the file-reappear bug
    // can be triangulated against ragIngest's wikilink writeback. Pairs with
    // the `[ragIngest] wikilink writeback to:` log in processIngest.
    console.log(`[Foundry] writing file to: ${filePath} (item ${args.id}, ${args.content.length} chars)`)
    await fs.promises.writeFile(filePath, args.content, 'utf-8')
  } catch (err) {
    return { ok: false, error: `Disk write failed: ${(err as Error).message}` }
  }

  // Update the foundry row. We set target_thread to the basename of the
  // path (display-only) when a thread was assigned. Don't link
  // admitted_doc_id here — chokidar's debounced ingest hasn't run yet;
  // backfill is a future task.
  try {
    await ragQuery(
      `UPDATE foundry_items SET
         triage_status   = 'approved',
         reviewed_at     = NOW(),
         admitted_at     = NOW(),
         target_thread   = $1,
         reviewer_notes  = $2
       WHERE id = $3`,
      [
        args.targetThreadPath ? path.basename(args.targetThreadPath) : null,
        args.reviewerNotes ?? null,
        args.id,
      ],
    )
  } catch (err) {
    // File was written successfully; the row update failure is
    // recoverable but breaks the audit trail. Surface the error but
    // don't unwind the disk write (the file is real content the user
    // intended to keep).
    console.warn(`[Foundry/approve] item ${args.id} DB update failed (file written OK):`, (err as Error).message)
    return { ok: true, filePath, error: `Saved to ${filePath}, but DB update failed: ${(err as Error).message}` }
  }

  console.log(`[Foundry/approve] item ${args.id} → ${filePath}`)

  // Session 7 second-pass Item 1 — auto-delete the iCloud inbox source file
  // after a successful admit. Only fires for source_type='icloud' items;
  // URL captures, paste text, and direct file drops are unaffected (their
  // sources don't live in `cfg.icloudInboxPath`). Silent on already-gone
  // (the file may have been moved or deleted out-of-band between capture
  // and admit). Runs at the very end of the happy path so a failure here
  // never unwinds the admit.
  if (sourceType === 'icloud' && sourceFilename && cfg.icloudInboxPath) {
    const inboxPath = path.join(cfg.icloudInboxPath, sourceFilename)
    try {
      await fs.promises.unlink(inboxPath)
      console.log(`[Foundry] deleted inbox source: ${inboxPath}`)
    } catch {
      // already gone or moved — silent per spec
    }
  }

  return { ok: true, filePath }
}

// ── Rejected-item cleanup (Part 5 of the Session 4 UX redesign) ─────────
//
// Rejected items have no audit value (the user explicitly said "not this")
// and were piling up in the queue. `deleteRejectedItem` removes one,
// `deleteAllRejectedItems` clears the whole bucket, and `restoreRejectedItem`
// flips a row back to `triaged` (or `pending` when triage hasn't completed)
// so an accidental Reject can be undone. Both delete paths refuse to touch
// non-rejected rows as a safety guard.

export async function deleteRejectedItem(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await ragQuery(
      `DELETE FROM foundry_items
        WHERE id = $1 AND triage_status = 'rejected'
       RETURNING id`,
      [id],
    )
    if (!res || res.rowCount === 0) {
      return { ok: false, error: 'Item not found or not in rejected state (refuse to delete non-rejected rows)' }
    }
    console.log(`[Foundry/delete] item ${id} deleted from rejected`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteAllRejectedItems(): Promise<{ ok: boolean; deleted: number; error?: string }> {
  try {
    const res = await ragQuery(
      `DELETE FROM foundry_items WHERE triage_status = 'rejected' RETURNING id`,
    )
    const deleted = res?.rowCount ?? 0
    console.log(`[Foundry/delete] cleared all rejected — ${deleted} item(s)`)
    return { ok: true, deleted }
  } catch (err) {
    return { ok: false, deleted: 0, error: (err as Error).message }
  }
}

/** Bulk-delete admitted (audit-log) rows from foundry_items. The disk
 *  files + rag_documents rows the admissions created are NOT touched —
 *  this only clears the Foundry queue's history of them. Honest copy
 *  for that lives in the renderer. */
export async function deleteAllAdmittedItems(): Promise<{ ok: boolean; deleted: number; error?: string }> {
  try {
    const res = await ragQuery(
      `DELETE FROM foundry_items WHERE triage_status = 'approved' RETURNING id`,
    )
    const deleted = res?.rowCount ?? 0
    console.log(`[Foundry/delete] cleared all admitted — ${deleted} item(s) (codex docs unaffected)`)
    return { ok: true, deleted }
  } catch (err) {
    return { ok: false, deleted: 0, error: (err as Error).message }
  }
}

export async function restoreRejectedItem(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Restore to `triaged` when proposed_tags exist (triage ran before
    // reject), otherwise back to `pending` so triageItem can fire again.
    // Clears reviewed_at + reviewer_notes — the rejection is fully undone.
    const res = await ragQuery(
      `UPDATE foundry_items SET
         triage_status  = CASE WHEN proposed_tags IS NULL THEN 'pending' ELSE 'triaged' END,
         reviewed_at    = NULL,
         reviewer_notes = NULL
       WHERE id = $1 AND triage_status = 'rejected'
       RETURNING id, triage_status`,
      [id],
    )
    if (!res || res.rowCount === 0) {
      return { ok: false, error: 'Item not found or not rejected' }
    }
    console.log(`[Foundry/restore] item ${id} restored to ${res.rows[0]?.triage_status as string}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export interface RejectArgs {
  id: string
  notes?: string | null
}

export async function rejectItem(args: RejectArgs): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await ragQuery(
      `UPDATE foundry_items SET
         triage_status  = 'rejected',
         reviewed_at    = NOW(),
         reviewer_notes = $1
       WHERE id = $2 AND triage_status IN ('pending', 'triaged')
       RETURNING id`,
      [args.notes ?? null, args.id],
    )
    if (!res || res.rowCount === 0) {
      return { ok: false, error: 'Item not found or not in a rejectable state' }
    }
    console.log(`[Foundry/reject] item ${args.id} rejected`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function listFoundryItems(opts: {
  statuses?: FoundryTriageStatus[]
  limit?: number
} = {}): Promise<FoundryItem[]> {
  const statuses = opts.statuses ?? ['pending', 'triaged', 'approved', 'rejected']
  const limit    = opts.limit ?? 200
  const res = await ragQuery<Parameters<typeof rowToItem>[0]>(
    `SELECT id::text AS id,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            source_type, source_url, source_filename, raw_content, cleaned_content,
            triage_mode, triage_status, proposed_tags, proposed_domain, quality_score,
            signal_assessment, proposed_connections::text[] AS proposed_connections,
            triage_completed_at::text AS triage_completed_at,
            reviewed_at::text AS reviewed_at, reviewer_notes,
            admitted_at::text AS admitted_at,
            admitted_doc_id::text AS admitted_doc_id,
            target_thread
       FROM foundry_items
      WHERE triage_status = ANY($1::text[])
      ORDER BY created_at DESC
      LIMIT $2`,
    [statuses, limit],
  )
  return (res?.rows ?? []).map(rowToItem)
}
