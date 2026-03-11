/**
 * AccountingModule — Full accounting hub (mirrors AppFolio Accounting)
 * Tabs: Overview, Receivables, Payables, Bank Accounts, Journal Entries, Bank Transfers, GL Accounts, Diagnostics
 */
import { useState, useEffect, useCallback } from 'react';
import {
    DollarSign, RefreshCw, ArrowUpRight, ArrowDownRight, TrendingUp,
    Building2, CreditCard, FileText, BookOpen, ArrowLeftRight,
    AlertTriangle, Search, CheckCircle, Clock, Landmark
} from 'lucide-react';
import { strataGet } from '../strataApi';
import { useUser } from '../../../context/UserContext';

type AcctTab = 'overview' | 'receivables' | 'payables' | 'bank-accounts' | 'journal-entries' | 'bank-transfers' | 'gl-accounts' | 'tenant-ledger' | 'diagnostics';

interface Invoice {
    id: string; type: string; vendorOrTenant: string; amount: number; status: string;
    dueDate: string; propertyId: string; description: string; createdAt: string;
}

const TABS: { id: AcctTab; label: string; icon: typeof DollarSign }[] = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'receivables', label: 'Receivables', icon: ArrowUpRight },
    { id: 'payables', label: 'Payables', icon: ArrowDownRight },
    { id: 'bank-accounts', label: 'Bank Accounts', icon: Landmark },
    { id: 'journal-entries', label: 'Journal Entries', icon: BookOpen },
    { id: 'bank-transfers', label: 'Bank Transfers', icon: ArrowLeftRight },
    { id: 'gl-accounts', label: 'GL Accounts', icon: FileText },
    { id: 'tenant-ledger', label: 'Tenant Ledger', icon: CreditCard },
    { id: 'diagnostics', label: 'Diagnostics', icon: AlertTriangle },
];

const MOCK_TENANT_LEDGER: { id: string; tenant: string; unit: string; entries: { date: string; description: string; charge: number; payment: number; balance: number }[] }[] = [
    {
        id: 'tl1', tenant: 'John Basher & Erin H. Devine', unit: 'Woodland 2771-2', entries: [
            { date: '2026-03-01', description: 'March Rent', charge: 2650, payment: 0, balance: 2650 },
            { date: '2026-03-03', description: 'Online Payment', charge: 0, payment: 2650, balance: 0 },
        ]
    },
    {
        id: 'tl2', tenant: 'Eumeko K. Fuller-Barrow', unit: 'Woodland 2782-6', entries: [
            { date: '2026-02-01', description: 'Feb Rent', charge: 3000, payment: 0, balance: 3000 },
            { date: '2026-02-05', description: 'Late Fee', charge: 50, payment: 0, balance: 3050 },
            { date: '2026-02-10', description: 'Partial Payment', charge: 0, payment: 2000, balance: 1050 },
            { date: '2026-03-01', description: 'March Rent', charge: 3000, payment: 0, balance: 4050 },
        ]
    },
    {
        id: 'tl3', tenant: 'Fletcher A. Glass', unit: 'Riverwood D09', entries: [
            { date: '2026-03-01', description: 'March Rent', charge: 1375, payment: 0, balance: 1375 },
            { date: '2026-03-01', description: 'AutoPay', charge: 0, payment: 1375, balance: 0 },
        ]
    },
];

const MOCK_BANK_ACCOUNTS: { id: string; name: string; bank: string; number: string; balance: number; type: string }[] = [
    { id: 'ba1', name: 'ZP Operations', bank: 'Chase Bank', number: '****7392', balance: 284500, type: 'Checking' },
    { id: 'ba2', name: 'Security Deposits', bank: 'Chase Bank', number: '****1845', balance: 97200, type: 'Trust' },
    { id: 'ba3', name: 'Reserve Fund', bank: 'Ally Bank', number: '****5516', balance: 45000, type: 'Savings' },
    { id: 'ba4', name: 'Petty Cash', bank: 'On-site', number: 'N/A', balance: 850, type: 'Cash' },
];

const MOCK_JOURNAL_ENTRIES: { id: string; date: string; reference: string; description: string; debit: number; credit: number; status: string }[] = [
    { id: 'je1', date: '2026-03-01', reference: 'JE-2026-0301', description: 'March Rent Roll — All Properties', debit: 146500, credit: 146500, status: 'posted' },
    { id: 'je2', date: '2026-03-03', reference: 'JE-2026-0303', description: 'Vendor payments — plumbing + HVAC', debit: 8750, credit: 8750, status: 'posted' },
    { id: 'je3', date: '2026-03-05', reference: 'JE-2026-0305', description: 'Security deposit refund — D09', debit: 1450, credit: 1450, status: 'pending' },
    { id: 'je4', date: '2026-03-06', reference: 'JE-2026-0306', description: 'Insurance premium — Woodland Parc', debit: 3200, credit: 3200, status: 'posted' },
    { id: 'je5', date: '2026-03-07', reference: 'JE-2026-0307', description: 'Late fee charges — 12 units', debit: 600, credit: 600, status: 'pending' },
];

const MOCK_GL_ACCOUNTS: { id: string; number: string; name: string; type: string; balance: number }[] = [
    { id: 'gl1', number: '1000', name: 'Operating Cash', type: 'Asset', balance: 284500 },
    { id: 'gl2', number: '1100', name: 'Accounts Receivable', type: 'Asset', balance: 19050 },
    { id: 'gl3', number: '1200', name: 'Security Deposits Held', type: 'Asset', balance: 97200 },
    { id: 'gl4', number: '2000', name: 'Accounts Payable', type: 'Liability', balance: 12400 },
    { id: 'gl5', number: '2100', name: 'Prepaid Rent', type: 'Liability', balance: 8650 },
    { id: 'gl6', number: '4000', name: 'Rental Income', type: 'Revenue', balance: 146500 },
    { id: 'gl7', number: '4100', name: 'Late Fee Income', type: 'Revenue', balance: 600 },
    { id: 'gl8', number: '5000', name: 'Maintenance Expense', type: 'Expense', balance: 8750 },
    { id: 'gl9', number: '5100', name: 'Insurance Expense', type: 'Expense', balance: 3200 },
    { id: 'gl10', number: '5200', name: 'Property Management Fee', type: 'Expense', balance: 14650 },
];

const MOCK_DIAGNOSTICS: { id: string; type: string; message: string; action: string | null }[] = [
    { id: 'd1', type: 'warning', message: '12 tenants have outstanding balances totaling $19,050 — oldest delinquency is 45 days', action: 'View AR Aging' },
    { id: 'd2', type: 'success', message: 'All bank account reconciliations are up to date as of March 6, 2026', action: null },
    { id: 'd3', type: 'warning', message: '3 vendor invoices due within 5 days — $4,200 total', action: 'Review Payables' },
    { id: 'd4', type: 'info', message: 'QuickBooks sync not configured — connect to enable automated journal posting', action: 'Setup QB' },
    { id: 'd5', type: 'success', message: 'March rent roll posted — $146,500 across 4 properties, 240 occupied units', action: null },
];

function statusColor(s: string) {
    switch (s) { case 'paid': case 'posted': return '#10b981'; case 'pending': return '#f59e0b'; case 'overdue': return '#ef4444'; default: return '#94a3b8'; }
}

function typeColor(t: string) {
    switch (t) { case 'Asset': return '#0ea5e9'; case 'Liability': return '#f59e0b'; case 'Revenue': return '#10b981'; case 'Expense': return '#ef4444'; default: return '#94a3b8'; }
}

function diagColor(t: string) {
    switch (t) { case 'success': return '#10b981'; case 'warning': return '#f59e0b'; case 'info': return '#6366f1'; default: return '#94a3b8'; }
}

export default function AccountingModule() {
    const { hasPermission } = useUser();
    const [tab, setTab] = useState<AcctTab>('overview');
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const TAB_PERMS: Record<AcctTab, string> = {
        overview: 'strata:accounting:overview',
        receivables: 'strata:accounting:receivables',
        payables: 'strata:accounting:payables',
        'bank-accounts': 'strata:accounting:bank-accounts',
        'journal-entries': 'strata:accounting:journal-entries',
        'bank-transfers': 'strata:accounting:bank-transfers',
        'gl-accounts': 'strata:accounting:gl-accounts',
        'tenant-ledger': 'strata:accounting:tenant-ledger',
        diagnostics: 'strata:accounting:diagnostics',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await strataGet<Invoice[]>('/invoices');
            setInvoices(data);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const ar = invoices.filter(i => i.type === 'receivable');
    const ap = invoices.filter(i => i.type === 'payable');
    const totalAR = ar.reduce((s, i) => s + i.amount, 0);
    const totalAP = ap.reduce((s, i) => s + i.amount, 0);
    const overdueAR = ar.filter(i => i.status === 'overdue');
    const overdueAP = ap.filter(i => i.status === 'overdue');

    const filteredAR = ar.filter(i => !search || i.vendorOrTenant.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase()));
    const filteredAP = ap.filter(i => !search || i.vendorOrTenant.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">Accounting</h2>
                    <p className="s-module-subtitle">AR: ${totalAR.toLocaleString()} · AP: ${totalAP.toLocaleString()}</p>
                </div>
                <div className="s-module-actions">
                    <button className="s-btn s-btn-ghost" onClick={fetchData}><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {visibleTabs.map(t => {
                    const Icon = t.icon;
                    return (
                        <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); }}
                            style={{
                                padding: '6px 12px', border: 'none', borderRadius: 6,
                                background: tab === t.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                color: tab === t.id ? '#818cf8' : '#94a3b8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                            <Icon size={13} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {loading && <div className="s-loading">Loading accounting data…</div>}

            {/* ══════════ OVERVIEW ══════════ */}
            {tab === 'overview' && !loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {[
                        { label: 'Total Receivable', value: `$${totalAR.toLocaleString()}`, color: '#10b981', icon: <ArrowUpRight size={18} /> },
                        { label: 'Total Payable', value: `$${totalAP.toLocaleString()}`, color: '#ef4444', icon: <ArrowDownRight size={18} /> },
                        { label: 'Net Position', value: `$${(totalAR - totalAP).toLocaleString()}`, color: totalAR > totalAP ? '#10b981' : '#ef4444', icon: <TrendingUp size={18} /> },
                        { label: 'Overdue AR', value: `${overdueAR.length} ($${overdueAR.reduce((s, i) => s + i.amount, 0).toLocaleString()})`, color: '#f59e0b', icon: <Clock size={18} /> },
                        { label: 'Overdue AP', value: `${overdueAP.length} ($${overdueAP.reduce((s, i) => s + i.amount, 0).toLocaleString()})`, color: '#ef4444', icon: <AlertTriangle size={18} /> },
                        { label: 'Bank Balance', value: `$${MOCK_BANK_ACCOUNTS.reduce((s, b) => s + b.balance, 0).toLocaleString()}`, color: '#6366f1', icon: <Landmark size={18} /> },
                    ].map(m => (
                        <div key={m.label} className="s-glass-card" style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span style={{ color: m.color }}>{m.icon}</span>
                                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>{m.label}</span>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>{m.value}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ══════════ RECEIVABLES ══════════ */}
            {tab === 'receivables' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                            <input type="text" placeholder="Search receivables…" value={search} onChange={e => setSearch(e.target.value)}
                                style={{ width: '100%', padding: '6px 8px 6px 28px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', fontSize: 12, outline: 'none' }} />
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Tenant', 'Description', 'Amount', 'Due Date', 'Status'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAR.map(i => (
                                <tr key={i.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{i.vendorOrTenant}</td>
                                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{i.description}</td>
                                    <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 600 }}>${i.amount.toLocaleString()}</td>
                                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{i.dueDate}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${statusColor(i.status)}15`, color: statusColor(i.status), fontWeight: 600, textTransform: 'uppercase' }}>{i.status}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ══════════ PAYABLES ══════════ */}
            {tab === 'payables' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                            <input type="text" placeholder="Search payables…" value={search} onChange={e => setSearch(e.target.value)}
                                style={{ width: '100%', padding: '6px 8px 6px 28px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', fontSize: 12, outline: 'none' }} />
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Vendor', 'Description', 'Amount', 'Due Date', 'Status'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAP.map(i => (
                                <tr key={i.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{i.vendorOrTenant}</td>
                                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{i.description}</td>
                                    <td style={{ padding: '8px 12px', color: '#ef4444', fontWeight: 600 }}>${i.amount.toLocaleString()}</td>
                                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{i.dueDate}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${statusColor(i.status)}15`, color: statusColor(i.status), fontWeight: 600, textTransform: 'uppercase' }}>{i.status}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ══════════ BANK ACCOUNTS ══════════ */}
            {tab === 'bank-accounts' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                        <Landmark size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Bank Accounts — Total: ${MOCK_BANK_ACCOUNTS.reduce((s, b) => s + b.balance, 0).toLocaleString()}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Account Name', 'Bank', 'Account #', 'Type', 'Balance'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {MOCK_BANK_ACCOUNTS.map(ba => (
                                <tr key={ba.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{ba.name}</td>
                                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{ba.bank}</td>
                                    <td style={{ padding: '8px 12px', color: '#64748b', fontFamily: 'monospace' }}>{ba.number}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', fontWeight: 600 }}>{ba.type}</span>
                                    </td>
                                    <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 700, fontSize: 14 }}>${ba.balance.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ══════════ JOURNAL ENTRIES ══════════ */}
            {tab === 'journal-entries' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                        <BookOpen size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Journal Entries
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Status'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {MOCK_JOURNAL_ENTRIES.map(je => (
                                <tr key={je.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{je.date}</td>
                                    <td style={{ padding: '8px 12px', color: '#a5b4fc', fontFamily: 'monospace', fontWeight: 600 }}>{je.reference}</td>
                                    <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{je.description}</td>
                                    <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 600 }}>${je.debit.toLocaleString()}</td>
                                    <td style={{ padding: '8px 12px', color: '#ef4444', fontWeight: 600 }}>${je.credit.toLocaleString()}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${statusColor(je.status)}15`, color: statusColor(je.status), fontWeight: 600, textTransform: 'uppercase' }}>{je.status}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ══════════ BANK TRANSFERS ══════════ */}
            {tab === 'bank-transfers' && !loading && (
                <div className="s-glass-card" style={{ textAlign: 'center', padding: 40 }}>
                    <ArrowLeftRight size={40} strokeWidth={1} style={{ color: '#475569', marginBottom: 12 }} />
                    <h3 style={{ color: '#e2e8f0', margin: '0 0 6px' }}>Bank Transfers</h3>
                    <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>Transfer funds between bank accounts</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {MOCK_BANK_ACCOUNTS.filter(b => b.type !== 'Cash').map(ba => (
                            <span key={ba.id} style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 12 }}>
                                {ba.name}: ${ba.balance.toLocaleString()}
                            </span>
                        ))}
                    </div>
                    <button style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        <ArrowLeftRight size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> New Transfer
                    </button>
                </div>
            )}

            {/* ══════════ GL ACCOUNTS ══════════ */}
            {tab === 'gl-accounts' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                        <FileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Chart of Accounts
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Account #', 'Name', 'Type', 'Balance'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {MOCK_GL_ACCOUNTS.map(gl => (
                                <tr key={gl.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '8px 12px', color: '#a5b4fc', fontFamily: 'monospace', fontWeight: 600 }}>{gl.number}</td>
                                    <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 500 }}>{gl.name}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${typeColor(gl.type)}15`, color: typeColor(gl.type), fontWeight: 600 }}>{gl.type}</span>
                                    </td>
                                    <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>${gl.balance.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ══════════ TENANT LEDGER ══════════ */}
            {tab === 'tenant-ledger' && !loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {MOCK_TENANT_LEDGER.map(tl => {
                        const lastBalance = tl.entries[tl.entries.length - 1]?.balance ?? 0;
                        return (
                            <div key={tl.id} className="s-glass-card">
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>
                                        <CreditCard size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{tl.tenant}
                                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400, marginLeft: 8 }}>{tl.unit}</span>
                                    </span>
                                    <span style={{
                                        fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                                        background: lastBalance > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                                        color: lastBalance > 0 ? '#ef4444' : '#10b981',
                                    }}>
                                        {lastBalance > 0 ? `Owes $${lastBalance.toLocaleString()}` : 'Paid in Full'}
                                    </span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                            {['Date', 'Description', 'Charge', 'Payment', 'Balance'].map(h => (
                                                <th key={h} style={{ padding: '6px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tl.entries.map((e, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <td style={{ padding: '6px 12px', color: '#94a3b8' }}>{e.date}</td>
                                                <td style={{ padding: '6px 12px', color: '#e2e8f0' }}>{e.description}</td>
                                                <td style={{ padding: '6px 12px', color: e.charge > 0 ? '#ef4444' : '#475569', fontWeight: e.charge > 0 ? 600 : 400 }}>
                                                    {e.charge > 0 ? `$${e.charge.toLocaleString()}` : '—'}
                                                </td>
                                                <td style={{ padding: '6px 12px', color: e.payment > 0 ? '#10b981' : '#475569', fontWeight: e.payment > 0 ? 600 : 400 }}>
                                                    {e.payment > 0 ? `$${e.payment.toLocaleString()}` : '—'}
                                                </td>
                                                <td style={{ padding: '6px 12px', color: e.balance > 0 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>
                                                    ${e.balance.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ══════════ DIAGNOSTICS ══════════ */}
            {tab === 'diagnostics' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                        <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Accounting Diagnostics
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12 }}>
                        {MOCK_DIAGNOSTICS.map(d => (
                            <div key={d.id} style={{
                                padding: '12px 14px', borderRadius: 8,
                                background: `${diagColor(d.type)}08`,
                                border: `1px solid ${diagColor(d.type)}20`,
                                display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                                {d.type === 'success' ? <CheckCircle size={16} style={{ color: diagColor(d.type), flexShrink: 0 }} /> :
                                    d.type === 'warning' ? <AlertTriangle size={16} style={{ color: diagColor(d.type), flexShrink: 0 }} /> :
                                        <Clock size={16} style={{ color: diagColor(d.type), flexShrink: 0 }} />}
                                <span style={{ fontSize: 13, color: '#e2e8f0', flex: 1 }}>{d.message}</span>
                                {d.action && (
                                    <button style={{
                                        padding: '4px 10px', borderRadius: 6, border: `1px solid ${diagColor(d.type)}30`,
                                        background: `${diagColor(d.type)}12`, color: diagColor(d.type),
                                        cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                                    }}>{d.action}</button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
