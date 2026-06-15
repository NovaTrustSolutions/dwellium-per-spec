/**
 * personaWorkStore — per-persona tasks (with completion durations), a memory
 * that grows with use, and an audit log. All persist per-user.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    personaWorkStore, personaWorkUserIdHolder,
    addTask, startTask, completeTask, failTask, retryTask, claimNextTask, recoverStaleTasks,
    addMemory, logAudit, recordRun, getWork, formatMemory, formatDuration,
} from '../lib/agents/personaWorkStore';

beforeEach(() => {
    personaWorkUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (personaWorkStore as unknown as { reset?: () => void }).reset?.();
});

describe('personaWorkStore', () => {
    it('tracks a task through todo → running → done with a duration', () => {
        addTask('researcher', 'Find sources', 'user');
        const t = getWork('researcher').tasks[0];
        expect(t.status).toBe('todo');
        expect(t.assignedBy).toBe('user');
        startTask('researcher', t.id);
        expect(getWork('researcher').tasks[0].status).toBe('running');
        completeTask('researcher', t.id, 'output');
        const done = getWork('researcher').tasks[0];
        expect(done.status).toBe('done');
        expect(typeof done.durationMs).toBe('number');
        expect(done.completedAt).toBeTruthy();
    });

    it('accepts orchestrator-assigned tasks', () => {
        addTask('engineer', 'Refactor module', 'orchestrator');
        expect(getWork('engineer').tasks[0].assignedBy).toBe('orchestrator');
    });

    it('grows memory + usage on recordRun and injects it into the prompt', () => {
        recordRun('researcher', 'Summarized the lease', 1200, 'success');
        const w = getWork('researcher');
        expect(w.usageCount).toBe(1);
        expect(w.memory.length).toBe(1);
        expect(w.memory[0].kind).toBe('learned');
        expect(w.audit.some(a => a.action === 'Run')).toBe(true);
        expect(formatMemory('researcher')).toContain('Summarized the lease');
    });

    it('logs audit + persists everything across a cache reset', () => {
        addMemory('legal-analyst', 'Always cite the statute');
        logAudit('legal-analyst', 'Tested');
        (personaWorkStore as unknown as { reset?: () => void }).reset?.();
        const w = getWork('legal-analyst');
        expect(w.memory[0].text).toBe('Always cite the statute');
        expect(w.audit.some(a => a.action === 'Tested')).toBe(true);
    });

    it('formats durations readably', () => {
        expect(formatDuration(500)).toMatch(/ms/);
        expect(formatDuration(2500)).toMatch(/s/);
        expect(formatDuration(65000)).toMatch(/1m/);
    });

    it('atomically claims the oldest queued task and tracks attempts', () => {
        addTask('hermes-mercury', 'Second task');
        addTask('hermes-labyrinth', 'First task');
        const mercury = getWork('hermes-mercury').tasks[0];
        const labyrinth = getWork('hermes-labyrinth').tasks[0];
        // Make ordering deterministic without fake timers.
        mercury.createdAt = 20;
        labyrinth.createdAt = 10;

        const claim = claimNextTask(['hermes-mercury', 'hermes-labyrinth'], 100);
        expect(claim?.personaId).toBe('hermes-labyrinth');
        expect(claim?.task.status).toBe('running');
        expect(claim?.task.attempts).toBe(1);
        expect(getWork('hermes-labyrinth').tasks[0].startedAt).toBe(100);
    });

    it('surfaces failed tasks, allows retry, and recovers stale running tasks', () => {
        const id = addTask('hermes-scribe', 'Write the report');
        startTask('hermes-scribe', id);
        failTask('hermes-scribe', id, 'provider unavailable');
        expect(getWork('hermes-scribe').tasks[0]).toMatchObject({ status: 'failed', lastError: 'provider unavailable' });

        retryTask('hermes-scribe', id);
        expect(getWork('hermes-scribe').tasks[0].status).toBe('todo');

        startTask('hermes-scribe', id);
        const recovered = recoverStaleTasks(['hermes-scribe'], Date.now() + 1);
        expect(recovered).toBe(1);
        expect(getWork('hermes-scribe').tasks[0].status).toBe('todo');
    });
});
