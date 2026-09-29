/**
 * P3 item 16d: annotation drafts sidecar. Unit-tests the hook directly
 * (renderHook) against a mocked fetch — the GET-on-load/offer-restore-only-
 * on-base-match/debounced-autosave/DELETE-after-save/never-blocks-on-failure
 * contract from DOCVIEWER_FIX_PLAN.md.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnotationDrafts } from '../components/DocViewer/useAnnotationDrafts';
import type { AnnotationMap, Annotation } from '../components/DocViewer/docViewerTypes';

const API_FILES = 'http://x/api/files';

function ann(id: string, page = 1): Annotation {
    return { id, type: 'highlight', page, color: '#f00', opacity: 0.3, rect: { x: 0, y: 0, w: 10, h: 10 } };
}

function mapOf(entries: Array<[number, Annotation[]]>): AnnotationMap {
    return new Map(entries);
}

function jsonRes(status: number, body: unknown) {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe('useAnnotationDrafts (P3 16d)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('offers restore when the draft GET base matches the open file', async () => {
        const draftAnns = mapOf([[1, [ann('a')]]]);
        const fetchMock = vi.fn(async () => jsonRes(200, {
            success: true,
            data: { fileId: 'f1', annotations: Array.from(draftAnns.entries()), baseSize: 100, baseUpdatedAt: 't1', updatedBy: 'x', updatedAt: 't2' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() => useAnnotationDrafts({
            apiFilesBase: API_FILES, fileId: 'f1', baseSize: 100, baseUpdatedAt: 't1',
            annotations: new Map(), ready: true, showToast: vi.fn(),
        }));

        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.pendingRestore).not.toBeNull();
        expect(fetchMock).toHaveBeenCalledWith(`${API_FILES}/f1/annotations`);
        expect(result.current.pendingRestore!.get(1)![0].id).toBe('a');
    });

    it('does NOT offer restore when baseSize/baseUpdatedAt no longer match (never apply silently)', async () => {
        const fetchMock = vi.fn(async () => jsonRes(200, {
            success: true,
            data: { fileId: 'f1', annotations: [[1, [ann('a')]]], baseSize: 999, baseUpdatedAt: 't1', updatedBy: 'x', updatedAt: 't2' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() => useAnnotationDrafts({
            apiFilesBase: API_FILES, fileId: 'f1', baseSize: 100, baseUpdatedAt: 't1',
            annotations: new Map(), ready: true, showToast: vi.fn(),
        }));

        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.pendingRestore).toBeNull();
    });

    it('404 (no draft) offers nothing', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonRes(404, { success: false, error: 'No draft' })));
        const { result } = renderHook(() => useAnnotationDrafts({
            apiFilesBase: API_FILES, fileId: 'f1', baseSize: 100, baseUpdatedAt: 't1',
            annotations: new Map(), ready: true, showToast: vi.fn(),
        }));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.pendingRestore).toBeNull();
    });

    it('autosaves (debounced ~1.5s) while there is markup, serializing the Map', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonRes(404, { success: false, error: 'No draft' })));
        const { result, rerender } = renderHook(
            (props: { annotations: AnnotationMap }) => useAnnotationDrafts({
                apiFilesBase: API_FILES, fileId: 'f1', baseSize: 100, baseUpdatedAt: 't1',
                annotations: props.annotations, ready: true, showToast: vi.fn(),
            }),
            { initialProps: { annotations: new Map() } },
        );
        await act(async () => { await Promise.resolve(); });

        const withMarkup = mapOf([[1, [ann('a')]]]);
        const putCalls: RequestInit[] = [];
        (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_url: string, init?: RequestInit) => {
            if (init?.method === 'PUT') { putCalls.push(init); return jsonRes(200, { success: true, data: {} }); }
            return jsonRes(404, { success: false, error: 'No draft' });
        });

        rerender({ annotations: withMarkup });
        // Not yet — debounce hasn't elapsed.
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(putCalls).toHaveLength(0);

        await act(async () => { await vi.advanceTimersByTimeAsync(600); });
        expect(putCalls).toHaveLength(1);
        const body = JSON.parse(putCalls[0].body as string);
        expect(body.annotations).toEqual([[1, [ann('a')]]]);
        expect(body.baseSize).toBe(100);
        expect(body.baseUpdatedAt).toBe('t1');
        void result;
    });

    it('clearAfterSave DELETEs the draft and never throws on failure', async () => {
        const deleteMock = vi.fn(async () => { throw new Error('network down'); });
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === 'DELETE') return deleteMock();
            return jsonRes(404, { success: false, error: 'No draft' });
        }));
        const showToast = vi.fn();
        const { result } = renderHook(() => useAnnotationDrafts({
            apiFilesBase: API_FILES, fileId: 'f1', baseSize: 100, baseUpdatedAt: 't1',
            annotations: new Map(), ready: true, showToast,
        }));

        await expect(result.current.clearAfterSave()).resolves.toBeUndefined();
        expect(deleteMock).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/could not be cleared/i));
    });

    it('R1/R3: does not recreate the draft immediately after a successful Save Back with the same annotations', async () => {
        // Simulates DocViewer.tsx's saveDocumentToQualia: Save Back re-bakes
        // the file (new baseSize/baseUpdatedAt via setSelectedFile) in the
        // same tick clearAfterSave() DELETEs the draft — `annotations`
        // itself is untouched (the user keeps editing), so without the fix
        // the autosave effect below sees its deps change and immediately
        // re-PUTs the exact content that was just saved+deleted.
        const putCalls: RequestInit[] = [];
        const deleteCalls: number[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === 'PUT') { putCalls.push(init); return jsonRes(200, { success: true, data: {} }); }
            if (init?.method === 'DELETE') { deleteCalls.push(1); return jsonRes(200, { success: true }); }
            return jsonRes(404, { success: false, error: 'No draft' });
        }));

        const withMarkup = mapOf([[1, [ann('a')]]]);
        type Props = { baseSize: number; baseUpdatedAt: string; annotations: AnnotationMap };
        const { result, rerender } = renderHook(
            (props: Props) => useAnnotationDrafts({
                apiFilesBase: API_FILES, fileId: 'f1', baseSize: props.baseSize, baseUpdatedAt: props.baseUpdatedAt,
                annotations: props.annotations, ready: true, showToast: vi.fn(),
            }),
            { initialProps: { baseSize: 100, baseUpdatedAt: 't1', annotations: withMarkup } },
        );
        await act(async () => { await Promise.resolve(); }); // initial GET settles

        // First autosave fires normally.
        await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
        expect(putCalls).toHaveLength(1);

        // Save Back: clearAfterSave DELETEs, then the file's base changes
        // (re-baked PDF has a new size/updatedAt) — same tick, same
        // unchanged `annotations`.
        await act(async () => { await result.current.clearAfterSave(); });
        expect(deleteCalls).toHaveLength(1);
        rerender({ baseSize: 150, baseUpdatedAt: 't2', annotations: withMarkup });

        // The autosave effect re-fires (baseSize/baseUpdatedAt changed) —
        // it must NOT schedule another PUT for the same content.
        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
        expect(putCalls).toHaveLength(1); // still just the one from before the save

        // A genuinely NEW edit (different content) must resume autosaving —
        // the guard is per-content, not a permanent lockout.
        const withMoreMarkup = mapOf([[1, [ann('a'), ann('b')]]]);
        rerender({ baseSize: 150, baseUpdatedAt: 't2', annotations: withMoreMarkup });
        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
        expect(putCalls).toHaveLength(2);
    });

    it('discardDraft dismisses the offer locally even if the DELETE fails', async () => {
        const draftAnns = mapOf([[1, [ann('a')]]]);
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === 'DELETE') throw new Error('network down');
            return jsonRes(200, {
                success: true,
                data: { fileId: 'f1', annotations: Array.from(draftAnns.entries()), baseSize: 100, baseUpdatedAt: 't1' },
            });
        }));

        const { result } = renderHook(() => useAnnotationDrafts({
            apiFilesBase: API_FILES, fileId: 'f1', baseSize: 100, baseUpdatedAt: 't1',
            annotations: new Map(), ready: true, showToast: vi.fn(),
        }));
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(result.current.pendingRestore).not.toBeNull();

        act(() => result.current.discardDraft());
        expect(result.current.pendingRestore).toBeNull();
    });
});
