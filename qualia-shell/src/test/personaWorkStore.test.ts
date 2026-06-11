/**
 * personaWorkStore — per-persona tasks (with completion durations), a memory
 * that grows with use, and an audit log. All persist per-user.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    personaWorkStore, personaWorkUserIdHolder,
    addTask, startTask, completeTask, addMemory, logAudit, recordRun, getWork, formatMemory, formatDuration,
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
});
