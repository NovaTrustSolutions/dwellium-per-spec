import { useState } from 'react'
import { useHiveStore, type HiveDream } from '../../store/hiveStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useSessionStore } from '../../store/sessionStore'
import { CardShell } from './CardShell'
import { IconChevronDown, IconChevronRight } from '../Icons'

/**
 * HONCHO card — architecture-v4 Part 5.1 + Dreams panel (Part 5.3).
 *
 * Surfaces:
 *   - Active sessions count (threads with non-empty honchoSessionId)
 *   - synthesisReady threads (Memory files where summaries ≥ 3 OR
 *     dream insights ≥ 3 — the Hive's "ready to admit to Codex" flag)
 *   - Conclusions count (best-effort; hidden when endpoint unsupported)
 *   - "Schedule Dream" button — calls honcho:schedule-dream directly
 *   - Memory panel deep-link — opens the active thread's Memory panel
 *     (jump to Scribe tab, open chat drawer programmatically)
 *   - Dreams panel: Approve → synthesis · Reject · Defer
 *
 * Approve flow: takes the dream text + originating thread context, calls
 * synthesis:generate-gap-bridge under the hood (reusing the same Sonnet
 * pipeline as gap-bridge — the architecture says "dream becomes a synthesis
 * document" so the input shape adapts but the writer is the same).
 */
function fmtTs(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}

export function HonchoCard(): JSX.Element {
  const { honcho, honchoLoading, refreshHoncho, rejectedDreamIds, deferredDreamIds, approvingDreamIds, markDreamRejected, markDreamDeferred, markDreamApproving, refreshDrafts } = useHiveStore()
  const { openSettingsAt } = useSettingsStore()
  const setActiveTab = useSessionStore((s) => s.setActiveTab)

  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleNote, setScheduleNote] = useState<string | null>(null)
  const [openDreamId, setOpenDreamId] = useState<string | null>(null)
  const [approveResult, setApproveResult] = useState<{ ok: boolean; filePath?: string; error?: string } | null>(null)

  const visibleDreams: HiveDream[] = (honcho?.dreams ?? []).filter(
    (d) => !rejectedDreamIds.has(d.id) && !deferredDreamIds.has(d.id),
  )
  const status: 'healthy' | 'warning' | 'idle' =
    (honcho?.activeSessionsCount ?? 0) > 0 ? 'healthy' : 'idle'

  const handleScheduleDream = async (): Promise<void> => {
    if (scheduleBusy) return
    setScheduleBusy(true)
    setScheduleNote(null)
    try {
      const res = await window.electronAPI.honchoScheduleDream('omni')
      if (res.ok) {
        setScheduleNote(`Dream scheduled (status ${res.status}). Results will populate the panel after Honcho processes.`)
      } else {
        setScheduleNote(`Schedule failed: ${res.error ?? 'unknown'} (status ${res.status})`)
      }
    } catch (err) {
      setScheduleNote(`Schedule failed: ${(err as Error).message}`)
    } finally {
      setScheduleBusy(false)
      setTimeout(() => setScheduleNote(null), 8000)
    }
  }

  /** Approve a dream → synthesis document. Uses the gap-bridge generator
   *  with the dream's insight as the "cluster A" content and the thread
   *  context as "cluster B". Pragmatic adapter — the prompt asks for a
   *  bridge between "this insight" and "the user's broader work", which
   *  matches the architecture's "approved dream becomes a synthesis doc". */
  const handleApprove = async (dream: HiveDream): Promise<void> => {
    if (approvingDreamIds.has(dream.id)) return
    markDreamApproving(dream.id, true)
    setApproveResult(null)
    try {
      const dreamSlug = `dream-${dream.queriedAt.replace(/[:.]/g, '-').slice(0, 19)}-${dream.threadName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`
      const res = await window.electronAPI.synthesisGenerateGapBridge({
        gapId: dreamSlug,
        clusterA: {
          id: 0,
          name: `Dream from ${dream.threadName}`,
          topTags: [dream.trigger],
        },
        clusterB: {
          id: 1,
          name: `User's broader work`,
          topTags: ['cross-thread synthesis'],
        },
        topDocs: [{
          title: `Insight from ${dream.projectName} · ${dream.threadName}`,
          sourcePath: dream.threadPath,
        }],
        domaineId: null,
        // Dream-derived syntheses are tagged distinctly from analytics-driven
        // gap-bridge ones so downstream queries can filter (architecture-v4
        // §7.5). The writer pipeline + prompt are identical.
        synthesisType: 'honcho-dream',
      })
      setApproveResult(res)
      if (res.ok) {
        markDreamRejected(dream.id)  // dismiss from panel — it's now a doc
        await refreshDrafts()
      }
    } catch (err) {
      setApproveResult({ ok: false, error: (err as Error).message })
    } finally {
      markDreamApproving(dream.id, false)
      setTimeout(() => setApproveResult(null), 10000)
    }
  }

  return (
    <CardShell
      title="Honcho"
      accentColor="var(--accent-cyan)"
      status={status}
      statusMessage={honcho ? `${honcho.activeSessionsCount}/${honcho.totalThreadCount} threads bound` : undefined}
      rightSlot={
        <button
          onClick={() => void refreshHoncho()}
          disabled={honchoLoading}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', padding: 0 }}
          title="Refresh Honcho stats"
        >
          {honchoLoading ? '…' : '⟳'}
        </button>
      }
    >
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4, fontSize: 11 }}>
        <span style={{ color: 'var(--text-4)' }}>Active sessions:</span>
        <span>{honcho?.activeSessionsCount ?? '—'} <span style={{ color: 'var(--text-5)' }}>of {honcho?.totalThreadCount ?? '—'} threads</span></span>

        <span style={{ color: 'var(--text-4)' }}>Synthesis-ready:</span>
        <span style={{ color: (honcho?.synthesisReadyCount ?? 0) > 0 ? 'var(--accent-cyan)' : 'var(--text-2)' }}>
          {honcho?.synthesisReadyCount ?? '—'}
          {(honcho?.synthesisReadyCount ?? 0) > 0 && <span style={{ color: 'var(--text-5)' }}> · thread{honcho!.synthesisReadyCount === 1 ? '' : 's'} ready for Codex admit</span>}
        </span>

        {honcho?.conclusionsCount !== null && honcho?.conclusionsCount !== undefined && (
          <>
            <span style={{ color: 'var(--text-4)' }}>Conclusions:</span>
            <span>{honcho.conclusionsCount} <span style={{ color: 'var(--text-5)' }}>· written by CoPaw + agents</span></span>
          </>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => void handleScheduleDream()}
          disabled={scheduleBusy}
          title="POST /v3/.../schedule_dream — kicks the server-side Dreaming Agent (omni)"
          style={{
            background: scheduleBusy ? 'var(--bg-3)' : 'rgba(0,212,212,0.10)',
            border: '1px solid rgba(0,212,212,0.45)',
            color: scheduleBusy ? 'var(--text-5)' : 'var(--accent-cyan)',
            borderRadius: 6, padding: '4px 10px',
            fontSize: 11, fontWeight: 600,
            cursor: scheduleBusy ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {scheduleBusy ? 'Scheduling…' : '✦ Schedule Dream'}
        </button>
        <button
          onClick={() => {
            // Memory panel lives on the Scribe tab's chat pane. Switch tabs;
            // the user expands the Memory drawer themselves from there.
            setActiveTab('scribe')
          }}
          title="Open the active thread's Memory panel (Scribe tab → chat header → Memory)"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-2)',
            color: 'var(--text-3)',
            borderRadius: 6, padding: '4px 10px',
            fontSize: 11, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          → Memory panel
        </button>
        <button
          onClick={() => openSettingsAt('maintenance')}
          title="Settings → Maintenance for Clear / Nuclear actions"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-2)',
            color: 'var(--text-4)',
            borderRadius: 6, padding: '4px 10px',
            fontSize: 11,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          → Maintenance
        </button>
      </div>

      {scheduleNote && (
        <p style={{ fontSize: 10, color: 'var(--text-4)', margin: 0, fontStyle: 'italic' }}>{scheduleNote}</p>
      )}

      {/* Dreams panel */}
      <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Dreams</span>
          <span style={{ fontSize: 10, color: 'var(--text-5)' }}>({visibleDreams.length})</span>
        </div>
        {visibleDreams.length === 0 ? (
          <p style={{ fontSize: 10, color: 'var(--text-5)', margin: 0, fontStyle: 'italic' }}>
            No dreams pending. Schedule one above or wait for the next thread-load trigger.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
            {visibleDreams.map((d) => {
              const isOpen = openDreamId === d.id
              const isApproving = approvingDreamIds.has(d.id)
              return (
                <div key={d.id} style={{ border: '1px solid var(--border-2)', borderRadius: 6, background: 'var(--bg-3)' }}>
                  <button
                    onClick={() => setOpenDreamId(isOpen ? null : d.id)}
                    style={{
                      width: '100%', background: 'transparent', border: 'none',
                      padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6,
                      cursor: 'pointer', color: 'var(--text-2)', fontSize: 11,
                      textAlign: 'left', fontFamily: 'inherit',
                    }}
                  >
                    {isOpen ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
                    <span style={{ fontSize: 9, color: 'var(--text-4)' }}>[{d.trigger}]</span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{d.projectName} · {d.threadName}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-5)', marginLeft: 'auto' }}>{fmtTs(d.queriedAt)}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '4px 10px 10px', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      <div style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{d.insight}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => void handleApprove(d)}
                          disabled={isApproving}
                          style={{
                            background: isApproving ? 'var(--bg-3)' : 'rgba(0,212,212,0.12)',
                            border: '1px solid rgba(0,212,212,0.45)',
                            color: isApproving ? 'var(--text-5)' : 'var(--accent-cyan)',
                            borderRadius: 4, padding: '3px 8px',
                            fontSize: 10, fontWeight: 600,
                            cursor: isApproving ? 'wait' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {isApproving ? 'Generating…' : '✦ Approve → synthesis'}
                        </button>
                        <button
                          onClick={() => markDreamDeferred(d.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-2)',
                            color: 'var(--text-3)',
                            borderRadius: 4, padding: '3px 8px',
                            fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          Defer
                        </button>
                        <button
                          onClick={() => markDreamRejected(d.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,45,120,0.35)',
                            color: '#ff2d78',
                            borderRadius: 4, padding: '3px 8px',
                            fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {approveResult && (
          <p style={{
            marginTop: 6, fontSize: 10,
            color: approveResult.ok ? 'var(--accent-green)' : 'var(--accent-pink)',
            fontStyle: 'italic',
          }}>
            {approveResult.ok
              ? `Synthesis written to ${approveResult.filePath ?? '(unknown path)'}. Chokidar will pick it up on next scan.`
              : `Approve failed: ${approveResult.error ?? 'unknown'}`}
          </p>
        )}
      </div>
    </CardShell>
  )
}
