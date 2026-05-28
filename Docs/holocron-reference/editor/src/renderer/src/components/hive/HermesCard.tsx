/**
 * Hermes card — architecture-v4 §4.5 §10 surface inside the Hive (Session 5).
 *
 * Surfaces:
 *   • Connection status     — Running / Not configured / Stopped / Error
 *   • Last message timestamp — relative ("4 min ago") + raw on hover
 *   • iCloud watch path      — when active, the resolved directory
 *   • Configure deep link    — Settings → Connections (Hermes section)
 *   • Start / Stop toggle    — flips both Telegram poll loop AND iCloud
 *
 * Status logic:
 *   • running && configured       → healthy
 *   • running && !configured      → warning (shouldn't happen, but defensive)
 *   • !running && configured      → idle (manual stop or boot not yet kicked)
 *   • !running && !configured     → idle with "Not configured" message
 *   • lastError                   → error
 *
 * Refresh: the Hive's `refreshAll` includes Hermes; the card also polls
 * every 8 s on its own (when mounted) so "Last message: just now" updates
 * after a Telegram exchange without manual ↻.
 */
import { useEffect } from 'react'
import { useHiveStore } from '../../store/hiveStore'
import { useSettingsStore } from '../../store/settingsStore'
import { CardShell } from './CardShell'

function fmtRelative(iso: string | null): string {
  if (!iso) return 'never'
  try {
    const then = new Date(iso).getTime()
    const diff = Math.max(0, Date.now() - then)
    const min = Math.floor(diff / 60_000)
    if (min < 1)  return 'just now'
    if (min < 60) return `${min} min ago`
    const hr = Math.floor(min / 60)
    if (hr < 24)  return `${hr}h ago`
    const days = Math.floor(hr / 24)
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return iso
  }
}

export function HermesCard(): JSX.Element {
  const { hermes, hermesLoading, refreshHermes, startHermes, stopHermes } = useHiveStore()
  const openSettingsAt = useSettingsStore((s) => s.openSettingsAt)

  // Self-polling: 8 s while mounted. Independent of the Hive's refreshAll
  // so the "lastMessageAt" stays fresh without forcing a heavy refresh.
  useEffect(() => {
    void refreshHermes()
    const t = setInterval(() => { void refreshHermes() }, 8000)
    return () => clearInterval(t)
  }, [refreshHermes])

  const running    = hermes?.running ?? false
  const configured = hermes?.configured ?? false
  const lastError  = hermes?.lastError ?? null

  const status: 'healthy' | 'warning' | 'error' | 'idle' =
    lastError                  ? 'error' :
    running && configured      ? 'healthy' :
    running && !configured     ? 'warning' :
    'idle'

  const statusMessage =
    !configured && !running     ? 'not configured' :
    !running && configured      ? 'stopped' :
    running                     ? 'listening' :
    undefined

  const handleToggle = async (): Promise<void> => {
    if (running) await stopHermes()
    else         await startHermes()
  }

  return (
    <CardShell
      title="Hermes"
      accentColor="var(--accent-cyan)"
      status={status}
      statusMessage={statusMessage}
      rightSlot={
        <button
          onClick={() => void refreshHermes()}
          disabled={hermesLoading}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text-4)',
            cursor: hermesLoading ? 'wait' : 'pointer', fontSize: 11, fontFamily: 'inherit', padding: 0,
          }}
          title="Refresh Hermes status"
        >
          {hermesLoading ? '↻ …' : '↻'}
        </button>
      }
    >
      {/* Primary status block — biggest text mirrors the other cards. */}
      <div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: running ? 'var(--accent-cyan)' : 'var(--text-2)',
            lineHeight: 1,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {hermes === null ? '–' : running ? 'on' : 'off'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          telegram bridge
        </div>
      </div>

      {/* Secondary metadata — last-message + iCloud watch path */}
      <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div>
          Last message: <span style={{ color: 'var(--text-2)' }} title={hermes?.lastMessageAt ?? ''}>
            {fmtRelative(hermes?.lastMessageAt ?? null)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
          iCloud watch: {hermes?.icloudWatching
            ? <span style={{ color: 'var(--text-3)' }} title={hermes.icloudWatching}>active</span>
            : <span>—</span>}
        </div>
        {lastError && (
          <div style={{ fontSize: 11, color: '#ff2d78' }} title={lastError}>
            error: {lastError.length > 50 ? `${lastError.slice(0, 50)}…` : lastError}
          </div>
        )}
      </div>

      {/* Actions — Start/Stop toggle + Configure deep link */}
      <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
        <button
          onClick={() => void handleToggle()}
          disabled={hermesLoading || (!configured && !running)}
          style={{
            flex: 1,
            background: running ? '#ff2d78' : 'var(--accent-cyan)',
            color: 'var(--bg-base)',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 700,
            cursor: hermesLoading || (!configured && !running) ? 'not-allowed' : 'pointer',
            opacity: hermesLoading || (!configured && !running) ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
          title={!configured && !running ? 'Configure Telegram in Settings first' : undefined}
        >
          {running ? 'Stop' : 'Start'}
        </button>
        <button
          onClick={() => openSettingsAt('connections')}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-1)',
            borderRadius: 6,
            padding: '6px 10px',
            color: 'var(--text-3)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Configure
        </button>
      </div>
    </CardShell>
  )
}
