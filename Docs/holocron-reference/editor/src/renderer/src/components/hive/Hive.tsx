import { useEffect } from 'react'
import { useHiveStore } from '../../store/hiveStore'
import { HonchoCard } from './HonchoCard'
import { ValidationCard } from './ValidationCard'
import { IngestionCard } from './IngestionCard'
import { SynthesisCard } from './SynthesisCard'
import { FoundryCard } from './FoundryCard'
import { HermesCard } from './HermesCard'

/**
 * Hive — architecture-v4 Part 5 dashboard.
 *
 * Top-level tab between Codex and Domains. Grid of per-agent monitoring
 * cards. Session 5 ships six cards (Honcho / Synthesis / Foundry /
 * Validation / Ingestion / Hermes). Status + cost-attribution glyphs are
 * placeholders for now — per-card content is what's instrumented.
 *
 * Refresh strategy: on mount, kick `refreshAll()` once. Each card also
 * exposes its own refresh button (so the user can hot-reload a card's
 * data without re-querying the others). Stats are cached in the Hive store.
 */
export function Hive(): JSX.Element {
  const { refreshAll } = useHiveStore()

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        background: 'var(--bg-1)',
        padding: '20px 24px',
      }}
    >
      <header style={{ marginBottom: 18, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>Hive</h1>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Agent control room</span>
        <button
          onClick={() => void refreshAll()}
          title="Refresh all cards"
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: '1px solid var(--border-2)',
            borderRadius: 6,
            padding: '3px 10px',
            fontSize: 11,
            color: 'var(--text-3)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ⟳ Refresh
        </button>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 16,
        }}
      >
        <HonchoCard />
        <SynthesisCard />
        <FoundryCard />
        <ValidationCard />
        <IngestionCard />
        <HermesCard />
      </div>
    </div>
  )
}
