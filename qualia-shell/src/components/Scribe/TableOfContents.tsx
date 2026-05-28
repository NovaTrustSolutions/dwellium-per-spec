/**
 * Table of Contents sidebar — parses markdown headings from the active
 * document and renders a clickable hierarchical list. Click → editor
 * scrolls to that heading.
 *
 * Ported from Holocron's TableOfContents.tsx (Cycle 8). Adapted: inline
 * sidebar instead of floating overlay, regex-based heading parse
 * instead of lezer tree walk (simpler, handles partial parses).
 */
import { useEffect, useState, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import { useScribeStore } from './scribeStore';

interface Heading {
    level: number;
    text: string;
    pos: number;
}

function parseHeadings(doc: string): Heading[] {
    const headings: Heading[] = [];
    const lines = doc.split('\n');
    let offset = 0;
    let inFence = false;
    for (const line of lines) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('```')) inFence = !inFence;
        if (!inFence) {
            const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(trimmed);
            if (m) headings.push({ level: m[1].length, text: m[2], pos: offset });
        }
        offset += line.length + 1;
    }
    return headings;
}

export function TableOfContents({ getView }: { getView: () => EditorView | null }) {
    const tocVisible = useScribeStore((s) => s.tocVisible);
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const openFiles = useScribeStore((s) => s.openFiles);
    const [headings, setHeadings] = useState<Heading[]>([]);

    const activeContent = openFiles.find((f) => f.filepath === activeFilepath)?.content ?? '';

    useEffect(() => {
        setHeadings(parseHeadings(activeContent));
    }, [activeContent]);

    const jumpTo = useCallback((h: Heading) => {
        const view = getView();
        if (!view) return;
        const pos = Math.min(h.pos, view.state.doc.length);
        view.dispatch({
            effects: EditorView.scrollIntoView(pos, { y: 'start' }),
            selection: { anchor: pos },
        });
        requestAnimationFrame(() => view.focus());
    }, [getView]);

    if (!tocVisible || headings.length === 0) return null;

    return (
        <div className="scribe__toc">
            <div className="scribe__toc-header">Contents</div>
            {headings.map((h, i) => (
                <button
                    key={i}
                    className="scribe__toc-item"
                    style={{ paddingLeft: 12 + (h.level - 1) * 16 }}
                    onClick={() => jumpTo(h)}
                    title={h.text}
                >
                    {h.text}
                </button>
            ))}
        </div>
    );
}
