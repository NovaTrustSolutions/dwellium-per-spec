/**
 * FileExplorer — Holocron-style tree-view file browser (Dwellium port).
 *
 * Cycle 2 (this file): scaffold UI + lock/dual-mode toggles + empty state.
 *   Per-user state via fileExplorerStore (sister to scribeLayoutStore).
 *   No data fetching yet — empty tree placeholder.
 * Cycle 3: data fetching from /api/files/tree, populate entries.
 * Cycle 4: inline rename + create file/folder.
 * Cycle 5: drag-from (sets application/x-dwellium-path + text/uri-list).
 * Cycle 6: drag-into (move/copy between folders).
 * Cycle 7: cross-widget DnD wiring with Scribe.
 * Cycle 8: screenshot-paste via Cmd+V.
 * Cycle 9-10: hierarchy lock + dual-mode polish.
 * Cycle 11: multi-select.
 * Cycle 12: closure + acceptance walk.
 *
 * See Scripts/autorun/FILE_EXPLORER_PORTING_PLAN.md for full breakdown.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Lock, Unlock, List, ListTree, RefreshCw, FilePlus, FolderPlus } from 'lucide-react';
import { FileExplorerCell, type FileEntry } from './FileExplorerCell';
import { useFileExplorer } from './useFileExplorer';
import { fetchTree, mkdir, touch, move as apiMove } from './fileExplorerApi';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/UserContext';

// Cycle 8: upload a pasted/dropped image to /api/scribe/images (reused per Ilya design lock #4)
// Returns the server-side URL of the uploaded image, or null on failure.
async function uploadImageBlob(blob: Blob, filename: string): Promise<string | null> {
    const fd = new FormData();
    fd.append('image', new File([blob], filename, { type: blob.type }));
    try {
        const res = await fetch(`${API_BASE}/api/scribe/images`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.success) return null;
        return data.url ?? null;
    } catch { return null; }
}

interface NewEntryState {
    parentPath: string; // '' for root
    type: 'file' | 'folder';
}

// Flatten a nested tree depth-first into a single array (used for flat view).
function flattenTree(entries: FileEntry[]): FileEntry[] {
    const out: FileEntry[] = [];
    const walk = (e: FileEntry) => {
        if (e.tier === 'file') out.push(e);
        e.children?.forEach(walk);
    };
    entries.forEach(walk);
    // Sort flat view by modified desc (most recent first)
    out.sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''));
    return out;
}

export default function FileExplorer() {
    const { locked, viewMode, selectedPath, setLocked, setViewMode } = useFileExplorer();
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const [newEntry, setNewEntry] = useState<NewEntryState | null>(null);
    const [newName, setNewName] = useState('');
    const newInputRef = useRef<HTMLInputElement>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await fetchTree();
            setEntries(list);
        } catch (err: any) {
            setError(err?.message ?? 'Failed to load file tree');
            setEntries([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (newEntry) newInputRef.current?.focus();
    }, [newEntry]);

    // Cycle 8: Cmd+V screenshot-paste. Image bytes upload to /api/scribe/images
    // (reused per Ilya design lock #4); a small .md reference file is created
    // in the currently-selected folder (or at root if nothing selected).
    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
        if (locked) return;
        const items = Array.from(e.clipboardData?.items ?? []);
        const imageItems = items.filter((it) => it.type.startsWith('image/'));
        if (imageItems.length === 0) return;
        e.preventDefault();

        // Resolve target folder: selected folder if it's tier != 'file', else parent of selected file, else root
        const allFiles = flattenTree(entries);
        const allEntries = (function collect(list: FileEntry[], acc: FileEntry[] = []): FileEntry[] {
            list.forEach((x) => { acc.push(x); x.children && collect(x.children, acc); });
            return acc;
        })(entries);
        const sel = selectedPath ? allEntries.find((x) => x.path === selectedPath) : null;
        let targetFolder = '';
        if (sel) {
            if (sel.tier !== 'file') targetFolder = sel.path;
            else if (sel.path.includes('/')) targetFolder = sel.path.slice(0, sel.path.lastIndexOf('/'));
        }
        // unused but kept for symmetry with flat view counts
        void allFiles;

        let pastedCount = 0;
        for (const item of imageItems) {
            const blob = item.getAsFile();
            if (!blob) continue;
            const ext = (blob.type.split('/')[1] ?? 'png').replace('+xml', '');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const imgName = `screenshot-${timestamp}.${ext}`;
            const url = await uploadImageBlob(blob, imgName);
            if (!url) continue;
            const mdName = `screenshot-${timestamp}.md`;
            const mdRel = targetFolder ? `${targetFolder}/${mdName}` : mdName;
            const fullUrl = `${API_BASE}${url}`;
            const content = `# Screenshot · ${new Date().toLocaleString()}\n\n![${imgName}](${fullUrl})\n\n_Pasted via Cmd+V into ${targetFolder || '(root)'}._\n`;
            try {
                await touch(mdRel, content);
                pastedCount++;
            } catch { /* skip individual failures */ }
        }
        if (pastedCount > 0) {
            await refresh();
            setToast(`📋 ${pastedCount} screenshot${pastedCount === 1 ? '' : 's'} pasted to ${targetFolder || 'root'}`);
            setTimeout(() => setToast(null), 3000);
        }
    }, [entries, locked, refresh, selectedPath]);

    const requestNewEntry = useCallback((parentPath: string, type: 'file' | 'folder') => {
        if (locked) return;
        setNewEntry({ parentPath, type });
        setNewName('');
    }, [locked]);

    const cancelNewEntry = useCallback(() => {
        setNewEntry(null);
        setNewName('');
    }, []);

    const commitNewEntry = useCallback(async () => {
        if (!newEntry) return;
        const name = newName.trim();
        if (!name) { cancelNewEntry(); return; }
        const relPath = newEntry.parentPath ? `${newEntry.parentPath}/${name}` : name;
        try {
            if (newEntry.type === 'folder') {
                await mkdir(relPath);
            } else {
                // Default new-file extension: .md (matches Scribe's primary file type).
                // If the user already provided an extension, respect it.
                const filename = name.includes('.') ? name : `${name}.md`;
                const fileRel = newEntry.parentPath ? `${newEntry.parentPath}/${filename}` : filename;
                await touch(fileRel);
            }
            cancelNewEntry();
            await refresh();
        } catch (err: any) {
            alert(`Create failed: ${err?.message ?? err}`);
            cancelNewEntry();
        }
    }, [newEntry, newName, cancelNewEntry, refresh]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const displayedEntries = viewMode === 'flat' ? flattenTree(entries) : entries;
    const fileCount = flattenTree(entries).length;

    // Root-level drop target: drop OUTSIDE any folder row → place at root
    const [rootDragOver, setRootDragOver] = useState(false);
    const handleRootDragOver = (e: React.DragEvent) => {
        if (locked) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
        if (!rootDragOver) setRootDragOver(true);
    };
    const handleRootDragLeave = (e: React.DragEvent) => {
        // Only clear when we actually leave the panel (not when crossing into a child row)
        if (e.currentTarget === e.target) setRootDragOver(false);
    };
    const handleRootDrop = async (e: React.DragEvent) => {
        if (locked) return;
        e.preventDefault();
        setRootDragOver(false);
        const pathRaw = e.dataTransfer.getData('application/x-dwellium-path');
        if (pathRaw) {
            try {
                const payload = JSON.parse(pathRaw) as { name: string; path: string };
                if (!payload.path || !payload.path.includes('/')) return; // already at root
                await apiMove(payload.path, payload.name, e.altKey);
                await refresh();
            } catch (err: any) {
                alert(`Move to root failed: ${err?.message ?? err}`);
            }
            return;
        }
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            for (const f of Array.from(e.dataTransfer.files)) {
                try {
                    const text = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                        reader.onerror = () => reject(reader.error);
                        reader.readAsText(f);
                    });
                    await touch(f.name, text);
                } catch { /* ignore individual failures */ }
            }
            await refresh();
        }
    };

    return (
        <div
            onPaste={(e) => void handlePaste(e)}
            tabIndex={-1}
            style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                height: '100%', width: '100%',
                background: '#000', color: '#ccc',
                fontFamily: 'inherit', fontSize: 12,
                overflow: 'hidden',
                outline: 'none',
                // Cycle 9: visible lock state — subtle warm-amber inner border when locked
                boxShadow: locked ? 'inset 0 0 0 1px rgba(255, 140, 0, 0.35)' : 'none',
                transition: 'box-shadow 150ms',
            }}
        >
            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 10px', height: 36, flexShrink: 0,
                background: '#0a0a0a', borderBottom: '1px solid #222',
            }}>
                <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: '#808080',
                    flex: 1,
                }}>Files</span>

                {/* + New File (at root) */}
                <button
                    onClick={() => requestNewEntry('', 'file')}
                    title="New file at root"
                    disabled={locked}
                    style={iconBtn(false, locked)}
                    onMouseEnter={(e) => { if (!locked) e.currentTarget.style.color = '#D6FE51'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = locked ? '#333' : '#666'; }}
                >
                    <FilePlus size={14} strokeWidth={1.75} />
                </button>

                {/* + New Folder/Domain (at root) */}
                <button
                    onClick={() => requestNewEntry('', 'folder')}
                    title="New domain (folder at root)"
                    disabled={locked}
                    style={iconBtn(false, locked)}
                    onMouseEnter={(e) => { if (!locked) e.currentTarget.style.color = '#D6FE51'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = locked ? '#333' : '#666'; }}
                >
                    <FolderPlus size={14} strokeWidth={1.75} />
                </button>

                {/* Refresh button — reloads from /api/file-explorer/tree */}
                <button
                    onClick={() => void refresh()}
                    title="Refresh tree"
                    disabled={loading}
                    style={iconBtn(false)}
                    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.color = '#D6FE51'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                >
                    <RefreshCw size={14} strokeWidth={1.75} style={{
                        animation: loading ? 'spin 0.9s linear infinite' : undefined,
                    }} />
                </button>

                {/* Dual-mode toggle: tree ↔ flat */}
                <button
                    onClick={() => setViewMode(viewMode === 'tree' ? 'flat' : 'tree')}
                    title={viewMode === 'tree' ? 'Switch to flat view' : 'Switch to tree view'}
                    style={iconBtn(viewMode === 'flat')}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#D6FE51'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = viewMode === 'flat' ? '#D6FE51' : '#666'; }}
                >
                    {viewMode === 'tree' ? <ListTree size={14} strokeWidth={1.75} /> : <List size={14} strokeWidth={1.75} />}
                </button>

                {/* Hierarchy lock (UI-only per Cycle 2 design lock) */}
                <button
                    onClick={() => setLocked(!locked)}
                    title={locked ? 'Unlock hierarchy (allow drag/rename/move)' : 'Lock hierarchy (prevent accidental restructuring)'}
                    style={iconBtn(locked)}
                    onMouseEnter={(e) => { e.currentTarget.style.color = locked ? '#ff4d6d' : '#D6FE51'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = locked ? '#ff4d6d' : '#666'; }}
                >
                    {locked ? <Lock size={14} strokeWidth={1.75} /> : <Unlock size={14} strokeWidth={1.75} />}
                </button>
            </div>

            {/* Tree body */}
            {/* Cycle 9: lock banner — appears below toolbar when locked, explains state */}
            {locked && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', flexShrink: 0,
                    background: 'rgba(255, 140, 0, 0.08)',
                    borderBottom: '1px solid rgba(255, 140, 0, 0.2)',
                    fontSize: 10, color: '#ffa84d',
                    letterSpacing: '0.02em',
                }}>
                    <Lock size={11} strokeWidth={2} />
                    <span style={{ flex: 1 }}>Hierarchy locked — drag, rename, move, delete, paste disabled.</span>
                    <button
                        onClick={() => setLocked(false)}
                        style={{
                            padding: '2px 8px', fontSize: 10,
                            background: 'transparent',
                            border: '1px solid rgba(255,140,0,0.5)',
                            color: '#ffa84d', borderRadius: 3,
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >Unlock</button>
                </div>
            )}

            <div
                onDragOver={handleRootDragOver}
                onDragLeave={handleRootDragLeave}
                onDrop={(e) => void handleRootDrop(e)}
                style={{
                    flex: 1, overflowY: 'auto', overflowX: 'hidden',
                    padding: '4px 0',
                    background: rootDragOver ? 'rgba(214,254,81,0.04)' : 'transparent',
                    boxShadow: rootDragOver ? 'inset 0 0 0 2px rgba(214,254,81,0.4)' : 'none',
                    transition: 'background 80ms, box-shadow 80ms',
                    cursor: locked ? 'not-allowed' : 'default',
                }}
                role="tree"
                aria-label="File explorer"
            >
                {error ? (
                    <div style={{
                        padding: '16px', color: '#ff4d6d', fontSize: 11, lineHeight: 1.6,
                        background: 'rgba(255,77,109,0.05)', margin: 8, borderRadius: 4,
                        border: '1px solid rgba(255,77,109,0.2)',
                    }}>
                        <strong>Failed to load file tree</strong>
                        <div style={{ marginTop: 4, color: '#bbb' }}>{error}</div>
                        <button
                            onClick={() => void refresh()}
                            style={{
                                marginTop: 8, padding: '4px 10px', fontSize: 11,
                                background: 'transparent', color: '#D6FE51',
                                border: '1px solid #D6FE51', borderRadius: 4,
                                cursor: 'pointer',
                            }}
                        >Retry</button>
                    </div>
                ) : loading && displayedEntries.length === 0 ? (
                    <div style={{
                        padding: '24px 16px', textAlign: 'center',
                        color: '#555', fontSize: 11,
                    }}>Loading…</div>
                ) : displayedEntries.length === 0 ? (
                    <div style={{
                        padding: '24px 16px', textAlign: 'center',
                        color: '#555', fontSize: 11, lineHeight: 1.6,
                    }}>
                        <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>📁</div>
                        <div style={{ color: '#888', marginBottom: 4 }}>No files yet</div>
                        <div style={{ fontSize: 10 }}>
                            Drop a file from Finder here, or create a domain folder
                            in <code style={{ color: '#aaa' }}>~/.dwellium/files/&lt;userId&gt;/</code>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Inline new-entry form at root (when active) */}
                        {newEntry && newEntry.parentPath === '' && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '4px 8px',
                                background: 'rgba(214,254,81,0.04)',
                                borderLeft: '2px solid #D6FE51',
                            }}>
                                <span style={{ width: 12 }} />
                                <span style={{ fontSize: 11, color: '#D6FE51', opacity: 0.6 }}>{newEntry.type === 'folder' ? '📁' : '📄'}</span>
                                <input
                                    ref={newInputRef}
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') void commitNewEntry();
                                        else if (e.key === 'Escape') cancelNewEntry();
                                    }}
                                    onBlur={() => void commitNewEntry()}
                                    placeholder={newEntry.type === 'folder' ? 'Domain name' : 'filename.md'}
                                    style={{
                                        flex: 1, minWidth: 0,
                                        background: '#000', color: '#fff',
                                        border: '1px solid #D6FE51', borderRadius: 3,
                                        padding: '2px 6px', fontSize: 12, fontFamily: 'inherit',
                                        outline: 'none',
                                    }}
                                />
                            </div>
                        )}
                        {displayedEntries.map((entry) => (
                            <FileExplorerCell
                                key={entry.path}
                                entry={entry}
                                onChange={refresh}
                                onRequestNewEntry={requestNewEntry}
                            />
                        ))}
                        {/* Inline new-entry form when target is a folder/tier — shown right after the parent */}
                        {/* Render is handled inside FileExplorerCell.children for nested cases; root-level handled above. */}
                    </>
                )}
            </div>

            {/* Status footer */}
            {/* Paste toast (Cycle 8) */}
            {toast && (
                <div style={{
                    position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
                    padding: '6px 14px', background: 'rgba(214,254,81,0.12)',
                    border: '1px solid rgba(214,254,81,0.5)', color: '#D6FE51',
                    fontSize: 11, borderRadius: 6, zIndex: 50,
                    pointerEvents: 'none',
                    animation: 'feToastFade 3s ease-out forwards',
                }}>{toast}</div>
            )}

            <div style={{
                padding: '4px 10px', flexShrink: 0,
                background: '#0a0a0a', borderTop: '1px solid #222',
                fontSize: 10, color: '#555',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <span>{viewMode === 'tree' ? 'Tree view' : 'Flat view'}</span>
                <span>{locked ? '🔒 Locked · ' : ''}{fileCount} file{fileCount === 1 ? '' : 's'}</span>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } } @keyframes feToastFade { 0%, 75% { opacity: 1; } 100% { opacity: 0; } }`}</style>
        </div>
    );
}

function iconBtn(active: boolean, disabled = false): React.CSSProperties {
    return {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, padding: 0,
        background: active ? 'rgba(214,254,81,0.08)' : 'transparent',
        border: '1px solid ' + (active ? 'rgba(214,254,81,0.4)' : '#222'),
        borderRadius: 4,
        color: disabled ? '#333' : (active ? '#D6FE51' : '#666'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 100ms, color 100ms, border-color 100ms',
    };
}
