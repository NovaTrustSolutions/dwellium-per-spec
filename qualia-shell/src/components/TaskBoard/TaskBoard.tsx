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
import { UserContext } from '../../context/UserContext';
import {
    taskBoardStore, taskBoardUserIdHolder,
    addCard, moveCard, moveCards, removeCard, editCard,
    addColumn, renameColumn, removeColumn, resizeColumn,
    undo, undoLastAi, aiFileBacklog, boardReport,
    assignCard, routeCard, addSubtask, attachToCard, removeAttachment, MAX_INLINE_ATTACHMENT,
    type RouteResult,
} from './taskBoardStore';
import {
    cardsInColumn, actorLabel, cardTimeline, subtasksOf,
    type Urgency, type TaskCard, type Assignee, type BoardState,
} from './taskBoardModel';
import { BUILT_IN_TARGETS, describeRoute } from './taskRouting';
import { TagInput, useTaggedItems } from '../Tags/TagInput';
import { relatedByTags } from '../../lib/tagStore';
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
    // Per-user store binding (set holder DURING render, before useSyncExternalStore)
    const userCtx = useContext(UserContext);
    taskBoardUserIdHolder.current = userCtx?.user?.id ?? null;
    const board = useSyncExternalStore(taskBoardStore.subscribe, taskBoardStore.getSnapshot, taskBoardStore.getServerSnapshot);

    const columns = [...board.columns].sort((a, b) => a.order - b.order);

    // ── selection / drag UI state ──
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);
    const didDrag = useRef(false);
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
    const onDragStart = (id: string) => { didDrag.current = false; setDragId(id); };
    const onDragOver = (e: React.DragEvent, colId: string) => { e.preventDefault(); didDrag.current = true; setDragOverCol(colId); };
    const onDrop = (colId: string) => {
        const id = dragId;
        setDragId(null);
        setDragOverCol(null);
        if (!id) return;
        // If the dragged card is part of a multi-selection, move the whole set.
        if (selected.has(id) && selected.size > 1) {
            moveCards([...selected], colId);
            clearSel();
        } else {
            moveCard(id, colId);
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

    // ── bulk move ──
    const bulkMove = (colId: string) => {
        if (selected.size === 0) return;
        moveCards([...selected], colId);
        clearSel();
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
        <div className="tb-board">
            {/* ── Toolbar ── */}
            <div className="tb-toolbar">
                <span className="tb-toolbar__title">Task Board</span>
                <span className="tb-toolbar__count">{board.cards.length} card{board.cards.length === 1 ? '' : 's'}</span>
                <span className="tb-spacer" />

                {selected.size > 0 && (
                    <div className="tb-bulk">
                        <span className="tb-bulk__count">{selected.size} selected</span>
                        <select
                            className="tb-bulk__move"
                            aria-label="Move selected cards to column"
                            value=""
                            onChange={e => { if (e.target.value) bulkMove(e.target.value); }}
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
                    ✦ AI: file Backlog
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
                        return (
                            <div
                                key={col.id}
                                className={`tb-col ${over ? 'tb-col--over' : ''}`}
                                style={{ width: w, minWidth: w, maxWidth: w }}
                                onDragOver={e => onDragOver(e, col.id)}
                                onDragLeave={() => setDragOverCol(null)}
                                onDrop={() => onDrop(col.id)}
                            >
                                <div className="tb-col__head">
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
                                    <span className="tb-col__count">{colCards.length}</span>
                                    <button
                                        className="tb-icon-btn"
                                        aria-label={`Remove column ${col.title}`}
                                        title="Remove column (reversible)"
                                        onClick={() => removeColumn(col.id)}
                                    >×</button>
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
                                                onDragStart={() => onDragStart(card.id)}
                                            >
                                                <div className="tb-card__top">
                                                    <input
                                                        type="checkbox"
                                                        className="tb-card__check"
                                                        checked={isSel}
                                                        onChange={() => toggleSel(card.id)}
                                                        aria-label={`Select ${card.title}`}
                                                    />
                                                    <button
                                                        className="tb-card__title tb-card__title--link"
                                                        onClick={() => setOpenCardId(card.id)}
                                                        title="Open project view"
                                                    >{card.title}</button>
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
                                                        🕐 {relTime(card.enteredColumnAt)}
                                                    </span>
                                                    {subtasksOf(board.cards, card.id).length > 0 && (
                                                        <span className="tb-card__badge" title="Sub-tasks">⊞ {subtasksOf(board.cards, card.id).length}</span>
                                                    )}
                                                    {(card.attachments?.length ?? 0) > 0 && (
                                                        <span className="tb-card__badge" title="Attachments">📎 {card.attachments!.length}</span>
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
                                                        >➤ Send</button>
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
                                                <button className="tb-btn tb-btn--ghost" onClick={() => { setAddingTo(null); setNewTitle(''); }} aria-label="Cancel">✕</button>
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
                            <button className="tb-btn tb-btn--ghost" onClick={copyReport}>{copied ? '✓ Copied' : '⧉ AI report'}</button>
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
            </div>

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
                    <span>{t.kind === 'ai' ? '✦' : '👤'} {t.label}</span>
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
                    {card.assignee && <button className="tb-send-btn" onClick={doRoute}>➤ Send</button>}
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
                                    <span className="tb-pv__att-name">📄 {a.name}</span>
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
