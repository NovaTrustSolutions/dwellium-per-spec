/**
 * FileTree — renders Scribe's files as a collapsible subpage/folder hierarchy
 * (suitenumerique/docs parity). Derives the tree from filepaths via the tested
 * `docTree` helpers; folders expand/collapse, files open on click.
 */
import { useState, useMemo } from 'react';
import { FileText, Folder, FolderOpen } from 'lucide-react';
import { buildDocTree, flattenTree, uniqueMdPath } from './docTree';
import { DWELLIUM_WIDGET_MIME, type DwelliumWidgetPayload } from './dropHandler';
import { useScribeStore } from './scribeStore';

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

    // Notepad note dropped on the tree → new doc "<title || 'Note'>.md" with the
    // note's content (deduped with a numeric suffix), then opened. Copy semantics.
    const onNotepadDrop = (e: React.DragEvent) => {
        const raw = e.dataTransfer.getData(DWELLIUM_WIDGET_MIME);
        if (!raw) return;
        try {
            const payload = JSON.parse(raw) as DwelliumWidgetPayload;
            if (payload.widgetType !== 'notepad' || typeof payload.content !== 'string') return;
            e.preventDefault();
            e.stopPropagation();
            const path = uniqueMdPath(payload.title || 'Note', files.map(f => f.filepath));
            void useScribeStore.getState().createFile(path, payload.content); // creates AND opens
        } catch { /* malformed payload — ignore */ }
    };

    return (
        <div
            className="scribe__file-tree"
            data-dwellium-drop-zone="scribe-file-tree"
            onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DWELLIUM_WIDGET_MIME)) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                }
            }}
            onDrop={onNotepadDrop}
        >
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
                        {node.isFile ? <FileText size={14} /> : expanded.has(node.path) ? <FolderOpen size={14} /> : <Folder size={14} />}{node.name}
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
