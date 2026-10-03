/**
 * personaStats — pure stats rollup for a persona's stat row (runs, success
 * rate, average task duration, last-run time), derived from PersonaWork's
 * audit log ('Run' entries written by personaWorkStore.recordRun) and the
 * existing averageTaskMs. null fields mean "no data", never a fabricated
 * number — same honesty rule as defaultDossier (Docs/code.md 2026-09-05/06).
 */
import { describe, it, expect } from 'vitest';
import { personaStats } from '../lib/agents/hermesStatus';
import type { PersonaAuditEntry, PersonaTask, PersonaWork } from '../lib/agents/personaWorkStore';

function audit(partial: Partial<PersonaAuditEntry> & { ts: number }): PersonaAuditEntry {
    return { id: partial.id ?? `a-${partial.ts}`, action: partial.action ?? 'Run', detail: partial.detail, ts: partial.ts };
}
function task(partial: Partial<PersonaTask>): PersonaTask {
    return { id: 't1', title: 'Task', status: 'todo', assignedBy: 'user', createdAt: 0, ...partial };
}
function work(partial: Partial<PersonaWork>): PersonaWork {
    return { memory: [], tasks: [], audit: [], usageCount: 0, ...partial };
}

describe('personaStats', () => {
    it('unchecked runs (no Sources) are counted separately and left out of the success rate', () => {
        const w = work({ usageCount: 4, audit: [
            audit({ ts: 400, detail: 'unchecked · 1.0 s' }),
            audit({ ts: 300, detail: 'unchecked · 1.0 s' }),
            audit({ ts: 200, detail: 'success · 1.0 s' }),
            audit({ ts: 100, detail: 'fail · 1.0 s' }),
        ] });
        const st = personaStats(w);
        expect(st.uncheckedRuns).toBe(2);
        expect(st.successRate).toBe(0.5);
        expect(st.lastRunAt).toBe(400);
        expect(personaStats(work({ usageCount: 1, audit: [audit({ ts: 1, detail: 'unchecked · 1.0 s' })] })).successRate).toBeNull();
    });

    it('is all-empty/null for undefined work', () => {
        expect(personaStats(undefined)).toEqual({ runs: 0, successRate: null, uncheckedRuns: 0, avgTaskMs: null, lastRunAt: null });
    });

    it('is all-empty/null for work with no runs yet', () => {
        expect(personaStats(work({}))).toEqual({ runs: 0, successRate: null, uncheckedRuns: 0, avgTaskMs: null, lastRunAt: null });
    });

    it('runs comes from usageCount, independent of audit entry count', () => {
        const w = work({ usageCount: 5, audit: [audit({ ts: 100, detail: 'success · 1.0 s' })] });
        expect(personaStats(w).runs).toBe(5);
    });

    it('computes successRate over Run audit entries only (ignores other actions)', () => {
        const w = work({
            usageCount: 3,
            audit: [
                audit({ ts: 300, detail: 'success · 1.0 s' }),
                audit({ ts: 200, detail: 'fail · 0.5 s' }),
                audit({ ts: 100, detail: 'success · 2.0 s' }),
                audit({ ts: 50, action: 'Task added', detail: 'user: x' }),
            ],
        });
        expect(personaStats(w).successRate).toBeCloseTo(2 / 3, 5);
    });

    it('successRate is null when there are no Run entries', () => {
        const w = work({ usageCount: 1, audit: [audit({ ts: 10, action: 'Task added', detail: 'user: x' })] });
        expect(personaStats(w).successRate).toBeNull();
    });

    it('avgTaskMs delegates to averageTaskMs (done tasks with a duration only)', () => {
        const w = work({
            tasks: [
                task({ id: '1', status: 'done', durationMs: 1000 }),
                task({ id: '2', status: 'done', durationMs: 3000 }),
                task({ id: '3', status: 'running' }),
            ],
        });
        expect(personaStats(w).avgTaskMs).toBe(2000);
    });

    it('lastRunAt is the newest Run entry ts, ignoring array order and other actions', () => {
        const w = work({
            audit: [
                audit({ ts: 100, detail: 'success · 1.0 s' }),
                audit({ ts: 500, action: 'Task added', detail: 'user: x' }),
                audit({ ts: 300, detail: 'fail · 0.2 s' }),
            ],
        });
        expect(personaStats(w).lastRunAt).toBe(300);
    });
});
