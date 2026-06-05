/**
 * TagInput — drop-in tagging control for ANY widget.
 *
 * Usage (one line in any widget):
 *   <TagInput source="notepad" sourceId={note.id} title={note.title} />
 *
 * It reads/writes the central per-user Tag file (tagStore), so anything tagged
 * anywhere shows up in the Tag File viewer. Sets the per-user holder from
 * UserContext during render, matching the app's store-binding convention.
 */
import { useContext, useState, useSyncExternalStore } from 'react';
import { UserContext } from '../../context/UserContext';
import {
    tagStore, tagStoreUserIdHolder, tagsForItem, addTagToItem, removeTagFromItem,
    type TaggedItem,
} from '../../lib/tagStore';
import './Tags.css';

/** Subscribe to the whole Tag file (per-user). */
export function useTaggedItems(): TaggedItem[] {
    const userCtx = useContext(UserContext);
    tagStoreUserIdHolder.current = userCtx?.user?.id ?? null;
    return useSyncExternalStore(tagStore.subscribe, tagStore.getSnapshot, tagStore.getServerSnapshot);
}

export function TagInput({ source, sourceId, title, url }: {
    source: string; sourceId: string; title: string; url?: string;
}) {
    const items = useTaggedItems();
    const tags = tagsForItem(items, source, sourceId);
    const [val, setVal] = useState('');
    const meta = { source, sourceId, title, url };

    const add = () => {
        const v = val.trim();
        if (!v) return;
        addTagToItem(meta, v);
        setVal('');
    };

    return (
        <div className="tagin">
            {tags.map(t => (
                <span key={t} className="tagin__chip">
                    #{t}
                    <button className="tagin__x" aria-label={`Remove tag ${t}`} onClick={() => removeTagFromItem(source, sourceId, t)}>×</button>
                </span>
            ))}
            <input
                className="tagin__input"
                value={val}
                placeholder="+ tag"
                aria-label="Add a tag"
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); add(); }
                    if (e.key === ',') { e.preventDefault(); add(); }
                }}
                onBlur={add}
            />
        </div>
    );
}
