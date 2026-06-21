/**
 * conductorChain — Phase-10 Task 10.4 (A3): command+skill chaining. Verifies
 * the parse gate (all-clauses-resolve + ≥1 skill), sequential execution with
 * event dispatch, result piping, and the evaluateMath "of" fix backing the
 * BACKLOG headline example.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseChain, executeChain, cleanResultForPiping } from '../lib/conductorChain';
import { evaluateMath, matchSkill, runSkillForInput } from '../lib/agents/skills';
import { agentTeamsStore, agentLabUserIdHolder } from '../lib/agents/agentTeamsStore';
import type { IntegrationsBundle } from '../types/integrations';

const noLlm = { active: null } as unknown as IntegrationsBundle['llm'];

beforeEach(() => {
    agentLabUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
});

describe('evaluateMath "of" support (BACKLOG headline example)', () => {
    it('computes "15% of 2400" = 360', () => {
        expect(evaluateMath('15% of 2400')).toBe(360);
    });
    it('still rejects non-math identifiers', () => {
        expect(evaluateMath('drop tables of users')).toBeNull();
    });
});

describe('parseChain gate', () => {
    it('parses the BACKLOG example into command + skill steps', () => {
        const chain = parseChain('open notepad and calculate 15% of 2400');
        expect(chain).not.toBeNull();
        expect(chain!.steps.map(s => s.kind)).toEqual(['command', 'skill']);
        expect(chain!.steps[0].label.toLowerCase()).toContain('notepad');
        expect(chain!.steps[1].skill!.arg).toBe('15% of 2400');
    });

    it('strips politeness first', () => {
        const chain = parseChain('Hey ARA, could you open notepad and calculate 2+2 please?');
        expect(chain?.steps.map(s => s.kind)).toEqual(['command', 'skill']);
    });

    it('returns null for command-only chains (parseCommand keeps them)', () => {
        expect(parseChain('open notepad and dark mode')).toBeNull();
    });

    it('returns null for single-intent inputs', () => {
        expect(parseChain('calculate 15% of 2400')).toBeNull();
        expect(parseChain('open notepad')).toBeNull();
    });

    it('returns null when any clause is chat-shaped (whole input → LLM)', () => {
        expect(parseChain('open notepad and tell me a joke')).toBeNull();
    });

    it('returns null for no-split verbs and spawn-claimed inputs', () => {
        expect(parseChain('remember milk and eggs')).toBeNull();
        expect(parseChain('spawn research squad on caching and bundle size')).toBeNull();
    });

    it('supports "then" connectors and 3 steps', () => {
        const chain = parseChain('open notepad then calculate 2+2 then open strata');
        expect(chain?.steps).toHaveLength(3);
        expect(chain?.steps.map(s => s.kind)).toEqual(['command', 'skill', 'command']);
    });
});

describe('executeChain', () => {
    it('runs command steps (dispatches open-widget) and skill steps (calculator) in order', async () => {
        const opened: unknown[] = [];
        const onOpen = (ev: Event) => opened.push((ev as CustomEvent).detail);
        window.addEventListener('dwellium:open-widget', onOpen);
        try {
            const chain = parseChain('open notepad and calculate 15% of 2400')!;
            const stepOrder: string[] = [];
            const outcomes = await executeChain(chain, { llm: noLlm }, (_i, o) => stepOrder.push(o.step.kind));
            expect(stepOrder).toEqual(['command', 'skill']);
            expect(outcomes.every(o => o.ok)).toBe(true);
            expect(outcomes[1].text).toContain('360');
            expect(opened.length).toBe(1);
        } finally {
            window.removeEventListener('dwellium:open-widget', onOpen);
        }
    });

    it('pipes "the result" from one skill into the next', async () => {
        const chain = parseChain('calculate 15% of 2400 and calculate 10 + 350')!;
        // Build the piped variant explicitly: second clause references the result.
        const piped = parseChain('calculate 15% of 2400 and calculate the result + 10');
        expect(piped).not.toBeNull();
        const outcomes = await executeChain(piped!, { llm: noLlm });
        expect(outcomes[1].ok).toBe(true);
        expect(outcomes[1].text).toContain('370');
        // sanity: non-piped sibling also works
        const plain = await executeChain(chain, { llm: noLlm });
        expect(plain[1].text).toContain('360');
    });

    it('a failing skill step is flagged but does not halt the chain', async () => {
        const chain = parseChain('calculate elephants plus giraffes and open notepad');
        // "calculate elephants plus giraffes" matches the calculator trigger but
        // fails evaluation → ok:false; the command step still runs.
        expect(chain).not.toBeNull();
        const outcomes = await executeChain(chain!, { llm: noLlm });
        expect(outcomes[0].ok).toBe(false);
        expect(outcomes[1].ok).toBe(true);
    });
});

describe('P11-3: spawn-in-chain', () => {
    it('"then"-split chains a spawn with a skill, preserving and-in-goal', () => {
        const chain = parseChain('spawn build team on caching and bundle size then calculate 2+2');
        expect(chain).not.toBeNull();
        expect(chain!.steps.map(s => s.kind)).toEqual(['spawn', 'skill']);
        expect(chain!.steps[0].spawn).toMatchObject({ kind: 'team', id: 'build-team', goal: 'caching and bundle size' });
    });

    it('whole-input spawns (no "then") still belong to the spawn path', () => {
        expect(parseChain('spawn research squad on comps and trends')).toBeNull();
    });

    it('executes the spawn via the host runner and pipes its result', async () => {
        const chain = parseChain('spawn research squad on comps then calculate the result + 10')!;
        const runner = vi.fn(async () => ({ ok: true, text: '12' }));
        const outcomes = await executeChain(chain, { llm: noLlm }, undefined, runner);
        expect(runner).toHaveBeenCalledWith(expect.objectContaining({ id: 'research-squad', goal: 'comps' }));
        expect(outcomes[0].ok).toBe(true);
        expect(outcomes[1].text).toContain('22');
    });

    it('spawn steps without a runner fail honestly and do not halt the chain', async () => {
        const chain = parseChain('spawn research squad on comps then calculate 2+2')!;
        const outcomes = await executeChain(chain, { llm: noLlm });
        expect(outcomes[0].ok).toBe(false);
        expect(outcomes[0].text).toMatch(/runner/i);
        expect(outcomes[1].ok).toBe(true);
    });
});

describe('cleanResultForPiping', () => {
    it('strips markdown and collapses whitespace', () => {
        expect(cleanResultForPiping('**15% of 2400 = 360**')).toBe('15% of 2400 = 360');
        expect(cleanResultForPiping('`a`\n\n b')).toBe('a b');
    });
});

// ── Prompt-injection trust boundary (provenance gate) ─────────────────
// Skill triggers resolve on raw text and can run arbitrary effects (the code
// runner's `new Function`, the widget-action bus, memory writes). They must
// only fire for HUMAN-composer input — text from an LLM/web/tool/file response
// is untrusted and must not be able to trigger a skill, especially the code
// runner. These tests assert the gate fires for non-user origin but is a no-op
// for user origin (today's behavior is preserved exactly).
describe('provenance gate — skill matching only on user-origin input', () => {
    it('matchSkill resolves user-typed input but NOT model/web/file/tool text', () => {
        const inj = 'run js: 1 + 1'; // a code-runner trigger
        // user (the human typed it) → matches, exactly as before.
        expect(matchSkill(inj, undefined, 'user')?.skill.id).toBe('skill-code-runner');
        // default origin is 'user' → unchanged for existing callers.
        expect(matchSkill(inj)?.skill.id).toBe('skill-code-runner');
        // injected text from a model/web/file/tool response → NO match, NO skill.
        expect(matchSkill(inj, undefined, 'model')).toBeNull();
        expect(matchSkill(inj, undefined, 'web')).toBeNull();
        expect(matchSkill(inj, undefined, 'file')).toBeNull();
        expect(matchSkill(inj, undefined, 'tool')).toBeNull();
    });

    it('runSkillForInput executes for user origin but is inert for non-user origin (code runner unreachable)', async () => {
        const exec = 'run js: 21 * 2';
        // user origin → the code runner actually runs.
        const userRun = await runSkillForInput(exec, { llm: noLlm }, undefined, 'user');
        expect(userRun?.skill.id).toBe('skill-code-runner');
        expect(userRun?.text).toContain('42');
        // model origin → null: a prompt-injection payload in an LLM/tool reply
        // can never reach `skill.run`, so `new Function` never executes.
        expect(await runSkillForInput(exec, { llm: noLlm }, undefined, 'model')).toBeNull();
        // and the default (no origin arg) stays user-trusted — existing callers
        // (Hermes panel, orchestrator deps) behave exactly as today.
        expect((await runSkillForInput(exec, { llm: noLlm }))?.skill.id).toBe('skill-code-runner');
    });

    it('parseChain claims a chain for user origin but not for model/web origin', () => {
        const utter = 'open notepad and calculate 15% of 2400';
        // user (and default) → the chain resolves as before.
        expect(parseChain(utter, 'user')).not.toBeNull();
        expect(parseChain(utter)).not.toBeNull();
        // injected text → the skill clause can't resolve, so buildChain bails
        // (no command-only chains either) → null, whole input is left to chat.
        expect(parseChain(utter, 'model')).toBeNull();
        expect(parseChain(utter, 'web')).toBeNull();
    });

    it('a piped (possibly web/LLM-derived) result is NOT fed into the code runner', async () => {
        // First clause = calculator (= 360); second clause WOULD pipe that result
        // into the code runner. The calculator-piping feature stays intact, but
        // the code runner must run its LITERAL clause, never the piped value —
        // so model/web-derived text can't become executed JS via RESULT_REF.
        const chain = parseChain('calculate 15% of 2400 and run js: the result')!;
        expect(chain.steps.map(s => s.kind)).toEqual(['skill', 'skill']);
        expect(chain.steps[1].skill!.skill.id).toBe('skill-code-runner');
        const outcomes = await executeChain(chain, { llm: noLlm });
        expect(outcomes[0].text).toContain('360'); // calculator still works
        // The code runner saw the literal string "the result" (not 360); that is
        // not valid JS, so it throws — proving the piped value never reached it.
        expect(outcomes[1].text).not.toContain('360');
        // contrast: piping INTO the calculator stays allowed (whitelist-only eval).
        const calc = parseChain('calculate 15% of 2400 and calculate the result + 10')!;
        const calcOut = await executeChain(calc, { llm: noLlm });
        expect(calcOut[1].text).toContain('370');
    });
});
