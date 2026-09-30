/**
 * Renders a single row in the FileExplorer tree (file or folder).
 *
 * Cycle 2: shape + visual.
 * Cycle 4 (this update): inline rename via F2/double-click, right-click context
 *   menu (Rename / New File / New Folder / Delete), lock-aware behavior.
 * Cycle 5: drag-from (dataTransfer.setData application/x-dwellium-path; the old text/uri-list
 *   payload was dropped in P4 — an external app could never authenticate to fetch it).
 * Cycle 6: drag-into (drop handler with move/copy).
 * Cycle 11: multi-select via Cmd+click + ghost element.
 * Plan 076 P4: in-app dialogs (no native alert/confirm/prompt), roving-tabindex arrow-key
 *   navigation, Finder drops through the multipart /upload route, context-menu Download.
 */
import { useState, useRef, useEffect, useCallback, useContext, createContext } from 'react';
import { useFileExplorer } from './useFileExplorer';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Globe, FolderTree, MessageSquare } from 'lucide-react';
import { rename as apiRename, deleteEntry as apiDelete, move as apiMove, downloadFile } from './fileExplorerApi';
import { uploadAndSummarize } from './dropUpload';
import { deleteTargets, batchSummary } from './moveTargets';
import { MUTED_TEXT, DANGER_TEXT, ACCENT_TEXT, HIT } from './fileExplorerTheme';
import type { ConfirmOptions, PromptOptions, NotifyTone } from './FileDialogs';

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

/** The in-widget dialog functions (useFileDialogs) — handed to rows and the Trash panel. */
export interface FileDialogApi {
    confirm: (opts: ConfirmOptions) => Promise<boolean>;
    prompt: (opts: PromptOptions) => Promise<string | null>;
    notify: (message: string, tone?: NotifyTone) => void;
}

/** What FileExplorer shares with every row (one small context instead of prop-drilling through the recursion). */
export interface ExplorerContextValue {
    dialogs: FileDialogApi;
    /** The signed-in account right now; a row compares it with the value it captured when an action started. */
    getOwner: () => string | null;
    /** The one row that is in the tab order (roving tabindex). */
    tabPath: string | null;
    /** Folders forced open while a filter is active (never persisted). */
    forceExpand: ReadonlySet<string> | null;
    /** Arrow/Home/End/Enter on a row; true when the key was handled. */
    onNavKey: (path: string, key: string) => boolean;
    onRowFocus: (path: string) => void;
}

const NO_DIALOGS: FileDialogApi = { confirm: () => Promise.resolve(false), prompt: () => Promise.resolve(null), notify: () => {} };
export const ExplorerContext = createContext<ExplorerContextValue>({
    dialogs: NO_DIALOGS, getOwner: () => null, tabPath: null, forceExpand: null, onNavKey: () => false, onRowFocus: () => {},
});

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter']);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
    /** Open the "Move to…" destination picker for this entry (spec §4.3). */
    onRequestMove?: (entry: FileEntry) => void;
    /** Open a file in the preview pane (double-click, Enter, context menu "Open"). */
    onOpen?: (path: string) => void;
    /** Show full path as secondary line under filename (used in flat view). */
    showFullPath?: boolean;
}

// All-paths-in-DOM-order accumulator. Cells push into this ref-shaped list as they
// render so range-select (Shift+click) can resolve "between A and B" without
// walking the tree again. Reset at the start of each render pass by the parent.
const visiblePathsRef: { current: string[] } = { current: [] };
export function resetVisiblePaths() { visiblePathsRef.current = []; }
export function pushVisiblePath(p: string) { visiblePathsRef.current.push(p); }

export function FileExplorerCell({ entry, depth = 0, onChange, onRequestNewEntry, onRequestMove, onOpen, showFullPath = false }: Props) {
    const { expanded, selectedPath, selectedPaths, locked, setSelectedPath, setSelectedPaths, toggleSelected, selectRange, toggleFolder } = useFileExplorer();
    const ctxValue = useContext(ExplorerContext);
    const { dialogs } = ctxValue;
    const isExpanded = !!expanded[entry.path] || !!ctxValue.forceExpand?.has(entry.path);
    const isSelected = selectedPaths.includes(entry.path) || selectedPath === entry.path;
    pushVisiblePath(entry.path);
    const isFolder = entry.tier !== 'file';
    const childNames = (entry.children ?? []).map((c) => c.name);
    // A folder held open by the filter can't be collapsed by a click (and must not flip the saved map).
    const toggle = () => { if (!ctxValue.forceExpand?.has(entry.path)) toggleFolder(entry.path); };

    // Show-in-Finder (spec §4.3) — only available in the Electron desktop build,
    // where window.electronAPI bridges shell.showItemInFolder. Resolves the
    // relative tree path against the injected workspace root.
    const electronAPI = (typeof window !== 'undefined' ? (window as any).electronAPI : undefined) as
        | { isElectron?: boolean; showItemInFolder?: (p: string) => void }
        | undefined;
    const canShowInFinder = !!electronAPI?.isElectron;
    const showInFinder = () => {
        const root = (typeof window !== 'undefined' ? (window as any).__dwelliumWorkspaceRoot : '') as string | undefined;
        const abs = root ? `${root}/${entry.path}` : entry.path;
        electronAPI?.showItemInFolder?.(abs);
    };

    const [renaming, setRenaming] = useState(false);
    const [draftName, setDraftName] = useState(entry.name);
    const [ctx, setCtx] = useState<ContextMenuState | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    /** Tell the user something, unless a different account is signed in now than when the action started. */
    const say = (owner: string | null, message: string, tone: NotifyTone = 'error') => {
        if (ctxValue.getOwner() === owner) dialogs.notify(message, tone);
    };

    useEffect(() => {
        if (renaming) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [renaming]);

    useEffect(() => {
        if (!ctx) return;
        // Close on outside mousedown only — a mousedown INSIDE the menu must not
        // dismiss it before the item's click fires (capture-phase close was
        // swallowing every menu action).
        const closeOnOutside = (e: MouseEvent) => {
            if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
            setCtx(null);
        };
        document.addEventListener('mousedown', closeOnOutside, true);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCtx(null); rowRef.current?.focus(); } };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', closeOnOutside, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [ctx]);

    // Keyboard users opening the menu land on its first enabled item.
    useEffect(() => {
        if (ctx) menuRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    }, [ctx]);

    const onMenuKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
        if (!items.length) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at <= 0 ? items.length - 1 : at - 1);
        items[next].focus();
    };

    /** Close the menu, give focus back to the row (so a dialog's opener is the row), then act. */
    const fromMenu = (action: () => void) => () => { setCtx(null); rowRef.current?.focus(); action(); };

    const handleClick = (e: React.MouseEvent) => {
        // Cycle 11: modifier-aware selection
        if (e.metaKey || e.ctrlKey) {
            // Cmd/Ctrl+click toggles this path in/out of the multi-selection
            toggleSelected(entry.path);
            return;
        }
        if (e.shiftKey) {
            // Shift+click selects the range between anchor (selectedPath) and this entry
            selectRange(selectedPath, entry.path, visiblePathsRef.current);
            return;
        }
        // Plain click: replace selection + expand folder
        setSelectedPath(entry.path);
        if (isFolder) toggle();
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Right-clicking a row already part of the multi-selection keeps that
        // selection (so Delete/Move act on the whole set); right-clicking
        // outside it collapses to just this row, matching D2.
        if (!selectedPaths.includes(entry.path)) {
            setSelectedPath(entry.path);
        }
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
        } catch (err) {
            dialogs.notify(`Rename failed: ${errText(err)}`, 'error');
            setRenaming(false);
        }
    }, [draftName, entry.name, entry.path, onChange, dialogs]);

    const handleDelete = async () => {
        if (locked) return;
        const owner = ctxValue.getOwner();
        const targets = deleteTargets(entry.path, selectedPaths);
        // deleteTargets can swap the clicked row for its selected parent folder, so only
        // name the clicked row when it is the one (and only) thing being trashed.
        const message = targets.length === 1 && targets[0] === entry.path
            ? `Move "${entry.name}"${isFolder ? ' and everything inside it' : ''} to Trash?`
            : `Move ${targets.length} item${targets.length === 1 ? '' : 's'} to Trash?\n${targets.slice(0, 5).map((p) => p.split('/').pop()).join('\n')}${targets.length > 5 ? `\n…and ${targets.length - 5} more` : ''}`;
        const ok = await dialogs.confirm({ title: 'Move to Trash', message, confirmLabel: 'Move to Trash', danger: true });
        // The dialog outlives a re-auth: never delete A's paths from B's account.
        if (!ok || ctxValue.getOwner() !== owner) return;

        const succeeded: string[] = [];
        const failed: string[] = [];
        for (const path of targets) {
            if (ctxValue.getOwner() !== owner) return;
            try {
                await apiDelete(path);
                succeeded.push(path);
            } catch (err) {
                failed.push(`"${path.split('/').pop()}": ${errText(err)}`);
            }
        }
        if (succeeded.length > 0 || failed.length > 0) onChange?.();
        if (succeeded.length > 0) {
            // Children of a trashed folder went with it — deselect them too.
            setSelectedPaths(selectedPaths.filter((p) => !succeeded.some((d) => p === d || p.startsWith(d + '/'))));
        }
        const summary = batchSummary('Deleted', succeeded.length, targets.length, failed);
        if (summary) say(owner, summary);
    };

    const handleDownload = async () => {
        const owner = ctxValue.getOwner();
        try { await downloadFile(entry.path); } catch (err) { say(owner, `Download failed: ${errText(err)}`); }
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
    //   dataTransfer.files          → external upload (Finder → multipart /upload)
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
        const owner = ctxValue.getOwner();

        // 1a) Multi-path payload (Cycle 11) — move/copy each in the set
        const pathsRaw = e.dataTransfer.getData('application/x-dwellium-paths');
        if (pathsRaw) {
            try {
                const payloads = JSON.parse(pathsRaw) as Array<{ name: string; path: string }>;
                const copy = e.altKey;
                // Items already inside this folder aren't failures — leave them out of the batch.
                const eligible = payloads.filter((p) => p.path && p.path !== `${entry.path}/${p.name}`);
                let moved = 0;
                const failed: string[] = [];
                for (const p of eligible) {
                    if (entry.path === p.path) {
                        failed.push(`"${p.name}": can't move onto itself`);
                        continue;
                    }
                    if (entry.path.startsWith(p.path + '/')) {
                        failed.push(`"${p.name}": can't move a folder into its own subtree`);
                        continue;
                    }
                    if (childNames.includes(p.name)) {
                        failed.push(`"${p.name}": already exists there`);
                        continue;
                    }
                    try {
                        await apiMove(p.path, `${entry.path}/${p.name}`, copy);
                        moved++;
                    } catch (err) {
                        failed.push(`"${p.name}": ${errText(err)}`);
                    }
                }
                if (moved > 0 || failed.length > 0) onChange?.();
                const summary = batchSummary('Moved', moved, eligible.length, failed);
                if (summary) say(owner, summary);
                return;
            } catch (err) {
                say(owner, `Multi-move failed: ${errText(err)}`);
                return;
            }
        }

        // 1b) Intra-app single-path payload — move or copy
        const pathRaw = e.dataTransfer.getData('application/x-dwellium-path');
        if (pathRaw) {
            try {
                const payload = JSON.parse(pathRaw) as { name: string; path: string; tier: string };
                const sourcePath = payload.path;
                if (!sourcePath || sourcePath === entry.path) return; // self-drop = no-op
                // Loop guard: can't move a folder into itself or its descendant
                if (entry.path === sourcePath || entry.path.startsWith(sourcePath + '/')) {
                    say(owner, "Can't move a folder into itself or one of its descendants.");
                    return;
                }
                // The backend's rename() replaces an existing destination — refuse instead of overwriting.
                if (childNames.includes(payload.name)) {
                    say(owner, `"${payload.name}" already exists in ${entry.name}. Rename one of them first.`);
                    return;
                }
                const destPath = `${entry.path}/${payload.name}`;
                await apiMove(sourcePath, destPath, e.altKey);
                onChange?.();
                return;
            } catch (err) {
                say(owner, `Move failed: ${errText(err)}`);
                return;
            }
        }

        // 2) External files (Finder drop) — multipart upload into this folder
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const out = await uploadAndSummarize(Array.from(e.dataTransfer.files), entry.path);
            say(owner, out.message, out.tone);
            onChange?.();
            return;
        }
    };

    // Cycle 5: drag source. Files (and folders) are draggable when not locked.
    // Sets the in-app payloads (P4: no text/uri-list — an external app can't authenticate to the URL):
    //   application/x-dwellium-path  → JSON {name, path, tier} for intra-app handlers (Scribe)
    //   application/x-dwellium-paths → JSON array when several rows are dragged
    //   text/plain                   → just the filename, last-resort fallback
    const handleDragStart = (e: React.DragEvent) => {
        if (locked || renaming) {
            e.preventDefault();
            return;
        }
        try {
            // If this entry is part of a multi-selection, drag the whole set; else drag just this one
            const inSet = selectedPaths.includes(entry.path);
            const dragPaths = inSet && selectedPaths.length > 1 ? selectedPaths : [entry.path];

            if (dragPaths.length > 1) {
                // Cycle 11: multi-drag. Custom MIME carries the full array; single-path MIME stays single (anchor entry).
                const arrayPayload = dragPaths.map((p) => ({
                    name: p.split('/').pop() ?? p,
                    path: p,
                    // tier is not authoritative here; resolved server-side by /move
                    tier: 'file',
                }));
                e.dataTransfer.setData('application/x-dwellium-paths', JSON.stringify(arrayPayload));

                // Build a ghost drag-image showing the count
                const ghost = document.createElement('div');
                ghost.textContent = `${dragPaths.length} items`;
                ghost.style.cssText = 'position:absolute;top:-1000px;padding:4px 10px;background:var(--bg-surface-elevated);color:var(--accent-text);border:1px solid var(--accent);border-radius:4px;font:600 11px Inter,sans-serif;';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, -10, -10);
                requestAnimationFrame(() => { if (document.body.contains(ghost)) document.body.removeChild(ghost); });
            }

            // Single-entry payload always present (the anchor)
            const payload = { name: entry.name, path: entry.path, tier: entry.tier };
            e.dataTransfer.setData('application/x-dwellium-path', JSON.stringify(payload));
            e.dataTransfer.setData('text/plain', dragPaths.length > 1 ? dragPaths.join('\n') : entry.name);
            e.dataTransfer.effectAllowed = 'copyMove';
        } catch { /* sandboxed contexts */ }
    };

    return (
        <>
            <div
                ref={rowRef}
                data-path={entry.path}
                draggable={!locked && !renaming}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => void handleDrop(e)}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (isFolder) toggle(); else onOpen?.(entry.path);
                }}
                onFocus={() => ctxValue.onRowFocus(entry.path)}
                onKeyDown={(e) => {
                    if (renaming) return;
                    if (e.key === 'F2' && isSelected) startRename();
                    else if ((e.key === 'Delete' || e.key === 'Backspace') && isSelected && !locked) {
                        e.preventDefault();
                        void handleDelete();
                    } else if (NAV_KEYS.has(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
                        if (ctxValue.onNavKey(entry.path, e.key)) e.preventDefault();
                    }
                }}
                tabIndex={ctxValue.tabPath === entry.path ? 0 : -1}
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
                    color: isSelected ? ACCENT_TEXT : 'var(--text-primary)',
                    background: dragOver
                        ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
                        : isSelected ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                    boxShadow: dragOver ? 'inset 0 0 0 1px var(--accent)' : 'none',
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
                    if (!isSelected && !dragOver) e.currentTarget.style.background = 'var(--bg-surface-hover)';
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
                            background: 'var(--bg-desktop)', color: 'var(--text-primary)',
                            border: '1px solid var(--accent)', borderRadius: 3,
                            padding: '0 4px', fontSize: 12, fontFamily: 'inherit',
                            outline: 'none',
                        }}
                    />
                ) : (
                    <>
                        <div style={{
                            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                            lineHeight: 1.15,
                        }}>
                            <span style={{
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{entry.name}</span>
                            {showFullPath && entry.path !== entry.name && (
                                <span style={{
                                    fontSize: 9, color: MUTED_TEXT,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    marginTop: 1,
                                }}>{entry.path.slice(0, entry.path.length - entry.name.length - 1)}</span>
                            )}
                        </div>
                        {entry.tier !== 'file' && entry.tier !== 'folder' && (
                            <span style={{
                                fontSize: 9, color: MUTED_TEXT, textTransform: 'uppercase',
                                letterSpacing: '0.06em', flexShrink: 0,
                            }}>{entry.tier}</span>
                        )}
                    </>
                )}
            </div>

            {/* Right-click context menu */}
            {ctx && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label={`Actions for ${entry.name}`}
                    tabIndex={-1}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={onMenuKeyDown}
                    style={{
                        position: 'fixed', top: ctx.y, left: ctx.x, zIndex: 1000,
                        background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-default)', borderRadius: 6,
                        padding: 4, minWidth: 180, fontSize: 12,
                        boxShadow: 'var(--shadow-xl)',
                    }}
                >
                    {/* Only Delete acts on a multi-selection; every other item collapses it to this row. */}
                    {isFolder && (
                        <>
                            <CtxItem label="New File" disabled={locked} onClick={fromMenu(() => { setSelectedPath(entry.path); onRequestNewEntry?.(entry.path, 'file'); })} />
                            <CtxItem label="New Folder" disabled={locked} onClick={fromMenu(() => { setSelectedPath(entry.path); onRequestNewEntry?.(entry.path, 'folder'); })} />
                            <CtxDivider />
                        </>
                    )}
                    {!isFolder && <CtxItem label="Open" onClick={fromMenu(() => { setSelectedPath(entry.path); onOpen?.(entry.path); })} />}
                    {!isFolder && <CtxItem label="Download" onClick={fromMenu(() => { setSelectedPath(entry.path); void handleDownload(); })} />}
                    {canShowInFinder && <CtxItem label="Show in Finder" onClick={fromMenu(() => { setSelectedPath(entry.path); showInFinder(); })} />}
                    <CtxItem label="Move to…" disabled={locked} onClick={fromMenu(() => { setSelectedPath(entry.path); onRequestMove?.(entry); })} />
                    <CtxItem label="Rename" shortcut="F2" disabled={locked} onClick={fromMenu(() => { setSelectedPath(entry.path); startRename(); })} />
                    <CtxItem label="Delete" danger disabled={locked} onClick={fromMenu(() => { void handleDelete(); })} />
                </div>
            )}

            {isFolder && isExpanded && entry.children?.map((child) => (
                <FileExplorerCell key={child.path} entry={child} depth={depth + 1} onChange={onChange} onRequestNewEntry={onRequestNewEntry} onRequestMove={onRequestMove} onOpen={onOpen} />
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
        <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={onClick}
            onMouseEnter={() => !disabled && setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                padding: '0 12px', minHeight: HIT, borderRadius: 4, border: 'none', font: 'inherit', textAlign: 'left',
                color: disabled ? MUTED_TEXT : (danger ? DANGER_TEXT : 'var(--text-primary)'),
                background: hovered ? 'var(--bg-surface-hover)' : 'transparent',
                cursor: disabled ? 'not-allowed' : 'pointer',
                userSelect: 'none',
            }}
        >
            <span>{label}</span>
            {shortcut && (
                <span style={{ fontSize: 10, color: MUTED_TEXT }}>{shortcut}</span>
            )}
        </button>
    );
}

function CtxDivider() {
    return <div style={{ height: 1, margin: '4px 8px', background: 'var(--border-default)' }} />;
}
