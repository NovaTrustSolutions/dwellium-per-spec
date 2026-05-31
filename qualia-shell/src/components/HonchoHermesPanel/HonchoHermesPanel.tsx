import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { useUser } from '../../context/UserContext';
import { useIngestion } from '../Scribe/ingestion/useIngestion';
import {
    dreamStore,
    dreamUserIdHolder,
    appendDream,
    deleteDream,
    clearDreams,
} from '../StellaAgent/honchoDreamStore';
import { dispatchOpenWidget } from '../Workspace/workspaceScribe';
import { hermesLearningUserIdHolder, rateRun } from './hermesLearningStore';
import { memoryStore, memoryUserIdHolder, addLocalMemory, deleteLocalMemory } from './honchoMemoryStore';
import { runHermes } from './hermesRunner';
import {
    arrangeMarkdownFiles,
    displayName,
    formatBytes,
    DEFAULT_ARRANGE,
    type MdSortKey,
    type MdSortDir,
} from './markdownArrange';
import './HonchoHermesPanel.css';

/* ─── Types ─── */
interface HonchoMemory {
    id: string;
    userId: string;
    content: string;
    memoryType: string;
    source: string;
    importance: number;
    metadata: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}

interface HermesTool {
    name: string;
    description: string;
}

interface HermesStep {
    type: 'thought' | 'action' | 'observation' | 'final_answer';
    content: string;
    timestamp: string;
}

interface AgentStatus {
    name: string;
    status: 'online' | 'offline' | 'degraded';
    lastPing: string;
    endpoint: string;
    latencyMs?: number;
}

interface MemoryStats {
    totalMemories: number;
    totalPeers: number;
    totalSessions: number;
    totalMessages: number;
    totalConnections: number;
}

/* ─── Constants ─── */
const TYPE_ICONS: Record<string, string> = {
    fact: '📋', preference: '⭐', decision: '🔨', observation: '👁️', insight: '💡', manual: '✍️',
};
const TYPE_COLORS: Record<string, string> = {
    fact: '#3b82f6', preference: '#f59e0b', decision: '#ef4444',
    observation: '#D6FE51', insight: '#10b981', manual: '#D6FE51',
};
const IMPORTANCE_LABELS = ['Low', 'Medium', 'High', 'Critical'];

type TabId = 'memory' | 'dreams' | 'hermes' | 'agents' | 'graph' | 'files';

export default function HonchoHermesPanel() {
    const { user, authFetch } = useUser();

    /* ─── DREAMS TAB STATE (per-user dream/reflection abilities) ─── */
    // Update the dynamic-key holder DURING render before the store read, so the
    // useSyncExternalStore snapshot resolves to this user's dreams (mirrors the
    // useIngestion / WindowContext savedLayouts dynamic-key pattern).
    dreamUserIdHolder.current = user?.id ?? null;
    // Same dynamic-key holder discipline for the Hermes self-improvement store
    // (Cycle 16): set BEFORE any learning-store read so few-shot recall +
    // tool-weighting resolve to this user's run history.
    hermesLearningUserIdHolder.current = user?.id ?? null;
    // Local-first Honcho memories (same dynamic-key holder discipline): set BEFORE
    // the store read so the snapshot resolves to THIS user's persisted memories.
    // This is what makes "+ Add Memory" actually persist + show when the backend
    // memory route is offline/404 (which it is in the current Express backend).
    memoryUserIdHolder.current = user?.id ?? null;
    const dreams = useSyncExternalStore(
        dreamStore.subscribe,
        dreamStore.getSnapshot,
        dreamStore.getServerSnapshot,
    );
    const localMemories = useSyncExternalStore(
        memoryStore.subscribe,
        memoryStore.getSnapshot,
        memoryStore.getServerSnapshot,
    );
    const [newDream, setNewDream] = useState({ title: '', text: '' });
    const [showAddDream, setShowAddDream] = useState(false);
    const [activeTab, setActiveTab] = useState<TabId>('memory');
    const [loading, setLoading] = useState(true);

    /* ─── MEMORY TAB STATE ─── */
    const [memories, setMemories] = useState<HonchoMemory[]>([]);
    const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
    const [memoryFilter, setMemoryFilter] = useState<string>('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [showAddMemory, setShowAddMemory] = useState(false);
    const [newMemory, setNewMemory] = useState({ content: '', memoryType: 'fact', importance: 0.5 });

    /* ─── HERMES TAB STATE ─── */
    const [hermesOnline, setHermesOnline] = useState(false);
    const [hermesTools, setHermesTools] = useState<HermesTool[]>([]);
    const [hermesPrompt, setHermesPrompt] = useState('');
    const [hermesSteps, setHermesSteps] = useState<HermesStep[]>([]);
    const [hermesRunning, setHermesRunning] = useState(false);
    const [hermesResult, setHermesResult] = useState<string>('');
    // Cycle 17: self-improvement — id of the run just recorded (enables the
    // 👍/👎 rating control) + the rating already given for it.
    const [lastRunId, setLastRunId] = useState<string | null>(null);
    const [lastRating, setLastRating] = useState<number | null>(null);
    const [fewShotInjected, setFewShotInjected] = useState(0);
    const stepsEndRef = useRef<HTMLDivElement>(null);

    /* ─── AGENTS TAB STATE ─── */
    const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
    const [heartbeatRunning, setHeartbeatRunning] = useState(false);

    /* ─── GRAPH TAB STATE ─── */
    const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] } | null>(null);

    /* ─── FILES TAB STATE (Markdown arrange/filter view) ─── */
    const ingestion = useIngestion();
    const [fileSortKey, setFileSortKey] = useState<MdSortKey>(DEFAULT_ARRANGE.sortKey);
    const [fileSortDir, setFileSortDir] = useState<MdSortDir>(DEFAULT_ARRANGE.sortDir);
    const [fileFilter, setFileFilter] = useState<string>(DEFAULT_ARRANGE.filterText);
    const arrangedFiles = arrangeMarkdownFiles(ingestion.converted, {
        sortKey: fileSortKey,
        sortDir: fileSortDir,
        filterText: fileFilter,
    });

    /* ═══ DATA FETCHING ═══ */
    const fetchMemories = useCallback(async () => {
        try {
            const params = new URLSearchParams({ limit: '50' });
            if (memoryFilter) params.set('search', memoryFilter);
            const res = await authFetch(`/api/honcho/memories?${params}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setMemories(data.data);
        } catch { /* silent */ }
    }, [authFetch, memoryFilter]);

    const fetchMemoryStats = useCallback(async () => {
        try {
            const res = await authFetch('/api/honcho/stats');
            if (!res.ok) return;
            const data = await res.json();
            if (data.success) setMemoryStats(data.data);
        } catch { /* silent */ }
    }, [authFetch]);

    const fetchHermesStatus = useCallback(async () => {
        try {
            const res = await authFetch('/api/hermes/status');
            if (!res.ok) { setHermesOnline(false); return; }
            const data = await res.json();
            setHermesOnline(data.data?.ollamaOnline || false);
        } catch { setHermesOnline(false); }
    }, [authFetch]);

    const fetchHermesTools = useCallback(async () => {
        try {
            const res = await authFetch('/api/hermes/tools');
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setHermesTools(data.data);
        } catch { /* silent */ }
    }, [authFetch]);

    const fetchAgentHeartbeats = useCallback(async () => {
        setHeartbeatRunning(true);
        try {
            const res = await authFetch('/api/agents/heartbeat');
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setAgentStatuses(data.data);
        } catch { /* silent */ }
        finally { setHeartbeatRunning(false); }
    }, [authFetch]);

    const fetchMemoryGraph = useCallback(async () => {
        try {
            const res = await authFetch('/api/honcho/memories/map');
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && data.data) setGraphData(data.data);
        } catch { /* silent */ }
    }, [authFetch]);

    // Initial load
    useEffect(() => {
        Promise.all([fetchMemories(), fetchMemoryStats(), fetchHermesStatus(), fetchHermesTools()])
            .then(() => setLoading(false));
    }, [fetchMemories, fetchMemoryStats, fetchHermesStatus, fetchHermesTools]);

    // Auto-scroll Hermes steps
    useEffect(() => {
        stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [hermesSteps]);

    /* ═══ ACTIONS ═══ */
    const addMemory = async () => {
        const content = newMemory.content.trim();
        if (!content) return;
        // Local-first: persist immediately so the memory shows + survives reload
        // even when the backend route is offline (it 404s today). The store read
        // re-renders the list synchronously — no round-trip required.
        addLocalMemory({
            userId: user?.email || user?.id || 'default',
            content,
            memoryType: newMemory.memoryType,
            importance: newMemory.importance,
            source: 'manual',
        });
        setNewMemory({ content: '', memoryType: 'fact', importance: 0.5 });
        setShowAddMemory(false);
        // Best-effort backend sync (no-op / 404 swallowed when Honcho is offline).
        try {
            await authFetch('/api/honcho/memories', {
                method: 'POST',
                body: JSON.stringify({
                    userId: user?.email || 'default',
                    content,
                    memoryType: newMemory.memoryType,
                    importance: newMemory.importance,
                    source: 'manual',
                }),
            });
            fetchMemories();
            fetchMemoryStats();
        } catch { /* backend offline — local copy already persisted */ }
    };

    const deleteMemory = async (id: string) => {
        // Local store owns user-added memories; drop it there first.
        const wasLocal = deleteLocalMemory(id);
        try {
            await authFetch(`/api/honcho/memories/${id}`, { method: 'DELETE' });
            if (!wasLocal) { fetchMemories(); fetchMemoryStats(); }
        } catch { /* backend offline — local copy already removed */ }
    };

    const delegateToHermes = async () => {
        if (!hermesPrompt.trim() || hermesRunning) return;
        const task = hermesPrompt;               // captured: cleared below
        setHermesRunning(true);
        setHermesResult('');
        setHermesSteps([]);
        setLastRunId(null);
        setLastRating(null);

        // Delegate to the ONE shared self-improving run path (hermesRunner):
        // few-shot injection (mechanism a) + proven-tool weighting (mechanism b)
        // + record-back into the LOCAL learning store all live there.
        const run = await runHermes(task, {
            authFetch,
            toolNames: hermesTools.map(t => t.name),
        });

        setHermesSteps(run.steps);
        setFewShotInjected(run.fewShotCount);
        if (run.recordId) setLastRunId(run.recordId);
        if (run.outcome === 'success') {
            setHermesResult(run.result || 'Done');
            // Write Honcho memory after task completion (Phase 6: HM-4)
            authFetch('/api/honcho/memories', {
                method: 'POST',
                body: JSON.stringify({
                    userId: user?.email || 'default',
                    content: `Hermes completed task: "${task}" → ${run.result.substring(0, 200)}`,
                    memoryType: 'observation',
                    source: 'agent',
                    importance: 0.6,
                    metadata: { agent: 'hermes', task },
                }),
            }).catch(() => {});
        }
        setHermesRunning(false);
        setHermesPrompt('');
    };

    /** Rate the last recorded run (+1 👍 / -1 👎); feeds few-shot ranking. */
    const handleRateRun = (rating: number) => {
        if (!lastRunId) return;
        try { rateRun(lastRunId, rating); setLastRating(rating); } catch { /* silent */ }
    };

    /* ═══ HELPERS ═══ */
    const formatTime = (ts: string) => {
        const d = new Date(ts);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    const getImportanceLabel = (imp: number) => {
        if (imp >= 0.8) return IMPORTANCE_LABELS[3];
        if (imp >= 0.6) return IMPORTANCE_LABELS[2];
        if (imp >= 0.4) return IMPORTANCE_LABELS[1];
        return IMPORTANCE_LABELS[0];
    };

    // Combine local-first memories (user-added, offline-persistent) with any
    // backend-fetched memories. Local first so a just-added memory shows on top;
    // de-dupe by id in case the backend echoes a synced local copy.
    const combinedMemories: HonchoMemory[] = (() => {
        const seen = new Set<string>();
        const out: HonchoMemory[] = [];
        for (const m of [...localMemories, ...memories]) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            out.push(m as HonchoMemory);
        }
        return out;
    })();

    const filteredMemories = combinedMemories.filter(m => {
        if (typeFilter !== 'all' && m.memoryType !== typeFilter) return false;
        if (memoryFilter && !m.content.toLowerCase().includes(memoryFilter.toLowerCase())) return false;
        return true;
    });

    /* ═══ RENDER ═══ */
    return (
        <div className="hhp">
            {/* Header */}
            <div className="hhp__header">
                <div className="hhp__header-left">
                    <span className="hhp__header-icon">🧠⚡</span>
                    <div>
                        <h2 className="hhp__title">Honcho + Hermes</h2>
                        <p className="hhp__subtitle">
                            Memory &amp; Intelligence · {(memoryStats?.totalMemories || 0) + localMemories.length} memories
                            <span className={`hhp__status-dot ${hermesOnline ? 'online' : 'offline'}`} />
                            {hermesOnline ? 'Hermes Online' : 'Hermes Offline'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="hhp__tabs">
                {([
                    ['memory', '🧠 Memory'],
                    ['dreams', '🌙 Dreams'],
                    ['hermes', '⚡ Hermes'],
                    ['agents', '🤖 Agents'],
                    ['graph', '🕸️ Graph'],
                    ['files', '📄 Files'],
                ] as [TabId, string][]).map(([id, label]) => (
                    <button key={id} className={`hhp__tab ${activeTab === id ? 'active' : ''}`}
                        onClick={() => {
                            setActiveTab(id);
                            if (id === 'agents') fetchAgentHeartbeats();
                            if (id === 'graph') fetchMemoryGraph();
                        }}>
                        {label}
                    </button>
                ))}
            </div>

            {loading && <div className="hhp__loading" role="status" aria-live="polite">Loading intelligence systems...</div>}

            {/* ═══ MEMORY TAB ═══ */}
            {!loading && activeTab === 'memory' && (
                <div className="hhp__panel">
                    {/* Stats Grid */}
                    {memoryStats && (
                        <div className="hhp__stats-grid">
                            <div className="hhp__stat"><span className="hhp__stat-value">{memoryStats.totalMemories}</span><span className="hhp__stat-label">Memories</span></div>
                            <div className="hhp__stat"><span className="hhp__stat-value">{memoryStats.totalSessions}</span><span className="hhp__stat-label">Sessions</span></div>
                            <div className="hhp__stat"><span className="hhp__stat-value">{memoryStats.totalPeers}</span><span className="hhp__stat-label">Peers</span></div>
                            <div className="hhp__stat"><span className="hhp__stat-value">{memoryStats.totalConnections}</span><span className="hhp__stat-label">Connections</span></div>
                        </div>
                    )}

                    {/* Toolbar */}
                    <div className="hhp__toolbar">
                        <input className="hhp__search" placeholder="Search memories..." aria-label="Search memories" value={memoryFilter}
                            onChange={e => { setMemoryFilter(e.target.value); }} />
                        <select className="hhp__type-filter" aria-label="Filter memories by type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                            <option value="all">All Types</option>
                            <option value="fact">📋 Facts</option>
                            <option value="preference">⭐ Preferences</option>
                            <option value="decision">🔨 Decisions</option>
                            <option value="observation">👁️ Observations</option>
                            <option value="insight">💡 Insights</option>
                        </select>
                        <button className="hhp__add-btn" onClick={() => setShowAddMemory(!showAddMemory)}>
                            {showAddMemory ? '✕ Cancel' : '+ Add Memory'}
                        </button>
                    </div>

                    {/* Add Form */}
                    {showAddMemory && (
                        <div className="hhp__add-form">
                            <textarea className="hhp__add-textarea" placeholder="What should I remember?" aria-label="Memory content"
                                value={newMemory.content} onChange={e => setNewMemory({ ...newMemory, content: e.target.value })} rows={3} />
                            <div className="hhp__add-row">
                                <select className="hhp__add-type" aria-label="Memory type" value={newMemory.memoryType}
                                    onChange={e => setNewMemory({ ...newMemory, memoryType: e.target.value })}>
                                    <option value="fact">📋 Fact</option>
                                    <option value="preference">⭐ Preference</option>
                                    <option value="decision">🔨 Decision</option>
                                    <option value="observation">👁️ Observation</option>
                                    <option value="insight">💡 Insight</option>
                                </select>
                                <label className="hhp__add-imp-label">
                                    Importance: {(newMemory.importance * 100).toFixed(0)}%
                                    <input type="range" min={0} max={1} step={0.1} value={newMemory.importance}
                                        onChange={e => setNewMemory({ ...newMemory, importance: parseFloat(e.target.value) })} />
                                </label>
                                <button className="hhp__add-submit" onClick={addMemory} disabled={!newMemory.content.trim()}>
                                    Save Memory
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Memory List */}
                    <div className="hhp__memory-list">
                        {filteredMemories.length === 0 ? (
                            <div className="hhp__empty">
                                <span>🧠</span>
                                <p>No memories yet. ARA will learn from your conversations.</p>
                            </div>
                        ) : (
                            filteredMemories.map(m => (
                                <div key={m.id} className="hhp__memory-card"
                                    style={{ '--accent': TYPE_COLORS[m.memoryType] || '#D6FE51' } as React.CSSProperties}>
                                    <div className="hhp__memory-top">
                                        <span className="hhp__memory-type">
                                            {TYPE_ICONS[m.memoryType] || '📋'} {m.memoryType}
                                        </span>
                                        <div className="hhp__memory-badges">
                                            <span className={`hhp__importance-badge imp-${getImportanceLabel(m.importance).toLowerCase()}`}>
                                                {getImportanceLabel(m.importance)}
                                            </span>
                                            <span className="hhp__memory-source">{m.source}</span>
                                        </div>
                                    </div>
                                    <p className="hhp__memory-content">{m.content}</p>
                                    <div className="hhp__memory-meta">
                                        <span className="hhp__memory-time">{formatTime(m.createdAt)}</span>
                                        <button className="hhp__memory-delete" onClick={() => deleteMemory(m.id)} aria-label="Delete memory" title="Delete">🗑️</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ═══ DREAMS TAB ═══ */}
            {!loading && activeTab === 'dreams' && (
                <div className="hhp__panel">
                    <h3 className="hhp__section-title">🌙 Dreams</h3>
                    <p className="hhp__hint">
                        Short reflections Honcho synthesizes over your memories — patterns,
                        connections, and unsurfaced to-dos. Stored locally, per user.
                    </p>

                    {/* Toolbar */}
                    <div className="hhp__toolbar">
                        <button
                            className="hhp__add-btn"
                            aria-label={showAddDream ? 'Cancel new dream' : 'Add a dream'}
                            onClick={() => setShowAddDream(v => !v)}
                        >
                            {showAddDream ? '✕ Cancel' : '+ Add Dream'}
                        </button>
                        {dreams.length > 0 && (
                            <button
                                className="hhp__btn"
                                aria-label="Clear all dreams"
                                onClick={() => clearDreams()}
                            >
                                🗑️ Clear all
                            </button>
                        )}
                    </div>

                    {/* Add Form */}
                    {showAddDream && (
                        <div className="hhp__add-form">
                            <input
                                className="hhp__search"
                                placeholder="Dream title (e.g. 'Pattern: meetings cluster Wednesdays')"
                                aria-label="Dream title"
                                value={newDream.title}
                                onChange={e => setNewDream({ ...newDream, title: e.target.value })}
                            />
                            <textarea
                                className="hhp__add-textarea"
                                placeholder="The reflection / synthesis…"
                                aria-label="Dream text"
                                value={newDream.text}
                                onChange={e => setNewDream({ ...newDream, text: e.target.value })}
                                rows={3}
                            />
                            <div className="hhp__add-row">
                                <button
                                    className="hhp__add-submit"
                                    disabled={!newDream.title.trim() || !newDream.text.trim()}
                                    onClick={() => {
                                        appendDream({
                                            title: newDream.title.trim(),
                                            text: newDream.text.trim(),
                                            sources: [],
                                        });
                                        setNewDream({ title: '', text: '' });
                                        setShowAddDream(false);
                                    }}
                                >
                                    Save Dream
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Dream List */}
                    <div className="hhp__memory-list">
                        {dreams.length === 0 ? (
                            <div className="hhp__empty">
                                <span>🌙</span>
                                <p>No dreams yet. Honcho will surface reflections as it learns — or add one manually.</p>
                            </div>
                        ) : (
                            dreams.map(d => (
                                <div key={d.id} className="hhp__memory-card"
                                    style={{ '--accent': '#8b5cf6' } as React.CSSProperties}>
                                    <div className="hhp__memory-top">
                                        <span className="hhp__memory-type">🌙 {d.title}</span>
                                        {d.sources.length > 0 && (
                                            <div className="hhp__memory-badges">
                                                <span className="hhp__memory-source">{d.sources.length} sources</span>
                                            </div>
                                        )}
                                    </div>
                                    <p className="hhp__memory-content">{d.text}</p>
                                    <div className="hhp__memory-meta">
                                        <span className="hhp__memory-time">{formatTime(d.createdAt)}</span>
                                        <button
                                            className="hhp__memory-delete"
                                            aria-label={`Delete dream ${d.title}`}
                                            title="Delete"
                                            onClick={() => deleteDream(d.id)}
                                        >🗑️</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ═══ HERMES TAB ═══ */}
            {!loading && activeTab === 'hermes' && (
                <div className="hhp__panel">
                    {/* Status */}
                    <div className={`hhp__hermes-status ${hermesOnline ? 'online' : 'offline'}`}>
                        <span className="hhp__hermes-status-icon">{hermesOnline ? '⚡' : '💤'}</span>
                        <div>
                            <strong>{hermesOnline ? 'Hermes Online' : 'Hermes Offline'}</strong>
                            <p>{hermesOnline ? 'ReAct reasoning loop ready. Local LLM connected.' : 'Ollama not available. Start Ollama to enable Hermes.'}</p>
                        </div>
                    </div>

                    {/* Tool Registry */}
                    <div className="hhp__tools-section">
                        <h3 className="hhp__section-title">🔧 Registered Tools ({hermesTools.length})</h3>
                        <div className="hhp__tools-grid">
                            {hermesTools.map(t => (
                                <div key={t.name} className="hhp__tool-card">
                                    <span className="hhp__tool-name">{t.name}</span>
                                    <span className="hhp__tool-desc">{t.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Task Delegation */}
                    <div className="hhp__delegate-section">
                        <h3 className="hhp__section-title">🎯 Delegate Task</h3>
                        <div className="hhp__delegate-row">
                            <input className="hhp__delegate-input" placeholder="Ask Hermes to investigate, search, or analyze..." aria-label="Hermes task prompt"
                                value={hermesPrompt} onChange={e => setHermesPrompt(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && delegateToHermes()}
                                disabled={!hermesOnline || hermesRunning} />
                            <button className="hhp__delegate-btn" onClick={delegateToHermes}
                                disabled={!hermesOnline || hermesRunning || !hermesPrompt.trim()}>
                                {hermesRunning ? '⏳ Thinking...' : '⚡ Run'}
                            </button>
                        </div>

                        {/* Self-improvement: surface how many past successes informed this run */}
                        {fewShotInjected > 0 && (
                            <p className="hhp__fewshot-note" role="note">
                                🧠 Learning from {fewShotInjected} similar past {fewShotInjected === 1 ? 'run' : 'runs'}.
                            </p>
                        )}

                        {/* ReAct Steps Trace */}
                        {hermesSteps.length > 0 && (
                            <div className="hhp__steps-trace">
                                {hermesSteps.map((step, i) => (
                                    <div key={i} className={`hhp__step hhp__step--${step.type}`}>
                                        <span className="hhp__step-icon">
                                            {{
                                                thought: '💭',
                                                action: '⚙️',
                                                observation: '👁️',
                                                final_answer: '✅',
                                            }[step.type]}
                                        </span>
                                        <div className="hhp__step-body">
                                            <span className="hhp__step-label">{step.type.replace('_', ' ').toUpperCase()}</span>
                                            <p>{step.content}</p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={stepsEndRef} />
                            </div>
                        )}

                        {/* Final Result */}
                        {hermesResult && !hermesRunning && (
                            <div className="hhp__result">
                                <h4>📋 Result</h4>
                                <pre className="hhp__result-content">{hermesResult}</pre>
                                {/* Rating control (Cycle 17): feedback re-weights few-shot recall */}
                                {lastRunId && (
                                    <div className="hhp__rate-row" role="group" aria-label="Rate this Hermes run">
                                        <span className="hhp__rate-label">Was this helpful?</span>
                                        <button
                                            className={`hhp__rate-btn ${lastRating === 1 ? 'is-active' : ''}`}
                                            onClick={() => handleRateRun(1)}
                                            aria-pressed={lastRating === 1}
                                            aria-label="Mark this run helpful">👍</button>
                                        <button
                                            className={`hhp__rate-btn ${lastRating === -1 ? 'is-active' : ''}`}
                                            onClick={() => handleRateRun(-1)}
                                            aria-pressed={lastRating === -1}
                                            aria-label="Mark this run unhelpful">👎</button>
                                        {lastRating !== null && (
                                            <span className="hhp__rate-thanks" role="status">Thanks — Hermes will remember.</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ AGENTS TAB ═══ */}
            {!loading && activeTab === 'agents' && (
                <div className="hhp__panel">
                    <div className="hhp__agents-header">
                        <h3 className="hhp__section-title">🤖 Agent Heartbeat Monitor</h3>
                        <button className="hhp__heartbeat-btn" onClick={fetchAgentHeartbeats} disabled={heartbeatRunning}>
                            {heartbeatRunning ? '⏳ Pinging...' : '💓 Check All'}
                        </button>
                    </div>

                    <div className="hhp__agents-grid">
                        {agentStatuses.length === 0 ? (
                            <div className="hhp__empty">
                                <span>🤖</span>
                                <p>Click "Check All" to ping all agents</p>
                            </div>
                        ) : (
                            agentStatuses.map(agent => (
                                <div key={agent.name} className={`hhp__agent-card hhp__agent-card--${agent.status}`}>
                                    <div className="hhp__agent-header">
                                        <span className={`hhp__agent-dot ${agent.status}`} />
                                        <strong>{agent.name}</strong>
                                    </div>
                                    <div className="hhp__agent-details">
                                        <span>Status: {agent.status.toUpperCase()}</span>
                                        {agent.latencyMs !== undefined && <span>Latency: {agent.latencyMs}ms</span>}
                                        <span className="hhp__agent-endpoint">{agent.endpoint}</span>
                                    </div>
                                    <span className="hhp__agent-ping-time">{formatTime(agent.lastPing)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ═══ GRAPH TAB ═══ */}
            {!loading && activeTab === 'graph' && (
                <div className="hhp__panel">
                    <h3 className="hhp__section-title">🕸️ Memory Graph</h3>
                    {!graphData || (graphData.nodes.length === 0) ? (
                        <div className="hhp__empty">
                            <span>🕸️</span>
                            <p>No memory graph data available yet. Memories will appear here as they accumulate.</p>
                        </div>
                    ) : (
                        <div className="hhp__graph-container">
                            {/* ASCII-style force graph visualization */}
                            <div className="hhp__graph-stats">
                                <span>{graphData.nodes.length} nodes</span>
                                <span>{graphData.edges.length} connections</span>
                            </div>
                            <div className="hhp__graph-nodes">
                                {graphData.nodes.slice(0, 50).map((node: any, i: number) => {
                                    const angle = (i / Math.min(graphData!.nodes.length, 50)) * 2 * Math.PI;
                                    const radius = 120 + (i % 3) * 40;
                                    const x = 50 + Math.cos(angle) * (radius / 4);
                                    const y = 50 + Math.sin(angle) * (radius / 4);
                                    return (
                                        <div key={node.id || i} className={`hhp__graph-node hhp__graph-node--${node.type || 'fact'}`}
                                            style={{
                                                left: `${Math.min(90, Math.max(5, x))}%`,
                                                top: `${Math.min(90, Math.max(5, y))}%`,
                                                '--size': `${8 + (node.importance || 0.5) * 16}px`,
                                            } as React.CSSProperties}
                                            title={`${node.type}: ${(node.content || node.label || '').substring(0, 80)}`}>
                                            {TYPE_ICONS[node.type] || '📋'}
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Connection lines are drawn via SVG */}
                            <svg className="hhp__graph-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {graphData.edges.slice(0, 100).map((edge: any, i: number) => {
                                    const srcIdx = graphData!.nodes.findIndex((n: any) => n.id === edge.source);
                                    const tgtIdx = graphData!.nodes.findIndex((n: any) => n.id === edge.target);
                                    if (srcIdx < 0 || tgtIdx < 0 || srcIdx >= 50 || tgtIdx >= 50) return null;
                                    const aS = (srcIdx / Math.min(graphData!.nodes.length, 50)) * 2 * Math.PI;
                                    const aT = (tgtIdx / Math.min(graphData!.nodes.length, 50)) * 2 * Math.PI;
                                    const rS = 120 + (srcIdx % 3) * 40;
                                    const rT = 120 + (tgtIdx % 3) * 40;
                                    return (
                                        <line key={i}
                                            x1={50 + Math.cos(aS) * (rS / 4)} y1={50 + Math.sin(aS) * (rS / 4)}
                                            x2={50 + Math.cos(aT) * (rT / 4)} y2={50 + Math.sin(aT) * (rT / 4)}
                                            stroke="rgba(214,254,81,0.15)" strokeWidth="0.3" />
                                    );
                                })}
                            </svg>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ FILES TAB — Markdown arrange/filter view ═══ */}
            {!loading && activeTab === 'files' && (
                <div className="hhp__panel">
                    <h3 className="hhp__section-title">📄 Converted Markdown</h3>

                    {/* Arrange / filter toolbar */}
                    <div className="hhp__toolbar">
                        <input
                            className="hhp__search"
                            placeholder="Filter files by name..."
                            aria-label="Filter Markdown files by name"
                            value={fileFilter}
                            onChange={e => setFileFilter(e.target.value)}
                        />
                        <select
                            className="hhp__type-filter"
                            aria-label="Sort Markdown files by"
                            value={fileSortKey}
                            onChange={e => setFileSortKey(e.target.value as MdSortKey)}
                        >
                            <option value="date">Date</option>
                            <option value="name">Name</option>
                            <option value="size">Size</option>
                        </select>
                        <button
                            className="hhp__btn"
                            aria-label={`Sort ${fileSortDir === 'asc' ? 'ascending' : 'descending'} — toggle direction`}
                            title={fileSortDir === 'asc' ? 'Ascending' : 'Descending'}
                            onClick={() => setFileSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                        >
                            {fileSortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                        </button>
                    </div>

                    {arrangedFiles.length === 0 ? (
                        <div className="hhp__empty">
                            <span>📄</span>
                            <p>
                                {ingestion.converted.length === 0
                                    ? 'No converted Markdown files yet. Use Scribe → Choose folders → Convert now to populate this view.'
                                    : 'No files match the current filter.'}
                            </p>
                        </div>
                    ) : (
                        <ul className="hhp__file-list" aria-label="Converted Markdown files">
                            {arrangedFiles.map((f, i) => (
                                <li key={`${f.sourceName}-${i}`} className="hhp__file-row">
                                    <button
                                        className="hhp__file-open"
                                        aria-label={`Open ${displayName(f)} in Scribe`}
                                        title="Open in Scribe"
                                        onClick={() => dispatchOpenWidget('scribe', 'Scribe', '📝')}
                                    >
                                        <span className="hhp__file-name">📝 {displayName(f)}</span>
                                        <span className="hhp__file-meta">
                                            <span className="hhp__file-size">{formatBytes(f.bytes)}</span>
                                            {f.convertedAt && (
                                                <span className="hhp__file-date">
                                                    {f.convertedAt.slice(0, 10)}
                                                </span>
                                            )}
                                            {f.status === 'passthrough' && (
                                                <span className="hhp__file-badge">passthrough</span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
