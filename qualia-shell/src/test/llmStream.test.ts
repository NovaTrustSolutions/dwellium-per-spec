/**
 * llmStream + araPrefsStore — assessment sweep 2026-06-12 (C8 foundation,
 * upgrade #6/#10); real per-provider SSE landed plan 046-A3 (streamTokens
 * default ON since the same branch).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    streamLlm,
    STREAMING_AVAILABLE,
    parseAnthropicStreamData,
    parseOpenAiStreamData,
    parseGeminiStreamData,
} from '../lib/llmStream';
import { araPrefsStore, DEFAULT_ARA_PREFS } from '../lib/araPrefsStore';
import * as llmClient from '../lib/llmClient';
import * as aiHealth from '../lib/aiHealthStore';
import * as usage from '../lib/llmUsageStore';

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

async function collect(gen: AsyncGenerator<{ delta: string; text: string; done: boolean }, string | null, void>) {
    const events: Array<{ delta: string; text: string; done: boolean }> = [];
    let r = await gen.next();
    while (!r.done) { events.push(r.value); r = await gen.next(); }
    return { events, ret: r.value };
}

const anthropicLlm = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'k', model: 'claude-opus-5' } } as any;
const openaiLlm = { active: 'openai', openai: { enabled: true, apiKey: 'k', model: 'gpt-5' } } as any;
const geminiLlm = { active: 'gemini', gemini: { enabled: true, apiKey: 'k', model: 'gemini-2.5-pro' } } as any;

describe('streamLlm (real SSE, 046-A3)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        vi.restoreAllMocks();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('advertises streaming as available', () => {
        expect(STREAMING_AVAILABLE).toBe(true);
    });

    it('returns null when no provider is configured (no fetch)', async () => {
        const { ret, events } = await collect(streamLlm({ prompt: 'hi' }, { active: null } as any));
        expect(ret).toBeNull();
        expect(events).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('anthropic: yields text deltas (skips thinking), final event carries the full text; meters usage', async () => {
        const okSpy = vi.spyOn(aiHealth, 'recordAiSuccess');
        const usageSpy = vi.spyOn(usage, 'recordLlmUsage');
        fetchMock.mockResolvedValue(sseResponse([
            'event: message_start\ndata: {"type":"message_start"}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","del', // split mid-line
            'ta":{"type":"text_delta","text":"lo"}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        ]));
        const { events, ret } = await collect(streamLlm({ prompt: 'hi', maxTokens: 1024 }, anthropicLlm));
        expect(events.map(e => e.delta)).toEqual(['Hel', 'lo', '']);
        expect(events[events.length - 1]).toEqual({ delta: '', text: 'Hello', done: true });
        expect(ret).toBe('Hello');
        // Body built by the shared builder: stream:true, NO temperature for Opus 5.
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.stream).toBe(true);
        expect(body).not.toHaveProperty('temperature');
        expect(body.max_tokens).toBe(1024);
        expect(okSpy).toHaveBeenCalledTimes(1);
        expect(usageSpy).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', model: 'claude-opus-5', responseChars: 5 }));
    });

    it('openai: choices[0].delta.content deltas + [DONE]; uses max_completion_tokens and stream:true', async () => {
        fetchMock.mockResolvedValue(sseResponse([
            'data: {"choices":[{"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Hi "},"finish_reason":null}]}\n\n',
            'data: {"choices":[{"delta":{"content":"there"},"finish_reason":null}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        ]));
        const { events, ret } = await collect(streamLlm({ prompt: 'hi' }, openaiLlm));
        expect(events.filter(e => !e.done).map(e => e.delta)).toEqual(['Hi ', 'there']);
        expect(ret).toBe('Hi there');
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.stream).toBe(true);
        expect(body.max_completion_tokens).toBe(1024);
        expect(body).not.toHaveProperty('max_tokens');
        expect(body).not.toHaveProperty('temperature'); // gpt-5 is a reasoning model
    });

    it('gemini: alt=sse URL, thought parts skipped', async () => {
        fetchMock.mockResolvedValue(sseResponse([
            'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"thinking…"},{"text":"Sun"}]}}]}\n\n',
            'data: {"candidates":[{"content":{"parts":[{"text":"ny"}]},"finishReason":"STOP"}]}\n\n',
        ]));
        const { ret } = await collect(streamLlm({ prompt: 'hi' }, geminiLlm));
        expect(ret).toBe('Sunny');
        expect(String(fetchMock.mock.calls[0][0])).toContain(':streamGenerateContent?alt=sse&key=k');
    });

    it('empty stream + max_tokens stop → falls back to callLlm once and yields its text', async () => {
        fetchMock.mockResolvedValue(sseResponse([
            'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"…"}}\n\n',
            'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n',
        ]));
        const callSpy = vi.spyOn(llmClient, 'callLlm').mockResolvedValue({ text: 'Recovered', provider: 'anthropic', model: 'claude-opus-5' });
        const { events, ret } = await collect(streamLlm({ prompt: 'hi' }, anthropicLlm));
        expect(callSpy).toHaveBeenCalledTimes(1);
        expect(events).toEqual([{ delta: 'Recovered', text: 'Recovered', done: true }]);
        expect(ret).toBe('Recovered');
    });

    it('refusal with no text → throws LlmError and records a failure', async () => {
        const failSpy = vi.spyOn(aiHealth, 'recordAiFailure');
        fetchMock.mockResolvedValue(sseResponse([
            'data: {"type":"message_delta","delta":{"stop_reason":"refusal"}}\n\n',
        ]));
        await expect(collect(streamLlm({ prompt: 'hi' }, anthropicLlm))).rejects.toBeInstanceOf(llmClient.LlmError);
        expect(failSpy).toHaveBeenCalledWith('anthropic', 200);
    });

    it('non-OK response → throws LlmError with status', async () => {
        fetchMock.mockResolvedValue(new Response('nope', { status: 401 }));
        await expect(collect(streamLlm({ prompt: 'hi' }, openaiLlm))).rejects.toMatchObject({ provider: 'openai', status: 401 });
    });
});

describe('per-provider stream parsers', () => {
    it('anthropic', () => {
        expect(parseAnthropicStreamData('{"type":"content_block_delta","delta":{"type":"text_delta","text":"a"}}')).toEqual({ delta: 'a' });
        expect(parseAnthropicStreamData('{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"a"}}')).toEqual({});
        expect(parseAnthropicStreamData('{"type":"message_delta","delta":{"stop_reason":"end_turn"}}')).toEqual({ stop: 'end_turn' });
        expect(parseAnthropicStreamData('not json')).toEqual({});
    });
    it('openai', () => {
        expect(parseOpenAiStreamData('[DONE]')).toEqual({});
        expect(parseOpenAiStreamData('{"choices":[{"delta":{"content":"x"},"finish_reason":null}]}')).toEqual({ delta: 'x' });
        expect(parseOpenAiStreamData('{"choices":[{"delta":{},"finish_reason":"length"}]}')).toEqual({ stop: 'length' });
    });
    it('gemini', () => {
        expect(parseGeminiStreamData('{"candidates":[{"content":{"parts":[{"thought":true,"text":"t"},{"text":"x"}]},"finishReason":"MAX_TOKENS"}]}')).toEqual({ delta: 'x', stop: 'MAX_TOKENS' });
    });
});

describe('araPrefsStore', () => {
    beforeEach(() => araPrefsStore.reset());

    it('defaults: streamTokens ON (046-A3), the rest OFF', () => {
        expect(araPrefsStore.getSnapshot()).toEqual(DEFAULT_ARA_PREFS);
        expect(DEFAULT_ARA_PREFS.streamTokens).toBe(true);
        expect(DEFAULT_ARA_PREFS.showToolActivity).toBe(false);
        expect(DEFAULT_ARA_PREFS.holdToTalk).toBe(false);
    });

    it('set + reset round-trips', () => {
        araPrefsStore.set('streamTokens', false);
        expect(araPrefsStore.getSnapshot().streamTokens).toBe(false);
        araPrefsStore.reset();
        expect(araPrefsStore.getSnapshot().streamTokens).toBe(true);
    });

    it('introSeen defaults false and persists to localStorage (045-D1c)', () => {
        expect(DEFAULT_ARA_PREFS.introSeen).toBe(false);
        expect(araPrefsStore.getSnapshot().introSeen).toBe(false);
        araPrefsStore.set('introSeen', true);
        expect(araPrefsStore.getSnapshot().introSeen).toBe(true);
        expect(JSON.parse(localStorage.getItem('dwellium-ara-prefs')!).introSeen).toBe(true);
    });
});
