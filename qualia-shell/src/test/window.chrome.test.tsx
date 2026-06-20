/**
 * Window chrome — no persistent "Drag outside window to pop out" banner.
 *
 * HARD RULE 3.5 / spec §2.7b: window chrome must stay ≤15–20% of height and
 * there must be NO persistent full-width "Drag outside window to pop out" text
 * row. The pop-out affordance is a title-bar icon button + tooltip, and the
 * tear-off gesture survives as a compact pinned grip (icon + tooltip only),
 * showing its progress readout transiently *while dragging*.
 */
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Window, {
    classicFocusFrameStyle,
    isPersistentFocusWindow,
} from '../components/Window/Window';
import { UserProvider } from '../context/UserContext';
import { LayoutProvider } from '../context/LayoutContext';
import { WindowProvider, dockItemsStore, savedLayoutsStore } from '../context/WindowContext';
import { backendStatusStore } from '../lib/backendStatusStore';
import type { WindowState } from '../data/types';

const baseState: WindowState = {
    id: 'w1',
    title: 'Test Widget',
    icon: 'box',
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    zIndex: 1,
    minimized: false,
    maximized: false,
    component: 'notepad',
    regionId: null,
};

function renderWindow(state: WindowState = baseState) {
    return render(
        <UserProvider>
            <LayoutProvider>
                <WindowProvider>
                    <Window state={state}>
                        <div>widget body</div>
                    </Window>
                </WindowProvider>
            </LayoutProvider>
        </UserProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    dockItemsStore.reset();
    savedLayoutsStore.reset();
    backendStatusStore.reset();
});

afterEach(() => cleanup());

describe('Window chrome — no persistent pop-out banner', () => {
    it('does not render any persistent "Drag outside window to pop out" text row', () => {
        renderWindow();
        expect(screen.queryByText(/drag outside window to pop out/i)).toBeNull();
        expect(screen.queryByText(/pull further to pop out/i)).toBeNull();
        expect(screen.queryByText(/release to pop out/i)).toBeNull();
    });

    it('renders the tear-off as a compact handle with a tooltip and no idle text', () => {
        const { container } = renderWindow();
        const handle = container.querySelector('.window__tearoff-handle');
        expect(handle).not.toBeNull();
        // Tooltip carries the affordance instead of a persistent label.
        expect(handle?.getAttribute('title') ?? '').toMatch(/drag outside the window/i);
        // Idle state shows only the grip icon (an <svg>), no text label.
        expect(handle?.textContent?.trim()).toBe('');
        expect(handle?.querySelector('svg')).not.toBeNull();
    });

    it('keeps an always-visible title-bar "Pop out" icon button', () => {
        renderWindow();
        const popout = screen.getByTitle('Pop out');
        expect(popout.tagName).toBe('BUTTON');
    });

    it('hides the tear-off handle entirely when the window is maximized', () => {
        const { container } = renderWindow({ ...baseState, maximized: true });
        expect(container.querySelector('.window__tearoff-handle')).toBeNull();
    });

    it('keeps classic focus persistent on the top window even when DOM focus moves away', () => {
        const windows = [
            { ...baseState, id: 'behind', zIndex: 1 },
            { ...baseState, id: 'front', zIndex: 9 },
        ];

        expect(isPersistentFocusWindow(windows, windows[1])).toBe(true);
        expect(isPersistentFocusWindow(windows, windows[0])).toBe(false);
    });

    it('uses a readable focus frame for a single maximized classic window', () => {
        const singleMaximized = { ...baseState, maximized: true, zIndex: 4 };
        const style = classicFocusFrameStyle([singleMaximized], singleMaximized, {
            isRegionSnapped: false,
            isFocused: true,
        });

        expect(style).toMatchObject({
            left: 'max(0px, calc((100% - 1440px) / 2))',
            width: 'min(100%, 1440px)',
            height: 'calc(100% - 24px)',
        });
        expect(classicFocusFrameStyle(
            [singleMaximized, { ...baseState, id: 'second', zIndex: 5 }],
            singleMaximized,
            { isRegionSnapped: false, isFocused: true },
        )).toBeNull();
    });
});
