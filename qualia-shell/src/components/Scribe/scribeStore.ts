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

interface ScribeState {
    openFiles: OpenFile[];
    activeFilepath: string | null;
    loading: boolean;
    error: string | null;

    openFile: (filepath: string) => Promise<void>;
    closeFile: (filepath: string) => void;
    setActiveFile: (filepath: string) => void;
    updateContent: (filepath: string, content: string) => void;
    saveFile: (filepath: string) => Promise<void>;
    createFile: (filepath: string, content?: string) => Promise<void>;
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

export const useScribeStore = create<ScribeState>((set, get) => ({
    openFiles: [],
    activeFilepath: null,
    loading: false,
    error: null,

    openFile: async (filepath) => {
        const existing = get().openFiles.find((f) => f.filepath === filepath);
        if (existing) {
            set({ activeFilepath: filepath });
            return;
        }
        set({ loading: true, error: null });
        try {
            const data = await apiFetch(`/api/scribe/files/${filepath}`);
            set((s) => ({
                openFiles: [...s.openFiles, { filepath, content: data.content, dirty: false, scrollTop: 0 }],
                activeFilepath: filepath,
                loading: false,
            }));
        } catch (err: any) {
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
            return { openFiles: next, activeFilepath: nextActive };
        });
    },

    setActiveFile: (filepath) => set({ activeFilepath: filepath }),

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
        try {
            await apiFetch(`/api/scribe/files/${filepath}`, {
                method: 'PUT',
                body: JSON.stringify({ content: file.content }),
            });
            set((s) => ({
                openFiles: s.openFiles.map((f) =>
                    f.filepath === filepath ? { ...f, dirty: false } : f
                ),
            }));
        } catch (err: any) {
            set({ error: err.message });
        }
    },

    createFile: async (filepath, content) => {
        set({ loading: true, error: null });
        try {
            await apiFetch('/api/scribe/files', {
                method: 'POST',
                body: JSON.stringify({ filepath, content: content ?? '' }),
            });
            set((s) => ({
                openFiles: [...s.openFiles, { filepath, content: content ?? '', dirty: false, scrollTop: 0 }],
                activeFilepath: filepath,
                loading: false,
            }));
        } catch (err: any) {
            set({ loading: false, error: err.message });
        }
    },

    deleteFile: async (filepath) => {
        try {
            await apiFetch(`/api/scribe/files/${filepath}`, { method: 'DELETE' });
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
        const data = await apiFetch('/api/scribe/files');
        return data.files as FileEntry[];
    },

    setScrollTop: (filepath, scrollTop) => {
        set((s) => ({
            openFiles: s.openFiles.map((f) =>
                f.filepath === filepath ? { ...f, scrollTop } : f
            ),
        }));
    },
}));
