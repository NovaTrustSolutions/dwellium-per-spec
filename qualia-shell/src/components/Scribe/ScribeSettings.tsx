/**
 * Scribe editor theme picker — rendered inside ControlPanel.
 * Shows preset themes as a clickable grid with color swatches.
 *
 * Ported from Holocron's ScribeTab.tsx (Cycle 10). Simplified:
 * preset-only picker (custom color overrides deferred). Per-user
 * persistence via scribeThemeStore.
 */
import { useScribeTheme } from './useScribeTheme';
import { PRESET_KEYS, PRESETS, TOKEN_ORDER, TOKEN_LABELS } from './scribeThemes';

export default function ScribeSettings() {
    const { themeName, setTheme } = useScribeTheme();

    return (
        <section className="cp-section">
            <h3 className="cp-section__title">Scribe — Editor Theme</h3>
            <p style={{ fontSize: 12, color: '#808080', lineHeight: 1.5, margin: '0 0 12px' }}>
                Choose a syntax highlighting preset for the Scribe markdown editor.
                Changes apply immediately to all open editors.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {PRESET_KEYS.map((key) => {
                    const preset = PRESETS[key];
                    const active = themeName === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setTheme(key)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 14px',
                                background: active ? 'rgba(214,254,81,0.08)' : 'transparent',
                                border: active ? '1px solid rgba(214,254,81,0.4)' : '1px solid #333',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                textAlign: 'left',
                                transition: 'background 120ms, border-color 120ms',
                            }}
                            onMouseEnter={(e) => {
                                if (!active) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                    e.currentTarget.style.borderColor = '#555';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = active ? 'rgba(214,254,81,0.08)' : 'transparent';
                                e.currentTarget.style.borderColor = active ? 'rgba(214,254,81,0.4)' : '#333';
                            }}
                        >
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                {['h1', 'h2', 'h3', 'bold', 'code', 'link'].map((tok) => (
                                    <div
                                        key={tok}
                                        style={{
                                            width: 12,
                                            height: 12,
                                            borderRadius: 2,
                                            background: preset.tokens[tok as keyof typeof preset.tokens],
                                        }}
                                        title={TOKEN_LABELS[tok as keyof typeof TOKEN_LABELS]}
                                    />
                                ))}
                            </div>
                            <span style={{
                                fontSize: 13,
                                fontWeight: active ? 700 : 400,
                                color: active ? '#D6FE51' : '#ccc',
                            }}>
                                {preset.name}
                            </span>
                            {active && (
                                <span style={{ fontSize: 11, color: '#D6FE51', marginLeft: 'auto' }}>
                                    Active
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
