/**
 * AstraWorkspace — Split-pane AI workspace with workitem queue + ARA chat.
 * Actions: Approve & Send, Save as Document, Promote to Strata.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../../config';
import {
    Send, FileText, ArrowUpRight, ArrowDownLeft, ChevronRight,
    Clock, AlertTriangle, CheckCircle2, Loader2,
    Mic, MicOff, RefreshCw, History
} from 'lucide-react';


interface Workitem {
    id: string;
    type: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    propertyId: string | null;
    tags: string[];
    domain: string;
    metadata: Record<string, any>;
    threadChannel: string;
    createdAt: string;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface DraftVersion {
    id: number;
    content: string;
    timestamp: number;
    action: string; // 'ara_response' | 'edited' | 'sent'
}

const PRIORITY_COLORS: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
};

export default function AstraWorkspace() {
    const [workitems, setWorkitems] = useState<Workitem[]>([]);
    const [selectedItem, setSelectedItem] = useState<Workitem | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showSendModal, setShowSendModal] = useState(false);
    const [sendTo, setSendTo] = useState('');
    const [sendSubject, setSendSubject] = useState('');
    const [sendBody, setSendBody] = useState('');
    const [actionFeedback, setActionFeedback] = useState<string | null>(null);
    const [draftHistory, setDraftHistory] = useState<DraftVersion[]>([]);
    const [showDraftHistory, setShowDraftHistory] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const sessionId = useRef(`astra-${Date.now()}`);
    const draftCounter = useRef(0);

    // Track draft versions from ARA responses
    const pushDraft = (content: string, action: string) => {
        draftCounter.current++;
        setDraftHistory(prev => [...prev, {
            id: draftCounter.current,
            content,
            timestamp: Date.now(),
            action,
        }]);
    };

    // Fetch workitems needing review
    const fetchWorkitems = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/dwellium/workitems?status=open&limit=50`);
            const data = await res.json();
            setWorkitems(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch workitems:', err);
        }
    }, []);

    useEffect(() => { fetchWorkitems(); }, [fetchWorkitems]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Send message to ARA with workitem context
    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        const contextPrefix = selectedItem
            ? `[Context: Workitem "${selectedItem.title}" (${selectedItem.type}, ${selectedItem.priority} priority, status: ${selectedItem.status})${selectedItem.description ? ` — ${selectedItem.description}` : ''}]\n\n`
            : '';

        try {
            const res = await fetch(`${API_BASE}/api/ara/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'chief-of-staff',
                    message: contextPrefix + text,
                    sessionId: sessionId.current,
                }),
            });
            const data = await res.json();
            if (data.success) {
                const content = data.data.content;
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content,
                    timestamp: Date.now(),
                }]);
                pushDraft(content, 'ara_response');
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '[Connection Error] Backend unreachable.',
                timestamp: Date.now(),
            }]);
        }
        setIsLoading(false);
    }, [input, isLoading, selectedItem]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // ── ACTIONS ──

    const showFeedback = (msg: string) => {
        setActionFeedback(msg);
        setTimeout(() => setActionFeedback(null), 3000);
    };

    // Approve & Send — pre-fill from last ARA response
    const openSendModal = () => {
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
        setSendTo('');
        setSendSubject(selectedItem ? `Re: ${selectedItem.title}` : '');
        setSendBody(lastAssistant?.content || '');
        setShowSendModal(true);
    };

    const doSendEmail = async () => {
        try {
            await fetch(`${API_BASE}/api/gmail/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: sendTo,
                    subject: sendSubject,
                    body: sendBody,
                    workitemId: selectedItem?.id,
                }),
            });

            // ── Auto-log to communication_log ──
            try {
                await fetch(`${API_BASE}/api/dwellium/comms`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workitemId: selectedItem?.id || null,
                        channel: 'email',
                        direction: 'outbound',
                        fromAddress: 'workspace@dwellium.com',
                        toAddress: sendTo,
                        subject: sendSubject,
                        body: sendBody,
                    }),
                });
            } catch { /* best-effort log */ }

            pushDraft(sendBody, 'sent');
            setShowSendModal(false);
            showFeedback('✅ Email sent & logged');
        } catch {
            showFeedback('❌ Failed to send email');
        }
    };

    // Save as Document
    const saveAsDocument = async () => {
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
        if (!lastAssistant) return;

        const filename = selectedItem
            ? `astra-${selectedItem.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.md`
            : `astra-response-${Date.now()}.md`;

        try {
            const formData = new FormData();
            const blob = new Blob([`# ${selectedItem?.title || 'ARA Response'}\n\n${lastAssistant.content}`], { type: 'text/markdown' });
            formData.append('file', blob, filename);
            formData.append('parentPath', '/astra-documents');

            await fetch(`${API_BASE}/api/files/upload`, {
                method: 'POST',
                body: formData,
            });
            showFeedback('📄 Saved as document');
        } catch {
            showFeedback('❌ Failed to save document');
        }
    };

    // Promote to Strata — uses dedicated promote endpoint with entity verification
    const promoteToStrata = async () => {
        if (!selectedItem) return;
        try {
            await fetch(`${API_BASE}/api/dwellium/workitems/${selectedItem.id}/promote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            showFeedback('🚀 Promoted to Strata');
            setWorkitems(prev => prev.filter(w => w.id !== selectedItem.id));
            setSelectedItem(null);
        } catch {
            showFeedback('❌ Failed to promote');
        }
    };

    // Un-promote — return from Strata back to Astra queue
    const unPromote = async () => {
        if (!selectedItem) return;
        try {
            const res = await fetch(`${API_BASE}/api/dwellium/workitems/${selectedItem.id}/unpromote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (data.unpromoted) {
                showFeedback('↩ Returned to Astra queue');
                fetchWorkitems();
            }
        } catch {
            showFeedback('❌ Failed to un-promote');
        }
    };

    // Simple markdown
    const escapeHtml = (value: string) => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const renderContent = (text: string) => {
        const lines = text.split('\n');
        return lines.map((line, i) => {
            let processed = escapeHtml(line);
            processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
            processed = processed.replace(/_([^_]+)_/g, '<em>$1</em>');
            processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
            if (processed.match(/^[-•]\s/)) {
                processed = `<span class="aw-bullet">•</span>${processed.slice(2)}`;
            }
            if (processed === '') return <br key={i} />;
            return <p key={i} className="aw-line" dangerouslySetInnerHTML={{ __html: processed }} />;
        });
    };

    return (
        <div className="aw-workspace">
            {/* Left: Workitem Queue */}
            <div className="aw-queue">
                <div className="aw-queue-header">
                    <span className="aw-queue-title">Review Queue</span>
                    <span className="aw-queue-count">{workitems.length} items</span>
                    <button className="aw-refresh" onClick={fetchWorkitems}><RefreshCw size={14} /></button>
                </div>
                <div className="aw-queue-list">
                    {workitems.map(item => (
                        <button
                            key={item.id}
                            className={`aw-queue-item ${selectedItem?.id === item.id ? 'aw-queue-active' : ''}`}
                            onClick={() => { setSelectedItem(item); setMessages([]); sessionId.current = `astra-${Date.now()}`; }}
                        >
                            <div className="aw-item-top">
                                <span className="aw-priority-dot" style={{ background: PRIORITY_COLORS[item.priority] || '#888' }} />
                                <span className="aw-item-title">{item.title}</span>
                            </div>
                            <div className="aw-item-meta">
                                <span className="aw-item-type">{item.type}</span>
                                <span className="aw-item-status">{item.status}</span>
                            </div>
                        </button>
                    ))}
                    {workitems.length === 0 && (
                        <div className="aw-empty">No items in queue</div>
                    )}
                </div>
            </div>

            {/* Right: ARA Chat + Actions */}
            <div className="aw-chat-pane">
                {selectedItem ? (
                    <>
                        {/* Context Banner */}
                        <div className="aw-context-bar">
                            <div className="aw-context-info">
                                <span className="aw-context-type">{selectedItem.type}</span>
                                <span className="aw-context-title">{selectedItem.title}</span>
                                <span className="aw-priority-tag" style={{ borderColor: PRIORITY_COLORS[selectedItem.priority] }}>
                                    {selectedItem.priority}
                                </span>
                            </div>
                            {selectedItem.description && (
                                <p className="aw-context-desc">{selectedItem.description}</p>
                            )}
                        </div>

                        {/* Chat Area */}
                        <div className="aw-chat-area">
                            {messages.length === 0 && (
                                <div className="aw-chat-hint">
                                    <span className="aw-hint-icon">◈</span>
                                    <p>ARA is ready to assist with this workitem. Ask for analysis, draft responses, or request recommendations.</p>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={`aw-message aw-msg-${msg.role}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="aw-msg-header">
                                            <span className="aw-avatar">◈</span>
                                            <span className="aw-sender">ARA</span>
                                        </div>
                                    )}
                                    <div className="aw-msg-body">{renderContent(msg.content)}</div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="aw-message aw-msg-assistant aw-msg-loading">
                                    <Loader2 size={16} className="aw-spinner" />
                                    <span>ARA is thinking…</span>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input + Actions */}
                        <div className="aw-bottom-bar">
                            <div className="aw-input-row">
                                <textarea
                                    className="aw-input"
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask ARA about this workitem…"
                                    rows={1}
                                />
                                <button className="aw-send-btn" onClick={sendMessage} disabled={!input.trim() || isLoading}>
                                    <Send size={16} />
                                </button>
                            </div>
                            <div className="aw-actions">
                                <button className="aw-action aw-action-send" onClick={openSendModal} title="Approve & Send Email">
                                    <Send size={14} /> Approve & Send
                                </button>
                                <button className="aw-action aw-action-doc" onClick={saveAsDocument} title="Save as Document">
                                    <FileText size={14} /> Save as Doc
                                </button>
                                <button className="aw-action aw-action-promote" onClick={promoteToStrata} title="Promote to Strata">
                                    <ArrowUpRight size={14} /> Promote
                                </button>
                                {selectedItem.metadata?.promotedToStrata && (
                                    <button className="aw-action aw-action-unpromote" onClick={unPromote} title="Return to Astra Queue">
                                        <ArrowDownLeft size={14} /> Un-promote
                                    </button>
                                )}
                                <button className="aw-action aw-action-history" onClick={() => setShowDraftHistory(!showDraftHistory)} title="Draft Versions">
                                    <History size={14} /> Drafts ({draftHistory.length})
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="aw-no-selection">
                        <span className="aw-ns-icon">◈</span>
                        <h3>Select a workitem</h3>
                        <p>Choose an item from the queue to begin review with ARA</p>
                    </div>
                )}
            </div>

            {/* Send Email Modal */}
            {showSendModal && (
                <div className="aw-modal-overlay" onClick={() => setShowSendModal(false)}>
                    <div className="aw-modal" onClick={e => e.stopPropagation()}>
                        <h3 className="aw-modal-title">Approve & Send</h3>
                        <label className="aw-modal-label">To</label>
                        <input className="aw-modal-input" value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="email@example.com" />
                        <label className="aw-modal-label">Subject</label>
                        <input className="aw-modal-input" value={sendSubject} onChange={e => setSendSubject(e.target.value)} />
                        <label className="aw-modal-label">Body</label>
                        <textarea className="aw-modal-textarea" value={sendBody} onChange={e => setSendBody(e.target.value)} rows={8} />
                        <div className="aw-modal-actions">
                            <button className="aw-modal-cancel" onClick={() => setShowSendModal(false)}>Cancel</button>
                            <button className="aw-modal-send" onClick={doSendEmail} disabled={!sendTo.trim()}>
                                <Send size={14} /> Send Email
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Draft Version History Panel */}
            {showDraftHistory && (
                <div className="aw-modal-overlay" onClick={() => setShowDraftHistory(false)}>
                    <div className="aw-modal aw-draft-modal" onClick={e => e.stopPropagation()}>
                        <h3 className="aw-modal-title"><History size={16} /> Draft Version History</h3>
                        <div className="aw-draft-list">
                            {draftHistory.length === 0 && (
                                <div style={{ color: '#888', padding: 16, textAlign: 'center' }}>No drafts yet. Chat with ARA to generate drafts.</div>
                            )}
                            {[...draftHistory].reverse().map(draft => (
                                <div key={draft.id} className="aw-draft-item">
                                    <div className="aw-draft-header">
                                        <span className={`aw-draft-badge aw-draft-${draft.action}`}>
                                            {draft.action === 'ara_response' ? '◈ ARA Draft' : draft.action === 'sent' ? '✉ Sent' : '✎ Edited'}
                                        </span>
                                        <span className="aw-draft-time">{new Date(draft.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <pre className="aw-draft-body">{draft.content.slice(0, 300)}{draft.content.length > 300 ? '…' : ''}</pre>
                                    <button className="aw-draft-restore" onClick={() => { setSendBody(draft.content); setShowDraftHistory(false); setShowSendModal(true); }}>
                                        Restore to Send Modal
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Action Feedback Toast */}
            {actionFeedback && (
                <div className="aw-toast">{actionFeedback}</div>
            )}
        </div>
    );
}
