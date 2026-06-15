import { describe, it, expect } from 'vitest';
import {
    averageTaskMs,
    computePersonaStatus,
    estimateCompletion,
    type ProviderReadiness,
} from '../lib/agents/hermesStatus';
import type { PersonaTask, PersonaWork } from '../lib/agents/personaWorkStore';

const T0 = 1_700_000_000_000;

function task(partial: Partial<PersonaTask>): PersonaTask {
    return {
        id: 't1',
        title: 'Task',
        status: 'todo',
        assignedBy: 'user',
        createdAt: T0,
        ...partial,
    };
}
function work(tasks: PersonaTask[]): PersonaWork {
    return { memory: [], tasks, audit: [], usageCount: 0 };
}

const READY: ProviderReadiness = { ready: true, provider: 'anthropic', fallback: false };
const NOT_READY: ProviderReadiness = { ready: false, provider: 'anthropic', fallback: false };
const NO_PROVIDER: ProviderReadiness = { ready: false, provider: null, fallback: false };

describe('computePersonaStatus', () => {
    it('is red + Unavailable when the provider is not wired', () => {
        const s = computePersonaStatus(NOT_READY, work([]), T0);
        expect(s.tone).toBe('red');
        expect(s.label).toBe('Unavailable');
        expect(s.hint).toContain('anthropic');
    });

    it('red hint asks for a key when no provider is assigned', () => {
        const s = computePersonaStatus(NO_PROVIDER, work([]), T0);
        expect(s.tone).toBe('red');
        expect(s.hint).toMatch(/add an llm key/i);
    });

    it('is green + Ready when wired and idle', () => {
        const s = computePersonaStatus(READY, work([task({ status: 'done', durationMs: 1000 })]), T0);
        expect(s.tone).toBe('green');
        expect(s.label).toBe('Ready');
    });

    it('counts queued todos while staying green', () => {
        const s = computePersonaStatus(
            READY,
            work([task({ id: 'a', status: 'todo' }), task({ id: 'b', status: 'todo' })]),
            T0,
        );
        expect(s.tone).toBe('green');
        expect(s.queued).toBe(2);
    });

    it('is yellow + On task with the running task and an ETA', () => {
        const running = task({ id: 'r', status: 'running', startedAt: T0 - 10_000, title: 'Draft memo' });
        const done = task({ id: 'd', status: 'done', durationMs: 60_000 });
        const s = computePersonaStatus(READY, work([running, done]), T0);
        expect(s.tone).toBe('yellow');
        expect(s.label).toBe('On task');
        expect(s.runningTask?.id).toBe('r');
        expect(s.etaText).toMatch(/left|wrapping up/);
    });
});

describe('averageTaskMs', () => {
    it('averages completed-task durations only', () => {
        const w = work([
            task({ id: '1', status: 'done', durationMs: 1000 }),
            task({ id: '2', status: 'done', durationMs: 3000 }),
            task({ id: '3', status: 'running' }),
        ]);
        expect(averageTaskMs(w)).toBe(2000);
    });
    it('is null without completed history', () => {
        expect(averageTaskMs(work([task({ status: 'todo' })]))).toBeNull();
        expect(averageTaskMs(undefined)).toBeNull();
    });
});

describe('estimateCompletion', () => {
    it('returns estimating… without history', () => {
        const r = estimateCompletion(task({ status: 'running', startedAt: T0 }), null, T0);
        expect(r.etaText).toBe('estimating…');
        expect(r.remainingMs).toBeNull();
    });
    it('reports remaining time mid-run', () => {
        const r = estimateCompletion(task({ status: 'running', startedAt: T0 }), 60_000, T0 + 20_000);
        expect(r.remainingMs).toBe(40_000);
        expect(r.etaText).toMatch(/left/);
    });
    it('says wrapping up… past the estimate', () => {
        const r = estimateCompletion(task({ status: 'running', startedAt: T0 }), 10_000, T0 + 30_000);
        expect(r.remainingMs).toBe(0);
        expect(r.etaText).toBe('wrapping up…');
    });
});
