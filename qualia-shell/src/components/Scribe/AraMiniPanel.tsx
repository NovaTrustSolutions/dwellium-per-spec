/**
 * AraMiniPanel — floating ARA chat in the top-right corner of Scribe.
 *
 * Lightweight chat window that uses the user's configured LLM via the
 * shared llmClient. Listens for a `scribe:send-to-ara` custom event so
 * other Scribe surfaces (SelectionToolbar, ContextMenu) can push the
 * current selection into the conversation without prop drilling.
 *
 * Per-user persistence is OUT of scope here — this is a transient chat
 * for the current Scribe session. Closing the panel clears the buffer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { buildContextWarning, sumTokens } from '../../lib/contextWindow';

interface Msg {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

const SYSTEM_PROMPT = `You are ARA, a precise document-editing assistant inside the Dwellium Scribe editor. When the user pastes a passage from their document, treat it as the subject of their question. Be concise, give actionable suggestions, and use Markdown sparingly (bold for callouts, lists for steps).`;

const STORAGE_OPEN_KEY = 'scribe-ara-mini-open';

export function AraMiniPanel() {
    const { integrations } = useIntegrations();
    const [open, setOpen] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try { return localStorage.getItem(STORAGE_OPEN_KEY) === '1'; } catch { return false; }
    });
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const llmReady = hasActiveLlm(integrations.llm);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_OPEN_KEY, open ? '1' : '0'); } catch { /* sandboxed */ }
    }, [open]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, busy]);

    const ask = useCallback(async (text: string) => {
        if (!text.trim() || busy) return;
        const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: text.trim() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        if (!llmReady) {
            setMessages(prev => [...prev, {
                id: `s-${Date.now()}`,
                role: 'assistant',
                content: 'Configure an LLM key in Settings → API Keys to chat with ARA.',
            }]);
            return;
        }
        setBusy(true);
        try {
            const res = await callLlm({
                systemPrompt: SYSTEM_PROMPT,
                prompt: text.trim(),
                maxTokens: 800,
                temperature: 0.4,
            }, integrations.llm);
            setMessages(prev => [...prev, {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: res?.text || '(no response)',
            }]);
        } catch (err: any) {
            setMessages(prev => [...prev, {
                id: `e-${Date.now()}`,
                role: 'assistant',
                content: `Error: ${err?.message || 'request failed'}`,
            }]);
        } finally {
            setBusy(false);
        }
    }, [busy, integrations.llm, llmReady]);

    // Listen for cross-component sends (SelectionToolbar / ContextMenu / Redline /
    // Comment buttons). Auto-opens the panel and pre-fills the selection as the
    // user's next message (with optional preamble).
    useEffect(() => {
        const handler = (ev: Event) => {
            const detail = (ev as CustomEvent).detail || {};
            const { text, preface } = detail as { text: string; preface?: string };
            if (!text) return;
            setOpen(true);
            const composed = preface ? `${preface}\n\n> ${text.replace(/\n/g, '\n> ')}` : text;
            void ask(composed);
            setTimeout(() => inputRef.current?.focus(), 100);
        };
        window.addEventListener('scribe:send-to-ara', handler);
        return () => window.removeEventListener('scribe:send-to-ara', handler);
    }, [ask]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void ask(input);
        }
    };

    if (!open) {
        return (
            <button
                className="scribe-ara-fab"
                onClick={() => setOpen(true)}
                title="Open ARA"
                aria-label="Open ARA panel"
            >
                ARA
            </button>
        );
    }

    return (
        <div className="scribe-ara-panel" role="complementary" aria-label="ARA chat">
            <div className="scribe-ara-panel__header">
                <span className="scribe-ara-panel__title">
                    <span className="scribe-ara-panel__dot" aria-hidden /> ARA
                </span>
                <button
                    className="scribe-ara-panel__btn-icon"
                    onClick={() => setMessages([])}
                    title="Clear chat"
                    disabled={messages.length === 0}
                >
                    🧹
                </button>
                <button
                    className="scribe-ara-panel__btn-icon"
                    onClick={() => setOpen(false)}
                    title="Close"
                    aria-label="Close ARA panel"
                >
                    ✕
                </button>
            </div>
            {(() => {
                const tokens = sumTokens([SYSTEM_PROMPT, ...messages.map(m => m.content)]);
                const w = buildContextWarning(tokens, integrations.llm);
                if (w.level === 'ok') return null;
                return (
                    <div className={`scribe-ara-ctx-warn scribe-ara-ctx-warn--${w.level}`}>
                        <span>{w.level === 'warn' ? '⚠️' : '🛑'}</span>
                        <span style={{ flex: 1 }}>{w.message}</span>
                        <button
                            className="scribe-ara-ctx-warn-btn"
                            onClick={() => setMessages([])}
                            title="Start a fresh ARA chat"
                        >
                            New
                        </button>
                    </div>
                );
            })()}
            <div className="scribe-ara-panel__messages">
                {messages.length === 0 && !busy && (
                    <p className="scribe-ara-panel__empty">
                        Ask anything about your document. Selected text from Scribe can be sent here from the Comment / Redline toolbar.
                    </p>
                )}
                {messages.map(m => (
                    <div key={m.id} className={`scribe-ara-msg scribe-ara-msg--${m.role}`}>
                        {m.content}
                    </div>
                ))}
                {busy && <div className="scribe-ara-msg scribe-ara-msg--assistant scribe-ara-msg--busy">…</div>}
                <div ref={endRef} />
            </div>
            <div className="scribe-ara-panel__composer">
                <textarea
                    ref={inputRef}
                    className="scribe-ara-panel__input"
                    placeholder={llmReady ? 'Ask ARA…  (⌘↩ to send)' : 'Configure an LLM key to chat'}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={2}
                />
                <button
                    className="scribe-ara-panel__send"
                    onClick={() => void ask(input)}
                    disabled={!input.trim() || busy}
                    title="Send (⌘↩)"
                >
                    ➤
                </button>
            </div>
        </div>
    );
}
