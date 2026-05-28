import { useState } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useDomainesStore } from '../../store/domainesStore'
import { useScribeStore } from '../../store/scribeStore'
import { useSessionStore } from '../../store/sessionStore'

interface ResetSummary {
  documents:      number
  tags:           number
  wikiPages:      number
  syntheses:      number
  operations:     number
  domaines:       number
  namespaces:     number
  foldersRemoved: number
}

/**
 * Memory & Data Resets — three actions, escalating in destructiveness:
 *   A) Clear Honcho session (this thread)   ← amber, typed thread name
 *   B) Clear all Honcho sessions             ← pink, type CLEAR ALL
 *   C) Nuclear Reset                          ← red, type RESET
 *
 * All three live here (not scattered across chat header / Memory panel /
 * Settings) so destructive actions are one click away from each other and
 * Andy never has to hunt. Each carries honest copy: what gets cleared,
 * what's preserved, what falls back when server endpoints aren't available.
 */
export function MaintenanceTab(): JSX.Element {
  const { config } = useSettingsStore()

  // ── C: Nuclear Reset state (existing) ───────────────────────────────────
  const [typed, setTyped]       = useState('')
  const [running, setRunning]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [summary, setSummary]   = useState<ResetSummary | null>(null)
  const armed = typed === 'RESET'

  // ── A: Clear this thread's Honcho session ───────────────────────────────
  const [clearThreadTyped, setClearThreadTyped] = useState('')
  const [clearThreadRunning, setClearThreadRunning] = useState(false)
  const [clearThreadMessage, setClearThreadMessage] = useState<string | null>(null)
  const [clearThreadError, setClearThreadError] = useState<string | null>(null)
  const threadName    = config.activeThreadName
  const threadPath    = config.activeThreadPath
  const projectName   = config.activeProjectName
  const clearThreadArmed = !!threadName && clearThreadTyped === threadName && !!threadPath

  // ── B: Clear ALL Honcho sessions ────────────────────────────────────────
  const [clearAllTyped, setClearAllTyped] = useState('')
  const [clearAllRunning, setClearAllRunning] = useState(false)
  const [clearAllMessage, setClearAllMessage] = useState<string | null>(null)
  const [clearAllError, setClearAllError] = useState<string | null>(null)
  const clearAllArmed = clearAllTyped === 'CLEAR ALL'

  /** Full app-state refresh after a successful Nuclear Reset. Everything
   *  on disk and in the DB is gone, but the renderer is still holding
   *  pre-reset state — config (with cleared active keys), open Scribe
   *  tabs pointing at deleted files, the previous Domaines list, the
   *  current view. Hit every store that participates in that state. */
  const refreshAppState = async (): Promise<void> => {
    await useSettingsStore.getState().loadConfig()
    useScribeStore.getState().closeAllFiles()
    const dom = useDomainesStore.getState()
    dom.backToIndex()
    dom.setLoadedOnce(false)
    await dom.refresh()
    dom.setLoadedOnce(true)
    useSessionStore.getState().setActiveTab('domaines')
  }

  // ── A handler ───────────────────────────────────────────────────────────
  const handleClearThread = async (): Promise<void> => {
    if (!clearThreadArmed || clearThreadRunning) return
    if (!threadPath || !threadName || !projectName) return
    setClearThreadRunning(true)
    setClearThreadError(null)
    setClearThreadMessage(null)
    try {
      const result = await window.electronAPI.threadClearHonchoSession(threadPath, threadName, projectName)
      if (!result?.ok || !result.newSessionId) {
        setClearThreadError(result?.error ?? 'Clear failed')
        return
      }
      // Re-bind the active session locally so the chat keeps working without
      // needing a thread switch.
      useScribeStore.getState().setHonchoCtx({ sessionId: result.newSessionId })
      useScribeStore.getState().clearChatHistory()
      const serverNote = result.serverCleared
        ? 'Server-side memory cleared.'
        : 'Honcho deployment doesn\'t support DELETE; old session abandoned, new session started.'
      setClearThreadMessage(`Session rotated. ${serverNote} Local Memory file preserved.`)
      setClearThreadTyped('')
    } catch (err) {
      setClearThreadError((err as Error).message)
    } finally {
      setClearThreadRunning(false)
    }
  }

  // ── B handler ───────────────────────────────────────────────────────────
  const handleClearAll = async (): Promise<void> => {
    if (!clearAllArmed || clearAllRunning) return
    setClearAllRunning(true)
    setClearAllError(null)
    setClearAllMessage(null)
    try {
      const result = await window.electronAPI.honchoClearAllSessions()
      if (!result.ok) {
        setClearAllError(result.errors[0] ?? 'Clear-all failed')
        return
      }
      // Re-bind the active thread to its freshly rotated session so the
      // current chat doesn't break.
      if (threadPath) {
        const meta = await window.electronAPI.threadReadMeta(threadPath).catch(() => null)
        if (meta?.honchoSessionId) {
          useScribeStore.getState().setHonchoCtx({ sessionId: meta.honchoSessionId })
          useScribeStore.getState().clearChatHistory()
        }
      }
      const errs = result.errors.length > 0 ? ` (${result.errors.length} error${result.errors.length === 1 ? '' : 's'})` : ''
      setClearAllMessage(`Rotated ${result.cleared} of ${result.totalThreads} threads${errs}. Local Memory files untouched.`)
      setClearAllTyped('')
    } catch (err) {
      setClearAllError((err as Error).message)
    } finally {
      setClearAllRunning(false)
    }
  }

  // ── C handler (Nuclear Reset — existing) ────────────────────────────────
  const handleReset = async (): Promise<void> => {
    if (!armed || running) return
    setRunning(true); setError(null); setSummary(null)
    try {
      const r = await window.electronAPI.maintenanceNuclearReset()
      if (!r.ok || !r.summary) {
        setError(r.error ?? 'Reset failed')
      } else {
        setSummary(r.summary)
        setTyped('')
        await refreshAppState()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ overflowY: 'auto', maxHeight: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Section title */}
      <div>
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Memory &amp; Data Resets
        </h3>
        <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-4)', lineHeight: 1.5 }}>
          Three actions, escalating in destructiveness. Each requires typed confirmation. Local Memory file snapshots on disk are preserved by A and B; only the Nuclear Reset wipes the database index.
        </p>
      </div>

      {/* ── A) Clear thread memory ─────────────────────────────────────── */}
      <section
        style={{
          background: 'var(--bg-3)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          border: '1px solid rgba(255,159,10,0.30)',
        }}
      >
        <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--accent-orange)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          A · Clear thread memory
        </h4>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
          Deletes Honcho's server-side memory for <strong style={{ color: 'var(--text-1)' }}>{threadName || '(no active thread)'}</strong> only.
          Your local Memory file snapshot is preserved. A new Honcho session starts automatically.
        </p>
        {threadName ? (
          <>
            <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-3)' }}>
              Type <span style={{ fontFamily: 'monospace', color: 'var(--accent-orange)' }}>{threadName}</span> to unlock.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={clearThreadTyped}
                onChange={(e) => { setClearThreadTyped(e.target.value); setClearThreadError(null) }}
                placeholder={threadName}
                disabled={clearThreadRunning}
                style={{
                  flex: 1, boxSizing: 'border-box',
                  background: 'var(--bg-0)',
                  border: '1px solid var(--border-2)',
                  borderRadius: 6,
                  padding: '7px 9px',
                  fontSize: 12, fontFamily: 'monospace',
                  color: 'var(--text-1)',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => void handleClearThread()}
                disabled={!clearThreadArmed || clearThreadRunning}
                style={{
                  background: clearThreadArmed && !clearThreadRunning ? 'var(--accent-orange)' : 'var(--bg-0)',
                  color:      clearThreadArmed && !clearThreadRunning ? '#000'                  : 'var(--text-4)',
                  border: 'none', borderRadius: 6,
                  padding: '7px 14px',
                  fontSize: 12, fontWeight: 700,
                  cursor: clearThreadArmed && !clearThreadRunning ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                {clearThreadRunning ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-5)', fontStyle: 'italic' }}>
            Open a thread first.
          </p>
        )}
        {clearThreadError && (
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--accent-pink)' }}>{clearThreadError}</p>
        )}
        {clearThreadMessage && (
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--accent-green)', fontStyle: 'italic' }}>{clearThreadMessage}</p>
        )}
      </section>

      {/* ── B) Clear ALL thread memory ─────────────────────────────────── */}
      <section
        style={{
          background: 'var(--bg-3)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          border: '1px solid rgba(255,45,120,0.30)',
        }}
      >
        <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#ff2d78', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          B · Clear all thread memory
        </h4>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
          Deletes Honcho's server-side memory for every thread in the workspace.
          Local Memory file snapshots are preserved. Use this if Honcho feels confused or stale across multiple threads.
        </p>
        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-3)' }}>
          Type <span style={{ fontFamily: 'monospace', color: '#ff2d78', fontWeight: 700 }}>CLEAR ALL</span> to unlock.
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={clearAllTyped}
            onChange={(e) => { setClearAllTyped(e.target.value); setClearAllError(null) }}
            placeholder="CLEAR ALL"
            disabled={clearAllRunning}
            style={{
              flex: 1, boxSizing: 'border-box',
              background: 'var(--bg-0)',
              border: '1px solid var(--border-2)',
              borderRadius: 6,
              padding: '7px 9px',
              fontSize: 12, fontFamily: 'monospace',
              color: 'var(--text-1)',
              outline: 'none',
            }}
          />
          <button
            onClick={() => void handleClearAll()}
            disabled={!clearAllArmed || clearAllRunning}
            style={{
              background: clearAllArmed && !clearAllRunning ? '#ff2d78'    : 'var(--bg-0)',
              color:      clearAllArmed && !clearAllRunning ? '#000'        : 'var(--text-4)',
              border: 'none', borderRadius: 6,
              padding: '7px 14px',
              fontSize: 12, fontWeight: 700,
              cursor: clearAllArmed && !clearAllRunning ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {clearAllRunning ? 'Clearing…' : 'Clear all'}
          </button>
        </div>
        {clearAllError && (
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--accent-pink)' }}>{clearAllError}</p>
        )}
        {clearAllMessage && (
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--accent-green)', fontStyle: 'italic' }}>{clearAllMessage}</p>
        )}
      </section>

      {/* ── C) Nuclear Reset (existing — most prominent) ────────────────── */}
      <section
        style={{
          background: 'var(--bg-3)',
          borderRadius: 'var(--radius-md)',
          padding: 16,
          border: '2px solid rgba(255,45,120,0.55)',
          boxShadow: '0 0 0 1px rgba(255,45,120,0.10), 0 4px 16px rgba(255,45,120,0.08)',
        }}
      >
        <h4 style={{
          margin: '0 0 12px',
          fontSize: 12, fontWeight: 700,
          color: '#ff2d78',
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          C · Nuclear Reset
        </h4>

        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-1)', lineHeight: 1.6 }}>
          Wipes the workspace back to a clean slate. All ingested documents, tags,
          wiki pages, syntheses, operation logs, Domains, and user namespaces are
          deleted from the database. Every project folder under your projects
          root is removed from disk.
        </p>

        <ul style={{ margin: '0 0 12px 18px', padding: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7 }}>
          <li><strong style={{ color: 'var(--text-1)' }}>Preserved:</strong> API keys, workspace path, appearance, agent config, schema migrations, bridge namespaces (Library / Inbox). Source files in <code style={{ fontFamily: 'monospace', color: 'var(--text-3)' }}>_Codex/</code> outside <code style={{ fontFamily: 'monospace', color: 'var(--text-3)' }}>_Domaines/</code> are not removed by this action.</li>
          <li><strong style={{ color: '#ff2d78' }}>Removed:</strong> all Domains, projects, threads, ingested documents, generated wiki pages on disk, and every folder under <code style={{ fontFamily: 'monospace', color: 'var(--text-3)' }}>{config.projectsRoot || '(no projectsRoot)'}</code>.</li>
        </ul>

        {config.projectsRoot ? (
          <div style={{ marginBottom: 12, padding: '8px 10px', background: 'var(--bg-0)', border: '1px solid var(--border-2)', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-3)' }}>
            Folders will be removed under: {config.projectsRoot}
          </div>
        ) : (
          <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(255,214,10,0.08)', border: '1px solid rgba(255,214,10,0.25)', borderRadius: 6, fontSize: 12, color: '#ffd60a' }}>
            No projects root configured — the database will be wiped, but no folders will be touched.
          </div>
        )}

        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          background: 'rgba(255,45,120,0.08)',
          border: '1px solid rgba(255,45,120,0.3)',
          borderRadius: 6,
          fontSize: 12,
          color: '#ff2d78',
          lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>This cannot be undone.</div>
          Type <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>RESET</span> below to unlock the button.
        </div>

        <input
          type="text"
          value={typed}
          onChange={(e) => { setTyped(e.target.value); setError(null) }}
          placeholder="RESET"
          disabled={running}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg-0)',
            border: '1px solid var(--border-2)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 13, fontFamily: 'monospace',
            color: 'var(--text-1)',
            outline: 'none',
            marginBottom: 10,
          }}
        />

        <button
          onClick={() => void handleReset()}
          disabled={!armed || running}
          style={{
            width: '100%',
            background: armed && !running ? '#ff2d78' : 'var(--bg-0)',
            color:      armed && !running ? '#000'    : 'var(--text-4)',
            border: 'none', borderRadius: 8,
            padding: '10px 16px',
            fontSize: 13, fontWeight: 700,
            cursor: armed && !running ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            transition: 'background 120ms',
          }}
        >
          {running ? 'Resetting…' : 'Nuclear Reset'}
        </button>

        {error && (
          <div style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'rgba(255,45,120,0.1)',
            border: '1px solid rgba(255,45,120,0.3)',
            borderRadius: 6,
            fontSize: 12, color: '#ff2d78',
          }}>
            {error}
          </div>
        )}

        {summary && (
          <div style={{
            marginTop: 12,
            padding: '10px 12px',
            background: 'rgba(0,255,136,0.08)',
            border: '1px solid rgba(0,255,136,0.3)',
            borderRadius: 6,
            fontSize: 12,
            color: '#00ff88',
            lineHeight: 1.7,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Reset complete.</div>
            <div style={{ color: 'var(--text-3)', fontFamily: 'monospace' }}>
              {summary.documents} document{summary.documents === 1 ? '' : 's'},{' '}
              {summary.tags} tag{summary.tags === 1 ? '' : 's'},{' '}
              {summary.wikiPages} wiki page{summary.wikiPages === 1 ? '' : 's'},{' '}
              {summary.syntheses} synthes{summary.syntheses === 1 ? 'is' : 'es'},{' '}
              {summary.operations} operation{summary.operations === 1 ? '' : 's'},{' '}
              {summary.domaines} domaine{summary.domaines === 1 ? '' : 's'},{' '}
              {summary.namespaces} namespace{summary.namespaces === 1 ? '' : 's'},{' '}
              {summary.foldersRemoved} folder{summary.foldersRemoved === 1 ? '' : 's'} removed.
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
