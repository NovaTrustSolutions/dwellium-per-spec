/**
 * ARA refusal → solution ladder (2026-08-16, Ilya): "when I ask ARA to do
 * something she says she cannot — have her use Hermes, or suggest the tool
 * that could be implemented, not just a refusal."
 * Pure: refusal detector + injectable-runner orchestration; no fetch, no LLM.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    looksLikeRefusal,
    runAraEscalation,
    buildToolProposalSystemPrompt,
    type AraEscalationDeps,
} from '../components/ARAConsole/araEscalation';
import type { HermesRunResult } from '../components/HonchoHermesPanel/hermesRunner';

function hermesResult(over: Partial<HermesRunResult> = {}): HermesRunResult {
    return {
        steps: [{ type: 'action', content: 'Web Search: rent index', timestamp: 't1' }],
        result: 'Atlanta median rent is $1,850 (Zillow, Aug 2026).',
        outcome: 'success',
        toolsUsed: ['Web Search'],
        taskType: 'research',
        fewShotCount: 0,
        via: 'skill',
        ...over,
    };
}

// hasActiveLlm() is true when a provider is enabled with a key.
const LLM_ON = { active: 'openai', openai: { enabled: true, apiKey: 'sk-test', model: 'gpt-4o-mini' } } as unknown as AraEscalationDeps['llm'];
const LLM_OFF = { active: 'openai' } as unknown as AraEscalationDeps['llm'];

function deps(over: Partial<AraEscalationDeps> = {}): AraEscalationDeps {
    return {
        authFetch: vi.fn(async () => new Response('{}', { status: 500 })),
        llm: LLM_ON,
        search: undefined as unknown as AraEscalationDeps['search'],
        ...over,
    };
}

describe('looksLikeRefusal', () => {
    it.each([
        "I can't send emails from here, but I can draft one for you.",
        'I cannot access your Gmail account.',
        "I'm not able to book appointments directly.",
        "I don't have access to live MLS data.",
        "Sorry — that's not something I can do from this console.",
        'That is beyond my current capabilities in this app.',
        'I don’t have the ability to control the thermostat.',   // curly apostrophe
        "I don't have UI powers, so I can't open that window.",
    ])('flags: %s', (reply) => {
        expect(looksLikeRefusal(reply)).toBe(true);
    });

    it.each([
        "I can't wait to show you the Q3 numbers — here they are.",
        "Can't believe how clean this ledger is. All reconciled.",
        'Done — I opened Strata and filtered to overdue rent.',
        'Here is the summary you asked for:\n- 3 units vacant\n- 2 leases expiring',
        '',
    ])('does not flag: %s', (reply) => {
        expect(looksLikeRefusal(reply)).toBe(false);
    });

    it('only inspects the opening of the reply', () => {
        const longOk = 'Here is the plan.\n' + 'x'.repeat(600) + "\nI can't do the last step.";
        expect(looksLikeRefusal(longOk)).toBe(false);
    });
});

describe('runAraEscalation', () => {
    it('rung 1: returns the Hermes answer when Hermes succeeds', async () => {
        const runHermesFn = vi.fn(async () => hermesResult());
        const proposeFn = vi.fn(async () => 'SHOULD NOT RUN');
        const notes: string[] = [];
        const out = await runAraEscalation('what is median rent in Atlanta', "I can't look that up.", deps({ runHermesFn, proposeFn, onProgress: n => notes.push(n) }));
        expect(out.via).toBe('hermes');
        expect(out.text).toContain('Hermes');
        expect(out.text).toContain('$1,850');
        expect(runHermesFn).toHaveBeenCalledWith('what is median rent in Atlanta'); // original request, not the refusal
        expect(proposeFn).not.toHaveBeenCalled();
        expect(notes[0]).toMatch(/handing it to Hermes/i);
    });

    it('rung 2: proposes a tool when Hermes fails', async () => {
        const runHermesFn = vi.fn(async () => hermesResult({ outcome: 'fail', result: '', error: 'no tool matched', via: 'none' }));
        const proposeFn = vi.fn(async () => '**Proposed tool** — `skill-send-email` …\n\nnew goal: Build skill-send-email so ARA can send emails');
        const out = await runAraEscalation('email the owner about the leak', "I can't send emails.", deps({ runHermesFn, proposeFn }));
        expect(out.via).toBe('proposal');
        expect(out.text).toContain('skill-send-email');
        expect(out.text).toContain('new goal:');
        expect(out.proposalTitle).toMatch(/^Tool proposal: email the owner/);
        expect(proposeFn).toHaveBeenCalledWith('email the owner about the leak', "I can't send emails.");
    });

    it('treats a Hermes "success" that is itself a refusal as a failure', async () => {
        const runHermesFn = vi.fn(async () => hermesResult({ result: "I'm not able to do that either.", via: 'llm' }));
        const proposeFn = vi.fn(async () => 'new goal: Build skill-x so ARA can y');
        const out = await runAraEscalation('do x', "I can't do x.", deps({ runHermesFn, proposeFn }));
        expect(out.via).toBe('proposal');
    });

    it('rung 3: still gives a next step when Hermes throws and no LLM key exists', async () => {
        const runHermesFn = vi.fn(async () => { throw new Error('boom'); });
        const out = await runAraEscalation('do x', "I can't do x.", deps({ runHermesFn, llm: LLM_OFF }));
        expect(out.via).toBe('none');
        expect(out.text).toMatch(/Control Panel/);
    });

    it('rung 3 (LLM on, proposal empty): asks to retry rather than a bare refusal', async () => {
        const out = await runAraEscalation('do x', "I can't do x.", deps({
            runHermesFn: async () => hermesResult({ outcome: 'fail', result: '' }),
            proposeFn: async () => null,
        }));
        expect(out.via).toBe('none');
        expect(out.text).toMatch(/ask me again/i);
    });
});

describe('buildToolProposalSystemPrompt', () => {
    it('lists the live skill catalog and demands the queue line', () => {
        const p = buildToolProposalSystemPrompt();
        expect(p).toContain('Calculator');
        expect(p).toContain('Web Search');
        expect(p).toContain('notepad.insert-text');
        expect(p).toContain('new goal: Build');
    });
});
