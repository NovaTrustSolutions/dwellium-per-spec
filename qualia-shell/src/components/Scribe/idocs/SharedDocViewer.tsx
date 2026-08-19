/**
 * SharedDocViewer — wave 3B: what a `view` / `comment` member sees when they
 * open a doc shared with them (no editor chrome). Renderer in scroll mode +
 * live-lite polling/presence via useSharedDocSync; comment role gets the
 * CommentsPanel drawer with new comments routed to `postComment`.
 * Also exports the small live-lite UI bits the editor reuses (banner, chips).
 */
import { useCallback, useContext, useState } from 'react';
import { UserContext } from '../../../context/UserContext';
import CommentsPanel from './CommentsPanel';
import IDocRenderer from './IDocRenderer';
import { postComment, type IdocsApiDeps, type PresenceEntry } from './idocsApi';
import { findCard, flattenCards, setView } from './idocsStore';
import type { IDoc } from './idocTypes';
import { useSharedDocSync, type SharedSync } from './useSharedDocSync';
import './PublishDialog.css';

const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export function PresenceChips({ others }: { others: PresenceEntry[] }) {
    if (!others.length) return null;
    return (
        <span className="scribe-idocs-sync__presence" aria-label={`${others.length} other ${others.length === 1 ? 'person' : 'people'} here`} data-testid="idoc-presence">
            {others.map((o) => <span key={o.userId} className="scribe-idocs-sync__chip" title={o.name} aria-label={o.name}>{initials(o.name)}</span>)}
        </span>
    );
}

export function SyncBanner({ sync }: { sync: SharedSync }) {
    return (
        <>
            {sync.conflict && (
                <div className="scribe-idocs-sync__banner" role="alert" data-testid="idoc-sync-conflict">
                    <span>Newer version from <strong>{sync.conflict.from}</strong> —</span>
                    <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={sync.loadTheirs}>Load theirs</button>
                    <button type="button" className="scribe-idocs__btn" onClick={sync.keepMine} disabled={sync.saving}>Keep mine (overwrites)</button>
                </div>
            )}
            {sync.error && <div className="scribe-idocs-sync__err" role="status">Sync: {sync.error}</div>}
        </>
    );
}

export default function SharedDocViewer({ doc, api }: { doc: IDoc; api?: IdocsApiDeps }) {
    const author = useContext(UserContext)?.user?.name || 'You';
    const [activeCardId, setActiveCardId] = useState<string>(doc.cards[0]?.id ?? '');
    const [comments, setComments] = useState<{ blockId?: string } | null>(null);
    const sync = useSharedDocSync(doc, { api, activeCardId });
    const role = doc.shared?.role ?? 'view';
    const canComment = role === 'comment' || role === 'edit' || role === 'owner';
    const card = findCard(doc.cards, activeCardId) ?? doc.cards[0];
    const postRemote = useCallback(async (cardId: string, blockId: string | undefined, text: string) => {
        await postComment(doc.id, { cardId, blockId, text }, api);
        await sync.refresh(); // pull the server's version (with the new comment)
    }, [doc.id, api, sync]);

    return (
        <div className="scribe-idocs__editor scribe-idocs-ed" data-testid="idoc-shared-viewer">
            <div className="scribe-idocs__topbar">
                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={() => setView('library')} title="Back to library">← Library</button>
                <strong className="scribe-idocs__title-input" style={{ border: 0, background: 'transparent' }}>{doc.title || 'Untitled'}</strong>
                <span className="scribe-idocs-sync__badge" title="Your role on this shared doc">Shared by {doc.shared?.ownerName || 'owner'} · {role}</span>
                <PresenceChips others={sync.others} />
                <span className="scribe-idocs__spacer" />
                {canComment && comments && (
                    <select value={card?.id ?? ''} onChange={(e) => { setActiveCardId(e.target.value); setComments({}); }} aria-label="Card to comment on" className="scribe-idocs-ed__pagesize">
                        {flattenCards(doc.cards).map(({ card: c, depth }) => <option key={c.id} value={c.id}>{'· '.repeat(depth)}{c.title || 'Untitled card'}</option>)}
                    </select>
                )}
                {canComment && (
                    <button type="button" className={`scribe-idocs__btn${comments ? ' is-active' : ''}`} onClick={() => setComments(comments ? null : {})} aria-pressed={!!comments}>Comments</button>
                )}
                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => setView('present')} title="⌘⏎">▶ Present</button>
            </div>
            <SyncBanner sync={sync} />
            <div className={`scribe-idocs__body${comments ? ' scribe-idocs-ed__body--drawer' : ''}`}>
                <div className="scribe-idocs__preview-scroll" style={{ flex: 1, minWidth: 0 }}>
                    <IDocRenderer doc={doc} mode="scroll" />
                </div>
                {comments && card && (
                    <CommentsPanel docId={doc.id} card={card} author={author} blockId={comments.blockId} onScope={(blockId) => setComments({ blockId })} onClose={() => setComments(null)} postRemote={postRemote} />
                )}
            </div>
        </div>
    );
}
