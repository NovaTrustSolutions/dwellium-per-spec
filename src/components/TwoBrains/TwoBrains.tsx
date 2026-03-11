import { useState, useEffect, useCallback } from 'react';
import { useUser } from '../../context/UserContext';
import './TwoBrains.css';

interface SharedItem {
    id: string;
    title: string;
    description: string;
    type: 'note' | 'task' | 'link' | 'file' | 'idea';
    color: string;
    addedBy: string;
    addedByName: string;
    position: { x: number; y: number };
    createdAt: string;
    updatedAt: string;
    pinned: boolean;
}

interface AuditEntry {
    id: string;
    action: string;
    itemTitle: string;
    performedBy: string;
    timestamp: string;
    details?: string;
}

const TYPE_ICONS: Record<string, string> = {
    note: '📝',
    task: '✅',
    link: '🔗',
    file: '📄',
    idea: '💡',
};

const ALLOWED_EMAILS = ['andy@dwellium.com', 'lisa@zpgroup.io'];

export default function TwoBrains() {
    const { user, authFetch } = useUser();
    const [items, setItems] = useState<SharedItem[]>([]);
    const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
    const [activeTab, setActiveTab] = useState<'board' | 'audit'>('board');
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newItem, setNewItem] = useState({ title: '', description: '', type: 'note' as SharedItem['type'] });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState({ title: '', description: '' });

    const isAllowed = user && ALLOWED_EMAILS.includes(user.email);

    const fetchItems = useCallback(async () => {
        try {
            const res = await authFetch('/api/two-brains/items');
            const data = await res.json();
            if (data.success) setItems(data.data);
        } catch (err) {
            console.error('Failed to fetch shared items:', err);
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    const fetchAudit = useCallback(async () => {
        try {
            const res = await authFetch('/api/two-brains/audit');
            const data = await res.json();
            if (data.success) setAuditLog(data.data);
        } catch (err) {
            console.error('Failed to fetch audit log:', err);
        }
    }, [authFetch]);

    useEffect(() => {
        if (isAllowed) {
            fetchItems();
            fetchAudit();
        } else {
            setLoading(false);
        }
    }, [isAllowed, fetchItems, fetchAudit]);

    // Poll for real-time updates every 5s
    useEffect(() => {
        if (!isAllowed) return;
        const interval = setInterval(() => {
            fetchItems();
            fetchAudit();
        }, 5000);
        return () => clearInterval(interval);
    }, [isAllowed, fetchItems, fetchAudit]);

    const handleAdd = async () => {
        if (!newItem.title.trim()) return;
        try {
            await authFetch('/api/two-brains/items', {
                method: 'POST',
                body: JSON.stringify(newItem),
            });
            setNewItem({ title: '', description: '', type: 'note' });
            setShowAddForm(false);
            fetchItems();
            fetchAudit();
        } catch (err) {
            console.error('Add failed:', err);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await authFetch(`/api/two-brains/items/${id}`, { method: 'DELETE' });
            fetchItems();
            fetchAudit();
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const handlePin = async (id: string, pinned: boolean) => {
        try {
            await authFetch(`/api/two-brains/items/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ pinned: !pinned }),
            });
            fetchItems();
            fetchAudit();
        } catch (err) {
            console.error('Pin toggle failed:', err);
        }
    };

    const handleEdit = async (id: string) => {
        if (!editData.title.trim()) return;
        try {
            await authFetch(`/api/two-brains/items/${id}`, {
                method: 'PUT',
                body: JSON.stringify(editData),
            });
            setEditingId(null);
            fetchItems();
            fetchAudit();
        } catch (err) {
            console.error('Edit failed:', err);
        }
    };

    const startEdit = (item: SharedItem) => {
        setEditingId(item.id);
        setEditData({ title: item.title, description: item.description });
    };

    const formatTime = (ts: string) => {
        const d = new Date(ts);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'added': return '➕';
            case 'edited': return '✏️';
            case 'removed': return '🗑️';
            case 'moved': return '↔️';
            case 'pinned': return '📌';
            case 'unpinned': return '📌';
            default: return '•';
        }
    };

    // Access denied screen
    if (!isAllowed) {
        return (
            <div className="two-brains">
                <div className="two-brains__denied">
                    <span className="denied-icon">🔒</span>
                    <h2>Two Brains Are Better Than One</h2>
                    <p>This shared workspace is exclusive to <strong>Andy</strong> & <strong>Lisa</strong>.</p>
                    <p className="denied-sub">Contact an administrator to request access.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="two-brains">
            {/* Header */}
            <div className="two-brains__header">
                <div className="header-left">
                    <span className="header-icon">🧠🧠</span>
                    <div>
                        <h2 className="header-title">Two Brains</h2>
                        <p className="header-subtitle">
                            Shared workspace — <span className="user-tag user-tag--andy">Andy</span> & <span className="user-tag user-tag--lisa">Lisa</span>
                        </p>
                    </div>
                </div>
                <div className="header-right">
                    <div className="presence-dots">
                        <span className="presence-dot presence-dot--andy" title="Andy">A</span>
                        <span className="presence-dot presence-dot--lisa" title="Lisa">L</span>
                    </div>
                    <span className="item-count">{items.length} items</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="two-brains__tabs">
                <button
                    className={`tab-btn ${activeTab === 'board' ? 'active' : ''}`}
                    onClick={() => setActiveTab('board')}
                >
                    📋 Board ({items.length})
                </button>
                <button
                    className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                    onClick={() => setActiveTab('audit')}
                >
                    📜 Audit Log ({auditLog.length})
                </button>
                <div className="tab-spacer" />
                {activeTab === 'board' && (
                    <button
                        className="add-item-btn"
                        onClick={() => setShowAddForm(!showAddForm)}
                    >
                        {showAddForm ? '✕ Cancel' : '+ Drop Something'}
                    </button>
                )}
            </div>

            {/* Add Form */}
            {showAddForm && activeTab === 'board' && (
                <div className="add-form">
                    <div className="add-form__row">
                        <input
                            className="add-form__input"
                            placeholder="What's on your mind?"
                            value={newItem.title}
                            onChange={e => setNewItem({ ...newItem, title: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            autoFocus
                        />
                        <select
                            className="add-form__type"
                            value={newItem.type}
                            onChange={e => setNewItem({ ...newItem, type: e.target.value as SharedItem['type'] })}
                        >
                            <option value="note">📝 Note</option>
                            <option value="task">✅ Task</option>
                            <option value="link">🔗 Link</option>
                            <option value="file">📄 File</option>
                            <option value="idea">💡 Idea</option>
                        </select>
                    </div>
                    <textarea
                        className="add-form__desc"
                        placeholder="Add details (optional)..."
                        value={newItem.description}
                        onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                        rows={2}
                    />
                    <button className="add-form__submit" onClick={handleAdd} disabled={!newItem.title.trim()}>
                        Drop It 🎤
                    </button>
                </div>
            )}

            {loading && <div className="two-brains__loading">Loading shared space...</div>}

            {/* Board Tab */}
            {activeTab === 'board' && !loading && (
                <div className="two-brains__board">
                    {items.length === 0 ? (
                        <div className="board-empty">
                            <span className="empty-icon">🧠🤝🧠</span>
                            <p>Drop something to start collaborating!</p>
                        </div>
                    ) : (
                        items.map(item => (
                            <div
                                key={item.id}
                                className={`shared-card ${item.pinned ? 'pinned' : ''}`}
                                style={{ '--card-accent': item.color } as React.CSSProperties}
                            >
                                {/* Editing mode */}
                                {editingId === item.id ? (
                                    <div className="card-edit">
                                        <input
                                            className="card-edit__title"
                                            value={editData.title}
                                            onChange={e => setEditData({ ...editData, title: e.target.value })}
                                            onKeyDown={e => e.key === 'Enter' && handleEdit(item.id)}
                                            autoFocus
                                        />
                                        <textarea
                                            className="card-edit__desc"
                                            value={editData.description}
                                            onChange={e => setEditData({ ...editData, description: e.target.value })}
                                            rows={2}
                                        />
                                        <div className="card-edit__actions">
                                            <button className="card-edit__save" onClick={() => handleEdit(item.id)}>Save</button>
                                            <button className="card-edit__cancel" onClick={() => setEditingId(null)}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="card-top">
                                            <span className="card-type">{TYPE_ICONS[item.type]} {item.type}</span>
                                            <div className="card-actions">
                                                <button onClick={() => handlePin(item.id, item.pinned)} title={item.pinned ? 'Unpin' : 'Pin'}>
                                                    {item.pinned ? '📌' : '📌'}
                                                </button>
                                                <button onClick={() => startEdit(item)} title="Edit">✏️</button>
                                                <button onClick={() => handleDelete(item.id)} title="Remove">🗑️</button>
                                            </div>
                                        </div>
                                        <h3 className="card-title">{item.title}</h3>
                                        {item.description && <p className="card-desc">{item.description}</p>}
                                        <div className="card-meta">
                                            <span className={`card-author ${item.addedByName === 'Andy' ? 'author-andy' : 'author-lisa'}`}>
                                                {item.addedByName === 'Andy' ? '🅰️' : '🅻'} {item.addedByName}
                                            </span>
                                            <span className="card-time">{formatTime(item.createdAt)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Audit Tab */}
            {activeTab === 'audit' && !loading && (
                <div className="two-brains__audit">
                    {auditLog.length === 0 ? (
                        <div className="board-empty">
                            <span className="empty-icon">📜</span>
                            <p>No activity yet</p>
                        </div>
                    ) : (
                        auditLog.map(entry => (
                            <div key={entry.id} className="audit-entry">
                                <span className="audit-icon">{getActionIcon(entry.action)}</span>
                                <div className="audit-content">
                                    <p className="audit-text">
                                        <strong className={entry.performedBy === 'Andy' ? 'author-andy' : 'author-lisa'}>
                                            {entry.performedBy}
                                        </strong>{' '}
                                        {entry.action}{' '}
                                        <span className="audit-item-name">"{entry.itemTitle}"</span>
                                    </p>
                                    {entry.details && <p className="audit-detail">{entry.details}</p>}
                                    <span className="audit-time">{formatTime(entry.timestamp)}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
