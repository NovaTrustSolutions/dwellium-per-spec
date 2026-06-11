/**
 * CalendarModule — Scheduling & events view with Apple/Google Calendar integration
 */
import { useState, useEffect, useCallback } from 'react';
import {
    CalendarDays, RefreshCw, ChevronLeft, ChevronRight, Clock,
    Building2, Wrench, FileKey2, Settings, CheckCircle2, XCircle,
    Download, ExternalLink, Link2
} from 'lucide-react';
import { strataGet } from '../strataApi';
import type { Workitem } from '../strataTypes';
import { LoadingState, ErrorState } from '../StateView';
import { useUser, getAuthToken } from '../../../context/UserContext';
// Task 2.1 — GR-13 observability wiring. ErrorBoundary wraps the
// module body; Sentry breadcrumbs are try/catch-wrapped so missing
// DSN is a silent no-op (matches Task 1.5 / 2.3 / 2.5 / 2.7 / 2.2
// precedent).
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const API = 'http://localhost:3000';

type Tab = 'calendar' | 'integrations';

const typeColor: Record<string, string> = {
    lease: '#D6FE51',
    inspection: '#D6FE51',
    work_order: '#f59e0b',
    task: '#22c55e',
    payment: '#0ea5e9',
    recurring: '#D6FE51',
};

const typeIcon = (t: string) => {
    switch (t) {
        case 'lease': return <FileKey2 size={12} />;
        case 'inspection': return <Building2 size={12} />;
        case 'work_order': return <Wrench size={12} />;
        default: return <Clock size={12} />;
    }
};

interface CalendarStatus {
    connected: boolean;
    watchEmail: string;
    defaultCalendarId: string;
    error?: string;
}

interface ExternalEvent {
    id: string;
    summary: string;
    description?: string;
    start: string;
    end: string;
    location?: string;
    status?: string;
    htmlLink?: string;
}

export default function CalendarModule() {
    const { hasPermission } = useUser();
    const [events, setEvents] = useState<Workitem[]>([]);
    const [googleEvents, setGoogleEvents] = useState<ExternalEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('calendar');
    const [gcalStatus, setGcalStatus] = useState<CalendarStatus | null>(null);
    const [gcalLoading, setGcalLoading] = useState(false);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const getToken = () => getAuthToken() || '';

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await strataGet<Workitem[]>('/workitems');
            setEvents(data);
            // Task 2.1 — GR-13 breadcrumb on successful load. Fail-soft
            // try/catch around Sentry so missing DSN doesn't surface.
            try {
                const inspectionCount = Array.isArray(data)
                    ? data.filter(w => w.type === 'inspection').length
                    : 0;
                Sentry.addBreadcrumb({
                    category: 'ui.load',
                    message: 'calendar.module.loaded',
                    level: 'info',
                    data: { eventCount: Array.isArray(data) ? data.length : 0, inspectionCount },
                });
            } catch { /* Sentry no-op when DSN unset */ }
        } catch (e) { console.error(e); setError('Failed to load calendar events'); }
        setLoading(false);
    }, []);

    const fetchGoogleCalendarStatus = useCallback(async () => {
        setGcalLoading(true);
        try {
            const res = await fetch(`${API}/api/calendar/status`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (res.ok) {
                const data = await res.json();
                setGcalStatus(data);
            }
        } catch (e) { console.error(e); }
        setGcalLoading(false);
    }, []);

    const fetchGoogleEvents = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/calendar/events?maxResults=30`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (res.ok) {
                const data = await res.json();
                setGoogleEvents(data);
            }
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);
    useEffect(() => {
        if (tab === 'integrations') {
            fetchGoogleCalendarStatus();
            fetchGoogleEvents();
        }
    }, [tab, fetchGoogleCalendarStatus, fetchGoogleEvents]);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const today = () => setCurrentDate(new Date());

    // Build calendar grid
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) calendarDays.push(null);
    for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

    const getEventsForDay = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return events.filter(e => e.dueDate?.startsWith(dateStr));
    };

    const todayStr = new Date().toISOString().slice(0, 10);
    const selectedEvents = selectedDate
        ? events.filter(e => e.dueDate?.startsWith(selectedDate))
        : [];

    const handleDownloadICS = () => {
        const url = `${API}/api/calendar/export/ics`;
        window.open(url, '_blank');
    };

    // Generate webcal subscribe link
    const webcalUrl = `webcal://localhost:3000/api/calendar/export/ics`;

    return (
        <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#ef4444', fontSize: 12 }}>Calendar module unavailable.</div>}>
        <div className="s-module" data-testid="calendar-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">Calendar</h2>
                    <p className="s-module-subtitle">Lease expirations, inspections, maintenance & events</p>
                </div>
                <div className="s-module-actions" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {/* Tab toggle */}
                    <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginRight: 8 }}>
                        <button
                            className="s-btn s-btn-ghost"
                            style={{ padding: '5px 10px', borderRadius: 0, background: tab === 'calendar' ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent', color: tab === 'calendar' ? '#D6FE51' : 'var(--s-text-secondary)' }}
                            onClick={() => setTab('calendar')}
                        >
                            <CalendarDays size={14} /> Calendar
                        </button>
                        <button
                            className="s-btn s-btn-ghost"
                            style={{ padding: '5px 10px', borderRadius: 0, background: tab === 'integrations' ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent', color: tab === 'integrations' ? '#D6FE51' : 'var(--s-text-secondary)' }}
                            onClick={() => setTab('integrations')}
                        >
                            <Settings size={14} /> Integrations
                        </button>
                    </div>
                    <button className="s-btn s-btn-ghost" onClick={fetchEvents}><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* ═══════ INTEGRATIONS TAB ═══════ */}
            {tab === 'integrations' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* ── Google Calendar ── */}
                    <div className="s-glass-card" style={{ padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 10,
                                background: 'linear-gradient(135deg, #4285F4, #34A853)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <CalendarDays size={22} color="#fff" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Google Calendar</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                    Sync property events, lease expirations, and inspections
                                </p>
                            </div>
                            {gcalLoading ? (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Checking…</span>
                            ) : gcalStatus?.connected ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#22c55e', fontSize: '0.82rem', fontWeight: 600 }}>
                                    <CheckCircle2 size={14} /> Connected
                                </span>
                            ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}>
                                    <XCircle size={14} /> Not Connected
                                </span>
                            )}
                        </div>

                        {gcalStatus?.connected && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Connected Account</div>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>{gcalStatus.watchEmail || 'Service Account'}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Calendar</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>{gcalStatus.defaultCalendarId}</div>
                                    </div>
                                </div>

                                {/* Upcoming Google Events */}
                                {googleEvents.length > 0 && (
                                    <div>
                                        <h4 style={{ margin: '8px 0 6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Upcoming Google Calendar Events</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                                            {googleEvents.slice(0, 10).map(ev => (
                                                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(66,133,244,0.06)', borderRadius: 6, border: '1px solid rgba(66,133,244,0.12)' }}>
                                                    <Clock size={12} style={{ color: '#4285f4', flexShrink: 0 }} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.summary}</div>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                                        {new Date(ev.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </span>
                                                    {ev.htmlLink && (
                                                        <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" style={{ color: '#4285f4', flexShrink: 0 }}>
                                                            <ExternalLink size={12} />
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {gcalStatus && !gcalStatus.connected && (
                            <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', fontSize: '0.82rem', color: '#ef4444' }}>
                                <p style={{ margin: 0 }}>Google Calendar requires OAuth2 setup. Configure your credentials in the backend <code>.env</code> file with Google service account or OAuth2 tokens.</p>
                                {gcalStatus.error && (
                                    <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Error: {gcalStatus.error}</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Apple Calendar ── */}
                    <div className="s-glass-card" style={{ padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 10,
                                background: 'linear-gradient(135deg, #FF3B30, #FF9500)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <CalendarDays size={22} color="#fff" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Apple Calendar</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                    Subscribe or download property calendar events to Apple Calendar
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* Subscribe via webcal */}
                            <div
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                    background: 'rgba(255,59,48,0.06)', borderRadius: 8, border: '1px solid rgba(255,59,48,0.15)',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                                onClick={() => window.open(webcalUrl)}
                            >
                                <Link2 size={18} style={{ color: '#FF3B30', flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600 }}>Subscribe to Calendar</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                        Auto-sync events in Apple Calendar via iCal subscription. Events update automatically.
                                    </div>
                                </div>
                                <ExternalLink size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            </div>

                            {/* Download ICS */}
                            <div
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                    background: 'rgba(255,149,0,0.06)', borderRadius: 8, border: '1px solid rgba(255,149,0,0.15)',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                                onClick={handleDownloadICS}
                            >
                                <Download size={18} style={{ color: '#FF9500', flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600 }}>Download .ics File</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                        One-time download of all upcoming events. Import into Apple Calendar, Outlook, or any app that supports .ics files.
                                    </div>
                                </div>
                                <ExternalLink size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            </div>

                            {/* Info */}
                            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                <strong style={{ color: 'var(--text-secondary)' }}>How it works:</strong> Calendar subscription keeps Apple Calendar in sync with property events (lease expirations, inspections, maintenance). The .ics download is a snapshot you can import manually.
                            </div>
                        </div>
                    </div>

                    {/* ── Outlook / Other ── */}
                    <div className="s-glass-card" style={{ padding: 20, opacity: 0.6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 10,
                                background: 'linear-gradient(135deg, #0078D4, #00BCF2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <CalendarDays size={22} color="#fff" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>Microsoft Outlook</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                    Coming soon — Use the .ics download above for manual import in the meantime.
                                </p>
                            </div>
                            <span className="s-badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>Planned</span>
                        </div>
                    </div>
                </div>

            ) : loading ? (
                /* ═══════ CALENDAR TAB — LOADING ═══════ */
                <LoadingState message="Loading calendar…" />
            ) : error ? (
                <ErrorState message={error} onRetry={fetchEvents} />
            ) : (
                /* ═══════ CALENDAR TAB ═══════ */
                <div style={{ display: 'flex', gap: 16 }}>
                    {/* Calendar Grid */}
                    {hasPermission('strata:calendar:events-list') && (
                        <div style={{ flex: 2 }}>
                            <div className="s-glass-card" style={{ padding: '16px 20px' }}>
                                {/* Month Navigation */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <button className="s-btn s-btn-ghost s-btn-sm" onClick={prevMonth}><ChevronLeft size={16} /></button>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18, fontWeight: 600 }}>
                                            {MONTHS[month]} {year}
                                        </h3>
                                        <button className="s-btn s-btn-ghost s-btn-sm" onClick={today} style={{ fontSize: 11 }}>Today</button>
                                    </div>
                                    <button className="s-btn s-btn-ghost s-btn-sm" onClick={nextMonth}><ChevronRight size={16} /></button>
                                </div>

                                {/* Day Headers */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                                    {DAYS.map(d => (
                                        <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
                                    ))}
                                </div>

                                {/* Calendar Cells */}
                                <div data-testid="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                                    {calendarDays.map((day, i) => {
                                        if (day === null) return <div key={`e-${i}`} style={{ height: 72 }} />;
                                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const dayEvents = getEventsForDay(day);
                                        const isToday = dateStr === todayStr;
                                        const isSelected = dateStr === selectedDate;

                                        return (
                                            <div
                                                key={day}
                                                data-date={dateStr}
                                                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                                                style={{
                                                    height: 72,
                                                    padding: '4px 6px',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : isToday ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)',
                                                    border: `1px solid ${isSelected ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : isToday ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)'}`,
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? '#22c55e' : '#94a3b8', marginBottom: 2 }}>{day}</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
                                                    {dayEvents.slice(0, 3).map((ev, idx) => (
                                                        <div
                                                            key={idx}
                                                            data-testid="calendar-grid-event-dot"
                                                            data-type={ev.type}
                                                            style={{
                                                                fontSize: 9, padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                                background: `${typeColor[ev.type] || '#D6FE51'}20`, color: typeColor[ev.type] || '#D6FE51',
                                                            }}
                                                        >
                                                            {ev.title}
                                                        </div>
                                                    ))}
                                                    {dayEvents.length > 3 && (
                                                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>+{dayEvents.length - 3} more</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Event Detail Panel */}
                    {hasPermission('strata:calendar:day-detail') && (
                        <div style={{ flex: 1, minWidth: 260 }} data-testid="calendar-event-detail">
                            <div className="s-glass-card" style={{ padding: 16 }}>
                                <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CalendarDays size={16} />
                                    {selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a Date'}
                                </h3>
                                {selectedDate ? (
                                    selectedEvents.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {selectedEvents.map(ev => (
                                                <div key={ev.id} style={{
                                                    padding: '10px 12px', borderRadius: 8,
                                                    background: 'rgba(255,255,255,0.03)',
                                                    border: '1px solid rgba(255,255,255,0.06)',
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                        <span style={{ color: typeColor[ev.type] || '#D6FE51' }}>{typeIcon(ev.type)}</span>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{ev.title}</span>
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ev.description || 'No description'}</div>
                                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                        <span style={{
                                                            fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase',
                                                            background: `${typeColor[ev.type] || '#D6FE51'}15`, color: typeColor[ev.type] || '#D6FE51',
                                                        }}>{ev.type}</span>
                                                        <span className={`s-badge s-badge-sm ${ev.status}`}>{ev.status}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p data-testid="calendar-empty" style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', padding: 20 }}>No events on this date</p>
                                    )
                                ) : (
                                    <p style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', padding: 20 }}>Click a date to view events</p>
                                )}
                            </div>

                            {/* Upcoming Events — slice bumped 8 -> 30 so Task 2.1's
                                9 AHA inspection seed can render alongside other
                                upcoming events without pre-filter capping. */}
                            <div className="s-glass-card" style={{ padding: 16, marginTop: 12 }}>
                                <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>Upcoming</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {events
                                        .filter(e => e.dueDate && e.dueDate >= todayStr)
                                        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
                                        .slice(0, 30)
                                        .map(ev => (
                                            <div
                                                key={ev.id}
                                                data-testid={ev.type === 'inspection' ? 'calendar-inspection-event' : undefined}
                                                data-due-date={ev.type === 'inspection' ? ev.dueDate ?? undefined : undefined}
                                                onClick={() => {
                                                    if (ev.type === 'inspection') {
                                                        try {
                                                            Sentry.addBreadcrumb({
                                                                category: 'ui.click',
                                                                message: 'calendar.inspection.click',
                                                                level: 'info',
                                                                data: { id: ev.id, dueDate: ev.dueDate, propertyId: ev.propertyId },
                                                            });
                                                        } catch { /* no-op */ }
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '6px 8px', borderRadius: 6,
                                                    background: 'rgba(255,255,255,0.02)',
                                                    cursor: ev.type === 'inspection' ? 'pointer' : 'default',
                                                }}
                                            >
                                                <span style={{ color: typeColor[ev.type] || '#D6FE51' }}>{typeIcon(ev.type)}</span>
                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                    <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                                                </div>
                                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                                    {ev.dueDate ? new Date(ev.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                                </span>
                                            </div>
                                        ))
                                    }
                                    {events.filter(e => e.dueDate && e.dueDate >= todayStr).length === 0 && (
                                        <p style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>No upcoming events</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
        </ErrorBoundary>
    );
}
