import { create } from 'zustand';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/UserContext';

export interface OpenFile {
    filepath: string;
    content: string;
    dirty: boolean;
    scrollTop: number;
}

export interface FileEntry {
    filepath: string;
    size: number;
    modified: string;
}

export interface Redline {
    id: string;
    filepath: string;
    from: number;
    to: number;
    originalText: string;
    proposedText: string;
    rationale: string;
    state: 'pending' | 'accepted' | 'rejected';
}

export interface SelectionToolbarState {
    filepath: string;
    x: number;
    y: number;
    from: number;
    to: number;
    text: string;
}

export interface DocComment {
    id: string;
    filepath: string;
    from: number;
    to: number;
    body: string;
    createdAt: string;
    updatedAt: string;
    status: 'open' | 'resolved';
}

/** Which surface the center column shows: the document editor or the Brain Dump intake (spec §5.2). */
export type EditorMode = 'document' | 'dump';

interface ScribeState {
    openFiles: OpenFile[];
    activeFilepath: string | null;
    loading: boolean;
    error: string | null;

    /** Document editor vs Brain Dump intake. The sticky "Dump" tab toggles this. */
    editorMode: EditorMode;
    setEditorMode: (m: EditorMode) => void;

    /** Find & Replace panel visibility (spec §5.11). ⌘F / toolbar toggles it. */
    findReplaceOpen: boolean;
    setFindReplaceOpen: (b: boolean) => void;

    /** Focus mode (spec §5.11) — hides tabs/toolbar/TOC/minimap for distraction-free writing. ⌘⇧F. */
    focusMode: boolean;
    setFocusMode: (b: boolean) => void;
    /**
     * Open a document straight from in-memory content WITHOUT a backend read —
     * used by Brain Dump's "Report" output and any other client-generated doc.
     * If the filepath is already open it is replaced + activated. Always
     * switches back to document mode so the user sees the result.
     */
    openInMemoryFile: (filepath: string, content: string) => void;

    redlines: Redline[];
    addRedline: (r: Redline) => void;
    removeRedline: (id: string) => void;
    clearRedlinesForFile: (filepath: string) => void;

    selectionToolbar: SelectionToolbarState | null;
    setSelectionToolbar: (s: SelectionToolbarState | null) => void;

    redlineLoading: boolean;
    setRedlineLoading: (b: boolean) => void;

    comments: DocComment[];
    editingCommentId: string | null;
    setEditingCommentId: (id: string | null) => void;
    loadComments: (filepath: string) => Promise<void>;
    addComment: (filepath: string, from: number, to: number) => void;
    updateCommentBody: (id: string, body: string) => void;
    resolveComment: (id: string) => void;
    deleteComment: (id: string) => void;
    persistComments: (filepath: string) => Promise<void>;
    remapCommentAnchors: (filepath: string, mapPos: (pos: number, assoc?: number) => number) => void;

    tocVisible: boolean;
    setTocVisible: (v: boolean) => void;

    minimapVisible: boolean;
    setMinimapVisible: (v: boolean) => void;

    createVersion: (filepath: string) => Promise<string | null>;

    openFile: (filepath: string) => Promise<void>;
    closeFile: (filepath: string) => void;
    setActiveFile: (filepath: string) => void;
    updateContent: (filepath: string, content: string) => void;
    saveFile: (filepath: string) => Promise<void>;
    createFile: (filepath: string, content?: string, options?: { open?: boolean }) => Promise<void>;
    deleteFile: (filepath: string) => Promise<void>;
    listFiles: () => Promise<FileEntry[]>;
    setScrollTop: (filepath: string, scrollTop: number) => void;
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: { ...getAuthHeaders(), ...(opts.headers || {}) },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

interface LocalScribeFile {
    content: string;
    modified: string;
    dirty: boolean;
}

const LOCAL_FILES_KEY_PREFIX = 'scribe-local-files:';

function activeLocalUserId(): string {
    try {
        const raw = localStorage.getItem('dwellium-user');
        if (!raw) return '_anonymous';
        const parsed = JSON.parse(raw) as { id?: unknown };
        return typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : '_anonymous';
    } catch {
        return '_anonymous';
    }
}

function localFilesKey(): string {
    return `${LOCAL_FILES_KEY_PREFIX}${activeLocalUserId()}`;
}

function readLocalFiles(): Record<string, LocalScribeFile> {
    try {
        const raw = localStorage.getItem(localFilesKey());
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') return {};
        const out: Record<string, LocalScribeFile> = {};
        for (const [filepath, value] of Object.entries(parsed)) {
            if (!filepath || !value || typeof value !== 'object') continue;
            const item = value as Record<string, unknown>;
            out[filepath] = {
                content: typeof item.content === 'string' ? item.content : '',
                modified: typeof item.modified === 'string' ? item.modified : new Date(0).toISOString(),
                dirty: item.dirty === true,
            };
        }
        return out;
    } catch {
        return {};
    }
}

function writeLocalFiles(files: Record<string, LocalScribeFile>): void {
    try {
        localStorage.setItem(localFilesKey(), JSON.stringify(files));
    } catch {
        /* local cache unavailable */
    }
}

function byteSize(value: string): number {
    try {
        return new Blob([value]).size;
    } catch {
        return value.length;
    }
}

function cacheLocalFile(filepath: string, content: string, dirty: boolean): FileEntry {
    const modified = new Date().toISOString();
    const files = readLocalFiles();
    files[filepath] = { content, modified, dirty };
    writeLocalFiles(files);
    return { filepath, size: byteSize(content), modified };
}

function getLocalFile(filepath: string): LocalScribeFile | null {
    return readLocalFiles()[filepath] ?? null;
}

function removeLocalFile(filepath: string): void {
    const files = readLocalFiles();
    delete files[filepath];
    writeLocalFiles(files);
}

function localFileEntries(): FileEntry[] {
    return Object.entries(readLocalFiles()).map(([filepath, file]) => ({
        filepath,
        size: byteSize(file.content),
        modified: file.modified,
    }));
}

function mergeFileEntries(remote: FileEntry[], local: FileEntry[]): FileEntry[] {
    const byPath = new Map<string, FileEntry>();
    for (const entry of remote) byPath.set(entry.filepath, entry);
    for (const entry of local) byPath.set(entry.filepath, entry);
    return [...byPath.values()].sort((a, b) => a.filepath.localeCompare(b.filepath));
}

export const useScribeStore = create<ScribeState>((set, get) => ({
    openFiles: [],
    activeFilepath: null,
    loading: false,
    error: null,

    editorMode: 'document',
    setEditorMode: (m) => set({ editorMode: m }),

    findReplaceOpen: false,
    setFindReplaceOpen: (b) => set({ findReplaceOpen: b }),

    focusMode: false,
    setFocusMode: (b) => set({ focusMode: b }),

    openInMemoryFile: (filepath, content) => {
        set((s) => {
            const without = s.openFiles.filter((f) => f.filepath !== filepath);
            return {
                openFiles: [...without, { filepath, content, dirty: false, scrollTop: 0 }],
                activeFilepath: filepath,
                editorMode: 'document' as EditorMode,
                error: null,
            };
        });
    },

    redlines: [],
    addRedline: (r) => set((s) => ({ redlines: [...s.redlines, r] })),
    removeRedline: (id) => set((s) => ({ redlines: s.redlines.filter((r) => r.id !== id) })),
    clearRedlinesForFile: (filepath) => set((s) => ({ redlines: s.redlines.filter((r) => r.filepath !== filepath) })),

    selectionToolbar: null,
    setSelectionToolbar: (s) => set({ selectionToolbar: s }),

    redlineLoading: false,
    setRedlineLoading: (b) => set({ redlineLoading: b }),

    comments: [],
    editingCommentId: null,
    setEditingCommentId: (id) => set({ editingCommentId: id }),

    loadComments: async (filepath) => {
        try {
            const data = await apiFetch(`/api/scribe/comments/${filepath}`);
            const loaded: DocComment[] = (data.comments || []).map((c: any) => ({ ...c, filepath }));
            set((s) => ({
                comments: [...s.comments.filter((c) => c.filepath !== filepath), ...loaded],
            }));
        } catch { /* no comments yet — fine */ }
    },

    addComment: (filepath, from, to) => {
        const now = new Date().toISOString();
        const comment: DocComment = {
            id: crypto.randomUUID(),
            filepath, from, to,
            body: '',
            createdAt: now,
            updatedAt: now,
            status: 'open',
        };
        set((s) => ({ comments: [...s.comments, comment], editingCommentId: comment.id }));
    },

    updateCommentBody: (id, body) => {
        set((s) => ({
            comments: s.comments.map((c) =>
                c.id === id ? { ...c, body, updatedAt: new Date().toISOString() } : c
            ),
        }));
    },

    resolveComment: (id) => {
        set((s) => ({
            comments: s.comments.map((c) =>
                c.id === id ? { ...c, status: 'resolved' as const, updatedAt: new Date().toISOString() } : c
            ),
        }));
    },

    deleteComment: (id) => {
        set((s) => ({
            comments: s.comments.filter((c) => c.id !== id),
            editingCommentId: s.editingCommentId === id ? null : s.editingCommentId,
        }));
    },

    persistComments: async (filepath) => {
        const comments = get().comments
            .filter((c) => c.filepath === filepath)
            .map(({ filepath: _fp, ...rest }) => rest);
        try {
            await apiFetch(`/api/scribe/comments/${filepath}`, {
                method: 'PUT',
                body: JSON.stringify({ comments }),
            });
        } catch { /* persist failed — non-fatal, will retry on next mutation */ }
    },

    remapCommentAnchors: (filepath, mapPos) => {
        set((s) => {
            let changed = false;
            const next = s.comments.map((c) => {
                if (c.filepath !== filepath) return c;
                const newFrom = mapPos(c.from, 1);
                const newTo = mapPos(c.to, -1);
                if (newFrom === c.from && newTo === c.to) return c;
                changed = true;
                return { ...c, from: Math.max(0, newFrom), to: Math.max(newFrom, newTo) };
            });
            return changed ? { comments: next } : {};
        });
    },

    tocVisible: false,
    setTocVisible: (v) => set({ tocVisible: v }),

    minimapVisible: true,
    setMinimapVisible: (v) => set({ minimapVisible: v }),

    createVersion: async (filepath) => {
        try {
            const data = await apiFetch('/api/scribe/version', {
                method: 'POST',
                body: JSON.stringify({ filepath }),
            });
            if (data.newFilepath) {
                void get().openFile(data.newFilepath);
                return data.newFilepath as string;
            }
            return null;
        } catch (err: any) {
            set({ error: err.message });
            return null;
        }
    },

    openFile: async (filepath) => {
        const existing = get().openFiles.find((f) => f.filepath === filepath);
        if (existing) {
            set({ activeFilepath: filepath });
            return;
        }
        set({ loading: true, error: null });
        try {
            const data = await apiFetch(`/api/scribe/files/${filepath}`);
            const content = typeof data.content === 'string' ? data.content : '';
            cacheLocalFile(filepath, content, false);
            set((s) => ({
                openFiles: [...s.openFiles, { filepath, content, dirty: false, scrollTop: 0 }],
                activeFilepath: filepath,
                loading: false,
            }));
            void get().loadComments(filepath);
        } catch (err: any) {
            const local = getLocalFile(filepath);
            if (local) {
                set((s) => ({
                    openFiles: [...s.openFiles, { filepath, content: local.content, dirty: local.dirty, scrollTop: 0 }],
                    activeFilepath: filepath,
                    loading: false,
                    error: `Backend offline — opened local copy. ${err.message}`,
                }));
                return;
            }
            set({ loading: false, error: err.message });
        }
    },

    closeFile: (filepath) => {
        set((s) => {
            const next = s.openFiles.filter((f) => f.filepath !== filepath);
            let nextActive = s.activeFilepath;
            if (nextActive === filepath) {
                nextActive = next.length > 0 ? next[next.length - 1].filepath : null;
            }
            return {
                openFiles: next,
                activeFilepath: nextActive,
                comments: s.comments.filter((c) => c.filepath !== filepath),
                editingCommentId: null,
            };
        });
    },

    setActiveFile: (filepath) => set({ activeFilepath: filepath, editingCommentId: null }),

    updateContent: (filepath, content) => {
        set((s) => ({
            openFiles: s.openFiles.map((f) =>
                f.filepath === filepath ? { ...f, content, dirty: true } : f
            ),
        }));
    },

    saveFile: async (filepath) => {
        const file = get().openFiles.find((f) => f.filepath === filepath);
        if (!file) return;
        cacheLocalFile(filepath, file.content, true);
        try {
            await apiFetch(`/api/scribe/files/${filepath}`, {
                method: 'PUT',
                body: JSON.stringify({ content: file.content }),
            });
            cacheLocalFile(filepath, file.content, false);
            set((s) => ({
                openFiles: s.openFiles.map((f) =>
                    f.filepath === filepath ? { ...f, dirty: false } : f
                ),
            }));
        } catch (err: any) {
            set({ error: err.message });
        }
    },

    createFile: async (filepath, content, options) => {
        const body = content ?? '';
        const shouldOpen = options?.open !== false;
        set({ loading: true, error: null });
        try {
            await apiFetch('/api/scribe/files', {
                method: 'POST',
                body: JSON.stringify({ filepath, content: body }),
            });
            cacheLocalFile(filepath, body, false);
            set((s) => shouldOpen
                ? {
                    openFiles: [
                        ...s.openFiles.filter((f) => f.filepath !== filepath),
                        { filepath, content: body, dirty: false, scrollTop: 0 },
                    ],
                    activeFilepath: filepath,
                    editorMode: 'document' as EditorMode,
                    loading: false,
                }
                : { loading: false });
        } catch (err: any) {
            cacheLocalFile(filepath, body, true);
            set((s) => shouldOpen
                ? {
                    openFiles: [
                        ...s.openFiles.filter((f) => f.filepath !== filepath),
                        { filepath, content: body, dirty: true, scrollTop: 0 },
                    ],
                    activeFilepath: filepath,
                    editorMode: 'document' as EditorMode,
                    loading: false,
                    error: err.message,
                }
                : { loading: false, error: err.message });
        }
    },

    deleteFile: async (filepath) => {
        try {
            await apiFetch(`/api/scribe/files/${filepath}`, { method: 'DELETE' });
            removeLocalFile(filepath);
            set((s) => {
                const next = s.openFiles.filter((f) => f.filepath !== filepath);
                let nextActive = s.activeFilepath;
                if (nextActive === filepath) {
                    nextActive = next.length > 0 ? next[next.length - 1].filepath : null;
                }
                return { openFiles: next, activeFilepath: nextActive };
            });
        } catch (err: any) {
            set({ error: err.message });
        }
    },

    listFiles: async () => {
        const local = localFileEntries();
        try {
            const data = await apiFetch('/api/scribe/files');
            return mergeFileEntries((data.files || []) as FileEntry[], local);
        } catch (err: any) {
            set({ error: err.message });
            return local;
        }
    },

    setScrollTop: (filepath, scrollTop) => {
        set((s) => ({
            openFiles: s.openFiles.map((f) =>
                f.filepath === filepath ? { ...f, scrollTop } : f
            ),
        }));
    },
}));
