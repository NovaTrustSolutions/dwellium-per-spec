/**
 * The REAL background-runner hook (useHermesAutonomousRunner) must hand each answer's Hermes run id
 * to the task it completes — that id is what the Hermes workspace's 👍 rates. Only the model call is
 * mocked; the hook, runner, orchestrator and stores are real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

vi.mock('../lib/llmClient', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/llmClient')>();
    return {
        ...actual,
        hasActiveLlm: () => true,
        applyModelPreference: (llm: unknown) => llm,
        callLlm: vi.fn(async () => ({ text: 'Launch map with evidence', provider: 'custom', model: 'x' })),
    };
});

import { UserContext } from '../context/UserContext';
import { useHermesAutonomousRunner } from '../services/hermesAutonomousRunner';
import { HERMES_PERSONA_IDS } from '../lib/agents/personas';
import { agentTeamsStore, agentLabUserIdHolder } from '../lib/agents/agentTeamsStore';
import { personaWorkStore, personaWorkUserIdHolder, addTask } from '../lib/agents/personaWorkStore';
import { hermesLearningStore, hermesLearningUserIdHolder } from '../components/HonchoHermesPanel/hermesLearningStore';

const UID = 'runner-user';
const PID = HERMES_PERSONA_IDS[0];
function Runner() { useHermesAutonomousRunner(); return null; }

beforeEach(() => {
    cleanup();
    try { localStorage.clear(); } catch { /* */ }
    agentLabUserIdHolder.current = UID;
    personaWorkUserIdHolder.current = UID;
    hermesLearningUserIdHolder.current = UID;
    (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
    (personaWorkStore as unknown as { reset?: () => void }).reset?.();
    (hermesLearningStore as unknown as { reset?: () => void }).reset?.();
});

describe('useHermesAutonomousRunner — the completed task carries its Hermes run id', () => {
    it('answers a queued task, logs it unchecked (no Sources), and stores that run id on the task', async () => {
        const id = addTask(PID, 'Map the launch');
        render(<UserContext.Provider value={{ user: { id: UID } } as never}><Runner /></UserContext.Provider>);
        await waitFor(() => expect(personaWorkStore.getSnapshot()[PID]?.tasks.find(t => t.id === id)?.status).toBe('done'), { timeout: 9000 });
        const task = personaWorkStore.getSnapshot()[PID]!.tasks.find(t => t.id === id)!;
        expect(task.hermesRunId).toBeTruthy();
        expect(hermesLearningStore.getSnapshot().find(r => r.id === task.hermesRunId)).toMatchObject({ outcome: 'fail', unchecked: true });
    }, 15000);
});
