import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Code, Sparkles, X, Bot, Check, TriangleAlert, Clock, Settings, Hourglass, Trash2, Plus, RefreshCw } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import './HydraAI.css';
import { API_BASE } from '../../config';
import { sanitizeHtml } from '../../utils/safeMarkdown';

const API_HYDRA = `${API_BASE}/api/hydra`;

/* ── Types ── */

interface HydraHead {
    id: string;
    name: string;
    provider: string;
    model: string;
    icon: string;
    color: string;
    colorRgb: string;
    enabled: boolean;
    endpoint?: string;
    apiKeyEnv?: string;
    description: string;
    maxTokens?: number;
    temperature?: number;
}

interface HydraResponse {
    headId: string;
    headName: string;
    content: string;
    status: 'success' | 'error' | 'timeout';
    latencyMs: number;
    tokensUsed?: number;
    error?: string;
}

interface HydraSynthesis {
    agreements: string[];
    disagreements: string[];
    bestAnswer: string;
    synthesisModel: string;
}

interface HydraQueryResult {
    id: string;
    prompt: string;
    timestamp: string;
    responses: HydraResponse[];
    synthesis?: HydraSynthesis;
}

type LayoutMode = 'columns' | 'rows';

/* ── Default head form values for the "add new" flow ── */

const BLANK_HEAD: Omit<HydraHead, 'id'> = {
    name: '',
    provider: 'openai',
    model: '',
    icon: '',
    color: 'var(--accent)',
    colorRgb: '99, 102, 241',
    enabled: true,
    endpoint: '',
    apiKeyEnv: '',
    description: '',
    maxTokens: 1500,
    temperature: 0.3,
};

/* ── Helpers: hex→rgb ── */

function hexToRgb(hex: string): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) || 99;
    const g = parseInt(h.substring(2, 4), 16) || 102;
    const b = parseInt(h.substring(4, 6), 16) || 241;
    return `${r}, ${g}, ${b}`;
}

/* ── Markdown-ish renderer (mirrors ARA) ── */

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdown(text: string, panelColor: string) {
    const lines = text.split('\n');
    return lines.map((line, i) => {
        let processed = escapeHtml(line);
        processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        processed = processed.replace(/_([^_]+)_/g, '<em>$1</em>');
        processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
        if (processed.match(/^[-•]\s/)) {
            processed = `<span class="hydra-bullet" style="color:${panelColor}">•</span>${processed.slice(2)}`;
        }
        if (processed.match(/^\d+\.\s/)) {
            const num = processed.match(/^(\d+)\./)?.[1];
            processed = `<span class="hydra-num" style="color:${panelColor}">${num}.</span>${processed.replace(/^\d+\.\s/, '')}`;
        }
        if (processed.startsWith('### ')) {
            return <h5 key={i} dangerouslySetInnerHTML={{ __html: sanitizeHtml(processed.slice(4)) }} />;
        }
        if (processed.startsWith('## ')) {
            return <h4 key={i} dangerouslySetInnerHTML={{ __html: sanitizeHtml(processed.slice(3)) }} />;
        }
        if (processed === '') return <br key={i} />;
        return <p key={i} dangerouslySetInnerHTML={{ __html: sanitizeHtml(processed) }} />;
    });
}

/* ── Icon palette for quick picking ──
   NOTE: HydraHead.icon is a plain string persisted + sent to the backend, so it
   can't hold a Lucide component. The original emoji palette was stripped; the
   per-head icon now falls back to a Lucide <Bot/> at every render site. Empty
   here so the picker grid shows nothing rather than blank buttons. */
const EMOJI_PALETTE: string[] = [];

/* ── Component ── */

export default function HydraAI() {
    const { authFetch } = useUser();
    const [heads, setHeads] = useState<HydraHead[]>([]);
    const [selectedHeads, setSelectedHeads] = useState<string[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [queries, setQueries] = useState<HydraQueryResult[]>([]);
    const [layout, setLayout] = useState<LayoutMode>('columns');
    const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
    const [synthesize, setSynthesize] = useState(true);
    const [synthOpen, setSynthOpen] = useState<Record<string, boolean>>({});
    const [activeResponses, setActiveResponses] = useState<Map<string, 'loading' | HydraResponse>>(new Map());

    // ── Regrow Modal state ──
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'edit' | 'add'>('edit');
    const [editingHeadId, setEditingHeadId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Omit<HydraHead, 'id'> & { id?: string }>(BLANK_HEAD);
    const [modalError, setModalError] = useState('');
    const [modalSaving, setModalSaving] = useState(false);
    const [backendUnavailable, setBackendUnavailable] = useState(false);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const sessionId = useRef(`hydra-${Date.now()}`);

    // ── Fetch available heads on mount ──
    const fetchHeads = useCallback(async () => {
        try {
            const r = await authFetch(`${API_BASE}/heads`);
            // 404 / non-JSON means backend A doesn't have an /api/hydra mount.
            // Surface that to the empty state so the widget isn't a silent blank.
            if (r.status === 404) {
                setBackendUnavailable(true);
                return;
            }
            const ct = r.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
                setBackendUnavailable(true);
                return;
            }
            const data = await r.json();
            if (data.success) {
                setBackendUnavailable(false);
                setHeads(data.data);
                // If no heads selected yet, auto-select first 2 enabled
                setSelectedHeads(prev => {
                    if (prev.length > 0) return prev;
                    const enabled = data.data.filter((h: HydraHead) => h.enabled);
                    return enabled.length >= 2 ? [enabled[0].id, enabled[1].id] : prev;
                });
            }
        } catch (err) {
            console.error('Failed to fetch heads:', err);
            setBackendUnavailable(true);
        }
    }, [authFetch]);

    useEffect(() => { fetchHeads(); }, [fetchHeads]);

    // Auto-scroll on new queries
    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }, [queries]);

    // Focus input on mount
    useEffect(() => { inputRef.current?.focus(); }, []);

    // Close layout menu on outside click
    useEffect(() => {
        if (!layoutMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('.hydra-layout-dropdown')) setLayoutMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [layoutMenuOpen]);

    // ── Head helpers ──
    const toggleHead = useCallback((headId: string) => {
        setSelectedHeads(prev => {
            if (prev.includes(headId)) {
                if (prev.length <= 2) return prev;
                return prev.filter(id => id !== headId);
            }
            if (prev.length >= 5) return prev;
            return [...prev, headId];
        });
    }, []);

    const getHead = useCallback((headId: string): HydraHead | undefined => {
        return heads.find(h => h.id === headId);
    }, [heads]);

    const gridClass = useMemo(() => {
        if (layout === 'rows') return 'layout-rows';
        return `layout-columns-${selectedHeads.length}`;
    }, [layout, selectedHeads.length]);

    // ── Send query ──
    const sendQuery = useCallback(async () => {
        const text = input.trim();
        if (!text || isLoading || selectedHeads.length < 2) return;

        setInput('');
        setIsLoading(true);

        const loadingMap = new Map<string, 'loading' | HydraResponse>();
        selectedHeads.forEach(id => loadingMap.set(id, 'loading'));
        setActiveResponses(loadingMap);

        try {
            const res = await authFetch(`${API_BASE}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: text,
                    headIds: selectedHeads,
                    synthesize,
                    sessionId: sessionId.current,
                }),
            });
            const data = await res.json();

            if (data.success) {
                const result: HydraQueryResult = data.data;
                const responseMap = new Map<string, 'loading' | HydraResponse>();
                result.responses.forEach(r => responseMap.set(r.headId, r));
                setActiveResponses(responseMap);
                setQueries(prev => [...prev, result]);
                if (result.synthesis) setSynthOpen(prev => ({ ...prev, [result.id]: true }));
            } else {
                const errorMap = new Map<string, 'loading' | HydraResponse>();
                selectedHeads.forEach(id => errorMap.set(id, {
                    headId: id, headName: getHead(id)?.name || id,
                    content: '', status: 'error', latencyMs: 0,
                    error: data.error || 'Query failed',
                }));
                setActiveResponses(errorMap);
            }
        } catch {
            const errorMap = new Map<string, 'loading' | HydraResponse>();
            selectedHeads.forEach(id => errorMap.set(id, {
                headId: id, headName: getHead(id)?.name || id,
                content: '', status: 'error', latencyMs: 0,
                error: 'Backend unreachable. Is the server running on port 3000?',
            }));
            setActiveResponses(errorMap);
        }

        setIsLoading(false);
    }, [input, isLoading, selectedHeads, synthesize, authFetch, getHead]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuery(); }
    };

    const clearSession = () => {
        setQueries([]);
        setActiveResponses(new Map());
        authFetch(`${API_BASE}/session/${sessionId.current}`, { method: 'DELETE' }).catch(() => { });
        sessionId.current = `hydra-${Date.now()}`;
    };

    // ── Regrow Modal handlers ──

    const openRegrowModal = (head: HydraHead) => {
        setModalMode('edit');
        setEditingHeadId(head.id);
        setFormData({
            name: head.name,
            provider: head.provider,
            model: head.model,
            icon: head.icon,
            color: head.color,
            colorRgb: head.colorRgb,
            enabled: head.enabled,
            endpoint: head.endpoint || '',
            apiKeyEnv: head.apiKeyEnv || '',
            description: head.description,
            maxTokens: head.maxTokens ?? 1500,
            temperature: head.temperature ?? 0.3,
        });
        setModalError('');
        setModalOpen(true);
    };

    const openAddModal = () => {
        setModalMode('add');
        setEditingHeadId(null);
        setFormData({ ...BLANK_HEAD });
        setModalError('');
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingHeadId(null);
        setModalError('');
    };

    const handleFormChange = (field: string, value: string | number | boolean) => {
        setFormData(prev => {
            const updated = { ...prev, [field]: value };
            // Auto-sync colorRgb when color changes
            if (field === 'color' && typeof value === 'string') {
                updated.colorRgb = hexToRgb(value);
            }
            return updated;
        });
    };

    const saveHead = async () => {
        if (!formData.name.trim()) { setModalError('Name is required'); return; }
        if (!formData.model.trim()) { setModalError('Model name is required'); return; }
        if ((formData.provider === 'lmstudio' || formData.provider === 'custom') && !formData.endpoint?.trim()) {
            setModalError('Endpoint URL is required for this provider'); return;
        }

        setModalSaving(true);
        setModalError('');

        try {
            if (modalMode === 'edit' && editingHeadId) {
                const res = await authFetch(`${API_BASE}/heads/${editingHeadId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Update failed');
            } else {
                const res = await authFetch(`${API_BASE}/heads`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Add failed');
            }

            await fetchHeads();
            closeModal();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setModalSaving(false);
        }
    };

    const deleteHead = async () => {
        if (!editingHeadId) return;
        setModalSaving(true);
        try {
            const res = await authFetch(`${API_BASE}/heads/${editingHeadId}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Delete failed');
            // Remove from selection if needed
            setSelectedHeads(prev => prev.filter(id => id !== editingHeadId));
            await fetchHeads();
            closeModal();
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setModalSaving(false);
        }
    };

    const resetAllHeads = async () => {
        try {
            const res = await authFetch(`${API_BASE}/heads/reset`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setSelectedHeads([]);
                await fetchHeads();
            }
        } catch (err) {
            console.error('Reset failed:', err);
        }
    };

    // ── Render a single response panel ──
    const renderPanel = (headId: string, resp: 'loading' | HydraResponse | undefined, head: HydraHead | undefined) => {
        const color = head?.color || '#D6FE51';
        const colorRgb = head?.colorRgb || '99,102,241';

        return (
            <div
                key={headId}
                className="hydra-panel"
                style={{
                    '--panel-color': color,
                    '--panel-color-rgb': colorRgb,
                    borderTopColor: color,
                    borderTopWidth: '2px',
                } as React.CSSProperties}
            >
                <div className="hydra-panel-header">
                    <span className="hydra-panel-icon">{head?.icon || <Bot size={16} aria-hidden />}</span>
                    <span className="hydra-panel-name" style={{ color }}>{head?.name || headId}</span>
                    {resp && resp !== 'loading' && (
                        <div className="hydra-panel-badges">
                            <span className={`hydra-badge ${resp.status}`}>
                                {resp.status === 'success' ? <Check size={12} aria-hidden /> : resp.status === 'error' ? <TriangleAlert size={12} aria-hidden /> : <Clock size={12} aria-hidden />}
                            </span>
                            <span className="hydra-badge">
                                {(resp.latencyMs / 1000).toFixed(1)}s
                            </span>
                            {resp.tokensUsed && (
                                <span className="hydra-badge">{resp.tokensUsed} tok</span>
                            )}
                        </div>
                    )}
                </div>

                {resp === 'loading' ? (
                    <div className="hydra-panel-loading">
                        <div className="hydra-skeleton" />
                        <div className="hydra-skeleton" />
                        <div className="hydra-skeleton" />
                        <div className="hydra-skeleton" />
                        <div className="hydra-skeleton" />
                    </div>
                ) : resp && resp.status === 'success' ? (
                    <div className="hydra-panel-body">
                        {renderMarkdown(resp.content, color)}
                    </div>
                ) : resp ? (
                    <div className="hydra-panel-error">
                        <div className="hydra-panel-error-icon">
                            {resp.status === 'timeout' ? <Clock size={20} aria-hidden /> : <TriangleAlert size={20} aria-hidden />}
                        </div>
                        <div>{resp.status === 'timeout' ? 'Request timed out' : 'Error'}</div>
                        {resp.error && (
                            <div className="hydra-panel-error-msg">{resp.error}</div>
                        )}
                    </div>
                ) : null}
            </div>
        );
    };

    // Layout options
    const layoutOptions: { id: LayoutMode; icon: string; label: string }[] = [
        { id: 'columns', icon: '▥', label: 'Columns' },
        { id: 'rows', icon: '▤', label: 'Rows' },
    ];

    return (
        <div className="hydra-ai">
            {/* Header */}
            <div className="hydra-header">
                <div className="hydra-logo">
                    <span className="hydra-logo-icon"><Code size={14} /></span>
                    HYDRA-AI
                </div>

                <div className="hydra-head-selectors">
                    {heads.map(head => (
                        <div key={head.id} className="hydra-head-pill-wrap">
                            <button
                                className={`hydra-head-pill ${selectedHeads.includes(head.id) ? 'active' : ''}`}
                                style={{
                                    '--head-color': head.color,
                                    '--head-color-rgb': head.colorRgb,
                                } as React.CSSProperties}
                                onClick={() => toggleHead(head.id)}
                                title={`${head.description}${!head.enabled ? ' (not configured)' : ''}`}
                                disabled={!head.enabled && !selectedHeads.includes(head.id)}
                            >
                                <span className="hydra-head-pill-icon">{head.icon || <Bot size={13} aria-hidden />}</span>
                                {head.name}
                            </button>
                            <button
                                className="hydra-head-gear"
                                onClick={(e) => { e.stopPropagation(); openRegrowModal(head); }}
                                title={`Regrow ${head.name} — change LLM, provider, or endpoint`}
                                aria-label={`Regrow ${head.name}`}
                                style={{ '--head-color': head.color } as React.CSSProperties}
                            >
                                <Settings size={14} aria-hidden />
                            </button>
                        </div>
                    ))}
                    <button
                        className="hydra-add-head-btn"
                        onClick={openAddModal}
                        title="Add a new Hydra head"
                    >
                        + Head
                    </button>
                </div>

                <div className="hydra-header-actions">
                    <span className="hydra-head-count">
                        {selectedHeads.length} / 5 heads
                    </span>

                    {/* Layout picker */}
                    <div className="hydra-layout-dropdown">
                        <button
                            className="hydra-layout-btn"
                            onClick={() => setLayoutMenuOpen(!layoutMenuOpen)}
                        >
                            {layoutOptions.find(l => l.id === layout)?.icon} Layout
                        </button>
                        {layoutMenuOpen && (
                            <div className="hydra-layout-menu">
                                {layoutOptions.map(opt => (
                                    <button
                                        key={opt.id}
                                        className={`hydra-layout-option ${layout === opt.id ? 'active' : ''}`}
                                        onClick={() => { setLayout(opt.id); setLayoutMenuOpen(false); }}
                                    >
                                        <span className="hydra-layout-option-icon">{opt.icon}</span>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Synthesize toggle */}
                    <button
                        className={`hydra-synth-btn ${synthesize ? 'active' : ''}`}
                        onClick={() => setSynthesize(!synthesize)}
                        title="Compare and synthesize responses"
                    >
                        <Sparkles size={14} aria-hidden /> Synth {synthesize ? 'ON' : 'OFF'}
                    </button>

                    <button
                        className="hydra-clear-btn"
                        onClick={resetAllHeads}
                        title="Reset heads to defaults"
                    >
                        <RefreshCw size={14} aria-hidden /> Reset
                    </button>

                    <button
                        className="hydra-clear-btn"
                        onClick={clearSession}
                        title="Clear conversation"
                        aria-label="Clear conversation"
                    >
                        <RefreshCw size={14} aria-hidden />
                    </button>
                </div>
            </div>

            {/* Prompt Input */}
            <div className="hydra-input-area">
                <textarea
                    ref={inputRef}
                    className="hydra-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask ${selectedHeads.length} models simultaneously…`}
                    rows={1}
                    disabled={isLoading}
                />
                <button
                    className="hydra-send-btn"
                    onClick={sendQuery}
                    disabled={!input.trim() || isLoading || selectedHeads.length < 2}
                >
                    {isLoading ? <><Hourglass size={14} aria-hidden /> Querying…</> : `Ask ${selectedHeads.length} Heads`}
                </button>
            </div>

            {/* Content Area */}
            <div className="hydra-content" ref={contentRef}>
                {backendUnavailable ? (
                    <div className="hydra-empty-state">
                        <div className="hydra-empty-icon"><TriangleAlert size={28} aria-hidden /></div>
                        <div className="hydra-empty-title">Hydra multi-model is not configured</div>
                        <div className="hydra-empty-desc">
                            Requires a Hydra service mounted at <code>/api/hydra</code>
                            (heads registry + per-provider keys: OpenAI, Anthropic,
                            Gemini, Mistral, Local). Backend A doesn't ship it.
                        </div>
                    </div>
                ) : queries.length === 0 && !isLoading ? (
                    <div className="hydra-empty-state">
                        <div className="hydra-empty-icon"><Code size={28} aria-hidden /></div>
                        <div className="hydra-empty-title">Hydra-AI Reasoning</div>
                        <div className="hydra-empty-desc">
                            Select 2–5 AI model heads above, then ask a question.
                            Each head answers independently, and Hydra synthesizes the best response.
                        </div>
                    </div>
                ) : (
                    <>
                        {queries.map((q) => (
                            <div key={q.id} className="hydra-query-block">
                                <div className="hydra-query-prompt">
                                    <strong>You:</strong> {q.prompt}
                                </div>

                                <div className={`hydra-response-grid ${gridClass}`}>
                                    {q.responses.map(resp => {
                                        const head = getHead(resp.headId);
                                        return renderPanel(resp.headId, resp, head);
                                    })}
                                </div>

                                {q.synthesis && (
                                    <div className="hydra-synthesis">
                                        <div
                                            className="hydra-synthesis-header"
                                            onClick={() => setSynthOpen(prev => ({
                                                ...prev,
                                                [q.id]: !prev[q.id],
                                            }))}
                                        >
                                            <span><Sparkles size={14} /></span>
                                            <span className="hydra-synthesis-title">
                                                Hydra Synthesis
                                            </span>
                                            <span className="hydra-synthesis-toggle">
                                                {synthOpen[q.id] ? '▲ Collapse' : '▼ Expand'}
                                            </span>
                                        </div>
                                        {synthOpen[q.id] && (
                                            <div className="hydra-synthesis-body">
                                                {q.synthesis.agreements.length > 0 && (
                                                    <div className="hydra-synth-section">
                                                        <div className="hydra-synth-section-title agree">
                                                            <Check size={14} aria-hidden /> All Models Agree
                                                        </div>
                                                        <ul className="hydra-synth-list">
                                                            {q.synthesis.agreements.map((a, i) => (
                                                                <li key={i}>{a}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {q.synthesis.disagreements.length > 0 && (
                                                    <div className="hydra-synth-section">
                                                        <div className="hydra-synth-section-title disagree">
                                                            <TriangleAlert size={14} aria-hidden /> Points of Disagreement
                                                        </div>
                                                        <ul className="hydra-synth-list">
                                                            {q.synthesis.disagreements.map((d, i) => (
                                                                <li key={i}>{d}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                <div className="hydra-synth-section">
                                                    <div className="hydra-synth-section-title best">
                                                        <Sparkles size={14} aria-hidden /> Best Combined Answer
                                                    </div>
                                                    <div className="hydra-synth-best">
                                                        {q.synthesis.bestAnswer}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Active loading state for current query */}
                        {isLoading && activeResponses.size > 0 && (
                            <div className="hydra-query-block">
                                <div className="hydra-query-prompt">
                                    <strong>You:</strong> {input || '…'}
                                </div>
                                <div className={`hydra-response-grid ${gridClass}`}>
                                    {selectedHeads.map(headId => {
                                        const head = getHead(headId);
                                        const resp = activeResponses.get(headId);
                                        return renderPanel(headId, resp, head);
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Regrow / Add Head Modal ── */}
            {modalOpen && (
                <div className="hydra-modal-backdrop" onClick={closeModal}>
                    <div className="hydra-modal" onClick={e => e.stopPropagation()}>
                        <div className="hydra-modal-header">
                            <div className="hydra-modal-title-row">
                                <span className="hydra-modal-icon">
                                    {modalMode === 'edit' ? <RefreshCw size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
                                </span>
                                <h3>{modalMode === 'edit' ? 'Regrow Head' : 'Add New Head'}</h3>
                            </div>
                            <button className="hydra-modal-close" onClick={closeModal}><X size={16} /></button>
                        </div>

                        <div className="hydra-modal-body">
                            {/* Row 1: Name + Icon */}
                            <div className="hydra-modal-row">
                                <div className="hydra-modal-field" style={{ flex: 1 }}>
                                    <label>Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => handleFormChange('name', e.target.value)}
                                        placeholder="e.g. Claude 3 Opus"
                                    />
                                </div>
                                <div className="hydra-modal-field" style={{ width: 100 }}>
                                    <label>Icon</label>
                                    <div className="hydra-emoji-picker">
                                        <span className="hydra-emoji-current">{formData.icon}</span>
                                        <div className="hydra-emoji-grid">
                                            {EMOJI_PALETTE.map(e => (
                                                <button
                                                    key={e}
                                                    className={`hydra-emoji-opt ${formData.icon === e ? 'active' : ''}`}
                                                    onClick={() => handleFormChange('icon', e)}
                                                >{e}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Provider + Model */}
                            <div className="hydra-modal-row">
                                <div className="hydra-modal-field" style={{ flex: 1 }}>
                                    <label>Provider</label>
                                    <select
                                        value={formData.provider}
                                        onChange={e => handleFormChange('provider', e.target.value)}
                                    >
                                        <option value="openai">OpenAI</option>
                                        <option value="lmstudio">LM Studio</option>
                                        <option value="custom">Custom (OpenAI-compatible)</option>
                                    </select>
                                </div>
                                <div className="hydra-modal-field" style={{ flex: 1 }}>
                                    <label>Model</label>
                                    <input
                                        type="text"
                                        value={formData.model}
                                        onChange={e => handleFormChange('model', e.target.value)}
                                        placeholder="e.g. gpt-4o, claude-3-opus, llama-3"
                                    />
                                </div>
                            </div>

                            {/* Row 3: Endpoint (shown for lmstudio/custom) */}
                            {(formData.provider === 'lmstudio' || formData.provider === 'custom') && (
                                <div className="hydra-modal-field">
                                    <label>Endpoint URL</label>
                                    <input
                                        type="text"
                                        value={formData.endpoint || ''}
                                        onChange={e => handleFormChange('endpoint', e.target.value)}
                                        placeholder="http://localhost:1234/v1/chat/completions"
                                    />
                                </div>
                            )}

                            {/* Row 4: API Key env var */}
                            <div className="hydra-modal-field">
                                <label>API Key Env Var <span className="hydra-modal-hint">(name of env variable, e.g. OPENAI_API_KEY)</span></label>
                                <input
                                    type="text"
                                    value={formData.apiKeyEnv || ''}
                                    onChange={e => handleFormChange('apiKeyEnv', e.target.value)}
                                    placeholder="OPENAI_API_KEY"
                                />
                            </div>

                            {/* Row 5: Temperature + Max Tokens */}
                            <div className="hydra-modal-row">
                                <div className="hydra-modal-field" style={{ flex: 1 }}>
                                    <label>Temperature <span className="hydra-modal-val">{(formData.temperature ?? 0.3).toFixed(1)}</span></label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        value={formData.temperature ?? 0.3}
                                        onChange={e => handleFormChange('temperature', parseFloat(e.target.value))}
                                        className="hydra-slider"
                                    />
                                    <div className="hydra-slider-labels">
                                        <span>Precise</span>
                                        <span>Creative</span>
                                    </div>
                                </div>
                                <div className="hydra-modal-field" style={{ flex: 1 }}>
                                    <label>Max Tokens <span className="hydra-modal-val">{formData.maxTokens ?? 1500}</span></label>
                                    <input
                                        type="range"
                                        min="100"
                                        max="8000"
                                        step="100"
                                        value={formData.maxTokens ?? 1500}
                                        onChange={e => handleFormChange('maxTokens', parseInt(e.target.value))}
                                        className="hydra-slider"
                                    />
                                    <div className="hydra-slider-labels">
                                        <span>100</span>
                                        <span>8000</span>
                                    </div>
                                </div>
                            </div>

                            {/* Row 6: Color + Description */}
                            <div className="hydra-modal-row">
                                <div className="hydra-modal-field" style={{ width: 100 }}>
                                    <label>Color</label>
                                    <input
                                        type="color"
                                        value={formData.color}
                                        onChange={e => handleFormChange('color', e.target.value)}
                                        className="hydra-color-input"
                                    />
                                </div>
                                <div className="hydra-modal-field" style={{ flex: 1 }}>
                                    <label>Description</label>
                                    <input
                                        type="text"
                                        value={formData.description}
                                        onChange={e => handleFormChange('description', e.target.value)}
                                        placeholder="Short description of this model…"
                                    />
                                </div>
                            </div>

                            {/* Row 7: Enabled toggle */}
                            <div className="hydra-modal-field hydra-toggle-row">
                                <label>Enabled</label>
                                <button
                                    className={`hydra-toggle ${formData.enabled ? 'on' : 'off'}`}
                                    onClick={() => handleFormChange('enabled', !formData.enabled)}
                                >
                                    <span className="hydra-toggle-thumb" />
                                </button>
                            </div>

                            {/* Error */}
                            {modalError && (
                                <div className="hydra-modal-error"><TriangleAlert size={14} aria-hidden /> {modalError}</div>
                            )}
                        </div>

                        <div className="hydra-modal-footer">
                            {modalMode === 'edit' && (
                                <button
                                    className="hydra-modal-delete-btn"
                                    onClick={deleteHead}
                                    disabled={modalSaving}
                                >
                                    <Trash2 size={14} aria-hidden /> Remove Head
                                </button>
                            )}
                            <div style={{ flex: 1 }} />
                            <button className="hydra-modal-cancel-btn" onClick={closeModal}>
                                Cancel
                            </button>
                            <button
                                className="hydra-modal-save-btn"
                                onClick={saveHead}
                                disabled={modalSaving}
                            >
                                {modalSaving
                                    ? 'Saving…'
                                    : modalMode === 'edit'
                                        ? <><RefreshCw size={14} aria-hidden /> Regrow</>
                                        : <><Plus size={14} aria-hidden /> Add Head</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
