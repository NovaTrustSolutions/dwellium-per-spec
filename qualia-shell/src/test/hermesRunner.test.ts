import { describe, it, expect, vi } from 'vitest';
import { runHermes, deriveUsedTools } from '../components/HonchoHermesPanel/hermesRunner';
import type { HermesRunRecord, RunInput } from '../components/HonchoHermesPanel/hermesLearningStore';

/* ─── Helpers: build an injectable deps bundle with stubbed seams ─── */
const FIXED_NOW = '2026-05-29T00:00:00.000Z';

function jsonResponse(body: any): Response {
    return { json: async () => body } as unknown as Response;
}

function makeDeps(overrides: Partial<Parameters<typeof runHermes>[1]> = {}) {
    const recorded: RunInput[] = [];
    const deps = {
        authFetch: vi.fn(async () => jsonResponse({ success: true, data: { answer: 'ok' } })),
        toolNames: ['search', 'read_file', 'calc'],
        now: () => FIXED_NOW,
        // Stub every learning-store seam so no real store/localStorage is touched:
        relevantPastRunsFn: vi.fn((): HermesRunRecord[] => []),
        formatFewShotFn: vi.fn(() => ''),
        rankToolsByWeightFn: vi.fn((tools: string[]) => tools),
        classifyTaskTypeFn: vi.fn(() => 'research' as const),
        recordRunFn: vi.fn((input: RunInput): HermesRunRecord => {
            recorded.push(input);
            return { ...input, id: 'rec-1', taskType: input.taskType ?? 'general', toolsUsed: input.toolsUsed ?? [], steps: input.steps ?? 0, createdAt: FIXED_NOW } as HermesRunRecord;
        }),
        learningSnapshot: () => [] as HermesRunRecord[],
        ...overrides,
    };
    return { deps, recorded };
}

describe('deriveUsedTools', () => {
    it('finds tool names mentioned anywhere in the trace (case-insensitive)', () => {
        const steps = [
            { content: 'I will use Search to look this up' },
            { content: 'reading via read_file now' },
        ];
        expect(deriveUsedTools(steps, ['search', 'read_file', 'calc']).sort()).toEqual(['read_file', 'search']);
    });

    it('returns [] when no tool names appear', () => {
        expect(deriveUsedTools([{ content: 'just thinking' }], ['search'])).toEqual([]);
    });
});

describe('runHermes — success path', () => {
    it('POSTs task + few-shot context + preferredTools, returns normalized success', async () => {
        const { deps } = makeDeps({
            formatFewShotFn: () => '## Past successful runs',
            rankToolsByWeightFn: (tools: string[]) => [...tools].reverse(),
        });
        const out = await runHermes('research the topic', deps);

        expect(out.outcome).toBe('success');
        expect(out.result).toBe('ok');
        expect(out.taskType).toBe('research');
        // final_answer step present
        expect(out.steps.some(s => s.type === 'final_answer' && s.content === 'ok')).toBe(true);

        // request body carried the few-shot + preferred-tool hint
        const [, init] = (deps.authFetch as any).mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.task).toBe('research the topic');
        expect(body.context).toBe('## Past successful runs');
        expect(body.preferredTools).toEqual(['calc', 'read_file', 'search']);
    });

    it('uses backend-reported toolsUsed when present, else infers from trace', async () => {
        const reported = makeDeps({
            authFetch: vi.fn(async () => jsonResponse({ success: true, data: { answer: 'done', toolsUsed: ['calc'] } })),
        });
        expect((await runHermes('x', reported.deps)).toolsUsed).toEqual(['calc']);

        const inferred = makeDeps({
            authFetch: vi.fn(async () => jsonResponse({ success: true, data: { answer: 'used search and read_file', action: 'calling search' } })),
        });
        const out = await runHermes('x', inferred.deps);
        expect(out.toolsUsed.sort()).toEqual(['read_file', 'search']);
    });

    it('records the run into the learning store with outcome+tools', async () => {
        const { deps, recorded } = makeDeps();
        const out = await runHermes('research the topic', deps);
        expect(recorded).toHaveLength(1);
        expect(recorded[0]).toMatchObject({ prompt: 'research the topic', outcome: 'success', taskType: 'research' });
        expect(out.recordId).toBe('rec-1');
    });

    it('skips recording when record:false', async () => {
        const { deps, recorded } = makeDeps({ record: false });
        const out = await runHermes('x', deps);
        expect(recorded).toHaveLength(0);
        expect(out.recordId).toBeUndefined();
    });
});

describe('runHermes — failure paths (never throws)', () => {
    it('backend success:false → outcome fail + error, still recorded', async () => {
        const { deps, recorded } = makeDeps({
            authFetch: vi.fn(async () => jsonResponse({ success: false, error: 'boom' })),
        });
        const out = await runHermes('x', deps);
        expect(out.outcome).toBe('fail');
        expect(out.result).toBe('');
        expect(out.error).toBe('boom');
        expect(recorded[0].outcome).toBe('fail');
    });

    it('thrown fetch error → outcome fail + error message, still recorded', async () => {
        const { deps, recorded } = makeDeps({
            authFetch: vi.fn(async () => { throw new Error('network down'); }),
        });
        const out = await runHermes('x', deps);
        expect(out.outcome).toBe('fail');
        expect(out.error).toBe('network down');
        expect(out.steps.some(s => s.content.includes('network down'))).toBe(true);
        expect(recorded[0].outcome).toBe('fail');
    });

    it('empty answer counts as fail (no usable result)', async () => {
        const { deps } = makeDeps({
            authFetch: vi.fn(async () => jsonResponse({ success: true, data: { answer: '' } })),
        });
        expect((await runHermes('x', deps)).outcome).toBe('fail');
    });
});

describe('runHermes — few-shot count surfaced', () => {
    it('reports how many past runs were injected', async () => {
        const past = [{ id: 'a' }, { id: 'b' }] as HermesRunRecord[];
        const { deps } = makeDeps({ relevantPastRunsFn: () => past });
        expect((await runHermes('x', deps)).fewShotCount).toBe(2);
    });
});
