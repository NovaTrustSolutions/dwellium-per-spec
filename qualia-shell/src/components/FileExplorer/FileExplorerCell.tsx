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
import { rename as apiRename, deleteEntry as apiDelete } from './fileExplorerApi';

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
                    background: isSelected ? 'rgba(214,254,81,0.08)' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderRadius: 4,
                    outline: 'none',
                }}
                onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = '#1a1a1a';
                }}
                onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
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
