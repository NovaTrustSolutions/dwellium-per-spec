/**
 * TaskBoard — local-first Kanban widget (Phase 1).
 *
 * Columns (resizable) · cards that drag between columns (single OR the whole
 * bulk-selection) · auto-timestamp on entry/move · an activity drawer that
 * shows every action with its actor + time and lets you Undo (incl. "Undo last
 * AI action") and copy an AI report.
 *
 * State lives in taskBoardStore (per-user localStorage). Every mutation flows
 * through the audited, reversible applyAction path — so an AI editing the board
 * is timestamped, logged, and undoable exactly like a user edit.
 *
 * Phase 2+ (not yet): ARA/Stella/Lisa/custom routing + email, project /
 * sub-project timeline view, drag-drop file attachments, app-wide tagging.
 */
import { useContext, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { useHierarchy } from '../../context/HierarchyContext';
import {
    taskBoardStore, taskBoardUserIdHolder, taskBoardProjectIdHolder, loadBoardState,
    addCard, moveCard, moveCards, removeCard, editCard,
    addColumn, renameColumn, removeColumn, resizeColumn,
    undo, undoLastAi, aiFileBacklog, boardReport,
    assignCard, routeCard, addSubtask, attachToCard, removeAttachment, MAX_INLINE_ATTACHMENT,
    updateColumnLimits, updateColumnPolicies,
    type RouteResult,
} from './taskBoardStore';
import {
    cardsInColumn, actorLabel, cardTimeline, subtasksOf,
    type Urgency, type TaskCard, type Assignee, type BoardState,
} from './taskBoardModel';
import { BUILT_IN_TARGETS, describeRoute } from './taskRouting';
import { TagInput, useTaggedItems } from '../Tags/TagInput';
import { relatedByTags } from '../../lib/tagStore';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, ScatterChart, Scatter } from 'recharts';
import './TaskBoard.css';

const MIN_COL = 200;
const MAX_COL = 640;
const URGENCY_NEXT: Record<string, Urgency> = { low: 'medium', medium: 'high', high: 'low' };
const URGENCY_COLOR: Record<string, string> = { high: '#ef4444', medium: '#eab308', low: '#22c55e' };

function relTime(iso: string): string {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); return `${d}d ago`;
}

export default function TaskBoard() {
    const { hierarchy } = useHierarchy();
    const [activeProjectId, setActiveProjectId] = useState<string>('global');

    // Recursively collect all items of type 'project' from hierarchy
    const getProjects = (items: any[]): any[] => {
        const res: any[] = [];
        for (const item of items) {
            if (item.type === 'project') res.push(item);
            if (item.children) res.push(...getProjects(item.children));
        }
        return res;
    };
    const projects = getProjects(hierarchy);

    // Per-user store binding (set holder DURING render, before useSyncExternalStore)
    const userCtx = useContext(UserContext);
    taskBoardUserIdHolder.current = userCtx?.user?.id ?? null;
    taskBoardProjectIdHolder.current = activeProjectId;

    const board = useSyncExternalStore(taskBoardStore.subscribe, taskBoardStore.getSnapshot, taskBoardStore.getServerSnapshot);
    const columns = [...board.columns].sort((a, b) => a.order - b.order);

    // ── selection / drag UI state ──
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);
    const didDrag = useRef(false);
    const dragCounter = useRef<Record<string, number>>({});
    const [addingTo, setAddingTo] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [editingCol, setEditingCol] = useState<string | null>(null);
    const [editColTitle, setEditColTitle] = useState('');
    const [showAudit, setShowAudit] = useState(false);
    const [copied, setCopied] = useState(false);
    const addRef = useRef<HTMLInputElement>(null);
    // Phase 2: project view + assignment/routing
    const [openCardId, setOpenCardId] = useState<string | null>(null);
    const [assignFor, setAssignFor] = useState<string | null>(null);
    const [routeMsg, setRouteMsg] = useState<{ id: string; msg: string } | null>(null);

    // ── Save / Load backups ──
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const handleSaveBoard = () => {
        const dataStr = JSON.stringify(board, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const activeProjectName = activeProjectId === 'global' 
            ? 'Global' 
            : (projects.find(p => p.id === activeProjectId)?.name || activeProjectId);
        const exportFileDefaultName = `taskboard_project_${activeProjectName.replace(/\s+/g, '_')}.json`;
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const handleLoadBoard = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedBoard = JSON.parse(event.target?.result as string);
                if (Array.isArray(importedBoard?.columns) && Array.isArray(importedBoard?.cards)) {
                    loadBoardState(importedBoard);
                } else {
                    alert('Invalid file format. Must be a Dwellium task board backup.');
                }
            } catch (err) {
                alert('Error parsing JSON backup file.');
            }
        };
        reader.readAsText(file);
    };

    // ── Kanban System Additions State ──
    const [editingLimitsCol, setEditingLimitsCol] = useState<string | null>(null);
    const [showPoliciesCol, setShowPoliciesCol] = useState<string | null>(null);
    const [showMetrics, setShowMetrics] = useState(false);

    const [wipAlert, setWipAlert] = useState<{
        cardId?: string;
        cardIds?: string[];
        toColumnId: string;
        limit: number;
        count: number;
        onConfirm: () => void;
    } | null>(null);

    const [exitCriteriaCheck, setExitCriteriaCheck] = useState<{
        cardId?: string;
        cardIds?: string[];
        fromColumnId: string;
        toColumnId: string;
        policies: string[];
        onConfirm: () => void;
    } | null>(null);

    const initiateMoveCard = (cardId: string, toColumnId: string) => {
        const card = board.cards.find(c => c.id === cardId);
        if (!card) return;
        if (card.columnId === toColumnId) return;

        const executeMove = () => {
            const targetCol = board.columns.find(c => c.id === toColumnId);
            const targetCards = cardsInColumn(board.cards, toColumnId);
            if (targetCol?.maxWip !== undefined && targetCol.maxWip > 0 && targetCards.length >= targetCol.maxWip) {
                setWipAlert({
                    cardId,
                    toColumnId,
                    limit: targetCol.maxWip,
                    count: targetCards.length,
                    onConfirm: () => {
                        moveCard(cardId, toColumnId);
                        setWipAlert(null);
                    }
                });
            } else {
                moveCard(cardId, toColumnId);
            }
        };

        const sourceCol = board.columns.find(c => c.id === card.columnId);
        if (sourceCol?.policies && sourceCol.policies.length > 0) {
            setExitCriteriaCheck({
                cardId,
                fromColumnId: card.columnId,
                toColumnId,
                policies: sourceCol.policies,
                onConfirm: () => {
                    setExitCriteriaCheck(null);
                    executeMove();
                }
            });
        } else {
            executeMove();
        }
    };

    const initiateMoveCards = (cardIds: string[], toColumnId: string) => {
        if (cardIds.length === 0) return;
        const targetCol = board.columns.find(c => c.id === toColumnId);
        const targetCards = cardsInColumn(board.cards, toColumnId);

        const executeMove = () => {
            const incomingCount = cardIds.filter(id => {
                const c = board.cards.find(card => card.id === id);
                return c && c.columnId !== toColumnId;
            }).length;

            if (targetCol?.maxWip !== undefined && targetCol.maxWip > 0 && (targetCards.length + incomingCount) > targetCol.maxWip) {
                setWipAlert({
                    cardIds,
                    toColumnId,
                    limit: targetCol.maxWip,
                    count: targetCards.length,
                    onConfirm: () => {
                        moveCards(cardIds, toColumnId);
                        setWipAlert(null);
                    }
                });
            } else {
                moveCards(cardIds, toColumnId);
            }
        };

        const sourceColIds = new Set(cardIds.map(id => board.cards.find(c => c.id === id)?.columnId).filter(Boolean));
        const allPolicies: string[] = [];
        for (const colId of sourceColIds) {
            const col = board.columns.find(c => c.id === colId);
            if (col?.policies) {
                allPolicies.push(...col.policies);
            }
        }

        if (allPolicies.length > 0) {
            setExitCriteriaCheck({
                cardIds,
                fromColumnId: Array.from(sourceColIds)[0] || '',
                toColumnId,
                policies: Array.from(new Set(allPolicies)),
                onConfirm: () => {
                    setExitCriteriaCheck(null);
                    executeMove();
                }
            });
        } else {
            executeMove();
        }
    };

    const doRoute = async (cardId: string) => {
        const r: RouteResult = await routeCard(cardId);
        setRouteMsg({ id: cardId, msg: r.detail });
        setTimeout(() => setRouteMsg(m => (m?.id === cardId ? null : m)), 4000);
    };

    // ── column resize (live width via ref + forced re-render; persists on mouseup) ──
    const resize = useRef<{ colId: string; startX: number; w: number } | null>(null);
    const [, force] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        const move = (e: MouseEvent) => {
            const r = resize.current;
            if (!r) return;
            r.w = Math.max(MIN_COL, Math.min(MAX_COL, r.w + e.movementX));
            force();
        };
        const up = () => {
            const r = resize.current;
            if (r) { resizeColumn(r.colId, Math.round(r.w)); resize.current = null; force(); }
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, []);
    const startResize = (e: React.MouseEvent, colId: string, width: number) => {
        e.preventDefault();
        e.stopPropagation();
        resize.current = { colId, startX: e.clientX, w: width };
        force();
    };
    const widthOf = (colId: string, w: number) => (resize.current?.colId === colId ? resize.current.w : w);

    useEffect(() => { if (addingTo && addRef.current) addRef.current.focus(); }, [addingTo]);

    // ── selection helpers ──
    const toggleSel = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const clearSel = () => setSelected(new Set());

    // ── drag handlers ──
    const onDragStart = (e: React.DragEvent, id: string) => {
        didDrag.current = false;
        setDragId(id);
        dragCounter.current = {};
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    };
    const onDragOver = (e: React.DragEvent, colId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        didDrag.current = true;
    };
    const onDragEnter = (e: React.DragEvent, colId: string) => {
        e.preventDefault();
        dragCounter.current[colId] = (dragCounter.current[colId] || 0) + 1;
        if (dragOverCol !== colId) {
            setDragOverCol(colId);
        }
    };
    const onDragLeave = (e: React.DragEvent, colId: string) => {
        dragCounter.current[colId] = Math.max(0, (dragCounter.current[colId] || 0) - 1);
        if (dragCounter.current[colId] === 0) {
            setDragOverCol(prev => prev === colId ? null : prev);
        }
    };
    const onDragEnd = () => {
        setDragId(null);
        setDragOverCol(null);
        dragCounter.current = {};
    };
    const onDrop = (e: React.DragEvent, colId: string) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || dragId;
        setDragId(null);
        setDragOverCol(null);
        dragCounter.current = {};
        if (!id) return;
        // If the dragged card is part of a multi-selection, move the whole set.
        if (selected.has(id) && selected.size > 1) {
            initiateMoveCards([...selected], colId);
            clearSel();
        } else {
            initiateMoveCard(id, colId);
        }
    };

    // ── card actions ──
    const submitNewCard = (colId: string) => {
        const title = newTitle.trim();
        if (title) addCard({ title, columnId: colId });
        setNewTitle('');
        setAddingTo(null);
    };
    const cycleUrgency = (card: TaskCard) => {
        const cur = card.urgency ?? 'low';
        editCard(card.id, { urgency: URGENCY_NEXT[cur] });
    };

    // ── report copy ──
    const copyReport = async () => {
        const text = boardReport(true);
        try {
            if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
        } catch { /* ignore */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    const aiActionCount = board.audit.filter(e => e.actor.kind === 'ai' && !e.reversed && e.type !== 'UNDO').length;

    return (
        <div className={`tb-board ${dragId ? 'tb-board--dragging' : ''}`}>
            {/* ── Toolbar ── */}
            <div className="tb-toolbar">
                <span className="tb-toolbar__title">Task Board</span>

                {/* Project Selector */}
                <select
                    className="tb-project-select"
                    aria-label="Select active project board"
                    value={activeProjectId}
                    onChange={e => { setActiveProjectId(e.target.value); clearSel(); }}
                >
                    <option value="global">Global Board</option>
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>Project: {p.name}</option>
                    ))}
                </select>

                <span className="tb-toolbar__count">{board.cards.length} card{board.cards.length === 1 ? '' : 's'}</span>
                <span className="tb-spacer" />

                {/* Backup Actions */}
                <button className="tb-btn tb-btn--ghost" onClick={handleSaveBoard} title="Save/download task board backup">
                    Save Board
                </button>
                <button className="tb-btn tb-btn--ghost" onClick={() => fileInputRef.current?.click()} title="Load/restore task board from backup">
                    Load Board
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".json"
                    onChange={handleLoadBoard}
                />

                {selected.size > 0 && (
                    <div className="tb-bulk">
                        <span className="tb-bulk__count">{selected.size} selected</span>
                        <select
                            className="tb-bulk__move"
                            aria-label="Move selected cards to column"
                            value=""
                            onChange={e => { if (e.target.value) initiateMoveCards([...selected], e.target.value); }}
                        >
                            <option value="" disabled>Move to…</option>
                            {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                        <button className="tb-btn tb-btn--ghost" onClick={clearSel}>Clear</button>
                    </div>
                )}

                <button
                    className="tb-btn tb-btn--ai"
                    onClick={() => aiFileBacklog('ara')}
                    title="Local rule (not an LLM call): ARA files every Backlog card into To Do — reversible via Undo last AI"
                >
                    AI: file Backlog
                </button>
                <button className="tb-btn" onClick={() => setShowMetrics(m => !m)} aria-pressed={showMetrics}>
                    Metrics
                </button>
                <button className="tb-btn" onClick={() => setShowAudit(s => !s)} aria-pressed={showAudit}>
                    Activity ({board.audit.length})
                </button>
                <button className="tb-btn tb-btn--ghost" onClick={() => undo()} aria-label="Undo last action" title="Undo last action">↶ Undo</button>
            </div>

            <div className="tb-main">
                {/* ── Columns ── */}
                <div className="tb-columns">
                    {columns.map(col => {
                        const colCards = cardsInColumn(board.cards, col.id);
                        const w = widthOf(col.id, col.width);
                        const over = dragOverCol === col.id;

                        // Check limits for class highlights
                        const isExceeded = col.maxWip !== undefined && col.maxWip > 0 && colCards.length > col.maxWip;
                        const isStarved = col.minWip !== undefined && col.minWip > 0 && colCards.length < col.minWip;
                        
                        let colClass = 'tb-col';
                        if (over) colClass += ' tb-col--over';
                        if (isExceeded) colClass += ' tb-col--wip-exceeded';
                        if (isStarved) colClass += ' tb-col--wip-starvation';

                        return (
                            <div
                                key={col.id}
                                className={colClass}
                                style={{ width: w, minWidth: w, maxWidth: w }}
                                onDragOver={e => onDragOver(e, col.id)}
                                onDragEnter={e => onDragEnter(e, col.id)}
                                onDragLeave={e => onDragLeave(e, col.id)}
                                onDrop={e => onDrop(e, col.id)}
                            >
                                <div className="tb-col__head" style={{ position: 'relative' }}>
                                    {editingCol === col.id ? (
                                        <input
                                            className="tb-col__rename"
                                            autoFocus
                                            value={editColTitle}
                                            onChange={e => setEditColTitle(e.target.value)}
                                            onBlur={() => { if (editColTitle.trim()) renameColumn(col.id, editColTitle.trim()); setEditingCol(null); }}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') { if (editColTitle.trim()) renameColumn(col.id, editColTitle.trim()); setEditingCol(null); }
                                                if (e.key === 'Escape') setEditingCol(null);
                                            }}
                                        />
                                    ) : (
                                        <h4
                                            className="tb-col__title"
                                            onDoubleClick={() => { setEditingCol(col.id); setEditColTitle(col.title); }}
                                            title="Double-click to rename"
                                        >
                                            {col.title}
                                        </h4>
                                    )}

                                    {/* Policies & Limits buttons */}
                                    {col.policies && col.policies.length > 0 && (
                                        <button 
                                            className="tb-col__policy-btn"
                                            title="Explicit Policies"
                                            onClick={() => setShowPoliciesCol(showPoliciesCol === col.id ? null : col.id)}
                                        >📋</button>
                                    )}

                                    <button 
                                        className="tb-col__policy-btn"
                                        title="Column Settings & Limits"
                                        onClick={() => setEditingLimitsCol(editingLimitsCol === col.id ? null : col.id)}
                                    >⚙</button>

                                    {/* WIP limit indicator */}
                                    {(col.minWip !== undefined || col.maxWip !== undefined) ? (
                                        <span className={`tb-col__limit-badge ${isExceeded ? 'tb-col__limit-badge--exceeded' : isStarved ? 'tb-col__limit-badge--starved' : 'tb-col__limit-badge--normal'}`}
                                            title={`Limits (Min: ${col.minWip ?? '-'}, Max: ${col.maxWip ?? '-'})`}
                                        >
                                            {col.minWip !== undefined ? `${col.minWip}≤` : ''}
                                            {colCards.length}
                                            {col.maxWip !== undefined ? `≤${col.maxWip}` : ''}
                                        </span>
                                    ) : (
                                        <span className="tb-col__count">{colCards.length}</span>
                                    )}

                                    <button
                                        className="tb-icon-btn"
                                        aria-label={`Remove column ${col.title}`}
                                        title="Remove column (reversible)"
                                        onClick={() => removeColumn(col.id)}
                                    >×</button>

                                    {/* Render ColumnSettingsPopover */}
                                    {editingLimitsCol === col.id && (
                                        <ColumnSettingsPopover
                                            column={col}
                                            onClose={() => setEditingLimitsCol(null)}
                                        />
                                    )}

                                    {/* Render policies tooltip list */}
                                    {showPoliciesCol === col.id && col.policies && (
                                        <div className="tb-policy-popover" onClick={e => e.stopPropagation()}>
                                            <button className="tb-icon-btn tb-assign-pop__close" onClick={() => setShowPoliciesCol(null)}>×</button>
                                            <h5>Column Policies</h5>
                                            <ul>
                                                {col.policies.map((p, idx) => <li key={idx}>{p}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                <div className="tb-col__cards">
                                    {colCards.map(card => {
                                        const isSel = selected.has(card.id);
                                        const urg = card.urgency ?? 'low';
                                        return (
                                            <div
                                                key={card.id}
                                                className={`tb-card ${dragId === card.id ? 'tb-card--dragging' : ''} ${isSel ? 'tb-card--selected' : ''}`}
                                                style={{ borderLeftColor: URGENCY_COLOR[urg] }}
                                                draggable
                                                onDragStart={e => onDragStart(e, card.id)}
                                                onDragEnd={onDragEnd}
                                            >
                                                <div className="tb-card__top">
                                                    <input
                                                        type="checkbox"
                                                        className="tb-card__check"
                                                        checked={isSel}
                                                        onChange={() => toggleSel(card.id)}
                                                        aria-label={`Select ${card.title}`}
                                                    />
                                                    <span
                                                        className="tb-card__title tb-card__title--link"
                                                        onClick={() => setOpenCardId(card.id)}
                                                        style={{ cursor: 'pointer' }}
                                                        role="button"
                                                        tabIndex={0}
                                                        title="Open project view"
                                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenCardId(card.id); } }}
                                                    >{card.title}</span>
                                                    <button
                                                        className="tb-icon-btn tb-card__edit"
                                                        aria-label={`Advanced edit ${card.title}`}
                                                        title="Advanced Edit (subtasks, assignments)"
                                                        onClick={() => setOpenCardId(card.id)}
                                                    ></button>
                                                    <button
                                                        className="tb-icon-btn tb-card__remove"
                                                        aria-label={`Remove ${card.title}`}
                                                        title="Remove (reversible)"
                                                        onClick={() => removeCard(card.id)}
                                                    >×</button>
                                                </div>
                                                <div className="tb-card__meta">
                                                    <button
                                                        className="tb-urg"
                                                        style={{ color: URGENCY_COLOR[urg] }}
                                                        onClick={() => cycleUrgency(card)}
                                                        aria-label={`Urgency ${urg}, click to change`}
                                                        title="Click to cycle urgency"
                                                    >● {urg}</button>
                                                    <span className="tb-card__time" title={`Entered this column ${new Date(card.enteredColumnAt).toLocaleString()}`}>
                                                        {relTime(card.enteredColumnAt)}
                                                    </span>
                                                    {subtasksOf(board.cards, card.id).length > 0 && (
                                                        <span className="tb-card__badge" title="Sub-tasks">⊞ {subtasksOf(board.cards, card.id).length}</span>
                                                    )}
                                                    {(card.attachments?.length ?? 0) > 0 && (
                                                        <span className="tb-card__badge" title="Attachments">{card.attachments!.length}</span>
                                                    )}
                                                </div>
                                                <div className="tb-card__assign">
                                                    <button
                                                        className={`tb-assign-chip ${card.assignee ? 'tb-assign-chip--set' : ''}`}
                                                        onClick={() => setAssignFor(assignFor === card.id ? null : card.id)}
                                                        title="Assign / route this task"
                                                    >{card.assignee ? describeRoute(card.assignee) : '＋ Assign'}</button>
                                                    {card.assignee && (
                                                        <button
                                                            className="tb-send-btn"
                                                            onClick={() => doRoute(card.id)}
                                                            aria-label={`Send to ${describeRoute(card.assignee)}`}
                                                            title={card.assignee.kind === 'ai' ? 'Dispatch to the AI agent' : 'Compose an email draft'}
                                                        >Send</button>
                                                    )}
                                                </div>
                                                {assignFor === card.id && (
                                                    <AssigneePicker
                                                        onPick={(a) => { assignCard(card.id, a); setAssignFor(null); }}
                                                        onClose={() => setAssignFor(null)}
                                                    />
                                                )}
                                                {routeMsg?.id === card.id && (
                                                    <div className="tb-route-msg">{routeMsg.msg}</div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {addingTo === col.id ? (
                                        <div className="tb-add">
                                            <input
                                                ref={addRef}
                                                className="tb-add__input"
                                                value={newTitle}
                                                placeholder="Card title…"
                                                onChange={e => setNewTitle(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') submitNewCard(col.id);
                                                    if (e.key === 'Escape') { setAddingTo(null); setNewTitle(''); }
                                                }}
                                            />
                                            <div className="tb-add__actions">
                                                <button className="tb-btn tb-btn--primary" onClick={() => submitNewCard(col.id)}>Add</button>
                                                <button className="tb-btn tb-btn--ghost" onClick={() => { setAddingTo(null); setNewTitle(''); }} aria-label="Cancel"><X size={14} /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button className="tb-add__btn" onClick={() => { setAddingTo(col.id); setNewTitle(''); }}>+ Add a card</button>
                                    )}
                                </div>

                                {/* resize handle on the column's right edge */}
                                <div
                                    className="tb-col__resizer"
                                    role="separator"
                                    aria-label={`Resize column ${col.title}`}
                                    aria-orientation="vertical"
                                    onMouseDown={e => startResize(e, col.id, col.width)}
                                />
                            </div>
                        );
                    })}

                    <button className="tb-addcol" onClick={() => addColumn('New Column')} aria-label="Add column">＋ Column</button>
                </div>

                {/* ── Activity drawer ── */}
                {showAudit && (
                    <aside className="tb-audit">
                        <div className="tb-audit__head">
                            <span className="tb-audit__title">Activity log</span>
                            <button className="tb-icon-btn" aria-label="Close activity log" onClick={() => setShowAudit(false)}>×</button>
                        </div>
                        <div className="tb-audit__actions">
                            <button className="tb-btn tb-btn--ghost" onClick={() => undo()}>↶ Undo last</button>
                            <button className="tb-btn tb-btn--ghost" onClick={() => undoLastAi()} disabled={aiActionCount === 0} title="Reverse the most recent AI edit">↶ Undo last AI</button>
                            <button className="tb-btn tb-btn--ghost" onClick={copyReport}>{copied ? 'Copied' : '⧉ AI report'}</button>
                        </div>
                        <div className="tb-audit__list">
                            {board.audit.length === 0 && <p className="tb-audit__empty">No activity yet.</p>}
                            {[...board.audit].reverse().map(e => (
                                <div key={e.id} className={`tb-audit__item ${e.actor.kind === 'ai' ? 'tb-audit__item--ai' : ''} ${e.reversed ? 'tb-audit__item--reversed' : ''}`}>
                                    <span className="tb-audit__who">{actorLabel(e.actor)}</span>
                                    <span className="tb-audit__summary">{e.summary}</span>
                                    <span className="tb-audit__time">{relTime(e.ts)}</span>
                                </div>
                            ))}
                        </div>
                    </aside>
                )}

                {/* Metrics dashboard drawer */}
                {showMetrics && (
                    <MetricsDashboard
                        board={board}
                        onClose={() => setShowMetrics(false)}
                    />
                )}
            </div>

            {/* WIP warning modal */}
            {wipAlert && (
                <div className="tb-modal-backdrop" onClick={() => setWipAlert(null)}>
                    <div className="tb-modal-card" onClick={e => e.stopPropagation()}>
                        <h3>WIP Limit Exceeded</h3>
                        <p>
                            The target column has a maximum WIP limit of <strong>{wipAlert.limit}</strong>.
                            It currently contains <strong>{wipAlert.count}</strong> cards.
                            Proceeding will violate the WIP limits.
                        </p>
                        <div className="tb-modal-actions">
                            <button className="tb-btn tb-btn--ghost" onClick={() => setWipAlert(null)}>Cancel</button>
                            <button className="tb-btn tb-btn--primary" style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }} onClick={wipAlert.onConfirm}>
                                Override & Proceed
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Exit criteria verification modal */}
            {exitCriteriaCheck && (
                <ExitCriteriaModal
                    policies={exitCriteriaCheck.policies}
                    onConfirm={exitCriteriaCheck.onConfirm}
                    onCancel={() => setExitCriteriaCheck(null)}
                />
            )}

            {openCardId && (
                <ProjectView
                    board={board}
                    cardId={openCardId}
                    onOpenCard={setOpenCardId}
                    onClose={() => setOpenCardId(null)}
                />
            )}
        </div>
    );
}

// ── Assignee picker popover (ARA / Stella / Lisa / custom) ─────────
function AssigneePicker({ onPick, onClose }: { onPick: (a: Assignee | null) => void; onClose: () => void }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    return (
        <div className="tb-assign-pop" onClick={e => e.stopPropagation()}>
            <button className="tb-icon-btn tb-assign-pop__close" aria-label="Close assignee picker" onClick={onClose}>×</button>
            {BUILT_IN_TARGETS.map(t => (
                <button key={t.id} className="tb-assign-opt" onClick={() => onPick(t)}>
                    <span>{t.kind === 'ai' ? '' : ''} {t.label}</span>
                    <span className="tb-assign-opt__k">{t.kind === 'ai' ? 'AI agent' : 'email'}</span>
                </button>
            ))}
            <div className="tb-assign-custom">
                <input className="tb-assign-input" placeholder="Custom name" value={name} onChange={e => setName(e.target.value)} aria-label="Custom assignee name" />
                <input className="tb-assign-input" placeholder="email@addr (optional)" value={email} onChange={e => setEmail(e.target.value)} aria-label="Custom assignee email" />
                <button
                    className="tb-btn tb-btn--primary"
                    disabled={!name.trim()}
                    onClick={() => onPick({ kind: 'person', id: `custom-${name.trim().toLowerCase().replace(/\s+/g, '-')}`, label: name.trim(), email: email.trim() || undefined })}
                >Set</button>
            </div>
            <button className="tb-assign-opt tb-assign-opt--clear" onClick={() => onPick(null)}>Unassign</button>
        </div>
    );
}

function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── Project / sub-project view: timeline + sub-tasks + attachments ──
function ProjectView({ board, cardId, onOpenCard, onClose }: {
    board: BoardState; cardId: string; onOpenCard: (id: string) => void; onClose: () => void;
}) {
    const card = board.cards.find(c => c.id === cardId);
    const [title, setTitle] = useState(card?.title ?? '');
    const [desc, setDesc] = useState(card?.description ?? '');
    const [sub, setSub] = useState('');
    const [drag, setDrag] = useState(false);
    const [assignOpen, setAssignOpen] = useState(false);
    const [assignSubFor, setAssignSubFor] = useState<string | null>(null);
    const [routeMsg, setRouteMsg] = useState<string | null>(null);
    const taggedItems = useTaggedItems();

    // Re-seed local fields when switching to a different card (e.g. into a sub-project)
    useEffect(() => { setTitle(card?.title ?? ''); setDesc(card?.description ?? ''); }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!card) return null;
    const subs = subtasksOf(board.cards, cardId);
    const related = relatedByTags(taggedItems, 'task-board', cardId);
    const timeline = cardTimeline(board, cardId);
    const colName = board.columns.find(c => c.id === card.columnId)?.title ?? card.columnId;

    const onFiles = async (files: FileList | null) => {
        if (!files) return;
        for (const file of Array.from(files)) {
            if (file.size <= MAX_INLINE_ATTACHMENT) {
                const dataUrl = await new Promise<string | undefined>(res => {
                    const r = new FileReader();
                    r.onload = () => res(typeof r.result === 'string' ? r.result : undefined);
                    r.onerror = () => res(undefined);
                    r.readAsDataURL(file);
                });
                attachToCard(cardId, { name: file.name, size: file.size, type: file.type, dataUrl });
            } else {
                attachToCard(cardId, { name: file.name, size: file.size, type: file.type });
            }
        }
    };
    const doRoute = async () => { const r = await routeCard(cardId); setRouteMsg(r.detail); setTimeout(() => setRouteMsg(null), 4000); };
    const commitTitle = () => { const t = title.trim(); if (t && t !== card.title) editCard(cardId, { title: t }); };
    const commitDesc = () => { if (desc !== card.description) editCard(cardId, { description: desc }); };

    return (
        <div className="tb-pv-overlay" onClick={onClose}>
            <div className="tb-pv" onClick={e => e.stopPropagation()}>
                <div className="tb-pv__head">
                    <input className="tb-pv__title" value={title} onChange={e => setTitle(e.target.value)} onBlur={commitTitle} aria-label="Task title" />
                    <span className="tb-pv__col" title="Current column">{colName}</span>
                    <button className="tb-icon-btn" aria-label="Close project view" onClick={onClose}>×</button>
                </div>

                {card.parentId && (
                    <button className="tb-pv__parent" onClick={() => onOpenCard(card.parentId!)}>↑ Parent project</button>
                )}

                <div className="tb-pv__assign">
                    <span className="tb-pv__assign-label">Assigned:</span>
                    <button className={`tb-assign-chip ${card.assignee ? 'tb-assign-chip--set' : ''}`} onClick={() => setAssignOpen(o => !o)}>
                        {card.assignee ? describeRoute(card.assignee) : '＋ Assign'}
                    </button>
                    {card.assignee && <button className="tb-send-btn" onClick={doRoute}>Send</button>}
                    {assignOpen && <AssigneePicker onPick={a => { assignCard(cardId, a); setAssignOpen(false); }} onClose={() => setAssignOpen(false)} />}
                    {routeMsg && <span className="tb-route-msg tb-route-msg--inline">{routeMsg}</span>}
                </div>

                <div className="tb-pv__body">
                    <section className="tb-pv__sec">
                        <h4>Description</h4>
                        <textarea className="tb-pv__desc" value={desc} placeholder="Add details…" onChange={e => setDesc(e.target.value)} onBlur={commitDesc} />
                    </section>

                    <section className="tb-pv__sec">
                        <h4>Tags</h4>
                        <TagInput source="task-board" sourceId={cardId} title={card.title} />
                    </section>

                    <section className="tb-pv__sec">
                        <h4>Related by tags ({related.length})</h4>
                        {related.length === 0 ? (
                            <p className="tb-pv__rel-empty">Tag this card, then tag items in other apps with the same tag — they link here across the whole app.</p>
                        ) : (
                            <div className="tb-pv__rel">
                                {related.map(r => (
                                    <div key={r.id} className="tb-pv__rel-item">
                                        <span className="tb-pv__rel-src">{r.source}</span>
                                        <span className="tb-pv__rel-title" title={r.tags.map(t => `#${t}`).join(' ')}>{r.title}</span>
                                        <button className="tb-btn tb-btn--ghost" onClick={() => addCard({ title: r.title })} title="Add this linked item as a card on the board">＋ Add as card</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="tb-pv__sec">
                        <h4>Next steps ({subs.length})</h4>
                        <div className="tb-pv__subs">
                            {subs.map(s => (
                                <div key={s.id} className="tb-pv__sub">
                                    <span className="tb-pv__sub-dot" style={{ background: URGENCY_COLOR[s.urgency ?? 'low'] }} />
                                    <button className="tb-pv__sub-title" onClick={() => onOpenCard(s.id)} title="Open next step">{s.title}</button>
                                    <span className="tb-pv__sub-col">{board.columns.find(c => c.id === s.columnId)?.title}</span>
                                    <div className="tb-pv__sub-assign">
                                        <button
                                            className={`tb-assign-chip tb-assign-chip--sm ${s.assignee ? 'tb-assign-chip--set' : ''}`}
                                            onClick={() => setAssignSubFor(assignSubFor === s.id ? null : s.id)}
                                            title="Assign this next step to an owner"
                                            aria-label={`Assign next step: ${s.title}`}
                                        >
                                            {s.assignee ? describeRoute(s.assignee) : '＋ Assign'}
                                        </button>
                                        {assignSubFor === s.id && (
                                            <AssigneePicker
                                                onPick={a => { assignCard(s.id, a); setAssignSubFor(null); }}
                                                onClose={() => setAssignSubFor(null)}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="tb-pv__add-sub">
                            <input
                                className="tb-add__input" value={sub} placeholder="Add a next step…"
                                onChange={e => setSub(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && sub.trim()) { addSubtask(cardId, sub.trim()); setSub(''); } }}
                            />
                            <button className="tb-btn tb-btn--primary" disabled={!sub.trim()} onClick={() => { if (sub.trim()) { addSubtask(cardId, sub.trim()); setSub(''); } }}>Add</button>
                        </div>
                    </section>

                    <section className="tb-pv__sec">
                        <h4>Attachments ({card.attachments?.length ?? 0})</h4>
                        <div
                            className={`tb-pv__drop ${drag ? 'tb-pv__drop--over' : ''}`}
                            onDragOver={e => { e.preventDefault(); setDrag(true); }}
                            onDragLeave={() => setDrag(false)}
                            onDrop={e => { e.preventDefault(); setDrag(false); void onFiles(e.dataTransfer.files); }}
                        >
                            <span>Drag &amp; drop files here</span>
                            <span className="tb-pv__drop-note">≤ {Math.round(MAX_INLINE_ATTACHMENT / 1024)} KB stored locally; larger files keep name + metadata only</span>
                        </div>
                        <div className="tb-pv__atts">
                            {(card.attachments ?? []).map(a => (
                                <div key={a.id} className="tb-pv__att">
                                    <span className="tb-pv__att-name">{a.name}</span>
                                    <span className="tb-pv__att-size">{fmtBytes(a.size)}{a.dataUrl ? '' : ' · meta only'}</span>
                                    <button className="tb-icon-btn" aria-label={`Remove ${a.name}`} onClick={() => removeAttachment(cardId, a.id)}>×</button>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="tb-pv__sec">
                        <h4>Timeline ({timeline.length})</h4>
                        <div className="tb-pv__timeline">
                            {timeline.length === 0 && <p className="tb-audit__empty">No activity yet.</p>}
                            {timeline.map(e => (
                                <div key={e.id} className={`tb-tl ${e.actor.kind === 'ai' ? 'tb-tl--ai' : ''} ${e.reversed ? 'tb-tl--rev' : ''}`}>
                                    <span className="tb-tl__dot" />
                                    <span className="tb-tl__who">{actorLabel(e.actor)}</span>
                                    <span className="tb-tl__sum">{e.summary}</span>
                                    <span className="tb-tl__time">{new Date(e.ts).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

// ── ColumnSettingsPopover ─────────────────────────────────────────
function ColumnSettingsPopover({ column, onClose }: { column: any; onClose: () => void }) {
    const [minWip, setMinWip] = useState(column.minWip !== undefined ? String(column.minWip) : '');
    const [maxWip, setMaxWip] = useState(column.maxWip !== undefined ? String(column.maxWip) : '');
    const [policyText, setPolicyText] = useState(column.policies ? column.policies.join('\n') : '');
    const [title, setTitle] = useState(column.title);

    const handleSave = () => {
        if (title.trim()) renameColumn(column.id, title.trim());
        const minVal = minWip === '' ? undefined : parseInt(minWip, 10);
        const maxVal = maxWip === '' ? undefined : parseInt(maxWip, 10);
        updateColumnLimits(column.id, isNaN(minVal as number) ? undefined : minVal, isNaN(maxVal as number) ? undefined : maxVal);
        
        const policies = policyText.split('\n').map((p: string) => p.trim()).filter(Boolean);
        updateColumnPolicies(column.id, policies);
        onClose();
    };

    return (
        <div className="tb-col-settings-pop" onClick={e => e.stopPropagation()}>
            <button className="tb-icon-btn tb-assign-pop__close" onClick={onClose}>×</button>
            <h5>Column Settings</h5>
            
            <div className="tb-settings-group">
                <label>Column Name</label>
                <input className="tb-assign-input" value={title} onChange={e => setTitle(e.target.value)} />
            </div>

            <div className="tb-settings-row">
                <div className="tb-settings-group">
                    <label>Min WIP</label>
                    <input className="tb-assign-input" type="number" min="0" value={minWip} onChange={e => setMinWip(e.target.value)} />
                </div>
                <div className="tb-settings-group">
                    <label>Max WIP</label>
                    <input className="tb-assign-input" type="number" min="0" value={maxWip} onChange={e => setMaxWip(e.target.value)} />
                </div>
            </div>

            <div className="tb-settings-group">
                <label>Policies (one per line)</label>
                <textarea 
                    className="tb-assign-input" 
                    rows={4} 
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    value={policyText} 
                    onChange={e => setPolicyText(e.target.value)} 
                    placeholder="e.g. Test all work&#10;Complete definition of done"
                />
            </div>

            <button className="tb-btn tb-btn--primary" onClick={handleSave}>Save Settings</button>
        </div>
    );
}

// ── ExitCriteriaModal ──────────────────────────────────────────────
function ExitCriteriaModal({ policies, onConfirm, onCancel }: { policies: string[]; onConfirm: () => void; onCancel: () => void }) {
    const [checked, setChecked] = useState<Record<number, boolean>>({});
    
    const allChecked = policies.every((_, idx) => checked[idx]);

    return (
        <div className="tb-modal-backdrop" onClick={onCancel}>
            <div className="tb-modal-card tb-modal-card--exit" onClick={e => e.stopPropagation()}>
                <h3>Column Exit Criteria Enforced</h3>
                <p>
                    Please verify that you have completed the required agreements for the source column before moving these card(s):
                </p>
                <div className="tb-policy-checklist">
                    {policies.map((p, idx) => (
                        <label key={idx} className="tb-policy-check-item">
                            <input 
                                type="checkbox" 
                                checked={!!checked[idx]} 
                                onChange={e => setChecked(prev => ({ ...prev, [idx]: e.target.checked }))} 
                            />
                            <span>{p}</span>
                        </label>
                    ))}
                </div>
                <div className="tb-modal-actions">
                    <button className="tb-btn tb-btn--ghost" onClick={onCancel}>Cancel</button>
                    <button className="tb-btn tb-btn--primary" disabled={!allChecked} onClick={onConfirm}>
                        Move Card
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── MetricsDashboard ───────────────────────────────────────────────
function MetricsDashboard({ board, onClose }: { board: BoardState; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<'wip' | 'throughput' | 'age' | 'times'>('wip');

    const activeColumns = board.columns.filter(c => c.id !== 'backlog' && c.id !== 'done');
    const activeCards = board.cards.filter(c => c.columnId !== 'backlog' && c.columnId !== 'done');
    const completedCards = board.cards.filter(c => c.columnId === 'done');

    // 1. WIP Stats
    const totalWIP = activeCards.length;
    let starvedCount = 0;
    let exceededCount = 0;
    
    activeColumns.forEach(col => {
        const count = board.cards.filter(c => c.columnId === col.id).length;
        if (col.minWip !== undefined && count < col.minWip) starvedCount++;
        if (col.maxWip !== undefined && count > col.maxWip) exceededCount++;
    });

    // 2. Throughput calculation (grouped by day for the last 7 days)
    const getThroughputData = () => {
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return {
                dateStr: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                dateKey: d.toDateString(),
                count: 0
            };
        }).reverse();

        completedCards.forEach(card => {
            const cardDate = new Date(card.enteredColumnAt).toDateString();
            const dayBucket = last7Days.find(d => d.dateKey === cardDate);
            if (dayBucket) {
                dayBucket.count++;
            }
        });

        const totalCompleted = completedCards.length;
        const avgCompletedPerWeek = totalCompleted > 0 ? (totalCompleted / 4).toFixed(1) : '0';

        return { data: last7Days, avg: avgCompletedPerWeek };
    };

    const throughput = getThroughputData();

    // 3. Work Item Age
    const getWorkItemAgeData = () => {
        return activeCards.map(card => {
            const entered = new Date(card.enteredColumnAt).getTime();
            const ageMs = Date.now() - entered;
            const ageDays = (ageMs / (1000 * 60 * 60 * 24)).toFixed(1);
            const colTitle = board.columns.find(c => c.id === card.columnId)?.title ?? card.columnId;
            return {
                id: card.id,
                title: card.title,
                column: colTitle,
                age: parseFloat(ageDays)
            };
        }).sort((a, b) => b.age - a.age);
    };

    const ageData = getWorkItemAgeData();

    // 4. Lead & Cycle Time
    const getTimesData = () => {
        const data = completedCards.map((card, idx) => {
            const created = new Date(card.createdAt).getTime();
            const completed = new Date(card.enteredColumnAt).getTime();
            const leadTimeHrs = Math.max(0, (completed - created) / (1000 * 60 * 60));

            // Find transition to active
            const transitions = board.audit.filter(e => e.cardId === card.id && (e.type === 'MOVE_CARD' || e.type === 'MOVE_CARDS'));
            let activeTime = created;
            for (const t of transitions) {
                if (t.summary.includes('→ To Do') || t.summary.includes('→ In Progress') || t.summary.includes('→ Review') || t.summary.includes('→ Done')) {
                    activeTime = new Date(t.ts).getTime();
                    break;
                }
            }
            const cycleTimeHrs = Math.max(0, (completed - activeTime) / (1000 * 60 * 60));

            return {
                index: idx + 1,
                title: card.title,
                leadTime: parseFloat((leadTimeHrs / 24).toFixed(1)), // days
                cycleTime: parseFloat((cycleTimeHrs / 24).toFixed(1)) // days
            };
        });

        const avgLead = data.length > 0 ? (data.reduce((sum, item) => sum + item.leadTime, 0) / data.length).toFixed(1) : '0';
        const avgCycle = data.length > 0 ? (data.reduce((sum, item) => sum + item.cycleTime, 0) / data.length).toFixed(1) : '0';

        return { data, avgLead, avgCycle };
    };

    const times = getTimesData();

    return (
        <aside className="tb-metrics-drawer">
            <div className="tb-metrics-drawer__head">
                <span className="tb-metrics-drawer__title">Kanban System Metrics</span>
                <button className="tb-icon-btn" onClick={onClose} aria-label="Close metrics dashboard">×</button>
            </div>
            
            <div className="tb-metrics-tabs">
                <button 
                    className={`tb-metrics-tab-btn ${activeTab === 'wip' ? 'tb-metrics-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('wip')}
                >WIP Status</button>
                <button 
                    className={`tb-metrics-tab-btn ${activeTab === 'throughput' ? 'tb-metrics-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('throughput')}
                >Throughput</button>
                <button 
                    className={`tb-metrics-tab-btn ${activeTab === 'age' ? 'tb-metrics-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('age')}
                >Item Age</button>
                <button 
                    className={`tb-metrics-tab-btn ${activeTab === 'times' ? 'tb-metrics-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('times')}
                >Cycle &amp; Lead</button>
            </div>

            <div className="tb-metrics-body">
                {activeTab === 'wip' && (
                    <>
                        <div className="tb-metrics-grid">
                            <div className="tb-metrics-card">
                                <span className="tb-metrics-card__title">Total WIP</span>
                                <span className="tb-metrics-card__value">{totalWIP}</span>
                                <span className="tb-metrics-card__sub">Cards currently in flight</span>
                            </div>
                            <div className="tb-metrics-card">
                                <span className="tb-metrics-card__title">WIP Health</span>
                                <span className="tb-metrics-card__value">
                                    {exceededCount > 0 ? 'Warning' : starvedCount > 0 ? 'Starvation' : 'Healthy'}
                                </span>
                                <span className="tb-metrics-card__sub">
                                    {exceededCount} Over / {starvedCount} Starved
                                </span>
                            </div>
                        </div>

                        <div className="tb-metrics-section">
                            <h4>Current Columns WIP</h4>
                            <div className="tb-metrics-age-table">
                                <div className="tb-metrics-age-row tb-metrics-age-row--head">
                                    <span>Column</span>
                                    <span>Limits (Min/Max)</span>
                                    <span style={{ textAlign: 'right' }}>Active Cards</span>
                                </div>
                                {board.columns.map(col => {
                                    const count = board.cards.filter(c => c.columnId === col.id).length;
                                    const min = col.minWip !== undefined ? col.minWip : '-';
                                    const max = col.maxWip !== undefined ? col.maxWip : '-';
                                    return (
                                        <div key={col.id} className="tb-metrics-age-row">
                                            <span className="tb-metrics-age-name">{col.title}</span>
                                            <span>{min} / {max}</span>
                                            <span className="tb-metrics-age-value" style={{ 
                                                color: col.maxWip && count > col.maxWip ? '#ef4444' : col.minWip && count < col.minWip ? '#3b82f6' : 'var(--accent)'
                                            }}>{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'throughput' && (
                    <>
                        <div className="tb-metrics-card">
                            <span className="tb-metrics-card__title">Completed Tasks</span>
                            <span className="tb-metrics-card__value">{completedCards.length}</span>
                            <span className="tb-metrics-card__sub">All-time throughput</span>
                        </div>

                        <div className="tb-metrics-section">
                            <h4>Daily Throughput (Last 7 Days)</h4>
                            <div className="tb-chart-container">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={throughput.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                        <XAxis dataKey="dateStr" stroke="#666" fontSize={10} tickLine={false} />
                                        <YAxis stroke="#666" fontSize={10} tickLine={false} allowDecimals={false} />
                                        <ChartTooltip 
                                            contentStyle={{ background: '#1c1c1c', borderColor: '#333', color: '#fff', fontSize: '11px', borderRadius: '6px' }}
                                        />
                                        <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'age' && (
                    <div className="tb-metrics-section" style={{ flex: 1 }}>
                        <h4>Active Work Item Age</h4>
                        {ageData.length === 0 ? (
                            <p style={{ fontSize: '12px', color: '#888', margin: '10px 0' }}>No active items in flight.</p>
                        ) : (
                            <div className="tb-metrics-age-table" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                <div className="tb-metrics-age-row tb-metrics-age-row--head">
                                    <span>Task Title</span>
                                    <span>Column</span>
                                    <span style={{ textAlign: 'right' }}>Age (Days)</span>
                                </div>
                                {ageData.map(item => (
                                    <div key={item.id} className="tb-metrics-age-row">
                                        <span className="tb-metrics-age-name" title={item.title}>{item.title}</span>
                                        <span className="tb-metrics-age-col">{item.column}</span>
                                        <span className="tb-metrics-age-value">{item.age}d</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'times' && (
                    <>
                        <div className="tb-metrics-grid">
                            <div className="tb-metrics-card">
                                <span className="tb-metrics-card__title">Average Lead Time</span>
                                <span className="tb-metrics-card__value">{times.avgLead}d</span>
                                <span className="tb-metrics-card__sub">From creation to completion</span>
                            </div>
                            <div className="tb-metrics-card">
                                <span className="tb-metrics-card__title">Average Cycle Time</span>
                                <span className="tb-metrics-card__value">{times.avgCycle}d</span>
                                <span className="tb-metrics-card__sub">From start to completion</span>
                            </div>
                        </div>

                        <div className="tb-metrics-section">
                            <h4>Cycle Time Scatter Plot</h4>
                            {times.data.length === 0 ? (
                                <p style={{ fontSize: '12px', color: '#888', margin: '10px 0' }}>No completed items to analyze.</p>
                            ) : (
                                <div className="tb-chart-container">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                            <XAxis type="number" dataKey="index" name="Item" stroke="#666" fontSize={10} tickLine={false} />
                                            <YAxis type="number" dataKey="cycleTime" name="Cycle Time" unit="d" stroke="#666" fontSize={10} tickLine={false} />
                                            <ChartTooltip 
                                                cursor={{ strokeDasharray: '3 3' }}
                                                contentStyle={{ background: '#1c1c1c', borderColor: '#333', color: '#fff', fontSize: '11px', borderRadius: '6px' }}
                                            />
                                            <Scatter name="Tasks" data={times.data} fill="var(--accent)" />
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
}
