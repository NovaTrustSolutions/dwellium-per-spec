import { useState, useCallback, useEffect, JSX } from 'react'
import { TitleBar } from './TitleBar'
import { PanelDivider } from './PanelDivider'
import { VerticalNav } from './VerticalNav'
import { Sidebar } from './Sidebar'
import { ScribePane } from '../scribe/ScribePane'
import { ChatPane } from '../chat/ChatPane'
import { Domaines } from './Domaines'
import { CodexTab } from '../codex'
import { HUD } from '../hud'
import { Hive } from '../hive'
import { Foundry } from '../foundry'
import { useSessionStore } from '../../store/sessionStore'
import { IconPanelRight } from '../Icons'

const SIDEBAR_MIN = 160
const SIDEBAR_MAX = 480
const CHAT_MIN = 200
const CHAT_MAX = 520

export function Shell(): JSX.Element {
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [chatWidth, setChatWidth] = useState(340)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Session 8 Part B — the horizontal tab bar is gone; tab routing is owned
  // by VerticalNav now, and it reads/writes `activeTab` directly through the
  // session store. Shell only needs `activeTab` for the conditional content
  // branches below.
  const { activeTab } = useSessionStore()

  const onSidebarDrag = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w + delta)))
  }, [])

  const onChatDrag = useCallback((delta: number) => {
    setChatWidth((w) => Math.max(CHAT_MIN, Math.min(CHAT_MAX, w - delta)))
  }, [])

  // Keyboard shortcuts: Cmd+Shift+1 = sidebar, Cmd+Shift+3 = chat.
  // Survives the Part B restructure unchanged — these toggles still drive
  // the same local state; only the visible buttons relocated (sidebar →
  // Scribe sub-header; chat → ChatPane sub-header + re-expand strip).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey && e.shiftKey) {
        if (e.key === '1') { e.preventDefault(); setSidebarCollapsed((v) => !v) }
        if (e.key === '3') { e.preventDefault(); setChatCollapsed((v) => !v) }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--bg-base)', userSelect: 'none' } as React.CSSProperties}
    >
      <TitleBar />

      {/* Session 8 Part B layout — TitleBar above, then a horizontal row of
       *  [VerticalNav | content column]. Replaces the prior TitleBar / tab-bar
       *  / content stack. The 40-px horizontal tab bar is deleted; its
       *  controls relocated:
       *    - sidebar toggle      → Scribe sub-header (inside ScribePane)
       *    - 6 tab buttons       → VerticalNav rows
       *    - breadcrumb          → Scribe sub-header
       *    - chat toggle         → ChatPane sub-header + re-expand strip below
       *  See architecture-v4 Part 14 / HANDOFF_v20 §2.2. */}
      <div className="flex flex-1 min-h-0">
        <VerticalNav />

        {/* Content column — vertical flex inside the nav-anchored layout. */}
        <div className="flex flex-1 min-h-0 flex-col" style={{ overflow: 'visible' }}>

          {activeTab === 'hud' ? (
            <div className="flex flex-1 min-h-0">
              <HUD />
            </div>
          ) : activeTab === 'domaines' ? (
            <div className="flex flex-1 min-h-0">
              <Domaines />
            </div>
          ) : activeTab === 'codex' ? (
            <div className="flex flex-1 min-h-0">
              <CodexTab />
            </div>
          ) : activeTab === 'hive' ? (
            <div className="flex flex-1 min-h-0">
              <Hive />
            </div>
          ) : activeTab === 'foundry' ? (
            <div className="flex flex-1 min-h-0">
              <Foundry />
            </div>
          ) : (
            // Scribe layout — three resizable columns: file explorer, editor,
            // chat. The file-explorer toggle now lives in the Scribe sub-
            // header (inside ScribePane). The chat toggle is in ChatPane's
            // sub-header; when chat is collapsed, the ChatReExpandStrip
            // below provides the re-expand affordance.
            <div className="flex flex-1 min-h-0" style={{ overflow: 'visible' }}>

              {/* ── File explorer ───────────────────────────────────────── */}
              <div
                style={{
                  width: sidebarCollapsed ? 0 : sidebarWidth,
                  minWidth: 0,
                  flexShrink: 0,
                  overflow: 'hidden',
                  transition: isDragging ? 'none' : 'width 200ms ease',
                }}
              >
                <div style={{ width: sidebarWidth, minWidth: sidebarWidth, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Sidebar />
                </div>
              </div>

              {/* ── File explorer ↔ Editor divider ──────────────────────── */}
              <PanelDivider
                onDrag={onSidebarDrag}
                collapsed={sidebarCollapsed}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={() => setIsDragging(false)}
              />

              {/* ── Editor ─────────────────────────────────────────────── */}
              <div className="flex flex-1 min-w-0 overflow-hidden">
                <ScribePane
                  sidebarCollapsed={sidebarCollapsed}
                  onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
                />
              </div>

              {/* ── Re-expand strip (only when chat is collapsed) ───────
               *  Per Andy's decision: visible ONLY when chat is collapsed.
               *  No strip when chat is open — the editor extends naturally
               *  to the chat divider. When chat collapses, the strip
               *  appears at the editor's right edge with a ◂ button for
               *  re-expansion. Mirrors the macOS Antigravity pattern.
               *  Note: we OMIT the Editor↔Chat divider when chat is
               *  collapsed (the chat wrapper has width:0, so the divider
               *  would visually be just a dead line). The strip stands
               *  in for the divider's visual role and provides the
               *  re-expand affordance in one tight 12-px element. */}
              {chatCollapsed ? (
                <ChatReExpandStrip onExpand={() => setChatCollapsed(false)} />
              ) : (
                <PanelDivider
                  onDrag={onChatDrag}
                  collapsed={false}
                  onDragStart={() => setIsDragging(true)}
                  onDragEnd={() => setIsDragging(false)}
                />
              )}

              {/* ── Chat ────────────────────────────────────────────────── */}
              <div
                style={{
                  width: chatCollapsed ? 0 : chatWidth,
                  minWidth: 0,
                  flexShrink: 0,
                  overflow: 'hidden',
                  transition: isDragging ? 'none' : 'width 200ms ease',
                }}
              >
                <div style={{ width: chatWidth, minWidth: chatWidth, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <ChatPane
                    onToggleCollapsed={() => setChatCollapsed((v) => !v)}
                  />
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  )
}

/**
 * Session 8 Part B — re-expand affordance for the collapsed chat panel.
 *
 * Renders ONLY when the chat is collapsed (gated by the caller in Shell).
 * A 12-px-wide vertical strip pinned to the editor's right edge with a
 * single ◂ button that re-expands the chat. Hover lightens the button and
 * underlines the strip with the accent color so the affordance reads as
 * "tap here to bring the chat back."
 *
 * Why this lives in Shell rather than inside ChatPane: when chat is
 * collapsed, the ChatPane is wrapped in a width:0 + overflow:hidden
 * container — anything rendered inside ChatPane in that state is
 * invisible. The re-expand affordance must be a SIBLING of the chat
 * wrapper, not a child, to remain reachable. Shell owns the layout, so
 * Shell owns the strip.
 */
function ChatReExpandStrip({ onExpand }: { onExpand: () => void }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{
        width: 12,
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: hovered ? 'var(--bg-card)' : 'transparent',
        borderLeft: `1px solid ${hovered ? 'var(--accent)' : 'var(--border-subtle)'}`,
        borderRight: `1px solid ${hovered ? 'var(--accent)' : 'transparent'}`,
        cursor: 'pointer',
        transition: 'background 120ms, border-color 120ms',
      }}
      onClick={onExpand}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Expand chat (⌘⇧3)"
    >
      <IconPanelRight size={12} />
    </div>
  )
}
