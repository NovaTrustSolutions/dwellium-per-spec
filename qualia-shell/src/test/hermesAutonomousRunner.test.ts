import { describe, expect, it, vi } from 'vitest';
import { runNextHermesTask } from '../services/hermesAutonomousRunner';
import { DEFAULT_PERSONAS } from '../lib/agents/personas';

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
});
