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
import { detectsOpenDocRequest, getActiveScribeDoc, buildOpenDocPrompt, NO_OPEN_DOC_MESSAGE } from '../../lib/openDocContext';

interface Msg {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

const SYSTEM_PROMPT = `You are ARA, a precise document-editing assistant inside the Dwellium Scribe editor. When the user pastes a passage from their document, treat it as the subject of their question. Be concise, give actionable suggestions, and use Markdown sparingly (bold for callouts, lists for steps).`;

const STORAGE_OPEN_KEY = 'scribe-ara-mini-open';

export function AraMiniPanel() {
    const { integrations } = useIntegrations();
    // Docked at the bottom of Scribe and EXPANDED by default; `open` now means
    // "expanded" (collapsing leaves just the header bar). Persisted as before.
    const [open, setOpen] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        try { return localStorage.getItem(STORAGE_OPEN_KEY) !== '0'; } catch { return true; }
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
        // 2026-06-12 (Ilya): "review the markdown file open" reads the active
        // Scribe doc directly — no copy-paste. Honest reply when nothing's open.
        let prompt = text.trim();
        if (detectsOpenDocRequest(prompt)) {
            const doc = getActiveScribeDoc();
            if (doc) {
                prompt = buildOpenDocPrompt(prompt, doc);
            } else {
                setMessages(prev => [...prev, { id: `s-${Date.now()}`, role: 'assistant', content: NO_OPEN_DOC_MESSAGE }]);
                return;
            }
        }
        setBusy(true);
        try {
            const res = await callLlm({
                systemPrompt: SYSTEM_PROMPT,
                prompt,
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

    return (
        <div
            className={`scribe-ara-dock ${open ? '' : 'scribe-ara-dock--collapsed'}`}
            role="complementary"
            aria-label="ARA assistant"
        >
            <div
                className="scribe-ara-dock__header"
                onClick={() => setOpen(o => !o)}
                title={open ? 'Collapse ARA' : 'Expand ARA'}
            >
                <span className="scribe-ara-dock__title">
                    <span className="scribe-ara-dock__dot" aria-hidden /> ARA
                </span>
                <span className="scribe-ara-dock__model" title="Active model">Local ▾</span>
                <span className="scribe-ara-dock__grow" />
                <button
                    className="scribe-ara-dock__icon"
                    onClick={(e) => { e.stopPropagation(); setMessages([]); }}
                    title="Clear chat"
                    disabled={messages.length === 0}
                >
                    Clear
                </button>
                <button
                    className="scribe-ara-dock__icon scribe-ara-dock__chev"
                    onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                    title={open ? 'Collapse' : 'Expand'}
                    aria-label={open ? 'Collapse ARA' : 'Expand ARA'}
                >
                    {open ? '▾' : '▴'}
                </button>
            </div>
            {open && (
                <>
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
                    <div className="scribe-ara-dock__messages">
                        {messages.length === 0 && !busy && (
                            <p className="scribe-ara-dock__empty">
                                Ask anything about your document. Selected text can be sent here from the Comment / Redline toolbar.
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
                    <div className="scribe-ara-dock__composer">
                        <textarea
                            ref={inputRef}
                            className="scribe-ara-dock__input"
                            placeholder={llmReady ? 'Message ARA…  (⌘↩ to send)' : 'Configure an LLM key in Settings → API Keys'}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={onKeyDown}
                            rows={1}
                        />
                        <button
                            className="scribe-ara-dock__send"
                            onClick={() => void ask(input)}
                            disabled={!input.trim() || busy}
                            title="Send (⌘↩)"
                        >
                            Send
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
