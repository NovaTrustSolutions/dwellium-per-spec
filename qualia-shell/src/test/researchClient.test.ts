/**
 * runResearchChat routing — keyless vs keyed request shape.
 *
 * Keyless (Pollinations, probed 2026-08-31): POST to the baseUrl itself (it
 * already ends in /openai — NOT + /chat/completions) with NO Authorization
 * header, runnable with no key in the store. Keyed providers are unchanged:
 * baseUrl + /chat/completions with a Bearer Authorization header.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESEARCH_TIMEOUT_MS, runResearchChat } from '../lib/researchLlm/client';

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
