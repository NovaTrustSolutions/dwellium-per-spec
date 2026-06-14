/**
 * MarkdownPreview — live MacDown-style preview pane (2026-06-14). GitHub-
 * Flavored Markdown via react-markdown + remark-gfm: tables, strikethrough,
 * task-list checkboxes, autolinks, fenced code blocks. Mounted beside the
 * CodeMirror editor with scroll-sync. After each render, enhancePreview adds
 * Prism syntax highlighting, KaTeX math, and Mermaid diagrams (CDN lazy-loaded,
 * fail-safe).
 */
import { forwardRef, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { enhancePreview } from './previewEnhance';
import './MarkdownPreview.css';

interface Props { text: string; }

const MarkdownPreview = forwardRef<HTMLDivElement, Props>(({ text }, ref) => {
    const mdRef = useRef<HTMLDivElement>(null);
    // Re-run highlight/math/diagram passes when the rendered content changes.
    useEffect(() => {
        const id = setTimeout(() => enhancePreview(mdRef.current), 120);
        return () => clearTimeout(id);
    }, [text]);
    return (
        <div className="scribe-preview" ref={ref}>
            <div className="scribe-preview__md" ref={mdRef}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || '*Nothing to preview yet — start typing.*'}</ReactMarkdown>
            </div>
        </div>
    );
});
MarkdownPreview.displayName = 'MarkdownPreview';
export default MarkdownPreview;
