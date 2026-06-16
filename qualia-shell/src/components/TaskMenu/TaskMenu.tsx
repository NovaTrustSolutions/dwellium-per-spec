import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Brain, Check } from 'lucide-react';
import './TaskMenu.css';

// The Kanban subview reuses the existing Task Board. Lazy at sub-component
// altitude (bare React.lazy per CLAUDE.md) so a chunk-load failure here never
// reloads the whole shell.
const TaskBoardView = lazy(() => import('../TaskBoard/TaskBoard'));

interface Task {
    id: string;
    title: string;
    description: string;
    source: string;
    projectId: string;
    urgency: 'high' | 'medium' | 'low';
    status: 'open' | 'in_progress' | 'done';
    createdAt: string;
    // AI fields (populated when AI organize is used)
    aiScore?: number;
    aiReason?: string;
    aiRank?: number;
}

const URGENCY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    high: { icon: '', label: 'High', color: '#ef4444' },
    medium: { icon: '', label: 'Medium', color: '#eab308' },
    low: { icon: '', label: 'Low', color: '#22c55e' },
};

const PROJECT_NAMES: Record<string, string> = {
    'proj-invoicing': 'Invoicing',
    'proj-msa': 'MSA Management',
    'proj-onboarding': 'Onboarding',
    'proj-gdpr': 'GDPR / Privacy',
    'proj-inventory': 'Inventory',
    'proj-brand-guidelines': 'Brand Guidelines',
    'proj-reports': 'Financial Reports',
    'proj-hive': 'The Hive',
    'proj-dashboard': 'AI-Dashboard369',
    'unrouted': 'Unrouted',
};

function normalizeAiViewTasks(tasks: Task[], urgencyFilter: string): Task[] {
    const visible = tasks.filter(task =>
        task.status !== 'done' && (urgencyFilter === 'all' || task.urgency === urgencyFilter)
    );

    return visible.map((task, index) => ({
        ...task,
        aiRank: index + 1
    }));
}

export default function TaskMenu() {
    const [tasks, setTasks] = useState<Task[]>([]);
    // List ⇄ Board (Kanban) subview. Persisted per-browser; read in an effect so
    // initial render stays SSR-safe (no localStorage during render).
    const [view, setView] = useState<'list' | 'board'>('list');
    useEffect(() => {
        try {
            const v = localStorage.getItem('dwellium:taskmenu-view');
            if (v === 'board' || v === 'list') setView(v);
        } catch { /* sandboxed */ }
    }, []);
    const chooseView = useCallback((v: 'list' | 'board') => {
        setView(v);
        try { localStorage.setItem('dwellium:taskmenu-view', v); } catch { /* sandboxed */ }
    }, []);
    const [sortBy, setSortBy] = useState<'urgency' | 'date' | 'ai'>('urgency');
    const [filterUrgency, setFilterUrgency] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
    const [reassignTarget, setReassignTarget] = useState<string | null>(null);

    // AI Organize state
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [aiRankedTasks, setAiRankedTasks] = useState<Task[]>([]);
    const [aiMethod, setAiMethod] = useState<string>('');

    // Gmail Sync state
    const [gmailSyncing, setGmailSyncing] = useState(false);
    const [gmailResult, setGmailResult] = useState<{ created: number; scanned: number } | null>(null);
    const [pendingFocusTaskId, setPendingFocusTaskId] = useState<string | null>(null);
    const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

    const fetchTasks = useCallback(async () => {
        try {
            const params = filterUrgency !== 'all' ? `?urgency=${filterUrgency}` : '';
            const res = await fetch(`/api/tasks${params}`);
            const data = await res.json();
            if (data.success) setTasks(data.data);
        } catch (err) {
            console.error('Failed to fetch tasks:', err);
        } finally {
            setLoading(false);
        }
    }, [filterUrgency]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Command Palette deep-link: focus a specific task in the list
    useEffect(() => {
        const onFocusTask = (event: Event) => {
            const detail = (event as CustomEvent<{ taskId?: string }>).detail;
            const taskId = detail?.taskId;
            if (!taskId) return;

            setReassignTarget(null);
            setFilterUrgency('all');
            setSortBy('date');
            setPendingFocusTaskId(taskId);
        };

        window.addEventListener('qualia-taskmenu-focus-task', onFocusTask);
        return () => window.removeEventListener('qualia-taskmenu-focus-task', onFocusTask);
    }, []);

    useEffect(() => {
        if (!pendingFocusTaskId) return;
        const visibleTasks = sortBy === 'ai' ? aiRankedTasks : tasks;
        if (!visibleTasks.some(task => task.id === pendingFocusTaskId)) return;

        const taskId = pendingFocusTaskId;
        setPendingFocusTaskId(null);
        setHighlightedTaskId(taskId);

        const scrollTimer = window.setTimeout(() => {
            const target = document.querySelector<HTMLElement>(`.task-card[data-task-id="${taskId}"]`);
            target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 60);

        const clearTimer = window.setTimeout(() => {
            setHighlightedTaskId(current => current === taskId ? null : current);
        }, 2200);

        return () => {
            window.clearTimeout(scrollTimer);
            window.clearTimeout(clearTimer);
        };
    }, [pendingFocusTaskId, tasks, aiRankedTasks, sortBy]);

    // Clear gmail result after 5s
    useEffect(() => {
        if (gmailResult) {
            const timer = setTimeout(() => setGmailResult(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [gmailResult]);

    // === AI Organize Handler ===
    const handleAiOrganize = useCallback(async (preserveSort = false) => {
        setAiAnalyzing(true);
        try {
            const body = filterUrgency !== 'all' ? { urgency: filterUrgency } : {};
            const res = await fetch('/api/tasks/ai-organize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                const ranked = Array.isArray(data.data)
                    ? normalizeAiViewTasks(data.data as Task[], filterUrgency)
                    : [];
                setAiRankedTasks(ranked);
                setAiMethod(data.meta?.method || 'heuristic');
                if (!preserveSort) setSortBy('ai');
            }
        } catch (err) {
            console.error('AI organize failed:', err);
        } finally {
            setAiAnalyzing(false);
        }
    }, [filterUrgency]);

    // Keep AI results aligned with the active urgency filter
    useEffect(() => {
        if (sortBy === 'ai') {
            void handleAiOrganize(true);
        }
    }, [filterUrgency, handleAiOrganize]);

    // === Gmail Sync Handler ===
    const handleGmailSync = async () => {
        setGmailSyncing(true);
        try {
            const res = await fetch('/api/tasks/gmail-sync', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setGmailResult({
                    created: data.meta?.tasksCreated || 0,
                    scanned: data.meta?.emailsScanned || 0
                });
                await fetchTasks(); // Refresh task list
                // If in AI mode, re-analyze
                if (sortBy === 'ai') {
                    await handleAiOrganize(true);
                }
            }
        } catch (err) {
            console.error('Gmail sync failed:', err);
        } finally {
            setGmailSyncing(false);
        }
    };

    const handleUrgencyChange = async (taskId: string, urgency: string) => {
        try {
            const res = await fetch(`/api/tasks/${taskId}/urgency`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urgency })
            });
            if (res.ok) {
                await fetchTasks();
                if (sortBy === 'ai') await handleAiOrganize(true);
            }
        } catch (err) {
            console.error('Urgency update failed:', err);
        }
    };

    const handleReassign = async (taskId: string, projectId: string) => {
        try {
            const res = await fetch(`/api/tasks/${taskId}/reassign`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId })
            });
            if (res.ok) {
                setReassignTarget(null);
                await fetchTasks();
                if (sortBy === 'ai') await handleAiOrganize(true);
            }
        } catch (err) {
            console.error('Reassign failed:', err);
        }
    };

    const handleStatusChange = async (taskId: string, status: string) => {
        try {
            const res = await fetch(`/api/tasks/${taskId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                await fetchTasks();
                if (sortBy === 'ai') await handleAiOrganize(true);
            }
        } catch (err) {
            console.error('Status update failed:', err);
        }
    };

    // Drag handlers for project reassignment
    const handleDragStart = (e: React.DragEvent, taskId: string) => {
        e.dataTransfer.setData('text/plain', taskId);
        e.dataTransfer.effectAllowed = 'move';
        setDraggedTaskId(taskId);
    };

    const handleDragEnd = () => {
        setDraggedTaskId(null);
    };

    // Sort tasks
    const sortedTasks = sortBy === 'ai' ? aiRankedTasks : [...tasks].sort((a, b) => {
        if (sortBy === 'urgency') {
            const urgOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
            return urgOrder[a.urgency] - urgOrder[b.urgency];
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Group by urgency for visual separation
    const highTasks = sortedTasks.filter(t => t.urgency === 'high');
    const mediumTasks = sortedTasks.filter(t => t.urgency === 'medium');
    const lowTasks = sortedTasks.filter(t => t.urgency === 'low');

    // AI Score badge color
    const getScoreColor = (score: number) => {
        if (score >= 80) return '#ef4444';
        if (score >= 60) return '#f97316';
        if (score >= 40) return '#eab308';
        if (score >= 20) return '#22c55e';
        return '#6b7280';
    };

    const aiMethodLabel = aiMethod === 'gemini+heuristic' ? 'hybrid' : (aiMethod || 'heuristic');

    const renderTaskCard = (task: Task) => (
        <div
            key={task.id}
            data-task-id={task.id}
            className={`task-card urgency-${task.urgency} ${draggedTaskId === task.id ? 'dragging' : ''} ${highlightedTaskId === task.id ? 'task-card--highlighted' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, task.id)}
            onDragEnd={handleDragEnd}
        >
            <div className="task-header">
                <div className="task-title-row">
                    {/* AI Rank Badge */}
                    {sortBy === 'ai' && task.aiRank && (
                        <span className="ai-rank-badge" style={{ '--score-color': getScoreColor(task.aiScore || 0) } as React.CSSProperties}>
                            #{task.aiRank}
                        </span>
                    )}
                    <span className="task-title">{task.title}</span>
                    {/* AI Score */}
                    {sortBy === 'ai' && task.aiScore !== undefined && (
                        <span
                            className="ai-score-badge"
                            style={{ '--score-color': getScoreColor(task.aiScore) } as React.CSSProperties}
                            title={task.aiReason || ''}
                        >
                            {task.aiScore}
                        </span>
                    )}
                    <select
                        className="urgency-select"
                        value={task.urgency}
                        onChange={(e) => handleUrgencyChange(task.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                </div>
                <p className="task-desc">{task.description}</p>
                {/* AI Reason */}
                {sortBy === 'ai' && task.aiReason && (
                    <p className="ai-reason">{task.aiReason}</p>
                )}
            </div>

            <div className="task-footer">
                <span
                    className="task-project"
                    onClick={(e) => {
                        e.stopPropagation();
                        setReassignTarget(reassignTarget === task.id ? null : task.id);
                    }}
                    title="Click to reassign project"
                >
                    {PROJECT_NAMES[task.projectId] || task.projectId}
                </span>

                <div className="task-status-btns">
                    {(['open', 'in_progress', 'done'] as const).map(s => (
                        <button
                            key={s}
                            className={`status-btn ${task.status === s ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, s); }}
                        >
                            {s === 'open' ? '○' : s === 'in_progress' ? '◐' : '●'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Inline project reassignment */}
            {reassignTarget === task.id && (
                <div className="reassign-picker" onClick={e => e.stopPropagation()}>
                    <p className="picker-header">Reassign to:</p>
                    <div className="picker-list">
                        {Object.entries(PROJECT_NAMES).filter(([k]) => k !== task.projectId && k !== 'unrouted').map(([id, name]) => (
                            <button
                                key={id}
                                className="picker-item"
                                onClick={() => handleReassign(task.id, id)}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    const displayTasks = sortBy === 'ai' ? aiRankedTasks : tasks;

    return (
        <div className="task-menu">
            {/* View toggle: List ⇄ Board (Kanban subview, reuses Task Board) */}
            <div className="task-viewtoggle" role="tablist" aria-label="Task view">
                <button role="tab" aria-selected={view === 'list'} className={`task-viewtoggle__btn ${view === 'list' ? 'is-active' : ''}`} onClick={() => chooseView('list')}>List</button>
                <button role="tab" aria-selected={view === 'board'} className={`task-viewtoggle__btn ${view === 'board' ? 'is-active' : ''}`} onClick={() => chooseView('board')}>▤ Board</button>
            </div>

            {view === 'board' ? (
                <div className="task-board-host">
                    <Suspense fallback={<div className="task-loading">Loading board…</div>}>
                        <TaskBoardView />
                    </Suspense>
                </div>
            ) : (
            <>
            {/* === AI Action Bar === */}
            <div className="task-ai-bar">
                <button
                    className={`ai-organize-btn ${aiAnalyzing ? 'analyzing' : ''} ${sortBy === 'ai' ? 'active' : ''}`}
                    onClick={() => { void handleAiOrganize(); }}
                    disabled={aiAnalyzing}
                    title="AI analyzes all tasks and ranks by importance"
                >
                    <span className="ai-organize-icon"><Brain size={14} /></span>
                    <span className="ai-organize-label">
                        {aiAnalyzing ? 'Analyzing...' : sortBy === 'ai' ? `AI Ranked (${aiMethodLabel})` : 'AI Organize'}
                    </span>
                    {aiAnalyzing && <span className="ai-spinner" />}
                </button>

                <button
                    className={`gmail-sync-btn ${gmailSyncing ? 'syncing' : ''}`}
                    onClick={handleGmailSync}
                    disabled={gmailSyncing}
                    title="Import tasks from Gmail inbox"
                >
                    <svg className="gmail-icon" viewBox="0 0 24 24" width="16" height="16">
                        <path fill="#EA4335" d="M1 5.64L12 13.5L23 5.64V18.5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5.64z" />
                        <path fill="#FBBC05" d="M1 5.64L1 18.5L5.5 14.5L1 5.64z" />
                        <path fill="#34A853" d="M23 5.64L23 18.5L18.5 14.5L23 5.64z" />
                        <path fill="#C5221F" d="M1 5.64L5.5 14.5L12 13.5V3.5L3 3.5A2 2 0 0 0 1 5.64z" />
                        <path fill="#4285F4" d="M23 5.64L18.5 14.5L12 13.5V3.5L21 3.5A2 2 0 0 1 23 5.64z" />
                    </svg>
                    <span>{gmailSyncing ? 'Syncing...' : 'Link Gmail'}</span>
                    {gmailSyncing && <span className="gmail-spinner" />}
                </button>
            </div>

            {/* Gmail sync result toast */}
            {gmailResult && (
                <div className="gmail-result-toast">
                    <span className="gmail-result-icon"><Check size={14} /></span>
                    <span>Imported <strong>{gmailResult.created}</strong> tasks from <strong>{gmailResult.scanned}</strong> emails</span>
                </div>
            )}

            {/* Controls */}
            <div className="task-controls">
                <div className="sort-group">
                    <label>Sort:</label>
                    <button
                        className={`sort-btn ${sortBy === 'urgency' ? 'active' : ''}`}
                        onClick={() => setSortBy('urgency')}
                    >
                        Urgency
                    </button>
                    <button
                        className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`}
                        onClick={() => setSortBy('date')}
                    >
                        Date
                    </button>
                    {aiRankedTasks.length > 0 && (
                        <button
                            className={`sort-btn sort-btn--ai ${sortBy === 'ai' ? 'active' : ''}`}
                            onClick={() => setSortBy('ai')}
                        >
                            AI
                        </button>
                    )}
                </div>

                <div className="filter-group">
                    {['all', 'high', 'medium', 'low'].map(u => (
                        <button
                            key={u}
                            className={`urgency-filter ${filterUrgency === u ? 'active' : ''}`}
                            onClick={() => setFilterUrgency(u)}
                        >
                            {u === 'all' ? 'All' : `${URGENCY_CONFIG[u].icon} ${URGENCY_CONFIG[u].label}`}
                        </button>
                    ))}
                </div>
            </div>

            {loading && <div className="task-loading">Loading tasks...</div>}

            <div className="task-list">
                {sortBy === 'ai' ? (
                    // AI ranked view — flat list ordered by importance
                    aiRankedTasks.length > 0 ? (
                        aiRankedTasks.map(renderTaskCard)
                    ) : (
                        <div className="task-empty">
                            <span className="empty-icon"><Brain size={14} /></span>
                            <p>Click "AI Organize" to analyze and rank your tasks</p>
                        </div>
                    )
                ) : sortBy === 'urgency' ? (
                    <>
                        {highTasks.length > 0 && (
                            <div className="urgency-group">
                                <h4 className="group-header high">High Priority ({highTasks.length})</h4>
                                {highTasks.map(renderTaskCard)}
                            </div>
                        )}
                        {mediumTasks.length > 0 && (
                            <div className="urgency-group">
                                <h4 className="group-header medium">Medium Priority ({mediumTasks.length})</h4>
                                {mediumTasks.map(renderTaskCard)}
                            </div>
                        )}
                        {lowTasks.length > 0 && (
                            <div className="urgency-group">
                                <h4 className="group-header low">Low Priority ({lowTasks.length})</h4>
                                {lowTasks.map(renderTaskCard)}
                            </div>
                        )}
                    </>
                ) : (
                    sortedTasks.map(renderTaskCard)
                )}

                {!loading && displayTasks.length === 0 && sortBy !== 'ai' && (
                    <div className="task-empty">
                        <span className="empty-icon"><Check size={14} /></span>
                        <p>No tasks yet — click "Link Gmail" to import from your inbox</p>
                    </div>
                )}
            </div>
            </>
            )}
        </div>
    );
}
