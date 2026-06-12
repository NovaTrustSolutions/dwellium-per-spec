/**
 * agentOrchestrator — the Agent Lab run engine. Exercised end-to-end with a
 * MOCK LLM (no network): decompose → per-persona execute → verify-against-sources
 * → merge, plus Hermes recording and graceful no-LLM behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import { runTeam, runPersona, extractJson, type OrchestratorDeps, type RunEvent } from '../lib/agents/orchestrator';
import { DEFAULT_PERSONAS, type AgentTeam } from '../lib/agents/personas';

const TEAM: AgentTeam = {
    id: 't1', name: 'Test Squad', icon: 'search',
    memberIds: ['researcher', 'data-analyst'], orchestratorId: 'orchestrator', builtin: true,
};

/** A mock LLM that answers each phase based on the prompt markers. */
function mockInvoke(): OrchestratorDeps['invoke'] {
    return vi.fn(async (req) => {
        const p = req.prompt;
        if (req.responseFormat === 'json' && p.includes('Assign each member')) {
            return '```json\n[{"personaId":"researcher","tasks":["find facts"]},{"personaId":"data-analyst","tasks":["crunch numbers"]}]\n```';
        }
        if (p.includes('YOUR TASKS')) {
            const who = req.systemPrompt?.includes('Researcher') ? 'research output' : 'data output';
            return `[${who}]`;
        }
        if (req.responseFormat === 'json' && p.includes('Check every factual claim')) {
            return '{"supported": true, "verified": "verified: ok"}';
        }
        if (p.includes('Merge these into one')) {
            return 'FINAL MERGED DELIVERABLE';
        }
        return 'unexpected';
    });
}

describe('extractJson', () => {
    it('parses fenced JSON', () => {
        expect(extractJson('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
    });
    it('parses JSON embedded in prose', () => {
        expect(extractJson('Sure! {"supported": false, "verified": "x"} done.')).toEqual({ supported: false, verified: 'x' });
    });
    it('returns null on garbage', () => {
        expect(extractJson('no json here')).toBeNull();
        expect(extractJson(null)).toBeNull();
    });
});

describe('runTeam', () => {
    it('decomposes, executes each member, verifies, and merges', async () => {
        const invoke = mockInvoke();
        const record = vi.fn();
        const recall = vi.fn(() => '');
        const deps: OrchestratorDeps = { invoke, record, recall };
        const events: RunEvent[] = [];

        const result = await runTeam({
            goal: 'Assess the market',
            sources: 'SOURCE: the market grew 12% in 2025.',
            team: TEAM,
            personas: DEFAULT_PERSONAS,
            deps,
            onEvent: e => events.push(e),
        });

        // two members assigned + executed
        expect(result.assignments).toHaveLength(2);
        expect(result.outputs.map(o => o.personaId)).toEqual(['researcher', 'data-analyst']);
        // verification ran (sources present) and was applied
        expect(result.outputs[0].verified).toBe('verified: ok');
        expect(result.outputs[0].supported).toBe(true);
        // final merge
        expect(result.final).toBe('FINAL MERGED DELIVERABLE');
        // phases emitted in order
        expect(events.map(e => e.phase)).toEqual(
            expect.arrayContaining(['decompose', 'execute', 'verify', 'merge', 'done']),
        );
        // Hermes learned from each member run (self-improvement)
        expect(record).toHaveBeenCalledTimes(2);
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'research', outcome: 'success' }));
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'data', outcome: 'success' }));
        // few-shot recall consulted per member
        expect(recall).toHaveBeenCalledTimes(2);
    });

    it('fires onMemberTask (assigned → start → done) per member for the task lists', async () => {
        const invoke = mockInvoke();
        const member: Array<{ phase: string; personaId: string; title: string; durationMs?: number; ok?: boolean }> = [];
        await runTeam({
            goal: 'Assess the market',
            sources: 'SOURCE: the market grew 12% in 2025.',
            team: TEAM,
            personas: DEFAULT_PERSONAS,
            deps: { invoke },
            onMemberTask: e => member.push(e),
        });
        expect(member.filter(m => m.personaId === 'researcher').map(m => m.phase)).toEqual(['assigned', 'start', 'done']);
        expect(member.filter(m => m.personaId === 'data-analyst').map(m => m.phase)).toEqual(['assigned', 'start', 'done']);
        const done = member.find(m => m.personaId === 'researcher' && m.phase === 'done')!;
        expect(done.title).toContain('find facts');
        expect(typeof done.durationMs).toBe('number');
        expect(done.ok).toBe(true);
    });

    it('skips verification when no sources are provided', async () => {
        const invoke = mockInvoke();
        const result = await runTeam({ goal: 'Plan a launch', team: TEAM, personas: DEFAULT_PERSONAS, deps: { invoke } });
        // verified === raw output (no fact-check step)
        expect(result.outputs[0].verified).toBe(result.outputs[0].output);
        expect(result.outputs.every(o => o.supported)).toBe(true);
    });

    it('errors clearly on an empty goal', async () => {
        const result = await runTeam({ goal: '   ', team: TEAM, personas: DEFAULT_PERSONAS, deps: { invoke: vi.fn() } });
        expect(result.error).toMatch(/goal/i);
    });

    it('degrades gracefully when no LLM is available (invoke → null)', async () => {
        const invoke = vi.fn(async () => null);
        const record = vi.fn();
        const result = await runTeam({ goal: 'Do the thing', team: TEAM, personas: DEFAULT_PERSONAS, deps: { invoke, record } });
        // falls back to whole-goal assignments + a helpful no-key message
        expect(result.outputs).toHaveLength(2);
        expect(result.outputs[0].output).toMatch(/LLM key/i);
        // failures are recorded too
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'fail' }));
    });
});

describe('runPersona', () => {
    it('runs a single specialist and verifies against sources', async () => {
        const invoke = mockInvoke();
        const persona = DEFAULT_PERSONAS.find(p => p.id === 'researcher')!;
        const out = await runPersona({ goal: 'Summarize', sources: 'SOURCE: x', persona, deps: { invoke } });
        expect(out.personaId).toBe('researcher');
        expect(out.verified).toBe('verified: ok');
    });
});

describe('P11-5: equipped skills execute during member tasks', () => {
    it('runSkill output is injected into the member prompt as TOOL RESULTS', async () => {
        const invoke = mockInvoke();
        const runSkill = vi.fn(async (input: string, skillIds: string[]) =>
            skillIds.includes('skill-web-search')
                ? { name: 'Web Search', text: `results for ${input.slice(0, 20)}` }
                : null);
        const persona = DEFAULT_PERSONAS.find(p => p.id === 'researcher')!;
        await runPersona({ goal: 'comps', sources: '', persona, deps: { invoke, runSkill } });
        expect(runSkill).toHaveBeenCalledWith(expect.any(String), persona.tools);
        const memberCall = (invoke as ReturnType<typeof vi.fn>).mock.calls
            .map(c => c[0]).find((r: { prompt: string }) => r.prompt.includes('YOUR TASKS'));
        expect(memberCall.prompt).toContain('TOOL RESULTS');
        expect(memberCall.prompt).toContain('[Web Search]');
    });

    it('a throwing skill never sinks the member (best-effort)', async () => {
        const invoke = mockInvoke();
        const runSkill = vi.fn(async () => { throw new Error('tool down'); });
        const persona = DEFAULT_PERSONAS.find(p => p.id === 'researcher')!;
        const out = await runPersona({ goal: 'comps', sources: '', persona, deps: { invoke, runSkill } });
        expect(out.output).toBeTruthy();
    });
});
