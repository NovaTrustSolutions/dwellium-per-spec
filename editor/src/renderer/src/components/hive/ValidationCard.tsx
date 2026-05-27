import { useState } from 'react'
import { useHiveStore } from '../../store/hiveStore'
import { CardShell } from './CardShell'

/**
 * VALIDATION card — architecture-v4 Part 4.3 + Part 5.1.
 * Surfaces the rule-based validation agent: orphan / zombie / dead-link
 * counts, last-sweep timestamp, "Run sweep now" button. The boot self-
 * healing sequence now runs sweepOrphans too (Session 3 addition in
 * main/index.ts) so the counts here should usually be 0.
 */
function fmtTs(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}

export function ValidationCard(): JSX.Element {
  const { validation, validationLoading, refreshValidation } = useHiveStore()
  const [sweepBusy, setSweepBusy] = useState(false)
  const [sweepResult, setSweepResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleRunSweep = async (): Promise<void> => {
    if (sweepBusy) return
    setSweepBusy(true)
    setSweepResult(null)
    try {
      const r = await window.electronAPI.hiveRunValidationSweep()
      if (r.ok && r.summary) {
        const s = r.summary
        setSweepResult({
          ok: true,
          message: `Swept ${s.orphanTagsSwept} tag${s.orphanTagsSwept === 1 ? '' : 's'} + ${s.orphanWikiPagesSwept} wiki page${s.orphanWikiPagesSwept === 1 ? '' : 's'} · purged ${s.deadLinksPurged} dead link${s.deadLinksPurged === 1 ? '' : 's'}.`,
        })
        await refreshValidation()
      } else {
        setSweepResult({ ok: false, message: `Sweep failed: ${r.error ?? 'unknown'}` })
      }
    } catch (err) {
      setSweepResult({ ok: false, message: `Sweep failed: ${(err as Error).message}` })
    } finally {
      setSweepBusy(false)
      setTimeout(() => setSweepResult(null), 10000)
    }
  }

  const counts = {
    orphans: validation?.orphanTagCount ?? null,
    zombies: validation?.zombieWikiDocCount ?? null,
    deadLinks: validation?.deadLinkCount ?? null,
  }
  // Status: green if all counts known + zero; warning if any > 0; idle if unknown.
  const allZero = counts.orphans === 0 && counts.zombies === 0 && (counts.deadLinks ?? 0) === 0
  const anyNonZero = (counts.orphans ?? 0) > 0 || (counts.zombies ?? 0) > 0 || (counts.deadLinks ?? 0) > 0
  const status: 'healthy' | 'warning' | 'idle' = allZero ? 'healthy' : anyNonZero ? 'warning' : 'idle'

  return (
    <CardShell
      title="Validation"
      accentColor="var(--accent-green)"
      status={status}
      statusMessage={
        validation
          ? `Last sweep ${fmtTs(validation.lastSweepAt)}`
          : undefined
      }
      rightSlot={
        <button
          onClick={() => void refreshValidation()}
          disabled={validationLoading}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 11, padding: 0 }}
          title="Refresh validation stats"
        >
          {validationLoading ? '…' : '⟳'}
        </button>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4, fontSize: 11 }}>
        <span style={{ color: 'var(--text-4)' }}>Orphan tags:</span>
        <span style={{ color: (counts.orphans ?? 0) > 0 ? 'var(--accent-orange)' : 'var(--text-2)' }}>
          {counts.orphans ?? '—'}
        </span>
        <span style={{ color: 'var(--text-4)' }}>Zombie wiki docs:</span>
        <span style={{ color: (counts.zombies ?? 0) > 0 ? 'var(--accent-orange)' : 'var(--text-2)' }}>
          {counts.zombies ?? '—'}
        </span>
        <span style={{ color: 'var(--text-4)' }}>Dead links (last sweep):</span>
        <span style={{ color: (counts.deadLinks ?? 0) > 0 ? 'var(--accent-orange)' : 'var(--text-2)' }}>
          {counts.deadLinks ?? '—'}
        </span>
      </div>

      <button
        onClick={() => void handleRunSweep()}
        disabled={sweepBusy}
        title="Run scanDeadLinks + scanOrphans + sweepOrphans + purgeDeadLinks + runHealthScan in one pass"
        style={{
          alignSelf: 'flex-start',
          background: sweepBusy ? 'var(--bg-3)' : 'rgba(48,209,88,0.10)',
          border: '1px solid rgba(48,209,88,0.45)',
          color: sweepBusy ? 'var(--text-5)' : 'var(--accent-green)',
          borderRadius: 6, padding: '4px 10px',
          fontSize: 11, fontWeight: 600,
          cursor: sweepBusy ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {sweepBusy ? 'Sweeping…' : 'Run sweep now'}
      </button>

      {sweepResult && (
        <p style={{ fontSize: 10, color: sweepResult.ok ? 'var(--accent-green)' : 'var(--accent-pink)', margin: 0, fontStyle: 'italic' }}>
          {sweepResult.message}
        </p>
      )}

      {/* Health trend — last N sweeps. Tiny inline bar set; just a count
       *  per row for now. Sparkline = future polish. */}
      {validation && validation.recentSweeps.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 6, fontSize: 10, color: 'var(--text-4)' }}>
          <div style={{ marginBottom: 3 }}>Recent sweeps (newest first)</div>
          {validation.recentSweeps.slice(0, 5).map((r, i) => (
            <div key={`${r.at}-${i}`} style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--text-5)' }}>{fmtTs(r.at)}</span>
              <span style={{ color: 'var(--text-3)' }}>{r.kind}</span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}
