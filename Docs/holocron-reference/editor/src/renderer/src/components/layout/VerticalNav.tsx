import { useState, useRef, useEffect, JSX } from 'react'
import { useSessionStore, AppTab } from '../../store/sessionStore'
import { useSettingsStore, AppMode } from '../../store/settingsStore'
import { useDomainesStore } from '../../store/domainesStore'
import {
  IconHUD, IconScribe, IconCodex, IconImport, IconBrain, IconDomaines,
  IconPanelLeft, IconPanelRight,
} from '../Icons'

/**
 * Session 8 Part B — Vertical sidebar navigation.
 *
 * Replaces the horizontal tab bar at the top of `Shell.tsx`. Persistent
 * across every tab; collapse state stored in `sessionStore.navSidebarCollapsed`.
 *
 * Dimensions (LOCKED per architecture-v4 Part 14 / HANDOFF_v20 §2.2):
 *   - Collapsed: 48 px wide, icons only, hover tooltips show the label.
 *   - Expanded:  160 px wide, icons + text labels.
 *
 * Items, top to bottom (DECIDED per HANDOFF_v20 §3.6 — locked at sign-off,
 * NOT draggable for Session 8):
 *
 *   1. Toggle  (chevron — collapses/expands the nav itself)
 *   2. HUD
 *   3. Scribe
 *   4. Codex
 *   5. Foundry
 *   6. Hive
 *   7. Domains
 *
 * Footer region: MAIN indicator (mode pill — relocated from TitleBar). Git
 * controls would go here too when they exist; HANDOFF_v20 mentions them as
 * a target but they don't currently exist in the codebase.
 *
 * The Domains item ports the Session-7-second-pass same-tab=reset /
 * cross-tab=preserve special-case from `Shell.tsx:115-129` per HANDOFF_v20
 * §3.5. Do not regress this.
 */

const COLLAPSED_WIDTH = 48
const EXPANDED_WIDTH = 160

interface NavItemDef {
  tab: AppTab
  label: string
  icon: (size: number) => JSX.Element
}

const NAV_ITEMS: NavItemDef[] = [
  { tab: 'hud',      label: 'HUD',     icon: (s) => <IconHUD size={s} /> },
  { tab: 'scribe',   label: 'Scribe',  icon: (s) => <IconScribe size={s} /> },
  { tab: 'codex',    label: 'Codex',   icon: (s) => <IconCodex size={s} /> },
  { tab: 'foundry',  label: 'Foundry', icon: (s) => <IconImport size={s} /> },
  { tab: 'hive',     label: 'Hive',    icon: (s) => <IconBrain size={s} /> },
  { tab: 'domaines', label: 'Domains', icon: (s) => <IconDomaines size={s} /> },
]

// MAIN indicator config — relocated to VerticalNav in Session 8 Part B.
// The TitleBar copy was deleted in the same commit, so this is now the
// single source of truth; if a fourth mode is ever added, update this map.
const MODE_CONFIG: Record<AppMode, { label: string; color: string }> = {
  main:     { label: 'MAIN',     color: 'var(--neon-green)' },
  sandbox:  { label: 'SANDBOX',  color: 'var(--neon-yellow)' },
  research: { label: 'RESEARCH', color: 'var(--neon-blue)' },
}

export function VerticalNav(): JSX.Element {
  const { activeTab, setActiveTab, navSidebarCollapsed, setNavSidebarCollapsed } = useSessionStore()
  const { config, setSettingsOpen } = useSettingsStore()
  const collapsed = navSidebarCollapsed
  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH
  const mode = config.mode
  const modeConf = MODE_CONFIG[mode]

  const handleTabClick = (tab: AppTab): void => {
    // Domains special-case (HANDOFF_v20 §3.5) — same-tab click = Home reset
    // (backToIndex), cross-tab click = preserve drill-down state. The
    // domainesStore.view/activeDomaineId/activeProject fields persist
    // naturally; the nav was the only thing that would forcibly reset them.
    if (tab === 'domaines' && activeTab === 'domaines') {
      useDomainesStore.getState().backToIndex()
    }
    setActiveTab(tab)
  }

  return (
    <div
      style={{
        width,
        minWidth: width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-base)',
        borderRight: '1px solid var(--border-subtle)',
        transition: 'width 200ms ease',
        overflow: 'hidden',
      }}
    >
      {/* Toggle row — chevron that collapses/expands the nav itself. */}
      <NavRow
        collapsed={collapsed}
        active={false}
        label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => setNavSidebarCollapsed(!collapsed)}
        icon={(s) => (collapsed ? <IconPanelRight size={s} /> : <IconPanelLeft size={s} />)}
        emphasis="ghost"
      />

      {/* Subtle divider between the Toggle row and the tab rows so the toggle
          reads as "chrome" rather than another tab. */}
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 8px' }} />

      {/* Tab rows */}
      {NAV_ITEMS.map((item) => (
        <NavRow
          key={item.tab}
          collapsed={collapsed}
          active={activeTab === item.tab}
          label={item.label}
          title={item.label}
          onClick={() => handleTabClick(item.tab)}
          icon={item.icon}
        />
      ))}

      {/* Spacer pushes the footer to the bottom of the nav column. */}
      <div style={{ flex: 1 }} />

      {/* Footer — MAIN indicator (Mode pill, relocated from TitleBar). When
          expanded: full pill with label. When collapsed: just the colored
          dot, with the full label as a hover tooltip. Clicking opens
          Settings (same handler as the prior TitleBar Mode pill). */}
      <div
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: collapsed ? '8px 0' : '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: collapsed ? 'center' : 'stretch',
          gap: 6,
        }}
      >
        <button
          onClick={() => setSettingsOpen(true)}
          title={`Mode: ${mode} — click to change`}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: 'transparent',
            border: `1px solid ${modeConf.color}40`,
            borderRadius: collapsed ? 12 : 20,
            padding: collapsed ? '4px' : '3px 10px 3px 8px',
            cursor: 'pointer', color: modeConf.color,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            fontFamily: 'monospace',
            transition: 'border-color 150ms',
            width: collapsed ? 24 : '100%',
            height: collapsed ? 24 : 'auto',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = modeConf.color + '80' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = modeConf.color + '40' }}
        >
          <span style={{ fontSize: 6, lineHeight: 1 }}>●</span>
          {!collapsed && <span>{modeConf.label}</span>}
        </button>
      </div>
    </div>
  )
}

/**
 * One row in the nav — icon (always) + label (when expanded). Hover tooltip
 * surfaces the label when collapsed so users can navigate by glyph alone.
 * The tooltip is a fixed-position bubble (not the browser's native title
 * tooltip) so it appears immediately + reads with consistent styling. We
 * keep the native `title` attribute too as a fallback / for accessibility.
 */
function NavRow({
  collapsed, active, label, title, onClick, icon, emphasis = 'default',
}: {
  collapsed: boolean
  active: boolean
  label: string
  title: string
  onClick: () => void
  icon: (size: number) => JSX.Element
  emphasis?: 'default' | 'ghost'
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const rowRef = useRef<HTMLButtonElement>(null)
  const [tooltipTop, setTooltipTop] = useState(0)

  // Compute tooltip vertical anchor (mid-row) each time hover starts. Doing it
  // on hover instead of on every render keeps the layout effect cheap.
  useEffect(() => {
    if (!hovered || !collapsed) return
    const el = rowRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setTooltipTop(rect.top + rect.height / 2)
  }, [hovered, collapsed])

  const isGhost = emphasis === 'ghost'
  const baseColor = active
    ? 'var(--text-primary)'
    : hovered
    ? 'var(--text-primary)'
    : isGhost
    ? 'var(--text-dim)'
    : 'var(--text-secondary)'

  const bgColor = active
    ? 'var(--bg-card)'
    : hovered
    ? 'var(--bg-card)'
    : 'transparent'

  // Left accent stripe — present on active rows in both collapsed + expanded.
  // Echoes the horizontal-tab-bar's bottom underline; here, on a vertical
  // axis, "active" reads naturally as a left edge.
  const accentColor = active ? 'var(--neon-blue)' : 'transparent'

  return (
    <>
      <button
        ref={rowRef}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={title}
        style={{
          position: 'relative',
          height: 40,
          margin: '1px 0',
          padding: collapsed ? '0' : '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          background: bgColor,
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          color: baseColor,
          fontFamily: 'inherit',
          textAlign: 'left',
          transition: 'background 100ms, color 100ms',
          borderRadius: 0,
        }}
      >
        {/* Accent stripe on the left edge */}
        <span
          style={{
            position: 'absolute', left: 0, top: 6, bottom: 6,
            width: 3,
            background: accentColor,
            borderRadius: '0 2px 2px 0',
            transition: 'background 100ms',
          }}
        />
        <span style={{ opacity: active ? 1 : isGhost ? 0.7 : 0.85, display: 'flex' }}>
          {icon(15)}
        </span>
        {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
      </button>

      {/* Custom tooltip — only when collapsed and hovered. Fixed-position so
          it escapes the nav's overflow:hidden context. */}
      {collapsed && hovered && (
        <div
          style={{
            position: 'fixed',
            left: COLLAPSED_WIDTH + 6,
            top: tooltipTop,
            transform: 'translateY(-50%)',
            zIndex: 1000,
            padding: '4px 8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 5,
            fontSize: 11, fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-lg)',
            pointerEvents: 'none',
          }}
        >
          {label}
        </div>
      )}
    </>
  )
}
