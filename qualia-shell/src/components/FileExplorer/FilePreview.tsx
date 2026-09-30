/**
 * FilePreview — read-only preview pane for the File Explorer (plan 076 P3).
 * Markdown goes through renderSafeMarkdown (the only allowed innerHTML path);
 * everything else is shown as wrapped plain text.
 */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { readFile, ApiError } from './fileExplorerApi';
import { renderSafeMarkdown } from '../../utils/safeMarkdown';

type State =
    | { kind: 'loading' }
    | { kind: 'ready'; content: string }
    | { kind: 'error'; message: string };

const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);

function errorMessage(err: unknown): string {
    if (err instanceof ApiError && err.status === 413) return 'Too large to preview (limit 2 MB)';
    if (err instanceof ApiError && err.status === 415) return "Binary file — preview isn't available yet";
    return err instanceof Error && err.message ? err.message : 'Could not load preview';
}

export function FilePreview({ path, onClose }: { path: string; onClose: () => void }) {
    const [state, setState] = useState<State>({ kind: 'loading' });
    const seq = useRef(0);
    const name = path.split('/').pop() || path;

    useEffect(() => {
        const mine = ++seq.current;
        setState({ kind: 'loading' });
        readFile(path).then(
            (r) => { if (mine === seq.current) setState({ kind: 'ready', content: r.content }); },
            (e) => { if (mine === seq.current) setState({ kind: 'error', message: errorMessage(e) }); },
        );
    }, [path]);

    const muted = { padding: 12, fontSize: 12, color: 'var(--text-secondary)' } as const;
    let body;
    if (state.kind === 'loading') body = <div style={muted}>Loading…</div>;
    else if (state.kind === 'error') body = <div role="alert" style={muted}>{state.message}</div>;
    else if (isMarkdown(path)) {
        body = <div data-testid="preview-markdown" style={{ padding: 12, fontSize: 13, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(state.content) }} />;
    } else {
        body = <pre style={{ margin: 0, padding: 12, fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace' }}>{state.content}</pre>;
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
                <button aria-label="Close preview" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex' }}>
                    <X size={14} />
                </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>{body}</div>
        </div>
    );
}

export default FilePreview;
