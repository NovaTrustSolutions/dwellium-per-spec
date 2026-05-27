import { useSettingsStore } from '../../store/settingsStore'

export function GeneralTab(): JSX.Element {
  const { config, saveConfig } = useSettingsStore()
  const showIntake = config.intake?.showPromptOnNewThread !== false

  const setShowIntake = (next: boolean): void => {
    saveConfig({ intake: { ...config.intake, showPromptOnNewThread: next } })
  }

  return (
    <div style={{ overflowY: 'auto', maxHeight: '100%' }}>
      <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          New Thread Intake
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text-1)', marginBottom: 4 }}>
              Show intake prompt on new thread
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5 }}>
              When you load a thread for the first time, ask whether to drop reference documents into the thread folder.
            </p>
          </div>
          <button
            onClick={() => setShowIntake(!showIntake)}
            aria-pressed={showIntake}
            style={{
              flexShrink: 0,
              width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
              position: 'relative',
              background: showIntake ? 'var(--accent-green)' : 'var(--bg-0)',
              transition: 'background 200ms',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: showIntake ? 21 : 3,
              width: 20, height: 20, borderRadius: 10, background: '#fff',
              transition: 'left 200ms', display: 'block',
            }} />
          </button>
        </div>
      </div>
    </div>
  )
}
