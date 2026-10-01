/**
 * llmClientAbort — plan 070 P2 W1 contract (ef4820e): LlmRequest.signal
 * reaches every provider fetch, an abort propagates as a real AbortError
 * without touching AI health or the usage ledger, and LlmResponse.truncated
 * reflects a non-empty reply that hit the provider's token limit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callLlm } from '../lib/llmClient';
import * as aiHealth from '../lib/aiHealthStore';
import * as usage from '../lib/llmUsageStore';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const anthropicLlm = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'k', model: 'claude-opus-5' } } as any;
const openaiLlm = { active: 'openai', openai: { enabled: true, apiKey: 'k', model: 'gpt-5' } } as any;
const geminiLlm = { active: 'gemini', gemini: { enabled: true, apiKey: 'k', model: 'gemini-2.5-pro' } } as any;

describe('llmClient abort + truncated (plan 070)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        usage.llmUsageUserIdHolder.current = null;
    });
    afterEach(() => vi.unstubAllGlobals());

    // ── signal reaches fetch ──────────────────────────────────────────
    it('anthropic: passes req.signal to fetch init', async () => {
        const controller = new AbortController();
        fetchMock.mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn' }));
        await callLlm({ prompt: 'hi', signal: controller.signal }, anthropicLlm);
        expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
    });

    it('openai: passes req.signal to fetch init', async () => {
        const controller = new AbortController();
        fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }));
        await callLlm({ prompt: 'hi', signal: controller.signal }, openaiLlm);
        expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
    });

    it('gemini: passes req.signal to fetch init', async () => {
        const controller = new AbortController();
        fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }] }));
        await callLlm({ prompt: 'hi', signal: controller.signal }, geminiLlm);
        expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
    });

    // ── pre-aborted signal ────────────────────────────────────────────
    it('pre-aborted signal rejects AbortError without calling fetch', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(callLlm({ prompt: 'hi', signal: controller.signal }, anthropicLlm)).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // ── mid-flight abort ──────────────────────────────────────────────
    it('mid-flight abort rejects AbortError, records no usage, and does not mark AI health failed', async () => {
        const usageSpy = vi.spyOn(usage, 'recordLlmUsage');
        const failSpy = vi.spyOn(aiHealth, 'recordAiFailure');
        const successSpy = vi.spyOn(aiHealth, 'recordAiSuccess');
        const controller = new AbortController();
        fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
        const promise = callLlm({ prompt: 'hi', signal: controller.signal }, anthropicLlm);
        controller.abort();
        await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
        expect(usageSpy).not.toHaveBeenCalled();
        expect(failSpy).not.toHaveBeenCalled();
        expect(successSpy).not.toHaveBeenCalled();
    });

    // ── truncated ─────────────────────────────────────────────────────
    it('anthropic: non-empty reply at max_tokens sets truncated true', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'cut off he' }], stop_reason: 'max_tokens' }));
        const res = await callLlm({ prompt: 'hi', maxTokens: 5 }, anthropicLlm);
        expect(res?.truncated).toBe(true);
    });

    it('anthropic: normal end_turn reply leaves truncated falsy', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'complete answer' }], stop_reason: 'end_turn' }));
        const res = await callLlm({ prompt: 'hi' }, anthropicLlm);
        expect(res?.truncated).toBeFalsy();
    });

    it('openai: non-empty reply at finish_reason length sets truncated true', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'cut off he' }, finish_reason: 'length' }] }));
        const res = await callLlm({ prompt: 'hi', maxTokens: 5 }, openaiLlm);
        expect(res?.truncated).toBe(true);
    });

    it('openai: normal stop reply leaves truncated falsy', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'complete' }, finish_reason: 'stop' }] }));
        const res = await callLlm({ prompt: 'hi' }, openaiLlm);
        expect(res?.truncated).toBeFalsy();
    });

    it('gemini: non-empty reply at MAX_TOKENS sets truncated true', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: 'cut off he' }] }, finishReason: 'MAX_TOKENS' }] }));
        const res = await callLlm({ prompt: 'hi', maxTokens: 5 }, geminiLlm);
        expect(res?.truncated).toBe(true);
    });

    it('gemini: normal STOP reply leaves truncated falsy', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: 'complete' }] }, finishReason: 'STOP' }] }));
        const res = await callLlm({ prompt: 'hi' }, geminiLlm);
        expect(res?.truncated).toBeFalsy();
    });
});
