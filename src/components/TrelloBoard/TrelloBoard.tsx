import { useState, useEffect, useCallback, useRef } from 'react';
import './TrelloBoard.css';
import { API_BASE } from '../../config';

const API = `${API_BASE}/api/trello`;

/** Authenticated fetch — attaches the JWT from localStorage */
function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = localStorage.getItem('dwellium-auth-token');
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string> || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...init, headers });
}

// ── Types ──────────────────────────────────────────

interface TrelloBoard {
    id: string;
    name: string;
    url: string;
}

interface TrelloList {
    id: string;
    name: string;
    idBoard: string;
}

interface TrelloLabel {
    id: string;
    name: string;
    color: string;
}

interface TrelloCard {
    id: string;
    name: string;
    desc: string;
    url: string;
    idList: string;
    labels?: TrelloLabel[];
    due?: string | null;
    pos: number;
}

interface CheckItem {
    id: string;
    name: string;
    state: 'complete' | 'incomplete';
}

interface Checklist {
    id: string;
    name: string;
    checkItems: CheckItem[];
}

interface Attachment {
    id: string;
    name: string;
    url: string;
    date: string;
}

interface CardDetail {
    id: string;
    name: string;
    desc: string;
    url: string;
    idList: string;
    labels?: TrelloLabel[];
    due?: string | null;
    dateLastActivity?: string;
    checklists?: Checklist[];
    attachments?: Attachment[];
    members?: { id: string; fullName: string; avatarUrl?: string }[];
}

interface Activity {
    id: string;
    type: string;
    date: string;
    memberCreator?: { fullName: string };
    data?: {
        text?: string;
        card?: { name: string };
        listBefore?: { name: string };
        listAfter?: { name: string };
    };
}

// ── Color map for Trello label colors ──────────────

const LABEL_COLORS: Record<string, string> = {
    green: '#61bd4f',
    yellow: '#f2d600',
    orange: '#ff9f1a',
    red: '#eb5a46',
    purple: '#c377e0',
    blue: '#0079bf',
    sky: '#00c2e0',
    lime: '#51e898',
    pink: '#ff78cb',
    black: '#344563',
};

// ── Component ──────────────────────────────────────

export default function TrelloBoard() {
    const [boards, setBoards] = useState<TrelloBoard[]>([]);
    const [selectedBoard, setSelectedBoard] = useState<string>('');
    const [lists, setLists] = useState<TrelloList[]>([]);
    const [cards, setCards] = useState<TrelloCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Drag state
    const [dragCardId, setDragCardId] = useState<string | null>(null);
    const [dragOverListId, setDragOverListId] = useState<string | null>(null);
    const didDrag = useRef(false);

    // Add-card state
    const [addingToList, setAddingToList] = useState<string | null>(null);
    const [newCardName, setNewCardName] = useState('');
    const addInputRef = useRef<HTMLInputElement>(null);

    // Detail panel state
    const [activeCard, setActiveCard] = useState<CardDetail | null>(null);
    const [activity, setActivity] = useState<Activity[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    // ── Fetch boards ───────────────────────────────

    useEffect(() => {
        setLoading(true);
        setError(null);
        authFetch(`${API}/boards`)
            .then(r => r.json())
            .then(res => {
                if (res.success && res.data) {
                    setBoards(res.data);
                    if (res.data.length > 0 && !selectedBoard) {
                        setSelectedBoard(res.data[0].id);
                    }
                } else {
                    setError(res.error || 'Failed to load boards');
                }
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Fetch lists + cards when board changes ─────

    useEffect(() => {
        if (!selectedBoard) return;
        setLoading(true);
        setError(null);

        Promise.all([
            authFetch(`${API}/boards/${selectedBoard}/lists`).then(r => r.json()),
        ])
            .then(async ([listsRes]) => {
                if (!listsRes.success) throw new Error(listsRes.error || 'Failed to load lists');
                const fetchedLists: TrelloList[] = listsRes.data;
                setLists(fetchedLists);

                const cardResults = await Promise.all(
                    fetchedLists.map(l =>
                        authFetch(`${API}/lists/${l.id}/cards`)
                            .then(r => r.json())
                            .then(res => (res.success ? res.data : []))
                    )
                );
                setCards(cardResults.flat());
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [selectedBoard]);

    // ── Card Click → Detail Panel ──────────────────

    const openCardDetail = useCallback(async (cardId: string) => {
        setDetailLoading(true);
        setActiveCard(null);
        setActivity([]);

        try {
            const [cardRes, actRes] = await Promise.all([
                authFetch(`${API}/cards/${cardId}`).then(r => r.json()),
                authFetch(`${API}/cards/${cardId}/activity`).then(r => r.json()),
            ]);

            if (cardRes.success) setActiveCard(cardRes.data);
            if (actRes.success) setActivity(actRes.data || []);
        } catch {
            // fail silently — card summary is still shown
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const closeDetail = useCallback(() => {
        setActiveCard(null);
        setActivity([]);
    }, []);

    // ── Drag & Drop ────────────────────────────────

    const onDragStart = useCallback((cardId: string) => {
        didDrag.current = false;
        setDragCardId(cardId);
    }, []);

    const onDragOver = useCallback((e: React.DragEvent, listId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        didDrag.current = true;
        setDragOverListId(listId);
    }, []);

    const onDragLeave = useCallback(() => {
        setDragOverListId(null);
    }, []);

    const onDrop = useCallback(async (listId: string) => {
        if (!dragCardId) return;
        const card = cards.find(c => c.id === dragCardId);
        if (!card || card.idList === listId) {
            setDragCardId(null);
            setDragOverListId(null);
            return;
        }

        setCards(prev => prev.map(c =>
            c.id === dragCardId ? { ...c, idList: listId } : c
        ));
        setDragCardId(null);
        setDragOverListId(null);

        try {
            await authFetch(`${API}/cards/${dragCardId}/move`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listId })
            });
        } catch {
            setCards(prev => prev.map(c =>
                c.id === dragCardId ? { ...c, idList: card.idList } : c
            ));
        }
    }, [dragCardId, cards]);

    const onCardClick = useCallback((cardId: string) => {
        // Only open detail if this wasn't a drag
        if (!didDrag.current) {
            openCardDetail(cardId);
        }
        didDrag.current = false;
    }, [openCardDetail]);

    // ── Add Card ───────────────────────────────────

    const handleAddCard = useCallback(async (listId: string) => {
        if (!newCardName.trim()) return;
        const name = newCardName.trim();
        setNewCardName('');
        setAddingToList(null);

        try {
            const res = await authFetch(`${API}/cards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, listId })
            });
            const json = await res.json();
            if (json.success && json.data) {
                setCards(prev => [...prev, json.data]);
            }
        } catch {
            // silent fail
        }
    }, [newCardName]);

    useEffect(() => {
        if (addingToList && addInputRef.current) {
            addInputRef.current.focus();
        }
    }, [addingToList]);

    // ── Refresh ────────────────────────────────────

    const refresh = useCallback(() => {
        if (selectedBoard) {
            const boardId = selectedBoard;
            setSelectedBoard('');
            setTimeout(() => setSelectedBoard(boardId), 50);
        }
    }, [selectedBoard]);

    // ── Helper: list name from id ──────────────────

    const getListName = useCallback((listId: string) => {
        return lists.find(l => l.id === listId)?.name || 'Unknown';
    }, [lists]);

    // ── Render ──────────────────────────────────────

    if (loading && boards.length === 0) {
        return (
            <div className="trello-board trello-board--loading">
                <div className="trello-spinner" />
                <p>Connecting to Trello…</p>
            </div>
        );
    }

    if (error && boards.length === 0) {
        return (
            <div className="trello-board trello-board--error">
                <span className="trello-error-icon">⚠️</span>
                <p>{error}</p>
                <button className="trello-btn" onClick={() => window.location.reload()}>Retry</button>
            </div>
        );
    }

    return (
        <div className="trello-board">
            {/* Toolbar */}
            <div className="trello-toolbar">
                <select
                    className="trello-board-select"
                    value={selectedBoard}
                    onChange={e => setSelectedBoard(e.target.value)}
                >
                    <option value="" disabled>Select a board</option>
                    {boards.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
                <button className="trello-btn trello-btn--icon" onClick={refresh} title="Refresh">
                    🔄
                </button>
                {loading && <span className="trello-loading-dot" />}
            </div>

            {error && (
                <div className="trello-inline-error">
                    ⚠️ {error}
                </div>
            )}

            {/* Kanban Columns */}
            <div className="trello-columns">
                {lists.map(list => {
                    const listCards = cards
                        .filter(c => c.idList === list.id)
                        .sort((a, b) => a.pos - b.pos);
                    const isDragOver = dragOverListId === list.id;

                    return (
                        <div
                            key={list.id}
                            className={`trello-column ${isDragOver ? 'trello-column--drag-over' : ''}`}
                            onDragOver={e => onDragOver(e, list.id)}
                            onDragLeave={onDragLeave}
                            onDrop={() => onDrop(list.id)}
                        >
                            <div className="trello-column__header">
                                <h4 className="trello-column__title">{list.name}</h4>
                                <span className="trello-column__count">{listCards.length}</span>
                            </div>

                            <div className="trello-column__cards">
                                {listCards.map(card => (
                                    <div
                                        key={card.id}
                                        className={`trello-card ${dragCardId === card.id ? 'trello-card--dragging' : ''}`}
                                        draggable
                                        onDragStart={() => onDragStart(card.id)}
                                        onClick={() => onCardClick(card.id)}
                                    >
                                        {card.labels && card.labels.length > 0 && (
                                            <div className="trello-card__labels">
                                                {card.labels.map(label => (
                                                    <span
                                                        key={label.id}
                                                        className="trello-card__label"
                                                        style={{ background: LABEL_COLORS[label.color] || label.color }}
                                                        title={label.name}
                                                    >
                                                        {label.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <span className="trello-card__title">{card.name}</span>
                                        {card.due && (
                                            <span className="trello-card__due">
                                                🕐 {new Date(card.due).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                ))}

                                {/* Add Card */}
                                {addingToList === list.id ? (
                                    <div className="trello-add-card-form">
                                        <input
                                            ref={addInputRef}
                                            className="trello-add-card-input"
                                            value={newCardName}
                                            onChange={e => setNewCardName(e.target.value)}
                                            placeholder="Enter card title…"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleAddCard(list.id);
                                                if (e.key === 'Escape') { setAddingToList(null); setNewCardName(''); }
                                            }}
                                        />
                                        <div className="trello-add-card-actions">
                                            <button
                                                className="trello-btn trello-btn--primary"
                                                onClick={() => handleAddCard(list.id)}
                                            >
                                                Add
                                            </button>
                                            <button
                                                className="trello-btn"
                                                onClick={() => { setAddingToList(null); setNewCardName(''); }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        className="trello-add-card-btn"
                                        onClick={() => setAddingToList(list.id)}
                                    >
                                        + Add a card
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Card Detail Panel ──────────────────── */}
            {(activeCard || detailLoading) && (
                <div className="trello-detail-overlay" onClick={closeDetail}>
                    <div className="trello-detail-panel" onClick={e => e.stopPropagation()}>
                        {detailLoading ? (
                            <div className="trello-detail-loading">
                                <div className="trello-spinner" />
                                <p>Loading card…</p>
                            </div>
                        ) : activeCard && (
                            <>
                                {/* Header */}
                                <div className="trello-detail__header">
                                    <h3 className="trello-detail__title">{activeCard.name}</h3>
                                    <button className="trello-detail__close" onClick={closeDetail}>✕</button>
                                </div>

                                {/* Meta: list + due */}
                                <div className="trello-detail__meta">
                                    <span className="trello-detail__list-badge">
                                        📋 {getListName(activeCard.idList)}
                                    </span>
                                    {activeCard.due && (
                                        <span className="trello-detail__due-badge">
                                            🕐 {new Date(activeCard.due).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>

                                {/* Labels */}
                                {activeCard.labels && activeCard.labels.length > 0 && (
                                    <div className="trello-detail__labels">
                                        {activeCard.labels.map(l => (
                                            <span
                                                key={l.id}
                                                className="trello-detail__label-chip"
                                                style={{ background: LABEL_COLORS[l.color] || l.color }}
                                            >
                                                {l.name || l.color}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Scrollable body */}
                                <div className="trello-detail__body">
                                    {/* Description */}
                                    {activeCard.desc ? (
                                        <section className="trello-detail__section">
                                            <h4>📝 Description</h4>
                                            <div className="trello-detail__desc">
                                                {activeCard.desc}
                                            </div>
                                        </section>
                                    ) : (
                                        <section className="trello-detail__section">
                                            <h4>📝 Description</h4>
                                            <p className="trello-detail__empty-text">No description</p>
                                        </section>
                                    )}

                                    {/* Checklists */}
                                    {activeCard.checklists && activeCard.checklists.length > 0 && (
                                        <section className="trello-detail__section">
                                            <h4>☑️ Checklists</h4>
                                            {activeCard.checklists.map(cl => {
                                                const done = cl.checkItems.filter(i => i.state === 'complete').length;
                                                const total = cl.checkItems.length;
                                                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                                return (
                                                    <div key={cl.id} className="trello-detail__checklist">
                                                        <div className="trello-detail__checklist-header">
                                                            <span>{cl.name}</span>
                                                            <span className="trello-detail__checklist-count">
                                                                {done}/{total}
                                                            </span>
                                                        </div>
                                                        <div className="trello-detail__progress-track">
                                                            <div
                                                                className="trello-detail__progress-fill"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <ul className="trello-detail__check-items">
                                                            {cl.checkItems.map(item => (
                                                                <li key={item.id} className={item.state === 'complete' ? 'checked' : ''}>
                                                                    <span className="trello-detail__check-box">
                                                                        {item.state === 'complete' ? '☑' : '☐'}
                                                                    </span>
                                                                    {item.name}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                );
                                            })}
                                        </section>
                                    )}

                                    {/* Attachments */}
                                    {activeCard.attachments && activeCard.attachments.length > 0 && (
                                        <section className="trello-detail__section">
                                            <h4>📎 Attachments</h4>
                                            <div className="trello-detail__attachments">
                                                {activeCard.attachments.map(att => (
                                                    <a
                                                        key={att.id}
                                                        className="trello-detail__attachment"
                                                        href={att.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <span className="trello-detail__attachment-icon">📄</span>
                                                        <span className="trello-detail__attachment-name">{att.name}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {/* Activity / Comments */}
                                    {activity.length > 0 && (
                                        <section className="trello-detail__section">
                                            <h4>💬 Activity</h4>
                                            <div className="trello-detail__activity">
                                                {activity.slice(0, 20).map(act => (
                                                    <div key={act.id} className="trello-detail__activity-item">
                                                        <span className="trello-detail__activity-author">
                                                            {act.memberCreator?.fullName || 'Unknown'}
                                                        </span>
                                                        <span className="trello-detail__activity-text">
                                                            {act.type === 'commentCard'
                                                                ? act.data?.text
                                                                : act.type === 'updateCard' && act.data?.listAfter
                                                                    ? `moved to ${act.data.listAfter.name}`
                                                                    : act.type.replace(/([A-Z])/g, ' $1').toLowerCase()
                                                            }
                                                        </span>
                                                        <span className="trello-detail__activity-date">
                                                            {new Date(act.date).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </div>

                                {/* Footer: Open in Trello */}
                                <div className="trello-detail__footer">
                                    <a
                                        className="trello-btn trello-btn--primary trello-detail__open-link"
                                        href={activeCard.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Open in Trello ↗
                                    </a>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
