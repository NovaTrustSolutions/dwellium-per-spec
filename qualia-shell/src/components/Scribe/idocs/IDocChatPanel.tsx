/**
 * IDocChatPanel — in-editor AI chat for ONE Interactive Doc (wave 2B).
 *
 * ── Mount contract (agent C: right-side drawer in IDocEditor) ──
 *   <IDocChatPanel doc={doc} llm={integrations.llm} onApply={(next, label) => { pushSnapshot(doc.id); replaceDoc(next); }} onClose={() => setChatOpen(false)} />
 *   props: { doc: IDoc; llm: LlmBundle; onApply: (next: IDoc, label: string) => void; onClose?: () => void; callLlmFn?: CallLlmFn (test seam) }
 *
 * Behaviour: local chat thread; system prompt = "editor's assistant for THIS document" + compact doc context (title,
 * card titles/ids, block-type counts, first 400 chars per card, ≤ ~6k) + BLOCK_CONTRACT. Every reply is JSON
 * `{ answer, action? }`; actions run through idocsDocAi (addCardWithAi / regenerateCard / restyleDoc / translateDoc)
 * or a direct normalized patch (edit-block) into a PENDING preview ("Will replace card 'X'") with Apply / Discard —
 * the doc is NEVER mutated here; Apply calls onApply(next, label). Quick chips: Summarize · Add card · Translate ·
 * Fix grammar · Make shorter · Suggest images. Keys: Enter sends, Shift+Enter newline, Esc closes (capture-phase +
 * stopPropagation so Desktop's global Esc doesn't also close the window). Drop a text file → added to context; an
 * image → "vision not wired" stub (callLlm is text-only).
 */
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { callLlm, hasActiveLlm } from '../../../lib/llmClient';
import { BLOCK_CONTRACT, normalizeBlock, parseJsonLoose, type CallLlmFn, type LlmBundle } from './idocsAi';
import { addCardWithAi, docContext, regenerateCard, restyleDoc, translateDoc } from './idocsDocAi';
import type { Card, IDoc } from './idocTypes';
import './IDocChatPanel.css';

export interface IDocChatPanelProps {
    doc: IDoc;
    llm: LlmBundle;
    onApply: (next: IDoc, label: string) => void;
    onClose?: () => void;
    /** Test seam — defaults to the real llmClient.callLlm. */
    callLlmFn?: CallLlmFn;
}

interface Msg { role: 'user' | 'assistant'; text: string }
interface Pending { next: IDoc; label: string; detail?: string }

type ChatAction =
    | { kind: 'add-card'; instruction: string; atIndex?: number }
    | { kind: 'replace-card'; cardId: string; instruction?: string }
    | { kind: 'edit-block'; cardId: string; blockId: string; block: unknown }
    | { kind: 'restyle'; instruction: string }
    | { kind: 'translate'; language: string }
    | { kind: 'none' };

const MAX_ATTACH_CHARS = 8000;

const SYSTEM = `You are the editor's assistant for THIS document (an interactive card/block doc). Answer questions about it, and when the user asks for a change, propose ONE action.
Respond with STRICT JSON only — no fences: {"answer":"short markdown reply","action":{…}} — "action" is optional; omit it (or use {"kind":"none"}) for pure answers.
Action shapes (use card/block ids from the context):
- {"kind":"add-card","instruction":"what the new card covers","atIndex":3}   (atIndex optional, 0-based)
- {"kind":"replace-card","cardId":"…","instruction":"how to regenerate it"}
- {"kind":"edit-block","cardId":"…","blockId":"…","block":{"type":"text","md":"new content"}}   (full replacement block, same type preferred)
- {"kind":"restyle","instruction":"e.g. more concise and friendly"}   (rewrites the prose of ALL cards)
- {"kind":"translate","language":"Spanish"}
- {"kind":"none"}
Never propose more than one action per reply. Keep "answer" under 120 words.
${BLOCK_CONTRACT}`;

const CHIPS: { id: string; label: string }[] = [
    { id: 'summarize', label: 'Summarize' },
    { id: 'add-card', label: 'Add card' },
    { id: 'translate', label: 'Translate' },
    { id: 'grammar', label: 'Fix grammar' },
    { id: 'shorter', label: 'Make shorter' },
    { id: 'images', label: 'Suggest images' },
];

const findCard = (doc: IDoc, id: string): { card: Card; index: number } | null => {
    const index = doc.cards.findIndex((c) => c.id === id);
    return index < 0 ? null : { card: doc.cards[index], index };
};

function parseAction(raw: unknown): ChatAction | null {
    if (!raw || typeof raw !== 'object') return null;
    const a = raw as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    switch (a.kind) {
        case 'add-card': return s(a.instruction) ? { kind: 'add-card', instruction: s(a.instruction), atIndex: typeof a.atIndex === 'number' ? a.atIndex : undefined } : null;
        case 'replace-card': return s(a.cardId) ? { kind: 'replace-card', cardId: s(a.cardId), instruction: s(a.instruction) || undefined } : null;
        case 'edit-block': return s(a.cardId) && s(a.blockId) && a.block ? { kind: 'edit-block', cardId: s(a.cardId), blockId: s(a.blockId), block: a.block } : null;
        case 'restyle': return s(a.instruction) ? { kind: 'restyle', instruction: s(a.instruction) } : null;
        case 'translate': return s(a.language) ? { kind: 'translate', language: s(a.language) } : null;
        default: return null;
    }
}

const blockTypes = (c: Card | undefined) => (c?.blocks.map((b) => b.type).join(', ') || 'empty');

export default function IDocChatPanel({ doc, llm, onApply, onClose, callLlmFn = callLlm }: IDocChatPanelProps) {
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);
    const [attachments, setAttachments] = useState<{ name: string; text: string }[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const threadRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const docRef = useRef(doc);
    docRef.current = doc;
    const llmReady = hasActiveLlm(llm);

    // Esc closes — capture phase + stopPropagation so Desktop's global Esc-closes-window shortcut never sees it.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose?.(); } };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
    }, [onClose]);
    useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, pending, busy]);

    const say = (role: Msg['role'], text: string) => setMessages((m) => [...m, { role, text }]);

    /** Turn a parsed action into a pending preview (runs the docAi helper — never mutates). */
    const prepare = async (action: ChatAction): Promise<Pending | null> => {
        const d = docRef.current;
        switch (action.kind) {
            case 'add-card': {
                const next = await addCardWithAi(d, action.instruction, llm, callLlmFn, action.atIndex);
                if (!next) return null;
                const at = action.atIndex == null ? next.cards.length : Math.max(0, Math.min(d.cards.length, action.atIndex)) + 1;
                const card = next.cards[at - 1];
                return { next, label: `Will add card “${card?.title ?? 'New card'}” at position ${at}`, detail: blockTypes(card) };
            }
            case 'replace-card': {
                const hit = findCard(d, action.cardId);
                if (!hit) return null;
                const next = await regenerateCard(d, action.cardId, action.instruction, llm, callLlmFn);
                if (!next) return null;
                return { next, label: `Will replace card “${hit.card.title ?? `Card ${hit.index + 1}`}”`, detail: `${blockTypes(hit.card)} → ${blockTypes(next.cards[hit.index])}` };
            }
            case 'edit-block': {
                const hit = findCard(d, action.cardId);
                const bi = hit?.card.blocks.findIndex((b) => b.id === action.blockId) ?? -1;
                if (!hit || bi < 0) return null;
                const block = { ...normalizeBlock(action.block), id: action.blockId };
                const card: Card = { ...hit.card, blocks: hit.card.blocks.map((b, i) => (i === bi ? block : b)) };
                const next: IDoc = { ...d, cards: d.cards.map((c, i) => (i === hit.index ? card : c)), updatedAt: new Date().toISOString() };
                return { next, label: `Will edit a ${block.type} block in “${hit.card.title ?? `Card ${hit.index + 1}`}”`, detail: 'md' in block ? String(block.md).slice(0, 160) : undefined };
            }
            case 'restyle': {
                const next = await restyleDoc(d, action.instruction, llm, callLlmFn);
                return next ? { next, label: `Will rewrite all ${d.cards.length} cards: ${action.instruction}` } : null;
            }
            case 'translate': {
                const next = await translateDoc(d, action.language, llm, callLlmFn);
                return next ? { next, label: `Will translate all ${d.cards.length} cards to ${action.language}` } : null;
            }
            case 'none': return null;
        }
    };

    const send = async (text: string) => {
        const t = text.trim();
        if (!t || busy) return;
        if (!llmReady) { say('assistant', 'No LLM configured — add a key in Control Panel → API Keys.'); return; }
        say('user', t);
        setInput('');
        setBusy('Thinking…');
        try {
            const history = messages.slice(-8).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
            const attach = attachments.length ? `\n\n<attachments>\n${attachments.map((a) => `--- ${a.name} ---\n${a.text}`).join('\n')}\n</attachments>` : '';
            const res = await callLlmFn({
                systemPrompt: SYSTEM,
                prompt: `<document>\n${docContext(docRef.current)}\n</document>${attach}\n\n${history ? `${history}\n` : ''}User: ${t}`,
                maxTokens: 1500, temperature: 0.4, responseFormat: 'json',
            }, llm);
            const parsed = res?.text ? parseJsonLoose(res.text) as Record<string, unknown> | null : null;
            const answer = typeof parsed?.answer === 'string' ? parsed.answer : (res?.text?.trim() || 'The model returned nothing usable.');
            say('assistant', answer);
            const action = parseAction(parsed?.action);
            if (action && action.kind !== 'none') {
                setBusy('Preparing change…');
                const p = await prepare(action);
                if (p) setPending(p); else say('assistant', 'I couldn’t prepare that change (unknown card/block or empty model reply).');
            }
        } catch (e) {
            say('assistant', `Failed: ${(e as Error).message}`);
        } finally { setBusy(null); }
    };

    /** Chips that skip the chat call and go straight to a preview. */
    const direct = async (label: string, run: () => Promise<IDoc | null>, done: string) => {
        if (busy) return;
        if (!llmReady) { say('assistant', 'No LLM configured — add a key in Control Panel → API Keys.'); return; }
        say('user', label);
        setBusy(`${label}…`);
        try {
            const next = await run();
            if (next) setPending({ next, label: done }); else say('assistant', 'The model returned nothing usable.');
        } catch (e) { say('assistant', `Failed: ${(e as Error).message}`); } finally { setBusy(null); }
    };

    const chip = (id: string) => {
        const d = docRef.current;
        switch (id) {
            case 'summarize': return void send('Summarize this document in 3-5 bullets.');
            case 'add-card': setInput('Add a card about '); inputRef.current?.focus(); return;
            case 'translate': setInput('Translate the document to '); inputRef.current?.focus(); return;
            case 'grammar': return void direct('Fix grammar', () => restyleDoc(d, 'fix grammar and typos only', llm, callLlmFn), `Will fix grammar and typos in all ${d.cards.length} cards`);
            case 'shorter': return void direct('Make shorter', () => restyleDoc(d, 'make every card roughly half as long; keep the key facts and structure', llm, callLlmFn), `Will shorten all ${d.cards.length} cards`);
            case 'images': return void send('Suggest one image for each card: reply with a numbered list of "Card title — image generation prompt" (no action).');
        }
    };

    const onFiles = async (files: FileList | File[]) => {
        for (const f of Array.from(files)) {
            if (f.type.startsWith('image/')) { say('assistant', `Image “${f.name}” received — vision not wired: the text-only LLM route can’t describe images yet.`); continue; }
            const isText = f.type.startsWith('text/') || /\.(md|txt|csv|json|html?)$/i.test(f.name) || !f.type;
            if (!isText) { say('assistant', `Skipped “${f.name}” — only text and image files are accepted here.`); continue; }
            const text = (await f.text()).slice(0, MAX_ATTACH_CHARS);
            setAttachments((a) => [...a.filter((x) => x.name !== f.name), { name: f.name, text }]);
            say('assistant', `Attached “${f.name}” (${text.length} chars) — added to the conversation context.`);
        }
    };

    const onDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); void onFiles(e.dataTransfer.files); };
    const onInputKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); }
    };

    return (
        <aside
            className={`scribe-idocs-chat${dragOver ? ' is-dragover' : ''}`} aria-label="Document AI chat" data-dwellium-drop-zone="idoc-chat"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
        >
            <header className="scribe-idocs-chat__head">
                <strong>✦ Ask about this doc</strong>
                <span className="scribe-idocs-chat__spacer" />
                {onClose && <button type="button" className="scribe-idocs-chat__icon" onClick={onClose} aria-label="Close chat" title="Close (Esc)">✕</button>}
            </header>
            <div className="scribe-idocs-chat__chips" role="toolbar" aria-label="Quick actions">
                {CHIPS.map((c) => <button key={c.id} type="button" className="scribe-idocs-chat__chip" onClick={() => chip(c.id)} disabled={!!busy}>{c.label}</button>)}
            </div>
            <div className="scribe-idocs-chat__thread" ref={threadRef} aria-live="polite">
                {messages.length === 0 && <p className="scribe-idocs-chat__hint">Ask anything about “{doc.title}”, or tell me what to change — I’ll show a preview before anything is applied. Drop a text file to add context.</p>}
                {messages.map((m, i) => <div key={i} className={`scribe-idocs-chat__msg scribe-idocs-chat__msg--${m.role}`}>{m.text}</div>)}
                {busy && <div className="scribe-idocs-chat__msg scribe-idocs-chat__msg--assistant scribe-idocs-chat__busy">{busy}</div>}
                {pending && (
                    <div className="scribe-idocs-chat__pending" role="group" aria-label="Pending change">
                        <strong>{pending.label}</strong>
                        {pending.detail && <small>{pending.detail}</small>}
                        <div className="scribe-idocs-chat__pending-actions">
                            <button type="button" className="scribe-idocs-chat__btn scribe-idocs-chat__btn--primary" onClick={() => { onApply(pending.next, pending.label); setPending(null); say('assistant', `Applied: ${pending.label}`); }}>Apply</button>
                            <button type="button" className="scribe-idocs-chat__btn" onClick={() => { setPending(null); say('assistant', 'Discarded.'); }}>Discard</button>
                        </div>
                    </div>
                )}
            </div>
            {attachments.length > 0 && (
                <div className="scribe-idocs-chat__attach">
                    {attachments.map((a) => <span key={a.name} className="scribe-idocs-chat__tag">{a.name} <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((l) => l.filter((x) => x.name !== a.name))}>✕</button></span>)}
                </div>
            )}
            <div className="scribe-idocs-chat__composer">
                <textarea
                    ref={inputRef} rows={2} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onInputKey}
                    placeholder={llmReady ? 'Ask or instruct… (Enter to send, Shift+Enter for a new line)' : 'No LLM configured'} aria-label="Message" disabled={!!busy}
                />
                <button type="button" className="scribe-idocs-chat__btn scribe-idocs-chat__btn--primary" onClick={() => void send(input)} disabled={!!busy || !input.trim() || !llmReady}>Send</button>
            </div>
        </aside>
    );
}
