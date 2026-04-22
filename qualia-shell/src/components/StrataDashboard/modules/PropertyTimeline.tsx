/**
 * PropertyTimeline — Chronological activity feed for a property
 *
 * Shows workitem creations, incident reports, and audit events
 * in a vertical timeline with type icons and actor names.
 */

import { useState, useEffect } from 'react';
import {
    Wrench, AlertTriangle, FileText, Shield, Clock,
    User, ChevronDown
} from 'lucide-react';
import { strataGet } from '../strataApi';
import type { ActivityEvent } from '../strataTypes';

interface PropertyTimelineProps {
    propertyId: string;
}

function eventIcon(type: string, action: string) {
    switch (type) {
        case 'workitem': return <Wrench size={14} />;
        case 'incident': return <AlertTriangle size={14} />;
        case 'audit': return action.includes('document') ? <FileText size={14} /> : <Shield size={14} />;
        default: return <Clock size={14} />;
    }
}

function eventColor(type: string, priority?: string, severity?: string) {
    if (type === 'incident') return severity === 'high' ? '#ef4444' : '#f59e0b';
    if (type === 'workitem') {
        if (priority === 'high') return '#ef4444';
        if (priority === 'medium') return '#f59e0b';
        return '#818cf8';
    }
    return '#64748b'; // audit
}

function timeAgo(ts: string): string {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
}

export default function PropertyTimeline({ propertyId }: PropertyTimelineProps) {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        strataGet<{ events: ActivityEvent[] }>(`/property-activity/${propertyId}`, { limit: '50' })
            .then(data => { if (!cancelled) setEvents(data.events || []); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [propertyId]);

    const visibleEvents = showAll ? events : events.slice(0, 8);

    if (loading) {
        return (
            <div className="s-glass-card" style={{ padding: '16px 20px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} color="#818cf8" />
                    Activity Timeline
                </h3>
                <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '20px 0' }}>
                    Loading activity…
                </div>
            </div>
        );
    }

    return (
        <div className="s-glass-card" style={{ padding: '16px 20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} color="#818cf8" />
                Activity Timeline
                <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontWeight: 600, marginLeft: 4,
                }}>{events.length} events</span>
            </h3>

            {events.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '20px 0' }}>
                    No activity recorded for this property yet.
                </div>
            ) : (
                <div style={{ position: 'relative', paddingLeft: 24 }}>
                    {/* Vertical line */}
                    <div style={{
                        position: 'absolute', left: 7, top: 4, bottom: 4, width: 2,
                        background: 'rgba(255,255,255,0.06)', borderRadius: 1,
                    }} />

                    {visibleEvents.map((ev, idx) => {
                        const color = eventColor(ev.type, ev.priority, ev.severity);
                        return (
                            <div key={ev.id + idx} style={{
                                position: 'relative', marginBottom: 10, paddingBottom: 10,
                                borderBottom: idx < visibleEvents.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                            }}>
                                {/* Dot on the timeline */}
                                <div style={{
                                    position: 'absolute', left: -20, top: 4,
                                    width: 12, height: 12, borderRadius: '50%',
                                    background: `${color}25`, border: `2px solid ${color}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
                                </div>

                                {/* Content */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <span style={{ color, flexShrink: 0, marginTop: 1 }}>
                                        {eventIcon(ev.type, ev.action)}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 12, fontWeight: 600, color: '#e2e8f0',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                            {ev.title}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                <User size={9} /> {ev.actor}
                                            </span>
                                            <span>{ev.type === 'workitem' ? ev.domain || 'work' : ev.type}</span>
                                            {ev.status && <span className={`s-badge ${ev.status}`} style={{ fontSize: '0.45rem', padding: '1px 5px' }}>{ev.status}</span>}
                                        </div>
                                    </div>
                                    <span style={{ fontSize: 10, color: '#475569', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                        {timeAgo(ev.timestamp)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {events.length > 8 && !showAll && (
                        <button
                            onClick={() => setShowAll(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4, margin: '4px auto 0',
                                background: 'none', border: 'none', color: '#818cf8', fontSize: 11,
                                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            Show {events.length - 8} more <ChevronDown size={12} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
