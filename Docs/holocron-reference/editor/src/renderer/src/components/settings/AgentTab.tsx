import { useSettingsStore, HolocronConfig, CrossThreadMode } from '../../store/settingsStore'

const CROSS_THREAD_OPTIONS: Array<{ value: CrossThreadMode; label: string; hint: string }> = [
  { value: 'always-ask',    label: 'Always Ask',          hint: 'Agent requests permission before accessing any other thread.' },
  { value: 'free',          label: 'Free Mode',           hint: 'Agent searches other threads automatically. Best for synthesis work.' },
  { value: 'current-only',  label: 'Current Thread Only', hint: 'Agent is locked to the active thread. No cross-thread access.' },
]

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }): JSX.Element {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
      {hint && <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }): JSX.Element {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
      onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
      onBlur={(e) => { e.target.style.borderColor = 'var(--border-1)' }}
    />
  )
}

export function AgentTab(): JSX.Element {
  const { config, saveConfig } = useSettingsStore()

  const setAgent = (partial: Partial<HolocronConfig['agent']>): void =>
    saveConfig({ agent: { ...config.agent, ...partial } })
  const setAi = (partial: Partial<HolocronConfig['ai']>): void =>
    saveConfig({ ai: { ...config.ai, ...partial } })

  return (
    <div style={{ overflowY: 'auto', maxHeight: '100%' }}>
      <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
        <Field label="Your Name" hint="Used in system prompts to address you.">
          <Input value={config.agent.userName} onChange={(v) => setAgent({ userName: v })} placeholder="Andy" />
        </Field>
        <Field label="Agent Name" hint="The name the agent uses for itself.">
          <Input value={config.agent.agentName} onChange={(v) => setAgent({ agentName: v })} placeholder="Agenteryx" />
        </Field>
      </div>

      <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
        <Field label="Custom System Prompt" hint="Leave blank to use the default. Overrides the built-in prompt in Main mode.">
          <textarea
            value={config.agent.systemPrompt}
            onChange={(e) => setAgent({ systemPrompt: e.target.value })}
            placeholder={`You are ${config.agent.agentName}, a personal AI assistant and second brain for ${config.agent.userName}. Be concise, intelligent, and helpful.`}
            rows={6}
            style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '8px 10px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border-1)' }}
          />
        </Field>
      </div>

      <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Cross-Thread Access
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5 }}>
          Controls whether the agent can read other threads in the active project.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CROSS_THREAD_OPTIONS.map((opt) => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="radio"
                name="cross-thread-mode"
                checked={config.crossThreadMode === opt.value}
                onChange={() => saveConfig({ crossThreadMode: opt.value })}
                style={{ marginTop: 3, accentColor: 'var(--accent)' }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{opt.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5 }}>{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '16px' }}>
        <Field label={`Temperature: ${config.ai.temperature.toFixed(2)}`} hint="Higher = more creative. Lower = more deterministic.">
          <input
            type="range" min="0" max="1" step="0.05"
            value={config.ai.temperature}
            onChange={(e) => setAi({ temperature: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>
            <span>Precise (0.0)</span><span>Balanced (0.5)</span><span>Creative (1.0)</span>
          </div>
        </Field>

        <Field label="Max Tokens" hint="Maximum tokens per response.">
          <input
            type="number" min="64" max="32768" step="64"
            value={config.ai.maxTokens}
            onChange={(e) => setAi({ maxTokens: parseInt(e.target.value) || 1024 })}
            style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border-1)' }}
          />
        </Field>

        <Field label="Context Window (tokens)" hint="Used for the context usage bar in chat.">
          <input
            type="number" min="1024" max="200000" step="1024"
            value={config.ai.contextWindow}
            onChange={(e) => setAi({ contextWindow: parseInt(e.target.value) || 8192 })}
            style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border-1)' }}
          />
        </Field>
      </div>
    </div>
  )
}
