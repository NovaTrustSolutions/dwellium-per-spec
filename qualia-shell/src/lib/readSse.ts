/**
 * readSse — Server-Sent Events over `fetch` instead of `EventSource`.
 *
 * Why: `EventSource` cannot send headers, so it can never carry the session
 * Bearer token that every /api/* route now requires. `fetch` can (and the
 * global interceptor in installApiAuthFetch adds it), so we read the
 * `text/event-stream` body ourselves. Reconnects with backoff like EventSource
 * would; stop by aborting the returned controller.
 *
 * ponytail: minimal SSE parser — handles `event:` / `data:` / blank-line
 * dispatch and comments; ignores `id:` / `retry:` (add if a server ever uses them).
 */
export interface SseEvent {
    event: string;
    data: string;
}

export interface ReadSseOptions {
    onEvent: (e: SseEvent) => void;
    onError?: (err: unknown) => void;
    /** Reconnect delays in ms; the last value repeats. Default 1s→2s→5s→15s. */
    backoffMs?: number[];
    fetchImpl?: typeof fetch;
}

/** Parse one complete SSE block (lines between blank lines) into an event, or null. */
export function parseSseBlock(block: string): SseEvent | null {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const i = line.indexOf(':');
        const field = i === -1 ? line : line.slice(0, i);
        const value = i === -1 ? '' : line.slice(i + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
    }
    return data.length ? { event, data: data.join('\n') } : null;
}

/**
 * Pump one SSE body to completion, dispatching each complete event block.
 * Shared by readSse (backend event streams) and the LLM token streams.
 */
export async function pumpSseBody(body: ReadableStream<Uint8Array>, onEvent: (e: SseEvent) => void): Promise<void> {
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value.replace(/\r\n?/g, '\n');
        let sep: number;
        while ((sep = buf.indexOf('\n\n')) !== -1) {
            const ev = parseSseBlock(buf.slice(0, sep));
            buf = buf.slice(sep + 2);
            if (ev) onEvent(ev);
        }
    }
}

export function readSse(url: string, opts: ReadSseOptions): AbortController {
    const ctrl = new AbortController();
    const backoff = opts.backoffMs ?? [1_000, 2_000, 5_000, 15_000];
    const doFetch = opts.fetchImpl ?? fetch;

    (async () => {
        let attempt = 0;
        while (!ctrl.signal.aborted) {
            try {
                const res = await doFetch(url, { headers: { Accept: 'text/event-stream' }, signal: ctrl.signal });
                if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
                attempt = 0;
                await pumpSseBody(res.body, opts.onEvent);
            } catch (err) {
                if (ctrl.signal.aborted) return;
                opts.onError?.(err);
            }
            if (ctrl.signal.aborted) return;
            const delay = backoff[Math.min(attempt++, backoff.length - 1)];
            await new Promise<void>(r => {
                const t = setTimeout(r, delay);
                ctrl.signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
            });
        }
    })();

    return ctrl;
}
