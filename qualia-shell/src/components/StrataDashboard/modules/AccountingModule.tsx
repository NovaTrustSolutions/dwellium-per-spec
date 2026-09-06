/**
 * AccountingModule — Full accounting hub (mirrors AppFolio Accounting)
 * Tabs: Overview, Receivables, Payables, Bank Accounts, Journal Entries, Bank Transfers,
 * GL Accounts, Tenant Ledger, Recurring Charges, Diagnostics
 *
 * Every tab reads the real /invoices (or /recurring-charges) rows and shows an
 * honest empty state when a source is empty or unavailable — no placeholder
 * tenants, bank balances, journal entries, GL balances or diagnostic sentences.
 * Bank Accounts, Bank Transfers and GL Accounts have no backend source yet and
 * say so ("Not available — connect QuickBooks"), same as ReportingModule.
 */
import { useState, useEffect, useCallback } from 'react';
import {
    DollarSign, RefreshCw, ArrowUpRight, ArrowDownRight, TrendingUp,
    Building2, CreditCard, FileText, BookOpen, ArrowLeftRight,
    AlertTriangle, Search, CheckCircle, Clock, Landmark, Plus, X, Repeat
} from 'lucide-react';
import { strataGet, strataPost } from '../strataApi';
import EntityLink from '../EntityLink';
import { useUser } from '../../../context/UserContext';
import ProfileSpaces from './ProfileSpaces';
import type { RecurringCharge } from '../strataTypes';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';
import { NotYet } from '../../common/NotYet';

type AcctTab = 'overview' | 'receivables' | 'payables' | 'bank-accounts' | 'journal-entries' | 'bank-transfers' | 'gl-accounts' | 'tenant-ledger' | 'recurring-charges' | 'diagnostics';

interface Invoice {
    id: string; type: string; vendorOrTenant: string; amount: number; status: string;
    dueDate: string; propertyId: string; description: string; createdAt: string;
    /** Linked entity id (tenant on AR, vendor on AP) — null on unlinked rows. */
    entityId?: string | null;
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
    { id: 'recurring-charges', label: 'Recurring Charges', icon: Repeat },
    { id: 'diagnostics', label: 'Diagnostics', icon: AlertTriangle },
];

const DAY_MS = 86400000;
const money = (n: number): string => `$${Number(n || 0).toLocaleString()}`;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const sum = (rows: Invoice[]): number => rows.reduce((s, i) => s + Number(i.amount || 0), 0);
const isOpen = (i: Invoice): boolean => i.status !== 'paid' && i.status !== 'void';

interface LedgerRow { date: string; description: string; charge: number; payment: number; balance: number }
interface TenantLedger { key: string; tenant: string; entityId: string | null; rows: LedgerRow[]; owed: number }

/** Tenant Ledger = the real receivable invoices grouped per tenant (entityId,
 * falling back to the display name). Every invoice is a charge; a `paid` one
 * also counts as its own payment; `void` rows are skipped. Balance is the
 * running unpaid total. */
function deriveTenantLedgers(invoices: Invoice[]): TenantLedger[] {
    const byTenant = new Map<string, TenantLedger>();
    const receivables = invoices
        .filter(i => i.type === 'receivable' && i.status !== 'void')
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    for (const i of receivables) {
        const key = i.entityId || i.vendorOrTenant || '—';
        const ledger = byTenant.get(key) ?? { key, tenant: i.vendorOrTenant || 'Unnamed tenant', entityId: i.entityId ?? null, rows: [], owed: 0 };
        const amount = Number(i.amount || 0);
        const payment = i.status === 'paid' ? amount : 0;
        ledger.owed += amount - payment;
        ledger.rows.push({ date: i.dueDate || '—', description: i.description || '—', charge: amount, payment, balance: ledger.owed });
        byTenant.set(key, ledger);
    }
    return [...byTenant.values()];
}

interface Diagnostic { id: string; type: 'warning' | 'success'; message: string; action?: { label: string; tab: AcctTab } }

/** Diagnostics derived from the real invoice rows only: overdue AR, overdue AP
 * and unpaid AP due in the next 7 days. Nothing about bank reconciliation,
 * rent rolls or QuickBooks sync — there is no source for those here. */
function deriveDiagnostics(invoices: Invoice[], now = Date.now()): Diagnostic[] {
    const overdueAR = invoices.filter(i => i.type === 'receivable' && i.status === 'overdue');
    const overdueAP = invoices.filter(i => i.type === 'payable' && i.status === 'overdue');
    const dueSoonAP = invoices.filter(i => {
        if (i.type !== 'payable' || !isOpen(i) || i.status === 'overdue' || !i.dueDate) return false;
        const diff = new Date(i.dueDate).getTime() - now;
        return diff >= 0 && diff <= 7 * DAY_MS;
    });
    const out: Diagnostic[] = [];
    if (overdueAR.length) out.push({ id: 'ar-overdue', type: 'warning', message: `${plural(overdueAR.length, 'overdue receivable')} totaling ${money(sum(overdueAR))}`, action: { label: 'View Receivables', tab: 'receivables' } });
    if (overdueAP.length) out.push({ id: 'ap-overdue', type: 'warning', message: `${plural(overdueAP.length, 'overdue payable')} totaling ${money(sum(overdueAP))}`, action: { label: 'Review Payables', tab: 'payables' } });
    if (dueSoonAP.length) out.push({ id: 'ap-due-soon', type: 'warning', message: `${plural(dueSoonAP.length, 'payable')} due within 7 days — ${money(sum(dueSoonAP))}`, action: { label: 'Review Payables', tab: 'payables' } });
    if (!out.length) out.push({ id: 'ok', type: 'success', message: invoices.length ? 'No overdue receivables or payables, and nothing due within 7 days' : 'No invoices on file yet — nothing to diagnose' });
    return out;
}

function statusColor(s: string) {
    switch (s) { case 'paid': case 'posted': return '#22c55e'; case 'pending': return '#f59e0b'; case 'overdue': return '#ef4444'; default: return '#94a3b8'; }
}

function diagColor(t: string) {
    switch (t) { case 'success': return '#22c55e'; case 'warning': return '#f59e0b'; case 'info': return '#D6FE51'; default: return '#94a3b8'; }
}

/** Honest empty state for the tabs that have no backend source yet
 * (same copy as ReportingModule's Metrics tab). */
function Unavailable({ icon: Icon, title, reason }: { icon: typeof DollarSign; title: string; reason: string }) {
    return (
        <div className="s-glass-card" style={{ textAlign: 'center', padding: 40 }}>
            <Icon size={40} strokeWidth={1} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 6px' }}>{title}</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>Not available — connect QuickBooks</p>
            <div style={{ display: 'inline-flex', marginTop: 12 }}><NotYet reason={reason} /></div>
        </div>
    );
}

export default function AccountingModule() {
    const { hasPermission } = useUser();
    const [tab, setTab] = useState<AcctTab>('overview');
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showAddEntry, setShowAddEntry] = useState(false);
    // Task 1.5 — Recurring Charges tab state.
    const [recurringCharges, setRecurringCharges] = useState<RecurringCharge[]>([]);
    const [recurringLoading, setRecurringLoading] = useState(false);
    const [recurringError, setRecurringError] = useState<string | null>(null);

    const TAB_PERMS: Record<AcctTab, string> = {
        overview: 'strata:accounting:overview',
        receivables: 'strata:accounting:receivables',
        payables: 'strata:accounting:payables',
        'bank-accounts': 'strata:accounting:bank-accounts',
        'journal-entries': 'strata:accounting:journal-entries',
        'bank-transfers': 'strata:accounting:bank-transfers',
        'gl-accounts': 'strata:accounting:gl-accounts',
        'tenant-ledger': 'strata:accounting:tenant-ledger',
        'recurring-charges': 'strata:accounting:recurring-charges',
        diagnostics: 'strata:accounting:diagnostics',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Backend routes disagree on returning a bare array vs { data: [] } — accept both.
            const data = await strataGet<Invoice[] | { data: Invoice[] }>('/invoices');
            setInvoices(Array.isArray(data) ? data : (data?.data ?? []));
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Task 1.5 — lazy-load recurring charges when tab becomes active; emit
    // a Sentry breadcrumb on tab activation (GR-13, safe no-op without DSN).
    useEffect(() => {
        if (tab !== 'recurring-charges') return;
        try {
            Sentry.addBreadcrumb({
                category: 'ui.click',
                message: 'accounting.recurringCharges.tabActivated',
                level: 'info',
            });
        } catch { /* no-op when Sentry not initialised */ }
        let cancelled = false;
        setRecurringLoading(true);
        setRecurringError(null);
        strataGet<RecurringCharge[]>('/recurring-charges')
            .then((rows) => { if (!cancelled) setRecurringCharges(rows); })
            .catch((err) => { if (!cancelled) setRecurringError(err?.message || 'Failed to load recurring charges'); })
            .finally(() => { if (!cancelled) setRecurringLoading(false); });
        return () => { cancelled = true; };
    }, [tab]);

    const ar = invoices.filter(i => i.type === 'receivable');
    const ap = invoices.filter(i => i.type === 'payable');
    const totalAR = ar.reduce((s, i) => s + i.amount, 0);
    const totalAP = ap.reduce((s, i) => s + i.amount, 0);
    const overdueAR = ar.filter(i => i.status === 'overdue');
    const overdueAP = ap.filter(i => i.status === 'overdue');

    const filteredAR = ar.filter(i => !search || i.vendorOrTenant.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase()));
    const filteredAP = ap.filter(i => !search || i.vendorOrTenant.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase()));

    // Journal Entries / Tenant Ledger / Diagnostics all derive from the same real rows.
    const journal = invoices.filter(i => i.type === 'journal');
    const ledgers = deriveTenantLedgers(invoices);
    const diagnostics = deriveDiagnostics(invoices);

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">Accounting</h2>
                    <p className="s-module-subtitle">AR: ${totalAR.toLocaleString()} · AP: ${totalAP.toLocaleString()}</p>
                </div>
                <div className="s-module-actions">
                    <button className="s-btn s-btn-ghost" onClick={fetchData} aria-label="Refresh accounting data"><RefreshCw size={14} /></button>
                    <button className="s-btn s-btn-primary" onClick={() => setShowAddEntry(true)}><Plus size={14} /> New Entry</button>
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
                                background: tab === t.id ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(255,255,255,0.04)',
                                color: tab === t.id ? '#D6FE51' : '#94a3b8',
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
                        { label: 'Total Receivable', value: `$${totalAR.toLocaleString()}`, color: '#22c55e', icon: <ArrowUpRight size={18} /> },
                        { label: 'Total Payable', value: `$${totalAP.toLocaleString()}`, color: '#ef4444', icon: <ArrowDownRight size={18} /> },
                        { label: 'Net Position', value: `$${(totalAR - totalAP).toLocaleString()}`, color: totalAR > totalAP ? '#22c55e' : '#ef4444', icon: <TrendingUp size={18} /> },
                        { label: 'Overdue AR', value: `${overdueAR.length} ($${overdueAR.reduce((s, i) => s + i.amount, 0).toLocaleString()})`, color: '#f59e0b', icon: <Clock size={18} /> },
                        { label: 'Overdue AP', value: `${overdueAP.length} ($${overdueAP.reduce((s, i) => s + i.amount, 0).toLocaleString()})`, color: '#ef4444', icon: <AlertTriangle size={18} /> },
                        // No bank-balance source exists yet — say so instead of inventing one.
                        { label: 'Bank Balance', value: null, color: 'var(--accent)', icon: <Landmark size={18} /> },
                    ].map(m => (
                        <div key={m.label} className="s-glass-card" style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span style={{ color: m.color }}>{m.icon}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>{m.label}</span>
                            </div>
                            {m.value === null
                                ? <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Not available — connect QuickBooks</div>
                                : <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{m.value}</div>}
                        </div>
                    ))}
                </div>
            )}

            {/* ══════════ RECEIVABLES ══════════ */}
            {tab === 'receivables' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input type="text" placeholder="Search receivables…" value={search} onChange={e => setSearch(e.target.value)}
                                style={{ width: '100%', padding: '6px 8px 6px 28px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Tenant', 'Description', 'Amount', 'Due Date', 'Status'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAR.map(i => (
                                <tr key={i.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}><EntityLink type="tenant" id={i.entityId}>{i.vendorOrTenant}</EntityLink></td>
                                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{i.description}</td>
                                    <td style={{ padding: '8px 12px', color: '#22c55e', fontWeight: 600 }}>${i.amount.toLocaleString()}</td>
                                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{i.dueDate}</td>
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
                            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input type="text" placeholder="Search payables…" value={search} onChange={e => setSearch(e.target.value)}
                                style={{ width: '100%', padding: '6px 8px 6px 28px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['Vendor', 'Description', 'Amount', 'Due Date', 'Status'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAP.map(i => (
                                <tr key={i.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}><EntityLink type="vendor" id={i.entityId}>{i.vendorOrTenant}</EntityLink></td>
                                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{i.description}</td>
                                    <td style={{ padding: '8px 12px', color: '#ef4444', fontWeight: 600 }}>${i.amount.toLocaleString()}</td>
                                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{i.dueDate}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${statusColor(i.status)}15`, color: statusColor(i.status), fontWeight: 600, textTransform: 'uppercase' }}>{i.status}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ══════════ BANK ACCOUNTS — no backend source yet ══════════ */}
            {tab === 'bank-accounts' && !loading && (
                <Unavailable icon={Landmark} title="Bank Accounts" reason="Bank accounts and balances aren't wired to a backend source yet." />
            )}

            {/* ══════════ JOURNAL ENTRIES — the type='journal' rows the New Entry modal writes to /invoices ══════════ */}
            {tab === 'journal-entries' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                        <BookOpen size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Journal Entries
                    </div>
                    {journal.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>No journal entries yet.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['Date', 'Reference', 'Description', 'Amount', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {journal.map(je => (
                                    <tr key={je.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{je.dueDate}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 600 }}>{je.vendorOrTenant || '—'}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{je.description}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{money(je.amount)}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${statusColor(je.status)}15`, color: statusColor(je.status), fontWeight: 600, textTransform: 'uppercase' }}>{je.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ══════════ BANK TRANSFERS — no bank-account source yet ══════════ */}
            {tab === 'bank-transfers' && !loading && (
                <Unavailable icon={ArrowLeftRight} title="Bank Transfers" reason="Transfers need connected bank accounts; none are wired to a backend source yet." />
            )}

            {/* ══════════ GL ACCOUNTS — no chart-of-accounts source yet ══════════ */}
            {tab === 'gl-accounts' && !loading && (
                <Unavailable icon={FileText} title="Chart of Accounts" reason="GL accounts and balances aren't wired to a backend source yet (QuickBooks sync only logs a count)." />
            )}

            {/* ══════════ TENANT LEDGER — derived from the real receivable rows in /invoices ══════════ */}
            {tab === 'tenant-ledger' && !loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {ledgers.length === 0 && (
                        <div className="s-glass-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>No receivables on file yet.</div>
                    )}
                    {ledgers.map(tl => (
                        <div key={tl.key} className="s-glass-card">
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                                    <CreditCard size={13} style={{ verticalAlign: -2, marginRight: 6 }} /><EntityLink type="tenant" id={tl.entityId}>{tl.tenant}</EntityLink>
                                </span>
                                <span style={{
                                    fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                                    background: tl.owed > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                                    color: tl.owed > 0 ? '#ef4444' : '#22c55e',
                                }}>
                                    {tl.owed > 0 ? `Owes ${money(tl.owed)}` : 'Paid in Full'}
                                </span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        {['Date', 'Description', 'Charge', 'Payment', 'Balance'].map(h => (
                                            <th key={h} style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tl.rows.map((e, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>{e.date}</td>
                                            <td style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>{e.description}</td>
                                            <td style={{ padding: '6px 12px', color: e.charge > 0 ? '#ef4444' : '#475569', fontWeight: e.charge > 0 ? 600 : 400 }}>
                                                {e.charge > 0 ? money(e.charge) : '—'}
                                            </td>
                                            <td style={{ padding: '6px 12px', color: e.payment > 0 ? '#22c55e' : '#475569', fontWeight: e.payment > 0 ? 600 : 400 }}>
                                                {e.payment > 0 ? money(e.payment) : '—'}
                                            </td>
                                            <td style={{ padding: '6px 12px', color: e.balance > 0 ? '#f59e0b' : '#22c55e', fontWeight: 700 }}>
                                                {money(e.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}

            {/* ══════════ RECURRING CHARGES (Task 1.5) ══════════ */}
            {tab === 'recurring-charges' && (
                <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#ef4444', fontSize: 12 }}>Recurring Charges tab unavailable.</div>}>
                    <div className="s-glass-card" data-testid="recurring-charges-tab">
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: 'var(--text-primary)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Repeat size={14} />Recurring Charges
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>{recurringCharges.length} row{recurringCharges.length === 1 ? '' : 's'}</span>
                        </div>
                        {recurringLoading ? (
                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>Loading…</div>
                        ) : recurringError ? (
                            <div style={{ padding: 24, textAlign: 'center', color: '#ef4444', fontSize: 12 }}>{recurringError}</div>
                        ) : recurringCharges.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>No recurring charges on file.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        {['Account', 'Amount', 'Payment Method', 'Start', 'End', 'Next', 'Previous', 'Status', 'Notes'].map(h => (
                                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {recurringCharges.map(rc => (
                                        <tr key={rc.id} data-testid={`recurring-charge-row-${rc.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{rc.account}</td>
                                            <td style={{ padding: '8px 12px', color: '#22c55e', fontWeight: 700 }}>${rc.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{rc.paymentMethod ?? '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{rc.startDate ?? '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{rc.endDate ?? '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{rc.nextChargeDate ?? '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{rc.previousChargeDate ?? '—'}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                {rc.previousStatus ? (
                                                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${statusColor(rc.previousStatus.toLowerCase() === 'paid' ? 'paid' : rc.previousStatus.toLowerCase() === 'partial' ? 'pending' : 'overdue')}15`, color: statusColor(rc.previousStatus.toLowerCase() === 'paid' ? 'paid' : rc.previousStatus.toLowerCase() === 'partial' ? 'pending' : 'overdue'), fontWeight: 600 }}>{rc.previousStatus}</span>
                                                ) : '—'}
                                            </td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-tertiary)', fontSize: 11, fontStyle: rc.notes ? 'italic' : 'normal' }}>{rc.notes ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </ErrorBoundary>
            )}

            {/* ══════════ DIAGNOSTICS — derived from the real /invoices rows ══════════ */}
            {tab === 'diagnostics' && !loading && (
                <div className="s-glass-card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                        <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Accounting Diagnostics
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12 }}>
                        {diagnostics.map(d => {
                            const action = d.action;
                            return (
                                <div key={d.id} style={{
                                    padding: '12px 14px', borderRadius: 8,
                                    background: `${diagColor(d.type)}08`,
                                    border: `1px solid ${diagColor(d.type)}20`,
                                    display: 'flex', alignItems: 'center', gap: 10,
                                }}>
                                    {d.type === 'success'
                                        ? <CheckCircle size={16} style={{ color: diagColor(d.type), flexShrink: 0 }} />
                                        : <AlertTriangle size={16} style={{ color: diagColor(d.type), flexShrink: 0 }} />}
                                    <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{d.message}</span>
                                    {action && (
                                        <button onClick={() => setTab(action.tab)} style={{
                                            padding: '4px 10px', borderRadius: 6, border: `1px solid ${diagColor(d.type)}30`,
                                            background: `${diagColor(d.type)}12`, color: diagColor(d.type),
                                            cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                                        }}>{action.label}</button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Module-level Spaces (Trello-style containers) */}
            <div style={{ marginTop: 16 }}>
                <ProfileSpaces entityType="module" entityId="accounting" />
            </div>

            {/* Add Entry Modal */}
            {showAddEntry && (
                <div role="presentation" className="s-modal-overlay" onClick={() => setShowAddEntry(false)}>
                    <div role="presentation" className="s-modal" onClick={e => e.stopPropagation()}>
                        <div className="s-modal-header">
                            <h3>New Journal Entry</h3>
                            <button className="s-btn-icon" onClick={() => setShowAddEntry(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const fd = new FormData(e.currentTarget);
                            try {
                                await strataPost('/invoices', {
                                    type: 'journal',
                                    description: fd.get('description'),
                                    amount: Number(fd.get('debit')) || 0,
                                    status: 'pending',
                                    dueDate: fd.get('date') || new Date().toISOString().slice(0, 10),
                                    vendorOrTenant: fd.get('reference') || '',
                                });
                                setShowAddEntry(false);
                                fetchData();
                            } catch (err) { console.error(err); }
                        }}>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Date</label>
                                    <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="s-input" />
                                </div>
                                <div className="s-form-group">
                                    <label>Reference</label>
                                    <input name="reference" placeholder="JE-2026-XXXX" className="s-input" />
                                </div>
                            </div>
                            <div className="s-form-group">
                                <label>Description</label>
                                <input name="description" required placeholder="e.g. Monthly rent roll" className="s-input" />
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Debit Amount</label>
                                    <input name="debit" type="number" min="0" step="0.01" placeholder="0.00" className="s-input" />
                                </div>
                                <div className="s-form-group">
                                    <label>Credit Amount</label>
                                    <input name="credit" type="number" min="0" step="0.01" placeholder="0.00" className="s-input" />
                                </div>
                            </div>
                            <div className="s-modal-footer">
                                <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowAddEntry(false)}>Cancel</button>
                                <button type="submit" className="s-btn s-btn-primary">Create Entry</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
