/**
 * AntigravityChat — the Antigravity (Gemini) assistant rendered as a
 * fill-container body (no floating chrome). Hosted by AssistantLauncher.
 *
 * Talks to the Dwellium backend Antigravity proxy (/api/v1/antigravity/chat,
 * workspace-aware Gemini). Conversation persists to localStorage so it survives
 * background/foreground and reloads. Markdown is XSS-sanitised via safeMarkdown.
 */
import { useState, useRef, useEffect } from 'react';
import { API_BASE } from '../../config';
import { renderSafeMarkdown } from '../../utils/safeMarkdown';
import { getAuthToken } from '../../context/UserContext';

interface AGMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    thinking?: boolean;
    model?: string;
}

type AGModel = 'gemini-2.0-flash' | 'gemini-2.5-pro';
const MODEL_LABELS: Record<AGModel, string> = { 'gemini-2.0-flash': 'Flash', 'gemini-2.5-pro': 'Pro' };

const STORAGE_KEY = 'ag-chat-history';
const MAX_PERSISTED = 50;

const WELCOME: AGMessage = {
    id: 'welcome',
    role: 'system',
    content: '**Antigravity** connected — Gemini, workspace-aware. Ask about your properties, tenants, agents, or have me draft documents and analyze data.',
    timestamp: Date.now(),
};

function genId() { return `ag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export default function AntigravityChat() {
    const [messages, setMessages] = useState<AGMessage[]>([WELCOME]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [model, setModel] = useState<AGModel>('gemini-2.0-flash');
    const [sessionId] = useState(() => `ag-session-${Date.now()}`);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const endRef = useRef<HTMLDivElement>(null);

    // Hydrate persisted history (effect = SSR-safe; never reads storage during render)
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) setMessages([WELCOME, ...parsed.slice(-MAX_PERSISTED)]);
            }
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        try {
            const toSave = messages.filter(m => !m.thinking && m.id !== 'welcome').slice(-MAX_PERSISTED);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch { /* ignore */ }
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const send = async () => {
        const text = input.trim();
        if (!text || isLoading) return;
        const userMsg: AGMessage = { id: genId(), role: 'user', content: text, timestamp: Date.now() };
        const thinking: AGMessage = { id: genId(), role: 'assistant', content: '', timestamp: Date.now(), thinking: true };
        setMessages(prev => [...prev, userMsg, thinking]);
        setInput('');
        setIsLoading(true);
        try {
            const token = getAuthToken() || '';
            const resp = await fetch(`${API_BASE}/api/v1/antigravity/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    message: text, sessionId, model,
                    history: messages.filter(m => m.role !== 'system' && !m.thinking).slice(-12).map(m => ({ role: m.role, content: m.content })),
                }),
            });
            const data = await resp.json();
            const reply = data.data?.reply || data.reply || data.error || 'No response received.';
            const usedModel = data.data?.model || model;
            setMessages(prev => prev.map(m => m.id === thinking.id ? { ...m, content: reply, thinking: false, model: usedModel } : m));
        } catch (e: any) {
            setMessages(prev => prev.map(m => m.id === thinking.id ? { ...m, content: `⚠️ Connection error: ${e?.message || e}`, thinking: false } : m));
        } finally {
            setIsLoading(false);
        }
    };

    const clear = () => { setMessages([WELCOME]); try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ } };

    return (
        <div className="alc-chat">
            <div className="alc-chat-toolbar">
                <div className="alc-model-selector">
                    {(Object.keys(MODEL_LABELS) as AGModel[]).map(m => (
                        <button key={m} className={`alc-model-opt ${model === m ? 'alc-model-opt--active' : ''}`} onClick={() => setModel(m)} title={m}>
                            {MODEL_LABELS[m]}
                        </button>
                    ))}
                </div>
                <button className="alc-tool-btn" onClick={clear} disabled={messages.length <= 1} title="Clear conversation">Clear</button>
            </div>

            <div className="alc-messages">
                {messages.map(msg => (
                    <div key={msg.id} className={`alc-msg alc-msg--${msg.role}`}>
                        <div className="alc-bubble">
                            {msg.thinking
                                ? <div className="alc-thinking"><span /><span /><span /></div>
                                : <div className="alc-content" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(msg.content) }} />}
                        </div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            <div className="alc-input-bar">
                <textarea
                    ref={inputRef}
                    className="alc-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Ask Antigravity… (Enter to send, Shift+Enter for newline)"
                    rows={1}
                    disabled={isLoading}
                />
                <button className="alc-send-btn" onClick={send} disabled={!input.trim() || isLoading} title="Send">
                    {isLoading ? <span className="alc-send-spinner" /> : '➤'}
                </button>
            </div>
        </div>
    );
}
