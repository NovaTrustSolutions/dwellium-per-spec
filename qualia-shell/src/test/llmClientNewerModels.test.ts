/**
 * 2026-08-19 (Ilya): "empty responses when I switch to a newer model using my API keys".
 * Root cause: `max_tokens` + `temperature` → 400 on GPT-5 / o-series; reasoning budget
 * exhaustion → content "" / finish_reason "length"; Gemini 2.5 thinking shares the
 * output budget and text can sit in a later part. Pure helpers + one fetch-level run.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    isOpenAiReasoningModel, buildOpenAiBody, parseOpenAiText, parseGeminiText, retryBudget, callLlm, LlmError,
    isAnthropicNoSamplingModel, buildAnthropicBody, parseAnthropicText,
} from '../lib/llmClient';
import type { IntegrationsBundle } from '../types/integrations';

const REQ = { prompt: 'hi', systemPrompt: 'sys', maxTokens: 5, temperature: 0 };

describe('isOpenAiReasoningModel', () => {
    it.each(['gpt-5', 'gpt-5-mini', 'gpt-5.1', 'o1', 'o3-mini', 'o4-mini'])('reasoning: %s', (m) => expect(isOpenAiReasoningModel(m)).toBe(true));
    it.each(['gpt-4o', 'gpt-4o-mini', 'gpt-4.1-nano', 'gpt-3.5-turbo'])('classic: %s', (m) => expect(isOpenAiReasoningModel(m)).toBe(false));
});

describe('buildOpenAiBody', () => {
    it('never sends max_tokens; classic models keep temperature', () => {
        const b = buildOpenAiBody(REQ, 'gpt-4.1-nano');
        expect(b).not.toHaveProperty('max_tokens');
        expect(b.max_completion_tokens).toBe(5);
        expect(b.temperature).toBe(0);
        expect(b).not.toHaveProperty('reasoning_effort');
    });
    it('reasoning models: no temperature, minimal reasoning for tiny budgets, json format preserved', () => {
        const b = buildOpenAiBody({ ...REQ, responseFormat: 'json' }, 'gpt-5-mini');
        expect(b).not.toHaveProperty('temperature');
        expect(b.reasoning_effort).toBe('minimal');
        expect(b.response_format).toEqual({ type: 'json_object' });
        expect(buildOpenAiBody({ ...REQ, maxTokens: 2000 }, 'gpt-5')).not.toHaveProperty('reasoning_effort');
    });
    it('override budget wins (used by the retry)', () => {
        expect(buildOpenAiBody(REQ, 'gpt-5', 4096).max_completion_tokens).toBe(4096);
    });
});

describe('parsers', () => {
    it('OpenAI: empty + length = truncated; normal text passes', () => {
        expect(parseOpenAiText({ choices: [{ message: { content: '' }, finish_reason: 'length' }] })).toEqual({ text: '', truncated: true });
        expect(parseOpenAiText({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })).toEqual({ text: 'ok', truncated: false });
        expect(parseOpenAiText({})).toEqual({ text: '', truncated: false });
    });
    it('Gemini: joins text parts, skips thought parts, flags MAX_TOKENS', () => {
        const json = { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'thinking…' }, { text: 'Hello ' }, { text: 'world' }] } }] };
        expect(parseGeminiText(json)).toEqual({ text: 'Hello world', truncated: false });
        expect(parseGeminiText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ thought: true, text: 'x' }] } }] })).toEqual({ text: '', truncated: true });
    });
    it('retryBudget: at least 4096, else 4×', () => {
        expect(retryBudget(5)).toBe(4096);
        expect(retryBudget(2000)).toBe(8000);
        expect(retryBudget(undefined)).toBe(4096);
    });
});

describe('Anthropic helpers', () => {
    it.each(['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5', 'claude-mythos-5', 'claude-opus-4-8', 'claude-opus-4-7'])('no sampling: %s', (m) => expect(isAnthropicNoSamplingModel(m)).toBe(true));
    it.each(['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-sonnet-4-5'])('sampling ok: %s', (m) => expect(isAnthropicNoSamplingModel(m)).toBe(false));

    it('body: older Claude keeps temperature; 4.7+/5 drops it and uses low effort for tiny budgets', () => {
        const old = buildAnthropicBody(REQ, 'claude-haiku-4-5-20251001');
        expect(old.temperature).toBe(0);
        expect(old.max_tokens).toBe(5);
        expect(old.system).toBe('sys');
        expect(old).not.toHaveProperty('output_config');
        const v5 = buildAnthropicBody(REQ, 'claude-opus-5');
        expect(v5).not.toHaveProperty('temperature');
        expect(v5.output_config).toEqual({ effort: 'low' });
        expect(buildAnthropicBody({ ...REQ, maxTokens: 2000 }, 'claude-opus-5')).not.toHaveProperty('output_config');
        expect(buildAnthropicBody(REQ, 'claude-opus-5', 4096).max_tokens).toBe(4096);
        expect(buildAnthropicBody(REQ, 'claude-haiku-4-5-20251001', undefined, true)).not.toHaveProperty('temperature');
    });

    it('parser: joins text blocks after thinking; flags max_tokens + refusal', () => {
        expect(parseAnthropicText({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }] }))
            .toEqual({ text: 'Hello world', truncated: false, refused: false });
        expect(parseAnthropicText({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] }))
            .toEqual({ text: '', truncated: true, refused: false });
        expect(parseAnthropicText({ stop_reason: 'refusal', content: [] })).toEqual({ text: '', truncated: false, refused: true });
        expect(parseAnthropicText({})).toEqual({ text: '', truncated: false, refused: false });
    });
});

describe('callLlm with a Claude Opus 5 key', () => {
    const llm = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'sk-ant-test', model: 'claude-opus-5' } } as unknown as IntegrationsBundle['llm'];
    afterEach(() => vi.unstubAllGlobals());

    it('thinking ate the 5-token budget → retries at 4096 and returns the text block', async () => {
        const bodies: any[] = [];
        const fetchMock = vi.fn(async (_url: string, init: any) => {
            bodies.push(JSON.parse(init.body));
            const first = bodies.length === 1;
            return new Response(JSON.stringify(first
                ? { stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] }
                : { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'DEFLECTED' }] }), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const res = await callLlm({ prompt: 'judge', maxTokens: 5, temperature: 0 }, llm);
        expect(res?.text).toBe('DEFLECTED');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(bodies[0]).not.toHaveProperty('temperature');
        expect(bodies[0].max_tokens).toBe(5);
        expect(bodies[1].max_tokens).toBe(4096);
    });

    it('unknown future model id: 400 mentioning temperature → one retry without it', async () => {
        const future = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'k', model: 'claude-nova-9' } } as unknown as IntegrationsBundle['llm'];
        const bodies: any[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
            bodies.push(JSON.parse(init.body));
            if ('temperature' in bodies[bodies.length - 1]) {
                return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: '`temperature` is not supported on this model' } }), { status: 400 });
            }
            return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }), { status: 200 });
        }));
        const res = await callLlm({ prompt: 'x' }, future);
        expect(res?.text).toBe('ok');
        expect(bodies).toHaveLength(2);
        expect(bodies[0]).toHaveProperty('temperature');
        expect(bodies[1]).not.toHaveProperty('temperature');
    });

    it('still empty after the retry → a clear LlmError, not a silent blank', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [] }), { status: 200 })));
        await expect(callLlm({ prompt: 'x', maxTokens: 5 }, llm)).rejects.toBeInstanceOf(LlmError);
    });
});

describe('callLlm with a GPT-5 key — one automatic retry on reasoning exhaustion', () => {
    const llm = { active: 'openai', openai: { enabled: true, apiKey: 'sk-test', model: 'gpt-5-mini' } } as unknown as IntegrationsBundle['llm'];
    afterEach(() => vi.unstubAllGlobals());

    it('first reply empty/length → retries with a 4096 budget and returns the text', async () => {
        const bodies: any[] = [];
        const fetchMock = vi.fn(async (_url: string, init: any) => {
            bodies.push(JSON.parse(init.body));
            const first = bodies.length === 1;
            return new Response(JSON.stringify({ choices: [{ message: { content: first ? '' : 'DEFLECTED' }, finish_reason: first ? 'length' : 'stop' }] }), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const res = await callLlm({ prompt: 'judge', maxTokens: 5, temperature: 0 }, llm);
        expect(res?.text).toBe('DEFLECTED');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(bodies[0].max_completion_tokens).toBe(5);
        expect(bodies[0]).not.toHaveProperty('max_tokens');
        expect(bodies[0]).not.toHaveProperty('temperature');
        expect(bodies[1].max_completion_tokens).toBe(4096);
    });

    it('still empty after the retry → a clear LlmError, not a silent blank', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }), { status: 200 })));
        await expect(callLlm({ prompt: 'x', maxTokens: 5 }, llm)).rejects.toBeInstanceOf(LlmError);
    });
});
