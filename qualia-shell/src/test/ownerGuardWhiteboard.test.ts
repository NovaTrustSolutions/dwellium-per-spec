/**
 * whiteboardStore owner-race guard — a debounced save scheduled under one
 * account must never land in another account's namespace if the account
 * switches while the save is pending or mid-flight (async file prep).
 * Sister shape to ownerGuard.test.ts, scoped to the whiteboard's own
 * debounce + async persist path (fix/per-user-owner-race).
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
    getWhiteboardDoc,
    sanitizeScene,
    saveSceneDebounced,
    cancelPendingSave,
    flushPendingSave,
    resetWhiteboard,
    DEFAULT_BOARD_ID,
    WHITEBOARD_SAVE_DEBOUNCE_MS,
    FILES_CAP_BYTES,
} from '../lib/whiteboardStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';

const KEY_A = 'whiteboard:user-a';
const KEY_B = 'whiteboard:user-b';

// Non-raster mime so the real canvas downscaler is never invoked in jsdom,
// but still large enough to force the async prepareSceneFiles await path.
const overCapFiles = { f1: { mimeType: 'application/octet-stream', dataURL: 'x'.repeat(FILES_CAP_BYTES + 10) } };

beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity(null);
    resetWhiteboard();
});
afterEach(() => {
    cancelPendingSave();
    vi.useRealTimers();
});

describe('whiteboardStore owner-race guard', () => {
    it('account switch DURING the async file-prep await → A\'s scene is dropped, never written into B', async () => {
        vi.useFakeTimers();
        setPerUserIdentity('user-a');
        saveSceneDebounced(DEFAULT_BOARD_ID, sanitizeScene([{ id: 'a-stroke' }], {}, overCapFiles));
        // Fires the debounce timer; persistScene starts and suspends at
        // `await prepareSceneFiles(...)` before this call returns.
        vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS);
        // Switch accounts before the suspended persist resumes.
        setPerUserIdentity(null);
        setPerUserIdentity('user-b');
        // Flush the microtask the suspended persistScene resumes on.
        await vi.advanceTimersByTimeAsync(0);

        expect(getWhiteboardDoc().boards[DEFAULT_BOARD_ID].scene.elements).toEqual([]);
        expect(localStorage.getItem(KEY_B)).toBeNull();
        setPerUserIdentity('user-a');
        expect(localStorage.getItem(KEY_A)).toBeNull(); // never persisted at all
    });

    it('no-switch control: the same flow with no account change persists normally', async () => {
        vi.useFakeTimers();
        setPerUserIdentity('user-a');
        saveSceneDebounced(DEFAULT_BOARD_ID, sanitizeScene([{ id: 'a-stroke' }], {}, overCapFiles));
        vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS);
        await vi.advanceTimersByTimeAsync(0);

        expect(getWhiteboardDoc().boards[DEFAULT_BOARD_ID].scene.elements).toEqual([{ id: 'a-stroke' }]);
        expect(localStorage.getItem(KEY_A)).not.toBeNull();
    });

    it('flushPendingSave after a switch drops A\'s pending scene instead of writing it to B', () => {
        vi.useFakeTimers();
        setPerUserIdentity('user-a');
        saveSceneDebounced(DEFAULT_BOARD_ID, sanitizeScene([{ id: 'unsaved-stroke' }], {}, {}));
        setPerUserIdentity(null);
        setPerUserIdentity('user-b');
        flushPendingSave();

        expect(getWhiteboardDoc().boards[DEFAULT_BOARD_ID].scene.elements).toEqual([]);
        expect(localStorage.getItem(KEY_B)).toBeNull();
        setPerUserIdentity('user-a');
        expect(localStorage.getItem(KEY_A)).toBeNull();
    });
});
