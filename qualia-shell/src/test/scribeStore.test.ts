import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScribeStore } from '../components/Scribe/scribeStore';

function resetScribeStore() {
    useScribeStore.setState({
        openFiles: [],
        activeFilepath: null,
        loading: false,
        error: null,
        editorMode: 'document',
        findReplaceOpen: false,
        focusMode: false,
        redlines: [],
        selectionToolbar: null,
        redlineLoading: false,
        comments: [],
        editingCommentId: null,
        tocVisible: false,
        minimapVisible: true,
    });
}

beforeEach(() => {
    localStorage.clear();
    resetScribeStore();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Scribe store local document fallback', () => {
    it('opens a newly created document even when the file backend is offline', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('backend offline');
        }));

        await useScribeStore.getState().createFile('Offline Draft.md', '# Draft');

        const state = useScribeStore.getState();
        expect(state.activeFilepath).toBe('Offline Draft.md');
        expect(state.openFiles).toContainEqual(expect.objectContaining({
            filepath: 'Offline Draft.md',
            content: '# Draft',
            dirty: true,
        }));
        expect(state.error).toMatch(/backend offline/i);
    });

    it('lists locally created fallback documents when the backend file list is unavailable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('backend offline');
        }));

        await useScribeStore.getState().createFile('Local Only.md', 'body');
        const files = await useScribeStore.getState().listFiles();

        expect(files).toContainEqual(expect.objectContaining({
            filepath: 'Local Only.md',
            size: 4,
        }));
    });
});

describe('Scribe store: backend has no copy of an open file', () => {
    // Cloud Run reset the backend's Scribe storage (files lived in the container's
    // home directory), so tabs the user had open came back as 404 "File not found".
    // The store must not call that "Backend offline": the backend answered. It
    // opens the local copy, says what happened, and re-uploads the copy.
    function jsonResponse(status: number, body: unknown): Response {
        return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
    }

    it('says the backend has no copy, opens the local copy dirty, and PUTs it back', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        await useScribeStore.getState().createFile('notes.md', '# kept locally'); // seeds the local cache
        resetScribeStore();

        const calls: Array<{ url: string; method: string }> = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), method: init?.method ?? 'GET' });
            if ((init?.method ?? 'GET') === 'GET') return jsonResponse(404, { success: false, error: 'File not found' });
            return jsonResponse(200, { success: true });
        }));
        await useScribeStore.getState().openFile('notes.md');
        await new Promise((r) => setTimeout(r, 0)); // let the re-upload settle

        const state = useScribeStore.getState();
        expect(state.activeFilepath).toBe('notes.md');
        expect(state.error).toBe('The backend has no copy of this file (File not found) — opened your local copy and re-uploading it.');
        expect(state.error).not.toMatch(/offline/i);
        expect(calls).toContainEqual({ url: expect.stringContaining('/api/scribe/files/notes.md'), method: 'PUT' });
        expect(state.openFiles.find((f) => f.filepath === 'notes.md')?.dirty).toBe(false); // re-upload succeeded
    });

    it('still says "Backend offline" when the network layer failed', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        await useScribeStore.getState().createFile('notes.md', '# kept locally');
        resetScribeStore();
        const fetchSpy = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
        vi.stubGlobal('fetch', fetchSpy);
        await useScribeStore.getState().openFile('notes.md');
        expect(useScribeStore.getState().error).toBe('Backend offline — opened local copy. Failed to fetch');
        expect(fetchSpy).toHaveBeenCalledTimes(1); // no re-upload attempt against a dead backend
    });
});
