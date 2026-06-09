/**
 * Scribe editor theme editor — rendered inside ControlPanel.
 *
 * Matches the Agenteryx manual (settings → Scribe): a theme dropdown
 * (presets + saved customs), a 13-token editable color grid (swatch +
 * label + hex), live edits that auto-fork a preset into "{name} (custom)",
 * and a "Save as custom" naming flow. Per-user persistence via
 * scribeThemeStore + scribeCustomsStore.
 */
import { useState } from 'react';
import { useScribeTheme } from './useScribeTheme';
import { PRESET_KEYS, PRESETS, TOKEN_ORDER, TOKEN_LABELS } from './scribeThemes';

export default function ScribeSettings() {
    const { themeName, theme, customs, setTheme, setToken, saveCustomAs } = useScribeTheme();
    const [newName, setNewName] = useState('');

    const isPreset = !!PRESETS[themeName];
    const customKeys = Object.keys(customs);

    return (
        <section className="cp-section">
            <h3 className="cp-section__title">Scribe — Editor Theme</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary, #808080)', lineHeight: 1.5, margin: '0 0 14px' }}>
                Customize the colors used by the in-editor markdown syntax highlighting. Changes apply live to all
                open editors. The Editor theme is independent of the app theme (Settings → Appearance) — switching
                one does not change the other.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)' }}>Theme:</label>
                <select
                    value={themeName}
                    onChange={(e) => setTheme(e.target.value)}
                    style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-surface, #1a1a1a)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-default, #333)' }}
                >
                    <optgroup label="Presets">
                        {PRESET_KEYS.map((k) => <option key={k} value={k}>{PRESETS[k].name}</option>)}
                    </optgroup>
                    {customKeys.length > 0 && (
                        <optgroup label="Custom">
                            {customKeys.map((k) => <option key={k} value={k}>{customs[k].name}</option>)}
                        </optgroup>
                    )}
                </select>
            </div>

            <p style={{ fontSize: 11.5, fontStyle: 'italic', color: 'var(--text-tertiary, #808080)', margin: '0 0 14px' }}>
                Editing a color on a preset will automatically save it as a new custom theme named
                {' '}&ldquo;{isPreset ? `${theme.name} (custom)` : theme.name}&rdquo;.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {TOKEN_ORDER.map((key) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-surface, rgba(255,255,255,0.03))', border: '1px solid var(--border-default, #2a2a2a)', cursor: 'pointer' }}>
                        <input
                            type="color"
                            value={theme.tokens[key]}
                            onChange={(e) => setToken(key, e.target.value)}
                            style={{ width: 30, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }}
                            aria-label={`${TOKEN_LABELS[key]} color`}
                        />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary, #eee)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{TOKEN_LABELS[key]}</span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-tertiary, #777)' }}>{theme.tokens[key].toUpperCase()}</span>
                    </label>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
                <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New custom theme name…"
                    style={{ flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-surface, #1a1a1a)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-default, #333)' }}
                />
                <button
                    onClick={() => { const n = newName.trim(); if (n) { saveCustomAs(n); setNewName(''); } }}
                    disabled={!newName.trim()}
                    style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, cursor: newName.trim() ? 'pointer' : 'not-allowed', background: newName.trim() ? 'var(--accent, #D6FE51)' : 'var(--bg-surface-hover, #222)', color: newName.trim() ? 'var(--text-inverse, #000)' : 'var(--text-tertiary, #777)', border: '1px solid var(--border-default, #333)', whiteSpace: 'nowrap' }}
                >
                    Save as custom
                </button>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #666)', lineHeight: 1.5, margin: '14px 0 0' }}>
                v1 scope: 13 tokens covered. Fenced-code background, blockquote left-border, and table cell separators
                follow the app theme — color customization for those is planned for v1.5.
            </p>
        </section>
    );
}
