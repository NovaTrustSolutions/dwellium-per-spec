/** Plan 076 P4 P0 — tree-changed event + multipart upload contract. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdir, uploadFiles, FILE_TREE_CHANGED } from '../components/FileExplorer/fileExplorerApi';

const reply = (status: number, body: object) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('fileExplorerApi P4', () => {
    afterEach(() => vi.restoreAllMocks());

    it('announces a successful mutation, and stays quiet on a failed one', async () => {
        const heard = vi.fn();
        window.addEventListener(FILE_TREE_CHANGED, heard);
        const f = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => reply(200, { success: true }));
        await mkdir('A');
        expect(heard).toHaveBeenCalledTimes(1);
        f.mockImplementationOnce(() => reply(409, { success: false, code: 'DEST_EXISTS', error: 'x' }));
        await expect(mkdir('A')).rejects.toMatchObject({ status: 409, code: 'DEST_EXISTS' });
        expect(heard).toHaveBeenCalledTimes(1);
        window.removeEventListener(FILE_TREE_CHANGED, heard);
    });

    it('uploads as multipart with no JSON content-type and returns per-file results', async () => {
        const f = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => reply(200, { success: true, results: [{ name: 'a.png', path: 'D/a.png', status: 'ok' }] }));
        const out = await uploadFiles([new File([new Uint8Array([0, 1, 2])], 'a.png', { type: 'image/png' })], 'D');
        const init = f.mock.calls[0][1] as RequestInit;
        expect(init.body).toBeInstanceOf(FormData);
        expect(Object.keys(init.headers as object).map((k) => k.toLowerCase())).not.toContain('content-type');
        expect((init.body as FormData).get('dest')).toBe('D');
        expect(out).toEqual([{ name: 'a.png', path: 'D/a.png', status: 'ok' }]);
    });
});
