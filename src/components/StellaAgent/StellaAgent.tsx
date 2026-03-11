/**
 * Stella Assistant — Personal AI assistant widget for Dwellium
 * Integrates Stella (Python/AgentScope) into the Qualia shell.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import './StellaAgent.css';

const API_BASE = '/api/stella';

/** Build auth headers for every Stella API call */
function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
    const token = localStorage.getItem('dwellium-auth-token');
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
    };
}

/** Convert markdown to sanitized HTML for clean visual output */
function renderMarkdown(text: string): string {
    let html = text
        // Sanitize: remove script/iframe/style tags
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');

    // Code blocks: ```lang\ncode\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
        (_m, lang, code) => `<pre><code class="lang-${lang || 'text'}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()}</code></pre>`);

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/(?<![\w*])\*([^*\n]+?)\*(?![\w*])/g, '<em>$1</em>');
    html = html.replace(/(?<![\w_])_([^_\n]+?)_(?![\w_])/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Headings
    html = html.replace(/^#### (.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^## (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^# (.+)$/gm, '<h4>$1</h4>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr/>');

    // Blockquotes
    html = html.replace(/^> ?(.+)$/gm, '<blockquote>$1</blockquote>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists: group consecutive `- ` or `* ` lines
    html = html.replace(/((?:^[\t ]*[-*+] .+\n?)+)/gm, (block) => {
        const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[\t ]*[-*+] /, '')}</li>`).join('');
        return `<ul>${items}</ul>`;
    });

    // Ordered lists: group consecutive `1. ` lines
    html = html.replace(/((?:^[\t ]*\d+\. .+\n?)+)/gm, (block) => {
        const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[\t ]*\d+\. /, '')}</li>`).join('');
        return `<ol>${items}</ol>`;
    });

    // Paragraphs: convert double newlines to paragraph breaks
    html = html.replace(/\n{2,}/g, '</p><p>');
    // Single newlines to <br>
    html = html.replace(/\n/g, '<br/>');

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) html = `<p>${html}</p>`;
    else html = `<p>${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<(?:h[1-6]|ul|ol|pre|blockquote|hr))/g, '$1');
    html = html.replace(/(<\/(?:h[1-6]|ul|ol|pre|blockquote|hr)(?:\/?)>)<\/p>/g, '$1');

    return html;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

interface Skill {
    name: string;
    content: string;
    source: string;
    enabled: boolean;
}

interface MemoryFile {
    filename: string;
    path: string;
    size: number;
    created_time: string;
    modified_time: string;
}

type Tab = 'chat' | 'skills' | 'memory' | 'voice' | 'settings';
type ConnectionStatus = 'online' | 'offline' | 'loading' | 'starting' | 'degraded';

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'] },
    { id: 'anthropic', name: 'Anthropic', models: ['claude-3.5-sonnet', 'claude-3-haiku', 'claude-3-opus'] },
    { id: 'ollama', name: 'Ollama (Local)', models: ['llama3', 'mistral', 'codellama', 'gemma2'] },
    { id: 'google', name: 'Google', models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'] },
];

export default function StellaAgent() {
    const [tab, setTab] = useState<Tab>('chat');
    const [status, setStatus] = useState<ConnectionStatus>('loading');
    const [version, setVersion] = useState<string>('');

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'system',
            content: '⭐ Stella connected. Ask me anything — I can help with tasks, research, file management, and more.',
            timestamp: Date.now(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Skills state
    const [skills, setSkills] = useState<Skill[]>([]);
    const [skillsLoading, setSkillsLoading] = useState(false);

    // Memory state
    const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [expandedMemory, setExpandedMemory] = useState<string | null>(null);
    const [memoryContent, setMemoryContent] = useState<Record<string, string>>({});

    // Provider state
    const [provider, setProvider] = useState('openai');
    const [model, setModel] = useState('gpt-4o-mini');
    const [healthMs, setHealthMs] = useState<number | null>(null);
    const [pid, setPid] = useState<number | null>(null);
    const [initLoading, setInitLoading] = useState(false);

    // Voice state
    const [voiceOnline, setVoiceOnline] = useState(false);
    const [voiceUrl, setVoiceUrl] = useState('http://localhost:3001');
    const [voiceChecked, setVoiceChecked] = useState(false);

    // ─── Status Check ─────────────────────────────────
    const checkStatus = useCallback(async () => {
        try {
            const resp = await fetch(`${API_BASE}/status`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success && data.data) {
                const d = data.data;
                const live = d.liveCheck;
                setStatus(live?.ok ? 'online' : d.status === 'starting' ? 'starting' : 'offline');
                setVersion(live?.version || d.version || '');
                setHealthMs(live?.ms ?? null);
                setPid(d.pid ?? null);
                if (d.provider) setProvider(d.provider);
                if (d.model) setModel(d.model);
            } else {
                setStatus('offline');
            }
        } catch {
            setStatus('offline');
        }
    }, []);

    useEffect(() => {
        // Auto-initialize on mount — this triggers CoPaw spawn if not running
        (async () => {
            try {
                setStatus('loading');
                await fetch(`${API_BASE}/init`, {
                    method: 'POST',
                    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ provider, model }),
                });
                await checkStatus();
            } catch {
                setStatus('offline');
            }
        })();
        const interval = setInterval(checkStatus, 30000);
        return () => clearInterval(interval);
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-scroll chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // ─── Chat ─────────────────────────────────────────
    const sendMessage = async () => {
        const text = input.trim();
        if (!text || isTyping || status !== 'online') return;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const resp = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ message: text }),
            });

            const contentType = resp.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream')) {
                // Handle SSE streaming
                const reader = resp.body?.getReader();
                if (!reader) throw new Error('No response body');

                const decoder = new TextDecoder();
                let assistantContent = '';
                const assistantId = `assistant-${Date.now()}`;

                setMessages(prev => [...prev, {
                    id: assistantId,
                    role: 'assistant',
                    content: '',
                    timestamp: Date.now(),
                }]);

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    // Parse SSE events
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const eventData = JSON.parse(line.slice(6));
                                const fragment = eventData.text ?? eventData.content ?? null;
                                if (fragment !== null) {
                                    // Only concat strings — skip objects/arrays that would show as [object Object]
                                    const safeFragment = typeof fragment === 'string' ? fragment : '';
                                    if (safeFragment) {
                                        assistantContent += safeFragment;
                                        setMessages(prev => prev.map(m =>
                                            m.id === assistantId
                                                ? { ...m, content: assistantContent }
                                                : m
                                        ));
                                    }
                                }
                            } catch {
                                // Not JSON, treat as raw text
                                const raw = line.slice(6).trim();
                                if (raw && raw !== '[DONE]') {
                                    assistantContent += raw;
                                    setMessages(prev => prev.map(m =>
                                        m.id === assistantId
                                            ? { ...m, content: assistantContent }
                                            : m
                                    ));
                                }
                            }
                        }
                    }
                }
                reader.releaseLock();
            } else {
                // Handle regular JSON response
                const data = await resp.json();
                let content: string;
                if (!data.success) {
                    content = `Error: ${data.error}`;
                } else {
                    const d = data.data;
                    // Extract only string fields — never show raw JSON/objects to the user
                    const raw = d?.text ?? d?.response ?? d?.content ?? null;
                    content = typeof raw === 'string' ? raw
                        : typeof raw === 'number' ? String(raw)
                            : d?.message ?? 'Response received.';
                }

                setMessages(prev => [...prev, {
                    id: `assistant-${Date.now()}`,
                    role: 'assistant',
                    content,
                    timestamp: Date.now(),
                }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                id: `error-${Date.now()}`,
                role: 'system',
                content: `⚠️ ${err instanceof Error ? err.message : 'Failed to reach Stella'}`,
                timestamp: Date.now(),
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // ─── Skills ───────────────────────────────────────
    const loadSkills = useCallback(async () => {
        if (status !== 'online') return;
        setSkillsLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/skills`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success && Array.isArray(data.data)) {
                setSkills(data.data);
            }
        } catch {
            // silently fail
        } finally {
            setSkillsLoading(false);
        }
    }, [status]);

    const toggleSkill = async (name: string, currentlyEnabled: boolean) => {
        const action = currentlyEnabled ? 'disable' : 'enable';
        try {
            await fetch(`${API_BASE}/skills/${encodeURIComponent(name)}/${action}`, { method: 'POST', headers: getAuthHeaders() });
            setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled: !currentlyEnabled } : s));
        } catch {
            // silently fail
        }
    };

    useEffect(() => {
        if (tab === 'skills') loadSkills();
    }, [tab, loadSkills]);

    // ─── Memory ───────────────────────────────────────
    const loadMemory = useCallback(async () => {
        if (status !== 'online') return;
        setMemoryLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/memory`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success && Array.isArray(data.data)) {
                setMemoryFiles(data.data);
            }
        } catch {
            // silently fail
        } finally {
            setMemoryLoading(false);
        }
    }, [status]);

    const loadMemoryContent = async (filename: string) => {
        if (memoryContent[filename]) {
            setExpandedMemory(expandedMemory === filename ? null : filename);
            return;
        }
        try {
            const resp = await fetch(`${API_BASE}/memory/${encodeURIComponent(filename)}`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success && data.data?.content) {
                setMemoryContent(prev => ({ ...prev, [filename]: data.data.content }));
                setExpandedMemory(filename);
            }
        } catch {
            // silently fail
        }
    };

    useEffect(() => {
        if (tab === 'memory') loadMemory();
        if (tab === 'voice' && !voiceChecked) {
            fetch(`${API_BASE}/voice-status`, { headers: getAuthHeaders() })
                .then(r => r.json())
                .then(d => {
                    if (d.success && d.data) {
                        setVoiceOnline(d.data.online);
                        if (d.data.url) setVoiceUrl(d.data.url);
                    }
                    setVoiceChecked(true);
                })
                .catch(() => setVoiceChecked(true));
        }
    }, [tab, loadMemory]);

    // ─── Render ───────────────────────────────────────
    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        return `${(bytes / 1024).toFixed(1)} KB`;
    };

    return (
        <div className="stella">
            {/* Tabs */}
            <div className="stella__tabs">
                {(['chat', 'skills', 'memory', 'voice', 'settings'] as Tab[]).map(t => (
                    <button
                        key={t}
                        className={`stella__tab ${tab === t ? 'stella__tab--active' : ''}`}
                        onClick={() => setTab(t)}
                    >
                        {t === 'chat' ? '💬 Chat' : t === 'skills' ? '🧩 Skills' : t === 'memory' ? '🧠 Memory' : t === 'voice' ? '🎙️ Voice' : '⚙️ Settings'}
                    </button>
                ))}
            </div>

            {/* Status Bar */}
            <div className="stella__status-bar">
                <span className={`stella__status-dot stella__status-dot--${status}`} />
                <span>Stella {status === 'online' ? 'Online' : status === 'loading' ? 'Connecting…' : status === 'starting' ? 'Starting…' : 'Offline'}</span>
                {version && <span className="stella__version">v{version}</span>}
                {healthMs !== null && status === 'online' && <span className="stella__latency">{healthMs}ms</span>}
                {pid && <span className="stella__pid">PID {pid}</span>}
            </div>

            {/* Offline Banner */}
            {status === 'offline' && (
                <div className="stella__offline-banner">
                    ⚠️ Stella is not running.
                    <button className="stella__retry-btn" onClick={checkStatus}>Retry</button>
                    <button className="stella__retry-btn" onClick={async () => {
                        setInitLoading(true);
                        try {
                            await fetch(`${API_BASE}/init`, { method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ provider, model }) });
                            await checkStatus();
                        } catch { } finally { setInitLoading(false); }
                    }} disabled={initLoading}>{initLoading ? 'Initializing…' : 'Initialize'}</button>
                </div>
            )}

            {/* Chat Tab */}
            {tab === 'chat' && (
                <div className="stella__chat">
                    <div className="stella__messages">
                        {messages.map(msg => (
                            <div key={msg.id} className={`stella__msg stella__msg--${msg.role}`}>
                                {msg.role === 'assistant'
                                    ? <div className="stella__msg-html" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                                    : msg.content
                                }
                                {msg.role !== 'system' && (
                                    <span className="stella__msg-time">{formatTime(msg.timestamp)}</span>
                                )}
                            </div>
                        ))}
                        {isTyping && (
                            <div className="stella__typing">
                                <div className="stella__typing-dot" />
                                <div className="stella__typing-dot" />
                                <div className="stella__typing-dot" />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    <div className="stella__input-area">
                        <textarea
                            ref={inputRef}
                            className="stella__input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={status === 'online' ? 'Ask Stella anything…' : 'Stella is offline'}
                            disabled={status !== 'online'}
                            rows={1}
                        />
                        <button
                            className="stella__send-btn"
                            onClick={sendMessage}
                            disabled={!input.trim() || isTyping || status !== 'online'}
                            title="Send"
                        >
                            ➤
                        </button>
                    </div>
                </div>
            )}

            {/* Skills Tab */}
            {tab === 'skills' && (
                <div className="stella__panel">
                    {skillsLoading ? (
                        <div className="stella__loading">
                            <div className="stella__spinner" /> Loading skills…
                        </div>
                    ) : skills.length === 0 ? (
                        <div className="stella__empty">
                            <span className="stella__empty-icon">🧩</span>
                            <p className="stella__empty-text">
                                {status === 'online'
                                    ? 'No skills found. Stella skills extend its capabilities.'
                                    : 'Connect to Stella to view skills.'}
                            </p>
                        </div>
                    ) : (
                        skills.map(skill => (
                            <div key={skill.name} className="stella__skill-card">
                                <div className="stella__skill-icon">
                                    {skill.source === 'builtin' ? '📦' : '✨'}
                                </div>
                                <div className="stella__skill-info">
                                    <div className="stella__skill-name">{skill.name}</div>
                                    <div className="stella__skill-source">{skill.source}</div>
                                </div>
                                <button
                                    className={`stella__skill-toggle stella__skill-toggle--${skill.enabled ? 'on' : 'off'}`}
                                    onClick={() => toggleSkill(skill.name, skill.enabled)}
                                    title={skill.enabled ? 'Disable' : 'Enable'}
                                />
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Memory Tab */}
            {tab === 'memory' && (
                <div className="stella__panel">
                    {memoryLoading ? (
                        <div className="stella__loading">
                            <div className="stella__spinner" /> Loading memory…
                        </div>
                    ) : memoryFiles.length === 0 ? (
                        <div className="stella__empty">
                            <span className="stella__empty-icon">🧠</span>
                            <p className="stella__empty-text">
                                {status === 'online'
                                    ? 'No memory files yet. Stella stores context here as you interact.'
                                    : 'Connect to Stella to view memory.'}
                            </p>
                        </div>
                    ) : (
                        memoryFiles.map(file => (
                            <div
                                key={file.filename}
                                className="stella__memory-file"
                                onClick={() => loadMemoryContent(file.filename)}
                            >
                                <div className="stella__memory-filename">
                                    📄 {file.filename}
                                </div>
                                <div className="stella__memory-meta">
                                    {formatSize(file.size)} • Modified {file.modified_time}
                                </div>
                                {expandedMemory === file.filename && memoryContent[file.filename] && (
                                    <div className="stella__memory-content">
                                        {memoryContent[file.filename]}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Voice Tab */}
            {tab === 'voice' && (
                <div className="stella__voice-panel">
                    {!voiceChecked ? (
                        <div className="stella__loading">
                            <div className="stella__spinner" /> Checking voice service…
                        </div>
                    ) : voiceOnline ? (
                        <iframe
                            className="stella__voice-iframe"
                            src={voiceUrl}
                            title="Stella Voice"
                            allow="microphone; camera; display-capture"
                        />
                    ) : (
                        <div className="stella__empty">
                            <span className="stella__empty-icon">🎙️</span>
                            <p className="stella__empty-text">
                                Stella Voice service is not running.
                                Start it with: <code>cd stella-livekit && npm run dev</code>
                            </p>
                            <button
                                className="stella__settings-btn"
                                onClick={() => {
                                    setVoiceChecked(false);
                                    fetch(`${API_BASE}/voice-status`, { headers: getAuthHeaders() })
                                        .then(r => r.json())
                                        .then(d => {
                                            if (d.success && d.data) {
                                                setVoiceOnline(d.data.online);
                                                if (d.data.url) setVoiceUrl(d.data.url);
                                            }
                                            setVoiceChecked(true);
                                        })
                                        .catch(() => setVoiceChecked(true));
                                }}
                            >
                                🔄 Retry Connection
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Settings Tab */}
            {tab === 'settings' && (
                <div className="stella__panel stella__settings">
                    <h4 className="stella__settings-title">🔧 Stella Configuration</h4>

                    <div className="stella__settings-group">
                        <label className="stella__settings-label">LLM Provider</label>
                        <select
                            className="stella__settings-select"
                            value={provider}
                            onChange={e => setProvider(e.target.value)}
                        >
                            {PROVIDERS.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="stella__settings-group">
                        <label className="stella__settings-label">Model</label>
                        <select
                            className="stella__settings-select"
                            value={model}
                            onChange={e => setModel(e.target.value)}
                        >
                            {(PROVIDERS.find(p => p.id === provider)?.models || []).map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        className="stella__settings-btn stella__settings-btn--primary"
                        onClick={async () => {
                            try {
                                await fetch(`${API_BASE}/provider`, {
                                    method: 'PUT',
                                    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                                    body: JSON.stringify({ provider, model }),
                                });
                                await checkStatus();
                            } catch { }
                        }}
                    >
                        📡 Apply Provider
                    </button>

                    <hr className="stella__settings-divider" />

                    <h4 className="stella__settings-title">🛠️ Lifecycle</h4>
                    <div className="stella__settings-actions">
                        <button
                            className="stella__settings-btn"
                            onClick={async () => {
                                setInitLoading(true);
                                try {
                                    await fetch(`${API_BASE}/init`, { method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ provider, model }) });
                                    await checkStatus();
                                } catch { } finally { setInitLoading(false); }
                            }}
                            disabled={initLoading}
                        >
                            {initLoading ? '⏳ Initializing...' : '🚀 Initialize'}
                        </button>
                        <button
                            className="stella__settings-btn stella__settings-btn--danger"
                            onClick={async () => {
                                try {
                                    await fetch(`${API_BASE}/cleanup`, { method: 'POST', headers: getAuthHeaders() });
                                    await checkStatus();
                                } catch { }
                            }}
                        >
                            🧹 Port Cleanup
                        </button>
                        <button
                            className="stella__settings-btn"
                            onClick={async () => {
                                const result = await fetch(`${API_BASE}/health`, { headers: getAuthHeaders() }).then(r => r.json());
                                if (result.data?.ok) {
                                    setHealthMs(result.data.ms);
                                    setStatus('online');
                                } else {
                                    setStatus('offline');
                                }
                            }}
                        >
                            🏥 Health Ping
                        </button>
                    </div>

                    {/* Status Details */}
                    <div className="stella__settings-status">
                        <div>🔴 Status: <strong>{status}</strong></div>
                        {healthMs !== null && <div>⏱️ Latency: <strong>{healthMs}ms</strong></div>}
                        {pid && <div>💻 PID: <strong>{pid}</strong></div>}
                        {version && <div>🌟 Version: <strong>{version}</strong></div>}
                        <div>🤖 Provider: <strong>{provider} / {model}</strong></div>
                    </div>
                </div>
            )}
        </div>
    );
}
