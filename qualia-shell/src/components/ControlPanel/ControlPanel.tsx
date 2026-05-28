import { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useWindows } from '../../context/WindowContext';
import { useLayout } from '../../context/LayoutContext';
import { API_BASE } from '../../config';
import LlmIntegrationsSection from './LlmIntegrationsSection';
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
    const { theme, accentColor, toggleTheme, setAccentColor } = useTheme();
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
        const res = await fetch(`${API_BASE}/status`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to load integration status');
        setIntegrationStatus(json.data);
    };

    const loadCalendarEvents = async () => {
        const res = await fetch(`${API_BASE}/calendar/events?maxResults=6`);
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
            const res = await fetch(`${API_BASE}/gmail/test`, { method: 'POST' });
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
            const res = await fetch(`${API_BASE}/gmail/fetch`, {
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
            const res = await fetch(`${API_BASE}/calendar/events`, {
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

    return (
        <div className="control-panel">
            <section className="cp-section">
                <h3 className="cp-section__title">Appearance</h3>

                <div className="cp-field">
                    <label className="cp-label">Theme</label>
                    <button className="cp-toggle" onClick={toggleTheme}>
                        <span className={`cp-toggle__option ${theme === 'dark' ? 'cp-toggle__option--active' : ''}`}>🌙 Dark</span>
                        <span className={`cp-toggle__option ${theme === 'light' ? 'cp-toggle__option--active' : ''}`}>☀️ Light</span>
                    </button>
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
            </section>

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

            {/* Scribe editor theme picker — Cycle 10 */}
            <ScribeSettings />

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
