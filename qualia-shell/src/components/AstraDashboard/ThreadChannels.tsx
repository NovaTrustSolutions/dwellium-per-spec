/**
 * ThreadChannels — Partitioned communication view with 4 channels:
 * Corporate, Management, Tenant-Facing, Combined.
 */
import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config';
import {
    Building, Users, UserCircle, Layers,
    Send, Clock, ChevronRight, RefreshCw, MessageSquare
} from 'lucide-react';


interface CommEntry {
    id: string;
    workitemId: string | null;
    channel: string;
    direction: string;
    fromAddress: string;
    toAddress: string;
    subject: string;
    body: string;
    entityId: string | null;
    createdAt: string;
}

type ChannelId = 'corporate' | 'management' | 'tenant' | 'combined';

const CHANNELS: { id: ChannelId; label: string; icon: React.ReactNode; color: string; description: string }[] = [
    { id: 'corporate', label: 'Corporate', icon: <Building size={16} />, color: '#6366f1', description: 'Board-level & inter-company' },
    { id: 'management', label: 'Management', icon: <Users size={16} />, color: '#22c55e', description: 'PM ↔ maintenance crews' },
    { id: 'tenant', label: 'Tenant-Facing', icon: <UserCircle size={16} />, color: '#eab308', description: 'Tenant notices & comms' },
    { id: 'combined', label: 'Combined', icon: <Layers size={16} />, color: '#94a3b8', description: 'All messages, unfiltered' },
];

const CHANNEL_FILTER_MAP: Record<ChannelId, string | null> = {
    corporate: 'corporate',
    management: 'management',
    tenant: 'tenant',
    combined: null, // show all
};

// No demo threads — only real communications from backend

export default function ThreadChannels() {
    const [activeChannel, setActiveChannel] = useState<ChannelId>('combined');
    const [comms, setComms] = useState<CommEntry[]>([]);
    const [selectedComm, setSelectedComm] = useState<CommEntry | null>(null);
    const [composeOpen, setComposeOpen] = useState(false);
    const [composeTo, setComposeTo] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeChannel, setComposeChannel] = useState<string>('corporate');

    // Fetch real comms from backend (merge with demos)
    const fetchComms = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/dwellium/comms?limit=50`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setComms(data);
            }
        } catch {
            // No backend — show empty
        }
    }, []);

    useEffect(() => { fetchComms(); }, [fetchComms]);

    const filteredComms = activeChannel === 'combined'
        ? comms
        : comms.filter(c => c.channel === CHANNEL_FILTER_MAP[activeChannel]);

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        const diff = Date.now() - d.getTime();
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    const sendCompose = async () => {
        try {
            await fetch(`${API_BASE}/api/gmail/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: composeTo,
                    subject: composeSubject,
                    body: composeBody,
                    channel: composeChannel,
                }),
            });
            setComposeOpen(false);
            fetchComms();
        } catch (err) {
            console.error('Failed to send:', err);
        }
    };

    return (
        <div className="tc-channels">
            {/* Channel Tabs */}
            <div className="tc-tabs">
                {CHANNELS.map(ch => (
                    <button
                        key={ch.id}
                        className={`tc-tab ${activeChannel === ch.id ? 'tc-tab-active' : ''}`}
                        onClick={() => { setActiveChannel(ch.id); setSelectedComm(null); }}
                        style={{ '--tc-accent': ch.color } as React.CSSProperties}
                    >
                        {ch.icon}
                        <span className="tc-tab-label">{ch.label}</span>
                        <span className="tc-tab-count">
                            {ch.id === 'combined'
                                ? comms.length
                                : comms.filter(c => c.channel === CHANNEL_FILTER_MAP[ch.id]).length
                            }
                        </span>
                    </button>
                ))}
                <button className="tc-compose-btn" onClick={() => setComposeOpen(true)}>
                    <Send size={14} /> Compose
                </button>
            </div>

            <div className="tc-split">
                {/* Thread List */}
                <div className="tc-list">
                    {filteredComms.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(comm => {
                        const ch = CHANNELS.find(c => c.id === comm.channel || CHANNEL_FILTER_MAP[c.id] === comm.channel);
                        return (
                            <button
                                key={comm.id}
                                className={`tc-thread ${selectedComm?.id === comm.id ? 'tc-thread-active' : ''}`}
                                onClick={() => setSelectedComm(comm)}
                            >
                                <div className="tc-thread-top">
                                    <span className="tc-thread-dot" style={{ background: ch?.color || '#888' }} />
                                    <span className="tc-thread-from">
                                        {comm.direction === 'inbound' ? comm.fromAddress.split('@')[0] : `→ ${comm.toAddress.split('@')[0]}`}
                                    </span>
                                    <span className="tc-thread-time">{formatTime(comm.createdAt)}</span>
                                </div>
                                <span className="tc-thread-subject">{comm.subject}</span>
                                <span className="tc-thread-preview">{comm.body.slice(0, 80)}…</span>
                            </button>
                        );
                    })}
                    {filteredComms.length === 0 && (
                        <div className="tc-empty">No messages in this channel</div>
                    )}
                </div>

                {/* Detail Pane */}
                <div className="tc-detail">
                    {selectedComm ? (
                        <>
                            <div className="tc-detail-header">
                                <h3 className="tc-detail-subject">{selectedComm.subject}</h3>
                                <div className="tc-detail-meta">
                                    <span className="tc-detail-dir">{selectedComm.direction === 'inbound' ? '📥 Inbound' : '📤 Outbound'}</span>
                                    <span className="tc-detail-channel">{selectedComm.channel}</span>
                                    <span className="tc-detail-time"><Clock size={12} /> {new Date(selectedComm.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="tc-detail-addresses">
                                    <span><strong>From:</strong> {selectedComm.fromAddress}</span>
                                    <span><strong>To:</strong> {selectedComm.toAddress}</span>
                                </div>
                            </div>
                            <div className="tc-detail-body">
                                {selectedComm.body.split('\n').map((line, i) => (
                                    <p key={i}>{line || '\u00A0'}</p>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="tc-no-selection">
                            <MessageSquare size={32} className="tc-ns-icon" />
                            <p>Select a thread to view</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Compose Modal */}
            {composeOpen && (
                <div className="tc-modal-overlay" onClick={() => setComposeOpen(false)}>
                    <div className="tc-modal" onClick={e => e.stopPropagation()}>
                        <h3>New Message</h3>
                        <label className="tc-modal-label">Channel</label>
                        <select className="tc-modal-select" value={composeChannel} onChange={e => setComposeChannel(e.target.value)}>
                            <option value="corporate">Corporate</option>
                            <option value="management">Management</option>
                            <option value="tenant">Tenant-Facing</option>
                        </select>
                        <label className="tc-modal-label">To</label>
                        <input className="tc-modal-input" value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="email@example.com" />
                        <label className="tc-modal-label">Subject</label>
                        <input className="tc-modal-input" value={composeSubject} onChange={e => setComposeSubject(e.target.value)} />
                        <label className="tc-modal-label">Body</label>
                        <textarea className="tc-modal-textarea" value={composeBody} onChange={e => setComposeBody(e.target.value)} rows={6} />
                        <div className="tc-modal-actions">
                            <button className="tc-modal-cancel" onClick={() => setComposeOpen(false)}>Cancel</button>
                            <button className="tc-modal-send" onClick={sendCompose} disabled={!composeTo.trim()}>
                                <Send size={14} /> Send
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
