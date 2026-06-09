/**
 * InsuranceModule — Manages insurance policies for a property.
 * Optional module registered in MODULE_REGISTRY (Phase 6).
 */

import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, X, Edit2, Trash2, AlertTriangle, CheckCircle, Clock, FileText, Upload, ChevronDown, ChevronUp, Briefcase, BarChart3 } from 'lucide-react';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';
import type { FolioGuardRollup, InsurancePolicy } from '../strataTypes';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';

const POLICY_TYPES = [
    { key: 'liability', label: 'General Liability', color: 'var(--accent)' },
    { key: 'property', label: 'Property', color: '#3b82f6' },
    { key: 'flood', label: 'Flood', color: '#06b6d4' },
    { key: 'umbrella', label: 'Umbrella', color: 'var(--accent)' },
    { key: 'workers_comp', label: "Workers' Comp", color: '#f59e0b' },
    { key: 'auto', label: 'Auto', color: '#22c55e' },
    { key: 'other', label: 'Other', color: 'var(--text-tertiary)' },
] as const;

// Task 2.5 — canonical shape is `InsurancePolicy` in packages/types.
// The module-local alias preserves every existing render path without
// needing a union-narrowing audit; new Task-2.5 code paths reference
// the canonical type directly for FolioGuard state.
type Policy = InsurancePolicy;

interface Props {
    propertyId: string;
}

function getExpiryStatus(expDate: string): { label: string; color: string; icon: typeof CheckCircle } {
    if (!expDate) return { label: 'No expiry', color: 'var(--text-tertiary)', icon: Clock };
    const now = new Date();
    const exp = new Date(expDate);
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: `Expired ${Math.abs(daysLeft)}d ago`, color: '#ef4444', icon: AlertTriangle };
    if (daysLeft <= 30) return { label: `${daysLeft}d left`, color: '#f59e0b', icon: Clock };
    return { label: `${daysLeft}d left`, color: '#22c55e', icon: CheckCircle };
}

const fmtCurrency = (v: number | null) => v != null ? `$${v.toLocaleString()}` : '—';

export default function InsuranceModule({ propertyId }: Props) {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Policy | null>(null);
    const [rollup, setRollup] = useState<any>(null);
    const [policyDocs, setPolicyDocs] = useState<Record<string, any[]>>({});
    const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
    const [linkedWorkitems, setLinkedWorkitems] = useState<any[]>([]);
    // Task 2.5 — FolioGuard rollup for this property. Null when the
    // fixture does not cover the current propertyId (fail-soft).
    const [folioguardRollup, setFolioguardRollup] = useState<FolioGuardRollup | null>(null);

    const fetchPolicies = useCallback(async () => {
        try {
            const data = await strataGet<Policy[]>('/insurance-policies', { property_id: propertyId });
            setPolicies(data);
        } catch (e) { console.error(e); setPolicies([]); }
    }, [propertyId]);

    useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

    // Compliance rollup
    useEffect(() => {
        (async () => {
            try {
                const data = await strataGet<any>(`/compliance/property-rollup/${propertyId}`);
                setRollup(data);
                setLinkedWorkitems(data.linkedWorkitems || []);
            } catch { setRollup(null); }
        })();
    }, [propertyId, policies]);

    // Task 2.5 — FolioGuard rollup fetch (GR-13 observability).
    // Fails soft: missing fixture → setFolioguardRollup(null) and the
    // card does not render. Sentry breadcrumb is best-effort (no-op
    // without DSN).
    useEffect(() => {
        (async () => {
            try {
                const data = await strataGet<FolioGuardRollup | null>('/insurance/folioguard-rollup', { propertyId });
                setFolioguardRollup(data);
                try {
                    Sentry.addBreadcrumb({
                        category: 'ui.load',
                        message: 'insurance.folioguard.loaded',
                        level: 'info',
                        data: {
                            propertyId,
                            totalPolicies: data?.totalPolicies ?? 0,
                            lapsed: data?.lapsed ?? 0,
                        },
                    });
                } catch { /* Sentry no-op when DSN unset */ }
            } catch {
                setFolioguardRollup(null);
            }
        })();
    }, [propertyId]);

    // Fetch docs for expanded policy
    useEffect(() => {
        if (expandedPolicy && !policyDocs[expandedPolicy]) {
            (async () => {
                try {
                    const docs = await strataGet<any[]>(`/insurance-policies/${expandedPolicy}/documents`);
                    setPolicyDocs(prev => ({ ...prev, [expandedPolicy]: docs }));
                } catch { setPolicyDocs(prev => ({ ...prev, [expandedPolicy]: [] })); }
            })();
        }
    }, [expandedPolicy]);

    const handleAddDoc = async (policyId: string, e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            await strataPost(`/insurance-policies/${policyId}/documents`, {
                type: fd.get('docType'), description: fd.get('description'),
            });
            const docs = await strataGet<any[]>(`/insurance-policies/${policyId}/documents`);
            setPolicyDocs(prev => ({ ...prev, [policyId]: docs }));
        } catch (err) { console.error(err); }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload: any = {
            propertyId,
            policyType: fd.get('policyType'),
            policyNumber: fd.get('policyNumber'),
            carrier: fd.get('carrier'),
            agentName: fd.get('agentName'),
            agentPhone: fd.get('agentPhone'),
            premiumAnnual: parseFloat(fd.get('premiumAnnual') as string) || null,
            coverageAmount: parseFloat(fd.get('coverageAmount') as string) || null,
            deductible: parseFloat(fd.get('deductible') as string) || null,
            effectiveDate: fd.get('effectiveDate'),
            expirationDate: fd.get('expirationDate'),
            notes: fd.get('notes'),
        };
        try {
            if (editing) {
                await strataPut(`/insurance-policies/${editing.id}`, payload);
            } else {
                await strataPost('/insurance-policies', payload);
            }
            setShowForm(false);
            setEditing(null);
            fetchPolicies();
        } catch (err) { console.error(err); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this policy?')) return;
        await strataDelete(`/insurance-policies/${id}`);
        fetchPolicies();
    };

    const getTypeInfo = (key: string) => POLICY_TYPES.find(t => t.key === key) || POLICY_TYPES[POLICY_TYPES.length - 1];

    return (
        <div className="s-glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={14} color="#6366f1" /> Insurance Policies
                    {policies.length > 0 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>({policies.length})</span>}
                </h3>
                <button className="s-btn s-btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}
                    onClick={() => { setEditing(null); setShowForm(!showForm); }}>
                    <Plus size={12} /> Add Policy
                </button>
            </div>

            {/* Task 2.5 — FolioGuard Rollup card. Renders above the existing
                Compliance Score Strip when /insurance/folioguard-rollup
                returns data for this property. Fail-soft: null → not rendered.
                ErrorBoundary wraps the whole surface per GR-13. */}
            <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#ef4444', fontSize: 12, marginBottom: 12 }}>FolioGuard unavailable.</div>}>
                {folioguardRollup && (
                    <div
                        data-testid="insurance-folioguard-card"
                        className="s-glass-card"
                        style={{
                            padding: '14px 16px', marginBottom: 12,
                            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                            background: 'color-mix(in srgb, var(--accent) 4%, transparent)',
                        }}
                        onClick={() => { try { Sentry.addBreadcrumb({ category: 'ui.click', message: 'insurance.folioguard.inspect', level: 'info', data: { propertyId: folioguardRollup.propertyId, lapsed: folioguardRollup.lapsed } }); } catch { /* no-op */ } }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Shield size={14} color="#818cf8" />
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                        FolioGuard Enforcement
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 }} data-testid="insurance-folioguard-property">
                                        {folioguardRollup.propertyName}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Policies</div>
                                    <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 700 }} data-testid="insurance-folioguard-total">
                                        {folioguardRollup.totalPolicies}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Lapsed</div>
                                    <div style={{ fontSize: 15, color: folioguardRollup.lapsed > 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }} data-testid="insurance-folioguard-lapsed">
                                        {folioguardRollup.lapsed}
                                    </div>
                                </div>
                                <div
                                    style={{
                                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        background: folioguardRollup.status === 'overdue'
                                            ? 'rgba(239,68,68,0.15)'
                                            : folioguardRollup.status === 'attention'
                                                ? 'rgba(245,158,11,0.15)'
                                                : 'rgba(16,185,129,0.15)',
                                        color: folioguardRollup.status === 'overdue'
                                            ? '#ef4444'
                                            : folioguardRollup.status === 'attention'
                                                ? '#f59e0b'
                                                : '#22c55e',
                                    }}
                                    data-testid="insurance-folioguard-status"
                                >
                                    {folioguardRollup.status === 'on-track' ? 'On Track' : folioguardRollup.status === 'attention' ? 'Attention' : 'Overdue'}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </ErrorBoundary>

            {/* Compliance Score Strip */}
            {rollup && (
                <div style={{
                    display: 'flex', gap: 8, marginBottom: 12, padding: '8px 12px', borderRadius: 8,
                    background: rollup.score >= 80 ? 'rgba(16,185,129,0.06)' : rollup.score >= 50 ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
                    border: `1px solid ${rollup.score >= 80 ? 'rgba(16,185,129,0.15)' : rollup.score >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}`,
                    alignItems: 'center',
                }}>
                    <BarChart3 size={14} style={{ color: rollup.score >= 80 ? '#22c55e' : rollup.score >= 50 ? '#f59e0b' : '#ef4444' }} />
                    <span style={{ fontSize: 18, fontWeight: 800, color: rollup.score >= 80 ? '#22c55e' : rollup.score >= 50 ? '#f59e0b' : '#ef4444' }}>
                        {rollup.score}%
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>Property Compliance</span>
                    <span style={{ fontSize: 10, color: '#22c55e' }}>{rollup.valid}✓</span>
                    <span style={{ fontSize: 10, color: '#f59e0b' }}>{rollup.warning}⚠</span>
                    <span style={{ fontSize: 10, color: '#ef4444' }}>{rollup.expired}✗</span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{rollup.missing}—</span>
                </div>
            )}

            {showForm && (
                <form onSubmit={handleSubmit} style={{
                    padding: 12, borderRadius: 8, marginBottom: 12,
                    background: 'color-mix(in srgb, var(--accent) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)',
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <select name="policyType" defaultValue={editing?.policyType || 'liability'} className="s-input" style={{ fontSize: 11 }}>
                            {POLICY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        <input name="carrier" placeholder="Insurance carrier" defaultValue={editing?.carrier || ''} required className="s-input" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <input name="policyNumber" placeholder="Policy #" defaultValue={editing?.policyNumber || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="agentName" placeholder="Agent name" defaultValue={editing?.agentName || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="agentPhone" placeholder="Agent phone" defaultValue={editing?.agentPhone || ''} className="s-input" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <input name="premiumAnnual" type="number" step="0.01" placeholder="Annual Premium $" defaultValue={editing?.premiumAnnual || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="coverageAmount" type="number" step="0.01" placeholder="Coverage $" defaultValue={editing?.coverageAmount || ''} className="s-input" style={{ fontSize: 11 }} />
                        <input name="deductible" type="number" step="0.01" placeholder="Deductible $" defaultValue={editing?.deductible || ''} className="s-input" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8, marginBottom: 8 }}>
                        <div>
                            <label style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Effective</label>
                            <input name="effectiveDate" type="date" defaultValue={editing?.effectiveDate || ''} className="s-input" style={{ fontSize: 11 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Expiration</label>
                            <input name="expirationDate" type="date" defaultValue={editing?.expirationDate || ''} className="s-input" style={{ fontSize: 11 }} />
                        </div>
                        <input name="notes" placeholder="Notes" defaultValue={editing?.notes || ''} className="s-input" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" className="s-btn s-btn-ghost" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
                        <button type="submit" className="s-btn s-btn-primary">{editing ? 'Update' : 'Add'}</button>
                    </div>
                </form>
            )}

            {policies.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {policies.map(p => {
                        const info = getTypeInfo(p.policyType);
                        const expiry = getExpiryStatus(p.expirationDate);
                        const ExpiryIcon = expiry.icon;
                        return (
                            <div key={p.id} style={{
                                padding: '12px 14px', borderRadius: 10,
                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <Shield size={16} style={{ color: info.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                                        {p.carrier || 'Unknown Carrier'}
                                    </span>
                                    <span style={{
                                        fontSize: 9, padding: '2px 8px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase',
                                        background: `${info.color}15`, border: `1px solid ${info.color}40`, color: info.color,
                                    }}>{info.label}</span>
                                    <span style={{
                                        fontSize: 9, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                                        display: 'flex', alignItems: 'center', gap: 3,
                                        background: `${expiry.color}15`, border: `1px solid ${expiry.color}40`, color: expiry.color,
                                    }}>
                                        <ExpiryIcon size={10} /> {expiry.label}
                                    </span>
                                    <button onClick={() => { setEditing(p); setShowForm(true); }}
                                        style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }} title="Edit">
                                        <Edit2 size={12} />
                                    </button>
                                    <button onClick={() => handleDelete(p.id)}
                                        style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }} title="Delete">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                                    {p.policyNumber && <div>Policy: <strong style={{ color: 'var(--text-secondary)' }}>{p.policyNumber}</strong></div>}
                                    {p.premiumAnnual && <div>Premium: <strong style={{ color: 'var(--text-secondary)' }}>{fmtCurrency(p.premiumAnnual)}/yr</strong></div>}
                                    {p.coverageAmount && <div>Coverage: <strong style={{ color: 'var(--text-secondary)' }}>{fmtCurrency(p.coverageAmount)}</strong></div>}
                                    {p.deductible && <div>Deductible: <strong style={{ color: 'var(--text-secondary)' }}>{fmtCurrency(p.deductible)}</strong></div>}
                                    {p.agentName && <div>Agent: <strong style={{ color: 'var(--text-secondary)' }}>{p.agentName}</strong></div>}
                                    {p.effectiveDate && <div>Effective: <strong style={{ color: 'var(--text-secondary)' }}>{p.effectiveDate}</strong></div>}
                                </div>
                                {p.notes && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontStyle: 'italic' }}>{p.notes}</div>}

                                {/* Expand/Collapse for docs & workitems */}
                                <button onClick={() => setExpandedPolicy(expandedPolicy === p.id ? null : p.id)}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer', marginTop: 8, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {expandedPolicy === p.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                    {expandedPolicy === p.id ? 'Collapse' : 'Documents & Links'}
                                </button>

                                {expandedPolicy === p.id && (
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                        {/* Documents */}
                                        <div style={{ marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <FileText size={11} /> Documents ({(policyDocs[p.id] || []).length})
                                                </span>
                                            </div>
                                            {(policyDocs[p.id] || []).map(doc => (
                                                <div key={doc.id} style={{
                                                    padding: '4px 8px', borderRadius: 4, marginBottom: 3,
                                                    background: 'rgba(255,255,255,0.02)', fontSize: 10, color: 'var(--text-secondary)',
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                }}>
                                                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, fontWeight: 700, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', textTransform: 'uppercase' }}>{doc.type}</span>
                                                    <span style={{ flex: 1 }}>{doc.description}</span>
                                                    <span style={{ color: 'var(--text-tertiary)' }}>{new Date(doc.createdAt).toLocaleDateString()}</span>
                                                </div>
                                            ))}
                                            <form onSubmit={(e) => handleAddDoc(p.id, e)} style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                                <select name="docType" style={{ padding: '3px 6px', borderRadius: 4, fontSize: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
                                                    <option value="declarations">Declarations</option>
                                                    <option value="endorsement">Endorsement</option>
                                                    <option value="certificate">Certificate</option>
                                                    <option value="claim">Claim</option>
                                                    <option value="correspondence">Correspondence</option>
                                                    <option value="other">Other</option>
                                                </select>
                                                <input name="description" placeholder="Description" style={{ flex: 1, padding: '3px 6px', borderRadius: 4, fontSize: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }} />
                                                <button type="submit" style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <Upload size={9} /> Add
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-tertiary)', fontSize: 12 }}>
                    <Shield size={20} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 6 }} />
                    <p style={{ margin: 0 }}>No insurance policies tracked</p>
                </div>
            )}

            {/* Linked Compliance Workitems */}
            {linkedWorkitems.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Briefcase size={11} /> Compliance Work Items ({linkedWorkitems.length})
                    </h4>
                    {linkedWorkitems.map((wi: any) => (
                        <div key={wi.id} style={{
                            padding: '6px 10px', borderRadius: 6, marginBottom: 3,
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                            display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
                        }}>
                            <span style={{ flex: 1, color: 'var(--text-primary)' }}>{wi.title}</span>
                            <span style={{
                                fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                background: wi.status === 'resolved' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                                color: wi.status === 'resolved' ? '#22c55e' : '#f59e0b',
                            }}>{wi.status}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
