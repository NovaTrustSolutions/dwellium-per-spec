import { useEffect, useState, useCallback, useMemo } from 'react'
import { useScribeStore } from '../../store/scribeStore'
import { useSettingsStore } from '../../store/settingsStore'
import { IconChevronDown, IconChevronRight, IconBrain } from '../Icons'
import { dreamOnce } from '../../utils/threadActions'

/**
 * Memory inspection panel — collapsible drawer hung off the chat header.
 *
 * Scope after the UX consolidation pass:
 *   - Session ID (last 8 chars, full id on hover)
 *   - Session duration + exchange count
 *   - Last reset timestamp
 *   - Dream insights (collapsible entries with timestamps)
 *   - "Dream now" manual trigger
 *   - Memory file section (path / summary count / latest summary preview /
 *     synthesisReady badge)
 *   - Footer link to Settings → Maintenance for destructive resets
 *
 * Out of scope (moved to Settings → Maintenance, "Memory & Data Resets"):
 *   - Clear Honcho session (this thread only)
 *   - Clear ALL Honcho sessions
 *   - Nuclear Reset
 *
 * Rationale: the panel is for inspection + the one productive lightweight
 * action (Dream now). Anything destructive belongs in Maintenance behind
 * typed confirmation gates — that's where Andy will instinctively look for
 * data resets, and consolidating them there prevents the "scattered controls"
 * frustration that motivated this pass.
 */
interface MemoryFile {
  threadName: string
  projectName: string
  honchoSessionId: string
  lastCompressed: string | null
  compressionCount: number
  summaries: Array<{ timestamp: string; trigger: string; honchoSessionId: string; summary: string }>
  dreamInsights: Array<{ queriedAt: string; trigger: string; insight: string }>
  keyFacts: unknown[]
  synthesisReady?: boolean
}

function fmtTs(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

/** "2h 14m" / "47m" / "32s" — for session duration since thread.createdAt. */
function fmtDuration(fromIso: string | null): string {
  if (!fromIso) return '—'
  try {
    const ms = Date.now() - new Date(fromIso).getTime()
    if (ms < 0) return '—'
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    const rem = m - h * 60
    if (h < 24) return rem > 0 ? `${h}h ${rem}m` : `${h}h`
    const d = Math.floor(h / 24)
    return `${d}d ${h - d * 24}h`
  } catch {
    return '—'
  }
}

/** Last 8 chars of the session id — readable + unambiguous at our scale. */
function sessionTail(id: string | null): string {
  if (!id) return '—'
  return id.length <= 8 ? id : '…' + id.slice(-8)
}

/** Compact path display: collapse home dir + show only the last 2-3 segments. */
function compactPath(p: string): string {
  if (!p) return ''
  const home = '/Users/'
  let s = p
  if (s.startsWith(home)) {
    const slash = s.indexOf('/', home.length)
    if (slash > 0) s = '~' + s.slice(slash)
  }
  const parts = s.split('/')
  if (parts.length <= 4) return s
  return `${parts[0] || '/'}/…/${parts.slice(-3).join('/')}`
}

export function MemoryPanel(): JSX.Element | null {
  const { honchoCtx } = useScribeStore()
  const { config, openSettingsAt } = useSettingsStore()
  const [memoryFile, setMemoryFile] = useState<MemoryFile | null>(null)
  const [memoryFilePath, setMemoryFilePath] = useState<string>('')
  const [threadCreatedAt, setThreadCreatedAt] = useState<string | null>(null)
  const [openInsightIdx, setOpenInsightIdx] = useState<number | null>(null)
  const [showFullPath, setShowFullPath] = useState(false)
  const [expandSummaryPreview, setExpandSummaryPreview] = useState(false)
  const [dreamBusy, setDreamBusy] = useState(false)
  const [dreamMessage, setDreamMessage] = useState<string | null>(null)

  const threadPath = config.activeThreadPath
  const threadName = config.activeThreadName
  const projectName = config.activeProjectName
  const sessionId = honchoCtx?.sessionId ?? null

  const refresh = useCallback(async (): Promise<void> => {
    if (!threadPath || !threadName || !projectName) {
      setMemoryFile(null)
      setMemoryFilePath('')
      setThreadCreatedAt(null)
      return
    }
    const [memRes, meta] = await Promise.all([
      window.electronAPI.threadReadMemoryFile(threadPath, projectName, threadName).catch(() => null),
      window.electronAPI.threadReadMeta(threadPath).catch(() => null),
    ])
    if (memRes?.ok) setMemoryFile(memRes.memoryFile)
    setMemoryFilePath(memRes?.filePath ?? '')
    setThreadCreatedAt(meta?.createdAt ?? null)
  }, [threadPath, threadName, projectName])

  useEffect(() => { void refresh() }, [refresh])

  // Refresh duration once per minute while the panel is open so the
  // "Session duration" reading doesn't go stale visibly.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  // Re-derive duration using `now` so the linter doesn't complain about an
  // unused state setter and the duration updates on minute ticks.
  const duration = useMemo(() => {
    void now
    return fmtDuration(threadCreatedAt)
  }, [threadCreatedAt, now])

  // The Scribe store tracks chatHistory; for exchanges we just count message
  // pairs. Re-deriving here is cheaper than threading it through props.
  const exchangeCount = Math.floor(useScribeStore.getState().chatHistory.length / 2)

  const handleDreamNow = async (): Promise<void> => {
    if (!sessionId || !threadPath || !threadName || !projectName) return
    setDreamBusy(true)
    setDreamMessage(null)
    try {
      const res = await dreamOnce(threadPath, projectName, threadName, sessionId, 'manual', { force: true })
      if (res.ok && res.mode === 'sync') {
        setDreamMessage('Dream insight saved.')
        await refresh()
      } else if (res.ok && res.mode === 'scheduled') {
        // schedule_dream returned 204 — server-side dream in flight. The
        // result will populate via Honcho's own dream pool later; the panel
        // will pick it up on the next refresh (or app restart).
        setDreamMessage('Dream scheduled — Honcho will process this in the background.')
      } else {
        setDreamMessage('No insight available (Honcho may not have enough history yet).')
      }
    } finally {
      setDreamBusy(false)
      setTimeout(() => setDreamMessage(null), 6000)
    }
  }

  if (!threadPath) {
    return (
      <div style={{ padding: '12px', fontSize: 11, color: 'var(--text-5)', fontStyle: 'italic' }}>
        No active thread.
      </div>
    )
  }

  const summaryCount = memoryFile?.summaries.length ?? 0
  const latestSummaryText = summaryCount > 0
    ? (memoryFile?.summaries[summaryCount - 1]?.summary ?? '')
    : ''
  const summaryPreview = expandSummaryPreview
    ? latestSummaryText
    : latestSummaryText.length > 200
      ? latestSummaryText.slice(0, 200).trim() + '…'
      : latestSummaryText
  const synthesisReady = !!memoryFile?.synthesisReady

  return (
    <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Session metadata */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4 }}>
        <span style={{ color: 'var(--text-4)' }}>Session:</span>
        <span style={{ fontFamily: 'monospace', color: 'var(--text-2)' }} title={sessionId ?? '(unbound)'}>
          {sessionId ? sessionTail(sessionId) : <em style={{ color: 'var(--text-5)' }}>unbound</em>}
        </span>

        <span style={{ color: 'var(--text-4)' }}>Duration:</span>
        <span>{duration} <span style={{ color: 'var(--text-5)' }}>· {exchangeCount} exchange{exchangeCount === 1 ? '' : 's'}</span></span>

        <span style={{ color: 'var(--text-4)' }}>Last reset:</span>
        <span>
          {fmtTs(memoryFile?.lastCompressed ?? null)}
          {memoryFile && memoryFile.compressionCount > 0 && (
            <span style={{ color: 'var(--text-5)' }}> · {memoryFile.compressionCount} total</span>
          )}
        </span>
      </div>

      {/* Dream insights */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <IconBrain size={12} />
          <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Dream insights</span>
          <span style={{ color: 'var(--text-5)' }}>({memoryFile?.dreamInsights.length ?? 0})</span>
          <button
            onClick={() => void handleDreamNow()}
            disabled={dreamBusy || !sessionId}
            title="Manually query Honcho's Dreaming Agent for this thread"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: '1px solid var(--border-2)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 10,
              color: dreamBusy || !sessionId ? 'var(--text-5)' : 'var(--accent-cyan)',
              cursor: dreamBusy || !sessionId ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {dreamBusy ? 'Dreaming…' : 'Dream now'}
          </button>
        </div>
        {dreamMessage && (
          <p style={{ fontSize: 10, color: 'var(--text-4)', margin: '0 0 6px 0', fontStyle: 'italic' }}>{dreamMessage}</p>
        )}
        {(!memoryFile || memoryFile.dreamInsights.length === 0) && (
          <p style={{ fontSize: 10, color: 'var(--text-5)', margin: 0, fontStyle: 'italic' }}>
            No insights yet. The Dreaming Agent fires on branch and once per app launch per thread.
          </p>
        )}
        {memoryFile && memoryFile.dreamInsights.slice().reverse().map((d, idx) => {
          const realIdx = memoryFile.dreamInsights.length - 1 - idx
          const isOpen = openInsightIdx === realIdx
          return (
            <div
              key={`${d.queriedAt}-${realIdx}`}
              style={{
                border: '1px solid var(--border-2)',
                borderRadius: 6,
                marginBottom: 4,
                background: 'var(--bg-3)',
              }}
            >
              <button
                onClick={() => setOpenInsightIdx(isOpen ? null : realIdx)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  color: 'var(--text-2)',
                  fontSize: 11,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                {isOpen ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
                <span style={{ color: 'var(--text-4)', fontSize: 10 }}>[{d.trigger}]</span>
                <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{fmtTs(d.queriedAt)}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '4px 10px 10px', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {d.insight}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Memory file — disk view */}
      <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Memory file</span>
          <span style={{ color: 'var(--text-5)' }}>
            ({summaryCount} summar{summaryCount === 1 ? 'y' : 'ies'} on disk)
          </span>
          {synthesisReady && (
            <span
              title="Memory file has accumulated enough artifacts (≥3 summaries or ≥3 dream insights) for Hive synthesis."
              style={{
                marginLeft: 'auto',
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 999,
                background: 'rgba(0,212,212,0.10)',
                border: '1px solid rgba(0,212,212,0.45)',
                color: 'var(--accent-cyan)',
                letterSpacing: '0.04em',
              }}
            >
              READY FOR SYNTHESIS ✦
            </span>
          )}
        </div>

        {memoryFilePath ? (
          <button
            onClick={() => setShowFullPath((v) => !v)}
            title={memoryFilePath}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-4)',
              fontSize: 10,
              fontFamily: 'monospace',
              padding: '2px 0',
              cursor: 'pointer',
              textAlign: 'left',
              wordBreak: 'break-all',
              maxWidth: '100%',
            }}
          >
            {showFullPath ? memoryFilePath : compactPath(memoryFilePath)}
          </button>
        ) : (
          <p style={{ fontSize: 10, color: 'var(--text-5)', margin: 0, fontStyle: 'italic' }}>
            (path unresolved)
          </p>
        )}

        {summaryCount > 0 ? (
          <div
            style={{
              marginTop: 6,
              padding: '8px 10px',
              border: '1px solid var(--border-2)',
              borderRadius: 6,
              background: 'var(--bg-3)',
              fontSize: 11,
              color: 'var(--text-2)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Latest summary
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-5)' }}>
                · {fmtTs(memoryFile?.summaries[summaryCount - 1]?.timestamp ?? null)}
              </span>
              {latestSummaryText.length > 200 && (
                <button
                  onClick={() => setExpandSummaryPreview((v) => !v)}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-cyan)',
                    fontSize: 10,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                >
                  {expandSummaryPreview ? 'collapse' : 'expand'}
                </button>
              )}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{summaryPreview}</div>
          </div>
        ) : (
          <p style={{ marginTop: 6, fontSize: 10, color: 'var(--text-5)', fontStyle: 'italic' }}>
            No summaries on disk yet — the file is created on first compression or branch.
          </p>
        )}
      </div>

      {/* Footer link to Maintenance — destructive resets live there */}
      <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 8 }}>
        <button
          onClick={() => openSettingsAt('maintenance')}
          title="Open Settings → Maintenance for Clear-session, Clear-all, and Nuclear Reset actions"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-4)',
            fontSize: 10,
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
            textDecorationColor: 'var(--border-2)',
          }}
        >
          Nuclear resets → Settings → Maintenance
        </button>
      </div>
    </div>
  )
}
