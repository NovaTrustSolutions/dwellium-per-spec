/**
 * SlashPalette — "/" block palette for Interactive Docs. Typing `/` at the
 * start of a line inside any markdown textarea (text/callout/quote/columns/
 * accordion/tabs items) opens a filterable list of block types; Enter inserts
 * a block of that type AFTER the current block and strips the `/query`; Esc
 * closes; ↑/↓ navigate. Focus stays in the textarea — the palette listens to
 * its keydown in the capture phase.
 *
 * Pure helpers (`detectSlash`, `filterSlashBlocks`, `stripSlash`) are exported
 * for unit tests; the editor decides *where* to mount the palette.
 */
import { useEffect, useState } from 'react';
import { BLOCK_TYPES, type BlockType } from './idocTypes';

export interface SlashBlock { type: BlockType; label: string; keywords: string[] }

const META: Record<BlockType, { label: string; keywords: string[] }> = {
    heading: { label: 'Heading', keywords: ['h1', 'h2', 'h3', 'title'] },
    text: { label: 'Text', keywords: ['paragraph', 'markdown', 'md', 'p'] },
    callout: { label: 'Callout', keywords: ['note', 'info', 'warning', 'tip'] },
    quote: { label: 'Quote', keywords: ['blockquote', 'citation'] },
    image: { label: 'Image', keywords: ['img', 'picture', 'photo'] },
    gallery: { label: 'Gallery', keywords: ['images', 'grid', 'photos'] },
    embed: { label: 'Embed', keywords: ['iframe', 'video', 'youtube', 'url'] },
    chart: { label: 'Chart', keywords: ['bar', 'line', 'pie', 'graph', 'data'] },
    table: { label: 'Table', keywords: ['grid', 'rows', 'columns'] },
    accordion: { label: 'Accordion', keywords: ['collapse', 'details', 'faq'] },
    tabs: { label: 'Tabs', keywords: ['tabbed', 'switch'] },
    columns: { label: 'Columns', keywords: ['cols', 'split', 'side by side'] },
    button: { label: 'Button', keywords: ['cta', 'link', 'action'] },
    code: { label: 'Code', keywords: ['pre', 'snippet', 'fence'] },
    divider: { label: 'Divider', keywords: ['hr', 'rule', 'separator', 'line'] },
    timeline: { label: 'Timeline', keywords: ['history', 'dates', 'milestones'] },
    quiz: { label: 'Quiz', keywords: ['question', 'poll', 'test'] },
    toc: { label: 'Table of contents', keywords: ['toc', 'outline', 'contents'] },
    steps: { label: 'Steps', keywords: ['process', 'numbered', 'howto'] },
    funnel: { label: 'Funnel', keywords: ['pipeline', 'stages', 'conversion'] },
    boxes: { label: 'Boxes', keywords: ['cards', 'grid', 'features'] },
    math: { label: 'Math', keywords: ['latex', 'equation', 'formula'] },
    diagram: { label: 'Diagram', keywords: ['mermaid', 'flowchart', 'graph'] },
    qr: { label: 'QR code', keywords: ['qrcode', 'scan', 'link'] },
};

export const SLASH_BLOCKS: readonly SlashBlock[] = BLOCK_TYPES.map((type) => ({ type, ...META[type] }));

/** Same ranking as ../slashCommands.filterSlashCommands: label-prefix > keyword-prefix > substring. */
export function filterSlashBlocks(query: string): SlashBlock[] {
    const q = query.trim().toLowerCase();
    if (!q) return [...SLASH_BLOCKS];
    return SLASH_BLOCKS
        .map((b, i) => {
            const label = b.label.toLowerCase();
            const score = label.startsWith(q) || b.type.startsWith(q) ? 3
                : b.keywords.some((k) => k.startsWith(q)) ? 2
                    : label.includes(q) || b.keywords.some((k) => k.includes(q)) ? 1 : -1;
            return { b, i, score };
        })
        .filter((x) => x.score >= 0)
        .sort((a, b) => (b.score - a.score) || (a.i - b.i))
        .map((x) => x.b);
}

/** If the caret's line (up to the caret) is `/query`, return it; else null. */
export function detectSlash(value: string, caret: number): { query: string; lineStart: number } | null {
    const before = value.slice(0, caret);
    const lineStart = before.lastIndexOf('\n') + 1;
    const m = /^\/([\w-]*)$/.exec(before.slice(lineStart));
    return m ? { query: m[1], lineStart } : null;
}

/** Remove `/query` from the caret's line; returns the new value + caret. */
export function stripSlash(value: string, caret: number): { value: string; caret: number } {
    const hit = detectSlash(value, caret);
    if (!hit) return { value, caret };
    const before = value.slice(0, hit.lineStart);
    let after = value.slice(caret);
    if (after.startsWith('\n')) after = after.slice(1); // don't leave an empty line behind
    else if (before.endsWith('\n') && !after) { return { value: before.slice(0, -1), caret: before.length - 1 }; }
    return { value: before + after, caret: before.length };
}

interface Props {
    /** The textarea the user is typing in (focus stays there). */
    textarea: HTMLTextAreaElement;
    query: string;
    onPick: (type: BlockType) => void;
    onClose: () => void;
}

export default function SlashPalette({ textarea, query, onPick, onClose }: Props) {
    const items = filterSlashBlocks(query);
    const [active, setActive] = useState(0);
    const idx = Math.min(active, Math.max(0, items.length - 1));

    useEffect(() => { setActive(0); }, [query]);

    useEffect(() => {
        // Window capture (not the textarea itself) so we run BEFORE Desktop's window-level Esc/shortcut handlers.
        const onKey = (e: KeyboardEvent) => {
            if (e.target !== textarea) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' || e.key === 'Tab') { if (items[idx]) { e.preventDefault(); e.stopPropagation(); onPick(items[idx].type); } }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
        };
        const onBlur = () => onClose();
        window.addEventListener('keydown', onKey, { capture: true });
        textarea.addEventListener('blur', onBlur);
        return () => { window.removeEventListener('keydown', onKey, { capture: true }); textarea.removeEventListener('blur', onBlur); };
    }, [textarea, items, idx, onPick, onClose]);

    return (
        <div className="scribe-idocs-ed__slash" role="listbox" aria-label="Insert block" data-testid="idoc-slash"
            style={{ top: textarea.offsetTop + textarea.offsetHeight, left: textarea.offsetLeft }}>
            {items.length === 0 && <div className="scribe-idocs-ed__slash-empty">No block matches “/{query}”</div>}
            {items.map((b, i) => (
                <button key={b.type} type="button" role="option" aria-selected={i === idx}
                    className={`scribe-idocs-ed__slash-item${i === idx ? ' is-active' : ''}`}
                    onMouseDown={(e) => e.preventDefault() /* keep textarea focus */}
                    onClick={() => onPick(b.type)} onMouseEnter={() => setActive(i)}>
                    <span>{b.label}</span><small>{b.type}</small>
                </button>
            ))}
        </div>
    );
}
