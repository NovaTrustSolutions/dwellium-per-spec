import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ClipboardList, Clock, FileText, ListChecks, MessageSquare, Paperclip, RefreshCw, Square, SquareCheck, TriangleAlert, X } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import {
    TrelloApiError, describeTrelloError, trelloApi,
    type Activity, type CardDetail, type Checklist, type TrelloBoard as BoardInfo, type TrelloCard, type TrelloList,
} from './trelloApi';
import { TRELLO_A11Y } from './a11yContract';
import { labelDisplayName, labelStyle } from './trelloLabelColors';
import './TrelloBoard.css';

interface BoardData { boardId: string; lists: TrelloList[]; cards: TrelloCard[]; truncated: boolean }
interface DetailData { card: CardDetail; activity: Activity[] }
/** A move whose PUT is in flight; `loadBoard` overlays it so a refetch cannot undo it. */
interface PendingMove { listId: string; pos: number }

const NO_LISTS: TrelloList[] = [];
const NO_CARDS: TrelloCard[] = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString();
const isOverdue = (c: TrelloCard): boolean => !!c.due && !c.dueComplete && Date.parse(c.due) < Date.now();

/** Wrap Tab / Shift+Tab inside the dialog (same pattern as TrelloCardModal). */
function trapTab(e: KeyboardEvent, root: HTMLElement): void {
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) { e.preventDefault(); root.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !root.contains(active) || active === root;
    if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus(); }
}

function activityText(a: Activity): string | undefined {
    if (a.type === 'commentCard') return a.data?.text;
    if (a.type === 'updateCard' && a.data?.listAfter) return `moved to ${a.data.listAfter.name}`;
    return a.type.replace(/([A-Z])/g, ' $1').toLowerCase();
}

// ── Data hooks ─────────────────────────────────────

/**
 * Latest-request-wins guard. `begin()` aborts the previous request and returns a handle whose
 * `current()` is false once superseded or cancelled. The sequence check (not the abort) is what
 * drops stale responses, so it also holds when fetch ignores the signal.
 */
function useLatest() {
    const seq = useRef(0);
    const ctl = useRef<AbortController | null>(null);
    const begin = useCallback(() => {
        ctl.current?.abort();
        const c = new AbortController();
        ctl.current = c;
        const id = ++seq.current;
        return { signal: c.signal, current: () => id === seq.current };
    }, []);
    const cancel = useCallback(() => { seq.current++; ctl.current?.abort(); ctl.current = null; }, []);
    return { begin, cancel };
}

function useBoardData() {
    const [boards, setBoards] = useState<BoardInfo[]>([]);
    const [boardsLoading, setBoardsLoading] = useState(true);
    const [boardsError, setBoardsError] = useState<unknown>(null);
    const [selected, setSelected] = useState('');
    const [data, setData] = useState<BoardData | null>(null);
    const [boardLoading, setBoardLoading] = useState(false);
    const [boardError, setBoardError] = useState<unknown>(null);
    const [actionError, setActionError] = useState<unknown>(null);
    const pendingMoves = useRef(new Map<string, PendingMove>());
    const { begin: beginBoards, cancel: cancelBoards } = useLatest();
    const { begin: beginBoard, cancel: cancelBoard } = useLatest();

    const loadBoards = useCallback(async (fresh = false) => {
        const req = beginBoards();
        setBoardsLoading(true);
        try {
            const list = await trelloApi.boards(req.signal, { fresh });
            if (!req.current()) return;
            setBoards(list);
            setBoardsError(null);
            setSelected(prev => (list.some(b => b.id === prev) ? prev : (list[0]?.id ?? '')));
        } catch (e) {
            if (req.current()) setBoardsError(e);
        } finally {
            if (req.current()) setBoardsLoading(false);
        }
    }, [beginBoards]);

    // `silent` keeps an existing board error on screen until the refetch succeeds (focus refetch).
    const loadBoard = useCallback(async (id: string, silent: boolean) => {
        if (!id) return;
        const req = beginBoard();
        setBoardLoading(true);
        if (!silent) setBoardError(null);
        try {
            const full = await trelloApi.boardFull(id, req.signal);
            if (!req.current()) return;
            // Overlay moves still in flight: the server may not have applied them when it answered.
            const cards = full.cards.map(c => {
                const p = pendingMoves.current.get(c.id);
                return p ? { ...c, idList: p.listId, pos: p.pos } : c;
            });
            setData({ boardId: id, lists: full.lists, cards, truncated: full.truncated });
            setBoardError(null);
            if (!silent) setActionError(null); // a focus refetch must not wipe an error the user has not read yet
        } catch (e) {
            if (req.current()) setBoardError(e);
        } finally {
            if (req.current()) setBoardLoading(false);
        }
    }, [beginBoard]);

    const updateCards = useCallback((boardId: string, fn: (cards: TrelloCard[]) => TrelloCard[]) => {
        setData(d => (d && d.boardId === boardId ? { ...d, cards: fn(d.cards) } : d));
    }, []);

    useEffect(() => { void loadBoards(false); return cancelBoards; }, [loadBoards, cancelBoards]);
    useEffect(() => { void loadBoard(selected, false); return cancelBoard; }, [selected, loadBoard, cancelBoard]);
    useEffect(() => {
        if (!selected) return;
        const onFocus = () => { void loadBoard(selected, true); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [selected, loadBoard]);

    const refresh = useCallback(() => { setActionError(null); void loadBoards(true); void loadBoard(selected, true); }, [loadBoards, loadBoard, selected]);
    const refetchBoard = useCallback(() => { void loadBoard(selected, true); }, [loadBoard, selected]);
    const dismissErrors = useCallback(() => { setActionError(null); setBoardError(null); setBoardsError(null); }, []);
    const retryBoard = useCallback(() => { void loadBoard(selected, false); }, [loadBoard, selected]);
    // Data from the board that was selected before a switch stays in state but is never shown.
    const visible = data && data.boardId === selected ? data : null;

    return { boards, boardsLoading, boardsError, selected, setSelected, visible, boardLoading, boardError, actionError, setActionError, pendingMoves, updateCards, loadBoards, refresh, refetchBoard, retryBoard, dismissErrors };
}

function useCardDetail() {
    const [openId, setOpenId] = useState<string | null>(null);
    const [detail, setDetail] = useState<DetailData | null>(null);
    const [error, setError] = useState<unknown>(null);
    const { begin, cancel } = useLatest();

    const open = useCallback(async (cardId: string) => {
        const req = begin();
        setOpenId(cardId);
        setDetail(null);
        setError(null);
        try {
            const [card, activity] = await Promise.all([
                trelloApi.card(cardId, req.signal),
                trelloApi.activity(cardId, req.signal).catch((): Activity[] => []), // activity is optional
            ]);
            if (req.current()) setDetail({ card, activity });
        } catch (e) {
            if (req.current()) setError(e);
        }
    }, [begin]);

    // Closing cancels the request and bumps the sequence, so a late response cannot reopen the dialog.
    const close = useCallback(() => { cancel(); setOpenId(null); setDetail(null); setError(null); }, [cancel]);
    useEffect(() => cancel, [cancel]);

    return { openId, detail, error, open, close };
}

// ── Presentational pieces ──────────────────────────

function Failure({ error, isAdmin, onRetry }: { error: unknown; isAdmin: boolean; onRetry: () => void }) {
    const message = describeTrelloError(error, { isAdmin });
    const code = error instanceof TrelloApiError ? error.code : null;
    if (code === 'FORBIDDEN') return <div className="trello-noaccess" role="status"><p>{message}</p></div>;
    if (code === 'NOT_CONFIGURED') return <div className="trello-empty-state" role="status"><p>{message}</p></div>;
    return (
        <div className="trello-board--error">
            <span className="trello-error-icon"><TriangleAlert size={20} aria-hidden /></span>
            <p role="alert">{message}</p>
            <button type="button" className="trello-btn" onClick={onRetry}>{TRELLO_A11Y.retry}</button>
        </div>
    );
}

function CardBadges({ badges }: { badges: TrelloCard['badges'] }) {
    if (!badges) return null;
    const { comments, attachments, checkItems, checkItemsChecked } = badges;
    if (!comments && !attachments && !checkItems) return null;
    return (
        <span className="trello-card__badges" aria-hidden="true">
            {!!comments && <span><MessageSquare size={12} /> {comments}</span>}
            {!!attachments && <span><Paperclip size={12} /> {attachments}</span>}
            {!!checkItems && <span><SquareCheck size={12} /> {checkItemsChecked ?? 0}/{checkItems}</span>}
        </span>
    );
}

interface CardButtonProps {
    card: TrelloCard;
    dragging: boolean;
    onOpen: (id: string) => void;
    onDragStart: (e: DragEvent<HTMLButtonElement>, id: string) => void;
    onDragEnd: () => void;
}

// The button is both the click target and the drag source; browsers fire no click after a drag.
function CardButton({ card, dragging, onOpen, onDragStart, onDragEnd }: CardButtonProps) {
    const state = card.dueComplete ? ' trello-card--done' : isOverdue(card) ? ' trello-card--overdue' : '';
    return (
        <button
            type="button"
            data-card-id={card.id}
            className={`${TRELLO_A11Y.cardClass}${state}${dragging ? ' trello-card--dragging' : ''}`}
            draggable
            onDragStart={e => onDragStart(e, card.id)}
            onDragEnd={onDragEnd}
            onClick={() => onOpen(card.id)}
        >
            {!!card.labels?.length && (
                <span className="trello-card__labels" aria-hidden="true">
                    {card.labels.map(l => (
                        <span key={l.id} className="trello-card__label" style={labelStyle(l.color)}>{labelDisplayName(l)}</span>
                    ))}
                </span>
            )}
            <span className="trello-card__title">{card.name}</span>
            {card.due && (
                <span className="trello-card__due" aria-hidden="true"><Clock size={12} /> {formatDate(card.due)}</span>
            )}
            <CardBadges badges={card.badges} />
        </button>
    );
}

interface AddCardProps { onCreate: (name: string) => Promise<boolean>; onClose: () => void }

function AddCard({ onCreate, onClose }: AddCardProps) {
    const [name, setName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const busy = useRef(false); // set synchronously: fetch fires before the first await, so Enter-twice cannot double-submit
    useEffect(() => { inputRef.current?.focus(); }, []);

    const submit = async () => {
        const title = name.trim();
        if (!title || busy.current) return;
        busy.current = true;
        const ok = await onCreate(title);
        busy.current = false;
        if (ok) onClose(); // on failure the form stays open with the typed title
    };

    return (
        <div className="trello-add-card-form">
            <input
                ref={inputRef}
                className="trello-add-card-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter card title…"
                maxLength={512}
                aria-label="Card title"
                onKeyDown={e => {
                    if (e.key === 'Enter') void submit();
                    if (e.key === 'Escape') onClose();
                }}
            />
            <div className="trello-add-card-actions">
                <button type="button" className="trello-btn trello-btn--primary" disabled={!name.trim()} onClick={() => void submit()}>{TRELLO_A11Y.addCard}</button>
                <button type="button" className="trello-btn" onClick={onClose} aria-label={TRELLO_A11Y.cancelAdd}><X size={14} aria-hidden /></button>
            </div>
        </div>
    );
}

function ChecklistView({ list }: { list: Checklist }) {
    const done = list.checkItems.filter(i => i.state === 'complete').length;
    const total = list.checkItems.length;
    return (
        <div className="trello-detail__checklist">
            <div className="trello-detail__checklist-header">
                <span>{list.name}</span>
                <span className="trello-detail__checklist-count">{done}/{total}</span>
            </div>
            <div className="trello-detail__progress-track">
                <div className="trello-detail__progress-fill" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
            </div>
            <ul className="trello-detail__check-items">
                {list.checkItems.map(item => (
                    <li key={item.id} className={item.state === 'complete' ? 'checked' : ''}>
                        <span className="trello-detail__check-box">
                            {item.state === 'complete' ? <SquareCheck size={14} aria-hidden /> : <Square size={14} aria-hidden />}
                        </span>
                        {item.name}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function DetailBody({ card, activity }: DetailData) {
    const members = card.members?.map(m => m.fullName).join(', ');
    return (
        <div className="trello-detail__body">
            {members && <p className="trello-detail__empty-text">Members: {members}</p>}
            <section className="trello-detail__section">
                <h4><FileText size={14} aria-hidden /> Description</h4>
                {card.desc
                    ? <div className="trello-detail__desc" style={{ whiteSpace: 'pre-wrap' }}>{card.desc}</div>
                    : <p className="trello-detail__empty-text">No description</p>}
            </section>
            {!!card.checklists?.length && (
                <section className="trello-detail__section">
                    <h4><ListChecks size={14} aria-hidden /> Checklists</h4>
                    {card.checklists.map(cl => <ChecklistView key={cl.id} list={cl} />)}
                </section>
            )}
            {!!card.attachments?.length && (
                <section className="trello-detail__section">
                    <h4><Paperclip size={14} aria-hidden /> Attachments</h4>
                    <div className="trello-detail__attachments">
                        {card.attachments.map(att => (
                            <a key={att.id} className="trello-detail__attachment" href={att.url} target="_blank" rel="noopener noreferrer">
                                <span className="trello-detail__attachment-icon"><FileText size={14} aria-hidden /></span>
                                <span className="trello-detail__attachment-name">{att.name}</span>
                            </a>
                        ))}
                    </div>
                </section>
            )}
            {activity.length > 0 && (
                <section className="trello-detail__section">
                    <h4><MessageSquare size={14} aria-hidden /> Activity</h4>
                    <div className="trello-detail__activity">
                        {activity.slice(0, 20).map(a => (
                            <div key={a.id} className="trello-detail__activity-item">
                                <span className="trello-detail__activity-author">{a.memberCreator?.fullName || 'Unknown'}</span>
                                <span className="trello-detail__activity-text">{activityText(a)}</span>
                                <span className="trello-detail__activity-date">{formatDate(a.date)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

interface DetailDialogProps {
    title: string;
    loading: boolean;
    error: unknown;
    isAdmin: boolean;
    detail: DetailData | null;
    lists: TrelloList[];
    listId: string;
    onMove: (listId: string) => void;
    onClose: () => void;
}

function DetailDialog({ title, loading, error, isAdmin, detail, lists, listId, onMove, onClose }: DetailDialogProps) {
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    useEffect(() => { closeRef.current?.focus(); }, []);

    // Keys are handled on the presentational overlay (they bubble up from the dialog) so the dialog itself stays non-interactive for a11y lint.
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        else if (e.key === 'Tab' && panelRef.current) trapTab(e, panelRef.current);
    };
    const card = detail?.card;

    return (
        <div className={TRELLO_A11Y.detailOverlayClass} role="presentation" onKeyDown={onKeyDown} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={panelRef} className="trello-detail-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
                <div className="trello-detail__header">
                    <h3 id={titleId} className="trello-detail__title">{card?.name ?? title}</h3>
                    <button ref={closeRef} type="button" className="trello-detail__close" aria-label={TRELLO_A11Y.closeDetail} onClick={onClose}>
                        <X size={16} aria-hidden />
                    </button>
                </div>
                {loading && (
                    <div className="trello-detail-loading">
                        <div className="trello-spinner" />
                        <p role="status">{TRELLO_A11Y.loadingCard}</p>
                    </div>
                )}
                {error != null && <p className="trello-alert" role="alert">{describeTrelloError(error, { isAdmin })}</p>}
                {card && detail && (
                    <>
                        <div className="trello-detail__meta">
                            {card.due && <span className="trello-detail__due-badge"><Clock size={12} aria-hidden /> {formatDate(card.due)}</span>}
                            {!!card.labels?.length && card.labels.map(l => (
                                <span key={l.id} className="trello-detail__label-chip" style={labelStyle(l.color)}>{labelDisplayName(l)}</span>
                            ))}
                        </div>
                        <label className="trello-move">
                            <ClipboardList size={12} aria-hidden />
                            <span>{TRELLO_A11Y.moveTo}</span>
                            <select aria-label={TRELLO_A11Y.moveTo} value={listId} onChange={e => onMove(e.target.value)}>
                                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </label>
                        <DetailBody card={card} activity={detail.activity} />
                        <div className="trello-detail__footer">
                            <a className="trello-btn trello-btn--primary trello-detail__open-link" href={card.url} target="_blank" rel="noopener noreferrer">
                                {TRELLO_A11Y.openInTrello} <span aria-hidden="true">↗</span>
                            </a>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Board ──────────────────────────────────────────

function TrelloBoardView({ isAdmin }: { isAdmin: boolean }) {
    const b = useBoardData();
    const d = useCardDetail();
    const { updateCards, selected, setActionError, pendingMoves, refetchBoard } = b;
    const actionError = b.actionError;
    const rootRef = useRef<HTMLDivElement>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const [addingTo, setAddingTo] = useState<string | null>(null);
    const refocusAdd = useRef<string | null>(null);

    // Closing the form unmounts the focused input; once the opener is back, hand focus to it.
    useEffect(() => {
        if (addingTo !== null || !refocusAdd.current) return;
        const id = refocusAdd.current;
        refocusAdd.current = null;
        Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-add-for]') ?? []).find(el => el.dataset.addFor === id)?.focus();
    }, [addingTo]);
    const closeAdd = (listId: string) => { refocusAdd.current = listId; setAddingTo(null); };

    const lists = b.visible?.lists ?? NO_LISTS;
    const cards = b.visible?.cards ?? NO_CARDS;
    const byList = useMemo(() => {
        const map = new Map<string, TrelloCard[]>();
        for (const c of [...cards].sort((x, y) => (x.pos ?? 0) - (y.pos ?? 0))) map.set(c.idList, [...(map.get(c.idList) ?? []), c]);
        return map;
    }, [cards]);

    const moveCard = useCallback(async (card: TrelloCard, toList: string) => {
        if (card.idList === toList) return;
        const { idList: from, pos: fromPos } = card; // where the card was at drop time
        const entry: PendingMove = { listId: toList, pos: Math.max(0, ...cards.filter(c => c.idList === toList).map(c => c.pos ?? 0)) + 1 };
        pendingMoves.current.set(card.id, entry);
        setActionError(null);
        updateCards(selected, cs => cs.map(c => (c.id === card.id ? { ...c, idList: toList, pos: entry.pos } : c)));
        try {
            await trelloApi.moveCard(card.id, toList, 'bottom');
        } catch (e) {
            // TIMEOUT / NETWORK: the PUT may have been applied upstream, so the outcome is unknown. Show the server's truth, don't revert it.
            const unknown = e instanceof TrelloApiError && (e.code === 'TIMEOUT' || e.code === 'NETWORK');
            if (unknown) refetchBoard();
            // A definite failure: roll back only if this move is still the latest one for the card.
            else if (pendingMoves.current.get(card.id) === entry) {
                updateCards(selected, cs => cs.map(c => (c.id === card.id && c.idList === toList ? { ...c, idList: from, pos: fromPos } : c)));
            }
            setActionError(e);
        } finally {
            if (pendingMoves.current.get(card.id) === entry) pendingMoves.current.delete(card.id);
        }
    }, [cards, updateCards, selected, pendingMoves, refetchBoard, setActionError]);

    const createCard = useCallback(async (listId: string, name: string) => {
        setActionError(null);
        try {
            const card = await trelloApi.createCard({ name, listId });
            // A refetch that landed while the POST was in flight may already contain the card.
            updateCards(selected, cs => (cs.some(c => c.id === card.id) ? cs : [...cs, card]));
            return true;
        } catch (e) {
            setActionError(e);
            return false;
        }
    }, [updateCards, selected, setActionError]);

    const closeDetail = () => {
        const id = d.openId;
        d.close();
        // Query by id, not a saved element: moving the card via the dialog remounts its button.
        const btn = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-card-id]') ?? []).find(el => el.dataset.cardId === id);
        btn?.focus();
    };

    const onDragStart = (e: DragEvent<HTMLButtonElement>, id: string) => {
        setDragId(id);
        try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id); // Firefox needs data to start a drag; some browsers/embedders throw
        } catch { /* the drag still works from dragId */ }
    };
    const onDragEnd = () => { setDragId(null); setOverId(null); };
    const onDragOver = (e: DragEvent, listId: string) => {
        if (!dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOverId(listId);
    };
    const onDragLeave = (e: DragEvent, listId: string) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverId(p => (p === listId ? null : p));
    };
    const onDrop = (e: DragEvent, listId: string) => {
        e.preventDefault();
        const card = cards.find(c => c.id === dragId);
        onDragEnd();
        if (card) void moveCard(card, listId);
    };

    if (b.boardsLoading && b.boards.length === 0) {
        return (
            <div className="trello-board">
                <div className="trello-board--loading">
                    <div className="trello-spinner" />
                    <p className="trello-status" role="status">{TRELLO_A11Y.loadingBoards}</p>
                </div>
            </div>
        );
    }
    if (b.boards.length === 0) {
        return (
            <div className="trello-board">
                {b.boardsError != null
                    ? <Failure error={b.boardsError} isAdmin={isAdmin} onRetry={() => void b.loadBoards(false)} />
                    : <div className="trello-empty-state"><p>No Trello boards are available to this account.</p></div>}
            </div>
        );
    }

    // A failed refetch with a board already on screen is a banner; with nothing to show it replaces the board.
    const alertError = actionError ?? (b.visible ? b.boardError : null) ?? b.boardsError;
    const refreshing = (b.boardsLoading || b.boardLoading) && !!b.visible;
    const openCard = cards.find(c => c.id === d.openId) ?? d.detail?.card;

    return (
        <div className="trello-board" ref={rootRef}>
            <div className="trello-toolbar">
                <select className="trello-board-select" aria-label={TRELLO_A11Y.boardSelect} value={b.selected} onChange={e => b.setSelected(e.target.value)}>
                    <option value="" disabled>Select a board</option>
                    {b.boards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}
                </select>
                <button type="button" className="trello-btn trello-btn--icon" onClick={b.refresh} aria-label={TRELLO_A11Y.refresh}>
                    <RefreshCw size={16} aria-hidden />
                </button>
                <span className="trello-status" role="status">
                    {refreshing && <><span className="trello-loading-dot" aria-hidden="true" /><span className="sr-only">Refreshing…</span></>}
                </span>
            </div>
            {alertError != null && !d.openId && (
                <div className="trello-alert" role="alert">
                    <span>{describeTrelloError(alertError, { isAdmin })}</span>
                    <button type="button" className="trello-alert__dismiss" aria-label="Dismiss" onClick={b.dismissErrors}><X size={14} aria-hidden /></button>
                </div>
            )}
            {b.visible?.truncated && <div className="trello-banner--truncated">Showing the first 1,000 cards of this board.</div>}

            {!b.visible && b.boardError != null && <Failure error={b.boardError} isAdmin={isAdmin} onRetry={b.retryBoard} />}
            {!b.visible && b.boardError == null && (
                <div className="trello-board--loading">
                    <div className="trello-spinner" />
                    <p className="trello-status">Loading board…</p>
                </div>
            )}
            {b.visible && lists.length === 0 && <div className="trello-empty-state"><p>This board has no lists yet.</p></div>}
            {b.visible && lists.length > 0 && (
                <div className="trello-columns">
                    {lists.map(list => {
                        const listCards = byList.get(list.id) ?? NO_CARDS;
                        return (
                            <div
                                key={list.id}
                                className={`${TRELLO_A11Y.columnClass}${overId === list.id ? ' trello-column--drag-over' : ''}`}
                                onDragOver={e => onDragOver(e, list.id)}
                                onDragLeave={e => onDragLeave(e, list.id)}
                                onDrop={e => onDrop(e, list.id)}
                            >
                                <div className="trello-column__header">
                                    <h4 className="trello-column__title">{list.name}</h4>
                                    <span className="trello-column__count">{listCards.length}</span>
                                </div>
                                <div className="trello-column__cards">
                                    {listCards.map(card => (
                                        <CardButton key={card.id} card={card} dragging={dragId === card.id} onOpen={id => void d.open(id)} onDragStart={onDragStart} onDragEnd={onDragEnd} />
                                    ))}
                                    {addingTo === list.id
                                        ? <AddCard onCreate={name => createCard(list.id, name)} onClose={() => closeAdd(list.id)} />
                                        : <button type="button" className="trello-add-card-btn" data-add-for={list.id} onClick={() => setAddingTo(list.id)}>{TRELLO_A11Y.addCardOpen}</button>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {d.openId && (
                <DetailDialog
                    title={openCard?.name ?? ''}
                    error={d.error ?? actionError}
                    loading={!d.detail && d.error == null}
                    isAdmin={isAdmin}
                    detail={d.detail}
                    lists={lists}
                    listId={openCard?.idList ?? ''}
                    onMove={listId => { if (openCard) void moveCard(openCard, listId); }}
                    onClose={closeDetail}
                />
            )}
        </div>
    );
}

export default function TrelloBoard() {
    const user = useContext(UserContext)?.user;
    // Keyed by account: switching users unmounts the view, which aborts requests and drops all board/detail state.
    return <TrelloBoardView key={user?.id ?? 'anonymous'} isAdmin={user?.role === 'god'} />;
}
