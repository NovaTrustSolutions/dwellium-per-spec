import { useState, useMemo } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import {
  PRESETS, PRESET_KEYS, TOKEN_LABELS, TOKEN_ORDER,
  HOLOCRON_DEFAULT,
  type ScribeColorTheme, type ScribeTokenKey, type ScribeTokens,
} from '../scribe/scribeThemes'

/**
 * Editor color theme picker. Lets the user switch between preset themes
 * (Holocron Default, Fey, Minimal, High Contrast) and create/delete custom
 * themes. Color picks update the active editor live via App.tsx's effect.
 *
 * v1 scope (per architecture-v2.md §"Planned: Editor Enhancements — Feature 1"):
 *   - 13 tokens covered (heading 1-4, bold, italic, code, code-string, quote,
 *     hr, link, url, meta). Plugin-driven elements (fenced code background,
 *     blockquote left-border) are NOT customizable in v1 — they follow the
 *     app theme via EditorView.theme.
 *   - Live preview is the editor itself behind the modal. No dedicated
 *     preview pane.
 *   - Persistence via the existing config (electron-store on disk).
 */
export function ScribeTab(): JSX.Element {
  const { config, saveConfig } = useSettingsStore()
  const editorTheme = config.editorTheme
  const customs = (editorTheme.customs as Record<string, ScribeColorTheme>) ?? {}
  const activeName = editorTheme.activeName
  const isPreset = activeName in PRESETS
  const activeTheme: ScribeColorTheme =
    PRESETS[activeName] ?? customs[activeName] ?? HOLOCRON_DEFAULT

  const [draftName, setDraftName] = useState('')

  // All theme names available in the picker — presets first, then customs.
  const allOptions = useMemo(() => {
    const presetEntries = PRESET_KEYS.map((k) => ({ key: k, label: PRESETS[k].name, isPreset: true }))
    const customEntries = Object.values(customs).map((t) => ({ key: t.name, label: t.name, isPreset: false }))
    return [...presetEntries, ...customEntries]
  }, [customs])

  const selectTheme = (name: string): void => {
    saveConfig({ editorTheme: { ...editorTheme, activeName: name } })
  }

  const updateToken = (key: ScribeTokenKey, color: string): void => {
    // Editing a token on a preset auto-forks: copy preset → make a custom
    // named "<Preset> (custom)" → switch to it. Editing a custom mutates
    // it in place. This avoids overwriting preset definitions.
    if (isPreset) {
      const baseTokens = activeTheme.tokens
      const newTokens: ScribeTokens = { ...baseTokens, [key]: color }
      const newName = `${activeTheme.name} (custom)`
      const newCustoms = { ...customs, [newName]: { name: newName, isCustom: true, tokens: newTokens } }
      saveConfig({ editorTheme: { customs: newCustoms, activeName: newName } })
    } else {
      const newTokens: ScribeTokens = { ...activeTheme.tokens, [key]: color }
      const updated: ScribeColorTheme = { ...activeTheme, tokens: newTokens }
      const newCustoms = { ...customs, [activeName]: updated }
      saveConfig({ editorTheme: { ...editorTheme, customs: newCustoms } })
    }
  }

  const saveAsCustom = (): void => {
    const name = draftName.trim()
    if (!name) return
    if (PRESETS[name]) {
      // eslint-disable-next-line no-alert
      window.alert(`"${name}" is a preset name. Pick a different name.`)
      return
    }
    if (customs[name]) {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Custom theme "${name}" already exists. Overwrite?`)) return
    }
    const newCustom: ScribeColorTheme = { name, isCustom: true, tokens: { ...activeTheme.tokens } }
    const newCustoms = { ...customs, [name]: newCustom }
    saveConfig({ editorTheme: { customs: newCustoms, activeName: name } })
    setDraftName('')
  }

  const deleteCustom = (): void => {
    if (isPreset) return
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete custom theme "${activeName}"? This cannot be undone.`)) return
    const { [activeName]: _removed, ...remaining } = customs
    saveConfig({ editorTheme: { customs: remaining, activeName: 'holocron-default' } })
  }

  const resetToPreset = (): void => {
    if (isPreset) return
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Reset "${activeName}" to Agenteryx Default colors?`)) return
    const baseTokens = HOLOCRON_DEFAULT.tokens
    const updated: ScribeColorTheme = { ...activeTheme, tokens: { ...baseTokens } }
    const newCustoms = { ...customs, [activeName]: updated }
    saveConfig({ editorTheme: { ...editorTheme, customs: newCustoms } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        Customize the colors used by the in-editor markdown syntax highlighting.
        Changes apply live to all open editors. The Editor theme is independent
        of the app theme (Settings → Appearance) — switching one does not
        change the other.
      </div>

      {/* Theme picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Theme:</label>
        <select
          value={activeName}
          onChange={(e) => selectTheme(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--bg-3)',
            color: 'var(--text-1)',
            border: '1px solid var(--border-2)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 13,
          }}
        >
          {allOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.isPreset ? opt.label : `${opt.label} (custom)`}
            </option>
          ))}
        </select>
        {!isPreset && (
          <>
            <button onClick={resetToPreset} style={btnStyle()}>Reset</button>
            <button onClick={deleteCustom} style={btnStyle('var(--accent-red)')}>Delete</button>
          </>
        )}
      </div>

      {isPreset && (
        <div style={{ fontSize: 11, color: 'var(--text-4)', fontStyle: 'italic' }}>
          Editing a color on a preset will automatically save it as a new custom theme named "{activeTheme.name} (custom)".
        </div>
      )}

      {/* Color picker grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {TOKEN_ORDER.map((key) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg-3)', borderRadius: 6 }}>
            <input
              type="color"
              value={activeTheme.tokens[key]}
              onChange={(e) => updateToken(key, e.target.value)}
              style={{ width: 32, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
            />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)' }}>{TOKEN_LABELS[key]}</span>
            <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace' }}>
              {activeTheme.tokens[key].toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {/* Save as custom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border-1)' }}>
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="New custom theme name…"
          style={{
            flex: 1,
            background: 'var(--bg-3)',
            color: 'var(--text-1)',
            border: '1px solid var(--border-2)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
          }}
        />
        <button onClick={saveAsCustom} disabled={!draftName.trim()} style={btnStyle('var(--accent)', !draftName.trim())}>
          Save as custom
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5, marginTop: 4 }}>
        v1 scope: 13 tokens covered. Fenced-code background, blockquote left-border, and table cell separators follow the app theme — color customization for those is planned for v1.5.
      </div>
    </div>
  )
}

function btnStyle(bg: string = 'var(--bg-3)', disabled = false): React.CSSProperties {
  return {
    background: disabled ? 'var(--bg-3)' : bg,
    color: disabled ? 'var(--text-4)' : (bg === 'var(--bg-3)' ? 'var(--text-1)' : 'var(--bg-base)'),
    border: '1px solid var(--border-2)',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}
