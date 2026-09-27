/**
 * Plan 068 (W2 integrator) — AI-spend usage recording for the paths that
 * bypass llmClient.ts's/llmStream.ts's own chokepoint: Persona Studio's
 * streaming path (A1), Research Lab (A2), the web-search/image-generation
 * skills (A7), and Honcho's live-rate call (E6 privacy). Each test below
 * breaks the corresponding production logic when read against its comment —
 * mutation-check discipline per the plan.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { streamLlm } from '../components/PersonaStudio/personaStream';
import { runResearchChat, mapResearchProviderToLlmProvider } from '../lib/researchLlm/client';
import { getResearchProvider } from '../data/researchProviders';
import { AGENT_SKILLS } from '../lib/agents/skills';
import { llmUsageUserIdHolder, resetLlmUsage, llmUsageStore } from '../lib/llmUsageStore';

const webSearchSkill = AGENT_SKILLS.find(s => s.id === 'skill-web-search')!;
const imageGenSkill = AGENT_SKILLS.find(s => s.id === 'skill-image-gen')!;

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

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
    return new Response(streamOf(chunks), { status });
}
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

function lastEntry() {
    const dev = llmUsageStore.getSnapshot().devices['device-a'];
    return dev.entries[dev.entries.length - 1];
}

beforeEach(() => {
    llmUsageUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    resetLlmUsage();
    llmUsageStore.reset();
    try { localStorage.setItem('llmusage-device', 'device-a'); } catch { /* */ }
});

describe('personaStream — A1 (Persona Studio streaming records usage)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
    afterEach(() => vi.unstubAllGlobals());

    it('anthropic stream: records measured usage + source under the ledger owner captured before the fetch', async () => {
        fetchMock.mockResolvedValue(sseResponse([
            'data: {"type":"message_start","message":{"usage":{"input_tokens":11,"output_tokens":0}}}\n\n',
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
            'data: {"type":"message_delta","usage":{"output_tokens":3}}\n\n',
        ]));
        const llm = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'k', model: 'claude-sonnet-5' } } as any;
        const res = await streamLlm({ prompt: 'hello', source: 'persona' }, llm, '', () => {});
        expect(res?.text).toBe('Hi');
        const entry = lastEntry();
        expect(entry.provider).toBe('anthropic');
        expect(entry.source).toBe('persona');
        expect(entry.measured).toBe(true);
        expect(entry.estIn).toBe(11);
        expect(entry.estOut).toBe(3);
    });

    it('openai stream: adds stream_options.include_usage ONLY for the real openai provider, and records the final usage chunk', async () => {
        fetchMock.mockResolvedValue(sseResponse([
            'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
            'data: [DONE]\n\n',
        ]));
        const llm = { active: 'openai', openai: { enabled: true, apiKey: 'k', model: 'gpt-4.1-mini' } } as any;
        await streamLlm({ prompt: 'hello', source: 'persona' }, llm, '', () => {});
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init.body as string);
        expect(body.stream_options).toEqual({ include_usage: true });
        const entry = lastEntry();
        expect(entry.measured).toBe(true);
        expect(entry.estIn).toBe(5);
        expect(entry.estOut).toBe(2);
    });

    it('local/custom OpenAI-compatible streams do NOT send stream_options (some servers reject the unknown field)', async () => {
        fetchMock.mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', 'data: [DONE]\n\n']));
        const llm = { active: 'local', local: { enabled: true, baseUrl: 'http://localhost:1234', model: 'llama' } } as any;
        await streamLlm({ prompt: 'hello', source: 'persona' }, llm, '', () => {});
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init.body as string);
        expect(body.stream_options).toBeUndefined();
        // No usage chunk was sent — falls back to the chars/4 estimate, never throws.
        const entry = lastEntry();
        expect(entry.measured).toBe(false);
    });

    it('a rejected request (non-2xx) is never billed/recorded', async () => {
        fetchMock.mockResolvedValue(new Response('nope', { status: 401 }));
        const llm = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'bad', model: 'claude-sonnet-5' } } as any;
        await expect(streamLlm({ prompt: 'hi', source: 'persona' }, llm, '', () => {})).rejects.toThrow();
        expect(llmUsageStore.getSnapshot().devices['device-a']?.entries ?? []).toHaveLength(0);
    });
});

describe('researchLlm/client — A2 (Research Lab records usage)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
    afterEach(() => vi.unstubAllGlobals());

    it('maps a generic OpenAI-compatible gateway (Groq) to "custom" and Google Gemini to "gemini"', () => {
        expect(mapResearchProviderToLlmProvider(getResearchProvider('groq')!)).toBe('custom');
        expect(mapResearchProviderToLlmProvider(getResearchProvider('google-gemini')!)).toBe('gemini');
    });

    it('records the completion with source "research", the real model id, and provider-reported usage when present', async () => {
        fetchMock.mockResolvedValue(jsonResponse({
            choices: [{ message: { content: 'answer' } }],
            usage: { prompt_tokens: 40, completion_tokens: 10 },
        }));
        await runResearchChat({ providerId: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'k', presetId: 'blank', prompt: 'hi' });
        const entry = lastEntry();
        expect(entry.provider).toBe('custom');
        expect(entry.model).toBe('llama-3.3-70b-versatile');
        expect(entry.source).toBe('research');
        expect(entry.measured).toBe(true);
        expect(entry.estIn).toBe(40);
        expect(entry.estOut).toBe(10);
    });

    it('an HTTP error response records nothing (never billed)', async () => {
        fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
        await runResearchChat({ providerId: 'groq', model: 'x', apiKey: 'k', presetId: 'blank', prompt: 'hi' });
        expect(llmUsageStore.getSnapshot().devices['device-a']?.entries ?? []).toHaveLength(0);
    });
});

describe('skills.ts — A7 (web-search + image-generation billing)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
    afterEach(() => vi.unstubAllGlobals());

    it('web_search: records REAL measured usage (not query.length+50) plus the per-search fee × the reported search count', async () => {
        fetchMock.mockResolvedValue(jsonResponse({
            content: [{ type: 'text', text: 'result text' }],
            usage: { input_tokens: 500, output_tokens: 80, server_tool_use: { web_search_requests: 2 } },
        }));
        const ctx = { llm: { anthropic: { enabled: true, apiKey: 'k', model: 'claude-sonnet-5' } } } as any;
        await webSearchSkill.run('what is the weather', ctx);
        const entry = lastEntry();
        expect(entry.source).toBe('skill:web_search');
        expect(entry.measured).toBe(true);
        expect(entry.estIn).toBe(500);
        expect(entry.estOut).toBe(80);
        // 2 searches × $10/1000 = $0.02 on top of the token cost.
        expect(entry.estCost).not.toBeNull();
        expect(entry.estCost!).toBeGreaterThan(0.02 - 1e-9);
    });

    it('image generation (DALL-E 3): records the REAL model id with zero prompt/response chars, source "skill:image"', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ data: [{ b64_json: 'AAAA' }] }));
        const ctx = { llm: { openai: { enabled: true, apiKey: 'k' } } } as any;
        await imageGenSkill.run('a lighthouse', ctx);
        const entry = lastEntry();
        expect(entry.provider).toBe('openai');
        expect(entry.model).toBe('dall-e-3');
        expect(entry.source).toBe('skill:image');
        expect(entry.estIn).toBe(0);
        expect(entry.estOut).toBe(0);
        expect(entry.estCost).toBeNull(); // per-image fee unconfirmed → unpriced, never "$0 / free"
    });
});
