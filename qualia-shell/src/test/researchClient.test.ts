/**
 * runResearchChat routing — keyless vs keyed request shape.
 *
 * Keyless (Pollinations, probed 2026-08-31): POST to the baseUrl itself (it
 * already ends in /openai — NOT + /chat/completions) with NO Authorization
 * header, runnable with no key in the store. Keyed providers are unchanged:
 * baseUrl + /chat/completions with a Bearer Authorization header.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runResearchChat } from '../lib/researchLlm/client';

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
