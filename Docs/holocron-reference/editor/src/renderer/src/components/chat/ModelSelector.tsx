import { useState, useRef, useEffect, JSX } from 'react'
import { useSettingsStore, HolocronConfig, ActiveProvider } from '../../store/settingsStore'

interface ModelOption {
  id: string                                // dropdown key
  label: string                             // display text
  icon: string                              // small leading glyph
  provider: ActiveProvider
  model?: string                            // when set, also writes to <provider>.model
  requiresKey?: 'gemini' | 'anthropic'      // gates enabled/disabled
}

const OPTIONS: ModelOption[] = [
  { id: 'lmstudio',     label: 'LM Studio (local)', icon: '⚡', provider: 'lmstudio' },
  { id: 'gemini-flash', label: 'Gemini Flash',      icon: '✦', provider: 'gemini',    model: 'gemini-2.5-flash',  requiresKey: 'gemini' },
  { id: 'gemini-pro',   label: 'Gemini Pro',        icon: '✦', provider: 'gemini',    model: 'gemini-2.5-pro',    requiresKey: 'gemini' },
  { id: 'claude',       label: 'Claude Sonnet',     icon: '✦', provider: 'anthropic', model: 'claude-sonnet-4-6', requiresKey: 'anthropic' },
]

function currentOptionId(config: HolocronConfig): string {
  if (config.activeProvider === 'gemini') {
    return config.gemini.model === 'gemini-2.5-pro' ? 'gemini-pro' : 'gemini-flash'
  }
  if (config.activeProvider === 'anthropic') return 'claude'
  return 'lmstudio'
}

function isDisabled(opt: ModelOption, config: HolocronConfig): boolean {
  if (!opt.requiresKey) return false
  return !config[opt.requiresKey].apiKey.trim()
}

export function ModelSelector(): JSX.Element {
  const config = useSettingsStore((s) => s.config)
  const saveConfig = useSettingsStore((s) => s.saveConfig)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const currentId = currentOptionId(config)
  const current = OPTIONS.find((o) => o.id === currentId) ?? OPTIONS[0]

  const select = (opt: ModelOption): void => {
    if (isDisabled(opt, config)) return
    const partial: Partial<HolocronConfig> = { activeProvider: opt.provider }
    if (opt.provider === 'gemini' && opt.model) {
      partial.gemini = { ...config.gemini, model: opt.model }
    } else if (opt.provider === 'anthropic' && opt.model) {
      partial.anthropic = { ...config.anthropic, model: opt.model }
    }
    saveConfig(partial)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch model — affects the next message"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: 'transparent',
          border: '1px solid var(--border-1)',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'var(--accent-orange)',
          cursor: 'pointer',
          transition: 'background 120ms',
        }}
      >
        <span style={{ fontSize: 11 }}>{current.icon}</span>
        <span>{current.label}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 50,
            minWidth: 200,
            background: 'var(--bg-3)',
            border: '1px solid var(--border-1)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: 4,
          }}
        >
          {OPTIONS.map((opt) => {
            const disabled = isDisabled(opt, config)
            const active = opt.id === currentId
            return (
              <button
                key={opt.id}
                onClick={() => select(opt)}
                disabled={disabled}
                title={disabled ? 'Add API key in Settings → Connections' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 10px',
                  background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  textAlign: 'left',
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: disabled ? 'var(--text-4)' : 'var(--text-1)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.55 : 1,
                  transition: 'background 100ms',
                }}
                onMouseOver={(e) => { if (!disabled && !active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseOut={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ width: 14, textAlign: 'center' }}>
                  {disabled ? '🔒' : opt.icon}
                </span>
                <span style={{ flex: 1 }}>{opt.label}</span>
                {active && <span style={{ fontSize: 11, color: 'var(--accent-orange)' }}>•</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
