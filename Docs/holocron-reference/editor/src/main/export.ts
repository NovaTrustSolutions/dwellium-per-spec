import { BrowserWindow, dialog } from 'electron'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import sanitizeHtml from 'sanitize-html'

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function markdownToSafeHtml(content: string): Promise<string> {
  const { marked } = await import('marked')
  const unsafeHtml = await marked(content)
  return sanitizeHtml(unsafeHtml, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'file'],
  })
}

function plainHtmlTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
         max-width:780px;margin:0 auto;padding:40px 24px;color:#1a1a1a;line-height:1.75}
    h1{font-size:2em;font-weight:700;margin:1.2em 0 0.4em}
    h2{font-size:1.5em;font-weight:700;margin:1em 0 0.4em}
    h3{font-size:1.25em;font-weight:600;margin:1em 0 0.4em}
    h4{font-size:1.05em;font-weight:600}
    pre{background:#f5f5f5;border-radius:4px;padding:12px 16px;overflow-x:auto}
    code{font-family:'SFMono-Regular',Consolas,monospace;font-size:.9em;background:#f5f5f5;padding:2px 4px;border-radius:3px}
    pre code{background:none;padding:0}
    blockquote{border-left:3px solid #ccc;margin:0;padding-left:16px;color:#555}
    hr{border:none;border-top:1px solid #ddd;margin:24px 0}
    a{color:#0070f3}
    table{border-collapse:collapse;width:100%}
    td,th{border:1px solid #ddd;padding:8px 12px;text-align:left}
  </style>
</head>
<body>${body}</body>
</html>`
}

// ── Inline markdown parser for docx ─────────────────────────────────────────

function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = []
  // Handle **bold**, *italic*, `code` — in that order
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun(text.slice(last, m.index)))
    if (m[1] != null) runs.push(new TextRun({ text: m[1], bold: true }))
    else if (m[2] != null) runs.push(new TextRun({ text: m[2], italics: true }))
    else if (m[3] != null) runs.push(new TextRun({ text: m[3], font: 'Courier New', size: 20 }))
    last = m.index + m[0].length
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)))
  return runs.length ? runs : [new TextRun(text)]
}

async function buildDocxBuffer(content: string, title: string): Promise<Buffer> {
  const lines = content.split('\n')
  const children: Paragraph[] = []
  let inCode = false

  for (const line of lines) {
    if (line.startsWith('```')) { inCode = !inCode; continue }
    if (inCode) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, font: 'Courier New', size: 20 })],
        spacing: { before: 0, after: 0 }
      }))
      continue
    }
    if (line.startsWith('#### ')) {
      children.push(new Paragraph({ text: line.slice(5), heading: HeadingLevel.HEADING_4 }))
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }))
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }))
    } else if (line.startsWith('# ')) {
      children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }))
    } else if (line.startsWith('> ')) {
      children.push(new Paragraph({ children: parseInline(line.slice(2)), indent: { left: 720 } }))
    } else if (/^[-*+] /.test(line)) {
      children.push(new Paragraph({ children: [new TextRun('• '), ...parseInline(line.slice(2))] }))
    } else if (/^\d+\. /.test(line)) {
      const numMatch = line.match(/^(\d+)\. (.*)$/)
      const num = numMatch?.[1] ?? '1'
      const rest = numMatch?.[2] ?? line
      children.push(new Paragraph({ children: [new TextRun(`${num}. `), ...parseInline(rest)] }))
    } else if (/^---+$|^\*\*\*+$|^___+$/.test(line.trim())) {
      children.push(new Paragraph({
        border: { bottom: { color: 'CCCCCC', space: 1, style: 'single', size: 6 } }
      }))
    } else if (line.trim() === '') {
      children.push(new Paragraph(''))
    } else {
      children.push(new Paragraph({ children: parseInline(line) }))
    }
  }

  const doc = new Document({
    creator: 'Holocron Editor',
    title,
    sections: [{ children }]
  })
  return Packer.toBuffer(doc)
}

// ── Exporters ─────────────────────────────────────────────────────────────────

export async function exportAsPdf(
  content: string,
  fileName: string
): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
  const htmlBody = await markdownToSafeHtml(content)
  const fullHtml = plainHtmlTemplate(stripExtension(fileName), htmlBody)

  const tmpPath = join(tmpdir(), `holocron-pdf-${Date.now()}.html`)
  await writeFile(tmpPath, fullHtml)

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
    }
  })

  try {
    await win.loadURL(`file://${tmpPath}`)
    const pdfBuffer = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: stripExtension(fileName) + '.pdf',
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }

    await writeFile(filePath, pdfBuffer)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  } finally {
    win.destroy()
    await unlink(tmpPath).catch(() => {})
  }
}

export async function exportAsDocx(
  content: string,
  fileName: string
): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: stripExtension(fileName) + '.docx',
    filters: [{ name: 'Word Documents', extensions: ['docx'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  try {
    const buf = await buildDocxBuffer(content, stripExtension(fileName))
    await writeFile(filePath, buf)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function exportAsHtml(
  content: string,
  fileName: string
): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: stripExtension(fileName) + '.html',
    filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  try {
    const body = await markdownToSafeHtml(content)
    const html = plainHtmlTemplate(stripExtension(fileName), body)
    await writeFile(filePath, html, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function exportAsText(
  content: string,
  fileName: string
): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: stripExtension(fileName) + '.txt',
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  try {
    const plain = content
      .replace(/#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ''))
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[>] /gm, '')
      .replace(/^[-*+] /gm, '• ')
      .replace(/={2,}/g, '')
    await writeFile(filePath, plain, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
