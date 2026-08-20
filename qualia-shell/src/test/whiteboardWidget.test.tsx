/**
 * Whiteboard widget — plan 047 phase 1 smoke suite (Excalidraw mocked; the
 * real canvas is not jsdom-safe). Covers: registry + dock + Tools hub wiring,
 * self-hosted asset path, theme prop mapping, initialData hydration from the
 * per-user store, and the debounced onChange → localStorage persist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

// jsdom-safe Excalidraw stub: records props, fires one onChange on mount.
const captured = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock('@excalidraw/excalidraw', async () => {
    const React = await import('react');
    return {
        Excalidraw: (props: Record<string, unknown> & { theme?: string; onChange?: (e: unknown[], s: unknown, f: unknown) => void }) => {
            captured.props.push(props);
            const { onChange } = props;
            React.useEffect(() => { onChange?.([{ id: 'e1' }], {}, {}); }, [onChange]);
            return React.createElement('div', { 'data-testid': 'excalidraw-stub', 'data-theme': props.theme });
        },
    };
});

import Whiteboard from '../components/Whiteboard/Whiteboard';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { defaultDockItems } from '../data/hierarchy';
import { TOOLS, resolveToolStatus } from '../data/toolsHub';
import { themeStore } from '../context/ThemeContext';
import { whiteboardStore, resetWhiteboard, EMPTY_SCENE, WHITEBOARD_SAVE_DEBOUNCE_MS } from '../lib/whiteboardStore';

// No UserProvider in these renders → usePerUserIdentity resolves _anonymous.
const KEY = 'whiteboard:_anonymous';

beforeEach(() => {
    localStorage.clear();
    captured.props.length = 0;
    resetWhiteboard();
    themeStore.reset();
});
afterEach(() => {
    vi.useRealTimers();
    themeStore.reset();
});

describe('registration (plan 047 step 3/4 + Tools hub flip)', () => {
    it('WIDGET_REGISTRY has a well-formed whiteboard entry', () => {
        const w = WIDGET_REGISTRY['whiteboard'];
        expect(w).toBeDefined();
        expect(w.label).toBe('Whiteboard');
        expect(w.category).toBe('tools');
        expect(w.icon).toBe('pen-tool');
        expect(w.minWidth).toBe(720);
        expect(w.minHeight).toBe(480);
        expect((w.component as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.lazy'));
    });
    it('docks under Property Management in hierarchy.ts', () => {
        const dock = defaultDockItems.find(d => d.component === 'whiteboard');
        expect(dock).toMatchObject({ id: 'dock-whiteboard', label: 'Whiteboard', group: 'Property Management', pinned: true });
    });
    it('Tools hub resolves whiteboard to ready off the live registry (no env gate)', () => {
        const tool = TOOLS.find(t => t.id === 'whiteboard')!;
        expect(resolveToolStatus(tool, id => !!WIDGET_REGISTRY[id], {})).toBe('ready');
    });
});

describe('render (Excalidraw mocked)', () => {
    it('mounts with dark theme (cosmos default), self-hosted assets and loadScene off', () => {
        render(<Whiteboard />);
        expect(screen.getByTestId('excalidraw-stub').getAttribute('data-theme')).toBe('dark');
        expect(window.EXCALIDRAW_ASSET_PATH).toBe('/excalidraw-fonts/');
        const props = captured.props[captured.props.length - 1];
        expect((props.UIOptions as { canvasActions: { loadScene: boolean } }).canvasActions.loadScene).toBe(false);
    });
    it('light picker themes map to Excalidraw theme="light"', () => {
        themeStore.set('latte', () => { /* in-memory only */ });
        render(<Whiteboard />);
        expect(screen.getByTestId('excalidraw-stub').getAttribute('data-theme')).toBe('light');
    });
    it('hydrates initialData from the per-user saved scene', () => {
        localStorage.setItem(KEY, JSON.stringify({ ...EMPTY_SCENE, elements: [{ id: 'saved' }] }));
        render(<Whiteboard />);
        const initial = captured.props[captured.props.length - 1].initialData as { elements: Array<{ id: string }> };
        expect(initial.elements).toEqual([{ id: 'saved' }]);
    });
    it('persists exactly one debounced write after onChange', () => {
        vi.useFakeTimers();
        let persists = 0; // one store notify per persist (localStorage is a jsdom Proxy — unspyable)
        const unsub = whiteboardStore.subscribe(() => { persists += 1; });
        const { unmount } = render(<Whiteboard />); // stub fires onChange once on mount
        expect(localStorage.getItem(KEY)).toBeNull(); // debounced, not yet
        act(() => { vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS); });
        expect(persists).toBe(1);
        expect(JSON.parse(localStorage.getItem(KEY)!).elements).toHaveLength(1);
        expect(whiteboardStore.getSnapshot().elements).toEqual([{ id: 'e1' }]);
        unmount();
        unsub();
    });
    it('unmount cancels a pending save (no write after close)', () => {
        vi.useFakeTimers();
        const { unmount } = render(<Whiteboard />);
        unmount(); // pending debounce dropped by the effect cleanup
        vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS * 2);
        expect(localStorage.getItem(KEY)).toBeNull();
    });
});
