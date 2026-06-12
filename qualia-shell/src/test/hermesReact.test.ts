/**
 * hermesReact — P11-6: multi-step ReAct loop + merged tool registry. Mock
 * LLM + mock skills throughout (no network).
 */
import { describe, it, expect, vi } from 'vitest';
import { runReactLoop, mergedToolNames, BROWSER_SKILL_TOOLS } from '../components/HonchoHermesPanel/hermesReact';
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
