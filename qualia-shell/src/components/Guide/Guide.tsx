/**
 * Guide — plan 047 §6 lightweight getting-started reader. react-markdown +
 * remark-gfm (both already installed; Scribe's MarkdownPreview sister) over
 * the bundled `content/guides/gettingStarted.ts` string. No fetch, no state.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GETTING_STARTED_MD } from '../../content/guides/gettingStarted';
import './Guide.css';

export default function Guide() {
    return (
        <article className="guide" aria-label="Getting started guide">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{GETTING_STARTED_MD}</ReactMarkdown>
        </article>
    );
}
