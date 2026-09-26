/**
 * Owner-race guard: a PDF dropped into Scribe is read (File Explorer fetch, or file.arrayBuffer())
 * BEFORE it reaches openPdfBytesAsMarkdown. That function's own default capture would then record
 * whoever is signed in after the read, so handleDrop must hand in the owner captured at drop time.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorView } from '@codemirror/view';

const openPdfBytesAsMarkdown = vi.fn(async (..._args: unknown[]) => {});
vi.mock('../components/Scribe/pdfOpen', () => ({
    openPdfBytesAsMarkdown: (...args: unknown[]) => openPdfBytesAsMarkdown(...args),
    bytesFromBinaryString: () => new Uint8Array([1]),
}));

import { handleDrop } from '../components/Scribe/dropHandler';

const DWELLIUM_PATH_MIME = 'application/x-dwellium-path'; // dropHandler.ts (not exported)
import { setPerUserIdentity } from '../lib/perUserIdentity';

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const switchAccount = () => { setPerUserIdentity(null); setPerUserIdentity('user-b'); };
const ownerArg = () => openPdfBytesAsMarkdown.mock.calls[0]?.[2] as (() => boolean) | undefined;

function fileDrop(file: File) {
    return { dataTransfer: { getData: () => '', files: Object.assign([file], { length: 1 }) }, clientX: 0, clientY: 0 } as unknown as DragEvent;
}

describe('owner-race guard — PDF dropped into Scribe', () => {
    let view: EditorView;
    beforeEach(() => { setPerUserIdentity('user-a'); openPdfBytesAsMarkdown.mockClear(); view = new EditorView({ doc: '' }); });
    afterEach(() => { view.destroy(); setPerUserIdentity(null); vi.unstubAllGlobals(); });

    it('dropped PDF file: account switches while the bytes are read → the conversion is told the owner changed', async () => {
        const d = deferred<ArrayBuffer>();
        const file = new File(['%PDF'], 'lease.pdf', { type: 'application/pdf' });
        Object.defineProperty(file, 'arrayBuffer', { value: () => d.promise });
        const run = handleDrop(view, fileDrop(file));
        await tick();
        switchAccount();
        d.resolve(new ArrayBuffer(4));
        await run;
        expect(openPdfBytesAsMarkdown).toHaveBeenCalledTimes(1);
        expect(ownerArg()?.()).toBe(false);
    });

    it('File Explorer PDF: account switches during the fetch → the conversion is told the owner changed', async () => {
        const d = deferred<Response>();
        vi.stubGlobal('fetch', vi.fn(() => d.promise));
        const e = { dataTransfer: { getData: (t: string) => (t === DWELLIUM_PATH_MIME ? JSON.stringify({ name: 'lease.pdf', path: 'a/lease.pdf', tier: 'file' }) : ''), files: { length: 0 } }, clientX: 0, clientY: 0 } as unknown as DragEvent;
        const run = handleDrop(view, e);
        await tick();
        switchAccount();
        d.resolve({ ok: true, json: async () => ({ success: true, content: 'x' }) } as unknown as Response);
        await run;
        expect(ownerArg()?.()).toBe(false);
    });

    it('control: no switch → the conversion runs for the owner who dropped it', async () => {
        const file = new File(['%PDF'], 'lease.pdf', { type: 'application/pdf' });
        Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(4) });
        await handleDrop(view, fileDrop(file));
        expect(ownerArg()?.()).toBe(true);
    });
});
