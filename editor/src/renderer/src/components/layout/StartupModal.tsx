import { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useSessionStore } from '../../store/sessionStore'
import { useSidebarStore } from '../../store/sidebarStore'
import { useScribeStore } from '../../store/scribeStore'

export function StartupModal(): JSX.Element {
  const { saveConfig } = useSettingsStore()
  const [holocronRoot, setHolocronRoot] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleBrowse = async (): Promise<void> => {
    const folderPath = await window.electronAPI.workspaceBrowse()
    if (folderPath) {
      setHolocronRoot(folderPath)
      setError('')
      inputRef.current?.focus()
    }
  }

  const handleSubmit = async (): Promise<void> => {
    if (!holocronRoot || !sessionName.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.sessionCreate(holocronRoot, sessionName.trim())
      if (!result.ok) {
        setError(result.error ?? 'Failed to create session')
        setLoading(false)
        return
      }
      saveConfig({
        holocronRoot,
        activeSessionId: result.id,
        activeSessionName: sessionName.trim(),
        workspace: { path: holocronRoot },
      })
      await window.electronAPI.workspaceSetPath(holocronRoot)
      await window.electronAPI.honchoInit(result.id)
      const honchoResult = await window.electronAPI.honchoInit(result.id)
      if (honchoResult) {
        useScribeStore.getState().setHonchoCtx({ sessionId: honchoResult.sessionId })
      }
      useSidebarStore.getState().initWithPath(result.path)
      useSessionStore.getState().setShowStartupModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') void handleSubmit()
  }

  const canSubmit = !!holocronRoot && !!sessionName.trim() && !loading

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)',
      }}
    >
      <div
        style={{
          width: 480,
          backgroundColor: 'var(--bg-panel)',
          borderRadius: 'var(--radius-lg)',
          padding: '36px 32px 28px',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Heading */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Welcome to{' '}
            <span style={{ color: 'var(--neon-blue)', fontFamily: 'monospace' }}>Agenteryx</span>
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Choose a root folder and name your first session to get started.
          </p>
        </div>

        {/* Agenteryx Root (config key still stored as `holocronRoot` for back-compat) */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: 8 }}>
            Agenteryx Root
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <span
              style={{
                flex: 1, fontSize: 11, fontFamily: 'monospace',
                color: holocronRoot ? 'var(--neon-blue)' : 'var(--text-dim)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 6, padding: '8px 10px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                direction: 'rtl', textAlign: 'left',
              }}
              title={holocronRoot || undefined}
            >
              {holocronRoot || 'No folder selected'}
            </span>
            <button
              onClick={() => void handleBrowse()}
              style={{
                flexShrink: 0,
                backgroundColor: 'var(--bg-card-hover)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 6, padding: '8px 16px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'border-color 150ms, background 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon-blue)'; e.currentTarget.style.color = 'var(--neon-blue)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            >
              Browse
            </button>
          </div>
        </div>

        {/* Session Name */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: 8 }}>
            First Session Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={sessionName}
            onChange={(e) => { setSessionName(e.target.value); setError('') }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. My First Session"
            style={{
              width: '100%', boxSizing: 'border-box',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 6, padding: '8px 10px',
              fontSize: 13, color: 'var(--text-primary)',
              outline: 'none', fontFamily: 'inherit',
              transition: 'border-color 150ms, box-shadow 150ms',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--neon-blue)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,212,255,0.15)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 16, padding: '8px 12px', backgroundColor: 'rgba(255,45,120,0.1)', border: '1px solid rgba(255,45,120,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--neon-pink)' }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          style={{
            width: '100%', padding: '11px',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            backgroundColor: canSubmit ? 'var(--neon-blue)' : 'var(--bg-card)',
            color: canSubmit ? '#000' : 'var(--text-dim)',
            border: 'none', borderRadius: 8,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'background 150ms, box-shadow 150ms',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.boxShadow = '0 0 16px rgba(0,212,255,0.3)' }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
        >
          {loading ? 'Creating…' : 'Create Session & Start'}
        </button>
      </div>
    </div>
  )
}
