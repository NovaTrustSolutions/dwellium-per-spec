/**
 * CommunicationModule — Letters, Forms, Inbox (mirrors AppFolio Communication)
 */
import { useState, useEffect, useCallback } from 'react';
import {
    Mail, RefreshCw, FileText, Inbox, Send, Plus,
    Search, Clock, CheckCircle, AlertTriangle, Users, Clipboard

} from 'lucide-react';
import { strataGet } from '../strataApi';
import type { Communication } from '../strataTypes';
import { useUser } from '../../../context/UserContext';

type CommTab = 'inbox' | 'letters' | 'forms';

const TABS: { id: CommTab; label: string; icon: typeof Mail }[] = [
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'letters', label: 'Letters', icon: FileText },
    { id: 'forms', label: 'Forms', icon: FileText },
];

const LETTER_TEMPLATES = [
    { id: '3-day-notice', name: '3-Day Notice to Pay or Quit', category: 'Legal', color: '#ef4444' },
    { id: '30-day-notice', name: '30-Day Notice to Vacate', category: 'Legal', color: '#f59e0b' },
    { id: 'lease-renewal', name: 'Lease Renewal Offer', category: 'Leasing', color: '#6366f1' },
    { id: 'rent-increase', name: 'Rent Increase Notice', category: 'Leasing', color: '#0ea5e9' },
    { id: 'welcome', name: 'Welcome Letter', category: 'Onboarding', color: '#10b981' },
    { id: 'move-out', name: 'Move-Out Instructions', category: 'Move-Out', color: '#a78bfa' },
    { id: 'maintenance-notice', name: 'Maintenance Entry Notice', category: 'Maintenance', color: '#818cf8' },
    { id: 'late-rent', name: 'Late Rent Reminder', category: 'Collections', color: '#ef4444' },
];

const FORM_TEMPLATES = [
    { id: 'move-in-inspection', name: 'Move-In Inspection Form', submissions: 12 },
    { id: 'move-out-inspection', name: 'Move-Out Inspection Form', submissions: 8 },
    { id: 'maintenance-request', name: 'Maintenance Request Form', submissions: 34 },
    { id: 'tenant-application', name: 'Rental Application', submissions: 19 },
    { id: 'pet-agreement', name: 'Pet Agreement Form', submissions: 6 },
    { id: 'parking-request', name: 'Parking Spot Request', submissions: 3 },
];

function channelColor(ch: string): string {
    switch (ch) {
        case 'email': return '#6366f1';
        case 'sms': return '#10b981';
        case 'phone': return '#f59e0b';
        default: return '#94a3b8';
    }
}

export default function CommunicationModule() {
    const { hasPermission } = useUser();
    const [tab, setTab] = useState<CommTab>('inbox');
    const [messages, setMessages] = useState<Communication[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Communication | null>(null);
    const [search, setSearch] = useState('');

    const TAB_PERMS: Record<CommTab, string> = {
        inbox: 'strata:communication:inbox',
        letters: 'strata:communication:letters',
        forms: 'strata:communication:forms',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        try {
            const data = await strataGet<Communication[]>('/communications');
            setMessages(data);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchMessages(); }, [fetchMessages]);

    const filteredMessages = messages.filter(m =>
        !search || m.subject?.toLowerCase().includes(search.toLowerCase()) || m.fromAddress?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">Communication</h2>
                    <p className="s-module-subtitle">Letters, forms & inbox</p>
                </div>
                <div className="s-module-actions">
                    <button className="s-btn s-btn-ghost" onClick={fetchMessages}><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {visibleTabs.map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => { setTab(t.id); setSelected(null); }}
                            style={{
                                padding: '6px 12px', border: 'none', borderRadius: 6,
                                background: tab === t.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                color: tab === t.id ? '#818cf8' : '#94a3b8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            <Icon size={13} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Inbox Tab */}
            {tab === 'inbox' && (
                <>
                    {/* Search */}
                    <div style={{ marginBottom: 12, position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                        <input
                            type="text"
                            placeholder="Search messages…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
                                color: '#e2e8f0', fontSize: 13, outline: 'none',
                            }}
                        />
                    </div>

                    {loading ? (
                        <div className="s-loading">Loading messages…</div>
                    ) : (
                        <div className="s-split-view">
                            <div className="s-list-panel">
                                {filteredMessages.length === 0 ? (
                                    <div className="s-empty">No messages found</div>
                                ) : (
                                    filteredMessages.map(msg => (
                                        <div
                                            key={msg.id}
                                            className={`s-list-item ${selected?.id === msg.id ? 'active' : ''}`}
                                            onClick={() => setSelected(msg)}
                                        >
                                            <div className="s-list-item-top">
                                                <div className="s-avatar" style={{ background: `${channelColor(msg.channel)}20`, color: channelColor(msg.channel) }}>
                                                    {msg.direction === 'inbound' ? <Inbox size={14} /> : <Send size={14} />}
                                                </div>
                                                <div className="s-list-item-info">
                                                    <span className="s-list-item-title">{msg.subject || '(No subject)'}</span>
                                                    <span className="s-list-item-sub">
                                                        {msg.direction === 'inbound' ? msg.fromAddress : msg.toAddress}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap' }}>
                                                    {new Date(msg.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="s-detail-panel">
                                {selected ? (
                                    <div className="s-glass-card">
                                        <h3 style={{ margin: '0 0 6px', color: '#e2e8f0', fontSize: 16 }}>{selected.subject || '(No subject)'}</h3>
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 12 }}>
                                            <span style={{ color: '#64748b' }}>From: <span style={{ color: '#94a3b8' }}>{selected.fromAddress}</span></span>
                                            <span style={{ color: '#64748b' }}>To: <span style={{ color: '#94a3b8' }}>{selected.toAddress}</span></span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${channelColor(selected.channel)}15`, color: channelColor(selected.channel), fontWeight: 600, textTransform: 'uppercase' }}>{selected.channel}</span>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontWeight: 500 }}>{selected.direction}</span>
                                        </div>
                                        <div style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                            {selected.body || 'No message body'}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="s-empty-detail">
                                        <Mail size={40} strokeWidth={1} />
                                        <p>Select a message to read</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Letters Tab */}
            {tab === 'letters' && (
                <div className="s-glass-card">
                    <h3 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={14} /> Letter Templates
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                        {LETTER_TEMPLATES.map(lt => (
                            <button
                                key={lt.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                                }}
                                onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = lt.color; }}
                                onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; }}
                            >
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: lt.color, flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{lt.name}</div>
                                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{lt.category}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Forms Tab */}
            {tab === 'forms' && (
                <div className="s-glass-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clipboard size={14} /> Form Templates
                        </h3>
                        <button style={{
                            padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)',
                            background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', cursor: 'pointer',
                            fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            <Plus size={12} /> New Form
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {FORM_TEMPLATES.map(ft => (
                            <div key={ft.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                background: 'rgba(255,255,255,0.02)', borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.04)',
                            }}>
                                <FileText size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{ft.name}</div>
                                </div>
                                <span style={{ fontSize: 11, color: '#64748b' }}>{ft.submissions} submissions</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
