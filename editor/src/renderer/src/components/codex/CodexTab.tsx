import { useState } from 'react'
import { Search } from './Search'
import { Wiki } from './Wiki'
import { Ingest } from './Ingest'
import { Graph } from './Graph'
import { Syntheses } from './Syntheses'
import { useCodexStore, type CodexSubTab } from '../../store/codexStore'

const SUB_TABS: Array<{ key: CodexSubTab; label: string; enabled: boolean; eta?: string }> = [
  { key: 'search',    label: 'Search',    enabled: true },
  { key: 'wiki',      label: 'Wiki',      enabled: true },
  { key: 'ingest',    label: 'Ingest',    enabled: true },
  { key: 'graph',     label: 'Graph',     enabled: true },
  // v4 Session 1 — analytics panel landed. Session 3 wired the
  // "Write synthesis" buttons on structural gaps to call Sonnet 4.6;
  // drafts list inside Codex → Syntheses (consolidation pass).
  { key: 'syntheses', label: 'Syntheses', enabled: true },
]

export function CodexTab(): JSX.Element {
  // Active sub-tab lives in codexStore so the Hive's SynthesisCard can
  // deep-link to a specific sub-tab via setActiveSubTab + activeTab=codex.
  const active    = useCodexStore((s) => s.activeSubTab)
  const setActive = useCodexStore((s) => s.setActiveSubTab)

  return (
    // flex:1 (not height:100%) so this fills the Shell content row in BOTH
    // axes — Shell wraps <CodexTab/> in a `flex flex-1 min-h-0` ROW with no
    // flex on the child, so height:100% gave full height but only content
    // width, which left the Graph/Ingest panes constrained.
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      {/* Sub-tab strip */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '0 24px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        {SUB_TABS.map((t) => (
          <SubTabButton
            key={t.key}
            label={t.label}
            active={active === t.key}
            enabled={t.enabled}
            tooltip={t.enabled ? undefined : `Coming in ${t.eta}`}
            onClick={() => t.enabled && setActive(t.key)}
          />
        ))}
      </div>

      {/* Content area — a flex column so the active sub-tab stretches to fill
          all remaining height/width (each sub-component's root is height:100%,
          which only resolves reliably against a flex parent). */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {active === 'search'    && <Search />}
        {active === 'wiki'      && <Wiki />}
        {active === 'ingest'    && <Ingest />}
        {active === 'graph'     && <Graph />}
        {active === 'syntheses' && <Syntheses />}
      </div>
    </div>
  )
}

function SubTabButton({
  label,
  active,
  enabled,
  tooltip,
  onClick,
}: {
  label: string
  active: boolean
  enabled: boolean
  tooltip?: string
  onClick: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const color = !enabled
    ? 'var(--text-dim)'
    : active
      ? 'var(--text-primary)'
      : hovered
        ? 'var(--text-primary)'
        : 'var(--text-secondary)'
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={tooltip}
      disabled={!enabled}
      style={{
        height: 36,
        padding: '0 16px',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--neon-blue)' : '2px solid transparent',
        cursor: enabled ? 'pointer' : 'not-allowed',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color,
        opacity: enabled ? 1 : 0.55,
        fontFamily: 'inherit',
        marginBottom: -1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
