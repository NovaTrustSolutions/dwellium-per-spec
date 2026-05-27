/**
 * Three-panel intake row for the Foundry tab.
 *
 *   [Paste a URL]  [Drop a file]  [Paste text]
 *
 * Each panel sits in its own card with the same height + chrome via the
 * shared `IntakeCard` shell. Layout uses `repeat(auto-fit, minmax(...))`
 * so the panels stack at narrow widths instead of overflowing.
 *
 * Triage-mode toggle:
 *   - URL + File panels: "Extract signal" (default) / "Convert only".
 *     'Extract' lets the Triage Agent rewrite the body into cleaned
 *     markdown; 'Convert' preserves the source word-for-word and only
 *     classifies it.
 *   - Paste panel: always 'convert' (user-authored content should never
 *     be summarized) — no toggle shown.
 *
 * File drop:
 *   - .txt / .md → read via file.text(), send to foundryCaptureFile.
 *   - .pdf / .docx → read via file.arrayBuffer(), send to
 *     foundryCaptureFileBinary; main-side decodes via pdf-parse / mammoth
 *     before reusing the text capture path.
 *   - Other extensions → friendly inline error.
 *
 * Errors surface verbatim from the main process so the user sees the
 * real cause (missing API key, 401, empty scrape, etc.) instead of a
 * generic "capture failed".
 */
import { useState, useRef, useCallback } from 'react'
import type { FoundryTriageMode } from '../../store/foundryStore'

interface IntakePanelProps {
  onCaptured: (id: string) => void
}

const ACCEPTED_TEXT_EXTS   = ['.txt', '.md']
const ACCEPTED_BINARY_EXTS = ['.pdf', '.docx']  // main-side decodes via pdf-parse / mammoth
const FILE_INPUT_ACCEPT    = ACCEPTED_TEXT_EXTS.concat(ACCEPTED_BINARY_EXTS).join(',')
const FILE_MAX_BYTES       = 5 * 1024 * 1024  // 5 MB — large enough for any reasonable note/article
// Session 7 — when a captured doc exceeds this size in chars (~5K tokens),
// the Triage Agent's extract-mode rewrite has a real chance of timing out
// or returning truncated cleaned_content. We surface an inline amber hint
// below the mode toggle so the user can flip to Convert-only before
// sending. For binary files (PDF/DOCX) the byte count overstates the
// extracted text length, so the hint may over-trigger — that's acceptable
// (conservative warning beats silent failure).
const LARGE_DOC_CHAR_THRESHOLD = 20_000

// ── Shared styles ────────────────────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: 10,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  // All three cards share min-height so they line up visually.
  minHeight: 240,
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-3)',
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border-1)',
  borderRadius: 6,
  padding: '7px 10px',
  color: 'var(--text-1)',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
}

const PRIMARY_BUTTON: React.CSSProperties = {
  background: 'var(--accent-cyan)',
  color: 'var(--bg-base)',
  border: 'none',
  borderRadius: 6,
  padding: '7px 14px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const DISABLED_BUTTON: React.CSSProperties = {
  ...PRIMARY_BUTTON,
  opacity: 0.5,
  cursor: 'not-allowed',
}

// ── Mode toggle ──────────────────────────────────────────────────────────

interface ModeToggleProps {
  mode: FoundryTriageMode
  setMode: (m: FoundryTriageMode) => void
  disabled?: boolean
}

function ModeToggle({ mode, setMode, disabled }: ModeToggleProps): JSX.Element {
  const segStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: active ? 'var(--bg-base)' : 'transparent',
    color: active ? 'var(--text-1)' : 'var(--text-4)',
    border: 'none',
    fontFamily: 'inherit',
  })
  return (
    <div
      style={{
        display: 'inline-flex',
        border: '1px solid var(--border-1)',
        borderRadius: 5,
        overflow: 'hidden',
        alignSelf: 'flex-start',
      }}
      title={
        mode === 'extract'
          ? 'Triage Agent rewrites the body into cleaned markdown'
          : 'Triage Agent only tags + scores; raw content preserved word-for-word'
      }
    >
      <button
        onClick={() => !disabled && setMode('extract')}
        disabled={disabled}
        style={segStyle(mode === 'extract')}
      >
        Extract signal
      </button>
      <button
        onClick={() => !disabled && setMode('convert')}
        disabled={disabled}
        style={segStyle(mode === 'convert')}
      >
        Convert only
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────

export function IntakePanel({ onCaptured }: IntakePanelProps): JSX.Element {
  // ── URL panel state ────────────────────────────────────────────────
  const [url, setUrl] = useState('')
  const [urlMode, setUrlMode] = useState<FoundryTriageMode>('extract')
  const [urlBusy, setUrlBusy] = useState(false)
  const [urlResult, setUrlResult] = useState<{ ok: boolean; message: string } | null>(null)

  // ── File panel state ───────────────────────────────────────────────
  const [fileMode, setFileMode] = useState<FoundryTriageMode>('extract')
  const [fileBusy, setFileBusy] = useState(false)
  const [fileResult, setFileResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // Session 7 — track the most-recent file's size so the large-doc hint
  // below the mode toggle stays visible after capture (informational —
  // the captured file is already in flight, but next-time-flip-to-Convert
  // is the actionable takeaway). Re-set on every drop/pick; cleared
  // reactively when the user switches to Convert.
  const [lastFileSize, setLastFileSize] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Paste panel state ───────────────────────────────────────────────
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [textBusy, setTextBusy] = useState(false)
  const [textResult, setTextResult] = useState<{ ok: boolean; message: string } | null>(null)

  // ── URL capture ─────────────────────────────────────────────────────
  const handleCaptureUrl = async (): Promise<void> => {
    if (urlBusy || !url.trim()) return
    setUrlBusy(true)
    setUrlResult(null)
    try {
      const res = await window.electronAPI.foundryCaptureUrl(url.trim(), urlMode)
      if (res.ok && res.id) {
        setUrlResult({ ok: true, message: `Captured (${urlMode === 'extract' ? 'cleaning' : 'preserving'}) — triage running.` })
        onCaptured(res.id)
        setUrl('')
      } else {
        setUrlResult({ ok: false, message: res.error ?? 'Capture failed' })
      }
    } catch (err) {
      setUrlResult({ ok: false, message: (err as Error).message })
    } finally {
      setUrlBusy(false)
      setTimeout(() => setUrlResult((r) => (r?.ok ? null : r)), 5000)
    }
  }

  // ── File capture (drop + browse share this handler) ────────────────
  const handleFile = useCallback(async (file: File): Promise<void> => {
    setFileResult(null)
    // Track size for the large-doc hint (Session 7). Set BEFORE any
    // early-return so dropping a smaller file always replaces the prior
    // tracked size (the warning re-evaluates reactively).
    setLastFileSize(file.size)

    // Size sanity check first — avoids reading a multi-hundred-MB file
    // into memory before failing.
    if (file.size > FILE_MAX_BYTES) {
      setFileResult({ ok: false, message: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Cap is 5 MB.` })
      return
    }

    const lowerName = file.name.toLowerCase()
    const ext = lowerName.includes('.') ? lowerName.slice(lowerName.lastIndexOf('.')) : ''
    const isText   = ACCEPTED_TEXT_EXTS.includes(ext)
    const isBinary = ACCEPTED_BINARY_EXTS.includes(ext)

    if (!isText && !isBinary) {
      setFileResult({
        ok: false,
        message: `Unsupported file type: ${ext || '(no extension)'}. Drop .txt, .md, .pdf, or .docx.`,
      })
      return
    }

    setFileBusy(true)
    try {
      let res: { ok: boolean; id?: string; error?: string }
      if (isText) {
        // .txt / .md → main wants the decoded string verbatim.
        const content = await file.text()
        if (!content.trim()) {
          setFileResult({ ok: false, message: 'File is empty.' })
          return
        }
        res = await window.electronAPI.foundryCaptureFile(content, file.name, fileMode)
      } else {
        // .pdf / .docx → ship raw bytes; main extracts via pdf-parse /
        // mammoth then reuses the text capture path. The "Capturing…"
        // copy stays generic because the extraction round-trip is
        // typically subsecond; if it ever grows past ~2s we'd want a
        // dedicated "Extracting…" intermediate state.
        const bytes = await file.arrayBuffer()
        if (bytes.byteLength === 0) {
          setFileResult({ ok: false, message: 'File is empty.' })
          return
        }
        res = await window.electronAPI.foundryCaptureFileBinary(bytes, file.name, fileMode)
      }
      if (res.ok && res.id) {
        setFileResult({ ok: true, message: `Captured ${file.name} — triage running.` })
        onCaptured(res.id)
      } else {
        setFileResult({ ok: false, message: res.error ?? 'Capture failed' })
      }
    } catch (err) {
      setFileResult({ ok: false, message: (err as Error).message })
    } finally {
      setFileBusy(false)
      setTimeout(() => setFileResult((r) => (r?.ok ? null : r)), 6000)
    }
  }, [fileMode, onCaptured])

  const handleBrowseClick = (): void => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    if (f) await handleFile(f)
    // Reset so picking the same file twice still fires onChange.
    e.target.value = ''
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) await handleFile(f)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = (): void => setDragOver(false)

  // ── Paste capture ───────────────────────────────────────────────────
  const handleCaptureText = async (): Promise<void> => {
    if (textBusy || !text.trim() || !title.trim()) return
    setTextBusy(true)
    setTextResult(null)
    try {
      // Paste is always 'convert' — user-authored content is preserved.
      const res = await window.electronAPI.foundryCaptureText(text, title, 'convert')
      if (res.ok && res.id) {
        setTextResult({ ok: true, message: 'Added to Foundry — triage running.' })
        onCaptured(res.id)
        setText('')
        setTitle('')
      } else {
        setTextResult({ ok: false, message: res.error ?? 'Capture failed' })
      }
    } catch (err) {
      setTextResult({ ok: false, message: (err as Error).message })
    } finally {
      setTextBusy(false)
      setTimeout(() => setTextResult((r) => (r?.ok ? null : r)), 5000)
    }
  }

  const urlCanSubmit  = !urlBusy && url.trim().length > 0
  const textCanSubmit = !textBusy && text.trim().length > 0 && title.trim().length > 0

  return (
    <div
      style={{
        display: 'grid',
        // Three panels at desktop width; stacks at < ~900px.
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 14,
      }}
    >
      {/* ── 1. Paste a URL ────────────────────────────────────────────── */}
      <section style={CARD_STYLE}>
        <div style={LABEL_STYLE}>Paste a URL</div>
        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
          Firecrawl scrapes the page to markdown and queues it for triage.
        </div>
        <input
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleCaptureUrl() }}
          disabled={urlBusy}
          style={INPUT_STYLE}
        />
        <ModeToggle mode={urlMode} setMode={setUrlMode} disabled={urlBusy} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
          <button
            onClick={() => void handleCaptureUrl()}
            disabled={!urlCanSubmit}
            style={urlCanSubmit ? PRIMARY_BUTTON : DISABLED_BUTTON}
          >
            {urlBusy ? 'Capturing…' : 'Capture'}
          </button>
          {urlResult && (
            <span style={{ fontSize: 11, color: urlResult.ok ? 'var(--accent-green)' : '#ff2d78' }}>
              {urlResult.message}
            </span>
          )}
        </div>
      </section>

      {/* ── 2. Drop a file ───────────────────────────────────────────── */}
      <section style={CARD_STYLE}>
        <div style={LABEL_STYLE}>Drop a file</div>
        <div
          onDrop={(e) => void handleDrop(e)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: 14,
            border: `1px dashed ${dragOver ? 'var(--accent-cyan)' : 'var(--border-1)'}`,
            background: dragOver ? 'rgba(120, 200, 255, 0.05)' : 'var(--bg-base)',
            borderRadius: 8,
            textAlign: 'center',
            transition: 'border-color 0.15s, background 0.15s',
            opacity: fileBusy ? 0.5 : 1,
          }}
        >
          <div style={{ fontSize: 22, lineHeight: 1, color: 'var(--text-4)' }} aria-hidden>⬆</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            Drop PDF, DOCX, TXT, or MD here
          </div>
          <button
            onClick={handleBrowseClick}
            disabled={fileBusy}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-cyan)',
              cursor: fileBusy ? 'not-allowed' : 'pointer',
              fontSize: 11,
              padding: 0,
              fontFamily: 'inherit',
              textDecoration: 'underline dotted',
            }}
          >
            or browse
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_INPUT_ACCEPT}
            onChange={(e) => void handleFileInputChange(e)}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 4 }}>
            TXT · MD · PDF · DOCX
          </div>
        </div>
        <ModeToggle mode={fileMode} setMode={setFileMode} disabled={fileBusy} />
        {/* Session 7 — large-doc hint. Visible only when the most-recent
            file exceeded the threshold AND mode is still Extract. Flips
            off the moment the user toggles to Convert (no extra state
            management needed — the conditional drives it). */}
        {lastFileSize !== null && lastFileSize > LARGE_DOC_CHAR_THRESHOLD && fileMode === 'extract' && (
          <div style={{ fontSize: 11, color: 'var(--accent-orange)', lineHeight: 1.4 }}>
            ⚠ Large document — Convert only is recommended. Extract mode may time out on documents this size.
          </div>
        )}
        {fileResult && (
          <div style={{ fontSize: 11, color: fileResult.ok ? 'var(--accent-green)' : '#ff2d78' }}>
            {fileResult.message}
          </div>
        )}
      </section>

      {/* ── 3. Paste text ────────────────────────────────────────────── */}
      <section style={CARD_STYLE}>
        <div style={LABEL_STYLE}>Paste text</div>
        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
          Paste a note, transcript, or snippet. Title becomes the filename.
        </div>
        <input
          type="text"
          placeholder="Title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={textBusy}
          style={INPUT_STYLE}
        />
        <textarea
          placeholder="Paste content here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={textBusy}
          rows={3}
          style={{
            ...INPUT_STYLE,
            resize: 'vertical',
            minHeight: 60,
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
          <button
            onClick={() => void handleCaptureText()}
            disabled={!textCanSubmit}
            style={textCanSubmit ? PRIMARY_BUTTON : DISABLED_BUTTON}
          >
            {textBusy ? 'Adding…' : 'Add to Foundry'}
          </button>
          {textResult && (
            <span style={{ fontSize: 11, color: textResult.ok ? 'var(--accent-green)' : '#ff2d78' }}>
              {textResult.message}
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
