/**
 * Cycle 17 Part B — Stella → Hermes first-class spawn.
 * Pure parse/format + injectable-runner orchestration; no DOM, no real fetch,
 * no learning store. Verifies the chat command surface and that the spawn path
 * reuses the shared runner (it does not introduce a second fetch path).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    parseHermesCommand,
    formatHermesReply,
    spawnHermesFromStella,
} from '../components/StellaAgent/stellaHermesSpawn';
import type { HermesRunResult } from '../components/HonchoHermesPanel/hermesRunner';

function result(over: Partial<HermesRunResult> = {}): HermesRunResult {
    return {
        steps: [
            { type: 'thought', content: 'Processing: "x"', timestamp: 't0' },
            { type: 'action', content: 'search the docs', timestamp: 't1' },
            { type: 'final_answer', content: 'Done.', timestamp: 't2' },
        ],
        result: 'Here is the answer.',
        outcome: 'success',
        toolsUsed: ['search'],
        taskType: 'research',
        fewShotCount: 0,
        ...over,
    };
}

describe('parseHermesCommand', () => {
    it('matches /hermes <task>', () => {
        expect(parseHermesCommand('/hermes summarize the reports')).toEqual({
            isHermes: true, task: 'summarize the reports',
        });
    });

    it('matches /hermes with no task (usage)', () => {
        expect(parseHermesCommand('/hermes')).toEqual({ isHermes: true, task: '' });
        expect(parseHermesCommand('  /hermes   ')).toEqual({ isHermes: true, task: '' });
    });

    it('matches "spawn hermes: <task>" and "spawn hermes <task>" case-insensitively', () => {
        expect(parseHermesCommand('spawn hermes: do a thing')).toEqual({ isHermes: true, task: 'do a thing' });
        expect(parseHermesCommand('Spawn Hermes find the lease')).toEqual({ isHermes: true, task: 'find the lease' });
    });

    it('does NOT match ordinary chat or partial words', () => {
        expect(parseHermesCommand('Hello').isHermes).toBe(false);
        expect(parseHermesCommand('tell me about hermes the agent').isHermes).toBe(false);
        expect(parseHermesCommand('/hermess typo').isHermes).toBe(false);
        expect(parseHermesCommand('').isHermes).toBe(false);
    });
});

describe('formatHermesReply', () => {
    it('renders a success reply with answer, trace, and learning footer', () => {
        const md = formatHermesReply(result({ fewShotCount: 2, toolsUsed: ['search', 'read'] }));
        expect(md).toContain('Hermes** completed');
        expect(md).toContain('Here is the answer.');
        expect(md).toContain('<details><summary>Trace</summary>');
        expect(md).toContain('search the docs');
        expect(md).not.toContain('Done.'); // final_answer excluded from trace
        expect(md).toContain('learned from 2 similar past runs');
        expect(md).toContain('search, read');
    });

    it('renders a failure reply with the error and no learning footer when none', () => {
        const md = formatHermesReply(result({
            outcome: 'fail', result: '', error: 'backend offline', toolsUsed: [], fewShotCount: 0,
            steps: [{ type: 'final_answer', content: 'Error: backend offline', timestamp: 't' }],
        }));
        expect(md).toContain('could not finish');
        expect(md).toContain('⚠️ backend offline');
        expect(md).not.toContain('learned from');
        expect(md).not.toContain('Trace'); // only final_answer present → no trace block
    });

    it('singularizes the few-shot footer at count 1', () => {
        expect(formatHermesReply(result({ fewShotCount: 1 }))).toContain('1 similar past run');
    });
});

describe('spawnHermesFromStella', () => {
    it('delegates to the injected runner and returns result + formatted reply', async () => {
        const run = vi.fn().mockResolvedValue(result());
        const authFetch = vi.fn();
        const out = await spawnHermesFromStella('find the lease', { run, authFetch, toolNames: ['search'] });

        expect(run).toHaveBeenCalledOnce();
        const [task, deps] = run.mock.calls[0];
        expect(task).toBe('find the lease');
        expect(deps.authFetch).toBe(authFetch);
        expect(deps.toolNames).toEqual(['search']);
        expect(out.result.outcome).toBe('success');
        expect(out.reply).toContain('Here is the answer.');
    });

    it('surfaces a failed run gracefully (runner never throws)', async () => {
        const run = vi.fn().mockResolvedValue(result({ outcome: 'fail', result: '', error: 'boom' }));
        const out = await spawnHermesFromStella('x', { run, authFetch: vi.fn() });
        expect(out.result.outcome).toBe('fail');
        expect(out.reply).toContain('⚠️ boom');
    });
});
