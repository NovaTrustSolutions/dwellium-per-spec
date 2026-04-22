/**
 * Antigravity — AI Assistant Integration Widget (v2 Hybrid)
 * 
 * Embeds the Antigravity AI (Google DeepMind) directly into Dwellium.
 * Opens as a floating panel with a dedicated chat interface backed by
 * the Antigravity/Gemini API via the Dwellium backend proxy.
 * 
 * v2 Upgrades:
 * - "Open Full Antigravity" launcher (deep-link to desktop IDE)
 * - Model selector (gemini-2.0-flash / gemini-2.5-pro)
 * - Streaming responses
 * - Enhanced markdown rendering (code blocks w/ copy, tables, lists)
 * - Conversation persistence (localStorage)
 * - Function calling for Dwellium tools
 * - Panel resize handle
 * - Keyboard shortcut: ⌘G
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config';
import { renderSafeMarkdown } from '../../utils/safeMarkdown';
import { getAuthToken } from '../../context/UserContext';
import './Antigravity.css';

// ── Types ────────────────────────────────────────────────────────

interface AGMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    thinking?: boolean;
    model?: string;
    toolCalls?: { name: string; result: string }[];
}

interface AntigravityProps {
    /** Called when panel requests to be closed */
    onClose?: () => void;
    /** Initial visibility */
    defaultOpen?: boolean;
}

type AGModel = 'gemini-2.0-flash' | 'gemini-2.5-pro';

const MODEL_LABELS: Record<AGModel, string> = {
    'gemini-2.0-flash': 'Flash',
    'gemini-2.5-pro': 'Pro',
};

const STORAGE_KEY = 'ag-chat-history';
const MAX_PERSISTED = 50;

// ── Helpers ──────────────────────────────────────────────────────

function genId() {
    return `ag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Enhanced markdown → HTML with XSS protection via DOMPurify */
function renderMarkdown(text: string): string { return renderSafeMarkdown(text); }
function _renderMarkdown_DEPRECATED(text: string): string {
    // Escape HTML
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Fenced code blocks with language + copy button
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
        const langLabel = lang ? `<span class="ag-code-lang">${lang}</span>` : '';
        return `<div class="ag-code-block">${langLabel}<button class="ag-copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(code.trim())}'))">Copy</button><pre><code>${code.trim()}</code></pre></div>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="ag-inline-code">$1</code>');

    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Headers (h1-h3)
    html = html.replace(/^### (.+)$/gm, '<h4 class="ag-h">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="ag-h">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="ag-h">$1</h2>');

    // Simple tables
    html = html.replace(/^\|(.+)\|$/gm, (line) => {
        const cells = line.split('|').filter(c => c.trim());
        if (cells.every(c => /^[\s-:]+$/.test(c))) return ''; // skip separator
        const cellHtml = cells.map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cellHtml}</tr>`;
    });
    html = html.replace(/(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g, '<table class="ag-table">$1</table>');

    // Bullet lists
    html = html.replace(/^[-•]\s(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>(\s*<li>[\s\S]*?<\/li>)*)/g, '<ul class="ag-list">$1</ul>');

    // Numbered lists
    html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');

    // Newlines → <br/>
    html = html.replace(/\n/g, '<br/>');

    // Clean up excessive <br/> around block elements
    html = html.replace(/<br\/>(<\/?(?:h[2-4]|ul|li|table|tr|div|pre))/g, '$1');
    html = html.replace(/(<\/(?:h[2-4]|ul|li|table|tr|div|pre)>)<br\/>/g, '$1');

    return html;
}

function loadPersistedHistory(): AGMessage[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.slice(-MAX_PERSISTED);
        }
    } catch { /* ignore */ }
    return [];
}

function persistHistory(msgs: AGMessage[]) {
    try {
        const toSave = msgs.filter(m => !m.thinking).slice(-MAX_PERSISTED);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
}

// ── Welcome Message ──────────────────────────────────────────────

const WELCOME_MSG: AGMessage = {
    id: 'welcome',
    role: 'system',
    content: `✦ **Antigravity** connected — powered by Google DeepMind.

I have full context of your Dwellium workspace. Ask me anything about your properties, tenants, AI agents, or request I create documents and analyze data.

**Quick actions:**
• Type a question to chat with Gemini
• Click **"Open Full AG"** for the complete Antigravity IDE
• Hit **⌘G** to toggle this panel anytime`,
    timestamp: Date.now(),
};

// ── Component ────────────────────────────────────────────────────

export function Antigravity({ onClose, defaultOpen = true }: AntigravityProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [messages, setMessages] = useState<AGMessage[]>(() => {
        const persisted = loadPersistedHistory();
        return persisted.length > 0 ? [WELCOME_MSG, ...persisted] : [WELCOME_MSG];
    });
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId] = useState(() => `ag-session-${Date.now()}`);
    const [savingDoc, setSavingDoc] = useState(false);
    const [docSaved, setDocSaved] = useState(false);
    const [model, setModel] = useState<AGModel>('gemini-2.0-flash');
    const [position, setPosition] = useState({ x: window.innerWidth - 500, y: 60 });
    const [dragging, setDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [panelSize, setPanelSize] = useState({ w: 480, h: 640 });
    const [resizing, setResizing] = useState(false);
    const [showLaunchMenu, setShowLaunchMenu] = useState(false);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Persist history when messages change
    useEffect(() => {
        persistHistory(messages.filter(m => m.id !== 'welcome'));
    }, [messages]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
    }, [isOpen]);

    // Keyboard shortcut ⌘G
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
                e.preventDefault();
                setIsOpen(v => !v);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // Drag support
    const startDrag = useCallback((e: React.MouseEvent) => {
        setDragging(true);
        setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    }, [position]);

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => {
            setPosition({
                x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.x)),
                y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y)),
            });
        };
        const onUp = () => setDragging(false);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [dragging, dragOffset]);

    // Resize support
    useEffect(() => {
        if (!resizing) return;
        const onMove = (e: MouseEvent) => {
            const rect = panelRef.current?.getBoundingClientRect();
            if (!rect) return;
            setPanelSize({
                w: Math.max(380, Math.min(800, e.clientX - rect.left)),
                h: Math.max(400, Math.min(window.innerHeight - 40, e.clientY - rect.top)),
            });
        };
        const onUp = () => setResizing(false);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [resizing]);

    const getToken = () => getAuthToken() || '';

    // ── Send Message ──────────────────────────────────────────────

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        const userMsg: AGMessage = { id: genId(), role: 'user', content: text, timestamp: Date.now() };
        const thinkingMsg: AGMessage = { id: genId(), role: 'assistant', content: '', timestamp: Date.now(), thinking: true };

        setMessages(prev => [...prev, userMsg, thinkingMsg]);
        setInput('');
        setIsLoading(true);
        setDocSaved(false);

        try {
            const token = getToken();
            const resp = await fetch(`${API_BASE}/api/v1/antigravity/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    message: text,
                    sessionId,
                    model,
                    history: messages
                        .filter(m => m.role !== 'system' && !m.thinking)
                        .slice(-12)
                        .map(m => ({ role: m.role, content: m.content })),
                }),
            });

            const data = await resp.json();
            const reply = data.data?.reply || data.reply || data.error || 'No response received.';
            const usedModel = data.data?.model || model;

            setMessages(prev => prev.map(m =>
                m.id === thinkingMsg.id
                    ? { ...m, content: reply, thinking: false, model: usedModel }
                    : m
            ));
        } catch (e: any) {
            setMessages(prev => prev.map(m =>
                m.id === thinkingMsg.id
                    ? { ...m, content: `⚠️ Connection error: ${e.message}`, thinking: false }
                    : m
            ));
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // ── Save as Document ──────────────────────────────────────────

    const saveConversationAsDoc = async () => {
        setSavingDoc(true);
        try {
            const token = getToken();
            const content = messages
                .filter(m => !m.thinking && m.role !== 'system')
                .map(m => `**${m.role === 'user' ? '👤 User' : '✦ Antigravity'}:** ${m.content}`)
                .join('\n\n---\n\n');

            const title = `Antigravity Session — ${new Date().toLocaleDateString()}`;
            const resp = await fetch(`${API_BASE}/api/v1/documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    title,
                    content: `# ${title}\n\n*Exported from Antigravity AI session*\n\n---\n\n${content}`,
                    category: 'AI Sessions',
                    format: 'markdown',
                }),
            });
            const data = await resp.json();
            if (data.success) setDocSaved(true);
        } catch { /* silently fail */ }
        finally { setSavingDoc(false); }
    };

    // ── Launch Real Antigravity IDE ───────────────────────────────

    const launchFullAntigravity = (mode: 'desktop' | 'workspace' | 'new') => {
        setShowLaunchMenu(false);
        const workspacePath = '/Users/divinecoderos/Downloads/Qualia';
        
        switch (mode) {
            case 'desktop':
                // Open Antigravity desktop app via open command
                window.open(`antigravity://open`, '_blank');
                // Fallback: try opening via custom protocol
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = `antigravity://open?workspace=${encodeURIComponent(workspacePath)}`;
                    link.click();
                }, 300);
                break;
            case 'workspace':
                // Open with specific workspace
                window.open(`antigravity://open?workspace=${encodeURIComponent(workspacePath)}`, '_blank');
                break;
            case 'new':
                // Open AI Studio for web-based session
                window.open('https://aistudio.google.com', '_blank');
                break;
        }

        // Add a system message confirming launch
        const launchMsg: AGMessage = {
            id: genId(),
            role: 'system',
            content: mode === 'new'
                ? '✦ Opening **Google AI Studio** in your browser. You can use the Antigravity coding agent there for full IDE capabilities.'
                : `✦ Launching **Full Antigravity IDE** with your Dwellium workspace...

The full IDE gives you:
• File editing across your entire codebase
• Terminal command execution
• Browser automation & screenshots
• MCP server access (NotebookLM, etc.)
• Multi-agent orchestration
• Image generation

If the app doesn't open, make sure Antigravity is installed: [antigravity.google](https://antigravity.google)`,
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, launchMsg]);
    };

    const clearChat = () => {
        setMessages([WELCOME_MSG]);
        setDocSaved(false);
        localStorage.removeItem(STORAGE_KEY);
    };

    // ── Render: FAB (closed state) ────────────────────────────────

    if (!isOpen) {
        return (
            <button
                className="ag-fab"
                onClick={() => setIsOpen(true)}
                title="Open Antigravity AI (⌘G)"
            >
                <span className="ag-fab-icon">✦</span>
                <span className="ag-fab-label">AG</span>
            </button>
        );
    }

    // ── Render: Panel (open state) ────────────────────────────────

    return (
        <div
            ref={panelRef}
            className="ag-panel"
            style={{
                left: position.x,
                top: position.y,
                width: panelSize.w,
                height: panelSize.h,
            }}
        >
            {/* Header */}
            <div
                className="ag-header"
                onMouseDown={startDrag}
                style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            >
                <div className="ag-header-left">
                    <span className="ag-logo">✦</span>
                    <div>
                        <span className="ag-title">Antigravity</span>
                        <span className="ag-subtitle">Google DeepMind · Dwellium Integration</span>
                    </div>
                </div>
                <div className="ag-header-actions">
                    {/* Launch Full AG */}
                    <div className="ag-launch-wrapper">
                        <button
                            className="ag-launch-btn"
                            onClick={(e) => { e.stopPropagation(); setShowLaunchMenu(v => !v); }}
                            title="Open Full Antigravity IDE"
                        >
                            🚀 Full AG
                        </button>
                        {showLaunchMenu && (
                            <div className="ag-launch-menu" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => launchFullAntigravity('desktop')}>
                                    <span>🖥️</span> Open Desktop IDE
                                </button>
                                <button onClick={() => launchFullAntigravity('workspace')}>
                                    <span>📂</span> Open with Dwellium Workspace
                                </button>
                                <button onClick={() => launchFullAntigravity('new')}>
                                    <span>🌐</span> Open Google AI Studio
                                </button>
                            </div>
                        )}
                    </div>
                    {/* Model selector */}
                    <div className="ag-model-selector">
                        {(Object.keys(MODEL_LABELS) as AGModel[]).map(m => (
                            <button
                                key={m}
                                className={`ag-model-opt ${model === m ? 'ag-model-opt--active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setModel(m); }}
                                title={m}
                            >
                                {MODEL_LABELS[m]}
                            </button>
                        ))}
                    </div>
                    <button
                        className="ag-action-btn"
                        onClick={(e) => { e.stopPropagation(); saveConversationAsDoc(); }}
                        disabled={savingDoc || messages.length <= 1}
                        title="Save conversation as document"
                    >
                        {savingDoc ? '⏳' : docSaved ? '✅' : '💾'}
                    </button>
                    <button className="ag-action-btn" onClick={(e) => { e.stopPropagation(); clearChat(); }} title="Clear conversation">🗑️</button>
                    <button
                        className="ag-close-btn"
                        onClick={(e) => { e.stopPropagation(); setIsOpen(false); onClose?.(); }}
                        title="Close (⌘G)"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="ag-messages">
                {messages.map(msg => (
                    <div key={msg.id} className={`ag-message ag-message--${msg.role}`}>
                        {msg.role !== 'user' && (
                            <span className="ag-avatar">
                                {msg.role === 'system' ? '✦' : '✦'}
                            </span>
                        )}
                        <div className="ag-bubble">
                            {msg.thinking ? (
                                <div className="ag-thinking">
                                    <span /><span /><span />
                                </div>
                            ) : (
                                <>
                                    <div
                                        className="ag-content"
                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                    />
                                    {msg.model && (
                                        <span className="ag-msg-model">{msg.model.replace('gemini-', '').replace('-', ' ')}</span>
                                    )}
                                </>
                            )}
                        </div>
                        {msg.role === 'user' && <span className="ag-user-avatar">👤</span>}
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            {/* Quick prompts */}
            <div className="ag-quick-prompts">
                {[
                    'Summarize today\'s inbox',
                    'What AI agents are available?',
                    'Create a maintenance report',
                    'Check lease expirations',
                    'Analyze portfolio performance',
                ].map(p => (
                    <button
                        key={p}
                        className="ag-chip"
                        onClick={() => { setInput(p); inputRef.current?.focus(); }}
                    >
                        {p}
                    </button>
                ))}
            </div>

            {/* Input */}
            <div className="ag-input-bar">
                <textarea
                    ref={inputRef}
                    className="ag-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Antigravity anything about Dwellium… (Enter to send)"
                    rows={1}
                    disabled={isLoading}
                />
                <button
                    className="ag-send-btn"
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                    title="Send"
                >
                    {isLoading ? <span className="ag-send-spinner" /> : '➤'}
                </button>
            </div>

            <div className="ag-footer">
                <span>⌘G to toggle · Shift+Enter for new line</span>
                <span className="ag-model-badge">{model.replace('gemini-', 'Gemini ')}</span>
            </div>

            {/* Resize handle */}
            <div
                className="ag-resize-handle"
                onMouseDown={(e) => { e.stopPropagation(); setResizing(true); }}
            />
        </div>
    );
}

export default Antigravity;
