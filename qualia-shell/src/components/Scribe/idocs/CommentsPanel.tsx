/**
 * CommentsPanel — wave-2 right drawer in the IDoc editor. Threads live on
 * `card.comments` (per card; `blockId` scopes a thread to one block). Add /
 * reply / resolve / delete-own go straight to the store. Comments never render
 * in Present or exports (renderer + exporters ignore `card.comments`).
 */
import { useState } from 'react';
import { relativeTime } from './idocsHistory';
import { addComment, deleteComment, replyToComment, updateComment } from './idocsStore';
import type { Block, BlockComment, Card } from './idocTypes';

export interface CommentsPanelProps {
    docId: string;
    card: Card;
    /** Current user's display name (author of new comments/replies). */
    author: string;
    /** When set, the composer + list are scoped to this block. */
    blockId?: string;
    onScope: (blockId: string | undefined) => void;
    onClose: () => void;
    /**
     * Wave 3B — comment-role member of a shared doc: new comments go to the
     * server (`postComment`) instead of the local store; reply/resolve/delete
     * are hidden (the contract has no route for them — documented limitation).
     */
    postRemote?: (cardId: string, blockId: string | undefined, text: string) => Promise<void>;
}

const blockLabel = (b: Block): string => `${b.type}${'text' in b && b.text ? ` · ${b.text.slice(0, 24)}` : 'md' in b && b.md ? ` · ${b.md.slice(0, 24)}` : ''}`;

function Thread({ c, docId, cardId, author, blockName, readOnly }: { c: BlockComment; docId: string; cardId: string; author: string; blockName?: string; readOnly?: boolean }) {
    const [reply, setReply] = useState<string | null>(null);
    return (
        <li className={`scribe-idocs-ed__thread${c.resolved ? ' is-resolved' : ''}`} data-testid={`idoc-comment-${c.id}`}>
            <div className="scribe-idocs-ed__thread-head">
                <strong>{c.author}</strong><small>{relativeTime(Date.parse(c.at) || Date.now())}</small>
                {blockName && <small className="scribe-idocs-ed__thread-scope">on {blockName}</small>}
            </div>
            <p>{c.text}</p>
            {(c.replies ?? []).map((r) => (
                <div key={r.id} className="scribe-idocs-ed__reply"><strong>{r.author}</strong> <small>{relativeTime(Date.parse(r.at) || Date.now())}</small><p>{r.text}</p></div>
            ))}
            {!readOnly && <div className="scribe-idocs-ed__thread-actions">
                <button type="button" onClick={() => updateComment(docId, cardId, c.id, { resolved: !c.resolved })} aria-pressed={!!c.resolved}>{c.resolved ? 'Unresolve' : 'Resolve'}</button>
                <button type="button" onClick={() => setReply(reply === null ? '' : null)}>Reply</button>
                {c.author === author && <button type="button" onClick={() => deleteComment(docId, cardId, c.id)} aria-label="Delete comment">Delete</button>}
            </div>}
            {reply !== null && (
                <form className="scribe-idocs-ed__reply-form" onSubmit={(e) => { e.preventDefault(); if (!reply.trim()) return; replyToComment(docId, cardId, c.id, { author, text: reply.trim() }); setReply(null); }}>
                    <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" aria-label="Reply text" />
                    <button type="submit" className="scribe-idocs__btn scribe-idocs__btn--primary" disabled={!reply.trim()}>Send</button>
                </form>
            )}
        </li>
    );
}

export default function CommentsPanel({ docId, card, author, blockId, onScope, onClose, postRemote }: CommentsPanelProps) {
    const [text, setText] = useState('');
    const [showResolved, setShowResolved] = useState(false);
    const [posting, setPosting] = useState(false);
    const [postError, setPostError] = useState<string | null>(null);
    const all = card.comments ?? [];
    const scoped = blockId ? all.filter((c) => c.blockId === blockId) : all;
    const visible = scoped.filter((c) => showResolved || !c.resolved);
    const resolvedN = scoped.filter((c) => c.resolved).length;
    const blockOf = (id?: string) => (id ? card.blocks.find((b) => b.id === id) : undefined);
    const submit = () => {
        const t = text.trim(); if (!t || posting) return;
        if (postRemote) {
            setPosting(true); setPostError(null);
            postRemote(card.id, blockId, t).then(() => setText('')).catch((e: Error) => setPostError(`Couldn't post: ${e.message}`)).finally(() => setPosting(false));
            return;
        }
        addComment(docId, card.id, { author, text: t, blockId });
        setText('');
    };
    return (
        <aside className="scribe-idocs-ed__drawer scribe-idocs-ed__comments" aria-label="Comments" data-testid="idoc-comments">
            <div className="scribe-idocs-ed__drawer-head">
                <strong>Comments</strong>
                <label className="scribe-idocs-ed__check"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved{resolvedN ? ` (${resolvedN})` : ''}</label>
                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={onClose} aria-label="Close comments">✕</button>
            </div>
            <label className="scribe-idocs__field"><span>Scope</span>
                <select value={blockId ?? ''} onChange={(e) => onScope(e.target.value || undefined)} aria-label="Comment scope">
                    <option value="">Whole card{card.title ? ` — ${card.title}` : ''}</option>
                    {card.blocks.map((b) => <option key={b.id} value={b.id}>{blockLabel(b)}</option>)}
                </select>
            </label>
            <form className="scribe-idocs-ed__composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={blockId ? 'Comment on this block…' : 'Comment on this card…'} aria-label="New comment"
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }} />
                <button type="submit" className="scribe-idocs__btn scribe-idocs__btn--primary" disabled={!text.trim() || posting}>{posting ? 'Posting…' : 'Comment'}</button>
            </form>
            {postError && <p className="scribe-idocs__warn" role="alert">{postError}</p>}
            {visible.length === 0 && <small className="scribe-idocs__hint">{scoped.length ? 'All resolved.' : 'No comments yet.'}</small>}
            <ul className="scribe-idocs-ed__threads">
                {visible.map((c) => { const b = blockOf(c.blockId); return <Thread key={c.id} c={c} docId={docId} cardId={card.id} author={author} blockName={!blockId && b ? blockLabel(b) : undefined} readOnly={!!postRemote} />; })}
            </ul>
        </aside>
    );
}
