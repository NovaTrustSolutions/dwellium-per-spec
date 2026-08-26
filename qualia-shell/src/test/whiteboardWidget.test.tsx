/**
 * Whiteboard widget — plan 047 phase 1 + plan 053 (Excalidraw mocked; the real
 * canvas is not jsdom-safe). Covers: registry + dock + Tools hub wiring,
 * self-hosted asset path, theme prop mapping, per-board initialData hydration,
 * debounced onChange persist, unmount flush, boards list switching, library
 * seeding/persistence, import (.excalidraw/.excalidrawlib), PNG/SVG/JSON
 * export, notices, langCode and the honest collab states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

// jsdom-safe Excalidraw stub: records props, exposes a fake imperative api,
// fires one onChange on mount. Package utils are spies the tests assert on.
const captured = vi.hoisted(() => ({
    props: [] as Array<Record<string, unknown>>,
    api: {
        getSceneElements: vi.fn(() => [] as unknown[]),
        getAppState: vi.fn(() => ({ viewBackgroundColor: '#111' })),
        getFiles: vi.fn(() => ({})),
        updateScene: vi.fn(),
        addFiles: vi.fn(),
        updateLibrary: vi.fn().mockResolvedValue([]),
    },
    exportToBlob: vi.fn(async (_opts: Record<string, unknown>) => new Blob(['png'], { type: 'image/png' })),
    exportToSvg: vi.fn(async (_opts: Record<string, unknown>) => ({ outerHTML: '<svg xmlns="http://www.w3.org/2000/svg"/>' })),
    serializeAsJSON: vi.fn((..._args: unknown[]) => '{"type":"excalidraw"}'),
    loadSceneOrLibraryFromBlob: vi.fn(),
}));
vi.mock('@excalidraw/excalidraw', async () => {
    const React = await import('react');
    return {
        Excalidraw: (props: Record<string, unknown> & {
            theme?: string;
            excalidrawAPI?: (api: unknown) => void;
            onChange?: (e: unknown[], s: unknown, f: unknown) => void;
        }) => {
            captured.props.push(props);
            const { onChange, excalidrawAPI } = props;
            React.useEffect(() => { excalidrawAPI?.(captured.api); }, [excalidrawAPI]);
            React.useEffect(() => { onChange?.([{ id: 'e1' }], {}, {}); }, [onChange]);
            return React.createElement('div', { 'data-testid': 'excalidraw-stub', 'data-theme': props.theme });
        },
        MIME_TYPES: {
            excalidraw: 'application/vnd.excalidraw+json',
            excalidrawlib: 'application/vnd.excalidrawlib+json',
        },
        languages: [{ code: 'en' }, { code: 'de-DE' }, { code: 'es-ES' }],
        exportToBlob: captured.exportToBlob,
        exportToSvg: captured.exportToSvg,
        serializeAsJSON: captured.serializeAsJSON,
        loadSceneOrLibraryFromBlob: captured.loadSceneOrLibraryFromBlob,
        convertToExcalidrawElements: (skeletons: unknown[]) => skeletons,
        // Collab-path utilities (vendored client imports these from the package).
        getSceneVersion: (els: Array<{ version?: number }>) => els.reduce((acc, e) => acc + (e.version ?? 0), 0),
        restoreElements: (els: unknown[]) => els,
        reconcileElements: (_local: unknown[], remote: unknown[]) => remote,
        isInvisiblySmallElement: () => false,
        CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY', NEVER: 'NEVER', EVENTUALLY: 'EVENTUALLY' },
        UserIdleState: { ACTIVE: 'active', AWAY: 'away', IDLE: 'idle' },
    };
});
// The vendored collab client statically imports socket.io-client; no test in
// this file opens a session, but keep the transport inert regardless.
vi.mock('socket.io-client', () => ({ io: vi.fn() }));

import Whiteboard, { collabState, pickLangCode } from '../components/Whiteboard/Whiteboard';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { defaultDockItems } from '../data/hierarchy';
import { TOOLS, resolveToolStatus } from '../data/toolsHub';
import { themeStore } from '../context/ThemeContext';
import {
    whiteboardNoticeStore,
    getWhiteboardDoc,
    openBoard,
    resetWhiteboard,
    saveLibraryItems,
    EMPTY_DOC,
    EMPTY_SCENE,
    DEFAULT_BOARD_ID,
    WHITEBOARD_SAVE_DEBOUNCE_MS,
} from '../lib/whiteboardStore';
import { ANDY_LIBRARY_SPECS } from '../data/whiteboard/andyLibrary';

// No UserProvider in these renders → usePerUserIdentity resolves _anonymous.
const KEY = 'whiteboard:_anonymous';
const lastProps = () => captured.props[captured.props.length - 1];

beforeEach(() => {
    localStorage.clear();
    captured.props.length = 0;
    Object.values(captured.api).forEach((fn) => fn.mockClear());
    // Re-assert defaults: mockClear keeps return values, and an empty scene is
    // what makes import skip the "replace current board?" confirm.
    captured.api.getSceneElements.mockReturnValue([]);
    captured.api.getAppState.mockReturnValue({ viewBackgroundColor: '#111' });
    captured.api.getFiles.mockReturnValue({});
    captured.api.updateLibrary.mockResolvedValue([]);
    captured.exportToBlob.mockClear();
    captured.exportToSvg.mockClear();
    captured.serializeAsJSON.mockClear();
    captured.loadSceneOrLibraryFromBlob.mockReset();
    resetWhiteboard();
    themeStore.reset();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
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
        const props = lastProps();
        expect((props.UIOptions as { canvasActions: { loadScene: boolean } }).canvasActions.loadScene).toBe(false);
    });
    it('light picker themes map to Excalidraw theme="light"', () => {
        themeStore.set('latte', () => { /* in-memory only */ });
        render(<Whiteboard />);
        expect(screen.getByTestId('excalidraw-stub').getAttribute('data-theme')).toBe('light');
    });
    it('hydrates initialData from the active board of the saved doc', () => {
        localStorage.setItem(KEY, JSON.stringify({
            ...EMPTY_DOC,
            boards: { [DEFAULT_BOARD_ID]: { id: DEFAULT_BOARD_ID, title: 'My whiteboard', scene: { ...EMPTY_SCENE, elements: [{ id: 'saved' }] }, updatedAt: 1 } },
        }));
        render(<Whiteboard />);
        const initial = lastProps().initialData as { elements: Array<{ id: string }> };
        expect(initial.elements).toEqual([{ id: 'saved' }]);
    });
    it('still hydrates a plan-047 legacy single-scene payload (migration)', () => {
        localStorage.setItem(KEY, JSON.stringify({ ...EMPTY_SCENE, elements: [{ id: 'legacy' }] }));
        render(<Whiteboard />);
        const initial = lastProps().initialData as { elements: Array<{ id: string }> };
        expect(initial.elements).toEqual([{ id: 'legacy' }]);
    });
    it('persists exactly one debounced write into the active board after onChange', () => {
        vi.useFakeTimers();
        const { unmount } = render(<Whiteboard />); // stub fires onChange once on mount
        expect(localStorage.getItem(KEY)).toBeNull(); // debounced, not yet
        act(() => { vi.advanceTimersByTime(WHITEBOARD_SAVE_DEBOUNCE_MS); });
        const doc = JSON.parse(localStorage.getItem(KEY)!);
        expect(doc.boards[DEFAULT_BOARD_ID].scene.elements).toEqual([{ id: 'e1' }]);
        expect(getWhiteboardDoc().boards[DEFAULT_BOARD_ID].scene.elements).toEqual([{ id: 'e1' }]);
        unmount();
    });
    it('unmount FLUSHES a pending save — closing the widget loses no strokes', () => {
        vi.useFakeTimers();
        const { unmount } = render(<Whiteboard />);
        expect(localStorage.getItem(KEY)).toBeNull();
        unmount(); // pending debounce flushed by the effect cleanup
        const doc = JSON.parse(localStorage.getItem(KEY)!);
        expect(doc.boards[DEFAULT_BOARD_ID].scene.elements).toEqual([{ id: 'e1' }]);
    });
    it('wires langCode from the browser locale against the package language list', () => {
        render(<Whiteboard />);
        // jsdom navigator.language is 'en-US' → base-match 'en'.
        expect(lastProps().langCode).toBe('en');
    });
});

describe('boards list (plan 053 #5)', () => {
    it('lists boards (default first) and switches the canvas to the picked board', () => {
        openBoard('strata:maintenance:wo-9', 'WO: Broken window');
        openBoard(DEFAULT_BOARD_ID, 'My whiteboard');
        render(<Whiteboard />);
        const select = screen.getByLabelText('Board') as HTMLSelectElement;
        expect(Array.from(select.options).map(o => o.textContent)).toEqual(['My whiteboard', 'WO: Broken window']);
        act(() => { fireEvent.change(select, { target: { value: 'strata:maintenance:wo-9' } }); });
        expect(getWhiteboardDoc().activeBoardId).toBe('strata:maintenance:wo-9');
        // Excalidraw remounts (key change) with the picked board's scene.
        const initial = lastProps().initialData as { elements: unknown[] };
        expect(initial.elements).toEqual([]);
        expect(select.value).toBe('strata:maintenance:wo-9');
    });
});

describe('shape library (plan 053 #1 + #4)', () => {
    it('seeds the Andy library on first-ever open (libraryItems undefined)', () => {
        render(<Whiteboard />);
        const initial = lastProps().initialData as { libraryItems: Array<{ id: string }> };
        expect(initial.libraryItems.map(i => i.id)).toEqual(ANDY_LIBRARY_SPECS.map(s => s.id));
    });
    it('does NOT re-seed once the library was persisted (even as [])', () => {
        saveLibraryItems([]);
        render(<Whiteboard />);
        const initial = lastProps().initialData as { libraryItems: unknown[] };
        expect(initial.libraryItems).toEqual([]);
    });
    it('onLibraryChange persists the library through the store', () => {
        render(<Whiteboard />);
        const onLibraryChange = lastProps().onLibraryChange as (items: unknown[]) => void;
        act(() => { onLibraryChange([{ id: 'user-item', status: 'unpublished' }]); });
        expect(getWhiteboardDoc().libraryItems).toEqual([{ id: 'user-item', status: 'unpublished' }]);
    });
    it('"Dwellium shapes" button re-adds the Andy library via updateLibrary(merge)', () => {
        render(<Whiteboard />);
        fireEvent.click(screen.getByText('Dwellium shapes'));
        expect(captured.api.updateLibrary).toHaveBeenCalledTimes(1);
        const arg = captured.api.updateLibrary.mock.calls[0][0] as { libraryItems: Array<{ id: string }>; merge: boolean };
        expect(arg.merge).toBe(true);
        expect(arg.libraryItems.map(i => i.id)).toEqual(ANDY_LIBRARY_SPECS.map(s => s.id));
    });
});

describe('import/export (plan 053 #3)', () => {
    it('Save as PNG exports the live scene via exportToBlob and downloads it', async () => {
        captured.api.getSceneElements.mockReturnValue([{ id: 'el' }]);
        render(<Whiteboard />);
        fireEvent.click(screen.getByText('Save as PNG'));
        await waitFor(() => expect(captured.exportToBlob).toHaveBeenCalledTimes(1));
        expect(captured.exportToBlob.mock.calls[0][0]).toMatchObject({ elements: [{ id: 'el' }], mimeType: 'image/png' });
        expect(URL.createObjectURL).toHaveBeenCalled();
    });
    it('SVG and .excalidraw exports call exportToSvg / serializeAsJSON', async () => {
        render(<Whiteboard />);
        fireEvent.click(screen.getByText('SVG'));
        await waitFor(() => expect(captured.exportToSvg).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByText('.excalidraw'));
        await waitFor(() => expect(captured.serializeAsJSON).toHaveBeenCalledTimes(1));
        expect(captured.serializeAsJSON.mock.calls[0][3]).toBe('local');
    });
    it('importing a .excalidraw file replaces the scene and persists it', async () => {
        captured.loadSceneOrLibraryFromBlob.mockResolvedValue({
            type: 'application/vnd.excalidraw+json',
            data: { elements: [{ id: 'imp' }], appState: { viewBackgroundColor: '#abc' }, files: { f1: { id: 'f1' } } },
        });
        render(<Whiteboard />);
        const input = screen.getByLabelText('Import whiteboard file') as HTMLInputElement;
        const file = new File(['{}'], 'plan.excalidraw', { type: 'application/json' });
        await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
        await waitFor(() => expect(captured.api.updateScene).toHaveBeenCalled());
        expect(captured.api.updateScene.mock.calls[0][0]).toMatchObject({ elements: [{ id: 'imp' }] });
        expect(captured.api.addFiles).toHaveBeenCalledWith([{ id: 'f1' }]);
    });
    it('importing a .excalidrawlib merges it into the library', async () => {
        captured.loadSceneOrLibraryFromBlob.mockResolvedValue({
            type: 'application/vnd.excalidrawlib+json',
            data: { libraryItems: [{ id: 'lib-imp' }] },
        });
        render(<Whiteboard />);
        const input = screen.getByLabelText('Import whiteboard file') as HTMLInputElement;
        const file = new File(['{}'], 'shapes.excalidrawlib', { type: 'application/json' });
        await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
        await waitFor(() => expect(captured.api.updateLibrary).toHaveBeenCalled());
        expect(captured.api.updateLibrary.mock.calls[0][0]).toMatchObject({ libraryItems: [{ id: 'lib-imp' }], merge: true });
    });
    it('drag-dropping a .excalidraw file routes into the import path', async () => {
        captured.loadSceneOrLibraryFromBlob.mockResolvedValue({
            type: 'application/vnd.excalidraw+json',
            data: { elements: [], appState: {}, files: {} },
        });
        const { container } = render(<Whiteboard />);
        const file = new File(['{}'], 'drop.excalidraw', { type: 'application/json' });
        await act(async () => {
            fireEvent.drop(container.firstElementChild!, { dataTransfer: { files: [file] } });
        });
        await waitFor(() => expect(captured.loadSceneOrLibraryFromBlob).toHaveBeenCalledTimes(1));
    });
    it('a broken import file surfaces a visible notice — never silent', async () => {
        captured.loadSceneOrLibraryFromBlob.mockRejectedValue(new Error('bad file'));
        render(<Whiteboard />);
        const input = screen.getByLabelText('Import whiteboard file') as HTMLInputElement;
        const file = new File(['nope'], 'broken.excalidraw', { type: 'application/json' });
        await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Could not import/));
    });
});

describe('notices (plan 053 #2)', () => {
    it('renders a dismissible banner when the store pushes a notice', () => {
        render(<Whiteboard />);
        act(() => { whiteboardNoticeStore.push('downscaled', '2 images downscaled to 2048px…'); });
        expect(screen.getByRole('status').textContent).toContain('2 images downscaled');
        fireEvent.click(screen.getByLabelText('Dismiss notice'));
        expect(screen.queryByRole('status')).toBeNull();
    });
});

describe('collab (vendored room client — env-gated states)', () => {
    it('collabState() parses the env var', () => {
        expect(collabState(undefined)).toEqual({ configured: false, url: null });
        expect(collabState('   ')).toEqual({ configured: false, url: null });
        expect(collabState('wss://room.example')).toEqual({ configured: true, url: 'wss://room.example' });
    });
    it('unconfigured: the Live collab panel names the env var + runbook (honest state)', () => {
        render(<Whiteboard />);
        fireEvent.click(screen.getByText('Live collab'));
        const note = screen.getByRole('note');
        expect(note.textContent).toContain('Collab server not configured');
        expect(note.textContent).toContain('VITE_EXCALIDRAW_COLLAB_URL');
        expect(note.textContent).toContain('tools/excalidraw-room/');
    });
    it('configured: offers Start session and Join with link (no session yet)', () => {
        vi.stubEnv('VITE_EXCALIDRAW_COLLAB_URL', 'wss://room.dwellium.example');
        render(<Whiteboard />);
        fireEvent.click(screen.getByText('Live collab'));
        expect(screen.getByText('Start session')).toBeDefined();
        expect(screen.getByLabelText('Join with link')).toBeDefined();
        expect(screen.getByText('Join')).toBeDefined();
    });
});

describe('pickLangCode (gap E8)', () => {
    it('exact, base and no-match behavior', () => {
        const langs = [{ code: 'en' }, { code: 'de-DE' }, { code: 'es-ES' }];
        expect(pickLangCode('de-DE', langs)).toBe('de-DE');
        expect(pickLangCode('de', langs)).toBe('de-DE');
        expect(pickLangCode('es-MX', langs)).toBe('es-ES');
        expect(pickLangCode('fr-FR', langs)).toBeUndefined();
        expect(pickLangCode(undefined, langs)).toBeUndefined();
    });
});
