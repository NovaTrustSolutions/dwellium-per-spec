/**
 * FileExplorer — Holocron-style tree-view file browser (Dwellium port).
 *
 * Cycle 2: scaffold UI + lock/dual-mode toggles + empty state.
 *   Per-user state via fileExplorerStore (sister to scribeLayoutStore).
 * Cycle 3+ (shipped): tree fetched via fileExplorerApi.fetchTree() (/api/files/tree).
 * Cycle 4: inline rename + create file/folder.
 * Cycle 5: drag-from (sets application/x-dwellium-path; text/uri-list dropped in P4).
 * Cycle 6: drag-into (move/copy between folders).
 * Cycle 7: cross-widget DnD wiring with Scribe.
 * Cycle 8: screenshot-paste via Cmd+V.
 * Cycle 9-10: hierarchy lock + dual-mode polish.
 * Cycle 11: multi-select.
 * Cycle 12: closure + acceptance walk.
 * Plan 076 P4: in-widget dialogs (useFileDialogs — no native alert/confirm/prompt), roving-tabindex
 *   arrow-key navigation, toolbar filter, breadcrumbs, multipart upload (button + Finder drops +
 *   pasted screenshots with a relative image link), and a debounced refetch on FILE_TREE_CHANGED.
 *
 * See Scripts/autorun/FILE_EXPLORER_PORTING_PLAN.md for full breakdown.
 */
import { useEffect, useState, useCallback, useRef, useContext, useMemo } from 'react';
import { Lock, Unlock, List, ListTree, RefreshCw, FilePlus, FolderPlus, FolderRoot, Folder, FileText, Trash2, Upload } from 'lucide-react';
import { FileExplorerCell, ExplorerContext, resetVisiblePaths, type FileEntry, type ExplorerContextValue, type FileDialogApi } from './FileExplorerCell';
import { useFileExplorer } from './useFileExplorer';
import { fileExplorerStore, saveFileExplorer } from './fileExplorerStore';
import { fetchTree, mkdir, touch, move as apiMove, uploadFiles, FILE_TREE_CHANGED } from './fileExplorerApi';
import { getWorkspaceRoot } from './workspaceRoot';
import { MoveToModal } from './MoveToModal';
import { FilePreview } from './FilePreview';
import { TrashPanel } from './TrashPanel';
import { Breadcrumbs } from './Breadcrumbs';
import { useFileDialogs } from './FileDialogs';
import { MUTED_TEXT, DANGER_TEXT, WARN_TEXT, ACCENT_TEXT, HIT } from './fileExplorerTheme';
import { visibleRows, navKey } from './treeNav';
import { filterTree } from './treeFilter';
import { destFor, childNames, batchSummary, parentOf } from './moveTargets';
import { uploadAndSummarize } from './dropUpload';
import { UserContext } from '../../context/UserContext';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const TREE_REFRESH_DEBOUNCE_MS = 300;

function findEntry(list: FileEntry[], path: string): FileEntry | null {
    for (const e of list) {
        if (e.path === path) return e;
        const hit = e.children ? findEntry(e.children, path) : null;
        if (hit) return hit;
    }
    return null;
}

/** Folder an upload or paste lands in: the selected folder, the selected file's folder, else root. */
function destFolderFor(entries: FileEntry[], selectedPath: string | null): string {
    const sel = selectedPath ? findEntry(entries, selectedPath) : null;
    if (!sel) return '';
    return sel.tier !== 'file' ? sel.path : parentOf(sel.path);
}

/**
 * Cycle 8 / P4: upload one pasted image into `folder`, then write a small .md next to it that links the
 * image by its RELATIVE file name (FilePreview resolves that against the .md's folder). Throws on failure.
 */
async function pasteScreenshot(blob: Blob, folder: string): Promise<void> {
    const ext = (blob.type.split('/')[1] ?? 'png').replace('+xml', '');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const imgName = `screenshot-${stamp}.${ext}`;
    const [r] = await uploadFiles([new File([blob], imgName, { type: blob.type })], folder);
    if (!r || r.status !== 'ok') throw new Error(r?.status === 'exists' ? `${imgName} already exists` : (r?.error || 'the image did not upload'));
    const stored = (r.path ?? '').split('/').pop() || imgName;
    const mdName = `screenshot-${stamp}.md`;
    const content = `# Screenshot · ${new Date().toLocaleString()}\n\n![screenshot](${stored})\n\n_Pasted via Cmd+V into ${folder || '(root)'}._\n`;
    await touch(folder ? `${folder}/${mdName}` : mdName, content);
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
    return out;
}

function sortFlat(entries: FileEntry[], sort: 'modified-desc' | 'name-asc' | 'size-desc'): FileEntry[] {
    const copy = entries.slice();
    if (sort === 'name-asc') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'size-desc') copy.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    else copy.sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''));
    return copy;
}

export default function FileExplorer() {
    const { locked, viewMode, selectedPath, expanded, flatSort, setLocked, setViewMode, setFlatSort, setSelectedPath, toggleFolder } = useFileExplorer();
    // Workspace root path (spec §2.4) — read userId via context directly so a
    // missing provider (tests) degrades gracefully instead of throwing.
    const userCtx = useContext(UserContext);
    const userId = userCtx?.user?.id ?? null;
    const workspaceRoot = getWorkspaceRoot(userId);
    // Post-await UI (toasts/alerts) checks this so a move or paste started as one
    // account never reports on another account's screen after a re-auth switch.
    const userIdRef = useRef(userId);
    userIdRef.current = userId;
    // In-widget dialogs (replace window.alert/confirm/prompt). `host` is rendered inside the relative root.
    const fileDialogs = useFileDialogs();
    const dlg: FileDialogApi = useMemo(
        () => ({ confirm: fileDialogs.confirm, prompt: fileDialogs.prompt, notify: fileDialogs.notify }),
        [fileDialogs.confirm, fileDialogs.prompt, fileDialogs.notify],
    );
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    // Roving tabindex: the row last focused (or the selected one) is the widget's single tab stop.
    const [focusPath, setFocusPath] = useState<string | null>(null);
    const [focusReq, setFocusReq] = useState<string | null>(null);
    const treeRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [newEntry, setNewEntry] = useState<NewEntryState | null>(null);
    const [newName, setNewName] = useState('');
    const newInputRef = useRef<HTMLInputElement>(null);

    // "Move to…" picker target (spec §4.3). Null when the modal is closed.
    const [moveTarget, setMoveTarget] = useState<FileEntry | null>(null);

    // P3: file preview pane (below the tree) and the Trash panel (replaces the tree).
    const [previewPath, setPreviewPath] = useState<string | null>(null);
    const [showTrash, setShowTrash] = useState(false);
    const bodyRef = useRef<HTMLDivElement>(null);

    // D6: request-sequence guard — an in-flight fetchTree from a prior refresh() call
    // (e.g. one started for a different account, or an older overlapping refresh) may
    // resolve after a newer one starts. Only the call that bumped the sequence last
    // is allowed to commit its result to state.
    const requestSeqRef = useRef(0);
    const refresh = useCallback(async () => {
        const mySeq = ++requestSeqRef.current;
        setLoading(true);
        setError(null);
        try {
            const list = await fetchTree();
            if (mySeq !== requestSeqRef.current) return; // superseded — drop
            setEntries(list);
            const live = new Set<string>();
            (function collect(l: FileEntry[]) { l.forEach((x) => { live.add(x.path); if (x.children) collect(x.children); }); })(list);
            // Close the preview when its file left the tree (deleted / moved / renamed).
            setPreviewPath((p) => (p && live.has(p) ? p : null));
            // The selection is persisted, so it can name paths that are gone (deleted
            // elsewhere, another device). Drop them so Delete never acts on a ghost.
            const sel = fileExplorerStore.getSnapshot();
            const keep = sel.selectedPaths.filter((p) => live.has(p));
            const anchor = sel.selectedPath && live.has(sel.selectedPath) ? sel.selectedPath : null;
            if (keep.length !== sel.selectedPaths.length || anchor !== sel.selectedPath) {
                saveFileExplorer({ selectedPaths: keep, selectedPath: anchor });
            }
        } catch (err: any) {
            if (mySeq !== requestSeqRef.current) return; // superseded — drop
            setError(err?.message ?? 'Failed to load file tree');
            setEntries([]);
        } finally {
            if (mySeq === requestSeqRef.current) setLoading(false);
        }
    }, []);

    // Move the picker's target into the chosen destination (spec §4.3).
    const doMove = useCallback(async (destPath: string) => {
        const src = moveTarget;
        if (!src) return;
        const owner = userIdRef.current;
        // The backend's rename() replaces an existing destination — refuse instead of overwriting.
        if (childNames(entries, destPath).includes(src.name)) {
            dlg.notify(`"${src.name}" already exists in ${destPath || 'root'}. Rename one of them first.`, 'error');
            return;
        }
        try {
            await apiMove(src.path, destFor(destPath, src.name), false);
            setMoveTarget(null);
            await refresh();
            if (userIdRef.current !== owner) return;
            dlg.notify(`Moved "${src.name}" to ${destPath || 'root'}`);
        } catch (err) {
            if (userIdRef.current !== owner) return;
            dlg.notify(`Move failed: ${errText(err)}`, 'error');
            setMoveTarget(null);
            await refresh(); // D6: the tree may be stale — that's why the move failed
        }
    }, [moveTarget, refresh, entries, dlg]);

    // Move focus into the preview so Esc (handled by FilePreview's region) works at once,
    // and hand it back to the row that opened it on close.
    const openerRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (previewPath) bodyRef.current?.querySelector<HTMLElement>('[aria-label="Close preview"]')?.focus();
    }, [previewPath]);
    const openPreview = useCallback((path: string) => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.closest('[role="treeitem"]')) openerRef.current = active;
        setPreviewPath(path);
    }, []);
    const closePreview = useCallback(() => {
        setPreviewPath(null);
        const opener = openerRef.current;
        openerRef.current = null;
        if (opener && document.contains(opener)) opener.focus();
    }, []);

    // Trash restore: the item is back in the tree — reload and tell the user (owner-checked).
    // `owner` is the account the Trash panel was rendered for — i.e. who clicked Restore —
    // so a restore that finishes after an account switch never toasts on the next account.
    const handleRestored = useCallback(async (path: string, owner: string | null) => {
        if (userIdRef.current !== owner) return;
        await refresh();
        if (userIdRef.current !== owner) return;
        dlg.notify(`Restored "${path}"`);
    }, [refresh, dlg]);

    useEffect(() => {
        if (newEntry) newInputRef.current?.focus();
    }, [newEntry]);

    // Cycle 10: Cmd+/ (or Cmd+\) toggles tree ↔ flat
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === '/' || e.key === '\\')) {
                e.preventDefault();
                setViewMode(viewMode === 'tree' ? 'flat' : 'tree');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [viewMode, setViewMode]);

    // Cycle 8 / P4: Cmd+V screenshot-paste. The image uploads (multipart) into the selected folder (or the
    // selected file's folder, or root) and a small .md beside it links it by a relative name.
    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
        if (locked) return;
        const imageItems = Array.from(e.clipboardData?.items ?? []).filter((it) => it.type.startsWith('image/'));
        if (imageItems.length === 0) return;
        e.preventDefault();

        const targetFolder = destFolderFor(entries, selectedPath);
        const owner = userIdRef.current;
        let pastedCount = 0;
        const failed: string[] = [];
        for (const item of imageItems) {
            const blob = item.getAsFile();
            if (!blob) continue;
            try { await pasteScreenshot(blob, targetFolder); pastedCount++; } catch (err) { failed.push(errText(err)); }
        }
        if (userIdRef.current !== owner) return;
        if (failed.length > 0) dlg.notify(`Could not paste ${failed.length} screenshot${failed.length === 1 ? '' : 's'}: ${failed.join('; ')}`, 'error');
        if (pastedCount > 0) {
            await refresh();
            if (userIdRef.current !== owner) return;
            dlg.notify(`${pastedCount} screenshot${pastedCount === 1 ? '' : 's'} pasted to ${targetFolder || 'root'}`);
        }
    }, [entries, locked, refresh, selectedPath, dlg]);

    // Upload button + Finder drops at the root: one summary line; refetch only if something was stored.
    const runUpload = useCallback(async (files: File[], dest: string) => {
        const owner = userIdRef.current;
        const out = await uploadAndSummarize(files, dest);
        if (userIdRef.current !== owner) return;
        dlg.notify(out.message, out.tone);
        if (out.ok > 0) await refresh();
    }, [dlg, refresh]);

    const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = ''; // so picking the same file again still fires change
        if (files.length > 0) void runUpload(files, destFolderFor(entries, selectedPath));
    };

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
        } catch (err) {
            dlg.notify(`Create failed: ${errText(err)}`, 'error');
            cancelNewEntry();
        }
    }, [newEntry, newName, cancelNewEntry, refresh, dlg]);

    // D1: reload the tree whenever the signed-in account changes (a session-expired
    // re-auth modal can keep this widget mounted while a DIFFERENT account signs in —
    // logout alone doesn't cover it since it unmounts the shell). Clear entries and any
    // state tied to the old user's paths before refreshing so A's tree/pickers never
    // show once B is signed in.
    useEffect(() => {
        setEntries([]);
        setMoveTarget(null);
        setNewEntry(null);
        setPreviewPath(null);
        setShowTrash(false);
        setFilter('');
        setFocusPath(null);
        setFocusReq(null);
        void refresh();
    }, [userId, refresh]);

    // P4: other widgets (Workspace, Wiki, other windows) and our own mutations announce tree changes.
    // Debounced so a burst of mutations is one refetch; refresh()'s sequence guard still orders the results.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onChanged = () => {
            clearTimeout(timer);
            timer = setTimeout(() => void refresh(), TREE_REFRESH_DEBOUNCE_MS);
        };
        window.addEventListener(FILE_TREE_CHANGED, onChanged);
        return () => { window.removeEventListener(FILE_TREE_CHANGED, onChanged); clearTimeout(timer); };
    }, [refresh]);

    // Filter (toolbar box): folders holding a match are forced open for display only — never written
    // into the user's saved expanded map, so clearing the filter restores exactly what they had open.
    const shown = useMemo(() => {
        const f = filterTree(viewMode === 'flat' ? flattenTree(entries) : entries, filter);
        return {
            list: viewMode === 'flat' ? sortFlat(f.entries, flatSort) : f.entries,
            force: viewMode === 'tree' && f.expand.size > 0 ? f.expand : null,
        };
    }, [entries, filter, viewMode, flatSort]);
    const displayedEntries = shown.list;
    const forceExpand = shown.force;
    const filtering = filter.trim() !== '';
    const effExpanded = useMemo(
        () => (forceExpand ? { ...expanded, ...Object.fromEntries([...forceExpand].map((p) => [p, true])) } : expanded),
        [expanded, forceExpand],
    );
    const rows = useMemo(() => visibleRows(displayedEntries, effExpanded), [displayedEntries, effExpanded]);
    const inRows = (p: string | null): p is string => p !== null && rows.some((r) => r.path === p);
    const tabPath = inRows(focusPath) ? focusPath : inRows(selectedPath) ? selectedPath : (rows[0]?.path ?? null);

    const requestFocus = useCallback((path: string) => setFocusReq(path), []);
    // Move DOM focus to a requested row once it is rendered (it may need its ancestors expanded first).
    useEffect(() => {
        if (focusReq === null) return;
        const el = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])
            .find((n) => n.dataset.path === focusReq);
        if (el) { el.focus(); el.scrollIntoView?.({ block: 'nearest' }); setFocusReq(null); }
        else if (!rows.some((r) => r.path === focusReq)) setFocusReq(null);
    }, [focusReq, rows]);

    // Arrow/Home/End/Enter on a row (treeNav.navKey). Selection follows focus.
    const onNavKey = (path: string, key: string): boolean => {
        const r = navKey(rows, path, key);
        if (!r) return false;
        if (r.focus) { setSelectedPath(r.focus); requestFocus(r.focus); }
        else if (r.toggle) { if (!forceExpand?.has(r.toggle)) toggleFolder(r.toggle); }
        else if (r.open) openPreview(r.open);
        return true;
    };

    // Breadcrumb click: select that folder, open its ancestors, bring its row into view. '' = root.
    const onCrumb = (path: string) => {
        if (!path) { setSelectedPath(null); return; }
        const parts = path.split('/');
        const open = Object.fromEntries(parts.slice(0, -1).map((_, i) => [parts.slice(0, i + 1).join('/'), true]));
        saveFileExplorer({ expanded: { ...expanded, ...open }, selectedPath: path, selectedPaths: [path] });
        requestFocus(path);
    };

    const explorerCtx: ExplorerContextValue = {
        dialogs: dlg, getOwner: () => userIdRef.current, tabPath, forceExpand, onNavKey, onRowFocus: setFocusPath,
    };
    const fileCount = flattenTree(entries).length;
    // Cycle 11: reset the visible-paths accumulator each render so Shift+range-click can resolve.
    resetVisiblePaths();

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
        const owner = userIdRef.current;
        const say = (msg: string) => { if (userIdRef.current === owner) dlg.notify(msg, 'error'); };

        // Cycle 11: multi-path drop to root
        const pathsRaw = e.dataTransfer.getData('application/x-dwellium-paths');
        if (pathsRaw) {
            try {
                const payloads = JSON.parse(pathsRaw) as Array<{ name: string; path: string }>;
                const copy = e.altKey;
                // D13: items already at root aren't failures — they're just excluded from the batch.
                const eligible = payloads.filter((p) => p.path && p.path.includes('/'));
                let moved = 0;
                const failed: string[] = [];
                for (const p of eligible) {
                    if (childNames(entries, '').includes(p.name)) {
                        failed.push(`"${p.name}": already exists at root`);
                        continue;
                    }
                    try {
                        await apiMove(p.path, p.name, copy);
                        moved++;
                    } catch (moveErr) {
                        failed.push(`"${p.name}": ${errText(moveErr)}`);
                    }
                }
                const summary = batchSummary('Moved', moved, eligible.length, failed);
                if (summary) say(summary);
                if (moved > 0 || failed.length > 0) await refresh();
                return;
            } catch (err) {
                say(`Multi-move to root failed: ${errText(err)}`);
                return;
            }
        }

        const pathRaw = e.dataTransfer.getData('application/x-dwellium-path');
        if (pathRaw) {
            try {
                const payload = JSON.parse(pathRaw) as { name: string; path: string };
                if (!payload.path || !payload.path.includes('/')) return; // already at root
                if (childNames(entries, '').includes(payload.name)) {
                    say(`"${payload.name}" already exists at root. Rename one of them first.`);
                    return;
                }
                await apiMove(payload.path, payload.name, e.altKey);
                await refresh();
            } catch (err) {
                say(`Move to root failed: ${errText(err)}`);
            }
            return;
        }
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await runUpload(Array.from(e.dataTransfer.files), '');
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
                background: 'var(--bg-desktop)', color: MUTED_TEXT,
                fontFamily: 'inherit', fontSize: 12,
                overflow: 'hidden',
                outline: 'none',
                // Cycle 9: visible lock state — subtle warm-amber inner border when locked
                boxShadow: locked ? 'inset 0 0 0 1px color-mix(in srgb, var(--warning) 45%, transparent)' : 'none',
                transition: 'box-shadow 150ms',
            }}
        >
            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 10px', height: 44, flexShrink: 0,
                background: 'var(--bg-desktop)', borderBottom: '1px solid var(--border-subtle)',
            }}>
                <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: MUTED_TEXT,
                }}>Files</span>

                {/* Filter: name substring; Esc clears. Matches keep their ancestors, forced open for display only. */}
                <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape' && filter) { e.preventDefault(); e.stopPropagation(); setFilter(''); } }}
                    placeholder="Filter…"
                    aria-label="Filter files"
                    style={{
                        flex: 1, minWidth: 60, height: 24, boxSizing: 'border-box', margin: '0 4px',
                        background: 'var(--bg-surface)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-default)', borderRadius: 4,
                        padding: '0 6px', fontSize: 11, fontFamily: 'inherit', outline: 'none',
                    }}
                />

                {/* + New File (at root) */}
                <button
                    onClick={() => requestNewEntry('', 'file')}
                    title="New file at root"
                    disabled={locked}
                    style={iconBtn(false, locked)}
                    onMouseEnter={(e) => { if (!locked) e.currentTarget.style.color = ACCENT_TEXT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = locked ? MUTED_TEXT : MUTED_TEXT; }}
                >
                    <FilePlus size={14} strokeWidth={1.75} />
                </button>

                {/* + New Folder/Domain (at root) */}
                <button
                    onClick={() => requestNewEntry('', 'folder')}
                    title="New domain (folder at root)"
                    disabled={locked}
                    style={iconBtn(false, locked)}
                    onMouseEnter={(e) => { if (!locked) e.currentTarget.style.color = ACCENT_TEXT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = locked ? MUTED_TEXT : MUTED_TEXT; }}
                >
                    <FolderPlus size={14} strokeWidth={1.75} />
                </button>

                {/* Upload: native file picker -> multipart /upload into the selected folder (or root) */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload files"
                    aria-label="Upload files"
                    disabled={locked}
                    style={iconBtn(false, locked)}
                    onMouseEnter={(e) => { if (!locked) e.currentTarget.style.color = ACCENT_TEXT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = locked ? MUTED_TEXT : MUTED_TEXT; }}
                >
                    <Upload size={14} strokeWidth={1.75} />
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    data-testid="file-upload-input"
                    aria-hidden="true"
                    tabIndex={-1}
                    onChange={onPickFiles}
                    style={{ display: 'none' }}
                />

                {/* Refresh button — reloads from /api/file-explorer/tree */}
                <button
                    onClick={() => void refresh()}
                    title="Refresh tree"
                    disabled={loading}
                    style={iconBtn(false)}
                    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.color = ACCENT_TEXT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = MUTED_TEXT; }}
                >
                    <RefreshCw size={14} strokeWidth={1.75} style={{
                        animation: loading ? 'spin 0.9s linear infinite' : undefined,
                    }} />
                </button>

                {/* Sort dropdown — visible only in flat view */}
                {viewMode === 'flat' && (
                    <select
                        value={flatSort}
                        onChange={(e) => setFlatSort(e.target.value as 'modified-desc' | 'name-asc' | 'size-desc')}
                        title="Sort flat view"
                        style={{
                            background: 'var(--bg-desktop)', color: MUTED_TEXT,
                            border: '1px solid var(--border-subtle)', borderRadius: 4,
                            padding: '2px 4px', fontSize: 10,
                            fontFamily: 'inherit', cursor: 'pointer',
                            outline: 'none',
                        }}
                    >
                        <option value="modified-desc">↓ Modified</option>
                        <option value="name-asc">↑ Name</option>
                        <option value="size-desc">↓ Size</option>
                    </select>
                )}

                {/* Dual-mode toggle: tree ↔ flat */}
                <button
                    onClick={() => setViewMode(viewMode === 'tree' ? 'flat' : 'tree')}
                    title={(viewMode === 'tree' ? 'Switch to flat view' : 'Switch to tree view') + ' (⌘/)'}
                    style={iconBtn(viewMode === 'flat')}
                    onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT_TEXT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = viewMode === 'flat' ? ACCENT_TEXT : MUTED_TEXT; }}
                >
                    {viewMode === 'tree' ? <ListTree size={14} strokeWidth={1.75} /> : <List size={14} strokeWidth={1.75} />}
                </button>

                {/* Trash panel toggle */}
                <button
                    onClick={() => { setShowTrash((v) => !v); setPreviewPath(null); }}
                    title="Trash"
                    aria-label="Trash"
                    aria-pressed={showTrash}
                    style={iconBtn(showTrash)}
                    onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT_TEXT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = showTrash ? ACCENT_TEXT : MUTED_TEXT; }}
                >
                    <Trash2 size={14} strokeWidth={1.75} />
                </button>

                {/* Hierarchy lock (UI-only per Cycle 2 design lock) */}
                <button
                    onClick={() => setLocked(!locked)}
                    title={locked ? 'Unlock hierarchy (allow drag/rename/move)' : 'Lock hierarchy (prevent accidental restructuring)'}
                    style={iconBtn(locked)}
                    onMouseEnter={(e) => { e.currentTarget.style.color = locked ? DANGER_TEXT : ACCENT_TEXT; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = locked ? DANGER_TEXT : MUTED_TEXT; }}
                >
                    {locked ? <Lock size={14} strokeWidth={1.75} /> : <Unlock size={14} strokeWidth={1.75} />}
                </button>
            </div>

            {/* Workspace root path (spec §2.4) — always visible under the toolbar */}
            <div
                title={`Workspace root: ${workspaceRoot}`}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 10px', flexShrink: 0,
                    background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
                    fontSize: 10, color: MUTED_TEXT,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
            >
                <FolderRoot size={11} strokeWidth={1.75} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {workspaceRoot}
                </span>
            </div>

            {/* Tree body */}
            {/* Cycle 9: lock banner — appears below toolbar when locked, explains state */}
            {locked && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', flexShrink: 0,
                    background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                    borderBottom: '1px solid color-mix(in srgb, var(--warning) 25%, transparent)',
                    fontSize: 10, color: WARN_TEXT,
                    letterSpacing: '0.02em',
                }}>
                    <Lock size={11} strokeWidth={2} />
                    <span style={{ flex: 1 }}>Hierarchy locked — drag, rename, move, delete, paste disabled.</span>
                    <button
                        onClick={() => setLocked(false)}
                        style={{
                            padding: '0 10px', minHeight: HIT, fontSize: 10,
                            background: 'transparent',
                            border: '1px solid color-mix(in srgb, var(--warning) 55%, transparent)',
                            color: WARN_TEXT, borderRadius: 3,
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >Unlock</button>
                </div>
            )}

            <div ref={bodyRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {showTrash ? (
                <TrashPanel onClose={() => setShowTrash(false)} onRestored={(p) => void handleRestored(p, userId)} dialogs={dlg} />
            ) : (<>
            {selectedPath && (
                <div style={{ flexShrink: 0, padding: '0 6px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <Breadcrumbs path={selectedPath} onNavigate={onCrumb} />
                </div>
            )}
            <div
                ref={treeRef}
                onDragOver={handleRootDragOver}
                onDragLeave={handleRootDragLeave}
                onDrop={(e) => void handleRootDrop(e)}
                style={{
                    flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
                    padding: '4px 0',
                    background: rootDragOver ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'transparent',
                    boxShadow: rootDragOver ? 'inset 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent)' : 'none',
                    transition: 'background 80ms, box-shadow 80ms',
                    cursor: locked ? 'not-allowed' : 'default',
                    outline: 'none',
                }}
                role="tree"
                aria-label="File explorer"
                tabIndex={-1}
            >
                {/* Inline new-entry form — outside the list branches so it also shows for an empty tree and for nested parents */}
                {newEntry && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 8px',
                        background: 'color-mix(in srgb, var(--accent) 4%, transparent)',
                        borderLeft: '2px solid var(--accent)',
                    }}>
                        <span style={{ width: 12 }} />
                        <span style={{ fontSize: 11, color: 'var(--accent)', opacity: 0.6, display: 'inline-flex' }}>{newEntry.type === 'folder' ? <Folder size={14} aria-hidden /> : <FileText size={14} aria-hidden />}</span>
                        <input
                            ref={newInputRef}
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void commitNewEntry();
                                else if (e.key === 'Escape') cancelNewEntry();
                            }}
                            onBlur={() => void commitNewEntry()}
                            placeholder={(newEntry.type === 'folder' ? (newEntry.parentPath ? 'Folder name' : 'Domain name') : 'filename.md') + (newEntry.parentPath ? ` in ${newEntry.parentPath}` : '')}
                            style={{
                                flex: 1, minWidth: 0,
                                background: 'var(--bg-desktop)', color: 'var(--text-primary)',
                                border: '1px solid var(--accent)', borderRadius: 3,
                                padding: '2px 6px', fontSize: 12, fontFamily: 'inherit',
                                outline: 'none',
                            }}
                        />
                    </div>
                )}
                {error ? (
                    <div style={{
                        padding: '16px', color: DANGER_TEXT, fontSize: 11, lineHeight: 1.6,
                        background: 'color-mix(in srgb, var(--danger) 8%, transparent)', margin: 8, borderRadius: 4,
                        border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
                    }}>
                        <strong>Failed to load file tree</strong>
                        <div style={{ marginTop: 4, color: 'var(--text-primary)' }}>{error}</div>
                        <button
                            onClick={() => void refresh()}
                            style={{
                                marginTop: 8, padding: '0 12px', minHeight: HIT, fontSize: 11,
                                background: 'transparent', color: ACCENT_TEXT,
                                border: '1px solid var(--accent)', borderRadius: 4,
                                cursor: 'pointer',
                            }}
                        >Retry</button>
                    </div>
                ) : loading && displayedEntries.length === 0 ? (
                    <div style={{
                        padding: '24px 16px', textAlign: 'center',
                        color: MUTED_TEXT, fontSize: 11,
                    }}>Loading…</div>
                ) : displayedEntries.length === 0 && filtering ? (
                    <div role="status" style={{ padding: '24px 16px', textAlign: 'center', color: MUTED_TEXT, fontSize: 11 }}>
                        No files match “{filter.trim()}”
                    </div>
                ) : displayedEntries.length === 0 ? (
                    <div style={{
                        padding: '24px 16px', textAlign: 'center',
                        color: MUTED_TEXT, fontSize: 11, lineHeight: 1.6,
                    }}>
                        <div style={{ marginBottom: 8, opacity: 0.4 }}><Folder size={22} aria-hidden /></div>
                        <div style={{ color: MUTED_TEXT, marginBottom: 4 }}>No files yet</div>
                        <div style={{ fontSize: 10 }}>
                            Drop a file from Finder here, or create a domain folder
                            in <code style={{ color: MUTED_TEXT }}>~/.dwellium/files/&lt;userId&gt;/</code>
                        </div>
                    </div>
                ) : (
                    <ExplorerContext.Provider value={explorerCtx}>
                        {displayedEntries.map((entry) => (
                            <FileExplorerCell
                                key={entry.path}
                                entry={entry}
                                onChange={refresh}
                                onRequestNewEntry={requestNewEntry}
                                onRequestMove={setMoveTarget}
                                onOpen={openPreview}
                                showFullPath={viewMode === 'flat'}
                            />
                        ))}
                    </ExplorerContext.Provider>
                )}
            </div>
            {previewPath && <FilePreview path={previewPath} onClose={closePreview} />}
            </>)}
            </div>

            {/* Move-to-Thread picker (spec §4.3) */}
            {moveTarget && (
                <MoveToModal
                    entry={moveTarget}
                    entries={entries}
                    onPick={(destPath) => void doMove(destPath)}
                    onClose={() => setMoveTarget(null)}
                />
            )}

            {/* Status footer */}
            <div style={{
                padding: '4px 10px', flexShrink: 0,
                background: 'var(--bg-desktop)', borderTop: '1px solid var(--border-subtle)',
                fontSize: 10, color: MUTED_TEXT,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <span>{viewMode === 'tree' ? 'Tree view' : 'Flat view'}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{locked ? <><Lock size={12} aria-hidden /> Locked · </> : ''}{fileCount} file{fileCount === 1 ? '' : 's'}</span>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
            {/* In-widget confirm / prompt / notify overlay (position: relative root above) */}
            {fileDialogs.host}
        </div>
    );
}

function iconBtn(active: boolean, disabled = false): React.CSSProperties {
    return {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: HIT, height: HIT, minWidth: HIT, minHeight: HIT, padding: 0,
        background: active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
        border: '1px solid ' + (active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border-subtle)'),
        borderRadius: 4,
        color: disabled ? MUTED_TEXT : (active ? ACCENT_TEXT : MUTED_TEXT),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 100ms, color 100ms, border-color 100ms',
    };
}
