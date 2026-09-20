/**
 * runResearchChat routing — keyless vs keyed request shape.
 *
 * Keyless (Pollinations, probed 2026-08-31): POST to the baseUrl itself (it
 * already ends in /openai — NOT + /chat/completions) with NO Authorization
 * header, runnable with no key in the store. Keyed providers are unchanged:
 * baseUrl + /chat/completions with a Bearer Authorization header.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESEARCH_TIMEOUT_MS, listModels, runResearchChat } from '../lib/researchLlm/client';

const okJson = () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 });

afterEach(() => vi.restoreAllMocks());

describe('runResearchChat routing', () => {
    it('keyless: POSTs to baseUrl (no /chat/completions), sends NO Authorization header, needs no key', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson());
        const r = await runResearchChat({ providerId: 'pollinations', model: 'openai', apiKey: '', presetId: 'blank', prompt: 'hello' });
        expect(r.text).toBe('hi');
        const [url, init] = spy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://text.pollinations.ai/openai');
        const headers = init.headers as Record<string, string>;
        expect('Authorization' in headers).toBe(false);
    });

    it('keyOptional with an EMPTY key: POSTs to /chat/completions with NO Authorization header (LLM7 anonymous tier, probed 2026-09-19)', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson());
        const r = await runResearchChat({ providerId: 'llm7-io', model: 'GLM-5.3-Flash', apiKey: '', presetId: 'blank', prompt: 'hello' });
        expect(r.text).toBe('hi');
        const [url, init] = spy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.llm7.io/v1/chat/completions');
        expect('Authorization' in (init.headers as Record<string, string>)).toBe(false);
    });

    it('keyed: POSTs to baseUrl + /chat/completions with a Bearer Authorization header', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson());
        await runResearchChat({ providerId: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'gsk-1', presetId: 'blank', prompt: 'hello' });
        const [url, init] = spy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer gsk-1');
    });
});

// Plan 062 phase 1 — a per-run default timeout so one hanging free provider
// can never hang the widget; Cancel and a real timeout must read differently.
describe('runResearchChat timeout / cancel', () => {
    it('RESEARCH_TIMEOUT_MS is 60s', () => {
        expect(RESEARCH_TIMEOUT_MS).toBe(60_000);
    });

    it('fetch always receives a composed AbortSignal, even with no caller signal', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson());
        await runResearchChat({ providerId: 'groq', model: 'm', apiKey: 'k', presetId: 'blank', prompt: 'hi' });
        const [, init] = spy.mock.calls[0] as [string, RequestInit];
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    // The real AbortSignal.timeout() firing rejects fetch with a DOMException
    // named 'TimeoutError' — simulate that directly rather than waiting 60
    // real seconds or reaching for vi.useFakeTimers (this repo's CLAUDE.md
    // flags fake timers as unsafe with the React 19 scheduler; this client
    // test has no React tree, but the assertion is deterministic either way).
    it('a TimeoutError from fetch reads "Timed out after 60s." — distinct from Cancelled.', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
        const r = await runResearchChat({ providerId: 'groq', model: 'm', apiKey: 'k', presetId: 'blank', prompt: 'hi' });
        expect(r.error).toBe('Timed out after 60s.');
    });

    it('a caller AbortController firing reads "Cancelled." — not the timeout text', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            const signal = (init as RequestInit).signal;
            signal?.addEventListener('abort', () => reject(signal.reason ?? new DOMException('aborted', 'AbortError')));
        }));
        const controller = new AbortController();
        const pending = runResearchChat({ providerId: 'groq', model: 'm', apiKey: 'k', presetId: 'blank', prompt: 'hi', signal: controller.signal });
        controller.abort();
        const r = await pending;
        expect(r.error).toBe('Cancelled.');
    });
});

// Plan 062 phase 4 — real model pickers: GET {base}/models.
describe('listModels', () => {
    const modelsBody = (ids: string[]) => new Response(JSON.stringify({ data: ids.map(id => ({ id })) }), { status: 200 });

    it('hits {base}/models and sends the Bearer header for a keyed provider with a key', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelsBody(['b-model', 'a-model']));
        const r = await listModels('groq', 'gsk-1');
        const [url, init] = spy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.groq.com/openai/v1/models');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gsk-1');
        // sorted, de-duplicated
        expect(r.models).toEqual(['a-model', 'b-model']);
    });

    it('sends NO Authorization header for a keyless provider', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelsBody(['openai']));
        await listModels('pollinations', 'irrelevant-key');
        const [, init] = spy.mock.calls[0] as [string, RequestInit];
        expect('Authorization' in (init.headers as Record<string, string>)).toBe(false);
    });

    it('sends NO Authorization header when apiKey is empty, even for a keyed provider (usability deviation, Ilya gate G1)', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelsBody(['x']));
        await listModels('openrouter', '');
        const [url, init] = spy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://openrouter.ai/api/v1/models');
        expect('Authorization' in (init.headers as Record<string, string>)).toBe(false);
    });

    it('returns corsBlocked on a fetch TypeError', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        const r = await listModels('groq', 'gsk-1');
        expect(r.corsBlocked).toBe(true);
        expect(r.models).toBeUndefined();
    });

    it('a non-2xx response is an error, not a model list', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
        const r = await listModels('groq', 'gsk-1');
        expect(r.error).toMatch(/HTTP 404/);
        expect(r.models).toBeUndefined();
    });
});
