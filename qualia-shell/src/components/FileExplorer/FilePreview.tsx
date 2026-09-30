/**
 * FilePreview — read-only preview pane for the File Explorer (plan 076 P3).
 * Markdown goes through renderSafeMarkdown (the only allowed innerHTML path);
 * everything else is shown as wrapped plain text.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { readFile, fetchBytes, ApiError } from './fileExplorerApi';
import { renderSafeMarkdown } from '../../utils/safeMarkdown';
import { MUTED_TEXT, HIT } from './fileExplorerTheme';

type State =
    | { kind: 'loading' }
    | { kind: 'ready'; content: string; path: string }
    | { kind: 'image'; url: string }
    | { kind: 'error'; message: string };

const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);
const isImage = (path: string) => /\.(png|jpe?g|gif|webp)$/i.test(path);
const MD_IMG = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Resolve a relative image ref against the markdown file's folder; null if it escapes the user root. */
function resolveRelative(mdPath: string, src: string): string | null {
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/')) return null;
    const out = mdPath.split('/').slice(0, -1);
    for (const seg of src.split(/[?#]/)[0].split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { if (!out.length) return null; out.pop(); } else out.push(seg);
    }
    return out.length ? out.join('/') : null;
}

/** Replace `![alt](src)` text (renderSafeMarkdown leaves it as text) with real <img> nodes; returns [img, path] pairs to load. */
function inflateImages(root: HTMLElement, mdPath: string): Array<[HTMLImageElement, string]> {
    const pending: Array<[HTMLImageElement, string]> = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!(n.parentElement?.closest('pre, code')) && n.nodeValue && n.nodeValue.includes('![')) nodes.push(n as Text);
    }
    for (const node of nodes) {
        const frag = document.createDocumentFragment();
        let last = 0;
        const text = node.nodeValue ?? '';
        for (const m of text.matchAll(MD_IMG)) {
            frag.append(text.slice(last, m.index));
            last = (m.index ?? 0) + m[0].length;
            if (/^https?:\/\//i.test(m[2])) {
                // Never auto-load a remote image: opening a file must not ping whatever server it
                // names (tracking pixels). Show a link the user can choose to follow instead.
                const a = document.createElement('a');
                a.href = m[2];
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = `Remote image: ${m[1] || m[2]}`;
                frag.append(a);
            } else {
                const img = document.createElement('img');
                img.alt = m[1];
                img.style.maxWidth = '100%';
                const rel = resolveRelative(mdPath, m[2]);
                if (rel) pending.push([img, rel]);
                frag.append(img);
            }
        }
        frag.append(text.slice(last));
        node.replaceWith(frag);
    }
    return pending;
}

function errorMessage(err: unknown): string {
    if (err instanceof ApiError && err.status === 413) return 'Too large to preview (limit 2 MB)';
    if (err instanceof ApiError && err.status === 415) return "Binary file — preview isn't available yet";
    return err instanceof Error && err.message ? err.message : 'Could not load preview';
}

export function FilePreview({ path, onClose }: { path: string; onClose: () => void }) {
    const [state, setState] = useState<State>({ kind: 'loading' });
    const name = path.split('/').pop() || path;

    const html = useMemo(() => (state.kind === 'ready' && state.path === path && isMarkdown(path) ? renderSafeMarkdown(state.content) : ''), [state, path]);
    const mdRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let live = true;
        const urls: string[] = [];
        const fresh = () => live;
        const mint = (b: Blob) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
        setState({ kind: 'loading' });
        const fail = (e: unknown) => { if (fresh()) setState({ kind: 'error', message: errorMessage(e) }); };
        if (isImage(path)) {
            fetchBytes(path).then((b) => { if (fresh()) setState({ kind: 'image', url: mint(b) }); }, fail);
        } else {
            readFile(path).then((r) => { if (fresh()) setState({ kind: 'ready', content: r.content, path }); }, fail);
        }
        return () => { live = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
    }, [path]);

    useEffect(() => {
        const root = mdRef.current;
        if (!root || !html) return;
        const urls: string[] = [];
        let live = true;
        for (const [img, rel] of inflateImages(root, path)) {
            fetchBytes(rel).then((b) => {
                if (!live) return;
                const u = URL.createObjectURL(b);
                urls.push(u);
                img.src = u;
            }, () => { /* leave alt-only */ });
        }
        return () => { live = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
    }, [html, path]);

    const muted = { padding: 12, fontSize: 12, color: MUTED_TEXT } as const;
    let body;
    if (state.kind === 'loading') body = <div style={muted}>Loading…</div>;
    else if (state.kind === 'error') body = <div role="alert" style={muted}>{state.message}</div>;
    else if (state.kind === 'image') {
        body = <div style={{ padding: 12 }}><img src={state.url} alt={name} style={{ maxWidth: '100%', height: 'auto' }} /></div>;
    } else if (isMarkdown(path)) {
        body = <div ref={mdRef} data-testid="preview-markdown" style={{ padding: 12, fontSize: 13, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: html }} />;
    } else {
        body = <pre style={{ margin: 0, padding: 12, fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace' }}>{state.kind === 'ready' ? state.content : ''}</pre>;
    }

    return (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Esc closes from anywhere inside the region
        <div
            role="region"
            aria-label={`Preview of ${name}`}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
            style={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '50%', background: 'var(--bg-desktop)', borderTop: '1px solid var(--border-subtle)' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <span title={path} style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <button aria-label="Close preview" onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED_TEXT, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: HIT, minHeight: HIT }}>
                    <X size={14} />
                </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>{body}</div>
        </div>
    );
}

export default FilePreview;
