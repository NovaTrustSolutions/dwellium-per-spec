/**
 * 2026-08-19 (Ilya): "empty responses when I switch to a newer model using my API keys".
 * Root cause: `max_tokens` + `temperature` → 400 on GPT-5 / o-series; reasoning budget
 * exhaustion → content "" / finish_reason "length"; Gemini 2.5 thinking shares the
 * output budget and text can sit in a later part. Pure helpers + one fetch-level run.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    isOpenAiReasoningModel, buildOpenAiBody, parseOpenAiText, parseGeminiText, retryBudget, callLlm, LlmError,
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
