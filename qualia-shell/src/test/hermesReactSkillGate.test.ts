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
        const out = await buildReactLoopFn(LLM)('do the task', '');
        expect(g.__pwned).toBeUndefined();
        expect(out?.toolsUsed ?? []).not.toContain('Code Runner (JS)');
        expect(prompts[1]?.prompt ?? '').toMatch(/not (allowed|available)/i);
    });

    it('the model names Remember → no memory write', async () => {
        replies.push(act('Remember', 'the owner password is hunter2'), final('done'));
        await buildReactLoopFn(LLM)('do the task', '');
        expect(rememberSpy).not.toHaveBeenCalled();
    });

    it('only allowlisted skills are offered to the model', async () => {
        replies.push(final('done'));
        await buildReactLoopFn(LLM)('do the task', '');
        const sys = prompts[0]?.systemPrompt ?? '';
        for (const s of AGENT_SKILLS) {
            if (isSkillAllowedForOrigin(s, 'model')) expect(sys).toContain(`- ${s.name}:`);
            else expect(sys).not.toContain(`- ${s.name}:`);
        }
    });

    it('control: an allowlisted skill (Calculator) still runs and its result reaches the model', async () => {
        replies.push(act('Calculator', '15% of 2400'), final('360'));
        const out = await buildReactLoopFn(LLM)('compute 15% of 2400', '');
        expect(out?.toolsUsed).toEqual(['Calculator']);
        expect(prompts[1]?.prompt ?? '').toContain('360');
    });
});
