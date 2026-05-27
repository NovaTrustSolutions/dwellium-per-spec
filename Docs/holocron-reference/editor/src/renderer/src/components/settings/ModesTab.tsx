import { useSettingsStore, AppMode } from '../../store/settingsStore'

interface ModeCard {
  id: AppMode
  label: string
  indicator: string
  color: string
  description: string
  bullets: string[]
}

const MODES: ModeCard[] = [
  {
    id: 'main',
    label: 'Main',
    indicator: '●',
    color: 'var(--accent-green)',
    description: 'Full persistent memory and Andy\'s complete context.',
    bullets: [
      'All messages saved to Honcho memory',
      'Previous conversations recalled',
      'Document context included in system prompt',
    ],
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    indicator: '●',
    color: 'var(--accent-yellow)',
    description: 'Ephemeral session — nothing is saved.',
    bullets: [
      'Memory OFF — no Honcho saving',
      'Fresh context on every message',
      'Session wiped on mode switch or close',
    ],
  },
  {
    id: 'research',
    label: 'Research',
    indicator: '●',
    color: 'var(--accent)',
    description: 'Isolated research session with Firecrawl tools.',
    bullets: [
      'Saves to a separate research-{timestamp} session',
      'Main Andy context completely isolated',
      'Web research via Firecrawl (when key is set)',
    ],
  },
]

export function ModesTab(): JSX.Element {
  const { config, setMode } = useSettingsStore()
  const currentMode = config.mode

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.6 }}>
        Choose a mode to instantly switch how the agent behaves. Mode is persisted across restarts.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MODES.map((mode) => {
          const isActive = currentMode === mode.id
          return (
            <button
              key={mode.id}
              onClick={() => setMode(mode.id)}
              style={{
                textAlign: 'left',
                background: isActive ? 'var(--bg-3)' : 'var(--bg-2)',
                border: `2px solid ${isActive ? mode.color : 'var(--border-1)'}`,
                borderRadius: 12,
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'border-color 150ms, background 150ms',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ color: mode.color, fontSize: 18, lineHeight: 1 }}>{mode.indicator}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{mode.label}</span>
                {isActive && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: mode.color, background: `color-mix(in srgb, ${mode.color} 15%, transparent)`, borderRadius: 20, padding: '2px 8px' }}>
                    Active
                  </span>
                )}
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{mode.description}</p>
              <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'none' }}>
                {mode.bullets.map((b) => (
                  <li key={b} style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 3, lineHeight: 1.5 }}>
                    <span style={{ color: mode.color, marginRight: 6 }}>›</span>{b}
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--bg-3)', borderRadius: 8, borderLeft: '3px solid var(--accent-orange)' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--accent-orange)' }}>Note:</strong> Switching modes takes effect immediately. When leaving Research mode, you will be prompted to keep or delete the research session from Honcho.
        </p>
      </div>
    </div>
  )
}
