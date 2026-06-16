/**
 * TagFile — the central "Tag file" viewer.
 *
 * Surfaces everything tagged across the whole app (any widget that uses
 * <TagInput>). Tag cloud with counts → click a tag to filter → see every item
 * carrying it, with where it came from. Read-only aggregation of tagStore.
 */
import { useState } from 'react';
import { useTaggedItems } from '../Tags/TagInput';
import { tagCounts, itemsForTag } from '../../lib/tagStore';
import './TagFile.css';

const SOURCE_LABEL: Record<string, string> = {
    'task-board': 'Task Board',
    'notepad': 'Notepad',
    'thought-weaver': 'Thought Weaver',
    'transcription': 'Transcribe',
    'docs': 'Docs',
};
function srcLabel(s: string): string { return SOURCE_LABEL[s] ?? s; }

function rel(iso: string): string {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); return `${d}d ago`;
}

export default function TagFile() {
    const items = useTaggedItems();
    const [sel, setSel] = useState<string | null>(null);
    const counts = tagCounts(items);
    const shown = sel
        ? itemsForTag(items, sel)
        : [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return (
        <div className="tf">
            <div className="tf__head">
                <span className="tf__title">Tag File</span>
                <span className="tf__count">{items.length} tagged · {counts.length} tag{counts.length === 1 ? '' : 's'}</span>
                {sel && <button className="tf__clear" onClick={() => setSel(null)}>clear filter</button>}
            </div>

            <div className="tf__cloud">
                {counts.length === 0 && (
                    <span className="tf__empty">Nothing tagged yet. Add a tag in any widget (e.g. a Task Board card's project view) and it shows up here.</span>
                )}
                {counts.map(c => (
                    <button
                        key={c.tag}
                        className={`tf__tag ${sel?.toLowerCase() === c.tag.toLowerCase() ? 'tf__tag--on' : ''}`}
                        onClick={() => setSel(sel?.toLowerCase() === c.tag.toLowerCase() ? null : c.tag)}
                    >
                        #{c.tag}<span className="tf__tag-n">{c.count}</span>
                    </button>
                ))}
            </div>

            <div className="tf__list">
                {shown.length === 0 && items.length > 0 && <span className="tf__empty">No items for #{sel}.</span>}
                {shown.map(it => (
                    <div key={it.id} className="tf__item">
                        <div className="tf__item-row">
                            <span className="tf__src" title="Source widget">{srcLabel(it.source)}</span>
                            <span className="tf__item-title">{it.title}</span>
                            <span className="tf__when">{rel(it.updatedAt)}</span>
                        </div>
                        <div className="tf__item-tags">
                            {it.tags.map(t => (
                                <button key={t} className="tf__chip" onClick={() => setSel(t)}>#{t}</button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
