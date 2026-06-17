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
