import { describe, expect, it, vi } from 'vitest';
import { runNextHermesTask } from '../services/hermesAutonomousRunner';
import { DEFAULT_PERSONAS } from '../lib/agents/personas';
import { RECALL_HEADING } from '../lib/memoryGraphRag/recall';

const labyrinth = DEFAULT_PERSONAS.find(p => p.id === 'hermes-labyrinth')!;

describe('runNextHermesTask', () => {
    it('claims, runs, completes, and records a queued persona task', async () => {
        const complete = vi.fn();
        const fail = vi.fn();
        const remember = vi.fn();
        const runPersonaFn = vi.fn(async ({ persona }: any) => ({
            personaId: persona.id,
            personaName: persona.name,
            tasks: ['Map the launch'],
            output: 'Launch map',
            verified: 'Launch map with evidence',
            supported: true,
            ok: true,
            verifyStatus: 'skipped',
        }));

        const result = await runNextHermesTask({
            personas: [labyrinth],
            claim: () => ({
                personaId: labyrinth.id,
                task: { id: 'task-1', title: 'Map the launch', status: 'running', assignedBy: 'user', createdAt: 1 },
            }),
            orchestratorDeps: { invoke: vi.fn(async () => 'unused') },
            complete,
            fail,
            remember,
            wikiContext: () => 'USER.md context',
            personaMemory: () => '\nWorking memory',
            runPersonaFn: runPersonaFn as any,
            now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(160),
        });

        expect(result).toMatchObject({ personaId: labyrinth.id, taskId: 'task-1', outcome: 'success' });
        expect(complete).toHaveBeenCalledWith(labyrinth.id, 'task-1', 'Launch map with evidence');
        expect(fail).not.toHaveBeenCalled();
        expect(remember).toHaveBeenCalledWith(labyrinth.id, expect.stringContaining('Map the launch'), 60, 'success');
        expect(runPersonaFn.mock.calls[0][0].persona.systemPrompt).toContain('Shared Hermes memory');
    });

    it.each([
        ['flagged', 'flagged by the fact-check'],
        ['unavailable', 'fact-check unavailable'],
    ] as const)('a %s answer completes the task but is remembered as fail, without the claim text', async (verifyStatus, label) => {
        const complete = vi.fn();
        const remember = vi.fn();
        const runPersonaFn = vi.fn(async ({ persona }: any) => ({
            personaId: persona.id, personaName: persona.name, tasks: ['Check hours'],
            output: 'The office is open Saturdays.', verified: '[UNVERIFIED] The office is open Saturdays.',
            supported: false, ok: true, verifyStatus,
        }));
        const result = await runNextHermesTask({
            personas: [labyrinth],
            claim: () => ({ personaId: labyrinth.id, task: { id: 'task-9', title: 'Check hours', status: 'running', assignedBy: 'user', createdAt: 1 } }),
            orchestratorDeps: { invoke: vi.fn(async () => 'unused') },
            complete, fail: vi.fn(), remember,
            wikiContext: () => '', personaMemory: () => '',
            runPersonaFn: runPersonaFn as any,
            now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(130),
        });
        expect(complete).toHaveBeenCalledWith(labyrinth.id, 'task-9', expect.any(String));
        expect(result).toMatchObject({ outcome: 'success' });
        const [, note, , outcome] = remember.mock.calls[0];
        expect(outcome).toBe('fail');
        expect(note).toContain(label);
        expect(note).not.toContain('open Saturdays');
    });

    it('marks a task failed when the persona run throws', async () => {
        const fail = vi.fn();
        const remember = vi.fn();
        const result = await runNextHermesTask({
            personas: [labyrinth],
            claim: () => ({
                personaId: labyrinth.id,
                task: { id: 'task-2', title: 'Fail visibly', status: 'running', assignedBy: 'user', createdAt: 1 },
            }),
            orchestratorDeps: { invoke: vi.fn(async () => null) },
            fail,
            remember,
            wikiContext: () => '',
            personaMemory: () => '',
            runPersonaFn: vi.fn(async () => { throw new Error('provider down'); }) as any,
            now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(120),
        });

        expect(result).toMatchObject({ outcome: 'fail', error: 'provider down' });
        expect(fail).toHaveBeenCalledWith(labyrinth.id, 'task-2', 'provider down');
        expect(remember).toHaveBeenCalledWith(labyrinth.id, expect.stringContaining('provider down'), 20, 'fail');
    });

    it('returns null without claiming work when the queue is empty', async () => {
        expect(await runNextHermesTask({
            personas: [labyrinth],
            claim: () => null,
            orchestratorDeps: { invoke: vi.fn(async () => null) },
        })).toBeNull();
    });

    it('appends the recall block to the persona system prompt when recall finds something', async () => {
        const runPersonaFn = vi.fn(async ({ persona }: any) => ({
            personaId: persona.id,
            personaName: persona.name,
            tasks: [],
            output: 'ok',
            verified: 'ok',
            supported: true,
        }));

        await runNextHermesTask({
            personas: [labyrinth],
            claim: () => ({
                personaId: labyrinth.id,
                task: { id: 'task-3', title: 'Check the boiler', status: 'running', assignedBy: 'user', createdAt: 1 },
            }),
            orchestratorDeps: { invoke: vi.fn(async () => 'unused') },
            wikiContext: () => '',
            personaMemory: () => '',
            recall: async () => `${RECALL_HEADING}\n[M1] Acme Heating serviced the boiler.`,
            runPersonaFn: runPersonaFn as any,
        });

        const prompt = runPersonaFn.mock.calls[0][0].persona.systemPrompt;
        expect(prompt).toContain(RECALL_HEADING);
        expect(prompt).toContain('Acme Heating');
    });

    it('leaves the persona system prompt unchanged when recall is absent or empty', async () => {
        const runPersonaFn = vi.fn(async ({ persona }: any) => ({
            personaId: persona.id,
            personaName: persona.name,
            tasks: [],
            output: 'ok',
            verified: 'ok',
            supported: true,
        }));

        await runNextHermesTask({
            personas: [labyrinth],
            claim: () => ({
                personaId: labyrinth.id,
                task: { id: 'task-4', title: 'No memory here', status: 'running', assignedBy: 'user', createdAt: 1 },
            }),
            orchestratorDeps: { invoke: vi.fn(async () => 'unused') },
            wikiContext: () => '',
            personaMemory: () => '',
            runPersonaFn: runPersonaFn as any,
        });

        const promptWithoutDep = runPersonaFn.mock.calls[0][0].persona.systemPrompt;
        expect(promptWithoutDep).not.toContain(RECALL_HEADING);

        runPersonaFn.mockClear();
        await runNextHermesTask({
            personas: [labyrinth],
            claim: () => ({
                personaId: labyrinth.id,
                task: { id: 'task-5', title: 'No memory here', status: 'running', assignedBy: 'user', createdAt: 1 },
            }),
            orchestratorDeps: { invoke: vi.fn(async () => 'unused') },
            wikiContext: () => '',
            personaMemory: () => '',
            recall: async () => '',
            runPersonaFn: runPersonaFn as any,
        });

        const promptWithEmptyRecall = runPersonaFn.mock.calls[0][0].persona.systemPrompt;
        expect(promptWithEmptyRecall).toBe(promptWithoutDep);
    });
});
