/**
 * WindowTagButton — a universal "tag this" affordance in every window's title
 * bar. Because it lives in the window chrome, EVERY app gets tagging for free
 * (the spec's "tagging across all apps"): tags written here flow into the same
 * central per-user Tag file as item-level tags, so anything tagged anywhere is
 * organized + cross-referenced in one place and links into a project when a
 * tag names one.
 *
 * Content widgets (Notepad, Task Board, Scribe, Wiki, Synthesis, Foundry, …)
 * additionally expose item-level <TagInput> for tagging specific things; this
 * is the catch-all so no app is left without a tag affordance.
 */
import { useEffect, useRef, useState } from 'react';
import { Tag } from 'lucide-react';
import { TagInput } from '../Tags/TagInput';

export default function WindowTagButton({ source, sourceId, title }: { source: string; sourceId: string; title: string }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="window__tag" ref={ref} onMouseDown={(e) => e.stopPropagation()}>
            <button
                className={`window__tag-btn ${open ? 'is-open' : ''}`}
                title="Tag this — links it into a project / associations"
                aria-label="Tag this view"
                aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            >
                <Tag size={12} aria-hidden="true" />
            </button>
            {open && (
                <div className="window__tag-pop" role="dialog" aria-label={`Tags for ${title}`}>
                    <TagInput source={source} sourceId={sourceId} title={title} />
                </div>
            )}
        </div>
    );
}
