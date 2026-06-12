/**
 * conductorChain — Phase-10 Task 10.4 (A3): command+skill chaining. Verifies
 * the parse gate (all-clauses-resolve + ≥1 skill), sequential execution with
 * event dispatch, result piping, and the evaluateMath "of" fix backing the
 * BACKLOG headline example.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseChain, executeChain, cleanResultForPiping } from '../lib/conductorChain';
import { evaluateMath } from '../lib/agents/skills';
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
