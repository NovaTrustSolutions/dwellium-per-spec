/**
 * CivilEngineeringStudio — Frontend for the Civil Engineering Agent
 *
 * Generates site grading, utility layout, structural load, drainage,
 * and foundation plans. All outputs marked DRAFT — requires PE stamp.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    HardHat, Play, History, ZoomIn, ZoomOut, Send, RefreshCw,
    Layers, Droplets, Shield, Building2, ChevronRight,
} from 'lucide-react';
import { strataGet, strataPost, strataPut } from '../strataApi';
import type { Property } from '../strataTypes';
import { sanitizeSvg } from '../../../utils/safeMarkdown';

const ENG_TYPES = [
    { id: 'site_grading', label: 'Site Grading', icon: <Layers size={14} />, desc: 'Contour lines, cut/fill, elevation' },
    { id: 'utility_layout', label: 'Utility Layout', icon: <Droplets size={14} />, desc: 'Water, sewer, gas, electric' },
    { id: 'structural_load', label: 'Structural Load', icon: <Shield size={14} />, desc: 'Dead/live loads, wind, seismic' },
    { id: 'drainage', label: 'Drainage', icon: <Droplets size={14} />, desc: 'Storm water, detention, pipe sizing' },
    { id: 'foundation', label: 'Foundation', icon: <Building2 size={14} />, desc: 'Footings, rebar, soil bearing' },
] as const;

export default function CivilEngineeringStudio() {
    const [prompt, setPrompt] = useState('');
    const [engType, setEngType] = useState('site_grading');
    const [propertyId, setPropertyId] = useState('');
    const [properties, setProperties] = useState<Property[]>([]);
    const [result, setResult] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [showHistory, setShowHistory] = useState(false);

    const loadHistory = useCallback(async () => {
        try {
            const data = await strataGet('/civil/history?limit=15');
            setHistory(Array.isArray(data) ? data : []);
        } catch { setHistory([]); }
    }, []);

    useEffect(() => {
        loadHistory();
        strataGet('/properties').then((d: any) => {
            setProperties(Array.isArray(d) ? d : d?.properties || []);
        }).catch(() => { });
    }, [loadHistory]);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setLoading(true);
        try {
            const data = await strataPost('/civil/generate', {
                prompt: prompt.trim(),
                propertyId: propertyId || undefined,
                engineeringType: engType,
            });
            setResult(data);
            loadHistory();
        } catch (err: any) {
            setResult({ error: err.message || 'Generation failed' });
        }
        setLoading(false);
    };

    const handleSendToReview = async () => {
        if (!result?.id) return;
        try {
            await strataPut(`/civil/${result.id}/status`, { status: 'review' });
            setResult({ ...result, status: 'review' });
        } catch { }
    };

    const calcColor = (status: string) => {
        return { draft: '#f59e0b', review: '#3b82f6', approved: '#10b981', rejected: '#ef4444' }[status] || '#64748b';
    };

    return (
        <div style={{ display: 'flex', height: '100%', background: 'var(--s-bg)', color: 'var(--s-text)' }}>
            {/* ── Left: Controls ── */}
            <div style={{ width: 280, borderRight: '1px solid var(--s-border)', padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <HardHat size={20} color="#f59e0b" />
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Civil Engineering</h3>
                </div>

                {/* Engineering Type */}
                <div style={{ fontSize: 11, color: 'var(--s-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Type</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {ENG_TYPES.map(et => (
                        <button key={et.id} onClick={() => setEngType(et.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                border: engType === et.id ? '1px solid #f59e0b' : '1px solid var(--s-border)',
                                borderRadius: 8, background: engType === et.id ? 'rgba(245,158,11,0.1)' : 'transparent',
                                cursor: 'pointer', color: 'inherit', fontSize: 12, textAlign: 'left',
                            }}>
                            {et.icon}
                            <div>
                                <div style={{ fontWeight: 600 }}>{et.label}</div>
                                <div style={{ fontSize: 10, color: 'var(--s-text-tertiary)' }}>{et.desc}</div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Property */}
                <div style={{ fontSize: 11, color: 'var(--s-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Property</div>
                <select value={propertyId} onChange={e => setPropertyId(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid var(--s-border)', borderRadius: 6, background: 'var(--s-surface)', color: 'inherit', fontSize: 12 }}>
                    <option value="">— None —</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                {/* Prompt */}
                <div style={{ fontSize: 11, color: 'var(--s-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Description</div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    placeholder="e.g., 3-story apartment building on 2-acre sloped lot, clay soil, city water/sewer available…"
                    rows={4} style={{ padding: 8, border: '1px solid var(--s-border)', borderRadius: 8, background: 'var(--s-surface)', color: 'inherit', fontSize: 12, resize: 'vertical' }} />

                <button onClick={handleGenerate} disabled={loading || !prompt.trim()}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', border: 'none',
                        borderRadius: 8, background: loading ? '#4a5568' : '#f59e0b', color: '#000', fontWeight: 700,
                        cursor: loading ? 'wait' : 'pointer', fontSize: 13,
                    }}>
                    {loading ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                    {loading ? 'Generating…' : 'Generate Plan'}
                </button>

                {/* History toggle */}
                <button onClick={() => setShowHistory(!showHistory)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px', border: '1px solid var(--s-border)', borderRadius: 6, background: 'transparent', color: 'var(--s-text-secondary)', cursor: 'pointer', fontSize: 12 }}>
                    <History size={12} /> {showHistory ? 'Hide History' : 'Show History'} ({history.length})
                </button>
            </div>

            {/* ── Right: SVG Viewport + Calculations ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--s-border)' }}>
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} style={{ background: 'transparent', border: '1px solid var(--s-border)', borderRadius: 4, padding: '4px 6px', cursor: 'pointer', color: 'inherit' }}><ZoomIn size={14} /></button>
                    <span style={{ fontSize: 11, color: 'var(--s-text-secondary)' }}>{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} style={{ background: 'transparent', border: '1px solid var(--s-border)', borderRadius: 4, padding: '4px 6px', cursor: 'pointer', color: 'inherit' }}><ZoomOut size={14} /></button>
                    <div style={{ flex: 1 }} />
                    {result?.id && result.status === 'draft' && (
                        <button onClick={handleSendToReview} style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: 'none', borderRadius: 6,
                            background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>
                            <Send size={12} /> Send to PE Review
                        </button>
                    )}
                    {result?.status && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: calcColor(result.status), textTransform: 'uppercase' }}>
                            {result.status}
                        </span>
                    )}
                </div>

                {/* SVG Area */}
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1219', padding: 20 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: '#64748b' }}>
                            <RefreshCw size={32} className="spin" style={{ marginBottom: 12 }} />
                            <div>Generating engineering plan…</div>
                        </div>
                    ) : result?.svgContent ? (
                        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                            dangerouslySetInnerHTML={{ __html: sanitizeSvg(result.svgContent) }} />
                    ) : result?.error ? (
                        <div style={{ color: '#ef4444', padding: 20 }}>Error: {result.error}</div>
                    ) : (
                        <div style={{ textAlign: 'center', color: '#4a5568' }}>
                            <HardHat size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
                            <div style={{ fontSize: 14 }}>Select a plan type and describe the project</div>
                            <div style={{ fontSize: 11, marginTop: 4 }}>AI-generated draft — requires licensed PE review</div>
                        </div>
                    )}
                </div>

                {/* Calculations Panel */}
                {result?.calculations && (
                    <div style={{
                        padding: 12, borderTop: '1px solid var(--s-border)',
                        maxHeight: 180, overflow: 'auto', fontSize: 12, fontFamily: 'monospace',
                        color: 'var(--s-text-secondary)', background: 'var(--s-surface)',
                        whiteSpace: 'pre-wrap', lineHeight: 1.6,
                    }}>
                        {result.calculations}
                    </div>
                )}
            </div>

            {/* ── History Sidebar ── */}
            {showHistory && (
                <div style={{ width: 240, borderLeft: '1px solid var(--s-border)', overflow: 'auto', padding: '10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>History</div>
                    {history.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--s-text-tertiary)' }}>No history yet</div>
                    ) : history.map((h: any) => (
                        <button key={h.id} onClick={() => { setResult(h); setShowHistory(false); }}
                            style={{
                                display: 'block', width: '100%', textAlign: 'left', padding: '8px',
                                border: '1px solid var(--s-border)', borderRadius: 6, marginBottom: 4,
                                background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 11,
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                <ChevronRight size={10} />
                                <span style={{ fontWeight: 600 }}>{h.engineeringType?.replace(/_/g, ' ')}</span>
                                <span style={{ marginLeft: 'auto', fontSize: 9, color: calcColor(h.status), fontWeight: 600 }}>{h.status}</span>
                            </div>
                            <div style={{ color: 'var(--s-text-tertiary)', fontSize: 10, marginLeft: 14 }}>{h.prompt?.slice(0, 60)}</div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
