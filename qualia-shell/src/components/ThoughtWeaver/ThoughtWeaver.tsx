import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE } from '../../config';
import './ThoughtWeaver.css';

// ── Types ────────────────────────────────────────────────────────────

type TabId = 'capture' | 'dashboard' | 'timeline';
type BucketId = 'people' | 'projects' | 'ideas' | 'admin';

interface Stats {
    totalCaptures: number;
    pendingReviews: number;
    activePeople: number;
    activeProjects: number;
    totalIdeas: number;
    tasksDue: number;
}

interface CaptureEntry {
    id: string;
    original_text: string;
    filed_to: string;
    confidence: number;
    destination_name: string | null;
    status: string;
    createdAt: string;
}

interface BucketItem {
    id: string;
    name: string;
    notes?: string;
    context?: string;
    one_liner?: string;
    next_action?: string;
    status?: string;
    due_date?: string | null;
    tags: string[];
    type?: string;
    createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'capture', label: 'Capture', icon: '📝' },
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'timeline', label: 'Timeline', icon: '🕐' },
];

const BUCKETS: { id: BucketId; label: string; icon: string; color: string }[] = [
    { id: 'people', label: 'People', icon: '👤', color: '#D6FE51' },
    { id: 'projects', label: 'Projects', icon: '📁', color: '#60a5fa' },
    { id: 'ideas', label: 'Ideas', icon: '💡', color: '#fbbf24' },
    { id: 'admin', label: 'Tasks', icon: '📋', color: '#34d399' },
];

const TEMPLATES = [
    { icon: '👤', label: 'Person', template: 'Met [name] — context: [where/how]. Follow up: [action].' },
    { icon: '📁', label: 'Project', template: 'Project: [name]. Next action: [step]. Notes: [details].' },
    { icon: '💡', label: 'Idea', template: 'Idea: [one-liner]. Details: [expand]. Could be useful for: [context].' },
    { icon: '📋', label: 'Task', template: 'Need to: [action]. Due: [date/timeframe]. Notes: [context].' },
];

const API = `${API_BASE}/api/thought-weaver`;

// ── Helpers ──────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function dateGroup(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    if (date >= today) return 'Today';
    if (date >= yesterday) return 'Yesterday';
    if (date >= weekAgo) return 'This Week';
    return 'Earlier';
}

function confidenceLabel(c: number): string {
    if (c >= 0.8) return 'High';
    if (c >= 0.6) return 'Medium';
    return 'Low';
}

function bucketColor(bucket: string): string {
    const found = BUCKETS.find(b => b.id === bucket);
    return found ? found.color : '#6b7280';
}

function bucketIcon(bucket: string): string {
    const found = BUCKETS.find(b => b.id === bucket);
    return found ? found.icon : '📌';
}

// ── Component ────────────────────────────────────────────────────────

export default function ThoughtWeaver() {
    const [activeTab, setActiveTab] = useState<TabId>('capture');
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [captures, setCaptures] = useState<CaptureEntry[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [bucketItems, setBucketItems] = useState<Record<BucketId, BucketItem[]>>({ people: [], projects: [], ideas: [], admin: [] });
    const [activeBucket, setActiveBucket] = useState<BucketId | 'all'>('all');
    const [timeline, setTimeline] = useState<BucketItem[]>([]);
    const [timelineFilter, setTimelineFilter] = useState<BucketId | 'all'>('all');
    const [lastResult, setLastResult] = useState<{ filed_to: string; confidence: number; destination_name: string | null } | null>(null);
    const [seeded, setSeeded] = useState(false);
    const [resolveId, setResolveId] = useState<string | null>(null);

    // ── Data fetching ────────────────────────────────────────────────

    const fetchCaptures = useCallback(async () => {
        try {
            const res = await fetch(`${API}/captures?limit=20`);
            const json = await res.json();
            if (json.success) setCaptures(json.data);
        } catch { /* silent */ }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API}/stats`);
            const json = await res.json();
            if (json.success) setStats(json.data);
        } catch { /* silent */ }
    }, []);

    const fetchBucketItems = useCallback(async () => {
        try {
            const [p, pr, i, a] = await Promise.all(
                (['people', 'projects', 'ideas', 'admin'] as BucketId[]).map(t => fetch(`${API}/${t}`).then(r => r.json()))
            );
            setBucketItems({
                people: p.success ? p.data : [],
                projects: pr.success ? pr.data : [],
                ideas: i.success ? i.data : [],
                admin: a.success ? a.data : [],
            });
        } catch { /* silent */ }
    }, []);

    const fetchTimeline = useCallback(async () => {
        try {
            const res = await fetch(`${API}/timeline`);
            const json = await res.json();
            if (json.success) setTimeline(json.data);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchCaptures();
        fetchStats();
    }, [fetchCaptures, fetchStats]);

    useEffect(() => {
        if (activeTab === 'dashboard') { fetchBucketItems(); fetchStats(); }
        if (activeTab === 'timeline') fetchTimeline();
    }, [activeTab, fetchBucketItems, fetchStats, fetchTimeline]);

    // ── Actions ──────────────────────────────────────────────────────

    const handleCapture = async () => {
        if (!text.trim() || loading) return;
        setLoading(true);
        try {
            const res = await fetch(`${API}/capture`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.trim() }),
            });
            const json = await res.json();
            if (json.success) {
                setLastResult({ filed_to: json.data.filed_to, confidence: json.data.confidence, destination_name: json.data.destination_name });
                setText('');
                fetchCaptures();
                fetchStats();
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleSeed = async () => {
        await fetch(`${API}/seed`, { method: 'POST' });
        setSeeded(true);
        fetchCaptures();
        fetchStats();
        fetchBucketItems();
        fetchTimeline();
    };

    const handleDelete = async (table: string, id: string) => {
        await fetch(`${API}/${table}/${id}`, { method: 'DELETE' });
        fetchBucketItems();
        fetchStats();
        fetchTimeline();
    };

    const handleResolve = async (logId: string, destination: BucketId) => {
        await fetch(`${API}/resolve/${logId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination }),
        });
        setResolveId(null);
        fetchCaptures();
        fetchStats();
        fetchBucketItems();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleCapture(); }
    };

    const applyTemplate = (template: string) => { setText(template); };

    // ── Computed ─────────────────────────────────────────────────────

    const allBucketItems = useMemo(() => {
        if (activeBucket === 'all') return Object.entries(bucketItems).flatMap(([type, items]) => items.map(i => ({ ...i, type })));
        return bucketItems[activeBucket].map(i => ({ ...i, type: activeBucket }));
    }, [bucketItems, activeBucket]);

    const filteredTimeline = useMemo(() => {
        if (timelineFilter === 'all') return timeline;
        return timeline.filter(i => i.type === timelineFilter);
    }, [timeline, timelineFilter]);

    const groupedTimeline = useMemo(() => {
        const groups: Record<string, BucketItem[]> = {};
        for (const item of filteredTimeline) {
            const group = dateGroup(item.createdAt);
            if (!groups[group]) groups[group] = [];
            groups[group].push(item);
        }
        return groups;
    }, [filteredTimeline]);

    // ── Render ───────────────────────────────────────────────────────

    return (
        <div className="tw">
            {/* Header */}
            <div className="tw-header">
                <div className="tw-header__top">
                    <h2 className="tw-title">🧠 Thought Weaver</h2>
                    {stats && (
                        <div className="tw-stats-mini">
                            <span className="tw-stats-mini__item" style={{ color: '#D6FE51' }}>👤 {stats.activePeople}</span>
                            <span className="tw-stats-mini__item" style={{ color: '#60a5fa' }}>📁 {stats.activeProjects}</span>
                            <span className="tw-stats-mini__item" style={{ color: '#fbbf24' }}>💡 {stats.totalIdeas}</span>
                            <span className="tw-stats-mini__item" style={{ color: '#34d399' }}>📋 {stats.tasksDue}</span>
                        </div>
                    )}
                </div>
                <div className="tw-tabs">
                    {TABS.map(tab => (
                        <button key={tab.id} className={`tw-tab ${activeTab === tab.id ? 'tw-tab--active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── CAPTURE TAB ─── */}
            {activeTab === 'capture' && (
                <div className="tw-capture">
                    <div className="tw-capture__input-area">
                        <textarea
                            className="tw-capture__textarea"
                            placeholder="Drop a thought... meetings, ideas, tasks, people. AI will organize it."
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={3}
                        />
                        <div className="tw-capture__toolbar">
                            <div className="tw-templates">
                                {TEMPLATES.map(t => (
                                    <button key={t.label} className="tw-template-chip" onClick={() => applyTemplate(t.template)} title={t.label}>
                                        {t.icon}
                                    </button>
                                ))}
                            </div>
                            <button className="tw-capture__btn" onClick={handleCapture} disabled={!text.trim() || loading}>
                                {loading ? '⏳' : '🚀'} {loading ? 'Classifying...' : 'Capture'}
                            </button>
                        </div>
                    </div>

                    {/* Classification result toast */}
                    {lastResult && (
                        <div className="tw-result" style={{ borderLeftColor: bucketColor(lastResult.filed_to) }}>
                            <span className="tw-result__icon">{bucketIcon(lastResult.filed_to)}</span>
                            <div className="tw-result__text">
                                <strong>{lastResult.filed_to === 'needs_review' ? 'Needs Review' : `Filed → ${lastResult.destination_name}`}</strong>
                                <span className={`tw-confidence tw-confidence--${confidenceLabel(lastResult.confidence).toLowerCase()}`}>
                                    {confidenceLabel(lastResult.confidence)} ({Math.round(lastResult.confidence * 100)}%)
                                </span>
                            </div>
                            <button className="tw-result__close" onClick={() => setLastResult(null)}>✕</button>
                        </div>
                    )}

                    {/* Seed button */}
                    {captures.length === 0 && !seeded && (
                        <button className="tw-seed-btn" onClick={handleSeed}>🌱 Seed demo thoughts</button>
                    )}

                    {/* Recent captures */}
                    <div className="tw-recent">
                        <h3 className="tw-section-title">Recent Captures</h3>
                        {captures.length === 0 ? (
                            <div className="tw-empty">
                                <span className="tw-empty__icon">🧠</span>
                                <p>No thoughts yet. Start capturing!</p>
                            </div>
                        ) : (
                            <div className="tw-captures-list">
                                {captures.map(c => (
                                    <div key={c.id} className="tw-capture-card" style={{ borderLeftColor: bucketColor(c.filed_to) }}>
                                        <p className="tw-capture-card__text">{c.original_text}</p>
                                        <div className="tw-capture-card__meta">
                                            <span className="tw-badge" style={{ background: bucketColor(c.filed_to) + '22', color: bucketColor(c.filed_to) }}>
                                                {bucketIcon(c.filed_to)} {c.filed_to === 'needs_review' ? 'Review' : c.filed_to}
                                            </span>
                                            <span className="tw-confidence-mini">{Math.round(c.confidence * 100)}%</span>
                                            {c.status === 'needs_review' && (
                                                resolveId === c.id ? (
                                                    <div className="tw-resolve-picker">
                                                        {BUCKETS.map(b => (
                                                            <button key={b.id} className="tw-resolve-btn" style={{ color: b.color }} onClick={() => handleResolve(c.id, b.id)} title={b.label}>
                                                                {b.icon}
                                                            </button>
                                                        ))}
                                                        <button className="tw-resolve-cancel" onClick={() => setResolveId(null)}>✕</button>
                                                    </div>
                                                ) : (
                                                    <button className="tw-categorize-btn" onClick={() => setResolveId(c.id)}>Categorize</button>
                                                )
                                            )}
                                            <span className="tw-time">{timeAgo(c.createdAt)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── DASHBOARD TAB ─── */}
            {activeTab === 'dashboard' && (
                <div className="tw-dashboard">
                    {/* Stats bar */}
                    {stats && (
                        <div className="tw-stats-bar">
                            {[
                                { icon: '🧠', label: 'Captures', value: stats.totalCaptures, color: '#D6FE51' },
                                { icon: '📥', label: 'To Review', value: stats.pendingReviews, color: '#f97316', highlight: stats.pendingReviews > 0 },
                                { icon: '👤', label: 'People', value: stats.activePeople, color: '#D6FE51' },
                                { icon: '📁', label: 'Active', value: stats.activeProjects, color: '#60a5fa' },
                                { icon: '💡', label: 'Ideas', value: stats.totalIdeas, color: '#fbbf24' },
                                { icon: '📋', label: 'Due', value: stats.tasksDue, color: '#34d399', highlight: stats.tasksDue > 0 },
                            ].map(s => (
                                <div key={s.label} className={`tw-stat-card ${s.highlight ? 'tw-stat-card--highlight' : ''}`}>
                                    <span className="tw-stat-card__icon">{s.icon}</span>
                                    <span className="tw-stat-card__value" style={{ color: s.color }}>{s.value}</span>
                                    <span className="tw-stat-card__label">{s.label}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Bucket filter */}
                    <div className="tw-bucket-filter">
                        <button className={`tw-bucket-pill ${activeBucket === 'all' ? 'tw-bucket-pill--active' : ''}`} onClick={() => setActiveBucket('all')}>
                            All
                        </button>
                        {BUCKETS.map(b => (
                            <button key={b.id} className={`tw-bucket-pill ${activeBucket === b.id ? 'tw-bucket-pill--active' : ''}`}
                                style={activeBucket === b.id ? { background: b.color + '22', color: b.color, borderColor: b.color } : {}}
                                onClick={() => setActiveBucket(b.id)}>
                                {b.icon} {b.label}
                                <span className="tw-bucket-pill__count">{bucketItems[b.id].length}</span>
                            </button>
                        ))}
                    </div>

                    {/* Items list */}
                    <div className="tw-items-list">
                        {allBucketItems.length === 0 ? (
                            <div className="tw-empty"><span className="tw-empty__icon">📦</span><p>No items yet. Capture some thoughts!</p></div>
                        ) : (
                            allBucketItems.map(item => (
                                <div key={item.id} className="tw-item-card" style={{ borderLeftColor: bucketColor(item.type || '') }}>
                                    <div className="tw-item-card__header">
                                        <span className="tw-item-card__icon">{bucketIcon(item.type || '')}</span>
                                        <span className="tw-item-card__name">{item.name}</span>
                                        {item.status && <span className="tw-item-card__status">{item.status}</span>}
                                    </div>
                                    {(item.notes || item.context || item.one_liner) && (
                                        <p className="tw-item-card__detail">{item.one_liner || item.context || item.notes}</p>
                                    )}
                                    <div className="tw-item-card__footer">
                                        <div className="tw-item-card__tags">
                                            {item.tags?.map(t => <span key={t} className="tw-tag">#{t}</span>)}
                                        </div>
                                        <div className="tw-item-card__actions">
                                            <span className="tw-time">{timeAgo(item.createdAt)}</span>
                                            <button className="tw-delete-btn" onClick={() => handleDelete(item.type || '', item.id)} title="Delete">🗑</button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ─── TIMELINE TAB ─── */}
            {activeTab === 'timeline' && (
                <div className="tw-timeline">
                    <div className="tw-bucket-filter">
                        <button className={`tw-bucket-pill ${timelineFilter === 'all' ? 'tw-bucket-pill--active' : ''}`} onClick={() => setTimelineFilter('all')}>
                            All
                        </button>
                        {BUCKETS.map(b => (
                            <button key={b.id} className={`tw-bucket-pill ${timelineFilter === b.id ? 'tw-bucket-pill--active' : ''}`}
                                style={timelineFilter === b.id ? { background: b.color + '22', color: b.color, borderColor: b.color } : {}}
                                onClick={() => setTimelineFilter(b.id)}>
                                {b.icon} {b.label}
                            </button>
                        ))}
                    </div>

                    {Object.keys(groupedTimeline).length === 0 ? (
                        <div className="tw-empty"><span className="tw-empty__icon">🕐</span><p>No timeline entries yet.</p></div>
                    ) : (
                        Object.entries(groupedTimeline).map(([group, items]) => (
                            <div key={group} className="tw-timeline-group">
                                <h4 className="tw-timeline-group__title">{group}</h4>
                                <div className="tw-timeline-entries">
                                    {items.map(item => (
                                        <div key={item.id} className="tw-timeline-entry">
                                            <div className="tw-timeline-dot" style={{ background: bucketColor(item.type || '') }} />
                                            <div className="tw-timeline-content">
                                                <div className="tw-timeline-entry__header">
                                                    <span className="tw-badge" style={{ background: bucketColor(item.type || '') + '22', color: bucketColor(item.type || '') }}>
                                                        {bucketIcon(item.type || '')} {item.type}
                                                    </span>
                                                    <span className="tw-time">{timeAgo(item.createdAt)}</span>
                                                </div>
                                                <p className="tw-timeline-entry__name">{item.name}</p>
                                                {item.notes && <p className="tw-timeline-entry__notes">{item.notes}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
