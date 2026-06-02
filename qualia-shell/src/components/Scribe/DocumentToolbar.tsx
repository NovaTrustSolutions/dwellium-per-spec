/**
 * Persistent per-document toolbar — sits below TabBar and above the
 * editor. Hosts: ☰ Contents toggle, 🕒 Version, 🗑 Delete.
 *
 * Ported from Holocron's DocumentToolbar.tsx (Cycle 8). Adapted:
 * version logic uses scribeStore.createVersion instead of Electron IPC,
 * delete uses scribeStore.deleteFile. Styling matches Dwellium fey dark.
 */
import { useState } from 'react';
import { useScribeStore } from './scribeStore';
import { getActiveEditorView } from './markdownConfig';
import { markdownToPdfBytes, downloadPdf } from './pdfExport';
import { SLASH_COMMANDS, commandSnippet } from './slashCommands';

export function DocumentToolbar() {
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const tocVisible = useScribeStore((s) => s.tocVisible);
    const setTocVisible = useScribeStore((s) => s.setTocVisible);
    const minimapVisible = useScribeStore((s) => s.minimapVisible);
    const setMinimapVisible = useScribeStore((s) => s.setMinimapVisible);
    const createVersion = useScribeStore((s) => s.createVersion);
    const deleteFile = useScribeStore((s) => s.deleteFile);
    const closeFile = useScribeStore((s) => s.closeFile);

    const [versioning, setVersioning] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState('');
    const [exporting, setExporting] = useState(false);
    const [insertOpen, setInsertOpen] = useState(false);
    const openFiles = useScribeStore((s) => s.openFiles);

    if (!activeFilepath) return null;

    const handleVersion = async () => {
        if (versioning) return;
        setVersioning(true);
        try {
            const newPath = await createVersion(activeFilepath);
            if (newPath) {
                const name = newPath.split('/').pop() ?? newPath;
                setToast(`✓ Saved as ${name}`);
                setTimeout(() => setToast(''), 2500);
            }
        } finally {
            setVersioning(false);
        }
    };

    const handleDelete = async () => {
        if (deleting) return;
        const name = activeFilepath.split('/').pop() ?? activeFilepath;
        if (!confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;
        setDeleting(true);
        try {
            closeFile(activeFilepath);
            await deleteFile(activeFilepath);
        } finally {
            setDeleting(false);
        }
    };

    const handleExportPdf = async () => {
        if (exporting || !activeFilepath) return;
        setExporting(true);
        try {
            const content = openFiles.find((f) => f.filepath === activeFilepath)?.content ?? '';
            const base = (activeFilepath.split('/').pop() ?? 'document').replace(/\.md$/i, '');
            const bytes = await markdownToPdfBytes(base, content);
            downloadPdf(base, bytes);
            setToast('✓ Exported PDF');
            setTimeout(() => setToast(''), 2500);
        } finally {
            setExporting(false);
        }
    };

    // Insert a Markdown block at the cursor — the slash-command palette surfaced
    // as a toolbar menu (same command registry the "/" trigger will use).
    const handleInsertBlock = (id: string) => {
        const snip = commandSnippet(id);
        const view = getActiveEditorView();
        setInsertOpen(false);
        if (!snip || !view) return;
        const pos = view.state.selection.main.head;
        view.dispatch({
            changes: { from: pos, insert: snip.text },
            selection: { anchor: pos + snip.cursor },
        });
        view.focus();
    };

    return (
        <div className="scribe__toolbar">
            <ToolbarBtn
                label="☰ Contents"
                title={tocVisible ? 'Hide table of contents' : 'Show table of contents'}
                active={tocVisible}
                onClick={() => setTocVisible(!tocVisible)}
            />
            <ToolbarBtn
                label="🗺 Minimap"
                title={minimapVisible ? 'Hide minimap' : 'Show minimap'}
                active={minimapVisible}
                onClick={() => setMinimapVisible(!minimapVisible)}
            />
            <ToolbarBtn
                label={versioning ? '...' : '🕒 Version'}
                title="Save a snapshot of current content"
                disabled={versioning}
                onClick={() => void handleVersion()}
            />
            <div style={{ position: 'relative' }}>
                <ToolbarBtn
                    label="＋ Insert"
                    title="Insert a block: heading, list, table, quote, code, divider…"
                    active={insertOpen}
                    onClick={() => setInsertOpen((v) => !v)}
                />
                {insertOpen && (
                    <div
                        role="menu"
                        aria-label="Insert block"
                        style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 60, marginTop: 4,
                            background: '#111', border: '1px solid #333', borderRadius: 8,
                            boxShadow: '0 6px 20px rgba(0,0,0,0.5)', padding: 4, minWidth: 190,
                            maxHeight: 320, overflowY: 'auto',
                        }}
                    >
                        {SLASH_COMMANDS.map((c) => (
                            <button
                                key={c.id}
                                role="menuitem"
                                onClick={() => handleInsertBlock(c.id)}
                                title={c.description}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    background: 'transparent', border: 'none', color: '#ddd',
                                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                                    fontSize: 12, fontFamily: 'inherit',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <ToolbarBtn
                label={exporting ? '...' : '⬇ PDF'}
                title="Export this document as a PDF"
                disabled={exporting}
                onClick={() => void handleExportPdf()}
            />
            {toast && <span className="scribe__toolbar-toast">{toast}</span>}
            <span style={{ flex: 1 }} />
            <ToolbarBtn
                label={deleting ? '...' : '🗑 Delete'}
                title="Delete this file"
                danger
                disabled={deleting}
                onClick={() => void handleDelete()}
            />
        </div>
    );
}

function ToolbarBtn({ label, title, onClick, disabled, active, danger }: {
    label: string; title: string; onClick: () => void;
    disabled?: boolean; active?: boolean; danger?: boolean;
}) {
    const bg = active ? '#D6FE51' : 'transparent';
    const color = active ? '#000' : danger ? '#ff4d6d' : '#808080';
    const hoverBg = active ? '#e0ff6e' : danger ? 'rgba(255,77,109,0.12)' : 'rgba(255,255,255,0.06)';
    const hoverColor = active ? '#000' : danger ? '#ff6b85' : '#fff';
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                borderRadius: 4, border: 'none', cursor: disabled ? 'wait' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: bg, color,
                transition: 'background 120ms, color 120ms',
                opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
                if (disabled) return;
                e.currentTarget.style.background = hoverBg;
                e.currentTarget.style.color = hoverColor;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = bg;
                e.currentTarget.style.color = color;
            }}
        >
            {label}
        </button>
    );
}
