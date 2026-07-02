/**
 * llmClient.listModels — Task B. Fetches each provider's own model list via the
 * SAME direct-browser call path the completion helpers use (same auth headers,
 * same origins), filtered to chat-capable ids. These tests assert the auth
 * headers, the filtering, and graceful failure (empty + error → UI falls back to
 * the curated list).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { listModels } from '../lib/llmClient';
import { emptyIntegrations, type IntegrationsBundle } from '../types/integrations';

interface Captured { url: string; init?: RequestInit }

function mockFetch(impl: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
    const calls: Captured[] = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: unknown) => {
        calls.push({ url: String(url), init: init as RequestInit | undefined });
        const r = impl(String(url), init as RequestInit | undefined);
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body ?? {},
            text: async () => JSON.stringify(r.body ?? {}),
        } as Response;
    }) as unknown as typeof fetch;
    return calls;
}

function headersOf(init?: RequestInit): Record<string, string> {
    return (init?.headers as Record<string, string> | undefined) ?? {};
}

function llmWith(patch: Partial<IntegrationsBundle['llm']>): IntegrationsBundle['llm'] {
    return { ...emptyIntegrations().llm, ...patch };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('listModels — OpenAI', () => {
    it('filters to chat-capable ids and sends the Bearer key', async () => {
        const calls = mockFetch(() => ({
            status: 200,
            body: { data: [
                { id: 'gpt-4o' },
                { id: 'gpt-4o-mini' },
                { id: 'text-embedding-3-small' }, // dropped
                { id: 'whisper-1' },               // dropped
                { id: 'dall-e-3' },                // dropped
                { id: 'o1-mini' },                 // kept
            ] },
        }));
        const res = await listModels('openai', llmWith({ openai: { apiKey: 'sk-oai', model: 'gpt-4o-mini', enabled: true } }));
        expect(res.error).toBeUndefined();
        expect(res.models).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1-mini']);
        expect(calls[0].url).toContain('api.openai.com/v1/models');
        expect(headersOf(calls[0].init)['Authorization']).toBe('Bearer sk-oai');
    });

    it('returns an error (no throw) when there is no key', async () => {
        const res = await listModels('openai', llmWith({}));
        expect(res.models).toEqual([]);
        expect(res.error).toMatch(/no openai api key/i);
    });

    it('falls back with an error on a non-OK response', async () => {
        mockFetch(() => ({ status: 401, body: { error: 'bad key' } }));
        const res = await listModels('openai', llmWith({ openai: { apiKey: 'sk-bad', model: '', enabled: true } }));
        expect(res.models).toEqual([]);
        expect(res.error).toBeTruthy();
    });
});

describe('listModels — Anthropic', () => {
    it('returns data[].id and sends the browser-direct headers', async () => {
        const calls = mockFetch(() => ({
            status: 200,
            body: { data: [{ id: 'claude-opus-4-8' }, { id: 'claude-haiku-4-5-20251001' }] },
        }));
        const res = await listModels('anthropic', llmWith({ anthropic: { apiKey: 'sk-ant', model: '', enabled: true } }));
        expect(res.models).toEqual(['claude-haiku-4-5-20251001', 'claude-opus-4-8']); // sorted
        const h = headersOf(calls[0].init);
        expect(h['x-api-key']).toBe('sk-ant');
        expect(h['anthropic-version']).toBe('2023-06-01');
        expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
    });
});

describe('listModels — Gemini', () => {
    it('keeps generateContent models and strips the models/ prefix', async () => {
        const calls = mockFetch(() => ({
            status: 200,
            body: { models: [
                { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] },
                { name: 'models/gemini-1.5-pro', supportedGenerationMethods: ['generateContent', 'countTokens'] },
                { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }, // dropped
            ] },
        }));
        const res = await listModels('gemini', llmWith({ gemini: { apiKey: 'AIza', model: '', enabled: true } }));
        expect(res.models).toEqual(['gemini-1.5-flash', 'gemini-1.5-pro']);
        expect(calls[0].url).toContain('generativelanguage.googleapis.com/v1beta/models');
        expect(calls[0].url).toContain('key=AIza');
    });
});
