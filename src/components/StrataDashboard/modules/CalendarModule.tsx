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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const API = 'http://localhost:3000';

type Tab = 'calendar' | 'integrations';

const typeColor: Record<string, string> = {
    lease: '#6366f1',
    inspection: '#818cf8',
    work_order: '#f59e0b',
    task: '#10b981',
    payment: '#0ea5e9',
    recurring: '#a78bfa',
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
        <div className="s-module">
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
                            style={{ padding: '5px 10px', borderRadius: 0, background: tab === 'calendar' ? 'rgba(99,102,241,0.2)' : 'transparent', color: tab === 'calendar' ? '#6366f1' : 'var(--s-text-secondary)' }}
                            onClick={() => setTab('calendar')}
                        >
                            <CalendarDays size={14} /> Calendar
                        </button>
                        <button
                            className="s-btn s-btn-ghost"
                            style={{ padding: '5px 10px', borderRadius: 0, background: tab === 'integrations' ? 'rgba(99,102,241,0.2)' : 'transparent', color: tab === 'integrations' ? '#6366f1' : 'var(--s-text-secondary)' }}
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
                                <h3 style={{ margin: 0, fontSize: '1rem', color: '#e2e8f0' }}>Google Calendar</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                    Sync property events, lease expirations, and inspections
                                </p>
                            </div>
                            {gcalLoading ? (
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Checking…</span>
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
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Connected Account</div>
                                        <div style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 500 }}>{gcalStatus.watchEmail || 'Service Account'}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Calendar</div>
                                        <div style={{ fontSize: '0.85rem', color: '#a5b4fc' }}>{gcalStatus.defaultCalendarId}</div>
                                    </div>
                                </div>

                                {/* Upcoming Google Events */}
                                {googleEvents.length > 0 && (
                                    <div>
                                        <h4 style={{ margin: '8px 0 6px', fontSize: '0.85rem', color: '#94a3b8' }}>Upcoming Google Calendar Events</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                                            {googleEvents.slice(0, 10).map(ev => (
                                                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(66,133,244,0.06)', borderRadius: 6, border: '1px solid rgba(66,133,244,0.12)' }}>
                                                    <Clock size={12} style={{ color: '#4285f4', flexShrink: 0 }} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.82rem', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.summary}</div>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap' }}>
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
                            <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', fontSize: '0.82rem', color: '#f87171' }}>
                                <p style={{ margin: 0 }}>Google Calendar requires OAuth2 setup. Configure your credentials in the backend <code>.env</code> file with Google service account or OAuth2 tokens.</p>
                                {gcalStatus.error && (
                                    <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Error: {gcalStatus.error}</p>
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
                                <h3 style={{ margin: 0, fontSize: '1rem', color: '#e2e8f0' }}>Apple Calendar</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
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
                                    <div style={{ fontSize: '0.88rem', color: '#e2e8f0', fontWeight: 600 }}>Subscribe to Calendar</div>
                                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                        Auto-sync events in Apple Calendar via iCal subscription. Events update automatically.
                                    </div>
                                </div>
                                <ExternalLink size={14} style={{ color: '#64748b', flexShrink: 0 }} />
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
                                    <div style={{ fontSize: '0.88rem', color: '#e2e8f0', fontWeight: 600 }}>Download .ics File</div>
                                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                        One-time download of all upcoming events. Import into Apple Calendar, Outlook, or any app that supports .ics files.
                                    </div>
                                </div>
                                <ExternalLink size={14} style={{ color: '#64748b', flexShrink: 0 }} />
                            </div>

                            {/* Info */}
                            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                                <strong style={{ color: '#94a3b8' }}>How it works:</strong> Calendar subscription keeps Apple Calendar in sync with property events (lease expirations, inspections, maintenance). The .ics download is a snapshot you can import manually.
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
                                <h3 style={{ margin: 0, fontSize: '1rem', color: '#94a3b8' }}>Microsoft Outlook</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569' }}>
                                    Coming soon — Use the .ics download above for manual import in the meantime.
                                </p>
                            </div>
                            <span className="s-badge" style={{ background: 'rgba(255,255,255,0.06)', color: '#64748b' }}>Planned</span>
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
                                        <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 18, fontWeight: 600 }}>
                                            {MONTHS[month]} {year}
                                        </h3>
                                        <button className="s-btn s-btn-ghost s-btn-sm" onClick={today} style={{ fontSize: 11 }}>Today</button>
                                    </div>
                                    <button className="s-btn s-btn-ghost s-btn-sm" onClick={nextMonth}><ChevronRight size={16} /></button>
                                </div>

                                {/* Day Headers */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                                    {DAYS.map(d => (
                                        <div key={d} style={{ textAlign: 'center', fontSize: 11, color: '#64748b', fontWeight: 600, padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
                                    ))}
                                </div>

                                {/* Calendar Cells */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                                    {calendarDays.map((day, i) => {
                                        if (day === null) return <div key={`e-${i}`} style={{ height: 72 }} />;
                                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const dayEvents = getEventsForDay(day);
                                        const isToday = dateStr === todayStr;
                                        const isSelected = dateStr === selectedDate;

                                        return (
                                            <div
                                                key={day}
                                                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                                                style={{
                                                    height: 72,
                                                    padding: '4px 6px',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'rgba(99,102,241,0.15)' : isToday ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)',
                                                    border: `1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : isToday ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)'}`,
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? '#10b981' : '#94a3b8', marginBottom: 2 }}>{day}</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
                                                    {dayEvents.slice(0, 3).map((ev, idx) => (
                                                        <div key={idx} style={{
                                                            fontSize: 9, padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                            background: `${typeColor[ev.type] || '#6366f1'}20`, color: typeColor[ev.type] || '#a5b4fc',
                                                        }}>
                                                            {ev.title}
                                                        </div>
                                                    ))}
                                                    {dayEvents.length > 3 && (
                                                        <div style={{ fontSize: 9, color: '#64748b' }}>+{dayEvents.length - 3} more</div>
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
                        <div style={{ flex: 1, minWidth: 260 }}>
                            <div className="s-glass-card" style={{ padding: 16 }}>
                                <h3 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                                                        <span style={{ color: typeColor[ev.type] || '#a5b4fc' }}>{typeIcon(ev.type)}</span>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{ev.title}</span>
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#64748b' }}>{ev.description || 'No description'}</div>
                                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                        <span style={{
                                                            fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase',
                                                            background: `${typeColor[ev.type] || '#6366f1'}15`, color: typeColor[ev.type] || '#a5b4fc',
                                                        }}>{ev.type}</span>
                                                        <span className={`s-badge s-badge-sm ${ev.status}`}>{ev.status}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p style={{ color: '#475569', fontSize: 12, textAlign: 'center', padding: 20 }}>No events on this date</p>
                                    )
                                ) : (
                                    <p style={{ color: '#475569', fontSize: 12, textAlign: 'center', padding: 20 }}>Click a date to view events</p>
                                )}
                            </div>

                            {/* Upcoming Events */}
                            <div className="s-glass-card" style={{ padding: 16, marginTop: 12 }}>
                                <h3 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>Upcoming</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {events
                                        .filter(e => e.dueDate && e.dueDate >= todayStr)
                                        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
                                        .slice(0, 8)
                                        .map(ev => (
                                            <div key={ev.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '6px 8px', borderRadius: 6,
                                                background: 'rgba(255,255,255,0.02)',
                                            }}>
                                                <span style={{ color: typeColor[ev.type] || '#a5b4fc' }}>{typeIcon(ev.type)}</span>
                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                    <div style={{ fontSize: 12, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                                                </div>
                                                <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>
                                                    {ev.dueDate ? new Date(ev.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                                </span>
                                            </div>
                                        ))
                                    }
                                    {events.filter(e => e.dueDate && e.dueDate >= todayStr).length === 0 && (
                                        <p style={{ color: '#475569', fontSize: 12, textAlign: 'center' }}>No upcoming events</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
