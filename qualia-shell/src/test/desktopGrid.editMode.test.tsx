/**
 * Layout grid only in edit mode — spec §2.8 / HARD RULE.
 *
 * The widget layout grid (snap margin boundary lines) must be invisible in
 * normal use and appear ONLY while the user is actively editing the layout
 * (dragging/resizing a window). LayoutContext.isInteracting is the gate; Window
 * flips it on drag/resize start and clears it on mouseup.
 */
import { render, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { SnapOverlay } from '../components/Shell/Desktop';
import { LayoutProvider, useLayout } from '../context/LayoutContext';

function EditToggle() {
    const { setInteracting } = useLayout();
    return (
        <>
            <button onClick={() => setInteracting(true)}>start-edit</button>
            <button onClick={() => setInteracting(false)}>end-edit</button>
        </>
    );
}

function renderOverlay() {
    return render(
        <LayoutProvider>
            <EditToggle />
            <SnapOverlay />
        </LayoutProvider>,
    );
}

afterEach(() => cleanup());

describe('Layout grid visibility is gated on edit mode', () => {
    it('renders no snap margin/grid lines in normal use (not interacting)', () => {
        const { container } = renderOverlay();
        expect(container.querySelectorAll('.snap-margin-line').length).toBe(0);
    });

    it('shows margin/grid lines only while actively editing the layout', () => {
        const { container, getByText } = renderOverlay();
        expect(container.querySelectorAll('.snap-margin-line').length).toBe(0);

        fireEvent.click(getByText('start-edit'));
        // 4 boundary lines (top/bottom/left/right) appear in edit mode.
        expect(container.querySelectorAll('.snap-margin-line').length).toBe(4);

        fireEvent.click(getByText('end-edit'));
        expect(container.querySelectorAll('.snap-margin-line').length).toBe(0);
    });
});
