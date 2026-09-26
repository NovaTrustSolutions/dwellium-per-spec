/**
 * llmUsageCapture — plan 068 W1 (defects A4/A5/A6/A8): real provider-reported
 * usage flows into recordLlmUsage instead of the chars/4 estimate, retry
 * billing is folded/accounted for, and streaming records exactly once even
 * when the consumer bails early. Spies on recordLlmUsage the same way
 * src/test/llmStream.test.ts does — this suite does NOT touch the store's
 * own persistence/pricing internals (F1's territory).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callLlm, testProvider, type LlmRequest } from '../lib/llmClient';
import { streamLlm } from '../lib/llmStream';
import * as usage from '../lib/llmUsageStore';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
        start(c) {
            for (const ch of chunks) c.enqueue(enc.encode(ch));
            c.close();
        },
    });
}

function sseResponse(chunks: string[], status = 200): Response {
    return new Response(streamOf(chunks), { status, headers: { 'Content-Type': 'text/event-stream' } });
}

/** A stream we control chunk-by-chunk, so we can deterministically stop mid-flight. */
function pendingStream(): { stream: ReadableStream<Uint8Array>; push: (s: string) => void } {
    const enc = new TextEncoder();
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });
    return { stream, push: (s: string) => ctrl.enqueue(enc.encode(s)) };
}

const anthropicLlm = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'k', model: 'claude-opus-5' } } as any;
const openaiLlm = { active: 'openai', openai: { enabled: true, apiKey: 'k', model: 'gpt-5' } } as any;
const geminiLlm = { active: 'gemini', gemini: { enabled: true, apiKey: 'k', model: 'gemini-2.5-pro' } } as any;

describe('llmClient usage capture (A4/A5/A8)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        vi.restoreAllMocks();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        usage.llmUsageUserIdHolder.current = null;
    });
    afterEach(() => vi.unstubAllGlobals());

    it('anthropic: parses real input/output/cache usage into recordLlmUsage', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock.mockResolvedValue(jsonResponse({
            content: [{ type: 'text', text: 'Hello' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 12, output_tokens: 6, cache_read_input_tokens: 3, cache_creation_input_tokens: 1 },
        }));
        await callLlm({ prompt: 'hi' }, anthropicLlm);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            usage: { inputTokens: 12, outputTokens: 6, cacheReadTokens: 3, cacheWriteTokens: 1 },
        }));
    });

    it('openai: subtracts cached_tokens from prompt_tokens into cacheReadTokens', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock.mockResolvedValue(jsonResponse({
            choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 40 } },
        }));
        await callLlm({ prompt: 'hi' }, openaiLlm);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            usage: { inputTokens: 60, outputTokens: 10, cacheReadTokens: 40 },
        }));
    });

    it('gemini: bills thinking tokens as output and reports cachedContentTokenCount', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock.mockResolvedValue(jsonResponse({
            candidates: [{ content: { parts: [{ text: 'Sunny' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, thoughtsTokenCount: 15, cachedContentTokenCount: 4 },
        }));
        await callLlm({ prompt: 'hi' }, geminiLlm);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            usage: { inputTokens: 20, outputTokens: 20, cacheReadTokens: 4 },
        }));
    });

    it('missing/garbage usage fields never produce NaN — usage is left undefined', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock.mockResolvedValue(jsonResponse({
            choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 'not-a-number', completion_tokens: 10 },
        }));
        await callLlm({ prompt: 'hi' }, openaiLlm);
        const call = spy.mock.calls[0][0];
        expect(call.usage).toBeUndefined();
        expect(Number.isNaN(call.promptChars)).toBe(false);
    });

    it('A5 retry: both billed attempts reported usage → summed, not just the last', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                content: [{ type: 'thinking', thinking: '...' }],
                stop_reason: 'max_tokens',
                usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 },
            }))
            .mockResolvedValueOnce(jsonResponse({
                content: [{ type: 'text', text: 'Hello' }],
                stop_reason: 'end_turn',
                usage: { input_tokens: 10, output_tokens: 20 },
            }));
        await callLlm({ prompt: 'hi' }, anthropicLlm);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            usage: { inputTokens: 20, outputTokens: 25, cacheReadTokens: 2, cacheWriteTokens: 1 },
        }));
    });

    it('A5 retry: either attempt missing usage → usage undefined AND promptChars fallback counts the prompt twice', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'max_tokens' })) // no usage at all
            .mockResolvedValueOnce(jsonResponse({ content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 2 } }));
        const req: LlmRequest = { prompt: 'test prompt' }; // 11 chars
        await callLlm(req, anthropicLlm);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const call = spy.mock.calls[0][0];
        expect(call.usage).toBeUndefined();
        expect(call.promptChars).toBe(22); // 11 * 2 billed attempts
    });

    it('C4: captures userId BEFORE the provider await — a mid-call holder switch does not relabel the entry', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        usage.llmUsageUserIdHolder.current = 'andy';
        let resolveFetch!: (v: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { resolveFetch = r; }));
        const promise = callLlm({ prompt: 'hi' }, anthropicLlm);
        // Simulate a logout/account switch while the request is still in flight.
        usage.llmUsageUserIdHolder.current = 'lisa';
        resolveFetch(jsonResponse({ content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
        await promise;
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ userId: 'andy' }));
    });

    it("testProvider tags its ping with source 'test'", async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock.mockResolvedValue(jsonResponse({
            content: [{ type: 'text', text: 'ok' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
        }));
        const result = await testProvider('anthropic', anthropicLlm);
        expect(result.ok).toBe(true);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ source: 'test' }));
    });
});

describe('llmStream usage capture (A6)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        vi.restoreAllMocks();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        usage.llmUsageUserIdHolder.current = null;
    });
    afterEach(() => vi.unstubAllGlobals());

    it('anthropic SSE: input usage from message_start + output usage from message_delta are merged', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock.mockResolvedValue(sseResponse([
            'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":8,"cache_read_input_tokens":2}}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n',
        ]));
        const gen = streamLlm({ prompt: 'hi' }, anthropicLlm);
        let r = await gen.next();
        while (!r.done) r = await gen.next();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({
            usage: { inputTokens: 8, outputTokens: 3, cacheReadTokens: 2 },
        }));
    });

    it('openai stream_options requests a final usage chunk (only for provider "openai")', async () => {
        fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']));
        const gen = streamLlm({ prompt: 'hi' }, openaiLlm);
        let r = await gen.next();
        while (!r.done) r = await gen.next();
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.stream_options).toEqual({ include_usage: true });
    });

    it('consumer breaks after the first chunk → exactly one record, with partial text and no usage', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        const { stream, push } = pendingStream();
        fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));
        const gen = streamLlm({ prompt: 'hi' }, openaiLlm);
        push('data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n');
        const first = await gen.next();
        if (first.done) throw new Error('expected a delta event, got done');
        expect(first.value.delta).toBe('Hi');
        await gen.return(null);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ responseChars: 2, usage: undefined }));
    });

    it('budget-stop fallback: the billed streamed attempt AND callLlm\'s retry are both recorded', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock.mockResolvedValue(sseResponse([
            'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"…"}}\n\n',
            'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n',
        ]));
        // The delegated callLlm call hits fetch again; make it succeed cheaply.
        fetchMock.mockResolvedValueOnce(sseResponse([
            'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"…"}}\n\n',
            'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n',
        ])).mockResolvedValueOnce(jsonResponse({ content: [{ type: 'text', text: 'Recovered' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
        const gen = streamLlm({ prompt: 'hi' }, anthropicLlm);
        let r = await gen.next();
        while (!r.done) r = await gen.next();
        expect(r.value).toBe('Recovered');
        // Two billed provider calls → two records: the streamed attempt (its thinking
        // tokens were billed) from streamLlm's finally, and callLlm's own.
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('a request the provider rejected (HTTP 429) is not recorded as spend', async () => {
        const spy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
        const gen = streamLlm({ prompt: 'hi' }, openaiLlm);
        await expect(gen.next()).rejects.toThrow();
        expect(spy).not.toHaveBeenCalled();
    });
});
