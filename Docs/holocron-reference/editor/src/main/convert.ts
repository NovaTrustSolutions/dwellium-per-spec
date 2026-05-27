import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import readXlsxFile, { type CellValue } from 'read-excel-file/node'
import { readFile } from 'fs/promises'
import { extname } from 'path'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff'])
const SUPPORTED_TEXT_EXTS = new Set(['.docx', '.pdf', '.xlsx', '.csv', '.html', '.htm'])

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTS.has(extname(filePath).toLowerCase())
}

export function isConvertible(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return SUPPORTED_TEXT_EXTS.has(ext) || IMAGE_EXTS.has(ext)
}

// ── DOCX ────────────────────────────────────────────────────────────────────
//
// `mammoth.convertToMarkdown` exists at runtime but the package's TS
// declarations omit it (only `convertToHtml` + `extractRawText` are typed).
// The local assertion below threads the missing signature in without
// suppressing the rest of the type-checking on mammoth's API. The runtime
// shape mirrors mammoth's other convert methods: `{ value, messages }`.
//
// For Foundry binary captures, callers typically want PLAIN TEXT (not
// markdown) — the Triage Agent does its own cleaning + classification, so
// preserving DOCX's italics/bold via markdown adds noise without value.
// `docxToText` uses the typed `extractRawText` API directly; `docxToMarkdown`
// remains for the existing file-conversion workflow.
type MammothMarkdown = typeof mammoth & {
  convertToMarkdown: (input: { path: string } | { buffer: Buffer } | { arrayBuffer: ArrayBuffer })
    => Promise<{ value: string; messages: unknown[] }>
}

export async function docxToMarkdown(filePath: string): Promise<string> {
  const result = await (mammoth as MammothMarkdown).convertToMarkdown({ path: filePath })
  return result.value
}

/** Plain-text DOCX extraction from a Buffer. Used by Foundry's binary
 *  capture path — the Triage Agent rewrites the body anyway, so we don't
 *  bother preserving formatting. `extractRawText` IS in mammoth's types,
 *  so no assertion needed here. */
export async function docxToText(buf: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: buf })
  return result.value
}

// ── PDF ─────────────────────────────────────────────────────────────────────
//
// pdf-parse@2.x is a class-based API (rewrite from v1). The previous
// `(await import('pdf-parse')).default(buf)` shape was v1 and broke when
// the dep was upgraded — the TS2339 on the `.default` access surfaced it
// statically; the runtime would have thrown a "not a function" too.
//
// New shape: `new PDFParse({ data })` → `getText()` returns
// `{ text, pages: [{ num, text }], total }`. `data` accepts a `Uint8Array`
// (and the constructor auto-converts Node `Buffer` per the types) — we
// pass `Uint8Array.from(buf)` to be defensive about lib variance.

export async function pdfToMarkdown(filePath: string): Promise<string> {
  const buf = await readFile(filePath)
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  try {
    const result = await parser.getText()
    // pdf-parse@2 already concatenates pages into `text` with the
    // `pageJoiner` default (`-- N of M --`); drop that page marker
    // because for markdown we'd rather use HR-style separators.
    const body = result.text
      .replace(/\n-- \d+ of \d+ --\n?/g, '\n\n---\n\n')
      .replace(/\f/g, '\n\n---\n\n')
      .trim()
    return body || `*(empty PDF: ${result.total} pages, no extractable text)*`
  } finally {
    await parser.destroy()
  }
}

/** Plain-text PDF extraction from a Buffer. Drops the page-boundary marker
 *  that pdf-parse@2 inserts by default — the Triage Agent doesn't need it. */
export async function pdfToText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  try {
    const result = await parser.getText()
    return result.text
      .replace(/\n-- \d+ of \d+ --\n?/g, '\n\n')
      .replace(/\f/g, '\n\n')
      .trim()
  } finally {
    await parser.destroy()
  }
}

// ── XLSX ────────────────────────────────────────────────────────────────────

export async function xlsxToMarkdown(filePath: string): Promise<string> {
  const sheets = await readXlsxFile(filePath)
  return sheets
    .map((sheet) => {
      const rows = sheet.data.map((row) => row.map(formatSpreadsheetCell))
      return `## ${sheet.sheet}\n\n${rowsToMarkdownTable(rows)}`
    })
    .join('\n\n')
}

function formatSpreadsheetCell(cell: CellValue | null): string {
  if (cell instanceof Date) return cell.toISOString()
  return String(cell ?? '')
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export async function csvToMarkdown(filePath: string): Promise<string> {
  const text = await readFile(filePath, 'utf-8')
  const rows = parseCsv(text)
  return rowsToMarkdownTable(rows)
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas, "" escapes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++
        row.push(field); rows.push(row)
        row = []; field = ''
      } else field += c
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function rowsToMarkdownTable(rows: unknown[][]): string {
  if (rows.length === 0) return '*(empty)*'
  const escape = (cell: unknown): string => String(cell ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const colCount = Math.max(...rows.map((r) => r.length))
  const padRow = (r: unknown[]): string[] => {
    const out = r.map(escape)
    while (out.length < colCount) out.push('')
    return out
  }
  const [header, ...body] = rows
  const headerRow = `| ${padRow(header).join(' | ')} |`
  const separator = `| ${Array(colCount).fill('---').join(' | ')} |`
  const bodyRows = body.map((r) => `| ${padRow(r).join(' | ')} |`)
  return [headerRow, separator, ...bodyRows].join('\n')
}

// ── HTML ────────────────────────────────────────────────────────────────────

export async function htmlToMarkdown(filePath: string): Promise<string> {
  const html = await readFile(filePath, 'utf-8')
  return stripHtmlToMarkdown(html)
}

function stripHtmlToMarkdown(html: string): string {
  // Pragmatic strip: kill scripts/styles, collapse common block tags into
  // newlines, convert headings + links + emphasis, drop everything else.
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  s = s
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|main|aside|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '') // drop any remaining tags
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  // Collapse 3+ blank lines, trim each line's right side.
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Image (OCR placeholder) ─────────────────────────────────────────────────

export function imageToMarkdownPlaceholder(filePath: string): string {
  const name = filePath.split('/').pop() ?? filePath
  return [
    `# OCR — ${name}`,
    '',
    '> Tesseract is not installed. Install via `brew install tesseract` and re-run conversion to extract text from this image.',
    '',
    `![${name}](${filePath})`,
  ].join('\n')
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

export interface ConvertResult {
  ok: boolean
  filePath: string
  outputPath: string
  error?: string
}

export async function convertFileToMarkdown(filePath: string): Promise<{ markdown: string; isOcrPlaceholder: boolean }> {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.docx')                  return { markdown: await docxToMarkdown(filePath), isOcrPlaceholder: false }
  if (ext === '.pdf')                   return { markdown: await pdfToMarkdown(filePath),  isOcrPlaceholder: false }
  if (ext === '.xlsx')                  return { markdown: await xlsxToMarkdown(filePath), isOcrPlaceholder: false }
  if (ext === '.csv')                   return { markdown: await csvToMarkdown(filePath),  isOcrPlaceholder: false }
  if (ext === '.html' || ext === '.htm') return { markdown: await htmlToMarkdown(filePath), isOcrPlaceholder: false }
  if (IMAGE_EXTS.has(ext))              return { markdown: imageToMarkdownPlaceholder(filePath), isOcrPlaceholder: true }
  throw new Error(`Unsupported extension: ${ext}`)
}
