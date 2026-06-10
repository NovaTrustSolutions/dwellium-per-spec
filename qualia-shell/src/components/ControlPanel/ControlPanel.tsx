import { useEffect, useState, type CSSProperties } from 'react';
import { useTheme, THEMES, CUSTOM_TOKENS_KEY } from '../../context/ThemeContext';
import { useWindows } from '../../context/WindowContext';
import { useLayout } from '../../context/LayoutContext';
import { API_BASE } from '../../config';
import LlmIntegrationsSection from './LlmIntegrationsSection';
import DataFolderSection from './DataFolderSection';
import GoogleDriveSection from './GoogleDriveSection';
import GoogleAccountsSection from './GoogleAccountsSection';
import SystemUpdateSection from './SystemUpdateSection';
import ScribeSettings from '../Scribe/ScribeSettings';
import './ControlPanel.css';

const ACCENT_PRESETS = [
    { label: 'Beacon Blue', color: '#0088cc' },
    { label: 'Flame Orange', color: '#f05a28' },
    { label: 'Emerald', color: '#27ae60' },
    { label: 'Amethyst', color: '#9b59b6' },
    { label: 'Ruby', color: '#e74c3c' },
    { label: 'Gold', color: '#f1c40f' },
    { label: 'Teal', color: '#1abc9c' },
    { label: 'Slate', color: '#7f8c8d' },
];

const API_ROOT = API_BASE;
const API_INTEGRATIONS = `${API_ROOT}/api/integrations`;

interface GmailStatus {
    connected: boolean;
    watchEmail: string;
    pollIntervalMs: number;
    fetcherRunning: boolean;
    processedMessageCount: number;
    unreadVisible?: number;
    error?: string;
}

interface CalendarStatus {
    connected: boolean;
    watchEmail: string;
    defaultCalendarId: string;
    error?: string;
}

interface IntegrationStatus {
    gmail: GmailStatus;
    calendar: CalendarStatus;
}

interface CalendarEvent {
    id: string;
    summary: string;
    start: string;
    end: string;
    location?: string;
    htmlLink?: string;
}

export default function ControlPanel() {
    const { theme, accentColor, setTheme, setAccentColor } = useTheme();
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [editMsg, setEditMsg] = useState('');
    const { windows, minimizeWindow, restoreWindow, closeWindow, saveLayout, resetLayout } = useWindows();
    const { settings: layoutSettings, updateSettings, resetSettings, fontPresets } = useLayout();
    const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
    const [integrationLoading, setIntegrationLoading] = useState(false);
    const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);

    const [newEventTitle, setNewEventTitle] = useState('');
    const [newEventStart, setNewEventStart] = useState('');
    const [newEventEnd, setNewEventEnd] = useState('');

    const loadIntegrationStatus = async () => {
        const res = await fetch(`${API_INTEGRATIONS}/status`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to load integration status');
        setIntegrationStatus(json.data);
    };

    const loadCalendarEvents = async () => {
        const res = await fetch(`${API_BASE}/api/calendar/events?maxResults=6`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to load calendar events');
        setCalendarEvents(json.data || []);
    };

    const refreshIntegrations = async () => {
        setIntegrationLoading(true);
        setIntegrationMessage(null);
        try {
            await loadIntegrationStatus();
            await loadCalendarEvents();
        } catch (err) {
            setIntegrationMessage(err instanceof Error ? err.message : String(err));
        } finally {
            setIntegrationLoading(false);
        }
    };

    useEffect(() => {
        refreshIntegrations();
    }, []);

    const testGmailConnection = async () => {
        setIntegrationLoading(true);
        setIntegrationMessage(null);
        try {
            const res = await fetch(`${API_BASE}/api/gmail/test`, { method: 'POST' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Gmail test failed');
            await refreshIntegrations();
            setIntegrationMessage(json.data.connected ? 'Gmail connection verified' : `Gmail connection failed: ${json.data.error || 'unknown error'}`);
        } catch (err) {
            setIntegrationMessage(err instanceof Error ? err.message : String(err));
        } finally {
            setIntegrationLoading(false);
        }
    };

    const fetchGmailNow = async () => {
        setIntegrationLoading(true);
        setIntegrationMessage(null);
        try {
            const res = await fetch(`${API_BASE}/api/gmail/fetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxResults: 20 })
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Gmail fetch failed');
            await refreshIntegrations();
            setIntegrationMessage(`Gmail sync complete: fetched ${json.data.fetched}, processed ${json.data.processed}`);
        } catch (err) {
            setIntegrationMessage(err instanceof Error ? err.message : String(err));
        } finally {
            setIntegrationLoading(false);
        }
    };

    const createCalendarEvent = async () => {
        setIntegrationLoading(true);
        setIntegrationMessage(null);
        try {
            if (!newEventTitle || !newEventStart || !newEventEnd) {
                throw new Error('Title, start, and end are required to create an event');
            }
            const res = await fetch(`${API_BASE}/api/calendar/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    summary: newEventTitle,
                    start: new Date(newEventStart).toISOString(),
                    end: new Date(newEventEnd).toISOString()
                })
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to create calendar event');

            setNewEventTitle('');
            setNewEventStart('');
            setNewEventEnd('');
            await refreshIntegrations();
            setIntegrationMessage(`Event created: ${json.data.summary}`);
        } catch (err) {
            setIntegrationMessage(err instanceof Error ? err.message : String(err));
        } finally {
            setIntegrationLoading(false);
        }
    };

    const status = integrationStatus;
    const gmailStatus = status?.gmail;
    const calendarStatus = status?.calendar;

    // ── Theme editor (Settings → Appearance → Customize) ──
    const EDITOR_FIELDS: { label: string; vars: string[] }[] = [
        { label: 'Background', vars: ['--bg', '--bg-desktop'] },
        { label: 'Surface', vars: ['--surface', '--bg-surface'] },
        { label: 'Elevated', vars: ['--surface2', '--bg-surface-elevated'] },
        { label: 'Border', vars: ['--border', '--border-default'] },
        { label: 'Text', vars: ['--text', '--text-primary'] },
        { label: 'Muted', vars: ['--muted', '--text-secondary'] },
        { label: 'Accent', vars: ['--blue', '--accent', '--accent-text'] },
        { label: 'Gradient A', vars: ['--gs'] },
        { label: 'Gradient B', vars: ['--ge'] },
        { label: 'Success', vars: ['--ig', '--success'] },
    ];
    const editBtn: CSSProperties = { fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: 'var(--bg-surface-hover, rgba(255,255,255,0.06))', color: 'var(--text-primary)', border: '1px solid var(--border-default, rgba(255,255,255,0.12))' };
    const readVar = (v: string): string => {
        try { const val = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return /^#[0-9a-fA-F]{3,8}$/.test(val) ? val : '#888888'; } catch { return '#888888'; }
    };
    const persistTokens = (mut: (cur: Record<string, string>) => void) => {
        let cur: Record<string, string> = {};
        try { cur = JSON.parse(localStorage.getItem(CUSTOM_TOKENS_KEY) || '{}'); } catch { /* ignore */ }
        mut(cur);
        try { localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(cur)); } catch { /* ignore */ }
    };
    const applyToken = (vars: string[], value: string) => {
        const r = document.documentElement;
        vars.forEach(v => r.style.setProperty(v, value));
        persistTokens(cur => vars.forEach(v => { cur[v] = value; }));
    };
    const resetCustom = () => {
        const r = document.documentElement;
        try { Object.keys(JSON.parse(localStorage.getItem(CUSTOM_TOKENS_KEY) || '{}')).forEach(v => r.style.removeProperty(v)); } catch { /* ignore */ }
        try { localStorage.removeItem(CUSTOM_TOKENS_KEY); } catch { /* ignore */ }
        setEditMsg('Reset to theme defaults'); setTimeout(() => setEditMsg(''), 2000);
    };
    const exportTheme = () => {
        const cs = getComputedStyle(document.documentElement);
        const out: Record<string, string> = { theme };
        ['--bg', '--surface', '--surface2', '--border', '--text', '--muted', '--cyan', '--blue', '--gs', '--ge', '--ip', '--il', '--ig'].forEach(k => { const val = cs.getPropertyValue(k).trim(); if (val) out[k] = val; });
        const json = JSON.stringify(out, null, 2);
        try { navigator.clipboard.writeText(json); } catch { /* ignore */ }
        try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `dwellium-theme-${theme}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } catch { /* ignore */ }
        setEditMsg('Copied + downloaded'); setTimeout(() => setEditMsg(''), 2000);
    };
    const doImport = () => {
        try {
            const obj = JSON.parse(importText) as Record<string, string>;
            const r = document.documentElement;
            persistTokens(cur => Object.entries(obj).forEach(([k, v]) => { if (k.startsWith('--') && typeof v === 'string') { r.style.setProperty(k, v); cur[k] = v; } }));
            setEditMsg('Applied ✓'); setShowImport(false);
        } catch { setEditMsg('Invalid JSON'); }
        setTimeout(() => setEditMsg(''), 2500);
    };

    return (
        <div className="control-panel">
            <section className="cp-section">
                <h3 className="cp-section__title">Appearance</h3>

                <div className="cp-field">
                    <label className="cp-label">Theme — {THEMES.find(t => t.id === theme)?.label || theme}</label>
                    {(['Dwellium', 'Master Pack'] as const).map(group => (
                        <div key={group} style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 10, opacity: 0.5, margin: '6px 0', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{group}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8 }}>
                                {THEMES.filter(t => t.group === group).map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTheme(t.id)}
                                        title={t.label}
                                        style={{
                                            display: 'flex', flexDirection: 'column', gap: 5, padding: 6, borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                                            background: theme === t.id ? 'var(--bg-surface-hover, rgba(255,255,255,0.06))' : 'transparent',
                                            border: theme === t.id ? '1.5px solid var(--accent)' : '1px solid var(--border-default, rgba(255,255,255,0.1))',
                                        }}
                                    >
                                        <span style={{ display: 'flex', height: 24, borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.25)' }}>
                                            <span style={{ flex: 2, background: t.bg }} />
                                            <span style={{ flex: 1, background: t.accent }} />
                                        </span>
                                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="cp-field">
                    <label className="cp-label">Accent Color</label>
                    <div className="cp-colors">
                        {ACCENT_PRESETS.map(preset => (
                            <button
                                key={preset.color}
                                className={`cp-color-swatch ${accentColor === preset.color ? 'cp-color-swatch--active' : ''}`}
                                style={{ background: preset.color }}
                                onClick={() => setAccentColor(preset.color)}
                                title={preset.label}
                            />
                        ))}
                    </div>
                </div>

                <div className="cp-field">
                    <label className="cp-label">Customize Theme {editMsg && <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 6 }}>· {editMsg}</span>}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))', gap: 8 }}>
                        {EDITOR_FIELDS.map(f => (
                            <label key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                                <input type="color" defaultValue={readVar(f.vars[0])} onChange={e => applyToken(f.vars, e.target.value)} style={{ width: 26, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                                {f.label}
                            </label>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button onClick={resetCustom} style={editBtn}>Reset</button>
                        <button onClick={exportTheme} style={editBtn}>Export JSON</button>
                        <button onClick={() => setShowImport(s => !s)} style={editBtn}>Import JSON</button>
                    </div>
                    {showImport && (
                        <div style={{ marginTop: 8 }}>
                            <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder={'{"--bg":"#101020","--blue":"#7aa2f7"}'} rows={3} style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 6, padding: 8 }} />
                            <button onClick={doImport} style={{ ...editBtn, marginTop: 6 }}>Apply</button>
                        </div>
                    )}
                </div>
            </section>

            {/* Scribe editor — moved directly under Appearance per Ilya 2026-06-10 */}
            <ScribeSettings />

            <section className="cp-section">
                <h3 className="cp-section__title">Layout</h3>

                {/* Font Family */}
                <div className="cp-field">
                    <label className="cp-label">Font Family</label>
                    <select
                        className="cp-select"
                        value={layoutSettings.fontFamily}
                        onChange={e => updateSettings({ fontFamily: e.target.value })}
                    >
                        {Object.keys(fontPresets).map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>

                {/* Font Scale */}
                <div className="cp-field">
                    <label className="cp-label">Font Scale — {Math.round(layoutSettings.fontScale * 100)}%</label>
                    <input
                        className="cp-range"
                        type="range"
                        min="0.8" max="1.4" step="0.05"
                        value={layoutSettings.fontScale}
                        onChange={e => updateSettings({ fontScale: parseFloat(e.target.value) })}
                    />
                </div>

                {/* Snap Master Toggle */}
                <div className="cp-field">
                    <label className="cp-label">Snap System</label>
                    <button
                        className={`cp-toggle cp-toggle--snap ${layoutSettings.snapEnabled ? '' : 'cp-toggle--off'}`}
                        onClick={() => updateSettings({ snapEnabled: !layoutSettings.snapEnabled })}
                    >
                        <span className={`cp-toggle__option ${layoutSettings.snapEnabled ? 'cp-toggle__option--active' : ''}`}>✨ On</span>
                        <span className={`cp-toggle__option ${!layoutSettings.snapEnabled ? 'cp-toggle__option--active' : ''}`}>Off</span>
                    </button>
                </div>

                {/* Snap Sub-toggles */}
                {layoutSettings.snapEnabled && (
                    <div className="cp-snap-options">
                        <label className="cp-checkbox">
                            <input type="checkbox" checked={layoutSettings.snapToEdges}
                                onChange={e => updateSettings({ snapToEdges: e.target.checked })} />
                            <span>Snap to Edges</span>
                        </label>
                        <label className="cp-checkbox">
                            <input type="checkbox" checked={layoutSettings.snapToWindows}
                                onChange={e => updateSettings({ snapToWindows: e.target.checked })} />
                            <span>Snap to Windows</span>
                        </label>
                        <label className="cp-checkbox">
                            <input type="checkbox" checked={layoutSettings.snapToGrid}
                                onChange={e => updateSettings({ snapToGrid: e.target.checked })} />
                            <span>Snap to Grid</span>
                        </label>
                        <label className="cp-checkbox">
                            <input type="checkbox" checked={layoutSettings.showSnapGuides}
                                onChange={e => updateSettings({ showSnapGuides: e.target.checked })} />
                            <span>Show Guides</span>
                        </label>

                        {/* Grid Size */}
                        {layoutSettings.snapToGrid && (
                            <div className="cp-field cp-field--nested">
                                <label className="cp-label">Grid Size — {layoutSettings.gridSize}px</label>
                                <input className="cp-range" type="range" min="16" max="64" step="8"
                                    value={layoutSettings.gridSize}
                                    onChange={e => updateSettings({ gridSize: parseInt(e.target.value) })} />
                            </div>
                        )}

                        {/* Snap Sensitivity */}
                        <div className="cp-field cp-field--nested">
                            <label className="cp-label">Snap Sensitivity — {layoutSettings.snapThreshold}px</label>
                            <input className="cp-range" type="range" min="8" max="32" step="4"
                                value={layoutSettings.snapThreshold}
                                onChange={e => updateSettings({ snapThreshold: parseInt(e.target.value) })} />
                        </div>
                    </div>
                )}

                {/* Desktop Regions */}
                <div className="cp-field">
                    <label className="cp-label">Desktop Regions</label>
                    <div className={`cp-toggle ${layoutSettings.regionsEnabled ? '' : 'cp-toggle--off'}`}>
                        <button className={`cp-toggle__option ${!layoutSettings.regionsEnabled ? 'cp-toggle__option--active' : ''}`}
                            onClick={() => updateSettings({ regionsEnabled: false })}>Off</button>
                        <button className={`cp-toggle__option ${layoutSettings.regionsEnabled ? 'cp-toggle__option--active' : ''}`}
                            onClick={() => updateSettings({ regionsEnabled: true })}>On</button>
                    </div>
                </div>
                {!layoutSettings.regionsEnabled && (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 2px 0', lineHeight: 1.5 }}>
                        Free-form: drag widgets anywhere and resize them freely — add as many as you like.
                        Use the lock button next to the Settings gear in the sidebar to freeze the layout.
                    </p>
                )}
                {layoutSettings.regionsEnabled && (
                    <div className="cp-field cp-field--nested">
                        <label className="cp-label">Region Layout</label>
                        <div className="cp-region-selector">
                            {([
                                { value: 'halves-h', label: 'Left / Right' },
                                { value: 'halves-v', label: 'Top / Bottom' },
                                { value: 'thirds-h', label: 'Thirds' },
                                { value: 'quadrants', label: 'Quadrants' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    className={`cp-region-option ${layoutSettings.regionLayout === opt.value ? 'cp-region-option--active' : ''}`}
                                    onClick={() => updateSettings({ regionLayout: opt.value })}
                                    title={opt.label}
                                >
                                    <svg viewBox="0 0 40 28" className="cp-region-preview">
                                        {opt.value === 'halves-h' && (
                                            <>
                                                <rect x="1" y="1" width="18" height="26" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                                <rect x="21" y="1" width="18" height="26" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                            </>
                                        )}
                                        {opt.value === 'halves-v' && (
                                            <>
                                                <rect x="1" y="1" width="38" height="12" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                                <rect x="1" y="15" width="38" height="12" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                            </>
                                        )}
                                        {opt.value === 'thirds-h' && (
                                            <>
                                                <rect x="1" y="1" width="11.5" height="26" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                                <rect x="14.5" y="1" width="11" height="26" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                                <rect x="27.5" y="1" width="11.5" height="26" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                            </>
                                        )}
                                        {opt.value === 'quadrants' && (
                                            <>
                                                <rect x="1" y="1" width="18" height="12" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                                <rect x="21" y="1" width="18" height="12" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                                <rect x="1" y="15" width="18" height="12" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                                <rect x="21" y="15" width="18" height="12" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" />
                                            </>
                                        )}
                                    </svg>
                                    <span className="cp-region-option__label">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Desktop Margins */}
                <div className="cp-field">
                    <label className="cp-label">Desktop Margins</label>
                    <div className="cp-margins">
                        <div className="cp-margins__preview">
                            <div className="cp-margins__box"
                                style={{
                                    borderTopWidth: Math.max(2, layoutSettings.margins.top / 4),
                                    borderRightWidth: Math.max(2, layoutSettings.margins.right / 4),
                                    borderBottomWidth: Math.max(2, layoutSettings.margins.bottom / 4),
                                    borderLeftWidth: Math.max(2, layoutSettings.margins.left / 4),
                                }}
                            >
                                <span className="cp-margins__label">content</span>
                            </div>
                        </div>
                        <div className="cp-margins__inputs">
                            {(['top', 'right', 'bottom', 'left'] as const).map(side => (
                                <div key={side} className="cp-margins__input-row">
                                    <span className="cp-margins__side">{side}</span>
                                    <input
                                        className="cp-input cp-input--sm"
                                        type="number" min="0" max="200" step="4"
                                        value={layoutSettings.margins[side]}
                                        onChange={e => updateSettings({
                                            margins: { ...layoutSettings.margins, [side]: parseInt(e.target.value) || 0 }
                                        })}
                                    />
                                    <span className="cp-margins__unit">px</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="cp-field">
                    <label className="cp-label">Window Actions</label>
                    <div className="cp-actions">
                        <button className="cp-btn" onClick={() => windows.forEach(w => w.minimized === false && minimizeWindow(w.id))}>✨ Desktop</button>
                        <button className="cp-btn" onClick={() => windows.forEach(w => w.minimized === true && restoreWindow(w.id))}>↩️ Restore</button>
                        <button className="cp-btn cp-btn--danger" onClick={() => windows.forEach(w => closeWindow(w.id))}>✕ Close All</button>
                    </div>
                </div>

                <div className="cp-actions" style={{ marginTop: 8 }}>
                    <button className="cp-btn" onClick={saveLayout}>
                        💾 Save Layout
                    </button>
                    <button className="cp-btn cp-btn--danger" onClick={() => {
                        if (window.confirm('Are you sure you want to reset the layout to default?')) {
                            resetLayout();
                        }
                    }}>
                        🔄 Reset Layout
                    </button>
                </div>
                <button className="cp-btn cp-btn--subtle" onClick={resetSettings} style={{ marginTop: 4 }}>
                    ↩ Reset Layout Settings
                </button>
            </section>

            <section className="cp-section">
                <h3 className="cp-section__title">System Info</h3>
                <div className="cp-info">
                    <div className="cp-info__row">
                        <span className="cp-info__label">Version</span>
                        <span className="cp-info__value">1.0.0-alpha</span>
                    </div>
                    <div className="cp-info__row">
                        <span className="cp-info__label">Project</span>
                        <span className="cp-info__value">DWELLIUM</span>
                    </div>
                    <div className="cp-info__row">
                        <span className="cp-info__label">Engine</span>
                        <span className="cp-info__value">AI-Dashboard369</span>
                    </div>
                </div>
            </section>

            {/* Per-user LLM + Supabase configuration — 2026-05-26 */}
            <LlmIntegrationsSection />

            {/* Multi-account Gmail + Calendar (OAuth via backend) — 2026-06-10 */}
            <GoogleAccountsSection />

            {/* Storage boxes — local disk (desktop data folder) + Google Drive backup */}
            <DataFolderSection />
            <GoogleDriveSection />

            {/* App updates — git pull + rebuild + restart (2026-05-28) */}
            <SystemUpdateSection />

            <section className="cp-section">
                <h3 className="cp-section__title">Integrations (Backend)</h3>

                <div className="cp-integration-card">
                    <div className="cp-integration-card__header">
                        <span className="cp-integration-card__title">Gmail</span>
                        <span className={`cp-status-pill ${gmailStatus?.connected ? 'cp-status-pill--ok' : 'cp-status-pill--error'}`}>
                            {gmailStatus?.connected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                    <div className="cp-integration-card__meta">
                        <span>Mailbox: {gmailStatus?.watchEmail || 'N/A'}</span>
                        <span>Fetcher: {gmailStatus?.fetcherRunning ? 'Running' : 'Stopped'}</span>
                        <span>Processed: {gmailStatus?.processedMessageCount ?? 0}</span>
                    </div>
                    <div className="cp-actions">
                        <button className="cp-btn" onClick={testGmailConnection} disabled={integrationLoading}>
                            Test Gmail
                        </button>
                        <button className="cp-btn" onClick={fetchGmailNow} disabled={integrationLoading}>
                            Sync Gmail Now
                        </button>
                    </div>
                </div>

                <div className="cp-integration-card">
                    <div className="cp-integration-card__header">
                        <span className="cp-integration-card__title">Google Calendar</span>
                        <span className={`cp-status-pill ${calendarStatus?.connected ? 'cp-status-pill--ok' : 'cp-status-pill--error'}`}>
                            {calendarStatus?.connected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                    <div className="cp-integration-card__meta">
                        <span>User: {calendarStatus?.watchEmail || 'N/A'}</span>
                        <span>Default Calendar: {calendarStatus?.defaultCalendarId || 'N/A'}</span>
                    </div>
                    <div className="cp-actions">
                        <button className="cp-btn" onClick={refreshIntegrations} disabled={integrationLoading}>
                            Refresh Events
                        </button>
                    </div>

                    <div className="cp-event-form">
                        <input
                            className="cp-input"
                            type="text"
                            placeholder="Event title"
                            value={newEventTitle}
                            onChange={(e) => setNewEventTitle(e.target.value)}
                        />
                        <input
                            className="cp-input"
                            type="datetime-local"
                            value={newEventStart}
                            onChange={(e) => setNewEventStart(e.target.value)}
                        />
                        <input
                            className="cp-input"
                            type="datetime-local"
                            value={newEventEnd}
                            onChange={(e) => setNewEventEnd(e.target.value)}
                        />
                        <button className="cp-btn" onClick={createCalendarEvent} disabled={integrationLoading}>
                            Create Event
                        </button>
                    </div>

                    <div className="cp-events">
                        {calendarEvents.length === 0 ? (
                            <div className="cp-events__empty">No upcoming events loaded</div>
                        ) : (
                            calendarEvents.map(event => (
                                <div key={event.id} className="cp-event-row">
                                    <div className="cp-event-row__title">{event.summary}</div>
                                    <div className="cp-event-row__time">
                                        {new Date(event.start).toLocaleString()} - {new Date(event.end).toLocaleString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {integrationMessage && (
                    <div className="cp-integration-message">{integrationMessage}</div>
                )}
            </section>
        </div>
    );
}
