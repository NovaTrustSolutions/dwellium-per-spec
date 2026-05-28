import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { GeneralTab } from './GeneralTab'
import { ConnectionsTab } from './ConnectionsTab'
import { ModesTab } from './ModesTab'
import { AppearanceTab } from './AppearanceTab'
import { AgentTab } from './AgentTab'
import { ScribeTab } from './ScribeTab'
import { MaintenanceTab } from './MaintenanceTab'

type Tab = 'general' | 'connections' | 'modes' | 'appearance' | 'scribe' | 'agent' | 'maintenance'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general',     label: 'General',     icon: '⚙' },
  { id: 'connections', label: 'Connections', icon: '⚡' },
  { id: 'modes',       label: 'Modes',       icon: '◎' },
  { id: 'appearance',  label: 'Appearance',  icon: '◐' },
  { id: 'scribe',      label: 'Scribe',      icon: '✎' },
  { id: 'agent',       label: 'Agent',       icon: '✦' },
  { id: 'maintenance', label: 'Maintenance', icon: '☢' },
]

export function SettingsModal(): JSX.Element | null {
  const { settingsOpen, setSettingsOpen, settingsInitialTab, clearSettingsInitialTab } = useSettingsStore()
  const [activeTab, setActiveTab] = useState<Tab>('connections')

  const close = useCallback(() => setSettingsOpen(false), [setSettingsOpen])

  // Deep-link: external callers (e.g. MemoryPanel's "Nuclear resets → …" link)
  // set settingsInitialTab via openSettingsAt(). When the modal sees a non-null
  // value, it lands on that tab and clears the field so subsequent re-opens
  // fall back to the user's last-used tab (held in local state).
  useEffect(() => {
    if (settingsOpen && settingsInitialTab) {
      setActiveTab(settingsInitialTab as Tab)
      clearSettingsInitialTab()
    }
  }, [settingsOpen, settingsInitialTab, clearSettingsInitialTab])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    if (settingsOpen) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, close])

  if (!settingsOpen) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div
        style={{
          width: 720, height: 560,
          background: 'var(--bg-2)',
          borderRadius: 16,
          border: '1px solid var(--border-2)',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left sidebar */}
        <div style={{ width: 160, flexShrink: 0, background: 'var(--bg-1)', borderRight: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', padding: '20px 0' }}>
          <div style={{ padding: '0 16px 20px', borderBottom: '1px solid var(--border-1)', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase' }}>Settings</span>
          </div>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 16px',
                  background: isActive ? 'var(--bg-3)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 120ms',
                  marginBottom: 2,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{tab.icon}</span>
                <span style={{ fontSize: 13, color: isActive ? 'var(--text-1)' : 'var(--text-3)', fontWeight: isActive ? 600 : 400 }}>{tab.label}</span>
              </button>
            )
          })}
          <div style={{ marginTop: 'auto', padding: '16px' }}>
            <button
              onClick={close}
              style={{ width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '7px', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}
            >
              Close  esc
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
              {TABS.find((t) => t.id === activeTab)?.label}
            </h2>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {activeTab === 'general'     && <GeneralTab />}
            {activeTab === 'connections' && <ConnectionsTab />}
            {activeTab === 'modes'       && <ModesTab />}
            {activeTab === 'appearance'  && <AppearanceTab />}
            {activeTab === 'scribe'      && <ScribeTab />}
            {activeTab === 'agent'       && <AgentTab />}
            {activeTab === 'maintenance' && <MaintenanceTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
