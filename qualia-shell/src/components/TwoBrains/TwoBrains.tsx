import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '../../context/UserContext';
import './TwoBrains.css';

/* ─── Types ─── */
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
    tags: string[];
    assignee: string | null;
    status: 'open' | 'in-progress' | 'done' | 'blocked';
    dueDate: string | null;
    dragSource: string | null;
    sourceId: string | null;
}

interface ChatMessage {
    id: string;
    senderEmail: string;
    senderName: string;
    body: string;
    timestamp: string;
    replyTo: string | null;
    attachedItemId: string | null;
    reactions: { emoji: string; by: string }[];
}

interface AuditEntry {
    id: string;
    action: string;
    itemTitle: string;
    performedBy: string;
    timestamp: string;
    details?: string;
}

/* ─── Constants ─── */
const TYPE_ICONS: Record<string, string> = { note: '📝', task: '✅', link: '🔗', file: '📄', idea: '💡' };
const STATUS_LABELS: Record<string, { label: string; icon: string; cls: string }> = {
    open: { label: 'Open', icon: '⭕', cls: 'status-open' },
    'in-progress': { label: 'In Progress', icon: '🔄', cls: 'status-progress' },
    done: { label: 'Done', icon: '✅', cls: 'status-done' },
    blocked: { label: 'Blocked', icon: '🚫', cls: 'status-blocked' },
};
const QUICK_REACTIONS = ['👍', '❤️', '🔥', '👀', '🎯'];
// SECURITY: Email allowlist moved to server-side. See twoBrainsStore.ts + twoBrainsRoutes.ts.

export default function TwoBrains() {
    const { user, authFetch } = useUser();
    const [items, setItems] = useState<SharedItem[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
    const [activeView, setActiveView] = useState<'split' | 'board' | 'chat' | 'tasks' | 'audit' | 'screen'>('split');
    const [loading, setLoading] = useState(true);

    // Board state
    const [showAddForm, setShowAddForm] = useState(false);
    const [newItem, setNewItem] = useState({ title: '', description: '', type: 'note' as SharedItem['type'], assignee: '', tags: '' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState({ title: '', description: '' });
    const [isDragOver, setIsDragOver] = useState(false);

    // Chat state
    const [chatInput, setChatInput] = useState('');
    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);

    // Tag input
    const [tagInput, setTagInput] = useState<{ itemId: string; value: string } | null>(null);

    // Screen sharing state
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [remoteScreen, setRemoteScreen] = useState<string | null>(null);
    const [remoteScreenUser, setRemoteScreenUser] = useState<string>('');
    const [screenShareInterval, setScreenShareIntervalState] = useState<number>(2); // seconds
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const screenCaptureTimerRef = useRef<number | null>(null);
    const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // SECURITY: Auth check via server — no client-side email list
    const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
    const myName = user?.name || 'Unknown';

    useEffect(() => {
        if (!user) { setIsAllowed(false); return; }
        authFetch('/api/two-brains/authorized')
            .then(r => r.json())
            .then(d => setIsAllowed(d.authorized === true))
            .catch(() => setIsAllowed(false));
    }, [user, authFetch]);

    /* ─── Data Fetching ─── */
    const fetchItems = useCallback(async () => {
        try {
            const res = await authFetch('/api/two-brains/items');
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setItems(data.data);
        } catch { /* silent */ }
    }, [authFetch]);

    const fetchMessages = useCallback(async () => {
        try {
            const res = await authFetch('/api/two-brains/chat');
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setMessages(data.data);
        } catch { /* silent */ }
    }, [authFetch]);

    const fetchAudit = useCallback(async () => {
        try {
            const res = await authFetch('/api/two-brains/audit');
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setAuditLog(data.data);
        } catch { /* silent */ }
    }, [authFetch]);

    useEffect(() => {
        if (isAllowed) {
            Promise.all([fetchItems(), fetchMessages(), fetchAudit()]).then(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [isAllowed, fetchItems, fetchMessages, fetchAudit]);

    // Real-time polling every 3s
    useEffect(() => {
        if (!isAllowed) return;
        const interval = setInterval(() => {
            fetchItems();
            fetchMessages();
            // Poll remote screen shares
            fetchRemoteScreen();
        }, 3000);
        return () => clearInterval(interval);
    }, [isAllowed, fetchItems, fetchMessages]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    /* ─── Item CRUD ─── */
    const addItem = async () => {
        if (!newItem.title.trim()) return;
        const tags = newItem.tags.split(',').map(t => t.trim()).filter(Boolean);
        await authFetch('/api/two-brains/items', {
            method: 'POST',
            body: JSON.stringify({ ...newItem, tags, assignee: newItem.assignee || null }),
        });
        setNewItem({ title: '', description: '', type: 'note', assignee: '', tags: '' });
        setShowAddForm(false);
        fetchItems(); fetchAudit();
    };

    const deleteItem = async (id: string) => {
        await authFetch(`/api/two-brains/items/${id}`, { method: 'DELETE' });
        fetchItems(); fetchAudit();
    };

    const togglePin = async (id: string, pinned: boolean) => {
        await authFetch(`/api/two-brains/items/${id}`, { method: 'PUT', body: JSON.stringify({ pinned: !pinned }) });
        fetchItems();
    };

    const saveEdit = async (id: string) => {
        if (!editData.title.trim()) return;
        await authFetch(`/api/two-brains/items/${id}`, { method: 'PUT', body: JSON.stringify(editData) });
        setEditingId(null);
        fetchItems(); fetchAudit();
    };

    const cycleStatus = async (item: SharedItem) => {
        const order: SharedItem['status'][] = ['open', 'in-progress', 'done', 'blocked'];
        const currentStatus = item.status || 'open';
        const next = order[(order.indexOf(currentStatus) + 1) % order.length];
        await authFetch(`/api/two-brains/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) });
        fetchItems(); fetchAudit();
    };

    const assignItem = async (id: string, assignee: string | null) => {
        await authFetch(`/api/two-brains/items/${id}`, { method: 'PUT', body: JSON.stringify({ assignee }) });
        fetchItems(); fetchAudit();
    };

    const addTag = async (itemId: string, tag: string) => {
        const item = items.find(i => i.id === itemId);
        if (!item || !tag.trim()) return;
        const tags = [...new Set([...(item.tags || []), tag.trim()])];
        await authFetch(`/api/two-brains/items/${itemId}`, { method: 'PUT', body: JSON.stringify({ tags }) });
        setTagInput(null);
        fetchItems();
    };

    const removeTag = async (itemId: string, tag: string) => {
        const item = items.find(i => i.id === itemId);
        if (!item) return;
        const tags = (item.tags || []).filter(t => t !== tag);
        await authFetch(`/api/two-brains/items/${itemId}`, { method: 'PUT', body: JSON.stringify({ tags }) });
        fetchItems();
    };

    /* ─── Chat ─── */
    const sendMessage = async () => {
        if (!chatInput.trim()) return;
        await authFetch('/api/two-brains/chat', {
            method: 'POST',
            body: JSON.stringify({ body: chatInput, replyTo: replyTo?.id || null }),
        });
        setChatInput('');
        setReplyTo(null);
        fetchMessages(); fetchItems(); fetchAudit();
        chatInputRef.current?.focus();
    };

    const toggleReaction = async (msgId: string, emoji: string) => {
        await authFetch(`/api/two-brains/chat/${msgId}/react`, {
            method: 'POST',
            body: JSON.stringify({ emoji }),
        });
        fetchMessages();
    };

    /* ─── Screen Sharing ─── */
    const fetchRemoteScreen = useCallback(async () => {
        try {
            const res = await authFetch('/api/two-brains/screen');
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && data.data) {
                // Only show the OTHER person's screen
                if (data.data.sharedBy !== myName) {
                    setRemoteScreen(data.data.image);
                    setRemoteScreenUser(data.data.sharedBy);
                }
            } else {
                setRemoteScreen(null);
                setRemoteScreenUser('');
            }
        } catch { /* silent */ }
    }, [authFetch, myName]);

    const startScreenShare = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 5, max: 10 } },
                audio: false,
            });
            screenStreamRef.current = stream;
            setIsScreenSharing(true);

            // Display local preview
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            // Listen for the user stopping via browser UI
            stream.getVideoTracks()[0].onended = () => stopScreenShare();

            // Create offscreen canvas for screenshots
            if (!screenCanvasRef.current) {
                screenCanvasRef.current = document.createElement('canvas');
            }

            // Start sending snapshots at interval
            const captureAndSend = async () => {
                const track = stream.getVideoTracks()[0];
                if (!track || track.readyState !== 'live') { stopScreenShare(); return; }

                const settings = track.getSettings();
                const canvas = screenCanvasRef.current!;
                canvas.width = settings.width || 1280;
                canvas.height = settings.height || 720;
                const ctx = canvas.getContext('2d');
                if (!ctx || !localVideoRef.current) return;
                ctx.drawImage(localVideoRef.current, 0, 0, canvas.width, canvas.height);

                // Compress to JPEG, quality 0.5 for speed
                const dataUrl = canvas.toDataURL('image/jpeg', 0.5);

                try {
                    await authFetch('/api/two-brains/screen', {
                        method: 'POST',
                        body: JSON.stringify({ image: dataUrl }),
                    });
                } catch { /* silent */ }
            };

            // Wait for video to be ready then start capturing
            setTimeout(() => {
                captureAndSend();
                screenCaptureTimerRef.current = window.setInterval(captureAndSend, screenShareInterval * 1000);
            }, 500);

            // Send chat notification
            await authFetch('/api/two-brains/chat', {
                method: 'POST',
                body: JSON.stringify({ body: `🖥️ ${myName} started sharing their screen`, replyTo: null }),
            });
            fetchMessages();
        } catch (err) {
            console.error('Screen share failed:', err);
        }
    };

    const stopScreenShare = async () => {
        if (screenCaptureTimerRef.current) {
            clearInterval(screenCaptureTimerRef.current);
            screenCaptureTimerRef.current = null;
        }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
        }
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }
        setIsScreenSharing(false);

        // Clear from server
        try {
            await authFetch('/api/two-brains/screen', { method: 'DELETE' });
        } catch { /* silent */ }

        // Notify in chat
        try {
            await authFetch('/api/two-brains/chat', {
                method: 'POST',
                body: JSON.stringify({ body: `🖥️ ${myName} stopped sharing their screen`, replyTo: null }),
            });
            fetchMessages();
        } catch { /* silent */ }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (screenCaptureTimerRef.current) clearInterval(screenCaptureTimerRef.current);
            if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    /* ─── Drag & Drop ─── */
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
    const handleDragLeave = () => setIsDragOver(false);
    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        // Try to parse structured JSON data from other widgets
        const jsonData = e.dataTransfer.getData('application/json');
        const textData = e.dataTransfer.getData('text/plain');

        let title = '';
        let description = '';
        let type: SharedItem['type'] = 'note';
        let dragSource: string | null = null;
        let sourceId: string | null = null;

        if (jsonData) {
            try {
                const parsed = JSON.parse(jsonData);
                title = parsed.title || parsed.name || parsed.subject || 'Dropped Item';
                description = parsed.description || parsed.snippet || parsed.body || '';
                type = parsed.type === 'file' ? 'file' : parsed.type === 'task' ? 'task' : 'note';
                dragSource = parsed.source || parsed.widget || null;
                sourceId = parsed.id || null;
            } catch {
                title = jsonData.slice(0, 100);
            }
        } else if (textData) {
            title = textData.slice(0, 100);
            description = textData.length > 100 ? textData : '';
        }

        // Handle dropped files from the OS
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            title = file.name;
            description = `File: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
            type = 'file';
            dragSource = 'desktop';
        }

        if (!title) return;

        await authFetch('/api/two-brains/items', {
            method: 'POST',
            body: JSON.stringify({ title, description, type, dragSource, sourceId }),
        });
        fetchItems(); fetchAudit();
    };

    /* ─── Helpers ─── */
    const formatTime = (ts: string) => {
        const d = new Date(ts);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    const formatChatTime = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getActionIcon = (a: string) => {
        const icons: Record<string, string> = { added: '➕', edited: '✏️', removed: '🗑️', moved: '↔️', pinned: '📌', unpinned: '📌', tagged: '🏷️', assigned: '👤', 'status-changed': '🔄', message: '💬', dropped: '📦' };
        return icons[a] || '•';
    };

    const taskItems = items.filter(i => i.type === 'task');
    const myTasks = taskItems.filter(i => i.assignee === myName);

    /* ─── Auth Loading ─── */
    if (isAllowed === null) {
        return (
            <div className="two-brains">
                <div className="two-brains__loading">Checking access…</div>
            </div>
        );
    }

    /* ─── Access Denied ─── */
    if (!isAllowed) {
        return (
            <div className="two-brains">
                <div className="two-brains__denied">
                    <span className="denied-icon">🔒</span>
                    <h2>Two Brains Are Better Than One</h2>
                    <p>This shared workspace requires authorization.</p>
                    <p className="denied-sub">Contact an administrator to request access.</p>
                </div>
            </div>
        );
    }

    /* ─── RENDER ─── */
    return (
        <div className="two-brains">
            {/* ── Header ── */}
            <div className="two-brains__header">
                <div className="header-left">
                    <span className="header-icon">🧠🧠</span>
                    <div>
                        <h2 className="header-title">Two Brains</h2>
                        <p className="header-subtitle">
                            <span className="user-tag user-tag--andy">Andy</span> & <span className="user-tag user-tag--lisa">Lisa</span>
                            {' '} · {items.length} items · {messages.length} messages
                        </p>
                    </div>
                </div>
                <div className="header-right">
                    <div className="presence-dots">
                        <span className="presence-dot presence-dot--andy" title="Andy">A</span>
                        <span className="presence-dot presence-dot--lisa" title="Lisa">L</span>
                    </div>
                    {myTasks.length > 0 && (
                        <span className="my-task-badge" title="Your assigned tasks">
                            {myTasks.filter(t => t.status !== 'done').length} tasks
                        </span>
                    )}
                </div>
            </div>

            {/* ── Navigation ── */}
            <div className="two-brains__tabs">
                {(['split', 'board', 'chat', 'tasks', 'audit', 'screen'] as const).map(v => (
                    <button key={v} className={`tab-btn ${activeView === v ? 'active' : ''} ${v === 'screen' && (isScreenSharing || remoteScreen) ? 'tab-btn--live' : ''}`} onClick={() => setActiveView(v)}>
                        {{ split: '◧ Split', board: '📋 Board', chat: '💬 Chat', tasks: '📊 Tasks', audit: '📜 Log', screen: `🖥️ Screen${isScreenSharing || remoteScreen ? ' 🔴' : ''}` }[v]}
                    </button>
                ))}
                <div className="tab-spacer" />
                {(activeView === 'split' || activeView === 'board') && (
                    <button className="add-item-btn" onClick={() => setShowAddForm(!showAddForm)}>
                        {showAddForm ? '✕ Cancel' : '+ New'}
                    </button>
                )}
            </div>

            {loading && <div className="two-brains__loading">Loading shared space...</div>}

            {/* ── Add Form ── */}
            {showAddForm && (activeView === 'split' || activeView === 'board') && (
                <div className="add-form">
                    <div className="add-form__row">
                        <input className="add-form__input" placeholder="What's on your mind?" value={newItem.title}
                            onChange={e => setNewItem({ ...newItem, title: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && addItem()} autoFocus />
                        <select className="add-form__type" value={newItem.type}
                            onChange={e => setNewItem({ ...newItem, type: e.target.value as SharedItem['type'] })}>
                            <option value="note">📝 Note</option>
                            <option value="task">✅ Task</option>
                            <option value="link">🔗 Link</option>
                            <option value="file">📄 File</option>
                            <option value="idea">💡 Idea</option>
                        </select>
                    </div>
                    <div className="add-form__row">
                        <input className="add-form__input add-form__input--half" placeholder="Assign to (Andy/Lisa)"
                            value={newItem.assignee} onChange={e => setNewItem({ ...newItem, assignee: e.target.value })} />
                        <input className="add-form__input add-form__input--half" placeholder="Tags (comma-separated)"
                            value={newItem.tags} onChange={e => setNewItem({ ...newItem, tags: e.target.value })} />
                    </div>
                    <textarea className="add-form__desc" placeholder="Add details (optional)..." value={newItem.description}
                        onChange={e => setNewItem({ ...newItem, description: e.target.value })} rows={2} />
                    <button className="add-form__submit" onClick={addItem} disabled={!newItem.title.trim()}>
                        Drop It 🎤
                    </button>
                </div>
            )}

            {/* ── Main Content ── */}
            {!loading && (
                <div className={`two-brains__body ${activeView === 'split' ? 'split-layout' : ''}`}>

                    {/* ── BOARD PANEL ── */}
                    {(activeView === 'split' || activeView === 'board') && (
                        <div className={`panel panel--board ${isDragOver ? 'drag-over' : ''}`}
                            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                            {activeView === 'split' && <div className="panel-label">📋 Board</div>}
                            {isDragOver && (
                                <div className="drop-overlay">
                                    <span className="drop-icon">📦</span>
                                    <p>Drop anything here</p>
                                </div>
                            )}
                            <div className="two-brains__board">
                                {items.length === 0 ? (
                                    <div className="board-empty">
                                        <span className="empty-icon">🧠🤝🧠</span>
                                        <p>Drop something to start collaborating!</p>
                                        <p className="empty-hint">Drag files, emails, or tasks here — or use + New above</p>
                                    </div>
                                ) : (
                                    items.map(item => (
                                        <div key={item.id} className={`shared-card ${item.pinned ? 'pinned' : ''} ${(item.status || 'open') === 'done' ? 'card-done' : ''}`}
                                            style={{ '--card-accent': item.color } as React.CSSProperties}
                                            draggable onDragStart={e => {
                                                e.dataTransfer.setData('application/json', JSON.stringify({ id: item.id, title: item.title, source: 'two-brains', type: item.type }));
                                            }}>
                                            {editingId === item.id ? (
                                                <div className="card-edit">
                                                    <input className="card-edit__title" value={editData.title}
                                                        onChange={e => setEditData({ ...editData, title: e.target.value })}
                                                        onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)} autoFocus />
                                                    <textarea className="card-edit__desc" value={editData.description}
                                                        onChange={e => setEditData({ ...editData, description: e.target.value })} rows={2} />
                                                    <div className="card-edit__actions">
                                                        <button className="card-edit__save" onClick={() => saveEdit(item.id)}>Save</button>
                                                        <button className="card-edit__cancel" onClick={() => setEditingId(null)}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="card-top">
                                                        <span className="card-type">{TYPE_ICONS[item.type]} {item.type}</span>
                                                        {item.type === 'task' && (
                                                            <button className={`status-chip ${STATUS_LABELS[item.status]?.cls}`} onClick={() => cycleStatus(item)}
                                                                title="Click to change status">
                                                                {STATUS_LABELS[item.status]?.icon} {STATUS_LABELS[item.status]?.label}
                                                            </button>
                                                        )}
                                                        <div className="card-actions">
                                                            <button onClick={() => togglePin(item.id, item.pinned)} title={item.pinned ? 'Unpin' : 'Pin'}>📌</button>
                                                            <button onClick={() => { setEditingId(item.id); setEditData({ title: item.title, description: item.description }); }} title="Edit">✏️</button>
                                                            {item.assignee ? (
                                                                <button onClick={() => assignItem(item.id, null)} title={`Assigned: ${item.assignee}`}
                                                                    className={`assign-btn ${item.assignee === 'Andy' ? 'assign-andy' : 'assign-lisa'}`}>
                                                                    {item.assignee === 'Andy' ? '🅰️' : '🅻'}
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => assignItem(item.id, myName === 'Andy' ? 'Lisa' : 'Andy')} title="Assign">👤</button>
                                                            )}
                                                            <button onClick={() => deleteItem(item.id)} title="Remove">🗑️</button>
                                                        </div>
                                                    </div>
                                                    <h3 className="card-title">{item.title}</h3>
                                                    {item.description && <p className="card-desc">{item.description}</p>}
                                                    {/* Tags */}
                                                    <div className="card-tags">
                                                        {(item.tags || []).map(tag => (
                                                            <span key={tag} className="tag-pill" onClick={() => removeTag(item.id, tag)} title="Click to remove">
                                                                {tag} ×
                                                            </span>
                                                        ))}
                                                        {tagInput?.itemId === item.id ? (
                                                            <input className="tag-input" value={tagInput.value} autoFocus
                                                                onChange={e => setTagInput({ ...tagInput, value: e.target.value })}
                                                                onKeyDown={e => { if (e.key === 'Enter') addTag(item.id, tagInput.value); if (e.key === 'Escape') setTagInput(null); }}
                                                                onBlur={() => { if (tagInput.value) addTag(item.id, tagInput.value); else setTagInput(null); }}
                                                                placeholder="tag..." />
                                                        ) : (
                                                            <button className="tag-add-btn" onClick={() => setTagInput({ itemId: item.id, value: '' })}>+</button>
                                                        )}
                                                    </div>
                                                    <div className="card-meta">
                                                        <span className={`card-author ${item.addedByName === 'Andy' ? 'author-andy' : 'author-lisa'}`}>
                                                            {item.addedByName === 'Andy' ? '🅰️' : '🅻'} {item.addedByName}
                                                        </span>
                                                        {item.dragSource && <span className="card-source" title={`From: ${item.dragSource}`}>📦</span>}
                                                        <span className="card-time">{formatTime(item.createdAt)}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── CHAT PANEL ── */}
                    {(activeView === 'split' || activeView === 'chat') && (
                        <div className="panel panel--chat">
                            {activeView === 'split' && <div className="panel-label">💬 Chat</div>}
                            <div className="chat-thread">
                                {messages.length === 0 ? (
                                    <div className="chat-empty">
                                        <span>💬</span>
                                        <p>Start a conversation</p>
                                    </div>
                                ) : (
                                    messages.map(msg => {
                                        const isMe = msg.senderName === myName;
                                        const isAndy = msg.senderName === 'Andy';
                                        const isTaskCmd = msg.body.startsWith('@task');
                                        return (
                                            <div key={msg.id} className={`chat-msg ${isMe ? 'chat-msg--mine' : 'chat-msg--theirs'} ${isAndy ? 'chat-msg--andy' : 'chat-msg--lisa'}`}>
                                                <div className="chat-msg__avatar">{isAndy ? 'A' : 'L'}</div>
                                                <div className="chat-msg__content">
                                                    <div className="chat-msg__header">
                                                        <span className={`chat-msg__name ${isAndy ? 'author-andy' : 'author-lisa'}`}>{msg.senderName}</span>
                                                        <span className="chat-msg__time">{formatChatTime(msg.timestamp)}</span>
                                                    </div>
                                                    {msg.replyTo && (
                                                        <div className="chat-msg__reply-ref">
                                                            ↩ {messages.find(m => m.id === msg.replyTo)?.body.slice(0, 50) || '...'}
                                                        </div>
                                                    )}
                                                    <div className={`chat-msg__body ${isTaskCmd ? 'task-command' : ''}`}>
                                                        {isTaskCmd ? (
                                                            <>
                                                                <span className="task-cmd-badge">📋 Task Created</span>
                                                                {msg.body.replace(/^@task\s+\w+:\s*/, '')}
                                                            </>
                                                        ) : msg.body}
                                                    </div>
                                                    <div className="chat-msg__reactions">
                                                        {msg.reactions.map((r, i) => (
                                                            <span key={i} className={`reaction-chip ${r.by === myName ? 'reaction-mine' : ''}`}
                                                                onClick={() => toggleReaction(msg.id, r.emoji)}>
                                                                {r.emoji}
                                                            </span>
                                                        ))}
                                                        <div className="reaction-picker">
                                                            {QUICK_REACTIONS.map(e => (
                                                                <button key={e} className="reaction-btn" onClick={() => toggleReaction(msg.id, e)}>{e}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button className="chat-msg__reply-btn" onClick={() => { setReplyTo(msg); chatInputRef.current?.focus(); }} title="Reply">↩</button>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Chat Compose */}
                            <div className="chat-compose">
                                {replyTo && (
                                    <div className="chat-compose__reply">
                                        <span>↩ Replying to <strong>{replyTo.senderName}</strong>: {replyTo.body.slice(0, 40)}...</span>
                                        <button onClick={() => setReplyTo(null)}>✕</button>
                                    </div>
                                )}
                                <div className="chat-compose__row">
                                    <input ref={chatInputRef} className="chat-compose__input" placeholder={`Message as ${myName}... (use @task Name: to assign)`}
                                        value={chatInput} onChange={e => setChatInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()} />
                                    <button className="chat-compose__send" onClick={sendMessage} disabled={!chatInput.trim()}>
                                        Send
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── TASKS VIEW ── */}
                    {activeView === 'tasks' && (
                        <div className="panel panel--tasks">
                            <div className="tasks-header">
                                <h3>📊 Task Board</h3>
                                <div className="tasks-stats">
                                    <span className="stat stat-open">{taskItems.filter(t => t.status === 'open').length} open</span>
                                    <span className="stat stat-progress">{taskItems.filter(t => t.status === 'in-progress').length} active</span>
                                    <span className="stat stat-done">{taskItems.filter(t => t.status === 'done').length} done</span>
                                </div>
                            </div>
                            <div className="tasks-columns">
                                {(['open', 'in-progress', 'done', 'blocked'] as const).map(status => (
                                    <div key={status} className={`task-column ${STATUS_LABELS[status].cls}`}>
                                        <div className="task-column__header">
                                            <span>{STATUS_LABELS[status].icon} {STATUS_LABELS[status].label}</span>
                                            <span className="task-column__count">{taskItems.filter(t => t.status === status).length}</span>
                                        </div>
                                        {taskItems.filter(t => t.status === status).map(task => (
                                            <div key={task.id} className="task-card" onClick={() => cycleStatus(task)}>
                                                <div className="task-card__title">{task.title}</div>
                                                {task.assignee && (
                                                    <span className={`task-card__assignee ${task.assignee === 'Andy' ? 'author-andy' : 'author-lisa'}`}>
                                                        {task.assignee}
                                                    </span>
                                                )}
                                                {(task.tags || []).length > 0 && (
                                                    <div className="task-card__tags">
                                                        {(task.tags || []).map(t => <span key={t} className="tag-pill tag-pill--sm">{t}</span>)}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── AUDIT VIEW ── */}
                    {activeView === 'audit' && (
                        <div className="panel panel--audit">
                            <div className="two-brains__audit">
                                {auditLog.length === 0 ? (
                                    <div className="board-empty"><span className="empty-icon">📜</span><p>No activity yet</p></div>
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
                        </div>
                    )}

                    {/* ── SCREEN SHARE VIEW ── */}
                    {activeView === 'screen' && (
                        <div className="panel panel--screen">
                            <div className="screen-controls">
                                <h3>🖥️ Screen Sharing</h3>
                                <div className="screen-controls__actions">
                                    {!isScreenSharing ? (
                                        <button className="screen-share-btn screen-share-btn--start" onClick={startScreenShare}>
                                            📺 Share My Screen
                                        </button>
                                    ) : (
                                        <button className="screen-share-btn screen-share-btn--stop" onClick={stopScreenShare}>
                                            ⏹ Stop Sharing
                                        </button>
                                    )}
                                    <label className="screen-interval">
                                        <span>Refresh:</span>
                                        <select value={screenShareInterval}
                                            onChange={e => {
                                                const val = Number(e.target.value);
                                                setScreenShareIntervalState(val);
                                                // Reset interval if sharing
                                                if (isScreenSharing && screenCaptureTimerRef.current) {
                                                    clearInterval(screenCaptureTimerRef.current);
                                                    // Restart with new interval — will trigger on next capture
                                                }
                                            }}>
                                            <option value={1}>1s</option>
                                            <option value={2}>2s</option>
                                            <option value={5}>5s</option>
                                            <option value={10}>10s</option>
                                        </select>
                                    </label>
                                </div>
                            </div>

                            <div className="screen-panels">
                                {/* Local preview */}
                                {isScreenSharing && (
                                    <div className="screen-panel">
                                        <div className="screen-panel__header">
                                            <span className="screen-panel__live">🔴 LIVE</span>
                                            <span>Your Screen ({myName})</span>
                                        </div>
                                        <div className="screen-panel__video-wrap">
                                            <video ref={localVideoRef} autoPlay muted playsInline className="screen-panel__video" />
                                        </div>
                                    </div>
                                )}

                                {/* Remote screen */}
                                {remoteScreen && (
                                    <div className="screen-panel">
                                        <div className="screen-panel__header">
                                            <span className="screen-panel__live">🟢 WATCHING</span>
                                            <span>{remoteScreenUser}'s Screen</span>
                                        </div>
                                        <div className="screen-panel__video-wrap">
                                            <img src={remoteScreen} alt={`${remoteScreenUser}'s screen`} className="screen-panel__img" />
                                        </div>
                                    </div>
                                )}

                                {/* Empty state */}
                                {!isScreenSharing && !remoteScreen && (
                                    <div className="screen-empty">
                                        <span className="screen-empty__icon">🖥️</span>
                                        <h4>No Active Screen Shares</h4>
                                        <p>Click "Share My Screen" to let the other person see what you're looking at.</p>
                                        <p className="screen-empty__hint">Either or both of you can share simultaneously.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
