/**
 * Right-edge minimap strip — 64px wide, shows a compressed overview of
 * the active document with heading colors, comment/redline markers,
 * viewport indicator, and click/drag-to-scroll.
 *
 * Ported from Holocron's Minimap.tsx (Cycle 9). Render strategy: div-
 * based colored text runs with scaleY transform when the doc is taller
 * than the strip. Same coordinate system for text, markers, and viewport.
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { useScribeStore } from './scribeStore';

const WIDTH = 64;
const TOP_PAD = 4;
const BASE_LINE_HEIGHT = 4;
const BASE_FONT_SIZE = 3;

interface ColoredRun {
    text: string;
    color: string;
}

function buildRuns(text: string): ColoredRun[] {
    const BODY = 'rgba(255,255,255,0.88)';
    const lines = text.split('\n');
    const runs: ColoredRun[] = [];
    let current: ColoredRun | null = null;

    const push = (line: string, color: string) => {
        if (current && current.color === color) {
            current.text += '\n' + line;
        } else {
            if (current) runs.push(current);
            current = { text: line, color };
        }
    };

    for (const line of lines) {
        const t = line.trimStart();
        let color: string;
        if (t.startsWith('# ')) color = '#D6FE51';
        else if (t.startsWith('## ')) color = 'rgba(214,254,81,0.7)';
        else if (t.startsWith('### ') || t.startsWith('#### ') || t.startsWith('##### ') || t.startsWith('###### ')) color = 'rgba(214,254,81,0.45)';
        else color = BODY;
        push(line, color);
    }
    if (current) runs.push(current);
    return runs;
}

export function Minimap({ getView }: { getView: () => EditorView | null }) {
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const comments = useScribeStore((s) => s.comments);
    const redlines = useScribeStore((s) => s.redlines);

    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 1, clientHeight: 1, totalLines: 1 });
    const [docText, setDocText] = useState('');
    const [containerHeight, setContainerHeight] = useState(0);

    useEffect(() => {
        let raf = 0;
        const tick = () => {
            const view = getView();
            if (view) {
                const sd = view.scrollDOM;
                const next = {
                    scrollTop: sd.scrollTop,
                    scrollHeight: Math.max(sd.scrollHeight, 1),
                    clientHeight: Math.max(sd.clientHeight, 1),
                    totalLines: view.state.doc.lines,
                };
                setScrollState((prev) =>
                    (prev.scrollTop !== next.scrollTop || prev.scrollHeight !== next.scrollHeight ||
                     prev.clientHeight !== next.clientHeight || prev.totalLines !== next.totalLines)
                        ? next : prev
                );
            }
            raf = window.requestAnimationFrame(tick);
        };
        raf = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(raf);
    }, [getView]);

    useEffect(() => {
        let lastLength = -1;
        const tick = () => {
            const view = getView();
            if (!view) return;
            const len = view.state.doc.length;
            if (len !== lastLength) {
                lastLength = len;
                setDocText(view.state.doc.toString());
            }
        };
        tick();
        const interval = window.setInterval(tick, 500);
        return () => window.clearInterval(interval);
    }, [getView]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => setContainerHeight(el.getBoundingClientRect().height);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const runs = useMemo(() => buildRuns(docText), [docText]);

    if (!activeFilepath) return null;

    const fileComments = comments.filter((c) => c.filepath === activeFilepath && c.status === 'open');
    const fileRedlines = redlines.filter((r) => r.filepath === activeFilepath && r.state === 'pending');
    const { scrollTop, scrollHeight, clientHeight, totalLines } = scrollState;

    const naturalHeight = totalLines * BASE_LINE_HEIGHT + TOP_PAD * 2;
    const scale = naturalHeight > containerHeight && containerHeight > 0
        ? containerHeight / naturalHeight
        : 1;
    const effectiveLineHeight = BASE_LINE_HEIGHT * scale;

    const ratioTop = scrollHeight > clientHeight ? scrollTop / scrollHeight : 0;
    const ratioVisible = scrollHeight > clientHeight ? clientHeight / scrollHeight : 1;
    const visibleFirstLine = ratioTop * totalLines;
    const visibleSpanLines = Math.max(1, ratioVisible * totalLines);

    const lineToY = (line: number) => TOP_PAD + (line - 1) * effectiveLineHeight;

    const posToLine = (pos: number): number => {
        const view = getView();
        if (!view) return 1;
        return view.state.doc.lineAt(Math.min(pos, view.state.doc.length)).number;
    };

    const scrubToClientY = (clientY: number, rect: DOMRect) => {
        const view = getView();
        if (!view) return;
        const localY = clientY - rect.top;
        const targetLine = Math.max(1, Math.min(
            totalLines,
            Math.round((localY - TOP_PAD) / Math.max(0.001, effectiveLineHeight)) + 1,
        ));
        const pos = view.state.doc.line(targetLine).from;
        const block = view.lineBlockAt(pos);
        const sd = view.scrollDOM;
        const center = block.top - (sd.clientHeight - block.height) / 2;
        const max = Math.max(0, sd.scrollHeight - sd.clientHeight);
        sd.scrollTop = Math.max(0, Math.min(max, center));
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        scrubToClientY(e.clientY, rect);
        const onMove = (ev: MouseEvent) => scrubToClientY(ev.clientY, rect);
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    return (
        <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            title="Click or drag to scroll"
            className="scribe__minimap"
        >
            <div style={{
                position: 'absolute', top: TOP_PAD, left: 4, right: 0,
                transform: `scaleY(${scale})`, transformOrigin: 'top left',
                pointerEvents: 'none',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: BASE_FONT_SIZE, lineHeight: `${BASE_LINE_HEIGHT}px`,
                whiteSpace: 'pre',
            }}>
                {runs.map((r, i) => (
                    <div key={i} style={{ color: r.color, fontWeight: r.color === '#D6FE51' ? 700 : 400 }}>
                        {r.text}
                    </div>
                ))}
            </div>

            {fileComments.map((c) => {
                const fromLine = posToLine(c.from);
                const toLine = posToLine(c.to);
                const top = lineToY(fromLine);
                const height = Math.max(2, (toLine - fromLine + 1) * effectiveLineHeight);
                return (
                    <div
                        key={c.id}
                        title={c.body || 'Comment'}
                        className="scribe__minimap-marker scribe__minimap-marker--comment"
                        style={{ top, height }}
                    />
                );
            })}

            {fileRedlines.map((r) => {
                const fromLine = posToLine(r.from);
                const toLine = posToLine(r.to);
                const top = lineToY(fromLine);
                const height = Math.max(2, (toLine - fromLine + 1) * effectiveLineHeight);
                return (
                    <div
                        key={r.id}
                        title={r.rationale || 'Redline'}
                        className="scribe__minimap-marker scribe__minimap-marker--redline"
                        style={{ top, height }}
                    />
                );
            })}

            <div
                className="scribe__minimap-viewport"
                style={{
                    top: lineToY(visibleFirstLine + 1),
                    height: Math.max(2, visibleSpanLines * effectiveLineHeight),
                }}
            />
        </div>
    );
}

export const MINIMAP_WIDTH = WIDTH;
