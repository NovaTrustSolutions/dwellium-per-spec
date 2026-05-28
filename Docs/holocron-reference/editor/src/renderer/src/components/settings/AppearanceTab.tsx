import { useSettingsStore, ThemeId } from '../../store/settingsStore'
import { THEME_IDS, THEME_LABELS, applyTheme } from '../../themes'

const THEME_PREVIEWS: Record<ThemeId, { bg: string; panel: string; accent: string; text: string }> = {
  'holocron-dark': { bg: '#000', panel: '#1c1c1e', accent: '#0a84ff', text: '#fff' },
  'tokyo-night':   { bg: '#1a1b26', panel: '#16161e', accent: '#7aa2f7', text: '#c0caf5' },
  'dracula':       { bg: '#21222c', panel: '#282a36', accent: '#bd93f9', text: '#f8f8f2' },
  'nord':          { bg: '#2e3440', panel: '#3b4252', accent: '#88c0d0', text: '#eceff4' },
  'solarized-dark': { bg: '#002b36', panel: '#073642', accent: '#268bd2', text: '#fdf6e3' },
  'light':         { bg: '#f2f2f7', panel: '#fff', accent: '#007aff', text: '#1c1c1e' },
  'midnight-blue': { bg: '#0d0f1a', panel: '#131528', accent: '#6c8ebf', text: '#e2e4f0' },
  // Accent uses fey's signature peachy orange so the swatch is recognizable
  // as "fey" — Holocron's neon accents are still preserved at runtime.
  'fey':           { bg: '#000000', panel: '#0b0b0b', accent: '#ffa16c', text: '#ffffff' },
}

function ThemePreview({ id }: { id: ThemeId }): JSX.Element {
  const p = THEME_PREVIEWS[id]
  return (
    <div style={{ width: '100%', height: 52, borderRadius: 8, background: p.bg, overflow: 'hidden', position: 'relative', border: `1px solid ${p.text}20` }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', background: p.panel }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '30%', background: p.panel }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', gap: 4 }}>
        {[p.accent, p.text + '60', p.text + '30'].map((c, i) => (
          <div key={i} style={{ width: 24, height: 4, borderRadius: 2, background: c }} />
        ))}
      </div>
    </div>
  )
}

export function AppearanceTab(): JSX.Element {
  const { config, saveConfig } = useSettingsStore()
  const currentTheme = config.appearance.theme

  const selectTheme = (id: ThemeId): void => {
    applyTheme(id)
    saveConfig({ appearance: { theme: id } })
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.6 }}>
        Theme applies instantly using CSS custom properties. No restart needed.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {THEME_IDS.map((id) => {
          const isActive = currentTheme === id
          return (
            <button
              key={id}
              onClick={() => selectTheme(id)}
              style={{
                textAlign: 'left',
                background: isActive ? 'var(--bg-3)' : 'var(--bg-2)',
                border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border-1)'}`,
                borderRadius: 10,
                padding: 10,
                cursor: 'pointer',
                transition: 'border-color 120ms',
              }}
            >
              <ThemePreview id={id} />
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{THEME_LABELS[id]}</span>
                {isActive && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--accent)', display: 'inline-block' }} />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
