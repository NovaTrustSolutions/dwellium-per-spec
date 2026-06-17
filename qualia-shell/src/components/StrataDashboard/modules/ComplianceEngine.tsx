/**
 * ComplianceEngine — Global Visualization & Compliance Hub
 *
 * Andy's "Single Pane of Glass" for the entire organization's compliance health.
 * Five interactive views, each pulling live data from entity profiles.
 *
 * Views:
 *   1. Compliance Heatmap (Grid) — Red/Yellow/Green matrix
 *   2. Entity-Relationship Mind Map — interactive graph
 *   3. Master Expiration Timeline (Gantt) — layered date-sensitive items
 *   4. Risk Dashboard — summary cards + risk clusters
 *   5. Vendor Compliance Matrix — vendor-specific COI/W9/insurance
 *
 * Also: View Presets (save/load named presets to localStorage)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Shield, Clock, Network, BarChart3, Truck, Building2,
    RefreshCw, Search, Plus, X, AlertTriangle, CheckCircle2,
    ZoomIn, ZoomOut, Eye, Save, Trash2, ChevronDown,
    FileText, Users, Calendar, Star, Mail, TrendingUp, Bell,
} from 'lucide-react';
import { strataGet, strataPost, strataPut } from '../strataApi';
import type { Property, EntityProfile, ComplianceRecord, Section8Rollup } from '../strataTypes';
import { useToast } from '../useToast';
import { useStrataNav } from '../StrataNavContext';
import { LoadingState, ErrorState } from '../StateView';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';

// Task 2.3 — `ComplianceRecord` in packages/types is the canonical shape;
// the module-local alias keeps every existing render path untouched while
// the few new Section-8 code paths below reference the canonical type
// directly. Additive-only: no union narrowing propagates to existing
// call sites because we keep the looser shape internally.
interface ComplianceItem {
    id: string; entityType: string; entityId: string;
    itemType: string; label: string; status: string;
    expirationDate: string | null; documentFileId: string | null;
    carrier: string | null; policyNumber: string | null;
    coverageLimits: string | null; notes: string;
    lastAuditedAt: string | null; createdAt: string; updatedAt: string;
    // Optional fields present on Task 2.3 canonical ComplianceRecord rows:
    entityName?: string | null;
    propertyId?: string | null;
    source?: string | null;
}

// EntityProfile imported from strataTypes (canonical)

interface ViewPreset {
    name: string; view: ViewMode; filters: { entityType: string; itemType: string };
}

type ViewMode = 'heatmap' | 'mindmap' | 'timeline' | 'risk' | 'vendor-matrix' | 'predictions';

const ITEM_TYPES = ['insurance', 'coi', 'w9', 'llc_renewal', 'pool_permit', 'business_license', 'tax_filing'] as const;
const ITEM_TYPE_LABELS: Record<string, string> = {
    insurance: 'Insurance', coi: 'COI', w9: 'W-9',
    llc_renewal: 'LLC Renewal', pool_permit: 'Pool Permit',
    business_license: 'Business License', tax_filing: 'Tax Filing',
};

const STATUS_COLORS: Record<string, string> = {
    valid: '#22c55e', warning: '#f59e0b', expired: '#ef4444', missing: '#94a3b8',
};

function computeStatus(item: ComplianceItem): 'valid' | 'warning' | 'expired' | 'missing' {
    if (item.status === 'missing') return 'missing';
    if (item.status === 'expired') return 'expired';
    if (!item.expirationDate) return item.status === 'valid' ? 'valid' : 'missing';
    const now = new Date();
    const exp = new Date(item.expirationDate);
    if (exp < now) return 'expired';
    const daysUntil = (exp.getTime() - now.getTime()) / 86400000;
    if (daysUntil < 30) return 'warning';
    return 'valid';
}

type EnrichedComplianceItem = ComplianceItem & { computedStatus: 'valid' | 'warning' | 'expired' | 'missing' };

export default function ComplianceEngine() {
    const { navigateToProperty } = useStrataNav();
    const { showToast, ToastContainer } = useToast();
    const [view, setView] = useState<ViewMode>('heatmap');
    const [items, setItems] = useState<ComplianceItem[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [vendors, setVendors] = useState<EntityProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [predictions, setPredictions] = useState<any[]>([]);
    const [filterType, setFilterType] = useState('all');
    const [presets, setPresets] = useState<ViewPreset[]>(() => {
        try { return JSON.parse(localStorage.getItem('compliance_presets') || '[]'); } catch { return []; }
    });
    const [showAddItem, setShowAddItem] = useState(false);
    const [selectedCell, setSelectedCell] = useState<{ entityType: string; entityId: string; entityName: string; itemType: string } | null>(null);
    const [timelineZoom, setTimelineZoom] = useState(1);
    const [mindMapHover, setMindMapHover] = useState<{ id: string; x: number; y: number } | null>(null);
    const [centralNode, setCentralNode] = useState<string>('');
    const [portfolioRollup, setPortfolioRollup] = useState<any>(null);
    const [section8Rollup, setSection8Rollup] = useState<Section8Rollup | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [cItems, propData, vendorData] = await Promise.all([
                strataGet<ComplianceItem[]>('/compliance'),
                strataGet<Property[]>('/properties'),
                strataGet<EntityProfile[]>('/entities').then(e => e.filter(x => x.entityType === 'vendor')).catch(() => []),
            ]);
            setItems(cItems);
            setProperties(propData);
            setVendors(vendorData);
        } catch (e) { console.error(e); setError('Failed to load compliance data'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Portfolio rollup
    useEffect(() => {
        (async () => {
            try {
                const data = await strataGet<any>('/compliance/portfolio-rollup');
                setPortfolioRollup(data);
            } catch { setPortfolioRollup(null); }
        })();
    }, [items]);

    // Task 2.3 — Section 8 (AHA) rollup for the vendor-matrix view header.
    // Fails soft: a missing fixture returns null and the card simply
    // does not render. Sentry breadcrumb is best-effort (no-op when
    // DSN is not configured).
    useEffect(() => {
        (async () => {
            try {
                const data = await strataGet<Section8Rollup | null>('/compliance/section8-rollup');
                setSection8Rollup(data);
                try {
                    Sentry.addBreadcrumb({
                        category: 'ui.load',
                        message: 'compliance.section8Rollup.loaded',
                        level: 'info',
                        data: {
                            propertyId: data?.propertyId ?? null,
                            totalScheduled: data?.totalScheduled ?? 0,
                        },
                    });
                } catch { /* Sentry no-op when DSN unset */ }
            } catch {
                setSection8Rollup(null);
            }
        })();
    }, []);

    const sendReminder = async (item: EnrichedComplianceItem) => {
        try {
            await strataPost('/compliance/reminders', {
                complianceItemId: item.id,
                entityType: item.entityType,
                entityId: item.entityId,
                entityName: resolveEntityName(item.entityType, item.entityId),
                itemType: ITEM_TYPE_LABELS[item.itemType] || item.itemType,
            });
            showToast('Reminder queued for approval (B.L.A.S.T. Rule 1)', 'success');
        } catch {
            showToast('Failed to queue reminder', 'error');
        }
    };

    // ── Computed status for each item ──
    const enrichedItems = useMemo(() => items.map(item => ({
        ...item, computedStatus: computeStatus(item),
    })), [items]);

    const filteredItems = useMemo(() => {
        return enrichedItems.filter(item => {
            if (filterType !== 'all' && item.itemType !== filterType) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return item.label.toLowerCase().includes(q) ||
                    (item.carrier || '').toLowerCase().includes(q) ||
                    (item.notes || '').toLowerCase().includes(q);
            }
            return true;
        });
    }, [enrichedItems, filterType, searchQuery]);

    // ── Summary stats ──
    const summary = useMemo(() => {
        const s = { valid: 0, warning: 0, expired: 0, missing: 0, total: enrichedItems.length };
        enrichedItems.forEach(i => { s[i.computedStatus]++; });
        return s;
    }, [enrichedItems]);

    const propMap = useMemo(() => {
        const m = new Map<string, Property>();
        properties.forEach(p => m.set(p.id, p));
        return m;
    }, [properties]);

    const vendorMap = useMemo(() => {
        const m = new Map<string, EntityProfile>();
        vendors.forEach(v => m.set(v.id, v));
        return m;
    }, [vendors]);

    const resolveEntityName = (entityType: string, entityId: string): string => {
        if (entityType === 'property') return propMap.get(entityId)?.name || entityId.slice(0, 8);
        if (entityType === 'vendor') return vendorMap.get(entityId)?.name || entityId.slice(0, 8);
        return entityId.slice(0, 8);
    };

    // ── Preset management ──
    const savePreset = () => {
        const name = prompt('Preset name (e.g., "Andy View", "Lisa View"):');
        if (!name) return;
        const newPresets = [...presets.filter(p => p.name !== name), { name, view, filters: { entityType: 'all', itemType: filterType } }];
        setPresets(newPresets);
        localStorage.setItem('compliance_presets', JSON.stringify(newPresets));
    };

    const loadPreset = (preset: ViewPreset) => {
        setView(preset.view);
        setFilterType(preset.filters.itemType || 'all');
    };

    const deletePreset = (name: string) => {
        const newPresets = presets.filter(p => p.name !== name);
        setPresets(newPresets);
        localStorage.setItem('compliance_presets', JSON.stringify(newPresets));
    };

    // ── Add compliance item ──
    const handleAddItem = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            await strataPost('/compliance', {
                entityType: fd.get('entityType'), entityId: fd.get('entityId'),
                itemType: fd.get('itemType'), label: fd.get('label'),
                status: fd.get('status'), expirationDate: fd.get('expirationDate') || null,
                carrier: fd.get('carrier') || null, policyNumber: fd.get('policyNumber') || null,
                coverageLimits: fd.get('coverageLimits') || null, notes: fd.get('notes') || '',
            });
            setShowAddItem(false);
            fetchData();
        } catch (err) { console.error(err); }
    };

    // ═══ HEATMAP HELPERS ═══
    const heatmapData = useMemo(() => {
        // Build entity rows
        const entityMap = new Map<string, { type: string; id: string; name: string; items: Map<string, string> }>();

        // Add all properties
        properties.forEach(p => entityMap.set(`property:${p.id}`, {
            type: 'property', id: p.id, name: p.name, items: new Map(),
        }));
        // Add all vendors
        vendors.forEach(v => entityMap.set(`vendor:${v.id}`, {
            type: 'vendor', id: v.id, name: v.name, items: new Map(),
        }));

        // Fill in compliance data
        enrichedItems.forEach(item => {
            const key = `${item.entityType}:${item.entityId}`;
            if (!entityMap.has(key)) {
                entityMap.set(key, {
                    type: item.entityType, id: item.entityId,
                    name: resolveEntityName(item.entityType, item.entityId),
                    items: new Map(),
                });
            }
            const entity = entityMap.get(key)!;
            // Keep worst status per type
            const existing = entity.items.get(item.itemType);
            const rank = { expired: 3, missing: 2, warning: 1, valid: 0 };
            const newRank = rank[item.computedStatus as keyof typeof rank] ?? 0;
            const existRank = rank[(existing as keyof typeof rank)] ?? -1;
            if (newRank > existRank) entity.items.set(item.itemType, item.computedStatus);
        });

        return Array.from(entityMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [properties, vendors, enrichedItems]);

    // ═══ TIMELINE DATA ═══
    const timelineData = useMemo(() => {
        return filteredItems
            .filter(i => i.expirationDate)
            .sort((a, b) => new Date(a.expirationDate!).getTime() - new Date(b.expirationDate!).getTime());
    }, [filteredItems]);

    // ═══ MIND MAP NODES ═══
    const mindMapNodes = useMemo(() => {
        const nodes: { id: string; label: string; type: string; x: number; y: number; connections: string[]; status?: string; meta?: string }[] = [];
        const cx = 400, cy = 300;

        // Filter items by selected type
        const relevantItems = filterType !== 'all' ? enrichedItems.filter(i => i.itemType === filterType) : enrichedItems;

        // Group by carrier for insurance/coi, or by entity otherwise
        const carriers = new Map<string, EnrichedComplianceItem[]>();
        relevantItems.forEach(item => {
            const key = item.carrier || `entity:${item.entityType}:${item.entityId}`;
            if (!carriers.has(key)) carriers.set(key, []);
            carriers.get(key)!.push(item);
        });

        const carrierEntries = Array.from(carriers.entries());
        carrierEntries.forEach(([carrier, cItems], i) => {
            const angle = (i / carrierEntries.length) * 2 * Math.PI - Math.PI / 2;
            const r = 200;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            const isCarrier = !carrier.startsWith('entity:');
            nodes.push({
                id: carrier, label: isCarrier ? carrier : resolveEntityName(carrier.split(':')[1], carrier.split(':')[2]),
                type: isCarrier ? 'carrier' : carrier.split(':')[1],
                x, y, connections: [],
                meta: isCarrier ? `${cItems.length} policies` : `${cItems.length} items`,
            });

            // Add connected entities
            cItems.slice(0, 4).forEach((item, j) => {
                const subAngle = angle + ((j - cItems.length / 2) * 0.3);
                const subR = r + 100;
                const sx = cx + Math.cos(subAngle) * subR;
                const sy = cy + Math.sin(subAngle) * subR;
                const entityName = resolveEntityName(item.entityType, item.entityId);
                nodes.push({
                    id: item.id, label: entityName.slice(0, 18),
                    type: item.entityType, x: sx, y: sy,
                    connections: [carrier],
                    status: item.computedStatus,
                    meta: `${ITEM_TYPE_LABELS[item.itemType]} • ${item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : 'No expiry'}`,
                });
            });
        });

        return nodes;
    }, [enrichedItems, filterType]);

    // ═══ VENDOR MATRIX DATA ═══
    const vendorMatrixData = useMemo(() => {
        return vendors.map(v => {
            const vendorItems = enrichedItems.filter(i => i.entityType === 'vendor' && i.entityId === v.id);
            const itemsByType = new Map<string, typeof enrichedItems[0]>();
            vendorItems.forEach(item => {
                const existing = itemsByType.get(item.itemType);
                if (!existing) { itemsByType.set(item.itemType, item); return; }
                const rank = { expired: 3, missing: 2, warning: 1, valid: 0 };
                if ((rank[item.computedStatus as keyof typeof rank] ?? 0) > (rank[existing.computedStatus as keyof typeof rank] ?? 0)) {
                    itemsByType.set(item.itemType, item);
                }
            });
            return { vendor: v, items: itemsByType, totalItems: vendorItems.length };
        }).filter(v => v.totalItems > 0 || vendors.length < 20);
    }, [vendors, enrichedItems]);

    // ═══ RISK CLUSTERS ═══
    const riskClusters = useMemo(() => {
        const clusters: { label: string; count: number; severity: string; items: string[] }[] = [];

        // Group expired by entity
        const expiredByEntity = new Map<string, typeof enrichedItems>();
        enrichedItems.filter(i => i.computedStatus === 'expired' || i.computedStatus === 'warning')
            .forEach(i => {
                const key = resolveEntityName(i.entityType, i.entityId);
                if (!expiredByEntity.has(key)) expiredByEntity.set(key, []);
                expiredByEntity.get(key)!.push(i);
            });

        expiredByEntity.forEach((items, entity) => {
            if (items.length >= 2) {
                clusters.push({
                    label: entity,
                    count: items.length,
                    severity: items.some(i => i.computedStatus === 'expired') ? 'high' : 'medium',
                    items: items.map(i => `${ITEM_TYPE_LABELS[i.itemType]}: ${i.computedStatus}`),
                });
            }
        });

        // Check for month clusters (many expirations in same month)
        const monthCounts = new Map<string, number>();
        enrichedItems.filter(i => i.expirationDate).forEach(i => {
            const m = i.expirationDate!.slice(0, 7);
            monthCounts.set(m, (monthCounts.get(m) || 0) + 1);
        });
        monthCounts.forEach((count, month) => {
            if (count >= 3) {
                clusters.push({
                    label: new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
                    count,
                    severity: count >= 5 ? 'high' : 'medium',
                    items: [`${count} items expiring this month — consider staggering renewals`],
                });
            }
        });

        return clusters.sort((a, b) => b.count - a.count);
    }, [enrichedItems]);

    const getStatusDot = (status: string) => (
        <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: STATUS_COLORS[status] || '#64748b',
        }} />
    );

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">
                        <Shield size={22} style={{ verticalAlign: -4, marginRight: 8, color: '#22c55e' }} />
                        Compliance Engine
                    </h2>
                    <p className="s-module-subtitle">
                        {summary.valid} valid, {summary.warning} warning, {summary.expired} expired, {summary.missing} missing — {summary.total} tracked
                    </p>
                </div>
                <div className="s-module-actions">
                    <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {([
                            ['heatmap', BarChart3, 'Heatmap'] as const,
                            ['mindmap', Network, 'Mind Map'] as const,
                            ['timeline', Calendar, 'Timeline'] as const,
                            ['risk', AlertTriangle, 'Risk'] as const,
                            ['vendor-matrix', Truck, 'Vendors'] as const,
                            ['predictions', TrendingUp, 'Predictions'] as const,
                        ]).map(([m, Icon, label]) => (
                            <button key={m} className="s-btn s-btn-ghost"
                                style={{
                                    padding: '4px 8px', borderRadius: 0, margin: 0, gap: 3,
                                    background: view === m ? 'rgba(16,185,129,0.2)' : 'transparent',
                                    color: view === m ? '#22c55e' : '#64748b', fontSize: 10,
                                    whiteSpace: 'nowrap',
                                }}
                                onClick={() => {
                                    setView(m);
                                    try { Sentry.addBreadcrumb({ category: 'ui.click', message: `compliance.view.${m}`, level: 'info' }); } catch { /* Sentry no-op when DSN unset */ }
                                }}>
                                <Icon size={12} /> {label}
                            </button>
                        ))}
                    </div>
                    <button className="s-btn s-btn-ghost" onClick={fetchData}><RefreshCw size={14} /></button>
                    <button className="s-btn s-btn-primary" onClick={() => setShowAddItem(true)} style={{ fontSize: 11 }}>
                        <Plus size={12} /> Add Item
                    </button>
                </div>
            </div>

            {/* Status summary bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(['valid', 'warning', 'expired', 'missing'] as const).map(s => (
                    <div key={s} style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8, textAlign: 'center',
                        background: `${STATUS_COLORS[s]}08`, border: `1px solid ${STATUS_COLORS[s]}20`,
                    }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: STATUS_COLORS[s] }}>{summary[s]}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>{s}</div>
                    </div>
                ))}
            </div>

            {/* Portfolio Rollup Banner */}
            {portfolioRollup && (
                <div style={{
                    display: 'flex', gap: 12, marginBottom: 14, padding: '10px 16px', borderRadius: 10,
                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, transparent) 0%, rgba(16,185,129,0.06) 100%)',
                    border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', alignItems: 'center', flexWrap: 'wrap',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Shield size={18} style={{ color: portfolioRollup.overallScore >= 80 ? '#22c55e' : portfolioRollup.overallScore >= 50 ? '#f59e0b' : '#ef4444' }} />
                        <span style={{ fontSize: 24, fontWeight: 900, color: portfolioRollup.overallScore >= 80 ? '#22c55e' : portfolioRollup.overallScore >= 50 ? '#f59e0b' : '#ef4444' }}>
                            {portfolioRollup.overallScore}%
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Portfolio Score</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }}>
                        {portfolioRollup.propertyCount} properties • {portfolioRollup.total} items
                    </span>
                    {portfolioRollup.worstPerformers?.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto' }}>
                            <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 700 }}>Needs Attention:</span>
                            {portfolioRollup.worstPerformers.slice(0, 3).map((wp: any) => (
                                <button key={wp.propertyId} className="s-property-link" style={{
                                    fontSize: 9, padding: '1px 6px', borderRadius: 4,
                                    background: wp.score < 50 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                    color: wp.score < 50 ? '#ef4444' : '#f59e0b', fontWeight: 600,
                                    borderBottom: 'none',
                                }} onClick={() => navigateToProperty(wp.propertyId)}>
                                    {wp.propertyName} ({wp.score}%)
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                    background: 'rgba(255,255,255,0.04)', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)', flex: 1, maxWidth: 240,
                }}>
                    <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search…"
                        style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 11, outline: 'none' }} />
                </div>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 6, fontSize: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', outline: 'none' }}>
                    <option value="all">All Types</option>
                    {ITEM_TYPES.map(t => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
                </select>

                {/* Presets */}
                {presets.length > 0 && (
                    <div style={{ display: 'flex', gap: 4 }}>
                        {presets.map(p => (
                            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <button className="s-btn s-btn-ghost" onClick={() => loadPreset(p)}
                                    style={{ fontSize: 10, padding: '3px 8px', gap: 3 }}>
                                    <Star size={10} /> {p.name}
                                </button>
                                <button className="s-btn s-btn-ghost" onClick={() => deletePreset(p.name)}
                                    style={{ padding: '2px 4px', opacity: 0.4 }}><X size={9} /></button>
                            </div>
                        ))}
                    </div>
                )}
                <button className="s-btn s-btn-ghost" onClick={savePreset} style={{ fontSize: 10, padding: '3px 8px' }}>
                    <Save size={10} /> Save View
                </button>
                {view === 'timeline' && (
                    <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
                        <button className="s-btn s-btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setTimelineZoom(z => Math.max(0.5, z - 0.25))}><ZoomOut size={12} /></button>
                        <button className="s-btn s-btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setTimelineZoom(z => Math.min(3, z + 0.25))}><ZoomIn size={12} /></button>
                    </div>
                )}
            </div>

            {loading ? <LoadingState message="Loading compliance data…" /> : error ? <ErrorState message={error} onRetry={fetchData} /> : (
                <>
                    {/* ═══ VIEW 1: HEATMAP ═══ */}
                    {view === 'heatmap' && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-tertiary)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 150 }}>Entity</th>
                                        {ITEM_TYPES.map(t => (
                                            <th key={t} style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10 }}>
                                                {ITEM_TYPE_LABELS[t]}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {heatmapData.length === 0 ? (
                                        <tr><td colSpan={ITEM_TYPES.length + 1} style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>No compliance data. Add items to build heatmap.</td></tr>
                                    ) : heatmapData.map(entity => (
                                        <tr key={`${entity.type}:${entity.id}`}
                                            style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                                <span style={{ marginRight: 6, color: entity.type === 'property' ? '#D6FE51' : '#f59e0b' }}>
                                                    {entity.type === 'property' ? <Building2 size={11} /> : <Truck size={11} />}
                                                </span>
                                                {entity.name}
                                            </td>
                                            {ITEM_TYPES.map(t => {
                                                const status = entity.items.get(t);
                                                return (
                                                    <td key={t} style={{ textAlign: 'center', padding: '6px' }}
                                                        onClick={() => setSelectedCell({ entityType: entity.type, entityId: entity.id, entityName: entity.name, itemType: t })}>
                                                        <div style={{
                                                            width: 28, height: 28, borderRadius: 6, margin: '0 auto',
                                                            background: status ? `${STATUS_COLORS[status]}20` : 'rgba(255,255,255,0.02)',
                                                            border: `1px solid ${status ? `${STATUS_COLORS[status]}30` : 'rgba(255,255,255,0.04)'}`,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: 'pointer', transition: 'all 0.15s',
                                                        }}
                                                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.transform = ''; }}>
                                                            {status && <span style={{
                                                                width: 8, height: 8, borderRadius: '50%',
                                                                background: STATUS_COLORS[status],
                                                            }} />}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Cell drill-down panel */}
                            {selectedCell && (
                                <div className="s-glass-card" style={{ marginTop: 12, padding: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
                                            {selectedCell.entityName} — {ITEM_TYPE_LABELS[selectedCell.itemType]}
                                        </h4>
                                        <button className="s-btn s-btn-ghost" onClick={() => setSelectedCell(null)}><X size={12} /></button>
                                    </div>
                                    {enrichedItems.filter(i => i.entityType === selectedCell.entityType && i.entityId === selectedCell.entityId && i.itemType === selectedCell.itemType).length === 0 ? (
                                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                                            <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 4, color: '#ef4444' }} />
                                            No {ITEM_TYPE_LABELS[selectedCell.itemType]} on file for {selectedCell.entityName}.
                                            <button className="s-btn s-btn-ghost" style={{ marginLeft: 8, fontSize: 10, color: 'var(--accent)' }}
                                                onClick={() => setShowAddItem(true)}>
                                                <Plus size={10} /> Add Now
                                            </button>
                                            <button className="s-btn s-btn-ghost" style={{ marginLeft: 4, fontSize: 10, color: '#f59e0b' }}
                                                onClick={async () => {
                                                    try {
                                                        const email = (selectedCell as any)?.email || '';
                                                        await strataPost('/gmail/send', {
                                                            to: email,
                                                            subject: `Compliance Reminder: Missing ${ITEM_TYPE_LABELS[selectedCell.itemType]}`,
                                                            body: `This is a reminder that ${selectedCell.entityName} is missing ${ITEM_TYPE_LABELS[selectedCell.itemType]}. Please submit the required documentation at your earliest convenience.`,
                                                        });
                                                        showToast(`Reminder queued for ${selectedCell.entityName} — awaiting human approval (B.L.A.S.T. Rule 1)`, 'success');
                                                    } catch {
                                                        showToast('Failed to queue reminder email', 'error');
                                                    }
                                                }}>
                                                <Mail size={10} /> Send Reminder
                                            </button>
                                        </div>
                                    ) : (
                                        enrichedItems.filter(i => i.entityType === selectedCell.entityType && i.entityId === selectedCell.entityId && i.itemType === selectedCell.itemType)
                                            .map(item => (
                                                <div key={item.id} style={{
                                                    padding: '8px 10px', borderRadius: 6, marginBottom: 6,
                                                    background: 'rgba(255,255,255,0.02)',
                                                    border: `1px solid ${STATUS_COLORS[item.computedStatus]}20`,
                                                    borderLeft: `3px solid ${STATUS_COLORS[item.computedStatus]}`,
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                        {getStatusDot(item.computedStatus)}
                                                        <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{item.label}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                        {item.carrier && <span>Carrier: {item.carrier}</span>}
                                                        {item.policyNumber && <span>Policy: {item.policyNumber}</span>}
                                                        {item.expirationDate && <span>Expires: {new Date(item.expirationDate).toLocaleDateString()}</span>}
                                                        {item.coverageLimits && <span>Coverage: {item.coverageLimits}</span>}
                                                        {(item.computedStatus === 'expired' || item.computedStatus === 'warning') && (
                                                            <button onClick={() => sendReminder(item)}
                                                                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, padding: '2px 6px', color: '#f59e0b', fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                                                                <Bell size={9} /> Remind
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ VIEW 2: MIND MAP ═══ */}
                    {view === 'mindmap' && (
                        <div className="s-glass-card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
                            {/* Central node selector */}
                            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
                                <select value={centralNode} onChange={e => setCentralNode(e.target.value)}
                                    style={{ padding: '3px 6px', borderRadius: 4, fontSize: 9, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', outline: 'none' }}>
                                    <option value="">Auto Center</option>
                                    {properties.map(p => <option key={p.id} value={'property:' + p.id}>{p.name}</option>)}
                                    {vendors.map(v => <option key={v.id} value={'vendor:' + v.id}>{v.name}</option>)}
                                </select>
                            </div>
                            <svg width="100%" height="600" viewBox="0 0 800 600" style={{ background: 'rgba(0,0,0,0.15)' }}>
                                {/* Lines */}
                                {mindMapNodes.filter(n => n.connections.length > 0).map(node =>
                                    node.connections.map(connId => {
                                        const target = mindMapNodes.find(n => n.id === connId);
                                        if (!target) return null;
                                        return (
                                            <line key={`${node.id}-${connId}`}
                                                x1={node.x} y1={node.y} x2={target.x} y2={target.y}
                                                stroke={node.status ? `${STATUS_COLORS[node.status]}60` : 'color-mix(in srgb, var(--accent) 15%, transparent)'}
                                                strokeWidth={1.5} strokeDasharray={node.status === 'expired' ? '4,4' : undefined} />
                                        );
                                    })
                                )}
                                {/* Nodes */}
                                {mindMapNodes.map(node => {
                                    const color = node.status ? STATUS_COLORS[node.status] :
                                        node.type === 'carrier' ? '#D6FE51' :
                                            node.type === 'property' ? '#3b82f6' :
                                                node.type === 'vendor' ? '#f59e0b' : '#64748b';
                                    const r = node.connections.length === 0 ? 35 : 24;
                                    return (
                                        <g key={node.id} style={{ cursor: 'pointer' }}
                                            onMouseEnter={() => setMindMapHover({ id: node.id, x: node.x, y: node.y })}
                                            onMouseLeave={() => setMindMapHover(null)}>
                                            <circle cx={node.x} cy={node.y} r={r}
                                                fill={mindMapHover?.id === node.id ? `${color}25` : `${color}12`}
                                                stroke={mindMapHover?.id === node.id ? color : `${color}40`}
                                                strokeWidth={mindMapHover?.id === node.id ? 2.5 : 1.5}
                                                style={{ transition: 'all 0.2s' }} />
                                            <text x={node.x} y={node.y - 3} textAnchor="middle"
                                                fill={color} fontSize={r > 30 ? 9 : 7} fontWeight={r > 30 ? 700 : 500}>
                                                {node.label}
                                            </text>
                                            {node.meta && (
                                                <text x={node.x} y={node.y + 9} textAnchor="middle"
                                                    fill={`${color}80`} fontSize={6}>
                                                    {node.meta}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </svg>

                            {/* Mind map hover tooltip portal — interactive with source links */}
                            {mindMapHover && (() => {
                                const hoveredNode = mindMapNodes.find(n => n.id === mindMapHover.id);
                                if (!hoveredNode) return null;
                                const relatedItem = enrichedItems.find(i => i.id === hoveredNode.id);
                                return (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: Math.min(mindMapHover.x + 20, 650), top: Math.max(mindMapHover.y - 30, 10),
                                            padding: '10px 14px', borderRadius: 8, fontSize: 11, minWidth: 200, maxWidth: 300,
                                            background: 'rgba(15,17,23,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                                            backdropFilter: 'blur(12px)', zIndex: 20, pointerEvents: 'auto',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                        }}
                                        onMouseLeave={() => setMindMapHover(null)}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{hoveredNode.label}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                            {hoveredNode.type === 'carrier' ? 'Insurance Carrier' : hoveredNode.type}
                                        </div>
                                        {relatedItem && (
                                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10 }}>
                                                {relatedItem.carrier && <div style={{ color: 'var(--text-secondary)' }}>Carrier: <strong>{relatedItem.carrier}</strong></div>}
                                                {relatedItem.policyNumber && <div style={{ color: 'var(--text-secondary)' }}>Policy: {relatedItem.policyNumber}</div>}
                                                {relatedItem.coverageLimits && <div style={{ color: 'var(--text-secondary)' }}>Coverage: {relatedItem.coverageLimits}</div>}
                                                {relatedItem.expirationDate && <div style={{ color: 'var(--text-secondary)' }}>Expires: {new Date(relatedItem.expirationDate).toLocaleDateString()}</div>}
                                                <div style={{
                                                    marginTop: 2, padding: '2px 6px', borderRadius: 4, display: 'inline-block',
                                                    background: (STATUS_COLORS[relatedItem.computedStatus] || '#64748b') + '20',
                                                    color: STATUS_COLORS[relatedItem.computedStatus] || '#64748b',
                                                    fontWeight: 600, fontSize: 9, textTransform: 'uppercase',
                                                }}>
                                                    {relatedItem.computedStatus}
                                                </div>
                                                {/* ── Source document link ── */}
                                                {(relatedItem as any).documentId && (
                                                    <a href={`#doc-${(relatedItem as any).documentId}`} onClick={(e) => {
                                                        e.preventDefault();
                                                        window.open(`/api/files/${(relatedItem as any).documentId}`, '_blank');
                                                    }} style={{
                                                        marginTop: 4, color: 'var(--accent)', fontSize: 10, fontWeight: 600,
                                                        textDecoration: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                                                    }}>
                                                        <FileText size={10} aria-hidden /> View Source Document →
                                                    </a>
                                                )}
                                                {/* ── Navigate to entity profile ── */}
                                                <button onClick={() => {
                                                    const entityId = relatedItem.entityId;
                                                    if (entityId) {
                                                        // Navigate to entity profile in Strata
                                                        const event = new CustomEvent('strata:navigate', { detail: { module: 'profiles', entityId } });
                                                        window.dispatchEvent(event);
                                                    }
                                                }} style={{
                                                    marginTop: 2, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                                                    borderRadius: 4, padding: '3px 8px', color: 'var(--accent)', fontSize: 10,
                                                    fontWeight: 600, cursor: 'pointer',
                                                }}>
                                                    View Entity Profile →
                                                </button>
                                            </div>
                                        )}
                                        {hoveredNode.meta && !relatedItem && (
                                            <div style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 10 }}>{hoveredNode.meta}</div>
                                        )}
                                    </div>
                                );
                            })()}

                            {mindMapNodes.length === 0 && (
                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <Network size={40} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 8 }} />
                                    <p style={{ margin: 0, fontSize: 13 }}>Add compliance items to build the relationship map</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ VIEW 3: TIMELINE ═══ */}
                    {view === 'timeline' && (
                        <div style={{ position: 'relative', paddingLeft: 28 }}>
                            <div style={{
                                position: 'absolute', left: 12, top: 0, bottom: 0, width: 2,
                                background: 'linear-gradient(to bottom, #22c55e, rgba(16,185,129,0.1))', borderRadius: 1,
                            }} />

                            {timelineData.length === 0 ? (
                                <div className="s-glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <Calendar size={40} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 12 }} />
                                    <p style={{ margin: 0 }}>No date-sensitive items to display</p>
                                </div>
                            ) : (() => {
                                // Group by month
                                const groups = new Map<string, typeof timelineData>();
                                timelineData.forEach(item => {
                                    const m = item.expirationDate!.slice(0, 7);
                                    if (!groups.has(m)) groups.set(m, []);
                                    groups.get(m)!.push(item);
                                });
                                return Array.from(groups.entries()).map(([month, monthItems]) => (
                                    <div key={month} style={{ marginBottom: 20 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, position: 'relative' }}>
                                            <div style={{
                                                position: 'absolute', left: -22, width: 10, height: 10,
                                                borderRadius: '50%', background: '#22c55e', border: '2px solid #0f172a',
                                            }} />
                                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                                                {new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                                            </span>
                                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.04)' }}>
                                                {monthItems.length} items
                                            </span>
                                            {monthItems.length >= 3 && (
                                                <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                    <AlertTriangle size={9} aria-hidden /> Cluster — consider staggering
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 * timelineZoom }}>
                                            {monthItems.map(item => (
                                                <div key={item.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: `${6 * timelineZoom}px ${10 * timelineZoom}px`,
                                                    background: 'rgba(255,255,255,0.02)',
                                                    border: '1px solid rgba(255,255,255,0.04)',
                                                    borderRadius: 6, borderLeft: `3px solid ${STATUS_COLORS[item.computedStatus]}`,
                                                    position: 'relative',
                                                }}>
                                                    <div style={{ position: 'absolute', left: -22, top: '50%', transform: 'translateY(-50%)', width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[item.computedStatus] }} />
                                                    {getStatusDot(item.computedStatus)}
                                                    <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-primary)', flex: 1 }}>
                                                        {resolveEntityName(item.entityType, item.entityId)}
                                                    </span>
                                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
                                                        {ITEM_TYPE_LABELS[item.itemType]}
                                                    </span>
                                                    <span style={{ fontSize: 10, color: STATUS_COLORS[item.computedStatus], fontWeight: 700 }}>
                                                        {new Date(item.expirationDate!).toLocaleDateString()}
                                                    </span>
                                                    {item.carrier && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{item.carrier}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                    )}

                    {/* ═══ VIEW 4: RISK DASHBOARD ═══ */}
                    {view === 'risk' && (
                        <div>
                            {/* Score cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                                <div className="s-glass-card" style={{ textAlign: 'center', padding: 16 }}>
                                    <div style={{ fontSize: 32, fontWeight: 900, color: summary.total > 0 ? (summary.expired > 0 ? '#ef4444' : summary.warning > 0 ? '#f59e0b' : '#22c55e') : '#64748b' }}>
                                        {summary.total > 0 ? Math.round(((summary.valid) / summary.total) * 100) : 0}%
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Overall Compliance Score</div>
                                </div>
                                <div className="s-glass-card" style={{ textAlign: 'center', padding: 16 }}>
                                    <div style={{ fontSize: 32, fontWeight: 900, color: '#ef4444' }}>{summary.expired + summary.missing}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Action Required</div>
                                </div>
                                <div className="s-glass-card" style={{ textAlign: 'center', padding: 16 }}>
                                    <div style={{ fontSize: 32, fontWeight: 900, color: '#f59e0b' }}>{summary.warning}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Approaching Expiration</div>
                                </div>
                            </div>

                            {/* Type breakdown */}
                            <h3 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)' }}>Compliance by Type</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                                {ITEM_TYPES.map(type => {
                                    const typeItems = enrichedItems.filter(i => i.itemType === type);
                                    if (typeItems.length === 0) return null;
                                    const valid = typeItems.filter(i => i.computedStatus === 'valid').length;
                                    const warn = typeItems.filter(i => i.computedStatus === 'warning').length;
                                    const exp = typeItems.filter(i => i.computedStatus === 'expired').length;
                                    const miss = typeItems.filter(i => i.computedStatus === 'missing').length;
                                    return (
                                        <div key={type} style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                            background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                                            border: '1px solid rgba(255,255,255,0.04)',
                                        }}>
                                            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', minWidth: 110 }}>{ITEM_TYPE_LABELS[type]}</span>
                                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', minWidth: 30 }}>{typeItems.length}</span>
                                            <div style={{ flex: 1, display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                                                {valid > 0 && <div style={{ width: `${(valid / typeItems.length) * 100}%`, background: '#22c55e' }} />}
                                                {warn > 0 && <div style={{ width: `${(warn / typeItems.length) * 100}%`, background: '#f59e0b' }} />}
                                                {exp > 0 && <div style={{ width: `${(exp / typeItems.length) * 100}%`, background: '#ef4444' }} />}
                                                {miss > 0 && <div style={{ width: `${(miss / typeItems.length) * 100}%`, background: '#94a3b8' }} />}
                                            </div>
                                            <div style={{ display: 'flex', gap: 4, fontSize: 9 }}>
                                                <span style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 2 }}><CheckCircle2 size={9} aria-hidden />{valid}</span>
                                                <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={9} aria-hidden />{warn}</span>
                                                <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 2 }}><X size={9} aria-hidden />{exp}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Risk clusters */}
                            {riskClusters.length > 0 && (
                                <>
                                    <h3 style={{ margin: '0 0 10px', fontSize: 13, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <AlertTriangle size={14} /> Risk Clusters
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {riskClusters.map((cluster, i) => (
                                            <div key={i} style={{
                                                padding: '10px 14px', borderRadius: 8,
                                                background: cluster.severity === 'high' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
                                                border: `1px solid ${cluster.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}`,
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>{cluster.label}</span>
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                                        background: cluster.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                        color: cluster.severity === 'high' ? '#ef4444' : '#f59e0b',
                                                    }}>{cluster.count} items</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{cluster.items.join(' • ')}</div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ═══ VIEW 5: VENDOR MATRIX ═══ */}
                    {view === 'vendor-matrix' && (
                      <ErrorBoundary fallback={<div className="s-glass-card" style={{ padding: 14, color: '#ef4444', fontSize: 12 }}>Vendor Matrix unavailable.</div>}>
                        <div data-testid="compliance-vendor-matrix">
                        {/* Task 2.3 — Section 8 (AHA) Rollup card. Renders above the
                            Vendor Matrix table when the /compliance/section8-rollup
                            fixture is present. Null-safe: renders nothing if the
                            fixture is missing (fail-soft per GR-13). */}
                        {section8Rollup && (
                            <div
                                data-testid="compliance-section8-card"
                                className="s-glass-card"
                                style={{
                                    padding: '14px 16px', marginBottom: 12,
                                    border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                    background: 'color-mix(in srgb, var(--accent) 4%, transparent)',
                                }}
                                onClick={() => { try { Sentry.addBreadcrumb({ category: 'ui.click', message: 'compliance.section8Rollup.inspect', level: 'info', data: { propertyId: section8Rollup.propertyId } }); } catch { /* no-op */ } }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <Shield size={14} color="#818cf8" />
                                        <div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                                Section 8 (AHA) Rollup
                                            </div>
                                            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 }} data-testid="compliance-section8-property">
                                                {section8Rollup.propertyId ? (
                                                    <button className="s-property-link" style={{ fontSize: 13, fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); navigateToProperty(section8Rollup.propertyId!); }}>{section8Rollup.propertyName}</button>
                                                ) : section8Rollup.propertyName}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Scheduled</div>
                                            <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 700 }} data-testid="compliance-section8-count">
                                                {section8Rollup.totalScheduled}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Next Inspection</div>
                                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }} data-testid="compliance-section8-next">
                                                {section8Rollup.nextInspectionDate ?? '—'}
                                            </div>
                                        </div>
                                        <div
                                            style={{
                                                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                                background: section8Rollup.status === 'overdue'
                                                    ? 'rgba(239,68,68,0.15)'
                                                    : section8Rollup.status === 'attention'
                                                        ? 'rgba(245,158,11,0.15)'
                                                        : 'rgba(16,185,129,0.15)',
                                                color: section8Rollup.status === 'overdue'
                                                    ? '#ef4444'
                                                    : section8Rollup.status === 'attention'
                                                        ? '#f59e0b'
                                                        : '#22c55e',
                                            }}
                                            data-testid="compliance-section8-status"
                                        >
                                            {section8Rollup.status === 'on-track' ? 'On Track' : section8Rollup.status === 'attention' ? 'Attention' : 'Overdue'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-tertiary)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 140 }}>Vendor</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>COI</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>W-9</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Insurance</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>License</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vendorMatrixData.length === 0 ? (
                                        <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>No vendor compliance data</td></tr>
                                    ) : vendorMatrixData.map(({ vendor, items }) => (
                                        <tr key={vendor.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                                <Truck size={11} style={{ marginRight: 6, color: '#f59e0b', verticalAlign: -1 }} />
                                                {vendor.name}
                                            </td>
                                            {(['coi', 'w9', 'insurance', 'business_license'] as const).map(type => {
                                                const item = items.get(type);
                                                const status = item?.computedStatus || 'missing';
                                                return (
                                                    <td key={type} style={{ textAlign: 'center', padding: '6px' }}>
                                                        <div style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            padding: '3px 8px', borderRadius: 4,
                                                            background: `${STATUS_COLORS[status]}12`,
                                                            color: STATUS_COLORS[status], fontSize: 10, fontWeight: 700,
                                                        }}>
                                                            {getStatusDot(status)}
                                                            {status === 'valid' ? <CheckCircle2 size={10} aria-label="Valid" /> : status === 'warning' ? <AlertTriangle size={10} aria-label="Warning" /> : status === 'expired' ? <X size={10} aria-label="Expired" /> : '—'}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </div>
                      </ErrorBoundary>
                    )}
                </>
            )}

            {/* ═══ ADD ITEM MODAL ═══ */}
            {showAddItem && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                    onClick={() => setShowAddItem(false)}>
                    <form onSubmit={handleAddItem} onClick={e => e.stopPropagation()} style={{
                        background: '#0f172a', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.1)',
                        width: 450, maxHeight: '80vh', overflowY: 'auto',
                    }}>
                        <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}><Shield size={18} style={{ verticalAlign: -3, marginRight: 8 }} /> Add Compliance Item</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <label className="s-label">Entity Type *</label>
                                <select name="entityType" required className="s-input">
                                    <option value="property">Property</option>
                                    <option value="vendor">Vendor</option>
                                    <option value="tenant">Tenant</option>
                                    <option value="owner">Owner</option>
                                </select>
                            </div>
                            <div>
                                <label className="s-label">Entity *</label>
                                <select name="entityId" required className="s-input">
                                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="s-label">Type *</label>
                                <select name="itemType" required className="s-input">
                                    {ITEM_TYPES.map(t => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="s-label">Status</label>
                                <select name="status" className="s-input">
                                    <option value="valid">Valid</option>
                                    <option value="warning">Warning</option>
                                    <option value="expired">Expired</option>
                                    <option value="missing">Missing</option>
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label className="s-label">Label *</label>
                                <input name="label" required className="s-input" placeholder="e.g., Riverwood Club General Liability" />
                            </div>
                            <div>
                                <label className="s-label">Expiration Date</label>
                                <input name="expirationDate" type="date" className="s-input" />
                            </div>
                            <div>
                                <label className="s-label">Carrier / Issuer</label>
                                <input name="carrier" className="s-input" placeholder="e.g., SafeGuard Insurance" />
                            </div>
                            <div>
                                <label className="s-label">Policy / Document #</label>
                                <input name="policyNumber" className="s-input" placeholder="Optional" />
                            </div>
                            <div>
                                <label className="s-label">Coverage Limits</label>
                                <input name="coverageLimits" className="s-input" placeholder="e.g., $1M/$2M" />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label className="s-label">Notes</label>
                                <textarea name="notes" className="s-input" rows={2} style={{ resize: 'vertical' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                            <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowAddItem(false)}>Cancel</button>
                            <button type="submit" className="s-btn s-btn-primary">Add Item</button>
                        </div>
                    </form>
                </div>
            )}

            {/* ═══ PREDICTIONS VIEW ═══ */}
            {view === 'predictions' && (
                <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <TrendingUp size={14} /> Predictive Flagging — Upcoming Expirations
                        </h3>
                        <button className="s-btn s-btn-ghost" style={{ fontSize: 10, gap: 4 }}
                            onClick={async () => {
                                try {
                                    const res = await strataGet<any>('/predictive-flags');
                                    setPredictions(res.data || res || []);
                                } catch { setPredictions([]); }
                            }}>
                            <RefreshCw size={10} /> Scan (120 days)
                        </button>
                    </div>
                    {predictions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
                            <TrendingUp size={32} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <p style={{ margin: 0, fontSize: 13 }}>No predictions loaded yet.</p>
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#334155' }}>Click "Scan" to analyze upcoming expirations.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                            {predictions.map((flag: any) => {
                                const sevColor = flag.severity === 'high' ? '#ef4444' : flag.severity === 'medium' ? '#f59e0b' : '#22c55e';
                                return (
                                    <div key={flag.month} style={{
                                        borderRadius: 10, overflow: 'hidden',
                                        background: 'rgba(255,255,255,0.02)', border: `1px solid ${sevColor}33`,
                                    }}>
                                        <div style={{
                                            padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            background: `${sevColor}15`, borderBottom: `1px solid ${sevColor}22`,
                                        }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: sevColor }}>
                                                {flag.monthLabel}
                                            </span>
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                                background: `${sevColor}22`, color: sevColor,
                                            }}>
                                                {flag.itemCount} item{flag.itemCount !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div style={{ padding: '10px 14px' }}>
                                            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>
                                                {flag.recommendation}
                                            </p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                {(flag.items || []).slice(0, 5).map((item: any, i: number) => (
                                                    <div key={i} style={{
                                                        fontSize: 10, padding: '4px 8px', borderRadius: 4,
                                                        background: 'rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between',
                                                    }}>
                                                        <span style={{ color: 'var(--text-secondary)' }}>{item.entityName}</span>
                                                        <span style={{ color: 'var(--text-tertiary)' }}>{item.type} · {item.expirationDate}</span>
                                                    </div>
                                                ))}
                                                {(flag.items || []).length > 5 && (
                                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: '2px 8px' }}>
                                                        + {flag.items.length - 5} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            <ToastContainer />
        </div>
    );
}
