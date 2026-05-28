/**
 * Renders a single row in the FileExplorer tree (file or folder).
 *
 * Cycle 2: shape + visual.
 * Cycle 4 (this update): inline rename via F2/double-click, right-click context
 *   menu (Rename / New File / New Folder / Delete), lock-aware behavior.
 * Cycle 5: drag-from (dataTransfer.setData application/x-dwellium-path + text/uri-list).
 * Cycle 6: drag-into (drop handler with move/copy).
 * Cycle 11: multi-select via Cmd+click + ghost element.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useFileExplorer } from './useFileExplorer';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Globe, FolderTree, MessageSquare } from 'lucide-react';
import { rename as apiRename, deleteEntry as apiDelete, move as apiMove, touch as apiTouch } from './fileExplorerApi';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB cap on dropped file content

/**
 * 3-tier Holocron hierarchy model (per Ilya 2026-05-28 lock):
 *   domain  → top-tier organizational container
 *   project → nested under a domain
 *   thread  → nested under a project (chat thread / workstream)
 *   folder  → regular filesystem folder under any tier
 *   file    → leaf node
 */
export type EntryTier = 'domain' | 'project' | 'thread' | 'folder' | 'file';

export interface FileEntry {
    name: string;
    path: string;
    tier: EntryTier;
    children?: FileEntry[];
    size?: number;
    modified?: string;
}

interface ContextMenuState {
    x: number;
    y: number;
    entry: FileEntry;
}

interface Props {
    entry: FileEntry;
    depth?: number;
    onChange?: () => void;
    onRequestNewEntry?: (parentPath: string, type: 'file' | 'folder') => void;
}

export function FileExplorerCell({ entry, depth = 0, onChange, onRequestNewEntry }: Props) {
    const { expanded, selectedPath, locked, setSelectedPath, toggleFolder } = useFileExplorer();
    const isExpanded = !!expanded[entry.path];
    const isSelected = selectedPath === entry.path;
    const isFolder = entry.tier !== 'file';

    const [renaming, setRenaming] = useState(false);
    const [draftName, setDraftName] = useState(entry.name);
    const [ctx, setCtx] = useState<ContextMenuState | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (renaming) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [renaming]);

    useEffect(() => {
        if (!ctx) return;
        const close = () => setCtx(null);
        document.addEventListener('mousedown', close, true);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', close, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [ctx]);

    const handleClick = () => {
        setSelectedPath(entry.path);
        if (isFolder) toggleFolder(entry.path);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedPath(entry.path);
        setCtx({ x: e.clientX, y: e.clientY, entry });
    };

    const startRename = () => {
        if (locked) return;
        setDraftName(entry.name);
        setRenaming(true);
    };

    const commitRename = useCallback(async () => {
        const name = draftName.trim();
        if (!name || name === entry.name) { setRenaming(false); return; }
        try {
            await apiRename(entry.path, name);
            setRenaming(false);
            onChange?.();
        } catch (err: any) {
            alert(`Rename failed: ${err?.message ?? err}`);
            setRenaming(false);
        }
    }, [draftName, entry.name, entry.path, onChange]);

    const handleDelete = async () => {
        if (locked) return;
        const ok = confirm(`Delete "${entry.name}"${isFolder ? ' and everything inside it' : ''}? This cannot be undone.`);
        if (!ok) return;
        try {
            await apiDelete(entry.path);
            onChange?.();
        } catch (err: any) {
            alert(`Delete failed: ${err?.message ?? err}`);
        }
    };

    // Icon resolves by tier
    const IconForTier = entry.tier === 'domain' ? Globe
        : entry.tier === 'project' ? FolderTree
        : entry.tier === 'thread' ? MessageSquare
        : entry.tier === 'folder' ? (isExpanded ? FolderOpen : Folder)
        : FileText;

    // ── Cycle 6: drop target ─────────────────────────────────────────
    // Folder-like rows accept drops. Drop sources:
    //   application/x-dwellium-path → intra-app file/folder move (alt = copy)
    //   dataTransfer.files          → external upload (Finder → /touch)
    // Drops on file leaves are ignored (no nesting under files).
    const handleDragOver = (e: React.DragEvent) => {
        if (locked || !isFolder) return;
        // Refuse drop if source is THIS row or one of its ancestors (path-self/loop check happens at drop)
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
        if (!dragOver) setDragOver(true);
    };

    const handleDragLeave = () => {
        if (dragOver) setDragOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        if (locked || !isFolder) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);

        // 1) Intra-app path payload — move or copy
        const pathRaw = e.dataTransfer.getData('application/x-dwellium-path');
        if (pathRaw) {
            try {
                const payload = JSON.parse(pathRaw) as { name: string; path: string; tier: string };
                const sourcePath = payload.path;
                if (!sourcePath || sourcePath === entry.path) return; // self-drop = no-op
                // Loop guard: can't move a folder into itself or its descendant
                if (entry.path === sourcePath || entry.path.startsWith(sourcePath + '/')) {
                    alert("Can't move a folder into itself or one of its descendants.");
                    return;
                }
                const destPath = `${entry.path}/${payload.name}`;
                await apiMove(sourcePath, destPath, e.altKey);
                onChange?.();
                return;
            } catch (err: any) {
                alert(`Move failed: ${err?.message ?? err}`);
                return;
            }
        }

        // 2) External files (Finder drop) — upload via /touch
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            for (const f of files) {
                if (f.size > MAX_UPLOAD_BYTES) {
                    const ok = confirm(`"${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)} MB. Upload anyway?`);
                    if (!ok) continue;
                }
                try {
                    const text = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                        reader.onerror = () => reject(reader.error);
                        reader.readAsText(f);
                    });
                    await apiTouch(`${entry.path}/${f.name}`, text);
                } catch (err: any) {
                    alert(`Upload "${f.name}" failed: ${err?.message ?? err}`);
                }
            }
            onChange?.();
            return;
        }
    };

    // Cycle 5: drag source. Files (and folders) are draggable when not locked.
    // Sets three MIME types so receivers can pick whichever they understand:
    //   application/x-dwellium-path  → JSON {name, path, tier} for intra-app handlers (Scribe)
    //   text/uri-list                → API URL so external browsers/apps can fetch via http
    //   text/plain                   → just the filename, last-resort fallback
    const handleDragStart = (e: React.DragEvent) => {
        if (locked || renaming) {
            e.preventDefault();
            return;
        }
        try {
            const payload = { name: entry.name, path: entry.path, tier: entry.tier };
            e.dataTransfer.setData('application/x-dwellium-path', JSON.stringify(payload));
            // URL pointing at the read endpoint — Scribe's URL drop fallback would hit /api/file-explorer/read
            const url = `${window.location.origin}/api/file-explorer/read?path=${encodeURIComponent(entry.path)}`;
            e.dataTransfer.setData('text/uri-list', url);
            e.dataTransfer.setData('text/plain', entry.name);
            e.dataTransfer.effectAllowed = 'copyMove';
        } catch { /* sandboxed contexts */ }
    };

    return (
        <>
            <div
                draggable={!locked && !renaming}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => void handleDrop(e)}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                onDoubleClick={(e) => { e.stopPropagation(); startRename(); }}
                onKeyDown={(e) => { if (e.key === 'F2' && isSelected) startRename(); }}
                tabIndex={isSelected ? 0 : -1}
                role="treeitem"
                aria-selected={isSelected}
                aria-expanded={isFolder ? isExpanded : undefined}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    paddingLeft: 8 + depth * 14,
                    fontSize: 12,
                    color: isSelected ? '#D6FE51' : '#ccc',
                    background: dragOver
                        ? 'rgba(214,254,81,0.18)'
                        : isSelected ? 'rgba(214,254,81,0.08)' : 'transparent',
                    boxShadow: dragOver ? 'inset 0 0 0 1px #D6FE51' : 'none',
                    // Cycle 9: lock-aware cursor — pointer for navigation (selection/expand still allowed),
                    // not-allowed when hovering a draggable file/folder under lock since rearrangement is blocked.
                    cursor: 'pointer',
                    opacity: locked && isFolder ? 0.85 : 1,
                    userSelect: 'none',
                    borderRadius: 4,
                    outline: 'none',
                    transition: 'background 80ms, box-shadow 80ms',
                }}
                onMouseEnter={(e) => {
                    if (!isSelected && !dragOver) e.currentTarget.style.background = '#1a1a1a';
                }}
                onMouseLeave={(e) => {
                    if (!isSelected && !dragOver) e.currentTarget.style.background = 'transparent';
                }}
            >
                {isFolder ? (
                    isExpanded ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />
                ) : <span style={{ width: 12 }} />}
                <IconForTier size={14} strokeWidth={1.75} />
                {renaming ? (
                    <input
                        ref={inputRef}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') void commitRename();
                            else if (e.key === 'Escape') { setRenaming(false); setDraftName(entry.name); }
                        }}
                        onBlur={() => void commitRename()}
                        style={{
                            flex: 1, minWidth: 0,
                            background: '#000', color: '#fff',
                            border: '1px solid #D6FE51', borderRadius: 3,
                            padding: '0 4px', fontSize: 12, fontFamily: 'inherit',
                            outline: 'none',
                        }}
                    />
                ) : (
                    <>
                        <span style={{
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                        }}>{entry.name}</span>
                        {entry.tier !== 'file' && entry.tier !== 'folder' && (
                            <span style={{
                                fontSize: 9, color: '#555', textTransform: 'uppercase',
                                letterSpacing: '0.06em', flexShrink: 0,
                            }}>{entry.tier}</span>
                        )}
                    </>
                )}
            </div>

            {/* Right-click context menu */}
            {ctx && (
                <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        position: 'fixed', top: ctx.y, left: ctx.x, zIndex: 1000,
                        background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6,
                        padding: 4, minWidth: 180, fontSize: 12,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
                    }}
                >
                    {isFolder && (
                        <>
                            <CtxItem label="New File" disabled={locked} onClick={() => { onRequestNewEntry?.(entry.path, 'file'); setCtx(null); }} />
                            <CtxItem label="New Folder" disabled={locked} onClick={() => { onRequestNewEntry?.(entry.path, 'folder'); setCtx(null); }} />
                            <CtxDivider />
                        </>
                    )}
                    <CtxItem label="Rename" shortcut="F2" disabled={locked} onClick={() => { setCtx(null); startRename(); }} />
                    <CtxItem label="Delete" danger disabled={locked} onClick={() => { setCtx(null); void handleDelete(); }} />
                </div>
            )}

            {isFolder && isExpanded && entry.children?.map((child) => (
                <FileExplorerCell key={child.path} entry={child} depth={depth + 1} onChange={onChange} onRequestNewEntry={onRequestNewEntry} />
            ))}
        </>
    );
}

function CtxItem({ label, shortcut, onClick, disabled, danger }: {
    label: string;
    shortcut?: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
}) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            onClick={disabled ? undefined : onClick}
            onMouseEnter={() => !disabled && setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px', borderRadius: 4,
                color: disabled ? '#444' : (danger ? '#ff4d6d' : '#e5e5e5'),
                background: hovered ? '#2a2a2a' : 'transparent',
                cursor: disabled ? 'not-allowed' : 'pointer',
                userSelect: 'none',
            }}
        >
            <span>{label}</span>
            {shortcut && (
                <span style={{ fontSize: 10, color: '#666' }}>{shortcut}</span>
            )}
        </div>
    );
}

function CtxDivider() {
    return <div style={{ height: 1, margin: '4px 8px', background: '#2a2a2a' }} />;
}
