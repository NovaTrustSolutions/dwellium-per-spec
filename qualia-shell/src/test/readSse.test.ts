import { describe, it, expect, vi } from 'vitest';
import { parseSseBlock, pumpSseBody, readSse } from '../lib/readSse';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
        start(c) {
            for (const ch of chunks) c.enqueue(enc.encode(ch));
            c.close();
        },
    });
}

describe('parseSseBlock', () => {
    it('reads event + multi-line data, ignores comments, defaults event to message', () => {
        expect(parseSseBlock('event: inbox:new\ndata: {"id":1}')).toEqual({ event: 'inbox:new', data: '{"id":1}' });
        expect(parseSseBlock(': keep-alive\ndata: a\ndata: b')).toEqual({ event: 'message', data: 'a\nb' });
        expect(parseSseBlock(': only a comment')).toBeNull();
    });
});

describe('pumpSseBody', () => {
    it('splits events across chunks and normalises CRLF', async () => {
        const seen: Array<{ event: string; data: string }> = [];
        await pumpSseBody(streamOf(['event: a\r\nda', 'ta: 1\r\n\r\ndata: {"x":', '2}\n\n']), e => seen.push(e));
        expect(seen).toEqual([{ event: 'a', data: '1' }, { event: 'message', data: '{"x":2}' }]);
    });
});

describe('readSse', () => {
    it('dispatches events split across chunks and sends Accept: text/event-stream', async () => {
        const seen: string[] = [];
        const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            expect(new Headers(init?.headers).get('Accept')).toBe('text/event-stream');
            return new Response(streamOf(['event: inbox:new\nda', 'ta: 1\n\nevent: inbox:status-change\ndata: 2\n\n']), {
                status: 200, headers: { 'Content-Type': 'text/event-stream' },
            });
        }) as unknown as typeof fetch;
        const ctrl = readSse('/api/inbox/stream', { onEvent: e => seen.push(e.event), fetchImpl, backoffMs: [10] });
        // Stream ends → readSse reconnects and the mock replays; assert the first pass.
        await vi.waitFor(() => expect(seen.slice(0, 2)).toEqual(['inbox:new', 'inbox:status-change']));
        ctrl.abort();
    });

    it('reconnects after an error and stops on abort', async () => {
        let calls = 0;
        const errors: unknown[] = [];
        const fetchImpl = vi.fn(async () => {
            calls++;
            return new Response('nope', { status: 401 });
        }) as unknown as typeof fetch;
        const ctrl = readSse('/api/inbox/stream', { onEvent: () => {}, onError: e => errors.push(e), fetchImpl, backoffMs: [5] });
        await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
        ctrl.abort();
        const after = calls;
        await new Promise(r => setTimeout(r, 30));
        expect(calls).toBe(after);
        expect(errors.length).toBeGreaterThanOrEqual(1);
    });
});
