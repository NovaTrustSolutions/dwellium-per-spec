/**
 * Guide — plan 047 §6 lightweight getting-started reader. react-markdown +
 * remark-gfm (both already installed; Scribe's MarkdownPreview sister) over
 * the bundled `content/guides/gettingStarted.ts` string. No fetch.
 *
 * Plan 055 phase 2: the scroll position is remembered per user via
 * widgetMemory (no hook subscription — a scroll patch must not re-render
 * the article), restored on mount, flushed on unmount.
 */
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GETTING_STARTED_MD } from '../../content/guides/gettingStarted';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { flushWidgetMemory, patchWidgetMemory, readWidgetMemory } from '../../lib/widgetMemory';
import './Guide.css';

export default function Guide() {
    usePerUserIdentity();
    const ref = useRef<HTMLElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.scrollTop = readWidgetMemory('guide', { scrollTop: 0 }).scrollTop;
        return flushWidgetMemory;
    }, []);
    return (
        <article
            className="guide"
            aria-label="Getting started guide"
            ref={ref}
            onScroll={e => patchWidgetMemory('guide', { scrollTop: (e.target as HTMLElement).scrollTop })}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{GETTING_STARTED_MD}</ReactMarkdown>
        </article>
    );
}
