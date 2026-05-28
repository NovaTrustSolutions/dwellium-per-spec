import { useState, useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { useSettingsStore } from '../../store/settingsStore'
import { useScribeStore } from '../../store/scribeStore'
import { useLMStream } from '../chat/useLMStream'
import { IconBrain } from '../Icons'
import { getMarkdownExtensions, registerEditorView } from './markdownConfig'

/**
 * Dump Mode — Brain Dump compose surface (MVP P2). A CodeMirror 6 instance
 * with the shared markdown config so highlighting matches the main editor:
 * H1 orange, H2 green, H3 hot pink, bold yellow, italic purple, blockquotes
 * light blue, code blocks dark+cyan border, ==highlight== yellow.
 */
export function DumpMode(): JSX.Element {
  const { config } = useSettingsStore()
  const { honchoCtx, openFiles, openFileWithContent, setEditorMode } = useScribeStore()
  const { sendMessage } = useLMStream()
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [dumpText, setDumpText] = useState('')
  const [dumpCount, setDumpCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // P4-A: Report generation UI state.
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportPrefix, setReportPrefix] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')
  const hasThread = !!config.activeThreadPath && !!config.activeThreadName

  const refreshDumpCount = async (): Promise<void> => {
    if (!config.activeThreadPath) { setDumpCount(0); return }
    const meta = await window.electronAPI.threadReadMeta(config.activeThreadPath).catch(() => null)
    setDumpCount(meta?.dumpCount ?? 0)
  }

  useEffect(() => {
    let cancelled = false
    if (!config.activeThreadPath) { setDumpCount(0); return }
    void window.electronAPI.threadReadMeta(config.activeThreadPath).then((meta) => {
      if (cancelled) return
      setDumpCount(meta?.dumpCount ?? 0)
    })
    return () => { cancelled = true }
  }, [config.activeThreadPath])

  // Per-thread draft persistence. Brain dump drafts must survive both tab
  // navigation (component unmount) and app restart, matching "save constantly
  // like a regular markdown editor". Keyed on activeThreadPath so each thread
  // owns its own in-flight draft.
  const draftKey = config.activeThreadPath ? `holocron:dump-draft:${config.activeThreadPath}` : null

  // Mount CodeMirror with any saved draft for the active thread. Re-mounts on
  // thread change so each thread's draft is loaded fresh.
  useEffect(() => {
    if (!editorContainerRef.current || !hasThread || !draftKey) return
    const saved = (() => {
      try { return localStorage.getItem(draftKey) ?? '' } catch { return '' }
    })()
    setDumpText(saved)
    const view = new EditorView({
      state: EditorState.create({
        doc: saved,
        extensions: [
          ...getMarkdownExtensions(),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            const text = update.state.doc.toString()
            setDumpText(text)
            try {
              if (text.length > 0) localStorage.setItem(draftKey, text)
              else localStorage.removeItem(draftKey)
            } catch { /* quota / private mode — ignore */ }
          }),
        ],
      }),
      parent: editorContainerRef.current,
    })
    viewRef.current = view
    const unregister = registerEditorView(view)
    return () => {
      unregister()
      view.destroy()
      viewRef.current = null
    }
  }, [hasThread, draftKey])

  const clearEditor = (): void => {
    setDumpText('')
    if (draftKey) {
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    }
    const view = viewRef.current
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
    }
  }

  const handleDump = async (): Promise<void> => {
    const content = dumpText.trim()
    if (!content || busy) return
    if (!config.activeThreadPath || !config.activeThreadName) return
    setBusy(true); setError('')

    try {
      const result = await window.electronAPI.dumpAppend(
        config.activeThreadPath,
        config.activeProjectName,
        config.activeThreadName,
        content,
      )
      if (!result.ok) { setError(result.error ?? 'Append failed'); setBusy(false); return }

      const linkHref = `holocron-bd://${result.promptNumber}?path=${encodeURIComponent(result.filePath)}`
      const displayText = `[Prompt ${result.promptNumber} — ${result.timestamp}](${linkHref})`
      // P2-C watermark — agent processes only this block, never the whole BD file.
      const agentText = `The following is Brain Dump Prompt ${result.promptNumber}. Process only this content:\n\n${content}`

      const sessionId = honchoCtx?.sessionId
      if (sessionId && config.honcho.enabled && config.mode !== 'sandbox') {
        await window.electronAPI.honchoSaveMessage(sessionId, 'andy', displayText).catch(() => {})
      }

      sendMessage(
        agentText,
        async (response) => {
          if (sessionId && config.honcho.enabled && config.mode !== 'sandbox') {
            await window.electronAPI.honchoSaveMessage(sessionId, 'holocron', response).catch(() => {})
          }
        },
        displayText,
      )

      clearEditor()
      await refreshDumpCount()
    } finally {
      setBusy(false)
    }
  }

  // P4-A: generate a structured report from the BD file + open reference docs.
  const handleGenerateReport = async (): Promise<void> => {
    if (reportBusy) return
    if (!config.activeThreadPath || !config.activeThreadName) return
    setReportBusy(true); setReportError('')
    try {
      // "Open reference docs" — every open file except the report itself.
      // We don't yet know the report path; just pass everything currently open.
      const referenceFiles = openFiles.map((f) => f.path)
      const result = await window.electronAPI.reportGenerate(
        config.activeThreadPath,
        config.activeProjectName,
        config.activeThreadName,
        reportPrefix.trim(),
        referenceFiles,
      )
      if (!result.ok) {
        setReportError(result.error ?? 'Report generation failed')
        setReportBusy(false)
        return
      }
      // Open the new report in Document Mode automatically (per spec).
      const content = await window.electronAPI.readFile(result.filePath).catch(() => null)
      if (content) {
        const name = result.filePath.split('/').pop() ?? result.filePath
        openFileWithContent({ path: result.filePath, name }, content.content)
        setEditorMode('document')
      }
      setShowReportForm(false)
      setReportPrefix('')
    } finally {
      setReportBusy(false)
    }
  }

  if (!hasThread) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 32, backgroundColor: 'var(--bg-base)' }}>
        <IconBrain size={28} style={{ color: 'var(--text-dim)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>
          Load a thread to start dumping.
        </span>
      </div>
    )
  }

  const canDump = dumpText.trim().length > 0 && !busy
  const showReportButton = dumpCount > 0

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: 'var(--bg-base)' }}>
      {/* Header strip */}
      <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <IconBrain size={14} style={{ color: 'var(--neon-blue)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          Brain Dump
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
          {dumpCount === 0 ? 'No prompts yet' : `${dumpCount} prompt${dumpCount === 1 ? '' : 's'} so far`}
        </span>
      </div>

      {/* CodeMirror compose surface */}
      <div ref={editorContainerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />

      {/* P4-A Report form — pre-filled prefix lets the user override the default name. */}
      {showReportForm && (
        <div style={{ flexShrink: 0, padding: 'var(--space-3) var(--space-6)', borderTop: '1px solid rgba(0,212,255,0.25)', background: 'rgba(0,212,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--neon-blue)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              Generate report (optional name prefix):
            </span>
            <input
              autoFocus
              value={reportPrefix}
              onChange={(e) => setReportPrefix(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleGenerateReport()
                if (e.key === 'Escape') { setShowReportForm(false); setReportPrefix('') }
              }}
              placeholder="Report (default)"
              disabled={reportBusy}
              style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-md)', padding: '5px 9px', color: 'var(--text-1)', fontSize: 'var(--font-sm)', outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={() => void handleGenerateReport()}
              disabled={reportBusy}
              style={{
                background: 'var(--neon-blue)', color: '#000', border: 'none',
                borderRadius: 'var(--radius-md)', padding: '5px 14px', fontSize: 'var(--font-sm)',
                fontWeight: 700, cursor: reportBusy ? 'wait' : 'pointer', fontFamily: 'inherit',
                opacity: reportBusy ? 0.7 : 1,
              }}
            >
              {reportBusy ? 'Generating…' : 'Generate'}
            </button>
            <button
              onClick={() => { setShowReportForm(false); setReportPrefix(''); setReportError('') }}
              disabled={reportBusy}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 14, cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
          {reportError && (
            <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--font-xs)', color: 'var(--neon-pink)', fontFamily: 'monospace' }}>
              ⚠ {reportError}
            </p>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
          {dumpText.length} chars
        </span>
        {error && (
          <span style={{ fontSize: 11, color: 'var(--neon-pink)', fontFamily: 'monospace' }}>⚠ {error}</span>
        )}
        <div style={{ flex: 1 }} />
        {showReportButton && (
          <button
            onClick={() => setShowReportForm(true)}
            disabled={reportBusy}
            title="Generate a report from this thread's brain dump + open references"
            style={{
              padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-default)',
              background: 'transparent', color: 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600,
              cursor: reportBusy ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              transition: 'color 150ms, border-color 150ms',
            }}
            onMouseEnter={(e) => { if (!reportBusy) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-bright)' } }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
          >
            Report
          </button>
        )}
        <button
          onClick={() => void handleDump()}
          disabled={!canDump}
          title={canDump ? 'Submit dump' : busy ? 'Working…' : 'Type something first'}
          style={{
            padding: '11px 28px', borderRadius: 8, border: 'none',
            background: canDump ? 'var(--neon-blue)' : 'var(--bg-card)',
            color: canDump ? '#000' : 'var(--text-dim)',
            fontSize: 14, fontWeight: 700, letterSpacing: '0.04em',
            cursor: canDump ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            transition: 'background 150ms ease',
          }}
        >
          {busy ? 'Submitting…' : 'Dump'}
        </button>
      </div>
    </div>
  )
}
