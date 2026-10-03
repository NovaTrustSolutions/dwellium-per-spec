/**
 * Owner-race guard coverage for the agent run paths (orchestrator, Hermes runner, ReAct loop,
 * command chains, the autonomous task runner). Each drives a run through a deferred await,
 * switches the active user mid-await (perUserIdentity's `setPerUserIdentity`), and asserts the
 * late write is DROPPED — never redirected into the new user's stores — and that no further
 * step runs on the old user's behalf. See ownerGuard.test.ts for the base primitive.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setPerUserIdentity, ACCOUNT_CHANGED } from '../lib/perUserIdentity';
import { runAraEscalation } from '../components/ARAConsole/araEscalation';
import { runTeam, runPersona, type OrchestratorDeps, type MemberTaskEvent } from '../lib/agents/orchestrator';
import { DEFAULT_PERSONAS, type AgentTeam } from '../lib/agents/personas';
import { runHermes } from '../components/HonchoHermesPanel/hermesRunner';
import { runReactLoop } from '../components/HonchoHermesPanel/hermesReact';
import { executeChain, type CommandChain } from '../lib/conductorChain';
import type { AgentSkill } from '../lib/agents/skills';
import { runNextHermesTask } from '../services/hermesAutonomousRunner';

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const switchAccount = () => { setPerUserIdentity(null); setPerUserIdentity('user-b'); };

const TEAM: AgentTeam = {
    id: 't1', name: 'Test Squad', icon: 'search',
    memberIds: ['researcher', 'data-analyst'], orchestratorId: 'orchestrator', builtin: true,
};
const researcher = DEFAULT_PERSONAS.find(p => p.id === 'researcher')!;
const labyrinth = DEFAULT_PERSONAS.find(p => p.id === 'hermes-labyrinth')!;

describe('owner-race guard — agent run paths', () => {
    beforeEach(() => setPerUserIdentity('user-a'));

    it('runPersona: account switches mid-LLM-call → the run is not recorded', async () => {
        const d = deferred<string | null>();
        const record = vi.fn(() => ({ id: 'r1' }));
        const run = runPersona({ goal: 'g', persona: researcher, deps: { invoke: () => d.promise, record } });
        await tick();
        switchAccount();
        d.resolve('an answer');
        const out = await run;
        expect(record).not.toHaveBeenCalled();
        expect(out.recordId).toBeUndefined();
    });

    it('runTeam: account switches during the first member → nothing recorded, no later member runs', async () => {
        const d = deferred<string | null>();
        const prompts: string[] = [];
        const invoke: OrchestratorDeps['invoke'] = vi.fn(async (req) => {
            prompts.push(req.prompt);
            if (req.responseFormat === 'json' && req.prompt.includes('Assign each member')) {
                return '[{"personaId":"researcher","tasks":["a"]},{"personaId":"data-analyst","tasks":["b"]}]';
            }
            return d.promise;
        });
        const record = vi.fn(() => ({ id: 'r1' }));
        const events: MemberTaskEvent[] = [];
        const run = runTeam({ goal: 'g', team: TEAM, personas: DEFAULT_PERSONAS, deps: { invoke, record }, onMemberTask: e => events.push(e) });
        await tick();
        switchAccount();
        d.resolve('member answer');
        const res = await run;
        expect(record).not.toHaveBeenCalled();
        expect(events.map(e => e.phase)).toEqual(['assigned', 'start']); // no 'done', no second member
        expect(prompts.filter(p => p.includes('YOUR TASKS'))).toHaveLength(1);
        expect(res.outcome).toBe('fail');
        expect(res.error).toMatch(/account changed/i);
        expect(res.final).toBe('');
    });

    it('control: runTeam with no switch records every member', async () => {
        const invoke: OrchestratorDeps['invoke'] = vi.fn(async (req) => (
            req.responseFormat === 'json' && req.prompt.includes('Assign each member')
                ? '[{"personaId":"researcher","tasks":["a"]},{"personaId":"data-analyst","tasks":["b"]}]'
                : 'text'));
        const record = vi.fn(() => ({ id: 'r1' }));
        const res = await runTeam({ goal: 'g', team: TEAM, personas: DEFAULT_PERSONAS, deps: { invoke, record } });
        expect(record).toHaveBeenCalledTimes(2);
        expect(res.error).toBeUndefined();
    });

    it('runHermes: account switches mid-delegate → the run is not recorded', async () => {
        const d = deferred<Response>();
        const recordRunFn = vi.fn();
        const run = runHermes('task', {
            authFetch: () => d.promise, recordRunFn: recordRunFn as any,
            relevantPastRunsFn: () => [], learningSnapshot: () => [],
        });
        await tick();
        switchAccount();
        d.resolve({ json: async () => ({ success: true, data: { answer: 'done' } }) } as Response);
        const out = await run;
        expect(recordRunFn).not.toHaveBeenCalled();
        expect(out.recordId).toBeUndefined();
        expect(out.outcome).toBe('fail'); // callers (Honcho panel, Stella, ARA escalation) write only on success
        expect(out.error).toBe(ACCOUNT_CHANGED);
    });

    it('runReactLoop: account switches mid-reasoning → no skill runs', async () => {
        const d = deferred<string | null>();
        const runSkill = vi.fn(async () => ({ ok: true, text: 'obs' }));
        const run = runReactLoop('task', '', {
            invoke: vi.fn().mockReturnValueOnce(d.promise).mockResolvedValue('final'),
            runSkill, skills: [{ name: 'Web Search', description: 'search' }],
        });
        await tick();
        switchAccount();
        d.resolve('{"thought":"t","action":{"tool":"Web Search","input":"q"}}');
        const out = await run;
        expect(runSkill).not.toHaveBeenCalled();
        expect(out.ok).toBe(false);
    });

    it('executeChain: account switches during step 1 → step 2 never runs', async () => {
        const d = deferred<{ ok: boolean; text: string }>();
        const step2 = vi.fn(async () => ({ ok: true, text: 'two' }));
        const skill = (id: string, run: () => Promise<unknown>) => ({ id, name: id, description: '', run } as unknown as AgentSkill);
        const chain: CommandChain = {
            label: 'x',
            steps: [
                { kind: 'skill', clause: 'one', label: 'one', skill: { skill: skill('s1', () => d.promise), arg: 'a' } },
                { kind: 'skill', clause: 'two', label: 'two', skill: { skill: skill('s2', step2), arg: 'b' } },
            ],
        };
        const run = executeChain(chain, { llm: {} as any });
        await tick();
        switchAccount();
        d.resolve({ ok: true, text: 'one' });
        const outcomes = await run;
        expect(step2).not.toHaveBeenCalled();
        expect(outcomes[outcomes.length - 1].ok).toBe(false);
    });

    it('runNextHermesTask: account switches mid-run → no complete/fail/remember', async () => {
        const d = deferred<any>();
        const complete = vi.fn(); const fail = vi.fn(); const remember = vi.fn();
        const run = runNextHermesTask({
            personas: [labyrinth],
            claim: () => ({ personaId: labyrinth.id, task: { id: 't', title: 'Map', status: 'running', assignedBy: 'user', createdAt: 1 } }),
            orchestratorDeps: { invoke: vi.fn(async () => 'unused') },
            complete, fail, remember, wikiContext: () => '', personaMemory: () => '',
            runPersonaFn: (() => d.promise) as any,
        });
        await tick();
        switchAccount();
        d.resolve({ personaId: labyrinth.id, personaName: 'L', tasks: [], output: 'x', verified: 'x', supported: true, ok: true, verifyStatus: 'verified' });
        expect(await run).toBeNull();
        expect(complete).not.toHaveBeenCalled();
        expect(fail).not.toHaveBeenCalled();
        expect(remember).not.toHaveBeenCalled();
    });

    it('runNextHermesTask: account switches during recall → the persona never runs', async () => {
        const d = deferred<string>();
        const runPersonaFn = vi.fn();
        const run = runNextHermesTask({
            personas: [labyrinth],
            claim: () => ({ personaId: labyrinth.id, task: { id: 't', title: 'Map', status: 'running', assignedBy: 'user', createdAt: 1 } }),
            orchestratorDeps: { invoke: vi.fn(async () => 'unused') },
            complete: vi.fn(), fail: vi.fn(), remember: vi.fn(), wikiContext: () => '', personaMemory: () => '',
            recall: () => d.promise, runPersonaFn: runPersonaFn as any,
        });
        await tick();
        switchAccount();
        d.resolve('memory');
        expect(await run).toBeNull();
        expect(runPersonaFn).not.toHaveBeenCalled();
    });
    it('runHermes: switch during the delegate call → no offline fallback runs (none can capture the new owner)', async () => {
        const d = deferred<Response>();
        const skillFallbackFn = vi.fn(async () => null);
        const reactLoopFn = vi.fn(async () => null);
        const llmFallbackFn = vi.fn(async () => 'x');
        const run = runHermes('task', {
            authFetch: () => d.promise, recordRunFn: vi.fn() as any, relevantPastRunsFn: () => [], learningSnapshot: () => [],
            skillFallbackFn, reactLoopFn, llmFallbackFn,
        });
        await tick();
        switchAccount();
        d.resolve({ json: async () => ({ success: false, error: 'delegate down' }) } as Response);
        const out = await run;
        expect(skillFallbackFn).not.toHaveBeenCalled();
        expect(reactLoopFn).not.toHaveBeenCalled();
        expect(llmFallbackFn).not.toHaveBeenCalled();
        expect(out.outcome).toBe('fail');
    });

    it('runHermes: switch during the ReAct loop → the single-shot LLM fallback does not run', async () => {
        const d = deferred<null>();
        const llmFallbackFn = vi.fn(async () => 'x');
        const run = runHermes('task', {
            authFetch: async () => ({ json: async () => ({ success: false }) }) as Response,
            recordRunFn: vi.fn() as any, relevantPastRunsFn: () => [], learningSnapshot: () => [],
            reactLoopFn: () => d.promise, llmFallbackFn,
        });
        await tick();
        switchAccount();
        d.resolve(null);
        const out = await run;
        expect(llmFallbackFn).not.toHaveBeenCalled();
        expect(out.outcome).toBe('fail');
    });

    it('runPersona with Sources: switch during the answer → the fact-check is never sent', async () => {
        const d = deferred<string | null>();
        const invoke = vi.fn().mockReturnValueOnce(d.promise).mockResolvedValue('{"supported": true, "verified": "v"}');
        const run = runPersona({ goal: 'g', sources: 'S', persona: researcher, deps: { invoke } });
        await tick();
        switchAccount();
        d.resolve('answer');
        const out = await run;
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(out.ok).toBe(false);
        expect(out.error).toBe(ACCOUNT_CHANGED);
    });

    it('runTeam with Sources: switch during a member → its fact-check is never sent', async () => {
        const d = deferred<string | null>();
        const prompts: string[] = [];
        const invoke: OrchestratorDeps['invoke'] = vi.fn(async (req) => {
            prompts.push(req.prompt);
            if (req.responseFormat === 'json' && req.prompt.includes('Assign each member')) return '[{"personaId":"researcher","tasks":["a"]}]';
            if (req.prompt.includes('YOUR TASKS')) return d.promise;
            return '{"supported": true, "verified": "v"}';
        });
        const run = runTeam({ goal: 'g', sources: 'S', team: TEAM, personas: DEFAULT_PERSONAS, deps: { invoke } });
        await tick();
        switchAccount();
        d.resolve('answer');
        await run;
        expect(prompts.some(p => p.includes('Check every factual claim'))).toBe(false);
    });

    it('equipped tools: switch during a tool → the member LLM call is never made', async () => {
        const d = deferred<{ name: string; text: string } | null>();
        const invoke = vi.fn(async () => 'answer');
        const run = runPersona({ goal: 'g', persona: { ...researcher, tools: ['skill-web-search'] }, deps: { invoke, runSkill: () => d.promise } });
        await tick();
        switchAccount();
        d.resolve({ name: 'Web Search', text: 'result' });
        await run;
        expect(invoke).not.toHaveBeenCalled();
    });

    it('equipped tools: switch during the first of several tools → the rest never run on the old key', async () => {
        const d = deferred<{ name: string; text: string } | null>();
        const runSkill = vi.fn().mockReturnValueOnce(d.promise).mockResolvedValue({ name: 'Web Search', text: 'r' });
        const invoke: OrchestratorDeps['invoke'] = vi.fn(async (req) => (
            req.responseFormat === 'json' ? '[{"personaId":"researcher","tasks":["a","b","c","d"]}]' : 'answer'));
        const run = runTeam({ goal: 'g', team: TEAM, personas: DEFAULT_PERSONAS.map(p => (p.id === 'researcher' ? { ...p, tools: ['skill-web-search'] } : p)), deps: { invoke, runSkill } });
        await tick();
        switchAccount();
        d.resolve({ name: 'Web Search', text: 'r' });
        const res = await run;
        expect(runSkill).toHaveBeenCalledTimes(1);
        expect(res.error).toBe(ACCOUNT_CHANGED);
    });

    it('runReactLoop: switch during a tool → no further LLM call', async () => {
        const d = deferred<{ ok: boolean; text: string }>();
        const invoke = vi.fn()
            .mockResolvedValueOnce('{"thought":"t","action":{"tool":"Web Search","input":"q"}}')
            .mockResolvedValue('{"thought":"t","final":"done"}');
        const run = runReactLoop('task', '', { invoke, runSkill: () => d.promise, skills: [{ name: 'Web Search', description: 'search' }] });
        await tick();
        switchAccount();
        d.resolve({ ok: true, text: 'obs' });
        const out = await run;
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(out.ok).toBe(false);
    });

    it('runAraEscalation: switch while Hermes works → no tool proposal is drafted', async () => {
        const d = deferred<any>();
        const proposeFn = vi.fn(async () => 'a proposal');
        const run = runAraEscalation('send the email', 'I cannot send email.', {
            authFetch: vi.fn() as any, llm: {} as any, search: {} as any, runHermesFn: () => d.promise, proposeFn,
        });
        await tick();
        switchAccount();
        d.resolve({ outcome: 'fail', steps: [], result: '', toolsUsed: [], taskType: 'general', fewShotCount: 0, via: 'none' });
        const out = await run;
        expect(proposeFn).not.toHaveBeenCalled();
        expect(out.proposalTitle).toBeUndefined();
        expect(out.text).toBe(ACCOUNT_CHANGED);
    });
});
