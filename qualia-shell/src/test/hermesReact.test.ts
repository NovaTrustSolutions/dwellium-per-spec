/**
 * hermesReact — P11-6: multi-step ReAct loop + merged tool registry. Mock
 * LLM + mock skills throughout (no network).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const callLlmMock = vi.fn();
vi.mock('../lib/llmClient', () => ({
    callLlm: (...args: unknown[]) => callLlmMock(...args),
    parseAnthropicUsage: () => null,
}));

import { runReactLoop, mergedToolNames, BROWSER_SKILL_TOOLS, buildReactLoopFn } from '../components/HonchoHermesPanel/hermesReact';
import { runHermes } from '../components/HonchoHermesPanel/hermesRunner';

const SKILLS = [
    { name: 'Calculator', description: 'math' },
    { name: 'Web Search', description: 'search the web' },
];

describe('runReactLoop', () => {
    it('reason → act → observe → final, multi-step', async () => {
        const invoke = vi.fn()
            .mockResolvedValueOnce('{"thought": "need the number", "action": {"tool": "Calculator", "input": "15% of 2400"}}')
            .mockResolvedValueOnce('{"thought": "have it", "final": "The answer is 360."}');
        const runSkill = vi.fn(async (name: string) => (name === 'Calculator' ? { ok: true, text: '360' } : null));
        const r = await runReactLoop('compute 15% of 2400 and state it', '', { invoke, runSkill, skills: SKILLS });
        expect(r.ok).toBe(true);
        expect(r.result).toBe('The answer is 360.');
        expect(r.steps.map(s => s.type)).toEqual(['thought', 'action', 'observation', 'thought', 'final_answer']);
        expect(r.toolsUsed).toEqual(['Calculator']);
        // observation fed back into the next prompt
        expect((invoke.mock.calls[1][0] as { prompt: string }).prompt).toContain('Observation: 360');
    });

    it('caps runaway loops at maxSteps and forces a summary final', async () => {
        const invoke = vi.fn(async (req: { systemPrompt?: string }) =>
            req.systemPrompt?.startsWith('Summarize')
                ? 'Best effort: partial findings.'
                : '{"thought": "more", "action": {"tool": "Web Search", "input": "again"}}');
        const runSkill = vi.fn(async () => ({ ok: true, text: 'some results' }));
        const r = await runReactLoop('endless task', '', { invoke, runSkill, skills: SKILLS, maxSteps: 2 });
        expect(runSkill).toHaveBeenCalledTimes(2);
        expect(r.ok).toBe(true);
        expect(r.result).toBe('Best effort: partial findings.');
    });

    it('unusable model output → ok:false (runner falls through)', async () => {
        const invoke = vi.fn(async () => 'I am not JSON at all');
        const r = await runReactLoop('task', '', { invoke, runSkill: async () => null, skills: SKILLS });
        expect(r.ok).toBe(false);
    });

    it('unknown tool becomes an observation, not a crash', async () => {
        const invoke = vi.fn()
            .mockResolvedValueOnce('{"thought": "try", "action": {"tool": "Nonexistent", "input": "x"}}')
            .mockResolvedValueOnce('{"final": "done without it"}');
        const r = await runReactLoop('task', '', { invoke, runSkill: async () => null, skills: SKILLS });
        expect(r.ok).toBe(true);
        expect(r.steps.find(s => s.type === 'observation')!.content).toMatch(/Unknown tool/);
    });
});

describe('merged registry + runner integration', () => {
    it('mergedToolNames = backend tools + browser skills, deduped', () => {
        const merged = mergedToolNames(['backend-search', BROWSER_SKILL_TOOLS[0]]);
        expect(merged).toContain('backend-search');
        for (const s of BROWSER_SKILL_TOOLS) expect(merged).toContain(s);
        expect(merged.filter(t => t === BROWSER_SKILL_TOOLS[0])).toHaveLength(1);
    });

    it('runHermes uses the ReAct loop when the backend is down (via: react)', async () => {
        const authFetch = vi.fn(async () => { throw new Error('backend down'); });
        const reactLoopFn = vi.fn(async () => ({
            steps: [{ type: 'final_answer' as const, content: 'loop answer', timestamp: 't' }],
            result: 'loop answer', ok: true, toolsUsed: ['Calculator'],
        }));
        const r = await runHermes('do the thing', {
            authFetch: authFetch as never,
            record: false,
            reactLoopFn,
        });
        expect(r.outcome).toBe('success');
        expect(r.via).toBe('react');
        expect(r.result).toBe('loop answer');
        expect(r.toolsUsed).toEqual(['Calculator']);
    });

    it('ReAct loop failure still falls through to the single-shot LLM', async () => {
        const authFetch = vi.fn(async () => { throw new Error('down'); });
        const r = await runHermes('do the thing', {
            authFetch: authFetch as never,
            record: false,
            reactLoopFn: async () => null,
            llmFallbackFn: async () => 'single-shot answer',
        });
        expect(r.via).toBe('llm');
        expect(r.result).toBe('single-shot answer');
    });
});

describe('buildReactLoopFn — autonomous tool allowlist (security)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        callLlmMock.mockReset();
    });

    it('the tool list offered to the model excludes Code Runner (JS)', async () => {
        callLlmMock.mockResolvedValueOnce({ text: '{"final": "no tools needed"}' });
        const loop = buildReactLoopFn({ active: null } as never);
        await loop('say hi', '');
        const systemPrompt = (callLlmMock.mock.calls[0][0] as { systemPrompt: string }).systemPrompt;
        expect(systemPrompt).not.toContain('Code Runner (JS)');
        expect(systemPrompt).toContain('Knowledge Graph');
    });

    it('asking for "Code Runner (JS)" never runs it — observation says not available', async () => {
        callLlmMock
            .mockResolvedValueOnce({ text: '{"thought": "escape", "action": {"tool": "Code Runner (JS)", "input": "fetch(\'/evil\')"}}' })
            .mockResolvedValueOnce({ text: '{"final": "done"}' });
        const loop = buildReactLoopFn({ active: null } as never);
        const result = await loop('run some js', '');
        // toolsUsed only records that a tool NAME was invoked, not that it ran —
        // the security guarantee is the observation, proving skill.run() never fired.
        const observation = result?.steps.find(s => s.type === 'observation')?.content ?? '';
        expect(observation.toLowerCase()).toContain('not available');
    });

    it('asking for the knowledge-graph tool by name runs it (mock fetch)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            json: async () => ({ success: true, data: { answer: 'NODE Roof Estimate' } }),
        })));
        callLlmMock
            .mockResolvedValueOnce({ text: '{"thought": "ask the graph", "action": {"tool": "Knowledge Graph", "input": "roof estimates"}}' })
            .mockResolvedValueOnce({ text: '{"final": "Roof Estimate is connected."}' });
        const loop = buildReactLoopFn({ active: null } as never);
        const result = await loop('what connects to roof estimates', '');
        expect(result?.toolsUsed).toContain('Knowledge Graph');
        const observation = result?.steps.find(s => s.type === 'observation')?.content ?? '';
        expect(observation).toContain('Roof Estimate');
    });
});
