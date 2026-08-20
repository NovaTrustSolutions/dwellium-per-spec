/**
 * whiteboardStore — plan 047 phase 1: per-user namespacing, tolerant
 * deserialization, scene sanitization (collaborators stripped, files capped)
 * and the 1.5 s trailing-edge save debounce.
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
    sanitizeScene,
    saveSceneDebounced,
    cancelPendingSave,
    resetWhiteboard,
    EMPTY_SCENE,
    WHITEBOARD_SAVE_DEBOUNCE_MS,
} from '../lib/whiteboardStore';
import { whiteboardUserIdHolder, setPerUserIdentity } from '../lib/perUserIdentity';

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
        localStorage.setItem('whiteboard:u-wb', JSON.stringify({ ...EMPTY_SCENE, elements: [{ id: 'mine' }] }));
        expect(whiteboardStore.getSnapshot().elements).toHaveLength(1);
        setPerUserIdentity(null);
        expect(whiteboardUserIdHolder.current).toBeNull();
        expect(whiteboardStore.getSnapshot()).toEqual(EMPTY_SCENE);
    });
    it('garbage / missing / shape-less JSON → EMPTY_SCENE', () => {
        expect(whiteboardStore.getSnapshot()).toEqual(EMPTY_SCENE);
        localStorage.setItem('whiteboard:u-wb', 'not-json{');
        resetWhiteboard(); // drop cache so the next snapshot re-reads storage
        expect(whiteboardStore.getSnapshot()).toEqual(EMPTY_SCENE);
        localStorage.setItem('whiteboard:u-wb', JSON.stringify({ elements: 'nope' }));
        resetWhiteboard();
        expect(whiteboardStore.getSnapshot()).toEqual(EMPTY_SCENE);
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
    it('drops files over the 2 MB cap', () => {
        const big = { f1: { dataURL: 'x'.repeat(2 * 1024 * 1024 + 1) } };
        expect(sanitizeScene([], {}, big).files).toEqual({});
        expect(sanitizeScene([], {}, { f1: { small: true } }).files).toEqual({ f1: { small: true } });
    });
});

describe('saveSceneDebounced', () => {
    // The store notifies subscribers once per persist — count notifications
    // (jsdom's localStorage is a Proxy, so a Storage.prototype spy misses it).
    it('persists exactly once on the trailing edge, with the LAST scene', () => {
        vi.useFakeTimers();
        let persists = 0;
        const unsub = whiteboardStore.subscribe(() => { persists += 1; });
        saveSceneDebounced(sanitizeScene([{ id: 'a' }], {}, {}));
        saveSceneDebounced(sanitizeScene([{ id: 'a' }, { id: 'b' }], {}, {}));
        vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS - 1);
        expect(persists).toBe(0);
        expect(localStorage.getItem('whiteboard:u-wb')).toBeNull();
        vi.advanceTimersByTime(1);
        expect(persists).toBe(1);
        expect(JSON.parse(localStorage.getItem('whiteboard:u-wb')!).elements).toHaveLength(2);
        expect(whiteboardStore.getSnapshot().elements).toHaveLength(2);
        unsub();
    });
    it('cancelPendingSave drops a queued write', () => {
        vi.useFakeTimers();
        let persists = 0;
        const unsub = whiteboardStore.subscribe(() => { persists += 1; });
        saveSceneDebounced(sanitizeScene([{ id: 'a' }], {}, {}));
        cancelPendingSave();
        vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS * 2);
        expect(persists).toBe(0);
        expect(localStorage.getItem('whiteboard:u-wb')).toBeNull();
        unsub();
    });
});
