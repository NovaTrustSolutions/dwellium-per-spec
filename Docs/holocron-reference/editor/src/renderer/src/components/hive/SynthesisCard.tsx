import { useEffect, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useCodexStore } from '../../store/codexStore'
import { CardShell } from './CardShell'

/**
 * SYNTHESIS card — architecture-v4 Part 5.1 (consolidated).
 *
 * Slim status indicator. Everything synthesis-related (draft list, Open in
 * Scribe, Show in Finder, regeneration triggers) lives in Codex → Syntheses.
 * This card shows:
 *   - Total draft count
 *   - Most recent draft timestamp
 *   - A link that switches to the Codex tab + selects the Syntheses sub-tab
 *
 * Pre-consolidation this card listed every draft inline with action buttons.
 * That created two homes for the same content (Hive + Codex), which was the
 * confusion this consolidation fixes. The Hive card is now an at-a-glance
 * health signal — drill into Codex → Syntheses for the catalogue.
 */
interface SynthesisDraftLite {
  id: string
  title: string
  createdAt: string
  diskPath: string | null
}

function fmtTs(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}

export function SynthesisCard(): JSX.Element {
  const setActiveTab = useSessionStore((s) => s.setActiveTab)
  const setActiveCodexTab = useCodexStore((s) => s.setActiveSubTab)
  const [drafts, setDrafts] = useState<SynthesisDraftLite[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const refresh = async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await window.electronAPI.hiveListSyntheses(5)
      if (res.ok) {
        setDrafts(res.drafts.map((d) => ({
          id: d.id,
          title: d.title,
          createdAt: d.createdAt,
          diskPath: d.diskPath,
        })))
      }
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }

  useEffect(() => { void refresh() }, [])

  const latest = drafts[0] ?? null
  const status: 'healthy' | 'idle' = drafts.length > 0 ? 'healthy' : 'idle'

  const handleOpenInCodex = (): void => {
    // Drill in: switch top-level tab + select the Syntheses sub-tab inside
    // Codex. The codexStore drives sub-tab state; on next mount the Syntheses
    // panel is what renders.
    setActiveCodexTab('syntheses')
    setActiveTab('codex')
  }

  return (
    <CardShell
      title="Synthesis"
      accentColor="#a78bfa"
      status={status}
      statusMessage={`${drafts.length} draft${drafts.length === 1 ? '' : 's'}`}
      rightSlot={
        <button
          onClick={() => void refresh()}
          disabled={loading}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 11, padding: 0 }}
          title="Refresh synthesis status"
        >
          {loading ? '…' : '⟳'}
        </button>
      }
    >
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.55 }}>
        Sonnet-written bridge documents. Everything synthesis-related lives in <strong style={{ color: 'var(--text-2)' }}>Codex → Syntheses</strong> — structural-gap drafting, the recent-drafts catalogue, Open in Scribe.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4, fontSize: 11 }}>
        <span style={{ color: 'var(--text-4)' }}>Drafts:</span>
        <span style={{ color: 'var(--text-2)' }}>{loaded ? drafts.length : '—'}</span>
        <span style={{ color: 'var(--text-4)' }}>Last generated:</span>
        <span>{latest ? fmtTs(latest.createdAt) : <em style={{ color: 'var(--text-5)' }}>none yet</em>}</span>
        {latest && (
          <>
            <span style={{ color: 'var(--text-4)' }}>Most recent:</span>
            <span style={{ color: 'var(--text-2)' }} title={latest.diskPath ?? ''}>{latest.title}</span>
          </>
        )}
      </div>

      <button
        onClick={handleOpenInCodex}
        style={{
          alignSelf: 'flex-start',
          background: 'rgba(167,139,250,0.10)',
          border: '1px solid rgba(167,139,250,0.45)',
          color: '#a78bfa',
          borderRadius: 6, padding: '4px 10px',
          fontSize: 11, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        → Codex → Syntheses
      </button>
    </CardShell>
  )
}
