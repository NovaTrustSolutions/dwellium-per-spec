/**
 * DesignStudio — AI-powered architectural design and floor plan generation.
 *
 * Provides prompt input, property selector, SVG rendering area,
 * "Send to Review" workflow, and generation history.
 *
 * Per GEMINI.md Rule 1: All outputs are marked DRAFT and must be
 * reviewed by a licensed professional before use.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Pencil, ZoomIn, ZoomOut, Send, Clock, CheckCircle2,
    AlertTriangle, RefreshCw, Building2, Layers,
} from 'lucide-react';
import { strataGet, strataPost, strataPut } from '../strataApi';

interface DesignHistoryItem {
    id: string;
    propertyId: string | null;
    prompt: string;
    designType: string;
    svgContent: string;
    description: string;
    status: string;
    createdAt: string;
}

interface Property {
    id: string;
    name: string;
}

type DesignType = 'floor_plan' | 'site_plan' | 'elevation' | 'renovation';

const DESIGN_TYPES: { id: DesignType; label: string; icon: string }[] = [
    { id: 'floor_plan', label: 'Floor Plan', icon: '🏠' },
    { id: 'site_plan', label: 'Site Plan', icon: '🗺️' },
    { id: 'elevation', label: 'Elevation', icon: '🏢' },
    { id: 'renovation', label: 'Renovation', icon: '🔨' },
];

export default function DesignStudio() {
    const [prompt, setPrompt] = useState('');
    const [designType, setDesignType] = useState<DesignType>('floor_plan');
    const [propertyId, setPropertyId] = useState('');
    const [properties, setProperties] = useState<Property[]>([]);
    const [generating, setGenerating] = useState(false);
    const [currentDesign, setCurrentDesign] = useState<DesignHistoryItem | null>(null);
    const [history, setHistory] = useState<DesignHistoryItem[]>([]);
    const [zoom, setZoom] = useState(1);
    const [showHistory, setShowHistory] = useState(false);

    // Fetch properties and design history on mount
    useEffect(() => {
        strataGet<Property[]>('/properties').then(setProperties).catch(() => { });
        fetchHistory();
    }, []);

    const fetchHistory = useCallback(async () => {
        try {
            const data = await strataGet<DesignHistoryItem[]>('/design/history');
            setHistory(Array.isArray(data) ? data : []);
        } catch { setHistory([]); }
    }, []);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setGenerating(true);
        try {
            const result = await strataPost<DesignHistoryItem>('/design/generate', {
                prompt: prompt.trim(),
                propertyId: propertyId || undefined,
                designType,
            });
            setCurrentDesign(result);
            fetchHistory();
        } catch (err) {
            console.error('Design generation failed:', err);
        }
        setGenerating(false);
    };

    const handleSendToReview = async (id: string) => {
        try {
            await strataPut(`/design/${id}/status`, { status: 'pending_review' });
            fetchHistory();
            if (currentDesign?.id === id) {
                setCurrentDesign(prev => prev ? { ...prev, status: 'pending_review' } : null);
            }
        } catch (err) { console.error(err); }
    };

    const statusColor = (s: string) =>
        s === 'approved' ? '#10b981' : s === 'pending_review' ? '#f59e0b' : '#64748b';
    const statusLabel = (s: string) =>
        s === 'approved' ? 'Approved' : s === 'pending_review' ? 'In Review' : 'Draft';

    return (
        <div className="s-module">
            {/* Header */}
            <div className="s-module-header">
                <div>
                    <h2 className="s-module-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Pencil size={18} /> Design Studio
                    </h2>
                    <p className="s-module-subtitle">AI-powered architectural design &amp; floor plan generation</p>
                </div>
                <div className="s-module-actions" style={{ gap: 6 }}>
                    <button className="s-btn s-btn-ghost" onClick={() => setShowHistory(!showHistory)}
                        style={{ fontSize: 10, gap: 4, color: showHistory ? '#6366f1' : undefined }}>
                        <Clock size={12} /> History ({history.length})
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 12, padding: 16 }}>
                {/* ── Left: Input Panel ── */}
                <div style={{ width: showHistory ? '35%' : '40%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Design Type */}
                    <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' }}>
                            Design Type
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {DESIGN_TYPES.map(dt => (
                                <button key={dt.id}
                                    onClick={() => setDesignType(dt.id)}
                                    style={{
                                        padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                                        background: designType === dt.id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${designType === dt.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                        color: designType === dt.id ? '#a5b4fc' : '#94a3b8',
                                        fontSize: 11, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                                    }}>
                                    <span>{dt.icon}</span> {dt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Property selector */}
                    <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' }}>
                            Property (optional)
                        </label>
                        <select value={propertyId} onChange={e => setPropertyId(e.target.value)}
                            style={{
                                width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12,
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                color: '#e2e8f0', outline: 'none', fontFamily: 'inherit',
                            }}>
                            <option value="">— No specific property —</option>
                            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* Prompt */}
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' }}>
                            Design Prompt
                        </label>
                        <textarea
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="Describe the design you want, e.g., 'Two-bedroom apartment with open kitchen, 900 sq ft, L-shaped living room…'"
                            style={{
                                width: '100%', minHeight: 120, padding: '10px 12px', borderRadius: 8, fontSize: 12,
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                color: '#e2e8f0', outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
                            }}
                        />
                    </div>

                    {/* Generate button */}
                    <button
                        onClick={handleGenerate}
                        disabled={generating || !prompt.trim()}
                        className="s-btn s-btn-primary"
                        style={{ width: '100%', padding: '12px', fontSize: 13, gap: 6 }}
                    >
                        {generating ? (
                            <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                        ) : (
                            <><Pencil size={14} /> Generate Design</>
                        )}
                    </button>

                    {/* Warning */}
                    <div style={{
                        padding: '8px 10px', borderRadius: 6,
                        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#fbbf24',
                    }}>
                        <AlertTriangle size={12} />
                        <span>All designs require professional architect review before use.</span>
                    </div>
                </div>

                {/* ── Center: SVG Render Area ── */}
                <div style={{
                    flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                }}>
                    {/* Toolbar */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(255,255,255,0.02)',
                    }}>
                        <span style={{ fontSize: 10, color: '#64748b' }}>
                            {currentDesign ? currentDesign.description : 'No design generated yet'}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button className="s-btn s-btn-ghost" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ padding: '3px 6px' }}>
                                <ZoomOut size={12} />
                            </button>
                            <span style={{ fontSize: 10, color: '#64748b', padding: '3px 4px' }}>{Math.round(zoom * 100)}%</span>
                            <button className="s-btn s-btn-ghost" onClick={() => setZoom(z => Math.min(3, z + 0.1))} style={{ padding: '3px 6px' }}>
                                <ZoomIn size={12} />
                            </button>
                            {currentDesign && currentDesign.status === 'draft' && (
                                <button className="s-btn s-btn-ghost" onClick={() => handleSendToReview(currentDesign.id)}
                                    style={{ padding: '3px 8px', fontSize: 10, gap: 3, color: '#f59e0b' }}>
                                    <Send size={10} /> Send to Review
                                </button>
                            )}
                        </div>
                    </div>

                    {/* SVG viewport */}
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'auto', padding: 20, minHeight: 400,
                    }}>
                        {currentDesign ? (
                            <div
                                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.15s' }}
                                dangerouslySetInnerHTML={{ __html: currentDesign.svgContent }}
                            />
                        ) : (
                            <div style={{ textAlign: 'center', color: '#475569' }}>
                                <Layers size={48} strokeWidth={1} style={{ opacity: 0.2, marginBottom: 12 }} />
                                <p style={{ margin: 0, fontSize: 13 }}>Enter a design prompt and click "Generate"</p>
                                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#334155' }}>
                                    AI will generate an SVG floor plan or site layout
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: History Panel ── */}
                {showHistory && (
                    <div style={{ width: '25%', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '70vh', overflowY: 'auto' }}>
                        <h4 style={{ fontSize: 11, color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Recent Designs
                        </h4>
                        {history.length === 0 ? (
                            <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>No designs yet</p>
                        ) : (
                            history.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => { setCurrentDesign(item); setZoom(1); }}
                                    style={{
                                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                                        background: currentDesign?.id === item.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${currentDesign?.id === item.id ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                        fontFamily: 'inherit', color: '#e2e8f0',
                                    }}
                                >
                                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, lineHeight: 1.3 }}>
                                        {item.prompt.length > 50 ? item.prompt.slice(0, 50) + '…' : item.prompt}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}>
                                        <span style={{ color: statusColor(item.status), fontWeight: 600 }}>
                                            {statusLabel(item.status)}
                                        </span>
                                        <span style={{ color: '#475569' }}>·</span>
                                        <span style={{ color: '#475569' }}>{item.designType.replace('_', ' ')}</span>
                                        <span style={{ color: '#475569' }}>·</span>
                                        <span style={{ color: '#475569' }}>{new Date(item.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
