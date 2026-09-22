/**
 * P2 item 15: the unified open-in-Doc-Viewer launcher — pins the three
 * behaviors the plan calls out explicitly: a live subscriber receives a
 * request, `take` reads-and-clears the pending slot, and a subscriber that
 * attaches AFTER the request still gets it via the pending slot (the
 * cold-open case: DocViewer is still mounting when Desktop/CommandPalette
 * fire the request).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    DOCVIEWER_OPEN_EVENT,
    requestDocViewerOpen,
    takePendingDocViewerOpen,
    subscribeDocViewerOpen,
} from '../lib/docViewerLauncher';

type PendingSlotWindow = Window & { __qualiaDocViewerPendingFile?: unknown };
const pendingWindow = () => window as PendingSlotWindow;

describe('docViewerLauncher', () => {
    beforeEach(() => {
        pendingWindow().__qualiaDocViewerPendingFile = null;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        pendingWindow().__qualiaDocViewerPendingFile = null;
    });

    it('an already-mounted subscriber receives the request via the live event', () => {
        const received: unknown[] = [];
        const unsubscribe = subscribeDocViewerOpen(req => received.push(req));

        requestDocViewerOpen({ fileId: 'f1', name: 'one.pdf' });
        vi.advanceTimersByTime(250); // the first dispatch, per the retry schedule

        expect(received).toEqual([{ fileId: 'f1', name: 'one.pdf' }]);
        unsubscribe();
    });

    it('takePendingDocViewerOpen reads AND clears the pending slot', () => {
        requestDocViewerOpen({ fileId: 'f2', name: 'two.pdf' });
        // Don't advance timers — nothing has consumed the live event yet,
        // only the synchronous pending-slot write has happened.
        expect(takePendingDocViewerOpen()).toEqual({ fileId: 'f2', name: 'two.pdf' });
        expect(takePendingDocViewerOpen()).toBeNull();
    });

    it('a subscriber that attaches AFTER the request still gets it, via the pending slot drain', () => {
        // Mirrors DocViewer's own mount sequence: request fires before the
        // component (and its subscriber) exists; on mount it drains the
        // pending slot once, THEN subscribes for anything after that.
        requestDocViewerOpen({ fileId: 'f3', name: 'three.pdf' });

        const pending = takePendingDocViewerOpen();
        expect(pending).toEqual({ fileId: 'f3', name: 'three.pdf' });

        const received: unknown[] = [];
        const unsubscribe = subscribeDocViewerOpen(req => received.push(req));
        if (pending) received.push(pending);
        unsubscribe();

        expect(received).toEqual([{ fileId: 'f3', name: 'three.pdf' }]);
    });

    it('consuming a request via the live event also clears the pending slot (no stale re-open on remount)', () => {
        const received: unknown[] = [];
        const unsubscribe = subscribeDocViewerOpen(req => received.push(req));

        requestDocViewerOpen({ fileId: 'f4', name: 'four.pdf' });
        vi.advanceTimersByTime(250);
        unsubscribe();

        expect(received).toEqual([{ fileId: 'f4', name: 'four.pdf' }]);
        expect(pendingWindow().__qualiaDocViewerPendingFile).toBeNull();
    });

    it('dispatches on the DOCVIEWER_OPEN_EVENT name so a raw window listener still works', () => {
        const handler = vi.fn();
        window.addEventListener(DOCVIEWER_OPEN_EVENT, handler);

        requestDocViewerOpen({ fileId: 'f5', name: 'five.pdf' });
        vi.advanceTimersByTime(250);

        expect(handler).toHaveBeenCalledTimes(1);
        window.removeEventListener(DOCVIEWER_OPEN_EVENT, handler);
    });

    it('ignores an event with neither fileId nor name', () => {
        const received: unknown[] = [];
        const unsubscribe = subscribeDocViewerOpen(req => received.push(req));

        window.dispatchEvent(new CustomEvent(DOCVIEWER_OPEN_EVENT, { detail: {} }));

        expect(received).toEqual([]);
        unsubscribe();
    });
});

describe('docViewerLauncher replay', () => {
    it('stops replaying once a subscriber consumes the request', () => {
        vi.useFakeTimers();
        const seen: unknown[] = [];
        const off = subscribeDocViewerOpen(r => seen.push(r));
        requestDocViewerOpen({ fileId: 'x1', name: 'x.pdf' });
        vi.advanceTimersByTime(20_000);
        off();
        // One delivery, not six: further replays would ask an already-open viewer to reopen.
        expect(seen).toHaveLength(1);
        vi.useRealTimers();
    });

    it('keeps replaying while nobody is listening, so a late viewer still gets it', () => {
        vi.useFakeTimers();
        requestDocViewerOpen({ fileId: 'x2', name: 'y.pdf' });
        vi.advanceTimersByTime(1_000);
        const seen: unknown[] = [];
        const off = subscribeDocViewerOpen(r => seen.push(r));
        vi.advanceTimersByTime(20_000);
        off();
        expect(seen).toHaveLength(1);
        vi.useRealTimers();
    });
});
