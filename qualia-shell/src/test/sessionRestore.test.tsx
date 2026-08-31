/**
 * Plan 055 phase 1 — session restore ("the desktop remembers").
 *
 * Covers: persist→reload→restore round-trips for the Classic desktop,
 * Holocron OS tabs, and Fluid/Cockpit tabs; default-stack-only-when-empty;
 * Andy ≠ Lisa isolation; corrupt payload → clean fallback; removed-widget
 * componentIds dropped; beforeunload / visibilitychange flush; and the
 * WindowProvider component-level restore with exact geometry.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    sessionRestoreStore,
    captureSession,
    flushSession,
    readSessionSnapshot,
    projectWindows,
    restoreClassicWindows,
    restoreOsTabs,
    normalizeSnapshot,
    type SessionSnapshot,
    type WindowProjection,
} from '../lib/sessionRestoreStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { shouldOpenDefaultStack } from '../components/Shell/defaultStack';
import { UserProvider } from '../context/UserContext';
import { LayoutProvider } from '../context/LayoutContext';
import { WindowProvider, useWindows, dockItemsStore, savedLayoutsStore } from '../context/WindowContext';
import type { WindowState } from '../data/types';

// No network side effects from the One Save write-through machinery.
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(null),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

const GUEST_KEY = 'dwellium_session_restore_guest';

const proj = (over: Partial<WindowProjection> = {}): WindowProjection => ({
    component: 'notepad',
    title: 'Notepad',
    icon: 'file-text',
    x: 120,
    y: 80,
    width: 640,
    height: 480,
    zIndex: 7,
    minimized: false,
    groupId: null,
    ...over,
});

const snap = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
    version: 1,
    classic: [],
    halocron: { tabs: [], active: null },
    fluid: { tabs: [], active: null },
    savedAt: 123,
    ...over,
});

beforeEach(() => {
    // Scrub any capture pending from a prior test (owner guard drops it),
    // then reset storage + cache + identity.
    setPerUserIdentity('__scrub__');
    flushSession();
    localStorage.clear();
    sessionRestoreStore.reset();
    dockItemsStore.reset();
    savedLayoutsStore.reset();
    setPerUserIdentity(null);
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('sessionRestoreStore — capture/flush round-trips', () => {
    it('classic slice round-trips with geometry, z-order, minimized, group deep-equal', () => {
        const windows: WindowState[] = [
            { id: 'a', title: 'Notepad', icon: 'file-text', x: 120, y: 80, width: 640, height: 480, zIndex: 7, minimized: false, maximized: false, component: 'notepad', groupId: 'g1' },
            { id: 'b', title: 'ARA', icon: 'brain-circuit', x: 400, y: 12, width: 1080, height: 760, zIndex: 9, minimized: true, maximized: false, component: 'ara-console', groupId: null },
        ];
        captureSession({ classic: projectWindows(windows) });
        flushSession();

        // "Reload": clear the in-memory cache so the next read comes from disk.
        sessionRestoreStore.reset();
        const restoredSnap = readSessionSnapshot();
        expect(restoredSnap).not.toBeNull();
        const restored = restoreClassicWindows(restoredSnap!);

        expect(restored.map(({ component, x, y, width, height, zIndex, minimized, groupId, title, icon }) =>
            ({ component, x, y, width, height, zIndex, minimized, groupId, title, icon }))).toEqual([
            { component: 'notepad', x: 120, y: 80, width: 640, height: 480, zIndex: 7, minimized: false, groupId: 'g1', title: 'Notepad', icon: 'file-text' },
            { component: 'ara-console', x: 400, y: 12, width: 1080, height: 760, zIndex: 9, minimized: true, groupId: null, title: 'ARA', icon: 'brain-circuit' },
        ]);
    });

    it('halocron and fluid slices round-trip (tabs + active) and merge with classic', () => {
        captureSession({ classic: [proj()] });
        captureSession({ halocron: { tabs: ['notepad', 'ara-console'], active: 'ara-console' } });
        captureSession({ fluid: { tabs: ['scribe'], active: 'scribe' } });
        flushSession();

        sessionRestoreStore.reset();
        const s = readSessionSnapshot();
        expect(s?.classic).toHaveLength(1);
        expect(restoreOsTabs(s!.halocron)).toEqual({ tabs: ['notepad', 'ara-console'], active: 'ara-console' });
        expect(restoreOsTabs(s!.fluid)).toEqual({ tabs: ['scribe'], active: 'scribe' });
    });

    it('capture is debounced ~800ms; flush is immediate', () => {
        vi.useFakeTimers();
        captureSession({ classic: [proj()] });
        expect(localStorage.getItem(GUEST_KEY)).toBeNull();
        vi.advanceTimersByTime(799);
        expect(localStorage.getItem(GUEST_KEY)).toBeNull();
        vi.advanceTimersByTime(1);
        expect(localStorage.getItem(GUEST_KEY)).not.toBeNull();
    });

    it('beforeunload flushes the pending capture synchronously', () => {
        captureSession({ classic: [proj()] });
        expect(localStorage.getItem(GUEST_KEY)).toBeNull();
        window.dispatchEvent(new Event('beforeunload'));
        expect(JSON.parse(localStorage.getItem(GUEST_KEY)!).classic).toHaveLength(1);
    });

    it('visibilitychange → hidden flushes the pending capture (close-the-window case)', () => {
        captureSession({ fluid: { tabs: ['notepad'], active: 'notepad' } });
        expect(localStorage.getItem(GUEST_KEY)).toBeNull();
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        expect(JSON.parse(localStorage.getItem(GUEST_KEY)!).fluid.tabs).toEqual(['notepad']);
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
});

describe('sessionRestoreStore — per-user isolation (Andy ≠ Lisa)', () => {
    it('each user restores only their own session', () => {
        setPerUserIdentity('andy');
        captureSession({ classic: [proj({ component: 'notepad' })] });
        flushSession();

        setPerUserIdentity('lisa');
        sessionRestoreStore.reset();
        expect(readSessionSnapshot()).toBeNull(); // Lisa has nothing
        captureSession({ classic: [proj({ component: 'ara-console', title: 'ARA' })] });
        flushSession();

        setPerUserIdentity('andy');
        sessionRestoreStore.reset();
        expect(readSessionSnapshot()?.classic[0].component).toBe('notepad');

        setPerUserIdentity('lisa');
        sessionRestoreStore.reset();
        expect(readSessionSnapshot()?.classic[0].component).toBe('ara-console');
    });

    it('a capture pending when the account switches is DROPPED, never written to the new user', () => {
        setPerUserIdentity('andy');
        captureSession({ classic: [proj()] });
        setPerUserIdentity('lisa'); // switch mid-debounce
        flushSession();
        expect(localStorage.getItem('dwellium_session_restore_andy')).toBeNull();
        expect(localStorage.getItem('dwellium_session_restore_lisa')).toBeNull();
    });
});

describe('sessionRestoreStore — hardened deserializer + widget validation', () => {
    it('corrupt JSON payload → null snapshot (default-stack path)', () => {
        localStorage.setItem(GUEST_KEY, '{not json!!');
        sessionRestoreStore.reset();
        expect(readSessionSnapshot()).toBeNull();
    });

    it('wrong-shape payload → null; bad rows dropped from an otherwise valid snapshot', () => {
        localStorage.setItem(GUEST_KEY, JSON.stringify({ version: 99, classic: 'nope' }));
        sessionRestoreStore.reset();
        expect(readSessionSnapshot()).toBeNull();

        expect(normalizeSnapshot({ version: 1, classic: [proj(), { component: 'x' }, 42] })?.classic).toHaveLength(1);
    });

    it('removed/unknown componentIds are dropped silently with a console.warn, never crash', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
        const s = snap({
            classic: [proj(), proj({ component: 'widget-deleted-in-2027' })],
            halocron: { tabs: ['notepad', 'gone-widget'], active: 'gone-widget' },
        });
        expect(restoreClassicWindows(s).map((w) => w.component)).toEqual(['notepad']);
        expect(restoreOsTabs(s.halocron)).toEqual({ tabs: ['notepad'], active: null });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('widget-deleted-in-2027'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('gone-widget'));
    });

    it('restore clamps y ≥ 0 (titlebar-rescue rule) and never restores maximized', () => {
        const [w] = restoreClassicWindows(snap({ classic: [proj({ y: -50 })] }));
        expect(w.y).toBe(0);
        expect(w.maximized).toBe(false);
    });
});

describe('default stack — only when there is nothing to restore', () => {
    it('suppressed when a persisted session exists, even an empty desktop', () => {
        expect(shouldOpenDefaultStack(null, 0, true)).toBe(false);
    });
    it('unchanged legacy behavior when no session exists (2-arg callers stay valid)', () => {
        expect(shouldOpenDefaultStack(null, 0)).toBe(true);
        expect(shouldOpenDefaultStack('done', 0)).toBe(false);
        expect(shouldOpenDefaultStack(null, 2)).toBe(false);
    });
});

describe('WindowProvider — component-level restore', () => {
    function Probe() {
        const { windows } = useWindows();
        return (
            <div data-testid="windows">
                {JSON.stringify(windows.map(({ component, x, y, width, height, zIndex, minimized, groupId }) =>
                    ({ component, x, y, width, height, zIndex, minimized, groupId })))}
            </div>
        );
    }

    const mount = () => render(
        <UserProvider>
            <LayoutProvider>
                <WindowProvider>
                    <Probe />
                </WindowProvider>
            </LayoutProvider>
        </UserProvider>,
    );

    it('restores the exact persisted windows on mount (geometry deep-equal)', () => {
        localStorage.setItem(GUEST_KEY, JSON.stringify(snap({
            classic: [
                proj({ component: 'notepad', x: 33, y: 44, width: 555, height: 444, zIndex: 3, minimized: true, groupId: 'stack-1' }),
                proj({ component: 'ara-console', x: 700, y: 0, width: 900, height: 700, zIndex: 5 }),
            ],
        })));
        sessionRestoreStore.reset();
        mount();
        expect(JSON.parse(screen.getByTestId('windows').textContent!)).toEqual([
            { component: 'notepad', x: 33, y: 44, width: 555, height: 444, zIndex: 3, minimized: true, groupId: 'stack-1' },
            { component: 'ara-console', x: 700, y: 0, width: 900, height: 700, zIndex: 5, minimized: false, groupId: null },
        ]);
    });

    it('fresh user (no snapshot) mounts with an empty canvas — default-stack path intact', () => {
        mount();
        expect(JSON.parse(screen.getByTestId('windows').textContent!)).toEqual([]);
    });
});
