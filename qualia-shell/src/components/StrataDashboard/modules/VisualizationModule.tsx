/**
 * VisualizationModule — Timeline / Mind Map / Flowchart
 *
 * Renders interactive visualizations of entity relationships, project timelines,
 * and system architecture using canvas-based rendering.
 *
 * Views:
 *   • Timeline  — chronological view of workitems/events
 *   • Mind Map  — entity relationship graph
 *   • Flowchart — status-based workflow diagram
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Network, Clock, GitBranch, RefreshCw, Search, Building2,
    Truck, Users, FolderKanban, Wrench, FileText, Scale,
    ZoomIn, ZoomOut, Maximize2, ChevronDown,
} from 'lucide-react';
import { strataGet } from '../strataApi';
import type { Workitem, Property, EntityProfile } from '../strataTypes';
import { useStrataNav } from '../StrataNavContext';
import { LoadingState, ErrorState } from '../StateView';

type VizMode = 'timeline' | 'mindmap' | 'flowchart';

interface EntityLink {
    id: string; sourceType: string; sourceId: string;
    targetType: string; targetId: string; linkType: string;
    note: string; createdAt: string;
}

const ENTITY_COLORS: Record<string, string> = {
    property: '#D6FE51',
    vendor: '#f59e0b',
    tenant: '#10b981',
    owner: '#3b82f6',
    workitem: '#D6FE51',
    legal: '#ef4444',
};

const ENTITY_ICONS: Record<string, React.ReactNode> = {
    property: <Building2 size={12} />,
    vendor: <Truck size={12} />,
    tenant: <Users size={12} />,
    workitem: <Wrench size={12} />,
    legal: <Scale size={12} />,
    project: <FolderKanban size={12} />,
};

export default function VisualizationModule() {
    const { navigateToProperty } = useStrataNav();
    const [mode, setMode] = useState<VizMode>('timeline');
    const [workitems, setWorkitems] = useState<Workitem[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [entities, setEntities] = useState<EntityProfile[]>([]);
    const [links, setLinks] = useState<EntityLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [timelineZoom, setTimelineZoom] = useState(1);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [wiData, propData, entityData] = await Promise.all([
                strataGet<Workitem[]>('/workitems', { limit: '2000' }),
                strataGet<Property[]>('/properties'),
                strataGet<EntityProfile[]>('/entities'),
            ]);
            setWorkitems(wiData);
            setProperties(propData);
            setEntities(entityData);

            // Try to load links — may 404 if no links yet
            try {
                // Fetch links across properties
                const allLinks: EntityLink[] = [];
                for (const prop of propData.slice(0, 20)) {
                    const propLinks = await strataGet<EntityLink[]>('/links', { entityType: 'property', entityId: prop.id });
                    allLinks.push(...propLinks);
                }
                setLinks(allLinks);
            } catch { setLinks([]); }
        } catch (e) { console.error(e); setError('Failed to load visualization data'); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── TIMELINE VIEW ──
    const timelineItems = useMemo(() => {
        let items = workitems
            .filter(w => {
                if (selectedPropertyId !== 'all' && w.propertyId !== selectedPropertyId) return false;
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                return w.title.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q);
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return items;
    }, [workitems, searchQuery, selectedPropertyId]);

    // Group timeline by month
    const timelineGroups = useMemo(() => {
        const groups = new Map<string, Workitem[]>();
        timelineItems.forEach(wi => {
            const d = new Date(wi.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(wi);
        });
        return Array.from(groups.entries());
    }, [timelineItems]);

    // ── MIND MAP VIEW ──
    const mindMapNodes = useMemo(() => {
        const nodes: { id: string; label: string; type: string; x: number; y: number; connections: string[] }[] = [];
        const propFilter = selectedPropertyId !== 'all' ? properties.filter(p => p.id === selectedPropertyId) : properties.slice(0, 12);

        // Center node
        const centerX = 400, centerY = 300;

        propFilter.forEach((prop, i) => {
            const angle = (i / propFilter.length) * 2 * Math.PI - Math.PI / 2;
            const radius = 200;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            nodes.push({ id: prop.id, label: prop.name, type: 'property', x, y, connections: [] });

            // Add connected workitems
            const propWIs = workitems.filter(w => w.propertyId === prop.id).slice(0, 4);
            propWIs.forEach((wi, j) => {
                const subAngle = angle + ((j - propWIs.length / 2) * 0.3);
                const subRadius = radius + 100;
                const sx = centerX + Math.cos(subAngle) * subRadius;
                const sy = centerY + Math.sin(subAngle) * subRadius;
                nodes.push({ id: wi.id, label: wi.title.slice(0, 25), type: 'workitem', x: sx, y: sy, connections: [prop.id] });
            });

            // Add connected entities
            const propEntities = entities.filter(e => e.propertyIds.includes(prop.id)).slice(0, 3);
            propEntities.forEach((ent, j) => {
                const subAngle = angle - Math.PI / 6 + (j * 0.25);
                const subRadius = radius + 90;
                const sx = centerX + Math.cos(subAngle) * subRadius;
                const sy = centerY + Math.sin(subAngle) * subRadius;
                nodes.push({ id: ent.id, label: ent.name.slice(0, 20), type: ent.entityType, x: sx, y: sy, connections: [prop.id] });
            });
        });

        return nodes;
    }, [properties, workitems, entities, selectedPropertyId]);

    // ── FLOWCHART VIEW ──
    const flowchartData = useMemo(() => {
        const statuses = ['open', 'in_progress', 'review', 'completed', 'cancelled'];
        const statusCounts = new Map<string, number>();
        const domainCounts = new Map<string, Map<string, number>>();

        const filteredWIs = selectedPropertyId !== 'all'
            ? workitems.filter(w => w.propertyId === selectedPropertyId)
            : workitems;

        filteredWIs.forEach(wi => {
            statusCounts.set(wi.status, (statusCounts.get(wi.status) || 0) + 1);
            if (!domainCounts.has(wi.domain)) domainCounts.set(wi.domain, new Map());
            const dc = domainCounts.get(wi.domain)!;
            dc.set(wi.status, (dc.get(wi.status) || 0) + 1);
        });

        return { statuses, statusCounts, domainCounts };
    }, [workitems, selectedPropertyId]);

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'open': return '#3b82f6';
            case 'in_progress': return '#f59e0b';
            case 'review': return '#D6FE51';
            case 'completed': return '#10b981';
            case 'cancelled': return '#ef4444';
            default: return '#64748b';
        }
    };

    return (
        <div className="s-module">
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title">
                        <Network size={22} style={{ verticalAlign: -4, marginRight: 8, color: '#D6FE51' }} />
                        Visualization
                    </h2>
                    <p className="s-module-subtitle">
                        {workitems.length} workitems, {properties.length} properties, {entities.length} entities
                    </p>
                </div>
                <div className="s-module-actions">
                    <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {([
                            ['timeline', Clock, 'Timeline'] as const,
                            ['mindmap', Network, 'Mind Map'] as const,
                            ['flowchart', GitBranch, 'Flowchart'] as const,
                        ]).map(([m, Icon, label]) => (
                            <button
                                key={m}
                                className="s-btn s-btn-ghost"
                                style={{
                                    padding: '5px 10px', borderRadius: 0, margin: 0, gap: 4,
                                    background: mode === m ? 'rgba(214,254,81,0.2)' : 'transparent',
                                    color: mode === m ? '#D6FE51' : '#64748b', fontSize: 11,
                                }}
                                onClick={() => setMode(m)}
                            >
                                <Icon size={13} /> {label}
                            </button>
                        ))}
                    </div>
                    <button className="s-btn s-btn-ghost" onClick={fetchData}><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', background: 'rgba(255,255,255,0.04)',
                    borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', flex: 1, maxWidth: 300,
                }}>
                    <Search size={13} style={{ color: '#64748b' }} />
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search…"
                        style={{ flex: 1, background: 'none', border: 'none', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
                    />
                </div>
                <select
                    value={selectedPropertyId}
                    onChange={e => setSelectedPropertyId(e.target.value)}
                    style={{
                        padding: '6px 10px', borderRadius: 6, fontSize: 11,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#e2e8f0', outline: 'none',
                    }}
                >
                    <option value="all">All Properties</option>
                    {properties.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                {mode === 'timeline' && (
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button className="s-btn s-btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setTimelineZoom(z => Math.max(0.5, z - 0.25))}><ZoomOut size={13} /></button>
                        <span style={{ fontSize: 10, color: '#64748b', alignSelf: 'center', minWidth: 30, textAlign: 'center' }}>{(timelineZoom * 100).toFixed(0)}%</span>
                        <button className="s-btn s-btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setTimelineZoom(z => Math.min(3, z + 0.25))}><ZoomIn size={13} /></button>
                    </div>
                )}
            </div>

            {loading ? (
                <LoadingState message="Loading visualization data…" />
            ) : error ? (
                <ErrorState message={error} onRetry={fetchData} />
            ) : mode === 'timeline' ? (
                /* ═══ TIMELINE ═══ */
                <div style={{ position: 'relative', paddingLeft: 28 }}>
                    {/* Vertical line */}
                    <div style={{
                        position: 'absolute', left: 12, top: 0, bottom: 0, width: 2,
                        background: 'linear-gradient(to bottom, #6366f1, rgba(214,254,81,0.1))',
                        borderRadius: 1,
                    }} />

                    {timelineGroups.length === 0 ? (
                        <div className="s-glass-card" style={{ padding: 40, textAlign: 'center', color: '#475569' }}>
                            <Clock size={40} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 12 }} />
                            <p style={{ margin: 0 }}>No events match your filters</p>
                        </div>
                    ) : timelineGroups.map(([month, items]) => (
                        <div key={month} style={{ marginBottom: 24 }}>
                            {/* Month header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, position: 'relative',
                            }}>
                                <div style={{
                                    position: 'absolute', left: -22, width: 10, height: 10, borderRadius: '50%',
                                    background: '#D6FE51', border: '2px solid #1e1b4b',
                                }} />
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>
                                    {new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                                </span>
                                <span style={{ fontSize: 10, color: '#64748b', padding: '2px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                                    {items.length} events
                                </span>
                            </div>

                            {/* Events */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 * timelineZoom }}>
                                {items.map(wi => (
                                    <div key={wi.id} style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                        padding: `${8 * timelineZoom}px ${12 * timelineZoom}px`,
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.04)',
                                        borderRadius: 8, position: 'relative',
                                        borderLeft: `3px solid ${getStatusColor(wi.status)}`,
                                        transform: `scale(${Math.min(1, 0.85 + timelineZoom * 0.15)})`,
                                        transformOrigin: 'left top',
                                    }}>
                                        <div style={{
                                            position: 'absolute', left: -22, top: 12,
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: getStatusColor(wi.status),
                                        }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                <span style={{ fontWeight: 600, fontSize: 12, color: '#e2e8f0' }}>
                                                    {wi.title}
                                                </span>
                                                <span className={`s-badge ${wi.status}`} style={{ fontSize: '0.5rem' }}>
                                                    {wi.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#475569', flexWrap: 'wrap' }}>
                                                <span>{new Date(wi.createdAt).toLocaleDateString()}</span>
                                                {wi.domain && <span>• {wi.domain}</span>}
                                                {wi.type && <span>• {wi.type}</span>}
                                                {wi.propertyId && (
                                                    <button className="s-property-link" style={{ fontSize: 'inherit', color: '#D6FE51' }} onClick={(e) => { e.stopPropagation(); navigateToProperty(wi.propertyId!); }}>
                                                        🏠 {properties.find(p => p.id === wi.propertyId)?.name || 'Unknown'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : mode === 'mindmap' ? (
                /* ═══ MIND MAP ═══ */
                <div className="s-glass-card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
                    <svg width="100%" height="600" viewBox="0 0 800 600" style={{ background: 'rgba(0,0,0,0.2)' }}>
                        {/* Connection lines */}
                        {mindMapNodes.filter(n => n.connections.length > 0).map(node => (
                            node.connections.map(connId => {
                                const target = mindMapNodes.find(n => n.id === connId);
                                if (!target) return null;
                                return (
                                    <line
                                        key={`${node.id}-${connId}`}
                                        x1={node.x} y1={node.y}
                                        x2={target.x} y2={target.y}
                                        stroke="rgba(214,254,81,0.2)" strokeWidth={1.5}
                                        strokeDasharray="4,4"
                                    />
                                );
                            })
                        ))}

                        {/* Nodes */}
                        {mindMapNodes.map(node => {
                            const color = ENTITY_COLORS[node.type] || '#64748b';
                            const isProperty = node.type === 'property';
                            const r = isProperty ? 40 : 28;

                            return (
                                <g key={node.id}>
                                    <circle
                                        cx={node.x} cy={node.y} r={r}
                                        fill={`${color}15`}
                                        stroke={`${color}50`}
                                        strokeWidth={1.5}
                                    />
                                    <text
                                        x={node.x} y={node.y - 4}
                                        textAnchor="middle"
                                        fill={color}
                                        fontSize={isProperty ? 10 : 8}
                                        fontWeight={isProperty ? 700 : 500}
                                    >
                                        {node.label.length > 18 ? node.label.slice(0, 18) + '…' : node.label}
                                    </text>
                                    <text
                                        x={node.x} y={node.y + 10}
                                        textAnchor="middle"
                                        fill={`${color}80`}
                                        fontSize={7}
                                        style={{ textTransform: 'uppercase' }}
                                    >
                                        {node.type}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                    {mindMapNodes.length === 0 && (
                        <div style={{
                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            textAlign: 'center', color: '#475569',
                        }}>
                            <Network size={40} strokeWidth={1} style={{ opacity: 0.4, marginBottom: 8 }} />
                            <p style={{ margin: 0, fontSize: 13 }}>No entities to visualize</p>
                        </div>
                    )}
                </div>
            ) : (
                /* ═══ FLOWCHART ═══ */
                <div className="s-glass-card">
                    <h3 style={{ margin: '0 0 16px', fontSize: 14, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <GitBranch size={16} style={{ color: '#D6FE51' }} />
                        Workitem Status Flow
                    </h3>

                    {/* Status pipeline */}
                    <div style={{
                        display: 'flex', gap: 2, marginBottom: 24,
                        background: 'rgba(255,255,255,0.02)', borderRadius: 12, overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.04)',
                    }}>
                        {flowchartData.statuses.map((status, i) => {
                            const count = flowchartData.statusCounts.get(status) || 0;
                            const total = workitems.length || 1;
                            const pct = ((count / total) * 100).toFixed(1);

                            return (
                                <div key={status} style={{
                                    flex: Math.max(count, 1),
                                    padding: '16px 12px', textAlign: 'center',
                                    background: `${getStatusColor(status)}08`,
                                    borderRight: i < flowchartData.statuses.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                    position: 'relative',
                                }}>
                                    <div style={{
                                        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                                        background: getStatusColor(status),
                                    }} />
                                    <div style={{ fontSize: 20, fontWeight: 800, color: getStatusColor(status) }}>{count}</div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize', fontWeight: 600, marginTop: 4 }}>
                                        {status.replace('_', ' ')}
                                    </div>
                                    <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>{pct}%</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Flow arrows */}
                    <div style={{
                        display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24,
                        flexWrap: 'wrap',
                    }}>
                        {flowchartData.statuses.map((status, i) => (
                            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                    padding: '6px 14px', borderRadius: 8,
                                    background: `${getStatusColor(status)}15`,
                                    border: `1px solid ${getStatusColor(status)}30`,
                                    color: getStatusColor(status),
                                    fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                                }}>
                                    {status.replace('_', ' ')}
                                </div>
                                {i < flowchartData.statuses.length - 1 && (
                                    <span style={{ color: '#3f4f5f', fontSize: 16 }}>→</span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Domain breakdown */}
                    <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#94a3b8' }}>By Domain</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {Array.from(flowchartData.domainCounts.entries())
                            .sort((a, b) => {
                                const aTotal = Array.from(a[1].values()).reduce((s, v) => s + v, 0);
                                const bTotal = Array.from(b[1].values()).reduce((s, v) => s + v, 0);
                                return bTotal - aTotal;
                            })
                            .map(([domain, counts]) => {
                                const total = Array.from(counts.values()).reduce((s, v) => s + v, 0);
                                return (
                                    <div key={domain} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                        background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <span style={{ fontWeight: 700, fontSize: 12, color: '#e2e8f0', minWidth: 100, textTransform: 'capitalize' }}>
                                            {domain}
                                        </span>
                                        <span style={{ fontSize: 11, color: '#64748b', minWidth: 40 }}>{total}</span>
                                        <div style={{ flex: 1, display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                                            {flowchartData.statuses.map(status => {
                                                const count = counts.get(status) || 0;
                                                if (count === 0) return null;
                                                return (
                                                    <div key={status} style={{
                                                        width: `${(count / total) * 100}%`,
                                                        background: getStatusColor(status),
                                                        transition: 'width 0.3s',
                                                    }} title={`${status}: ${count}`} />
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}
        </div>
    );
}
