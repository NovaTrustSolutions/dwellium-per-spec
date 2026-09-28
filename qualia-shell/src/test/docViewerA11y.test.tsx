/**
 * P2b — accessibility fixes on the live component (module contract:
 * DOCVIEWER_FIX_PLAN.md item 13 + the audit's accessibility findings).
 * Pins: signature dialog semantics/focus-trap-entry/Escape/focus-return,
 * page-thumbnail keyboard activation, aria-pressed reflecting the active
 * tool, the inline text field's commit/cancel (replacing window.prompt),
 * and the toast's always-mounted role="status" live region.
 */
import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DocViewer from '../components/DocViewer/DocViewer';

const FILE = { id: 'a11y1', name: 'a11y.pdf', type: 'pdf' };

function fakeCanvasContext() {
    return {
        clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), strokeRect: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
        save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), ellipse: vi.fn(),
        measureText: vi.fn(() => ({ width: 10 })),
        setTransform: vi.fn(),
        fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', font: '', globalAlpha: 1,
    };
}

let overlayCtx: ReturnType<typeof fakeCanvasContext>;

// Two pages, so the thumbnail rail has more than one real thumbnail to
// navigate between (item 2 / audit: real, keyboard-activatable thumbnails).
vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: () => ({
        promise: Promise.resolve({
            numPages: 2,
            destroy: () => {},
            getPage: async () => ({
                getViewport: () => ({
                    width: 300, height: 300, scale: 1.5, rotation: 0,
                    convertToViewportPoint: (x: number, y: number) => [x, y],
                    convertToPdfPoint: (x: number, y: number) => [x, y],
                }),
                render: () => ({ promise: Promise.resolve() }),
                getTextContent: async () => ({ items: [] }),
            }),
        }),
    }),
}));

describe('DocViewer accessibility (P2 item 13)', () => {
    beforeEach(() => {
        overlayCtx = fakeCanvasContext();
        const baseCtx = fakeCanvasContext();
        HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
            return this.classList.contains('dv-overlay-canvas') ? overlayCtx : baseCtx;
        }) as never;
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return { ok: true, status: 200, json: async () => ({ success: true, data: [FILE] }) } as unknown as Response;
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as unknown as Response;
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        }));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    async function openFile() {
        render(<DocViewer />);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });
    }

    it('signature dialog: role=dialog + aria-modal + labelled, focus moves in on open, Escape closes, focus returns to Sign', async () => {
        await openFile();
        const signBtn = await screen.findByTitle('Signature');
        signBtn.focus();
        expect(document.activeElement).toBe(signBtn);
        fireEvent.click(signBtn);

        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        const labelId = dialog.getAttribute('aria-labelledby');
        expect(labelId).toBeTruthy();
        expect(document.getElementById(labelId!)?.textContent).toMatch(/draw your signature/i);

        // Focus trap (useA11y's useFocusTrap) moves focus inside the dialog
        // on open — via requestAnimationFrame, so wait for it.
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

        // Escape closes it (fired on the focused element inside the dialog —
        // the SignatureModal listener is on `window`, capture phase).
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        // Focus returned to the Sign button (useFocusTrap's cleanup).
        expect(document.activeElement).toBe(signBtn);
    });

    it('page thumbnails are real, keyboard-activatable buttons with aria-current on the open page', async () => {
        await openFile();
        const thumb2 = await screen.findByRole('button', { name: 'Page 2' });
        const thumb1 = screen.getByRole('button', { name: 'Page 1' });

        expect(thumb1).toHaveAttribute('aria-current', 'true');
        expect(thumb2).not.toHaveAttribute('aria-current');

        thumb2.focus();
        fireEvent.click(thumb2); // jsdom doesn't synthesize Enter->click on buttons; verifies the same onGoToPage wiring Enter/Space use natively
        await waitFor(() => expect(thumb2).toHaveAttribute('aria-current', 'true'));
        expect(thumb1).not.toHaveAttribute('aria-current');
    });

    it('aria-pressed on the tool buttons reflects the active tool', async () => {
        await openFile();
        const selectBtn = await screen.findByTitle('Select');
        const highlightBtn = screen.getByTitle('Highlight');

        expect(selectBtn).toHaveAttribute('aria-pressed', 'true');
        expect(highlightBtn).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(highlightBtn);
        expect(highlightBtn).toHaveAttribute('aria-pressed', 'true');
        expect(selectBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('the text tool inline field commits an annotation on Enter and adds nothing on Escape', async () => {
        await openFile();
        fireEvent.click(await screen.findByTitle('Add Text'));
        const overlay = document.querySelector('.dv-overlay-canvas')!;

        // Escape: field disappears, nothing committed (no font ever set on
        // the overlay context — commit is the only path that draws).
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 1 });
        fireEvent.pointerUp(overlay, { clientX: 10, clientY: 10, pointerId: 1 });
        const cancelField = await screen.findByLabelText('New text annotation');
        fireEvent.change(cancelField, { target: { value: 'DROPPED' } });
        fireEvent.keyDown(cancelField, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByLabelText('New text annotation')).toBeNull());

        // Enter: commits — the field closes AND an Annotation actually gets
        // drawn (the overlay context's `font` is only ever set while
        // rendering a committed 'text' annotation — nothing else in this
        // test touches it).
        expect(overlayCtx.font).toBe('');
        fireEvent.pointerDown(overlay, { clientX: 20, clientY: 20, pointerId: 2 });
        fireEvent.pointerUp(overlay, { clientX: 20, clientY: 20, pointerId: 2 });
        const commitField = await screen.findByLabelText('New text annotation');
        fireEvent.change(commitField, { target: { value: 'KEPT' } });
        fireEvent.keyDown(commitField, { key: 'Enter' });
        await waitFor(() => expect(screen.queryByLabelText('New text annotation')).toBeNull());
        // Rendered font size is `fontSize * viewport.scale` (P1 item 6) —
        // default fontSize 16 * this mock's viewport.scale 1.5 = 24.
        await waitFor(() => expect(overlayCtx.font).toContain('24px'));
    });

    it('R1/R2: placing one text annotation under StrictMode adds exactly one, not two (addAnnotation must not run inside a setState updater)', async () => {
        // Unlike openFile()'s plain render(), this wraps in StrictMode —
        // React double-invokes a functional setState updater as a purity
        // check and discards only its RETURN value, not side effects
        // performed inside it. commitPendingTextInsert used to call the
        // side-effecting addAnnotation() (writes annotation state + pushes
        // undo history) from inside setPendingTextInsert's updater, so one
        // commit added the annotation twice under StrictMode.
        render(<StrictMode><DocViewer /></StrictMode>);
        fireEvent.change(await screen.findByRole('combobox'), { target: { value: FILE.id } });
        fireEvent.click(await screen.findByTitle('Add Text'));
        const overlay = document.querySelector('.dv-overlay-canvas')!;
        fireEvent.pointerDown(overlay, { clientX: 20, clientY: 20, pointerId: 1 });
        fireEvent.pointerUp(overlay, { clientX: 20, clientY: 20, pointerId: 1 });
        const field = await screen.findByLabelText('New text annotation');
        fireEvent.change(field, { target: { value: 'once' } });
        fireEvent.keyDown(field, { key: 'Enter' });
        await waitFor(() => expect(screen.queryByLabelText('New text annotation')).toBeNull());

        const undoBtn = await screen.findByTitle('Undo (Ctrl+Z)');
        await waitFor(() => expect(undoBtn).not.toBeDisabled());
        fireEvent.click(undoBtn);
        // Exactly one history entry was pushed — a single Undo click must
        // fully disable it. Before the fix this needed a second click
        // (confirmed live in-browser too: undoBtn.disabled stayed false
        // after one click on the pre-fix code, true after the fix).
        await waitFor(() => expect(undoBtn).toBeDisabled());
    });

    it('the toast live region is always mounted (role="status") and carries the toast text once one fires', async () => {
        await openFile();
        const liveRegion = document.querySelector('.doc-viewer [role="status"]');
        expect(liveRegion).not.toBeNull();
        expect(liveRegion!.textContent).toBe('');

        // "Edit Text" is the one tool button that calls showToast() with no
        // other side effects needed first.
        fireEvent.click(await screen.findByTitle('Edit Existing Text'));
        await waitFor(() => expect(liveRegion!.textContent).toMatch(/click on any text to edit it/i));
    });
});
