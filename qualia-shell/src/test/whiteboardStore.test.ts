/**
 * whiteboardStore — plan 047 phase 1 + plan 053 rework: per-user namespacing,
 * legacy single-scene migration, multi-board doc, library persistence, image
 * downscale/cap with visible notices, and the 1.5 s trailing-edge debounce.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

import {
    whiteboardStore,
    whiteboardNoticeStore,
    getWhiteboardDoc,
    normalizeDoc,
    sanitizeScene,
    prepareSceneFiles,
    saveSceneDebounced,
    cancelPendingSave,
    flushPendingSave,
    setActiveBoard,
    openBoard,
    saveLibraryItems,
    resetWhiteboard,
    EMPTY_SCENE,
    EMPTY_DOC,
    DEFAULT_BOARD_ID,
    WHITEBOARD_SAVE_DEBOUNCE_MS,
    FILES_CAP_BYTES,
    FILE_DOWNSCALE_THRESHOLD_BYTES,
} from '../lib/whiteboardStore';
import { whiteboardUserIdHolder, setPerUserIdentity } from '../lib/perUserIdentity';

const KEY = 'whiteboard:u-wb';
const docWith = (over: Record<string, unknown>) => JSON.stringify({ ...EMPTY_DOC, ...over });

beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity('u-wb');
    resetWhiteboard();
});
afterEach(() => {
    cancelPendingSave();
    vi.useRealTimers();
});

describe('per-user namespacing + deserialization', () => {
    it('resolves the per-user key and falls back to _anonymous', () => {
        localStorage.setItem(KEY, docWith({}));
        openBoard('b1', 'Board 1');
        expect(getWhiteboardDoc().boards['b1']).toBeDefined();
        setPerUserIdentity(null);
        expect(whiteboardUserIdHolder.current).toBeNull();
        expect(getWhiteboardDoc()).toEqual(EMPTY_DOC);
    });
    it('garbage / missing / shape-less JSON → EMPTY_DOC', () => {
        expect(getWhiteboardDoc()).toEqual(EMPTY_DOC);
        localStorage.setItem(KEY, 'not-json{');
        resetWhiteboard(); // drop cache so the next snapshot re-reads storage
        expect(getWhiteboardDoc()).toEqual(EMPTY_DOC);
        localStorage.setItem(KEY, JSON.stringify({ elements: 'nope' }));
        resetWhiteboard();
        expect(getWhiteboardDoc()).toEqual(EMPTY_DOC);
    });
    it('migrates a plan-047 legacy single scene into the default board', () => {
        localStorage.setItem(KEY, JSON.stringify({ ...EMPTY_SCENE, elements: [{ id: 'legacy' }] }));
        resetWhiteboard();
        const doc = getWhiteboardDoc();
        expect(doc.type).toBe('dwellium-whiteboard');
        expect(doc.activeBoardId).toBe(DEFAULT_BOARD_ID);
        expect(doc.boards[DEFAULT_BOARD_ID].scene.elements).toEqual([{ id: 'legacy' }]);
        expect(doc.libraryItems).toBeUndefined();
    });
    it('normalizeDoc repairs a doc with a dangling activeBoardId and keeps libraryItems', () => {
        const doc = normalizeDoc({
            type: 'dwellium-whiteboard', version: 1, activeBoardId: 'gone',
            boards: { b2: { id: 'b2', title: 'Two', scene: EMPTY_SCENE, updatedAt: 5 } },
            libraryItems: [{ id: 'lib-1' }],
        });
        expect(doc.activeBoardId).toBe(DEFAULT_BOARD_ID);
        expect(doc.boards[DEFAULT_BOARD_ID]).toBeDefined();
        expect(doc.boards['b2'].title).toBe('Two');
        expect(doc.libraryItems).toEqual([{ id: 'lib-1' }]);
    });
});

describe('sanitizeScene', () => {
    it('keeps elements, viewBackgroundColor and gridSize; never collaborators', () => {
        const s = sanitizeScene(
            [{ id: 'e1' }],
            { viewBackgroundColor: '#fff', gridSize: 20, collaborators: new Map([['a', {}]]) } as never,
            { f1: { ok: true } },
        );
        expect(s).toEqual({
            type: 'excalidraw',
            version: 2,
            elements: [{ id: 'e1' }],
            appState: { viewBackgroundColor: '#fff', gridSize: 20 },
            files: { f1: { ok: true } },
        });
        expect(JSON.parse(JSON.stringify(s))).toBeTruthy(); // JSON round-trip safe
    });
});

describe('prepareSceneFiles (plan 053 #2 — ≥10 MB cap, downscale, never silent)', () => {
    const img = (bytes: number) => ({ mimeType: 'image/png', dataURL: 'x'.repeat(bytes) });

    it('leaves small files untouched (no downscale, no drop)', async () => {
        const stub = vi.fn();
        const r = await prepareSceneFiles({ f1: img(1000) }, stub);
        expect(r).toEqual({ files: { f1: img(1000) }, downscaled: [], dropped: [] });
        expect(stub).not.toHaveBeenCalled();
    });
    it('downscales oversized raster images via the injected downscaler', async () => {
        const stub = vi.fn().mockResolvedValue('tiny-jpeg');
        const big = img(FILE_DOWNSCALE_THRESHOLD_BYTES + 1);
        const r = await prepareSceneFiles({ f1: big, f2: img(10) }, stub);
        expect(stub).toHaveBeenCalledTimes(1);
        expect(r.downscaled).toEqual(['f1']);
        expect(r.dropped).toEqual([]);
        expect((r.files.f1 as { dataURL: string; mimeType: string })).toMatchObject({ dataURL: 'tiny-jpeg', mimeType: 'image/jpeg' });
        expect(r.files.f2).toEqual(img(10));
    });
    it('keeps the original when the downscaler cannot help (null)', async () => {
        const stub = vi.fn().mockResolvedValue(null);
        const big = img(FILE_DOWNSCALE_THRESHOLD_BYTES + 1);
        const r = await prepareSceneFiles({ f1: big }, stub);
        expect(r.downscaled).toEqual([]);
        expect(r.files.f1).toEqual(big);
    });
    it('drops largest-first only while still over the 10 MB cap', async () => {
        const stub = vi.fn().mockResolvedValue(null); // downscale cannot help
        const huge = img(FILES_CAP_BYTES); // alone at cap
        const big = img(FILE_DOWNSCALE_THRESHOLD_BYTES + 1);
        const small = img(100);
        const r = await prepareSceneFiles({ small, huge, big }, stub);
        expect(r.dropped).toEqual(['huge']); // largest dropped, rest now under cap
        expect(Object.keys(r.files).sort()).toEqual(['big', 'small']);
    });
});

describe('saveSceneDebounced', () => {
    // The store notifies subscribers once per persist — count notifications
    // (jsdom's localStorage is a Proxy, so a Storage.prototype spy misses it).
    it('persists exactly once on the trailing edge, with the LAST scene, into the active board', () => {
        vi.useFakeTimers();
        let persists = 0;
        const unsub = whiteboardStore.subscribe(() => { persists += 1; });
        saveSceneDebounced(DEFAULT_BOARD_ID, sanitizeScene([{ id: 'a' }], {}, {}));
        saveSceneDebounced(DEFAULT_BOARD_ID, sanitizeScene([{ id: 'a' }, { id: 'b' }], {}, {}));
        vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS - 1);
        expect(persists).toBe(0);
        expect(localStorage.getItem(KEY)).toBeNull();
        vi.advanceTimersByTime(1);
        expect(persists).toBe(1);
        const doc = JSON.parse(localStorage.getItem(KEY)!);
        expect(doc.boards[DEFAULT_BOARD_ID].scene.elements).toHaveLength(2);
        expect(getWhiteboardDoc().boards[DEFAULT_BOARD_ID].scene.elements).toHaveLength(2);
        unsub();
    });
    it('cancelPendingSave drops a queued write', () => {
        vi.useFakeTimers();
        let persists = 0;
        const unsub = whiteboardStore.subscribe(() => { persists += 1; });
        saveSceneDebounced(DEFAULT_BOARD_ID, sanitizeScene([{ id: 'a' }], {}, {}));
        cancelPendingSave();
        vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS * 2);
        expect(persists).toBe(0);
        expect(localStorage.getItem(KEY)).toBeNull();
        unsub();
    });
    it('flushPendingSave persists the queued scene immediately', () => {
        vi.useFakeTimers();
        saveSceneDebounced('b1', sanitizeScene([{ id: 'x' }], {}, {}));
        flushPendingSave();
        expect(getWhiteboardDoc().boards['b1'].scene.elements).toEqual([{ id: 'x' }]);
        vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS * 2); // no double write
    });
    it('a board over the cap persists with a visible "dropped" notice — never silent', async () => {
        vi.useFakeTimers();
        // Non-raster mime → the real canvas downscaler is never invoked in jsdom.
        const files = { f1: { mimeType: 'application/octet-stream', dataURL: 'x'.repeat(FILES_CAP_BYTES + 10) } };
        saveSceneDebounced(DEFAULT_BOARD_ID, sanitizeScene([{ id: 'a' }], {}, files));
        await vi.advanceTimersByTimeAsync(WHITEBOARD_SAVE_DEBOUNCE_MS);
        const doc = getWhiteboardDoc();
        expect(doc.boards[DEFAULT_BOARD_ID].scene.files).toEqual({});
        expect(doc.boards[DEFAULT_BOARD_ID].scene.elements).toEqual([{ id: 'a' }]);
        expect(whiteboardNoticeStore.getSnapshot()).toMatchObject({ kind: 'dropped' });
    });
});

describe('boards (plan 053 #5) + library (plan 053 #1)', () => {
    it('openBoard creates + activates a board immediately (Strata bridge path)', () => {
        openBoard('strata:maintenance:wo-1', 'WO: Leaky faucet');
        const doc = getWhiteboardDoc();
        expect(doc.activeBoardId).toBe('strata:maintenance:wo-1');
        expect(doc.boards['strata:maintenance:wo-1'].title).toBe('WO: Leaky faucet');
        expect(JSON.parse(localStorage.getItem(KEY)!).activeBoardId).toBe('strata:maintenance:wo-1');
        // Re-open keeps the scene, refreshes the title.
        saveSceneDebounced('strata:maintenance:wo-1', sanitizeScene([{ id: 'mark' }], {}, {}));
        flushPendingSave();
        openBoard('strata:maintenance:wo-1', 'WO: Leaky faucet (renamed)');
        const again = getWhiteboardDoc();
        expect(again.boards['strata:maintenance:wo-1'].scene.elements).toEqual([{ id: 'mark' }]);
        expect(again.boards['strata:maintenance:wo-1'].title).toBe('WO: Leaky faucet (renamed)');
    });
    it('setActiveBoard flushes the pending save of the previous board first', () => {
        vi.useFakeTimers();
        openBoard('b1', 'One');
        saveSceneDebounced('b1', sanitizeScene([{ id: 'last-stroke' }], {}, {}));
        setActiveBoard(DEFAULT_BOARD_ID);
        const doc = getWhiteboardDoc();
        expect(doc.activeBoardId).toBe(DEFAULT_BOARD_ID);
        expect(doc.boards['b1'].scene.elements).toEqual([{ id: 'last-stroke' }]); // not lost
        setActiveBoard('missing'); // unknown id → no-op
        expect(getWhiteboardDoc().activeBoardId).toBe(DEFAULT_BOARD_ID);
    });
    it('saveLibraryItems persists and survives a store re-read; [] stays []', () => {
        saveLibraryItems([{ id: 'lib-1', status: 'published' }]);
        expect(getWhiteboardDoc().libraryItems).toEqual([{ id: 'lib-1', status: 'published' }]);
        whiteboardStore.reset(); // simulate reload: re-read from localStorage
        expect(getWhiteboardDoc().libraryItems).toEqual([{ id: 'lib-1', status: 'published' }]);
        saveLibraryItems([]);
        whiteboardStore.reset();
        expect(getWhiteboardDoc().libraryItems).toEqual([]); // deleted-all is remembered
    });
    it('library and boards are isolated per account (account switch)', () => {
        saveLibraryItems([{ id: 'andy-item' }]);
        openBoard('b1', 'Mine');
        setPerUserIdentity('u-other');
        expect(getWhiteboardDoc().libraryItems).toBeUndefined();
        expect(getWhiteboardDoc().boards['b1']).toBeUndefined();
        setPerUserIdentity('u-wb');
        expect(getWhiteboardDoc().libraryItems).toEqual([{ id: 'andy-item' }]);
        expect(getWhiteboardDoc().boards['b1'].title).toBe('Mine');
    });
});

describe('whiteboardNoticeStore', () => {
    it('push / dismiss round-trip with subscriber notification', () => {
        const seen: Array<string | null> = [];
        const unsub = whiteboardNoticeStore.subscribe(() => {
            seen.push(whiteboardNoticeStore.getSnapshot()?.kind ?? null);
        });
        whiteboardNoticeStore.push('downscaled', '1 image downscaled');
        expect(whiteboardNoticeStore.getSnapshot()).toMatchObject({ kind: 'downscaled', message: '1 image downscaled' });
        whiteboardNoticeStore.dismiss();
        expect(whiteboardNoticeStore.getSnapshot()).toBeNull();
        expect(seen).toEqual(['downscaled', null]);
        unsub();
    });
});
