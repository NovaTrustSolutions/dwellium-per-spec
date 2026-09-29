/**
 * P3 item 16e: doc/docx/odt/rtf preview via POST /api/docs/convert
 * (multipart `file` + `targetFormat: 'pdf-from-docx'`), rendered READ-ONLY:
 * Save Back disabled with a visible reason, a converted-preview banner, and
 * the existing LibreOffice-missing wording on a 503. Never PUTs converted
 * bytes over the original.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import DocViewer from '../components/DocViewer/DocViewer';

const FILE = { id: 'docx1', name: 'report.docx', type: 'docx' };
const ORIGINAL_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]); // fake .docx (zip) bytes
const PDF_FILE = { id: 'pdf1', name: 'real.pdf', type: 'pdf' };

function fakeCanvasContext() {
    return {
        clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), strokeRect: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
        save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), ellipse: vi.fn(),
        measureText: vi.fn(() => ({ width: 10 })), setTransform: vi.fn(), setLineDash: vi.fn(),
        fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', font: '', globalAlpha: 1,
    };
}

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    version: 'test',
    getDocument: (src: unknown) => {
        const data = (src as { data?: Uint8Array })?.data;
        if (data?.buffer) structuredClone(data.buffer, { transfer: [data.buffer] });
        return {
            promise: Promise.resolve({
                numPages: 1,
                destroy: () => {},
                getPage: async () => ({
                    getViewport: () => ({
                        width: 300, height: 300, scale: 1, rotation: 0,
                        convertToViewportPoint: (x: number, y: number) => [x, y],
                        convertToPdfPoint: (x: number, y: number) => [x, y],
                    }),
                    render: () => ({ promise: Promise.resolve() }),
                    getTextContent: async () => ({ items: [] }),
                }),
            }),
        };
    },
}));

async function makeConvertedPdfBytes(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    return doc.save();
}

async function makeRealPdfBytes(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    return doc.save();
}

function jsonResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
}

describe('DocViewer doc/docx/odt/rtf conversion preview (P3 16e)', () => {
    let convertCalls: Array<{ formData: FormData }>;
    let putCalls: number;
    let convertStatus: number;

    beforeEach(() => {
        convertCalls = [];
        putCalls = 0;
        convertStatus = 200;
        HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCanvasContext()) as never;
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method || 'GET';
            if (url.endsWith('/api/files') && method === 'GET') {
                return jsonResponse({ success: true, data: [FILE, PDF_FILE] });
            }
            if (url.endsWith(`/api/files/${PDF_FILE.id}`) && method === 'GET') {
                const bytes = await makeRealPdfBytes();
                return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as unknown as Response;
            }
            if (url.includes(`/api/files/${PDF_FILE.id}/annotations`)) {
                return { ok: false, status: 404, json: async () => ({ success: false, error: 'No draft' }) } as unknown as Response;
            }
            if (url.endsWith(`/api/files/${FILE.id}`) && method === 'GET') {
                return {
                    ok: true, status: 200,
                    arrayBuffer: async () => ORIGINAL_BYTES.buffer.slice(ORIGINAL_BYTES.byteOffset, ORIGINAL_BYTES.byteOffset + ORIGINAL_BYTES.byteLength),
                } as unknown as Response;
            }
            if (url.includes(`/api/files/${FILE.id}/annotations`)) {
                return { ok: false, status: 404, json: async () => ({ success: false, error: 'No draft' }) } as unknown as Response;
            }
            if (url.endsWith('/api/docs/convert') && method === 'POST') {
                convertCalls.push({ formData: init!.body as FormData });
                if (convertStatus === 503) {
                    return { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
                }
                const pdfBytes = await makeConvertedPdfBytes();
                return { ok: true, status: 200, arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) } as unknown as Response;
            }
            if (url.endsWith(`/api/files/${FILE.id}/content`) && method === 'PUT') {
                putCalls += 1;
                return jsonResponse({ success: true, data: { file: FILE, savedPath: null } });
            }
            throw new Error(`unexpected fetch: ${method} ${url}`);
        }));
        cleanup();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('POSTs the stored bytes to /api/docs/convert with targetFormat pdf-from-docx and renders the result', async () => {
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });

        await waitFor(() => expect(convertCalls).toHaveLength(1));
        const fd = convertCalls[0].formData;
        expect(fd.get('targetFormat')).toBe('pdf-from-docx');
        const uploaded = fd.get('file') as File;
        expect(uploaded.name).toBe(FILE.name);
        expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(ORIGINAL_BYTES);

        // The converted PDF actually rendered (page nav shows page 1 of 1).
        await waitFor(() => expect(screen.getByLabelText('Current page')).toBeInTheDocument());
    });

    it('shows a converted-preview banner and disables Save Back with a reason; the edit toolbar is hidden (read-only)', async () => {
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });

        await waitFor(() => expect(screen.getByText(/Converted preview/i)).toBeInTheDocument());
        expect(screen.getByText(/original\.docx file, which is unchanged|is unchanged/i)).toBeInTheDocument();

        const saveBtn = await screen.findByTitle(/Read-only — this is a converted preview/i);
        expect(saveBtn).toBeDisabled();

        // Read-only: no annotation toolbar for a converted preview.
        expect(screen.queryByTitle('Highlight')).toBeNull();
        expect(screen.queryByTitle('Select')).toBeNull();
    });

    it('clicking the disabled Save Back never PUTs converted bytes over the original', async () => {
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });
        const saveBtn = await screen.findByTitle(/Read-only — this is a converted preview/i);
        fireEvent.click(saveBtn); // disabled — must be a no-op
        expect(putCalls).toBe(0);
    });

    it('a 503 from the backend keeps the existing "requires LibreOffice" wording and never renders a PDF', async () => {
        convertStatus = 503;
        render(<DocViewer />);
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });

        await waitFor(() => expect(screen.getByText(/requires LibreOffice on the backend/i)).toBeInTheDocument());
        expect(screen.queryByLabelText('Current page')).toBeNull();
    });

    // ---- R2/R4 (adversarial review): the read-only guarantee for a
    // converted preview was only enforced at the EditToolbar UI layer — the
    // overlay canvas's pointer handlers stayed wired unconditionally, and
    // activeTool was never reset on file switch, so a tool selected on a
    // prior REAL pdf (e.g. 'draw') stayed active and could create new
    // annotations on a converted-preview document that is supposed to be
    // strictly read-only. ----
    it('a tool selected on a prior real PDF cannot place a new annotation after switching to a converted (read-only) preview', async () => {
        render(<DocViewer />);

        // Open the real PDF first and select the Draw tool.
        await screen.findByRole('option', { name: FILE.name });
        fireEvent.change(screen.getByRole('combobox'), { target: { value: PDF_FILE.id } });
        fireEvent.click(await screen.findByTitle('Freehand Draw'));
        expect(screen.getByTitle('Freehand Draw')).toHaveAttribute('aria-pressed', 'true');

        // Switch (no reload) to the docx file — loads as a converted,
        // read-only preview.
        fireEvent.change(screen.getByRole('combobox'), { target: { value: FILE.id } });
        await waitFor(() => expect(screen.getByText(/Converted preview/i)).toBeInTheDocument());
        // The edit toolbar (and its Draw button) is gone — but that alone
        // proves nothing about whether the OVERLAY still accepts pointer
        // input for whatever tool was active before the switch.
        expect(screen.queryByTitle('Freehand Draw')).toBeNull();

        // Drag on the overlay canvas exactly as a real Draw-tool stroke
        // would. If pointer input isn't gated, this commits a new
        // Annotation (which allocates an id via crypto.randomUUID()).
        const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID');
        const overlay = document.querySelector('.dv-overlay-canvas')!;
        fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10, pointerId: 9, pointerType: 'mouse' });
        fireEvent.pointerMove(overlay, { clientX: 60, clientY: 60, pointerId: 9, pointerType: 'mouse' });
        fireEvent.pointerUp(overlay, { clientX: 60, clientY: 60, pointerId: 9, pointerType: 'mouse' });

        expect(randomUUIDSpy).not.toHaveBeenCalled();
        randomUUIDSpy.mockRestore();
    });
});
