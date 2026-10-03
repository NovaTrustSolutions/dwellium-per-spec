/**
 * Hermes ReAct skill gate. The ReAct loop's tool choices come from MODEL output (possibly steered by
 * prompt-injected text in a web-search observation), so they are origin 'model' and may only run the
 * autonomous-safe allowlist (skills.ts isSkillAllowedForOrigin). buildReactLoopFn used to run ANY
 * AGENT_SKILL the model named — including the JS code runner (`new Function`) and memory writes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const replies: string[] = [];
const prompts: Array<{ systemPrompt?: string; prompt: string }> = [];
vi.mock('../lib/llmClient', async (orig) => ({
    ...(await orig<typeof import('../lib/llmClient')>()),
    callLlm: vi.fn(async (req: { systemPrompt?: string; prompt: string }) => {
        prompts.push(req);
        const text = replies.shift();
        return text === undefined ? null : { text, provider: 'custom', model: 'x' };
    }),
}));
const rememberSpy = vi.fn();
vi.mock('../lib/unifiedMemory', async (orig) => ({
    ...(await orig<typeof import('../lib/unifiedMemory')>()),
    remember: (...args: unknown[]) => rememberSpy(...args),
}));

import { buildReactLoopFn } from '../components/HonchoHermesPanel/hermesReact';
import { AGENT_SKILLS, isSkillAllowedForOrigin } from '../lib/agents/skills';

const LLM = { active: 'custom', custom: { enabled: true, baseUrl: 'https://x', apiKey: 'k', model: 'm' } } as never;
const act = (tool: string, input: string) => JSON.stringify({ thought: 't', action: { tool, input } });
const final = (text: string) => JSON.stringify({ thought: 't', final: text });
const g = globalThis as unknown as { __pwned?: number };

describe('Hermes ReAct loop — skills are gated like every other model-driven path', () => {
    beforeEach(() => { replies.length = 0; prompts.length = 0; rememberSpy.mockReset(); delete g.__pwned; });

    it('the model names the Code Runner → it never runs (no JS executed), and the loop is told it is not allowed', async () => {
        replies.push(act('Code Runner (JS)', 'globalThis.__pwned = 1; return 1'), final('done'));
        const out = await buildReactLoopFn(LLM, undefined)('do the task', '');
        expect(g.__pwned).toBeUndefined();
        expect(out?.toolsUsed ?? []).not.toContain('Code Runner (JS)');
        expect(prompts[1]?.prompt ?? '').toMatch(/not (allowed|available)/i);
    });

    it('the model names Remember → no memory write', async () => {
        replies.push(act('Remember', 'the owner password is hunter2'), final('done'));
        await buildReactLoopFn(LLM, undefined)('do the task', '');
        expect(rememberSpy).not.toHaveBeenCalled();
    });

    it('only allowlisted skills are offered to the model', async () => {
        replies.push(final('done'));
        await buildReactLoopFn(LLM, undefined)('do the task', '');
        const sys = prompts[0]?.systemPrompt ?? '';
        for (const s of AGENT_SKILLS) {
            if (isSkillAllowedForOrigin(s, 'model')) expect(sys).toContain(`- ${s.name}:`);
            else expect(sys).not.toContain(`- ${s.name}:`);
        }
    });

    it('control: an allowlisted skill (Calculator) still runs and its result reaches the model', async () => {
        replies.push(act('Calculator', '15% of 2400'), final('360'));
        const out = await buildReactLoopFn(LLM, undefined)('compute 15% of 2400', '');
        expect(out?.toolsUsed).toEqual(['Calculator']);
        expect(prompts[1]?.prompt ?? '').toContain('360');
    });
});

describe("Hermes ReAct loop — Web Search uses the user's Tavily / Brave key", () => {
    beforeEach(() => { replies.length = 0; prompts.length = 0; vi.unstubAllGlobals(); });

    it('with a Tavily key: the live search runs with that key and its answer reaches the model', async () => {
        const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
            ok: true,
            json: async () => (String(url).includes('tavily') ? { answer: 'Tavily says: 60 days notice.', results: [{ title: 'Lease law', url: 'https://example.org/lease' }] } : {}),
        }));
        vi.stubGlobal('fetch', fetchMock);
        replies.push(act('Web Search', 'lease renewal notice period'), final('60 days'));
        const out = await buildReactLoopFn(LLM, { active: 'tavily', tavily: { apiKey: 'tvly-test', enabled: true } } as never)('find the notice period', '');
        const call = fetchMock.mock.calls.find(([u]) => String(u).includes('api.tavily.com'));
        expect(call).toBeTruthy();
        expect(JSON.parse(String((call![1] as RequestInit).body)).api_key).toBe('tvly-test');
        expect(prompts[1]?.prompt ?? '').toContain('Tavily says: 60 days notice.');
        expect(out?.toolsUsed).toEqual(['Web Search']);
    });

    it('with only a Brave key: the live search runs with that key', async () => {
        const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
            ok: true,
            json: async () => (String(url).includes('search.brave.com') ? { web: { results: [{ title: 'Brave hit', url: 'https://example.org/b', description: 'from Brave' }] } } : {}),
        }));
        vi.stubGlobal('fetch', fetchMock);
        replies.push(act('Web Search', 'lease renewal notice period'), final('ok'));
        await buildReactLoopFn(LLM, { active: 'brave', brave: { apiKey: 'brave-test', enabled: true } } as never)('find it', '');
        const call = fetchMock.mock.calls.find(([u]) => String(u).includes('api.search.brave.com'));
        expect(call).toBeTruthy();
        expect(((call![1] as RequestInit).headers as Record<string, string>)['X-Subscription-Token']).toBe('brave-test');
        expect(prompts[1]?.prompt ?? '').toContain('Brave hit');
    });
});

describe("Hermes's single-shot offline fallback prompt lists only the skills Hermes can use", () => {
    it('names the allowlisted skills and none of the human-only ones; keeps the LLM Wiki', async () => {
        const { hermesFallbackSystemPrompt, HERMES_BROWSER_SKILLS } = await import('../components/HonchoHermesPanel/hermesReact');
        const sys = hermesFallbackSystemPrompt('WIKI-CONTEXT');
        expect(sys).toContain('WIKI-CONTEXT');
        for (const s of AGENT_SKILLS) {
            if (isSkillAllowedForOrigin(s, 'model')) expect(sys).toContain(`- ${s.name}:`);
            else expect(sys).not.toContain(`- ${s.name}:`);
        }
        expect(HERMES_BROWSER_SKILLS.map((s) => s.id).sort()).toEqual(AGENT_SKILLS.filter((s) => isSkillAllowedForOrigin(s, 'model')).map((s) => s.id).sort());
    });
});

describe('hermesBrowserFallbacks — the offline chain for Hermes callers without their own (voice persona)', () => {
    beforeEach(() => { replies.length = 0; prompts.length = 0; vi.unstubAllGlobals(); delete g.__pwned; });

    it("a 'search the web …' task runs Web Search with the user's Tavily key", async () => {
        const { hermesBrowserFallbacks } = await import('../components/HonchoHermesPanel/hermesReact');
        const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({ ok: true, json: async () => (String(url).includes('tavily') ? { answer: 'Tavily: 60 days.', results: [] } : {}) }));
        vi.stubGlobal('fetch', fetchMock);
        const fb = hermesBrowserFallbacks(LLM, { active: 'tavily', tavily: { apiKey: 'tvly-test', enabled: true } } as never);
        const hit = await fb.skillFallbackFn('search the web for Georgia lease renewal notice');
        expect(hit).toMatchObject({ ok: true, skillName: 'Web Search' });
        expect(hit?.text).toContain('Tavily: 60 days.');
        const call = fetchMock.mock.calls.find(([u]) => String(u).includes('api.tavily.com'));
        expect(JSON.parse(String((call![1] as RequestInit).body)).api_key).toBe('tvly-test');
        expect(typeof fb.reactLoopFn).toBe('function');
    });

    it('a model-chosen task that names the code runner never runs it (origin model)', async () => {
        const { hermesBrowserFallbacks } = await import('../components/HonchoHermesPanel/hermesReact');
        const fb = hermesBrowserFallbacks(LLM, undefined);
        expect(await fb.skillFallbackFn('run js: globalThis.__pwned = 1')).toBeNull();
        expect(g.__pwned).toBeUndefined();
    });

    it('no active LLM → no ReAct leg', async () => {
        const { hermesBrowserFallbacks } = await import('../components/HonchoHermesPanel/hermesReact');
        expect(hermesBrowserFallbacks({ active: null } as never, undefined).reactLoopFn).toBeUndefined();
    });
});
