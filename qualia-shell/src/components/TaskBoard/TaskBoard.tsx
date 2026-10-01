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
import { useContext, useEffect, useId, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { ClipboardList, Clock, FileText, Paperclip, Send, Settings, Sparkles, User, X } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { useHierarchy } from '../../context/HierarchyContext';
import type { HierarchyItem } from '../../data/types';
import { useAnnounce, useFocusTrap, useTabNavigation } from '../../hooks/useA11y';
import {
    taskBoardStore, taskBoardUserIdHolder, taskBoardProjectIdHolder, loadBoardState,
    captureBoard, taskBoardSaveError,
    addCard, moveCard, moveCards, removeCard, editCard,
    addColumn, renameColumn, removeColumn, resizeColumn,
    undo, undoLastAi, aiFileBacklog, boardReport,
    assignCard, routeCard, addSubtask, attachToCard, removeAttachment, MAX_INLINE_ATTACHMENT,
    updateColumnLimits, updateColumnPolicies,
    type RouteResult,
} from './taskBoardStore';
import {
    cardsInColumn, actorLabel, cardTimeline, subtasksOf, lastReversible,
    type Urgency, type TaskCard, type Assignee, type BoardState, type BoardColumn,
} from './taskBoardModel';
import { BUILT_IN_TARGETS, describeRoute } from './taskRouting';
import { TagInput, useTaggedItems } from '../Tags/TagInput';
import { relatedByTags } from '../../lib/tagStore';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, ScatterChart, Scatter } from 'recharts';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { useWidgetMemory } from '../../lib/widgetMemory';
import './TaskBoard.css';

const MIN_COL = 200;
const MAX_COL = 640;
const URGENCY_NEXT: Record<string, Urgency> = { low: 'medium', medium: 'high', high: 'low' };
const URGENCY_COLOR: Record<string, string> = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' };
const KEY_RESIZE_STEP = 16;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
    usePerUserIdentity();
    // Plan 055 phase 2 — the active project board and open card reopen where
    // they were left (no filter/swimlane state exists on this board; the
    // project picker + open card ARE its view state). Stale ids fall back.
    const [mem, patchMem] = useWidgetMemory('task-board', {
        activeProjectId: 'global',
        openCardId: null as string | null,
    });
    const setActiveProjectId = (id: string): void => patchMem({ activeProjectId: id });
    const announce = useAnnounce();

    // Recursively collect all items of type 'project' from hierarchy
    const getProjects = (items: HierarchyItem[]): HierarchyItem[] => {
        const res: HierarchyItem[] = [];
        for (const item of items) {
            if (item.type === 'project') res.push(item);
            if (item.children) res.push(...getProjects(item.children));
        }
        return res;
    };
    const projects = getProjects(hierarchy);
    // A remembered project that is gone falls back to Global (only judged once the project list has loaded).
    const activeProjectId = mem.activeProjectId !== 'global' && projects.length > 0 && !projects.some(p => p.id === mem.activeProjectId)
        ? 'global' : mem.activeProjectId;

    // Per-user store binding (set holder DURING render, before useSyncExternalStore)
    const userCtx = useContext(UserContext);
    const userId = userCtx?.user?.id ?? null;
    taskBoardUserIdHolder.current = userId;
    taskBoardProjectIdHolder.current = activeProjectId;

    const board = useSyncExternalStore(taskBoardStore.subscribe, taskBoardStore.getSnapshot, taskBoardStore.getServerSnapshot);
    const saveError = useSyncExternalStore(taskBoardSaveError.subscribe, taskBoardSaveError.getSnapshot, taskBoardSaveError.getServerSnapshot);

    // Each project board has its own server object (plan 079): pull the one now on screen. Fire-and-forget.
    useEffect(() => {
        void taskBoardStore.hydrate().then(() => taskBoardStore.migrate()).catch(() => { /* sync failures show in SyncStatusPill */ });
    }, [userId, activeProjectId]);
    const columns = [...board.columns].sort((a, b) => a.order - b.order);

    // ── selection / drag UI state ──
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);
    const dragCounter = useRef<Record<string, number>>({});
    const [addingTo, setAddingTo] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [editingCol, setEditingCol] = useState<string | null>(null);
    const [editColTitle, setEditColTitle] = useState('');
    const [showAudit, setShowAudit] = useState(false);
    const [copied, setCopied] = useState(false);
    const addRef = useRef<HTMLInputElement>(null);
    const renameRef = useRef<HTMLInputElement>(null);
    // Phase 2: project view + assignment/routing
    // Restored open card only counts while the card still exists on the board.
    const openCardId = mem.openCardId && board.cards.some(c => c.id === mem.openCardId) ? mem.openCardId : null;
    const setOpenCardId = (id: string | null): void => patchMem({ openCardId: id });
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
        e.target.value = ''; // the same backup can be chosen again
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedBoard = JSON.parse(event.target?.result as string);
                if (Array.isArray(importedBoard?.columns) && Array.isArray(importedBoard?.cards)) {
                    // ponytail: native confirm; swap for an in-app dialog if the shell ever blocks window.confirm
                    if (!window.confirm('Replace this board with the backup file? Undo can restore the current board.')) return;
                    loadBoardState(importedBoard);
                    announce('Board replaced from the backup file. Undo is available.');
                } else {
                    alert('Invalid file format. Must be a Dwellium task board backup.');
                }
            } catch {
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

    const colTitle = (id: string) => board.columns.find(c => c.id === id)?.title ?? id;
    const commitMove = (cardId: string, toColumnId: string) => {
        const title = board.cards.find(c => c.id === cardId)?.title ?? 'card';
        moveCard(cardId, toColumnId);
        announce(`Moved ${title} to ${colTitle(toColumnId)}`);
    };
    const commitMoves = (cardIds: string[], toColumnId: string) => {
        const n = new Set(cardIds.filter(id => { const c = board.cards.find(x => x.id === id); return c && c.columnId !== toColumnId; })).size;
        if (n === 0) return;
        moveCards(cardIds, toColumnId);
        announce(`Moved ${n} card${n === 1 ? '' : 's'} to ${colTitle(toColumnId)}`);
    };
    // Undo buttons: announce the entry the undo just appended (same snapshot = nothing to undo).
    const runAndAnnounce = (fn: () => BoardState) => {
        const before = taskBoardStore.getSnapshot();
        const after = fn();
        if (after !== before) announce(after.audit[after.audit.length - 1]?.summary ?? 'Undone');
    };

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
                        commitMove(cardId, toColumnId);
                        setWipAlert(null);
                    }
                });
            } else {
                commitMove(cardId, toColumnId);
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
                        commitMoves(cardIds, toColumnId);
                        setWipAlert(null);
                    }
                });
            } else {
                commitMoves(cardIds, toColumnId);
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
        announce(r.detail);
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

    const keyResize = (e: React.KeyboardEvent, col: BoardColumn) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        resizeColumn(col.id, widthOf(col.id, col.width) + dir * KEY_RESIZE_STEP); // the model clamps to 200–640
    };

    useEffect(() => { if (addingTo && addRef.current) addRef.current.focus(); }, [addingTo]);
    useEffect(() => { if (editingCol && renameRef.current) renameRef.current.focus(); }, [editingCol]);

    // Another board or account: transient UI state belongs to the one we left.
    useEffect(() => {
        setAddingTo(null); setNewTitle(''); setEditingCol(null); setEditColTitle('');
        setEditingLimitsCol(null); setShowPoliciesCol(null); setAssignFor(null); setRouteMsg(null);
        setWipAlert(null); setExitCriteriaCheck(null);
        setSelected(prev => (prev.size ? new Set() : prev));
    }, [userId, activeProjectId]);

    // ── selection helpers ──
    const toggleSel = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const clearSel = () => setSelected(new Set());

    // ── drag handlers ──
    const onDragStart = (e: React.DragEvent, id: string) => {
        setDragId(id);
        dragCounter.current = {};
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    };
    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
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
    const canUndo = lastReversible(board) !== null;

    const onRemoveCard = (card: TaskCard) => {
        removeCard(card.id);
        announce(`Removed ${card.title}. Undo is available.`);
    };
    const onRemoveColumn = (col: BoardColumn, cardCount: number) => {
        // ponytail: native confirm; swap for an in-app dialog if the shell ever blocks window.confirm
        if (cardCount > 0 && !window.confirm(`Remove column "${col.title}" and its ${cardCount} card(s)? Undo can restore them.`)) return;
        removeColumn(col.id);
        announce(`Removed column ${col.title}. Undo is available.`);
    };

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
                    onChange={e => setActiveProjectId(e.target.value)}
                >
                    <option value="global">Global Board</option>
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>Project: {p.name}</option>
                    ))}
                </select>

                <span className="tb-toolbar__count">{board.cards.length} card{board.cards.length === 1 ? '' : 's'}</span>
                {saveError && <span className="tb-toolbar__error" role="alert">{saveError}</span>}
                <span className="tb-spacer" />

                {/* Backup Actions */}
                <button className="btn-ghost tb-btn" onClick={handleSaveBoard} title="Save/download task board backup">
                    Save Board
                </button>
                <button className="btn-ghost tb-btn" onClick={() => fileInputRef.current?.click()} title="Load/restore task board from backup">
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
                            onChange={e => { if (e.target.value) { initiateMoveCards([...selected], e.target.value); clearSel(); } }}
                        >
                            <option value="" disabled>Move to…</option>
                            {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                        <button className="btn-ghost tb-btn" onClick={clearSel}>Clear</button>
                    </div>
                )}

                <button
                    className="btn-secondary tb-btn tb-btn--ai"
                    onClick={() => runAndAnnounce(() => aiFileBacklog('ara'))}
                    title="Local rule (not an LLM call): ARA files every Backlog card into To Do — reversible via Undo last AI"
                >
                    <Sparkles size={14} aria-hidden /> AI: file Backlog
                </button>
                <button className="btn-secondary tb-btn" onClick={() => setShowMetrics(m => !m)} aria-pressed={showMetrics}>
                    Metrics
                </button>
                <button className="btn-secondary tb-btn" onClick={() => setShowAudit(s => !s)} aria-pressed={showAudit}>
                    Activity ({board.audit.length})
                </button>
                <button className="btn-ghost tb-btn" onClick={() => runAndAnnounce(() => undo())} disabled={!canUndo} aria-label="Undo last action" title="Undo last action">↶ Undo</button>
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
                                onDragOver={onDragOver}
                                onDragEnter={e => onDragEnter(e, col.id)}
                                onDragLeave={e => onDragLeave(e, col.id)}
                                onDrop={e => onDrop(e, col.id)}
                            >
                                <div className="tb-col__head" style={{ position: 'relative' }}>
                                    {editingCol === col.id ? (
                                        <input
                                            ref={renameRef}
                                            className="tb-col__rename"
                                            aria-label={`Rename column ${col.title}`}
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
                                            aria-label="Explicit Policies"
                                            onClick={() => setShowPoliciesCol(showPoliciesCol === col.id ? null : col.id)}
                                        ><ClipboardList size={14} aria-hidden /></button>
                                    )}

                                    <button
                                        className="tb-col__policy-btn"
                                        title="Column Settings & Limits"
                                        aria-label="Column Settings & Limits"
                                        onClick={() => setEditingLimitsCol(editingLimitsCol === col.id ? null : col.id)}
                                    ><Settings size={14} aria-hidden /></button>

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
                                        disabled={columns.length <= 1}
                                        onClick={() => onRemoveColumn(col, colCards.length)}
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
                                        <div className="tb-policy-popover">
                                            <button className="tb-icon-btn tb-assign-pop__close" aria-label="Close policies" onClick={() => setShowPoliciesCol(null)}>×</button>
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
                                        const subCount = subtasksOf(board.cards, card.id).length;
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
                                                    ><ClipboardList size={14} aria-hidden /></button>
                                                    <button
                                                        className="tb-icon-btn tb-card__remove"
                                                        aria-label={`Remove ${card.title}`}
                                                        title="Remove (reversible)"
                                                        onClick={() => onRemoveCard(card)}
                                                    >×</button>
                                                </div>
                                                <div className="tb-card__meta">
                                                    <button
                                                        className="tb-urg"
                                                        onClick={() => cycleUrgency(card)}
                                                        aria-label={`Urgency ${urg}, click to change`}
                                                        title="Click to cycle urgency"
                                                    ><span className="tb-urg__dot" aria-hidden style={{ background: URGENCY_COLOR[urg] }} />{urg}</button>
                                                    <span className="tb-card__time" title={`Entered this column ${new Date(card.enteredColumnAt).toLocaleString()}`}>
                                                        <Clock size={12} aria-hidden /> {relTime(card.enteredColumnAt)}
                                                    </span>
                                                    {subCount > 0 && (
                                                        <span className="tb-card__badge" title="Sub-tasks">⊞ {subCount}</span>
                                                    )}
                                                    {(card.attachments?.length ?? 0) > 0 && (
                                                        <span className="tb-card__badge" title="Attachments"><Paperclip size={12} aria-hidden /> {card.attachments!.length}</span>
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
                                                        ><Send size={12} aria-hidden /> Send</button>
                                                    )}
                                                </div>
                                                {columns.length > 1 && (
                                                    <select
                                                        className="tb-card__move"
                                                        aria-label={`Move ${card.title} to`}
                                                        value=""
                                                        draggable={false}
                                                        onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                                                        onChange={e => { if (e.target.value) initiateMoveCard(card.id, e.target.value); }}
                                                    >
                                                        <option value="" disabled>Move to…</option>
                                                        {columns.filter(c => c.id !== col.id).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                                    </select>
                                                )}
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
                                                <button className="btn-primary tb-btn" onClick={() => submitNewCard(col.id)}>Add</button>
                                                <button className="btn-ghost tb-btn" onClick={() => { setAddingTo(null); setNewTitle(''); }} aria-label="Cancel"><X size={14} /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button className="tb-add__btn" onClick={() => { setAddingTo(col.id); setNewTitle(''); }}>+ Add a card</button>
                                    )}
                                </div>

                                {/* resize handle on the column's right edge */}
                                {/* WAI-ARIA focusable separator (window-splitter pattern): focusable + key/mouse handlers are the point */}
                                {/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
                                <div
                                    className="tb-col__resizer"
                                    role="separator"
                                    tabIndex={0}
                                    aria-label={`Resize column ${col.title}`}
                                    aria-orientation="vertical"
                                    aria-valuenow={Math.round(w)}
                                    aria-valuemin={MIN_COL}
                                    aria-valuemax={MAX_COL}
                                    onKeyDown={e => keyResize(e, col)}
                                    onMouseDown={e => startResize(e, col.id, col.width)}
                                />
                                {/* eslint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
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
                            <button className="btn-ghost tb-btn" onClick={() => runAndAnnounce(() => undo())} disabled={!canUndo}>↶ Undo last</button>
                            <button className="btn-ghost tb-btn" onClick={() => runAndAnnounce(() => undoLastAi())} disabled={aiActionCount === 0} title="Reverse the most recent AI edit">↶ Undo last AI</button>
                            <button className="btn-ghost tb-btn" onClick={copyReport}>{copied ? 'Copied' : '⧉ AI report'}</button>
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
                <WipModal wip={wipAlert} onCancel={() => setWipAlert(null)} />
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

// ── Modal shell: focus trap, Escape, backdrop click, dialog semantics ──
// Escape is handled on the presentation backdrop: keydown bubbles up from the dialog, and jsx-a11y
// does not allow key handlers on role=dialog itself.
/** Backdrop click closes only when the click lands on the backdrop itself, never on the dialog. */
const onBackdrop = (close: () => void) => (e: React.MouseEvent) => { if (e.target === e.currentTarget) close(); };
const onDialogKey = (close: () => void) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.stopPropagation(); // the shell must not also react to this Escape
    close();
};

function WipModal({ wip, onCancel }: {
    wip: { limit: number; count: number; onConfirm: () => void }; onCancel: () => void;
}) {
    const ref = useFocusTrap<HTMLDivElement>(true);
    const headId = useId();
    return (
        <div className="tb-modal-backdrop" role="presentation" onClick={onBackdrop(onCancel)} onKeyDown={onDialogKey(onCancel)}>
            <div ref={ref} className="tb-modal-card" role="dialog" aria-modal="true" aria-labelledby={headId} tabIndex={-1}>
                <h3 id={headId}>WIP Limit Exceeded</h3>
                <p>
                    The target column has a maximum WIP limit of <strong>{wip.limit}</strong>.
                    It currently contains <strong>{wip.count}</strong> cards.
                    Proceeding will violate the WIP limits.
                </p>
                <div className="tb-modal-actions">
                    <button className="btn-ghost tb-btn" onClick={onCancel}>Cancel</button>
                    <button className="btn-danger tb-btn" onClick={wip.onConfirm}>
                        Override & Proceed
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Assignee picker popover (ARA / Stella / Lisa / custom) ─────────
function AssigneePicker({ onPick, onClose }: { onPick: (a: Assignee | null) => void; onClose: () => void }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    return (
        <div className="tb-assign-pop">
            <button className="tb-icon-btn tb-assign-pop__close" aria-label="Close assignee picker" onClick={onClose}>×</button>
            {BUILT_IN_TARGETS.map(t => (
                <button key={t.id} className="tb-assign-opt" onClick={() => onPick(t)}>
                    <span>{t.kind === 'ai' ? <Sparkles size={14} aria-hidden /> : <User size={14} aria-hidden />} {t.label}</span>
                    <span className="tb-assign-opt__k">{t.kind === 'ai' ? 'AI agent' : 'email'}</span>
                </button>
            ))}
            <div className="tb-assign-custom">
                <input className="tb-assign-input" placeholder="Custom name" value={name} onChange={e => setName(e.target.value)} aria-label="Custom assignee name" />
                <input className="tb-assign-input" placeholder="email@addr (optional)" value={email} onChange={e => setEmail(e.target.value)} aria-label="Custom assignee email" />
                <button
                    className="btn-primary tb-btn"
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
    const announce = useAnnounce();
    const dialogRef = useFocusTrap<HTMLDivElement>(true);
    const attachId = useId();

    // Re-seed local fields when switching to a different card (e.g. into a sub-project)
    useEffect(() => { setTitle(card?.title ?? ''); setDesc(card?.description ?? ''); }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!card) return null;
    const subs = subtasksOf(board.cards, cardId);
    const related = relatedByTags(taggedItems, 'task-board', cardId);
    const timeline = cardTimeline(board, cardId);
    const colName = board.columns.find(c => c.id === card.columnId)?.title ?? card.columnId;

    // One handler for the file input and the drop zone.
    const onFiles = async (files: File[]) => {
        if (files.length === 0) return;
        const sameBoard = captureBoard(); // reading is async; never attach onto a board the user has since left
        for (const file of files) {
            if (!sameBoard()) return;
            if (file.size <= MAX_INLINE_ATTACHMENT) {
                const dataUrl = await new Promise<string | undefined>(res => {
                    const r = new FileReader();
                    r.onload = () => res(typeof r.result === 'string' ? r.result : undefined);
                    r.onerror = () => res(undefined);
                    r.readAsDataURL(file);
                });
                if (!sameBoard()) return;
                attachToCard(cardId, { name: file.name, size: file.size, type: file.type, dataUrl });
            } else {
                attachToCard(cardId, { name: file.name, size: file.size, type: file.type });
            }
        }
    };
    const doRoute = async () => { const r = await routeCard(cardId); announce(r.detail); setRouteMsg(r.detail); setTimeout(() => setRouteMsg(null), 4000); };
    const commitTitle = () => { const t = title.trim(); if (t && t !== card.title) editCard(cardId, { title: t }); };
    const commitDesc = () => { if (desc !== card.description) editCard(cardId, { description: desc }); };
    const onKey = onDialogKey(() => { commitTitle(); commitDesc(); onClose(); }); // Escape must not lose a half-typed edit

    return (
        <div className="tb-pv-overlay" role="presentation" onClick={onBackdrop(onClose)} onKeyDown={onKey}>
            <div ref={dialogRef} className="tb-pv" role="dialog" aria-modal="true" aria-label={`Card: ${card.title}`} tabIndex={-1}>
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
                    {card.assignee && <button className="tb-send-btn" onClick={doRoute}><Send size={12} aria-hidden /> Send</button>}
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
                                        <button className="btn-ghost tb-btn" onClick={() => addCard({ title: r.title })} title="Add this linked item as a card on the board">＋ Add as card</button>
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
                            <button className="btn-primary tb-btn" disabled={!sub.trim()} onClick={() => { if (sub.trim()) { addSubtask(cardId, sub.trim()); setSub(''); } }}>Add</button>
                        </div>
                    </section>

                    <section className="tb-pv__sec">
                        <h4>Attachments ({card.attachments?.length ?? 0})</h4>
                        <div
                            className={`tb-pv__drop ${drag ? 'tb-pv__drop--over' : ''}`}
                            onDragOver={e => { e.preventDefault(); setDrag(true); }}
                            onDragLeave={() => setDrag(false)}
                            onDrop={e => { e.preventDefault(); setDrag(false); void onFiles(Array.from(e.dataTransfer.files)); }}
                        >
                            <span>Drag &amp; drop files here</span>
                            <span className="tb-pv__drop-note">≤ {Math.round(MAX_INLINE_ATTACHMENT / 1024)} KB stored locally; larger files keep name + metadata only</span>
                        </div>
                        <label className="tb-pv__attach" htmlFor={attachId}>
                            Attach files
                            <input
                                id={attachId}
                                className="tb-pv__attach-input"
                                type="file"
                                multiple
                                onChange={e => {
                                    const picked = Array.from(e.target.files ?? []);
                                    e.target.value = ''; // so the same file can be chosen again
                                    void onFiles(picked);
                                }}
                            />
                        </label>
                        <div className="tb-pv__atts">
                            {(card.attachments ?? []).map(a => (
                                <div key={a.id} className="tb-pv__att">
                                    {a.dataUrl?.startsWith('data:') ? (
                                        <a className="tb-pv__att-name tb-pv__att-link" download={a.name} href={a.dataUrl} aria-label={`Download ${a.name}`}><FileText size={12} aria-hidden /> {a.name}</a>
                                    ) : (
                                        <span className="tb-pv__att-name"><FileText size={12} aria-hidden /> {a.name}</span>
                                    )}
                                    <span className="tb-pv__att-size">{fmtBytes(a.size)}{a.dataUrl ? '' : ' · meta only'}</span>
                                    <button className="tb-icon-btn" aria-label={`Remove ${a.name}`} onClick={() => { removeAttachment(cardId, a.id); announce(`Removed attachment ${a.name}. Undo is available.`); }}>×</button>
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
function ColumnSettingsPopover({ column, onClose }: { column: BoardColumn; onClose: () => void }) {
    const uid = useId();
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
        <div className="tb-col-settings-pop">
            <button className="tb-icon-btn tb-assign-pop__close" aria-label="Close column settings" onClick={onClose}>×</button>
            <h5>Column Settings</h5>
            
            <div className="tb-settings-group">
                <label htmlFor={`${uid}-name`}>Column Name</label>
                <input id={`${uid}-name`} className="tb-assign-input" value={title} onChange={e => setTitle(e.target.value)} />
            </div>

            <div className="tb-settings-row">
                <div className="tb-settings-group">
                    <label htmlFor={`${uid}-min`}>Min WIP</label>
                    <input id={`${uid}-min`} className="tb-assign-input" type="number" min="0" value={minWip} onChange={e => setMinWip(e.target.value)} />
                </div>
                <div className="tb-settings-group">
                    <label htmlFor={`${uid}-max`}>Max WIP</label>
                    <input id={`${uid}-max`} className="tb-assign-input" type="number" min="0" value={maxWip} onChange={e => setMaxWip(e.target.value)} />
                </div>
            </div>

            <div className="tb-settings-group">
                <label htmlFor={`${uid}-pol`}>Policies (one per line)</label>
                <textarea 
                    id={`${uid}-pol`}
                    className="tb-assign-input" 
                    rows={4} 
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    value={policyText} 
                    onChange={e => setPolicyText(e.target.value)} 
                    placeholder="e.g. Test all work&#10;Complete definition of done"
                />
            </div>

            <button className="btn-primary tb-btn" onClick={handleSave}>Save Settings</button>
        </div>
    );
}

// ── ExitCriteriaModal ──────────────────────────────────────────────
function ExitCriteriaModal({ policies, onConfirm, onCancel }: { policies: string[]; onConfirm: () => void; onCancel: () => void }) {
    const [checked, setChecked] = useState<Record<number, boolean>>({});
    
    const allChecked = policies.every((_, idx) => checked[idx]);
    const ref = useFocusTrap<HTMLDivElement>(true);
    const headId = useId();

    return (
        <div className="tb-modal-backdrop" role="presentation" onClick={onBackdrop(onCancel)} onKeyDown={onDialogKey(onCancel)}>
            <div ref={ref} className="tb-modal-card tb-modal-card--exit" role="dialog" aria-modal="true" aria-labelledby={headId} tabIndex={-1}>
                <h3 id={headId}>Column Exit Criteria Enforced</h3>
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
                    <button className="btn-ghost tb-btn" onClick={onCancel}>Cancel</button>
                    <button className="btn-primary tb-btn" disabled={!allChecked} onClick={onConfirm}>
                        Move Card
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── MetricsDashboard ───────────────────────────────────────────────
type MetricsTab = 'wip' | 'throughput' | 'age' | 'times';
const METRIC_TABS: { id: MetricsTab; label: string }[] = [
    { id: 'wip', label: 'WIP Status' },
    { id: 'throughput', label: 'Throughput' },
    { id: 'age', label: 'Item Age' },
    { id: 'times', label: 'Cycle & Lead' },
];
const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (ms: number): number => parseFloat((Math.max(0, ms) / DAY_MS).toFixed(1));
const CHART_MUTED = 'var(--tb-muted, var(--text-secondary))';
const CHART_TOOLTIP = { background: 'var(--bg-surface-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', fontSize: '11px', borderRadius: '6px' };

/** Metrics are read off the model, never parsed from audit text: Backlog = first column by order, Done = last. */
function MetricsDashboard({ board, onClose }: { board: BoardState; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<MetricsTab>('wip');
    const { handleKeyDown, getTabProps, getPanelProps } = useTabNavigation(METRIC_TABS, activeTab, id => setActiveTab(id as MetricsTab));

    const columns = [...board.columns].sort((a, b) => a.order - b.order);
    const firstId = columns[0]?.id;
    const doneId = columns[columns.length - 1]?.id;
    const activeColumns = columns.filter(c => c.id !== firstId && c.id !== doneId);
    const activeCards = board.cards.filter(c => c.columnId !== firstId && c.columnId !== doneId);
    const completedCards = board.cards.filter(c => c.columnId === doneId);
    const countIn = (colId: string) => board.cards.filter(c => c.columnId === colId).length;

    // 1. WIP stats
    let starvedCount = 0;
    let exceededCount = 0;
    activeColumns.forEach(col => {
        const count = countIn(col.id);
        if (col.minWip !== undefined && count < col.minWip) starvedCount++;
        if (col.maxWip !== undefined && count > col.maxWip) exceededCount++;
    });

    // 2. Throughput: completed per day for the last 7 days, and the all-time weekly average
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return { dateStr: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), dateKey: d.toDateString(), count: 0 };
    }).reverse();
    completedCards.forEach(card => {
        const bucket = last7Days.find(d => d.dateKey === new Date(card.enteredColumnAt).toDateString());
        if (bucket) bucket.count++;
    });
    const oldest = board.cards.reduce((m, c) => Math.min(m, new Date(c.createdAt).getTime()), Infinity);
    const weeksOpen = Number.isFinite(oldest) ? (Date.now() - oldest) / WEEK_MS : 0;
    const avgPerWeek = (completedCards.length / Math.max(1, weeksOpen)).toFixed(1);
    const throughputLabel = `Daily throughput, last 7 days: ${last7Days.map(d => `${d.dateStr} ${d.count}`).join(', ')}. Average ${avgPerWeek} completed per week.`;

    // 3. Work item age
    const ageData = activeCards.map(card => ({
        id: card.id,
        title: card.title,
        column: columns.find(c => c.id === card.columnId)?.title ?? card.columnId,
        age: inDays(Date.now() - new Date(card.enteredColumnAt).getTime()),
    })).sort((a, b) => b.age - a.age);

    // 4. Lead & cycle time. Done entry time = enteredColumnAt. Cycle starts at the first live move out of the first column.
    const timesData = completedCards.map((card, idx) => {
        const completed = new Date(card.enteredColumnAt).getTime();
        const created = new Date(card.createdAt).getTime();
        const start = board.audit.find(e => !e.reversed && (e.type === 'MOVE_CARD' || e.type === 'MOVE_CARDS')
            && !!e.cardIds?.includes(card.id) && e.to !== firstId);
        const started = start ? new Date(start.ts).getTime() : created;
        return { index: idx + 1, title: card.title, leadTime: inDays(completed - created), cycleTime: inDays(completed - started) };
    });
    const mean = (pick: (t: typeof timesData[number]) => number) =>
        timesData.length > 0 ? (timesData.reduce((sum, t) => sum + pick(t), 0) / timesData.length).toFixed(1) : '0';
    const avgLead = mean(t => t.leadTime);
    const avgCycle = mean(t => t.cycleTime);
    const SHOWN = 20;
    const scatterLabel = `Cycle time in days for each completed item: ${timesData.slice(0, SHOWN).map(t => `${t.title} ${t.cycleTime}`).join(', ')}${timesData.length > SHOWN ? `, and ${timesData.length - SHOWN} more` : ''}. Average ${avgCycle} days.`;

    return (
        <aside className="tb-metrics-drawer" aria-label="Kanban system metrics">
            <div className="tb-metrics-drawer__head">
                <span className="tb-metrics-drawer__title">Kanban System Metrics</span>
                <button className="tb-icon-btn" onClick={onClose} aria-label="Close metrics dashboard">×</button>
            </div>

            <div className="tb-metrics-tabs" role="tablist" aria-label="Metrics views">
                {METRIC_TABS.map(t => {
                    const tp = getTabProps(t.id);
                    const on = t.id === activeTab;
                    return (
                        <button
                            key={t.id}
                            {...tp}
                            onKeyDown={handleKeyDown}
                            aria-controls={on ? tp['aria-controls'] : undefined}
                            className={`tb-metrics-tab-btn ${on ? 'tb-metrics-tab-btn--active' : ''}`}
                            onClick={() => setActiveTab(t.id)}
                        >{t.label}</button>
                    );
                })}
            </div>

            <div className="tb-metrics-body" {...getPanelProps(activeTab)}>
                {activeTab === 'wip' && (
                    <>
                        <div className="tb-metrics-grid">
                            <div className="tb-metrics-card">
                                <span className="tb-metrics-card__title">Total WIP</span>
                                <span className="tb-metrics-card__value">{activeCards.length}</span>
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
                                {columns.map(col => {
                                    const count = countIn(col.id);
                                    const over = col.maxWip !== undefined && col.maxWip > 0 && count > col.maxWip;
                                    const starved = col.minWip !== undefined && col.minWip > 0 && count < col.minWip;
                                    return (
                                        <div key={col.id} className="tb-metrics-age-row">
                                            <span className="tb-metrics-age-name">{col.title}</span>
                                            <span>{col.minWip ?? '-'} / {col.maxWip ?? '-'}</span>
                                            <span className={`tb-metrics-age-value ${over ? 'tb-metrics-age-value--over' : starved ? 'tb-metrics-age-value--starved' : ''}`}>
                                                {count}{over ? ' (over)' : starved ? ' (starved)' : ''}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'throughput' && (
                    <>
                        <div className="tb-metrics-grid">
                            <div className="tb-metrics-card">
                                <span className="tb-metrics-card__title">Completed Tasks</span>
                                <span className="tb-metrics-card__value">{completedCards.length}</span>
                                <span className="tb-metrics-card__sub">All-time throughput</span>
                            </div>
                            <div className="tb-metrics-card">
                                <span className="tb-metrics-card__title">Avg per week</span>
                                <span className="tb-metrics-card__value">{avgPerWeek}</span>
                                <span className="tb-metrics-card__sub">Completed ÷ weeks since the oldest card</span>
                            </div>
                        </div>

                        <div className="tb-metrics-section">
                            <h4>Daily Throughput (Last 7 Days)</h4>
                            <div className="tb-chart-container" role="img" aria-label={throughputLabel}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={last7Days} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                        <XAxis dataKey="dateStr" stroke={CHART_MUTED} tick={{ fill: CHART_MUTED }} fontSize={11} tickLine={false} />
                                        <YAxis stroke={CHART_MUTED} tick={{ fill: CHART_MUTED }} fontSize={11} tickLine={false} allowDecimals={false} />
                                        <ChartTooltip contentStyle={CHART_TOOLTIP} />
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
                            <p className="tb-metrics-empty">No active items in flight.</p>
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
                                <span className="tb-metrics-card__value">{avgLead}d</span>
                                <span className="tb-metrics-card__sub">From creation to completion</span>
                            </div>
                            <div className="tb-metrics-card">
                                <span className="tb-metrics-card__title">Average Cycle Time</span>
                                <span className="tb-metrics-card__value">{avgCycle}d</span>
                                <span className="tb-metrics-card__sub">From start to completion</span>
                            </div>
                        </div>

                        <div className="tb-metrics-section">
                            <h4>Cycle Time Scatter Plot</h4>
                            {timesData.length === 0 ? (
                                <p className="tb-metrics-empty">No completed items to analyze.</p>
                            ) : (
                                <div className="tb-chart-container" role="img" aria-label={scatterLabel}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                            <XAxis type="number" dataKey="index" name="Item" stroke={CHART_MUTED} tick={{ fill: CHART_MUTED }} fontSize={11} tickLine={false} />
                                            <YAxis type="number" dataKey="cycleTime" name="Cycle Time" unit="d" stroke={CHART_MUTED} tick={{ fill: CHART_MUTED }} fontSize={11} tickLine={false} />
                                            <ChartTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={CHART_TOOLTIP} />
                                            <Scatter name="Tasks" data={timesData} fill="var(--accent)" />
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
