import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchFileNames, searchRemote } from '../components/ContentSearch/remoteSearch';

function jsonRes(body: unknown, ok = true, status = ok ? 200 : 500): Response {
    return {
        ok,
        status,
        json: async () => body,
    } as Response;
}

describe('contentSearch remote (Phase 3 D1/D2)', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    describe('fetchFileNames', () => {
        it('maps id -> name on success', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
                jsonRes({ success: true, data: [{ id: 'f1', name: 'Report.pdf' }, { id: 'f2', name: 'Notes.docx' }] }),
            ));
            const names = await fetchFileNames();
            expect(names.get('f1')).toBe('Report.pdf');
            expect(names.get('f2')).toBe('Notes.docx');
        });

        it('returns empty map on failure', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
            const names = await fetchFileNames();
            expect(names.size).toBe(0);
        });

        it('returns empty map on !ok', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ success: true, data: [] }, false)));
            const names = await fetchFileNames();
            expect(names.size).toBe(0);
        });
    });

    describe('searchRemote', () => {
        it('short query does not fetch', async () => {
            const fetchMock = vi.fn();
            vi.stubGlobal('fetch', fetchMock);
            const result = await searchRemote('a', new Map());
            expect(result).toEqual({ hits: [], failed: false });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('both succeed: notes first, then chunks deduped by max similarity, name fallback', async () => {
            const names = new Map([['file-1', 'Doc One.pdf']]);
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(jsonRes({ success: true, data: [{ id: 'n1', title: 'My Note', content: 'hello world' }] }))
                .mockResolvedValueOnce(jsonRes({
                    success: true,
                    data: [
                        { fileId: 'file-1', text: 'low match', similarity: 0.2 },
                        { fileId: 'file-1', text: 'high match text', similarity: 0.9 },
                        { fileId: 'file-2', text: 'other doc', similarity: 0.5 },
                    ],
                }));
            vi.stubGlobal('fetch', fetchMock);

            const result = await searchRemote('hello', names);

            expect(result.failed).toBe(false);
            expect(result.hits).toHaveLength(3);
            expect(result.hits[0]).toMatchObject({ id: 'note-n1', type: 'note', title: 'My Note', widget: 'notepad', ref: 'n1' });
            expect(result.hits[1]).toMatchObject({ id: 'chunk-file-1', title: 'Doc One.pdf', body: 'high match text' });
            expect(result.hits[2]).toMatchObject({ id: 'chunk-file-2', title: 'Document' });
        });

        it('notes 500 -> failed true but chunks still returned', async () => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(jsonRes({ success: false }, false, 500))
                .mockResolvedValueOnce(jsonRes({ success: true, data: [{ fileId: 'f1', text: 'chunk text', similarity: 0.7 }] }));
            vi.stubGlobal('fetch', fetchMock);

            const result = await searchRemote('query text', new Map());

            expect(result.failed).toBe(true);
            expect(result.hits).toHaveLength(1);
            expect(result.hits[0].id).toBe('chunk-f1');
        });

        it('network reject on one request -> failed true', async () => {
            const fetchMock = vi.fn()
                .mockRejectedValueOnce(new Error('boom'))
                .mockResolvedValueOnce(jsonRes({ success: true, data: [] }));
            vi.stubGlobal('fetch', fetchMock);

            const result = await searchRemote('query', new Map());

            expect(result.failed).toBe(true);
            expect(result.hits).toEqual([]);
        });

        it('malformed rows are skipped', async () => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(jsonRes({ success: true, data: [{ id: null, title: 123 }, { id: 'ok', title: 'Fine', content: 'body' }] }))
                .mockResolvedValueOnce(jsonRes({ success: true, data: [{ fileId: 123, text: 'x', similarity: 1 }, { text: 'no file id' }] }));
            vi.stubGlobal('fetch', fetchMock);

            const result = await searchRemote('query', new Map());

            expect(result.failed).toBe(false);
            expect(result.hits).toHaveLength(1);
            expect(result.hits[0]).toMatchObject({ id: 'note-ok', title: 'Fine' });
        });

        it('aborted signal returns empty without throwing', async () => {
            const controller = new AbortController();
            controller.abort();
            const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            vi.stubGlobal('fetch', fetchMock);

            const result = await searchRemote('query', new Map(), controller.signal);

            expect(result).toEqual({ hits: [], failed: false });
        });
    });
});
