/**
 * TenantPortal — Self-service tenant dashboard
 *
 * Separate from the Strata management console. Tenants see:
 *   Home | Maintenance | Payments | Lease | Messages
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Home,
    Wrench,
    DollarSign,
    FileKey2,
    MessageSquare,
    LogOut,
    Send,
    Plus,
    CheckCircle2,
    Clock,
    Building2,
    CalendarDays,
    AlertTriangle,
    Package,
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import './TenantPortal.css';
import { API_BASE } from '../../config';

type Tab = 'home' | 'maintenance' | 'payments' | 'lease' | 'messages';

const API = API_BASE;

interface DashboardData {
    tenant: { name: string; email: string };
    unit: {
        id: string; unitNumber: string; bedrooms: number; bathrooms: number;
        sqFt: number; rentAmount: number; leaseStart: string | null;
        leaseEnd: string | null; leaseRemainingDays: number | null;
    } | null;
    property: { id: string; name: string; address: string } | null;
    maintenance: { open: number; inProgress: number };
    recentPayments: any[];
}

interface WorkOrder {
    id: string; title: string; description: string; status: string;
    priority: string; createdAt: string;
}

interface Payment {
    id: string; title: string; status: string; metadata: Record<string, any>;
    createdAt: string;
}

interface Message {
    id: string; subject: string; body: string; direction: string;
    fromAddress: string; createdAt: string;
}

export default function TenantPortal() {
    const { user, logout, authFetch } = useUser();
    const [activeTab, setActiveTab] = useState<Tab>('home');
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState('');

    // ── Fetch helpers ─────────────────────────
    const fetchDashboard = useCallback(async () => {
        try {
            const res = await authFetch(`${API}/api/tenant/dashboard`);
            const json = await res.json();
            if (json.success) setDashboard(json.data);
        } catch (err) {
            console.error('[TenantPortal] Dashboard fetch failed:', err);
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    const fetchMaintenance = useCallback(async () => {
        try {
            const res = await authFetch(`${API}/api/tenant/maintenance`);
            const json = await res.json();
            if (json.success) setWorkOrders(json.data);
        } catch (err) {
            console.error('[TenantPortal] Maintenance fetch failed:', err);
        }
    }, [authFetch]);

    const fetchPayments = useCallback(async () => {
        try {
            const res = await authFetch(`${API}/api/tenant/payments`);
            const json = await res.json();
            if (json.success) setPayments(json.data);
        } catch (err) {
            console.error('[TenantPortal] Payments fetch failed:', err);
        }
    }, [authFetch]);

    const fetchMessages = useCallback(async () => {
        try {
            const res = await authFetch(`${API}/api/tenant/messages`);
            const json = await res.json();
            if (json.success) setMessages(json.data);
        } catch (err) {
            console.error('[TenantPortal] Messages fetch failed:', err);
        }
    }, [authFetch]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    useEffect(() => {
        if (activeTab === 'maintenance') fetchMaintenance();
        if (activeTab === 'payments') fetchPayments();
        if (activeTab === 'messages') fetchMessages();
    }, [activeTab, fetchMaintenance, fetchPayments, fetchMessages]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    // ── Nav items ─────────────────────────────
    const NAV: { id: Tab; label: string; icon: typeof Home }[] = [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'maintenance', label: 'Maintenance', icon: Wrench },
        { id: 'payments', label: 'Payments', icon: DollarSign },
        { id: 'lease', label: 'My Lease', icon: FileKey2 },
        { id: 'messages', label: 'Messages', icon: MessageSquare },
    ];

    // ── TAB: Home ─────────────────────────────
    function HomeTab() {
        if (loading) {
            return <div className="tp-empty"><p>Loading…</p></div>;
        }

        return (
            <div className="tp-animate">
                <div className="tp-header">
                    <h1>Welcome, {dashboard?.tenant?.name || user?.name || 'Tenant'} 👋</h1>
                    <p>
                        {dashboard?.property?.name
                            ? `${dashboard.property.name} — Unit ${dashboard.unit?.unitNumber || ''}`
                            : 'Your tenant portal'}
                    </p>
                </div>

                <div className="tp-home-grid">
                    <div className="tp-card tp-stat-card tp-animate tp-animate-delay-1">
                        <div className="tp-stat-icon cyan"><Building2 size={22} /></div>
                        <div>
                            <div className="tp-stat-value">
                                {dashboard?.unit ? `Unit ${dashboard.unit.unitNumber}` : '—'}
                            </div>
                            <div className="tp-stat-label">
                                {dashboard?.unit
                                    ? `${dashboard.unit.bedrooms}BR / ${dashboard.unit.bathrooms}BA · ${dashboard.unit.sqFt} sqft`
                                    : 'No unit assigned'}
                            </div>
                        </div>
                    </div>

                    <div className="tp-card tp-stat-card tp-animate tp-animate-delay-2">
                        <div className="tp-stat-icon green"><DollarSign size={22} /></div>
                        <div>
                            <div className="tp-stat-value">
                                {dashboard?.unit ? `$${dashboard.unit.rentAmount.toLocaleString()}` : '—'}
                            </div>
                            <div className="tp-stat-label">Monthly Rent</div>
                        </div>
                    </div>

                    <div className="tp-card tp-stat-card tp-animate tp-animate-delay-3">
                        <div className="tp-stat-icon amber"><Wrench size={22} /></div>
                        <div>
                            <div className="tp-stat-value">
                                {(dashboard?.maintenance?.open || 0) + (dashboard?.maintenance?.inProgress || 0)}
                            </div>
                            <div className="tp-stat-label">
                                Open Requests ({dashboard?.maintenance?.open || 0} new, {dashboard?.maintenance?.inProgress || 0} in progress)
                            </div>
                        </div>
                    </div>

                    <div className="tp-card tp-stat-card tp-animate tp-animate-delay-4">
                        <div className="tp-stat-icon indigo"><CalendarDays size={22} /></div>
                        <div>
                            <div className="tp-stat-value">
                                {dashboard?.unit?.leaseRemainingDays != null
                                    ? `${dashboard.unit.leaseRemainingDays} days`
                                    : '—'}
                            </div>
                            <div className="tp-stat-label">Lease Remaining</div>
                        </div>
                    </div>
                </div>

                <div className="tp-card tp-animate tp-animate-delay-3">
                    <h3><Package size={16} /> Quick Actions</h3>
                    <div className="tp-quick-actions">
                        <button className="tp-quick-btn" onClick={() => setActiveTab('maintenance')}>
                            <Wrench size={16} />
                            Submit Maintenance Request
                        </button>
                        <button className="tp-quick-btn" onClick={() => setActiveTab('payments')}>
                            <DollarSign size={16} />
                            View Payment History
                        </button>
                        <button className="tp-quick-btn" onClick={() => setActiveTab('lease')}>
                            <FileKey2 size={16} />
                            View Lease Details
                        </button>
                        <button className="tp-quick-btn" onClick={() => setActiveTab('messages')}>
                            <MessageSquare size={16} />
                            Message Management
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── TAB: Maintenance ──────────────────────
    function MaintenanceTab() {
        const [title, setTitle] = useState('');
        const [desc, setDesc] = useState('');
        const [priority, setPriority] = useState('medium');
        const [submitting, setSubmitting] = useState(false);
        const [showForm, setShowForm] = useState(false);

        const submit = async () => {
            if (!title.trim() || !desc.trim()) return;
            setSubmitting(true);
            try {
                const res = await authFetch(`${API}/api/tenant/maintenance`, {
                    method: 'POST',
                    body: JSON.stringify({ title, description: desc, priority }),
                });
                const json = await res.json();
                if (json.success) {
                    showToast('Maintenance request submitted!');
                    setTitle('');
                    setDesc('');
                    setPriority('medium');
                    setShowForm(false);
                    fetchMaintenance();
                }
            } catch (err) {
                console.error('[TenantPortal] Submit failed:', err);
            } finally {
                setSubmitting(false);
            }
        };

        return (
            <div className="tp-animate">
                <div className="tp-header">
                    <h1>Maintenance Requests</h1>
                    <p>Submit and track repair requests for your unit</p>
                </div>

                {!showForm ? (
                    <button
                        className="tp-btn tp-btn-primary"
                        style={{ marginBottom: 20 }}
                        onClick={() => setShowForm(true)}
                    >
                        <Plus size={16} />
                        New Request
                    </button>
                ) : (
                    <div className="tp-card" style={{ marginBottom: 20 }}>
                        <h3><Plus size={16} /> Submit New Request</h3>
                        <div className="tp-form">
                            <div className="tp-form-group">
                                <label>Issue Title</label>
                                <input
                                    className="tp-input"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="e.g. Leaky faucet in kitchen"
                                />
                            </div>
                            <div className="tp-form-group">
                                <label>Description</label>
                                <textarea
                                    className="tp-textarea"
                                    value={desc}
                                    onChange={e => setDesc(e.target.value)}
                                    placeholder="Describe the issue in detail..."
                                />
                            </div>
                            <div className="tp-form-group">
                                <label>Priority</label>
                                <select className="tp-select" value={priority} onChange={e => setPriority(e.target.value)}>
                                    <option value="low">Low — Minor issue</option>
                                    <option value="medium">Medium — Needs attention</option>
                                    <option value="high">High — Urgent</option>
                                    <option value="critical">Critical — Emergency</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="tp-btn tp-btn-primary" onClick={submit} disabled={submitting || !title.trim()}>
                                    <Send size={14} />
                                    {submitting ? 'Submitting…' : 'Submit Request'}
                                </button>
                                <button className="tp-btn tp-btn-ghost" onClick={() => setShowForm(false)}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="tp-card">
                    <h3><Wrench size={16} /> Your Requests</h3>
                    {workOrders.length === 0 ? (
                        <div className="tp-empty">
                            <CheckCircle2 />
                            <h4>No maintenance requests</h4>
                            <p>Everything looks good! Submit a request if you need help.</p>
                        </div>
                    ) : (
                        <div className="tp-work-order-list">
                            {workOrders.map(wo => (
                                <div key={wo.id} className="tp-work-order">
                                    <span className={`tp-wo-priority ${wo.priority}`}>{wo.priority}</span>
                                    <div className="tp-wo-title">{wo.title}</div>
                                    <span className={`tp-wo-badge ${wo.status}`}>
                                        {wo.status.replace('_', ' ')}
                                    </span>
                                    <span className="tp-wo-date">
                                        {new Date(wo.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── TAB: Payments ─────────────────────────
    function PaymentsTab() {
        return (
            <div className="tp-animate">
                <div className="tp-header">
                    <h1>Payment History</h1>
                    <p>View your rent payment records</p>
                </div>

                <div className="tp-card">
                    <h3><DollarSign size={16} /> Payments</h3>
                    {payments.length === 0 ? (
                        <div className="tp-empty">
                            <DollarSign />
                            <h4>No payment records</h4>
                            <p>Payment history will appear here once transactions are recorded.</p>
                        </div>
                    ) : (
                        <table className="tp-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map(p => (
                                    <tr key={p.id}>
                                        <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                                        <td style={{ color: '#e2e8f0' }}>{p.title}</td>
                                        <td>
                                            <span className={`tp-wo-badge ${p.status}`}>
                                                {p.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        );
    }

    // ── TAB: Lease ─────────────────────────────
    function LeaseTab() {
        return (
            <div className="tp-animate">
                <div className="tp-header">
                    <h1>Lease Details</h1>
                    <p>Your current lease information</p>
                </div>

                <div className="tp-card">
                    <h3><FileKey2 size={16} /> Current Lease</h3>
                    {!dashboard?.unit ? (
                        <div className="tp-empty">
                            <AlertTriangle />
                            <h4>No lease data</h4>
                            <p>Contact management if this is an error.</p>
                        </div>
                    ) : (
                        <div className="tp-lease-grid">
                            <div className="tp-lease-field">
                                <span className="label">Property</span>
                                <span className="value">{dashboard.property?.name || '—'}</span>
                            </div>
                            <div className="tp-lease-field">
                                <span className="label">Unit</span>
                                <span className="value accent">{dashboard.unit.unitNumber}</span>
                            </div>
                            <div className="tp-lease-field">
                                <span className="label">Monthly Rent</span>
                                <span className="value">${dashboard.unit.rentAmount.toLocaleString()}</span>
                            </div>
                            <div className="tp-lease-field">
                                <span className="label">Lease Start</span>
                                <span className="value">
                                    {dashboard.unit.leaseStart
                                        ? new Date(dashboard.unit.leaseStart).toLocaleDateString()
                                        : '—'}
                                </span>
                            </div>
                            <div className="tp-lease-field">
                                <span className="label">Lease End</span>
                                <span className="value">
                                    {dashboard.unit.leaseEnd
                                        ? new Date(dashboard.unit.leaseEnd).toLocaleDateString()
                                        : '—'}
                                </span>
                            </div>
                            <div className="tp-lease-field">
                                <span className="label">Days Remaining</span>
                                <span className="value accent">
                                    {dashboard.unit.leaseRemainingDays != null
                                        ? dashboard.unit.leaseRemainingDays
                                        : '—'}
                                </span>
                            </div>
                            <div className="tp-lease-field">
                                <span className="label">Bedrooms</span>
                                <span className="value">{dashboard.unit.bedrooms}</span>
                            </div>
                            <div className="tp-lease-field">
                                <span className="label">Bathrooms</span>
                                <span className="value">{dashboard.unit.bathrooms}</span>
                            </div>
                            <div className="tp-lease-field">
                                <span className="label">Square Feet</span>
                                <span className="value">{dashboard.unit.sqFt.toLocaleString()}</span>
                            </div>
                            <div className="tp-lease-field">
                                <span className="label">Address</span>
                                <span className="value">{dashboard.property?.address || '—'}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── TAB: Messages ─────────────────────────
    function MessagesTab() {
        const [subject, setSubject] = useState('');
        const [body, setBody] = useState('');
        const [sending, setSending] = useState(false);

        const sendMessage = async () => {
            if (!subject.trim() || !body.trim()) return;
            setSending(true);
            try {
                const res = await authFetch(`${API}/api/tenant/messages`, {
                    method: 'POST',
                    body: JSON.stringify({ subject, body }),
                });
                const json = await res.json();
                if (json.success) {
                    showToast('Message sent to management!');
                    setSubject('');
                    setBody('');
                    fetchMessages();
                }
            } catch (err) {
                console.error('[TenantPortal] Send message failed:', err);
            } finally {
                setSending(false);
            }
        };

        return (
            <div className="tp-animate">
                <div className="tp-header">
                    <h1>Messages</h1>
                    <p>Communicate with property management</p>
                </div>

                <div className="tp-card" style={{ marginBottom: 20 }}>
                    <h3><Send size={16} /> New Message</h3>
                    <div className="tp-form">
                        <div className="tp-form-group">
                            <label>Subject</label>
                            <input
                                className="tp-input"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="e.g. Question about parking"
                            />
                        </div>
                        <div className="tp-form-group">
                            <label>Message</label>
                            <textarea
                                className="tp-textarea"
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder="Write your message..."
                            />
                        </div>
                        <button
                            className="tp-btn tp-btn-primary"
                            onClick={sendMessage}
                            disabled={sending || !subject.trim() || !body.trim()}
                        >
                            <Send size={14} />
                            {sending ? 'Sending…' : 'Send Message'}
                        </button>
                    </div>
                </div>

                <div className="tp-card">
                    <h3><MessageSquare size={16} /> Conversation History</h3>
                    {messages.length === 0 ? (
                        <div className="tp-empty">
                            <MessageSquare />
                            <h4>No messages yet</h4>
                            <p>Send a message above to start a conversation.</p>
                        </div>
                    ) : (
                        <div className="tp-message-list">
                            {messages.map(msg => (
                                <div key={msg.id} className="tp-message">
                                    <div className="tp-message-header">
                                        <div>
                                            <span className={`tp-message-direction ${msg.direction}`}>
                                                {msg.direction === 'inbound' ? 'You' : 'Management'}
                                            </span>
                                            <span className="tp-message-subject">{msg.subject}</span>
                                        </div>
                                        <span className="tp-message-date">
                                            {new Date(msg.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="tp-message-body">{msg.body}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Render ─────────────────────────────────
    const renderTab = () => {
        switch (activeTab) {
            case 'home': return <HomeTab />;
            case 'maintenance': return <MaintenanceTab />;
            case 'payments': return <PaymentsTab />;
            case 'lease': return <LeaseTab />;
            case 'messages': return <MessagesTab />;
        }
    };

    return (
        <div className="tenant-portal">
            <nav className="tp-sidebar">
                <div className="tp-sidebar-brand">
                    <div className="tp-sidebar-brand-icon">🏠</div>
                    <div>
                        <h2>Dwellium</h2>
                        <span>Tenant Portal</span>
                    </div>
                </div>

                <div className="tp-sidebar-nav">
                    {NAV.map(item => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                className={`tp-nav-item ${activeTab === item.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(item.id)}
                            >
                                <Icon size={18} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="tp-sidebar-footer">
                    <div style={{ padding: '8px 12px', fontSize: 12, color: '#64748b' }}>
                        <div style={{ fontWeight: 600, color: '#94a3b8' }}>{user?.name}</div>
                        <div>{user?.email}</div>
                    </div>
                    <button className="tp-nav-item" onClick={logout}>
                        <LogOut size={18} />
                        <span>Sign Out</span>
                    </button>
                </div>
            </nav>

            <main className="tp-main">
                {renderTab()}
            </main>

            {toast && (
                <div className="tp-toast">
                    <CheckCircle2 size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}
