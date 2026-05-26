/**
 * PropertyTimeline — Chronological activity feed for a property
 *
 * Shows workitem creations, incident reports, and audit events
 * in a vertical timeline with type icons and actor names.
 */

import { useState, useEffect } from 'react';
import {
    Wrench, AlertTriangle, FileText, Shield, Clock,
    User, ChevronDown, Mail, ShieldCheck, Umbrella
} from 'lucide-react';
import { strataGet } from '../strataApi';
import type { ActivityEvent, ActivityEventSource, PropertyTimelineView } from '../strataTypes';
// Task 2.10 — GR-13 observability wiring (same pattern as Task 1.5 /
// 2.3 / 2.5 / 2.7 / 2.2 / 2.1). ErrorBoundary wraps the module body;
// Sentry breadcrumbs are try/catch-wrapped so missing DSN is silent.
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';

interface PropertyTimelineProps {
    propertyId: string;
}

function eventIcon(type: string, action: string) {
    switch (type) {
        case 'workitem': return <Wrench size={14} />;
        case 'incident': return <AlertTriangle size={14} />;
        case 'audit': return action.includes('document') ? <FileText size={14} /> : <Shield size={14} />;
        // Task 2.10 — 3 new ActivityEventSource literals.
        case 'communication': return <Mail size={14} />;
        case 'compliance': return <ShieldCheck size={14} />;
        case 'insurance': return <Umbrella size={14} />;
        default: return <Clock size={14} />;
    }
}

function eventColor(type: string, priority?: string, severity?: string) {
    if (type === 'incident') return severity === 'high' ? '#ef4444' : '#f59e0b';
    if (type === 'workitem') {
        if (priority === 'high') return '#ef4444';
        if (priority === 'medium') return '#f59e0b';
        return '#D6FE51';
    }
    // Task 2.10 — source-specific colors.
    if (type === 'communication') return '#22c55e';
    if (type === 'compliance') {
        if (severity === 'high') return '#ef4444';
        if (severity === 'medium') return '#f59e0b';
        return '#D6FE51';
    }
    if (type === 'insurance') {
        if (severity === 'high') return '#ef4444';
        if (severity === 'medium') return '#f59e0b';
        return '#3b82f6';
    }
    return '#64748b'; // audit / default
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
    // Task 2.10 — per-source counts (null until first successful fetch).
    // PropertyTimelineView shape from the upgraded handler superset.
    const [sourceBreakdown, setSourceBreakdown] = useState<PropertyTimelineView['sourceBreakdown'] | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        // The /property-activity/{id} handler returns PropertyTimelineView
        // (superset of {events}). Defensive shape-read works pre-and-post
        // Task-2.10 backend deployments.
        strataGet<PropertyTimelineView & { events?: ActivityEvent[] }>(
            `/property-activity/${propertyId}`, { limit: '50' }
        )
            .then(data => {
                if (cancelled) return;
                setEvents(data?.events || []);
                setSourceBreakdown(data?.sourceBreakdown ?? null);
                // Task 2.10 — GR-13 breadcrumb on load.
                try {
                    Sentry.addBreadcrumb({
                        category: 'ui.load',
                        message: 'property.timeline.loaded',
                        level: 'info',
                        data: {
                            propertyId,
                            total: data?.total ?? (data?.events?.length ?? 0),
                            sourceBreakdown: data?.sourceBreakdown ?? null,
                        },
                    });
                } catch { /* Sentry no-op when DSN unset */ }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [propertyId]);

    const visibleEvents = showAll ? events : events.slice(0, 8);

    if (loading) {
        return (
            <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#f87171', fontSize: 12 }}>Property timeline unavailable.</div>}>
            <div className="s-glass-card" data-testid="property-timeline-module" style={{ padding: '16px 20px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} color="#818cf8" />
                    Activity Timeline
                </h3>
                <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '20px 0' }}>
                    Loading activity…
                </div>
            </div>
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#f87171', fontSize: 12 }}>Property timeline unavailable.</div>}>
        <div className="s-glass-card" data-testid="property-timeline-module" style={{ padding: '16px 20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} color="#818cf8" />
                Activity Timeline
                <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(214,254,81,0.15)', color: '#D6FE51', fontWeight: 600, marginLeft: 4,
                }}>{events.length} events</span>
            </h3>

            {/* Task 2.10 — source breakdown chip row, shown when the
                handler returns a PropertyTimelineView with per-source
                counts. Omitted when rendering a pre-Task-2.10 backend
                that returns only {events}. */}
            {sourceBreakdown && (
                <div data-testid="property-timeline-source-breakdown" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {(['workitem', 'communication', 'compliance', 'insurance', 'incident', 'audit'] as ActivityEventSource[]).map(src => (
                        <span key={src} style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontWeight: 500,
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            {src}: {sourceBreakdown[src] ?? 0}
                        </span>
                    ))}
                </div>
            )}

            {events.length === 0 ? (
                <div data-testid="property-timeline-empty" style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '20px 0' }}>
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
                            <div
                                key={ev.id + idx}
                                data-testid="property-timeline-event"
                                data-source={ev.type}
                                onClick={() => {
                                    try {
                                        Sentry.addBreadcrumb({
                                            category: 'ui.click',
                                            message: 'property.timeline.event.click',
                                            level: 'info',
                                            data: { source: ev.type, sourceId: ev.sourceId ?? ev.id, propertyId: ev.propertyId ?? propertyId },
                                        });
                                    } catch { /* no-op */ }
                                }}
                                style={{
                                    position: 'relative', marginBottom: 10, paddingBottom: 10,
                                    cursor: 'pointer',
                                    borderBottom: idx < visibleEvents.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                                }}
                            >
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
                            data-testid="property-timeline-show-more"
                            onClick={() => setShowAll(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4, margin: '4px auto 0',
                                background: 'none', border: 'none', color: '#D6FE51', fontSize: 11,
                                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            Show {events.length - 8} more <ChevronDown size={12} />
                        </button>
                    )}
                </div>
            )}
        </div>
        </ErrorBoundary>
    );
}
