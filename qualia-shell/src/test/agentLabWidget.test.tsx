/**
 * AgentLab widget — wave-2 fix verification (Docs/agent-lab-fix-now).
 *
 * Mocks only the network edge: `callLlm` is replaced, every other export of
 * `lib/llmClient` (hasActiveLlm, LlmError, applyModelPreference, …) stays the
 * REAL implementation via vi.importActual. Provider state goes through the
 * real integrations store (saveIntegrations), same as other widget tests
 * (see FirstRunCard.test.tsx). Every equipped skill is stripped from the
 * built-in personas in beforeEach — skill execution needs `fetch`, which
 * jsdom doesn't have; orchestrator.execute() swallows that failure silently
 * (best-effort), but the resulting nondeterministic extra callLlm calls would
 * make these tests flaky for no reason since skills are out of scope here.
 */
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LlmReqLike = { personaId?: string; systemPrompt?: string; responseFormat?: string };
type MockLlmResponse = { text: string; provider: string; model: string } | null;
type PlanFn = (req: LlmReqLike) => Promise<MockLlmResponse>;

const callLlmMock = vi.fn<(req: LlmReqLike, llm: unknown) => Promise<MockLlmResponse>>();

vi.mock('../lib/llmClient', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/llmClient')>();
    return { ...actual, callLlm: (req: LlmReqLike, llm: unknown) => callLlmMock(req, llm) };
});

import AgentLab from '../components/AgentLab/AgentLab';
import { LlmError } from '../lib/llmClient';
import { agentTeamsStore, upsertPersona } from '../lib/agents/agentTeamsStore';
import { DEFAULT_PERSONAS } from '../lib/agents/personas';
import { personaWorkStore, addMemory } from '../lib/agents/personaWorkStore';
import { hermesLearningStore } from '../components/HonchoHermesPanel/hermesLearningStore';
import { integrationsStore, saveIntegrations } from '../utils/integrationsStore';
import { emptyIntegrations, type IntegrationsBundle } from '../types/integrations';

function stubMatchMedia(reduce: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query: string) => ({
            matches: reduce && query.includes('prefers-reduced-motion'),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            onchange: null,
            dispatchEvent: () => false,
        }),
    });
}

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

let plan: { decompose: PlanFn; merge: PlanFn; byPersona: Record<string, PlanFn> };
function resetPlan() {
    plan = {
        // null → decompose's extractJson() sees nothing parseable → the
        // orchestrator falls back to "every resolvable member gets the goal".
        decompose: async () => null,
        merge: async () => ({ text: 'Merged final product', provider: 'anthropic', model: 'x' }),
        byPersona: {},
    };
}

function activeLlm(): IntegrationsBundle {
    return {
        ...emptyIntegrations(),
        llm: { active: 'anthropic', anthropic: { enabled: true, apiKey: 'sk-ant-test', model: 'x' } },
    };
}

beforeEach(() => {
    try { localStorage.clear(); } catch { /* */ }
    (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
    (personaWorkStore as unknown as { reset?: () => void }).reset?.();
    (hermesLearningStore as unknown as { reset?: () => void }).reset?.();
    (integrationsStore as unknown as { reset?: () => void }).reset?.();
    resetPlan();
    callLlmMock.mockReset();
    callLlmMock.mockImplementation(async (req: LlmReqLike) => {
        if (req.personaId === 'orchestrator') {
            return req.responseFormat === 'json' ? plan.decompose(req) : plan.merge(req);
        }
        const fn = req.personaId ? plan.byPersona[req.personaId] : undefined;
        if (fn) return fn(req);
        return { text: `${req.personaId ?? 'unknown'} default output`, provider: 'anthropic', model: 'x' };
    });
    // Strip equipped tools from every built-in so no skill (network) call fires.
    for (const p of DEFAULT_PERSONAS) upsertPersona({ ...p, tools: [] });
    stubMatchMedia(false);
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => { cleanup(); });

function railEl() { return document.querySelector('.alab-rail') as HTMLElement; }
function rail() { return within(railEl()); }
function selectPersona(name: string) { fireEvent.click(rail().getByRole('button', { name })); }

describe('AgentLab — D1/D3 provider errors never vanish', () => {
    it('team run: one member rejects (429) — the other member\'s output still renders and the warnings status names the rate limit', async () => {
        saveIntegrations(activeLlm());
        render(<StrictMode><AgentLab /></StrictMode>);

        plan.byPersona.researcher = async () => ({ text: 'Researcher findings', provider: 'anthropic', model: 'x' });
        plan.byPersona['data-analyst'] = async () => { throw new LlmError('anthropic', 429, 'rate limited'); };
        plan.byPersona['comms-writer'] = async () => ({ text: 'Comms copy', provider: 'anthropic', model: 'x' });

        fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Write a market brief' } });
        fireEvent.click(screen.getByRole('button', { name: 'Run team' }));

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/rate limited/));
        expect(screen.queryByRole('alert')).toBeNull(); // a partial run is a warning, not an alert
        const contribs = document.querySelector('.alab-contribs') as HTMLElement;
        expect(within(contribs).getByText('Researcher')).toBeInTheDocument();
        expect(contribs.textContent).toContain('Data Analyst');
        expect(contribs.textContent).toContain('failed');
        // D8 inside team runs: the failed member's orchestrator-assigned task is FAILED with the reason, not "done".
        const analystTasks = personaWorkStore.getSnapshot()['data-analyst']?.tasks ?? [];
        expect(analystTasks.map(t => t.status)).toEqual(['failed']);
        expect(analystTasks[0].lastError).toMatch(/rate limited/);
        expect(personaWorkStore.getSnapshot().researcher?.tasks.map(t => t.status)).toEqual(['done']);
    });

    it('team run: every member rejects — the alert carries the real provider message', async () => {
        saveIntegrations(activeLlm());
        render(<StrictMode><AgentLab /></StrictMode>);

        for (const id of ['researcher', 'data-analyst', 'comms-writer']) {
            plan.byPersona[id] = async () => { throw new LlmError('anthropic', 429, 'rate limited'); };
        }

        fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Write a market brief' } });
        fireEvent.click(screen.getByRole('button', { name: 'Run team' }));

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/rate limited/));
    });

    it('solo run: a thrown provider error renders in an alert with the real message', async () => {
        saveIntegrations(activeLlm());
        render(<StrictMode><AgentLab /></StrictMode>);
        selectPersona('Researcher');

        plan.byPersona.researcher = async () => { throw new LlmError('openai', 500, 'boom'); };

        fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Summarize this' } });
        fireEvent.click(screen.getByRole('button', { name: 'Run Researcher' }));

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/boom/));
    });
});

describe('AgentLab — D5 readiness badge + banner', () => {
    it('active provider without a key is "LLM not ready" and disables Run, even when another provider has a key', () => {
        saveIntegrations({
            ...emptyIntegrations(),
            llm: {
                active: 'openai',
                openai: { enabled: true, apiKey: '', model: 'x' },
                anthropic: { enabled: true, apiKey: 'sk-ant-present', model: 'x' },
            },
        });
        render(<StrictMode><AgentLab /></StrictMode>);

        expect(screen.getByText('LLM not ready')).toBeInTheDocument();
        expect(screen.getByText(/active provider \(OpenAI\) has no key/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Run team' })).toBeDisabled();
    });
});

describe('AgentLab — D12 rating', () => {
    it('a successful solo run shows "Mark result good"; clicking it rates the latest Hermes record', async () => {
        saveIntegrations(activeLlm());
        render(<StrictMode><AgentLab /></StrictMode>);
        selectPersona('Researcher');

        plan.byPersona.researcher = async () => ({ text: 'Great researcher output', provider: 'anthropic', model: 'x' });

        const goalText = 'Rate this solo run';
        fireEvent.change(screen.getByLabelText('Goal'), { target: { value: goalText } });
        fireEvent.click(screen.getByRole('button', { name: 'Run Researcher' }));

        const goodBtn = await screen.findByRole('button', { name: 'Mark result good' });
        fireEvent.click(goodBtn);

        const rec = hermesLearningStore.getSnapshot().find(r => r.prompt === goalText);
        expect(rec?.rating).toBe(1);
    });
});

describe('AgentLab — D3 Hermes outcome honesty', () => {
    it('a team run where every member returns "" records outcome "fail"', async () => {
        saveIntegrations(activeLlm());
        render(<StrictMode><AgentLab /></StrictMode>);

        for (const id of ['researcher', 'data-analyst', 'comms-writer']) {
            plan.byPersona[id] = async () => ({ text: '', provider: 'anthropic', model: 'x' });
        }

        const goalText = 'Empty-response team goal';
        fireEvent.change(screen.getByLabelText('Goal'), { target: { value: goalText } });
        fireEvent.click(screen.getByRole('button', { name: 'Run team' }));

        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        const rec = hermesLearningStore.getSnapshot().find(r => r.prompt === goalText);
        expect(rec?.outcome).toBe('fail');
    });
});

describe('AgentLab — D11 built-in persona Edit', () => {
    it('opens the editor for a built-in; name is disabled, Preferred provider stays enabled', () => {
        render(<StrictMode><AgentLab /></StrictMode>);
        selectPersona('Researcher');
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

        expect(screen.getByText('Persona (built-in — only the model can be changed)')).toBeInTheDocument();
        expect(screen.getByLabelText('Name')).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'Preferred provider' })).toBeEnabled();
    });
});

describe('AgentLab — D8/D16 task runs', () => {
    it('a task whose run rejects ends up "failed" with a Retry button, not under Completed', async () => {
        saveIntegrations(activeLlm());
        render(<StrictMode><AgentLab /></StrictMode>);
        selectPersona('Researcher');
        fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }));

        fireEvent.change(screen.getByPlaceholderText('Give this persona a task…'), { target: { value: 'Draft the outline' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

        plan.byPersona.researcher = async () => { throw new LlmError('anthropic', 500, 'server exploded'); };
        fireEvent.click(screen.getByRole('button', { name: 'Run' }));

        await screen.findByText('failed');
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        expect(screen.getByText('Completed (0)')).toBeInTheDocument();
    });

    it('per-persona lock: persona A\'s pending task never disables persona B\'s Run button', async () => {
        saveIntegrations(activeLlm());
        render(<StrictMode><AgentLab /></StrictMode>);

        selectPersona('Researcher');
        fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }));
        fireEvent.change(screen.getByPlaceholderText('Give this persona a task…'), { target: { value: 'Task A' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

        const a = deferred<MockLlmResponse>();
        plan.byPersona.researcher = () => a.promise;
        fireEvent.click(screen.getByRole('button', { name: 'Run' }));
        await waitFor(() => expect(screen.getByText('running…')).toBeInTheDocument());

        selectPersona('Legal Analyst');
        fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }));
        fireEvent.change(screen.getByPlaceholderText('Give this persona a task…'), { target: { value: 'Task B' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

        const runB = screen.getByRole('button', { name: 'Run' });
        expect(runB).toBeEnabled();

        const b = deferred<MockLlmResponse>();
        plan.byPersona['legal-analyst'] = () => b.promise;
        fireEvent.click(runB);
        await waitFor(() => expect(screen.getByText('running…')).toBeInTheDocument());

        // Clean up both pending runs so nothing resolves after the test ends.
        await act(async () => { b.resolve({ text: 'B done', provider: 'anthropic', model: 'x' }); });
        await act(async () => { a.resolve({ text: 'A done', provider: 'anthropic', model: 'x' }); });
    });
});

describe('AgentLab — D19 accessibility', () => {
    it('getByLabelText("Goal") resolves to the goal textarea; ArrowRight moves the tab selection', () => {
        render(<StrictMode><AgentLab /></StrictMode>);
        selectPersona('Researcher');

        const goalField = screen.getByLabelText('Goal');
        expect(goalField.tagName).toBe('TEXTAREA');

        const dossierTab = screen.getByRole('tab', { name: 'Dossier' });
        expect(dossierTab).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(dossierTab, { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true');
    });
});

describe('AgentLab — D15 team member working memory', () => {
    it('the researcher\'s systemPrompt carries a memory note added via personaWorkStore.addMemory', async () => {
        saveIntegrations(activeLlm());
        addMemory('researcher', 'Always cite primary sources', 'note');
        render(<StrictMode><AgentLab /></StrictMode>);

        fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Team memory check' } });
        fireEvent.click(screen.getByRole('button', { name: 'Run team' }));

        await waitFor(() => expect(callLlmMock).toHaveBeenCalled());
        const researcherCall = callLlmMock.mock.calls.find(([req]) => req.personaId === 'researcher');
        expect(researcherCall?.[0].systemPrompt).toContain('Always cite primary sources');
    });
});

describe('AgentLab — P3 icon fallback', () => {
    it('the rail never shows the literal text "bot" after creating a new persona', () => {
        render(<StrictMode><AgentLab /></StrictMode>);
        fireEvent.click(screen.getByTitle('New persona'));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        // Word-boundary regexing the whole rail's concatenated textContent is
        // unreliable (adjacent elements render with no separating whitespace,
        // e.g. "botNew Specialist"); queryByText matches per-element text.
        expect(within(railEl()).queryByText('bot')).toBeNull();
    });
});
