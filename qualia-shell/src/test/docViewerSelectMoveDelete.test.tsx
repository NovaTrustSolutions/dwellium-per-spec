/**
 * P3 item 16a: Select tool hit-tests the topmost annotation, drags it in PDF
 * space (undoable, one step per drag — not per pointermove), and
 * Delete/Backspace/Escape operate on the current selection. Drives the real
 * component (annotationModel.test.ts already pins the pure hit-test/
 * translate math on its own).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, renderHook, act } from '@testing-library/react';
import DocViewer from '../components/DocViewer/DocViewer';
import { useAnnotationPointerTool } from '../components/DocViewer/useAnnotationPointerTool';
import type { Annotation } from '../components/DocViewer/docViewerTypes';
import type { PointerEvent as ReactPointerEvent } from 'react';

const FILE = { id: 'sel1', name: 'select-me.pdf', type: 'pdf' };

function fakeCanvasContext() {
    return {
        clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), strokeRect: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
        save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), ellipse: vi.fn(),
        measureText: vi.fn(() => ({ width: 10 })),
        setTransform: vi.fn(), setLineDash: vi.fn(),
        fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', font: '', globalAlpha: 1,
    };
}

// Identity viewport (viewport-space === PDF-space) so test-authored screen
// coordinates are directly the annotation's PDF-space geometry too.
vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: () => ({
        promise: Promise.resolve({
            numPages: 2,
            destroy: () => {},
            getPage: async () => ({
                getViewport: () => ({
                    width: 300, height: 300, scale: 1,
                    convertToViewportPoint: (x: number, y: number) => [x, y],
                    convertToPdfPoint: (x: number, y: number) => [x, y],
                }),
                render: () => ({ promise: Promise.resolve() }),
                getTextContent: async () => ({ items: [] }),
            }),
        }),
    }),
}));

function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
}

async function openFileAndDrawHighlight(container: HTMLElement) {
    await screen.findByRole('option', { name: FILE.name });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });
    fireEvent.click(await screen.findByTitle('Highlight'));
    const overlay = container.querySelector('.dv-overlay-canvas')!;
    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(overlay, { clientX: 60, clientY: 60, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(overlay, { clientX: 60, clientY: 60, pointerId: 1, pointerType: 'mouse' });
    await waitFor(async () => expect(await screen.findByTitle('Undo (Ctrl+Z)')).not.toBeDisabled());
    fireEvent.click(await screen.findByTitle('Select'));
    return overlay;
}

describe('DocViewer Select tool — move/delete a placed annotation (P3 16a)', () => {
    beforeEach(() => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [FILE] });
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as unknown as Response;
            }
            if (url.includes(`/api/files/${FILE.id}/annotations`)) {
                return { ok: false, status: 404, json: async () => ({ success: false, error: 'No draft' }) } as unknown as Response;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        }));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('dragging a placed highlight moves it, in ONE undo step', async () => {
        const { container } = render(<DocViewer />);
        const overlay = await openFileAndDrawHighlight(container);

        // Undo/redo: the earlier highlight-draw is the current top of the
        // undo stack. After a drag we expect exactly ONE more undo step
        // (the move), not one per pointermove.
        fireEvent.pointerDown(overlay, { clientX: 30, clientY: 30, pointerId: 2, pointerType: 'mouse' });
        fireEvent.pointerMove(overlay, { clientX: 45, clientY: 45, pointerId: 2, pointerType: 'mouse' }); // crosses drag threshold
        fireEvent.pointerMove(overlay, { clientX: 55, clientY: 60, pointerId: 2, pointerType: 'mouse' }); // further move, same step
        fireEvent.pointerUp(overlay, { clientX: 55, clientY: 60, pointerId: 2, pointerType: 'mouse' });

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        expect(undoBtn).not.toBeDisabled();
        // Undo once -> back to right after the draw (drag reverted, not yet
        // the draw itself) -> undo is STILL enabled (the draw step remains).
        fireEvent.click(undoBtn);
        await waitFor(() => expect(undoBtn).not.toBeDisabled());
        // Undo again -> back to nothing -> now disabled. Two total undo
        // steps existed (draw, then move) — proves the drag pushed exactly one.
        fireEvent.click(undoBtn);
        await waitFor(() => expect(undoBtn).toBeDisabled());
    });

    it('a plain click (no movement) selects without pushing an undo step', async () => {
        const { container } = render(<DocViewer />);
        const overlay = await openFileAndDrawHighlight(container);

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        // One undo step exists (the draw). A click-only select must not add another.
        fireEvent.pointerDown(overlay, { clientX: 30, clientY: 30, pointerId: 3, pointerType: 'mouse' });
        fireEvent.pointerUp(overlay, { clientX: 30, clientY: 30, pointerId: 3, pointerType: 'mouse' });

        fireEvent.click(undoBtn);
        await waitFor(() => expect(undoBtn).toBeDisabled());
    });

    it('Delete removes the selected annotation (undoable) and Escape deselects without deleting', async () => {
        const { container } = render(<DocViewer />);
        const overlay = await openFileAndDrawHighlight(container);
        const root = container.querySelector('.doc-viewer')!;

        // Select it.
        fireEvent.pointerDown(overlay, { clientX: 30, clientY: 30, pointerId: 4, pointerType: 'mouse' });
        fireEvent.pointerUp(overlay, { clientX: 30, clientY: 30, pointerId: 4, pointerType: 'mouse' });

        // Escape deselects — pressing Delete right after must be a no-op
        // (nothing selected), so the annotation should still be undoable
        // to remove via the normal draw-undo, i.e. Undo still enabled and
        // clicking it once fully clears history.
        fireEvent.keyDown(root, { key: 'Escape' });
        fireEvent.keyDown(root, { key: 'Delete' });

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        expect(undoBtn).not.toBeDisabled(); // the draw step is still there — Delete after Escape did nothing
        fireEvent.click(undoBtn);
        await waitFor(() => expect(undoBtn).toBeDisabled());
    });

    it('Delete with an active selection removes it, and the removal is undoable', async () => {
        const { container } = render(<DocViewer />);
        const overlay = await openFileAndDrawHighlight(container);
        const root = container.querySelector('.doc-viewer')!;

        fireEvent.pointerDown(overlay, { clientX: 30, clientY: 30, pointerId: 5, pointerType: 'mouse' });
        fireEvent.pointerUp(overlay, { clientX: 30, clientY: 30, pointerId: 5, pointerType: 'mouse' });

        fireEvent.keyDown(root, { key: 'Delete' });

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        // Two undo steps now exist: draw, then delete.
        expect(undoBtn).not.toBeDisabled();
        fireEvent.click(undoBtn); // undoes the delete
        await waitFor(() => expect(undoBtn).not.toBeDisabled());
        fireEvent.click(undoBtn); // undoes the draw
        await waitFor(() => expect(undoBtn).toBeDisabled());
    });

    it('selection clears on page navigation — Delete after paging away and back is a no-op', async () => {
        const { container } = render(<DocViewer />);
        const overlay = await openFileAndDrawHighlight(container);
        const root = container.querySelector('.doc-viewer')!;

        // Select the highlight on page 1.
        fireEvent.pointerDown(overlay, { clientX: 30, clientY: 30, pointerId: 6, pointerType: 'mouse' });
        fireEvent.pointerUp(overlay, { clientX: 30, clientY: 30, pointerId: 6, pointerType: 'mouse' });

        // Page away and back — selection must clear (contract: "Selection
        // state clears on page change").
        fireEvent.click(await screen.findByLabelText('Next page'));
        await waitFor(() => expect((screen.getByLabelText('Current page') as HTMLInputElement).value).toBe('2'));
        fireEvent.click(await screen.findByLabelText('Previous page'));
        await waitFor(() => expect((screen.getByLabelText('Current page') as HTMLInputElement).value).toBe('1'));

        fireEvent.keyDown(root, { key: 'Delete' });

        // Only the original draw's undo step exists — Delete found nothing
        // selected and did nothing.
        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        expect(undoBtn).not.toBeDisabled();
        fireEvent.click(undoBtn);
        await waitFor(() => expect(undoBtn).toBeDisabled());
    });
});

// ---- R5 (adversarial review): Escape mid-drag must stop the drag itself,
// not just clear the (now-invisible) selection outline. Unit-tests the hook
// directly against a mock PointerEvent sequence — precise control over
// "the physical pointer is still down after Escape", which is awkward to
// drive through real DOM pointer events. ----
describe('useAnnotationPointerTool — cancelSelectDrag (R5)', () => {
    function identityViewport() {
        return {
            width: 300, height: 300, scale: 1, rotation: 0,
            convertToViewportPoint: (x: number, y: number): [number, number] => [x, y],
            convertToPdfPoint: (x: number, y: number): [number, number] => [x, y],
        };
    }

    function mkPointerEvent(x: number, y: number, pointerId = 1): ReactPointerEvent {
        return {
            pointerId, clientX: x, clientY: y,
            currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
        } as unknown as ReactPointerEvent;
    }

    it('a further pointermove after cancelSelectDrag does not keep moving the annotation', () => {
        const overlayEl = {
            releasePointerCapture: vi.fn(),
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
        } as unknown as HTMLCanvasElement;
        const ann: Annotation = { id: 'a1', type: 'highlight', page: 1, color: '#f00', opacity: 0.3, rect: { x: 0, y: 0, w: 10, h: 10 } };
        const onMoveAnnotation = vi.fn();
        const onBeginMove = vi.fn();

        const { result } = renderHook(() => useAnnotationPointerTool({
            overlayRef: { current: overlayEl },
            viewportRef: { current: identityViewport() },
            rootRef: { current: null },
            activeTool: 'select',
            currentPage: 1,
            drawColor: '#000', drawSize: 1, selectedShape: 'rectangle', selectedStamp: 'APPROVED',
            signatureStrokes: [],
            renderOverlay: () => {},
            addAnnotation: () => {},
            showToast: () => {},
            onNeedSignature: () => {},
            pageAnnotations: [ann],
            onSelectAnnotation: () => {},
            onBeginMove,
            onMoveAnnotation,
            onRequestTextInput: () => {},
        }));

        // Start a drag on the annotation and cross the drag threshold.
        act(() => result.current.handlePointerDown(mkPointerEvent(5, 5)));
        act(() => result.current.handlePointerMove(mkPointerEvent(20, 20)));
        expect(onBeginMove).toHaveBeenCalledTimes(1);
        expect(onMoveAnnotation).toHaveBeenCalledTimes(1);

        // Escape fires mid-drag (pointer physically still down).
        act(() => result.current.cancelSelectDrag());
        expect(overlayEl.releasePointerCapture).toHaveBeenCalledWith(1);

        // The pointer keeps moving — this must now be a no-op.
        act(() => result.current.handlePointerMove(mkPointerEvent(80, 80)));
        expect(onMoveAnnotation).toHaveBeenCalledTimes(1); // unchanged — no further move

        act(() => result.current.handlePointerUp(mkPointerEvent(80, 80)));
        expect(onMoveAnnotation).toHaveBeenCalledTimes(1); // pointerUp commits nothing new either
    });

    it('cancelSelectDrag is a no-op when no drag is in progress', () => {
        const overlayEl = { releasePointerCapture: vi.fn() } as unknown as HTMLCanvasElement;
        const { result } = renderHook(() => useAnnotationPointerTool({
            overlayRef: { current: overlayEl },
            viewportRef: { current: identityViewport() },
            rootRef: { current: null },
            activeTool: 'select',
            currentPage: 1,
            drawColor: '#000', drawSize: 1, selectedShape: 'rectangle', selectedStamp: 'APPROVED',
            signatureStrokes: [],
            renderOverlay: () => {},
            addAnnotation: () => {},
            showToast: () => {},
            onNeedSignature: () => {},
            pageAnnotations: [],
            onSelectAnnotation: () => {},
            onBeginMove: () => {},
            onMoveAnnotation: () => {},
            onRequestTextInput: () => {},
        }));
        expect(() => act(() => result.current.cancelSelectDrag())).not.toThrow();
        expect(overlayEl.releasePointerCapture).not.toHaveBeenCalled();
    });
});
