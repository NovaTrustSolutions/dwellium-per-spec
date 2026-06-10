/**
 * FileTree — renders Scribe's files as a collapsible subpage/folder hierarchy
 * (suitenumerique/docs parity). Derives the tree from filepaths via the tested
 * `docTree` helpers; folders expand/collapse, files open on click.
 */
import { useState, useMemo } from 'react';
import { buildDocTree, flattenTree } from './docTree';

export function FileTree({ files, onOpen, activePath }: {
    files: Array<{ filepath: string }>;
    onOpen: (path: string) => void;
    /** Currently-open file — highlighted in the tree (3-pane Explorer column). */
    activePath?: string;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const tree = useMemo(() => buildDocTree(files.map(f => f.filepath)), [files]);
    const rows = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

    const toggle = (path: string) =>
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            return next;
        });

    return (
        <div className="scribe__file-tree">
            {rows.map(({ node, depth }) => {
                const ext = node.isFile ? (node.name.split('.').pop() || '').toLowerCase() : '';
                return (
                <button
                    key={node.path}
                    className={`scribe__file-item ${node.isFile ? '' : 'scribe__file-item--folder'} ${node.isFile && node.path === activePath ? 'scribe__file-item--active' : ''}`}
                    style={{ paddingLeft: 8 + depth * 14 }}
                    title={node.path}
                    aria-label={node.isFile ? `Open ${node.path}` : `Toggle folder ${node.name}`}
                    onClick={() => (node.isFile ? onOpen(node.path) : toggle(node.path))}
                >
                    <span className="scribe__file-name">
                        {node.isFile ? '📄 ' : expanded.has(node.path) ? '📂 ' : '📁 '}{node.name}
                    </span>
                    {node.isFile && ext && (
                        <span className={`scribe__file-badge scribe__file-badge--${ext}`}>{ext}</span>
                    )}
                </button>
                );
            })}
        </div>
    );
}
