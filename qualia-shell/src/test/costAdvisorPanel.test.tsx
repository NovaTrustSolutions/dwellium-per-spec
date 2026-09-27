/**
 * CostAdvisorPanel — plan 068 phase 4 W2. Real todoStore + personaWorkStore +
 * llmUsageStore + costKpiStore (reset in beforeEach); oneSaveClient mocked
 * like src/test/advisorActions.test.ts so withSync's background sync never
 * fires. useIntegrations is mocked to control hasActiveLlm (llmClient itself
 * stays real — it's a pure function over the bundle).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CostAdvisorPanel from '../components/AiSpend/CostAdvisorPanel';
import { UserContext } from '../context/UserContext';
import { todoStore, todoUserIdHolder, addTodo } from '../components/ThoughtWeaver/todoStore';
import { personaWorkStore, personaWorkUserIdHolder, addTask, startTask, completeTask, failTask } from '../lib/agents/personaWorkStore';
import { llmUsageStore, llmUsageUserIdHolder, recordLlmUsage } from '../lib/llmUsageStore';
import { costKpiStore, costKpiUserIdHolder, setCostKpi } from '../lib/costKpiStore';
import { HERMES_PERSONA_IDS } from '../lib/agents/personas';

// usePerUserIdentity() inside the panel writes user.id into EVERY per-user
// holder from the raw UserContext on each render, overriding a bare
// `xUserIdHolder.current = 'test-user'` assignment made before render — so
// every render needs this provider (sister pattern: StellaAgent.test.tsx).
function renderPanel(props: { variant?: 'full' | 'compact' } = {}) {
    return render(
        <UserContext.Provider value={{ user: { id: 'test-user' } } as never}>
            <CostAdvisorPanel {...props} />
        </UserContext.Provider>,
    );
}

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

let mockLlmActive = true;
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: mockLlmActive ? { active: 'anthropic', anthropic: { enabled: true, apiKey: 'k' } } : { active: null } } }),
}));

const MERCURY = HERMES_PERSONA_IDS[1]; // scheduling/data-entry/bookkeeping/support default

function addOne(text: string): string {
    addTodo({ text, sourceCaptureId: null, priority: 'medium' });
    return todoStore.getSnapshot()[0].id;
}

beforeEach(() => {
    mockLlmActive = true;
    todoUserIdHolder.current = 'test-user';
    personaWorkUserIdHolder.current = 'test-user';
    llmUsageUserIdHolder.current = 'test-user';
    costKpiUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    todoStore.reset();
    personaWorkStore.reset();
    llmUsageStore.reset();
    costKpiStore.reset();
    setCostKpi(50);
});

describe('CostAdvisorPanel — recommendations from to-dos', () => {
    it('flags an open, writing-shaped to-do at $50/hr', () => {
        addOne('Write the October newsletter');
        renderPanel();
        expect(screen.getByText('Write the October newsletter')).toBeInTheDocument();
        expect(screen.getByText(/save ≈/)).toBeInTheDocument();
    });

    it('no open to-dos → the honest empty state', () => {
        renderPanel();
        expect(screen.getByText(/No open to-dos — add some to ThoughtWeaver/)).toBeInTheDocument();
    });

    it('open to-dos but nothing flagged (a not-AI-capable category at the minimum KPI)', () => {
        // 'design' is not AI-capable (costAdvisor CATEGORY_BENCHMARKS), so the
        // only delegate option is outsourcing at $45/hr — cheaper than your own
        // time only once your KPI exceeds that, never at the $5/hr floor.
        addOne('Design a new logo');
        setCostKpi(5);
        renderPanel();
        expect(screen.getByText(/Nothing flagged — your open to-dos cost about/)).toBeInTheDocument();
    });
});

describe('CostAdvisorPanel — Delegate', () => {
    it('delegating moves the row to Delegated with status Queued', async () => {
        const user = userEvent.setup();
        addOne('Write the October newsletter');
        renderPanel();

        const delegateBtn = screen.getByRole('button', { name: /Delegate to .*Write the October newsletter/ });
        await user.click(delegateBtn);

        expect(screen.queryByRole('button', { name: /Delegate to/ })).not.toBeInTheDocument();
        expect(screen.getByText('Delegated')).toBeInTheDocument();
        const delegatedSection = screen.getByText('Delegated').closest('div')!;
        expect(within(delegatedSection).getByText('Write the October newsletter')).toBeInTheDocument();
        expect(within(delegatedSection).getByText(/Queued/)).toBeInTheDocument();

        const work = personaWorkStore.getSnapshot();
        const allTasks = Object.values(work).flatMap(w => w.tasks);
        expect(allTasks).toHaveLength(1);
        expect(allTasks[0].title).toBe('Write the October newsletter');
    });
});

describe('CostAdvisorPanel — Snooze / Dismiss / Undo', () => {
    it('dismissing hides the row under Hidden; Undo brings it back', async () => {
        const user = userEvent.setup();
        addOne('Write the October newsletter');
        renderPanel();

        await user.click(screen.getByRole('button', { name: /Dismiss: Write the October newsletter/ }));
        expect(screen.queryByText(/save ≈/)).not.toBeInTheDocument();
        expect(screen.getByText('Hidden (1)')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Undo/ }));
        expect(screen.getByText(/save ≈/)).toBeInTheDocument();
        expect(screen.queryByText(/Hidden/)).not.toBeInTheDocument();
    });

    it('snoozing hides the row under Hidden', async () => {
        const user = userEvent.setup();
        addOne('Write the October newsletter');
        renderPanel();

        await user.click(screen.getByRole('button', { name: /Snooze 1 week: Write the October newsletter/ }));
        expect(screen.queryByText(/save ≈/)).not.toBeInTheDocument();
        expect(screen.getByText('Hidden (1)')).toBeInTheDocument();
    });
});

describe('CostAdvisorPanel — measured vs benchmark AI cost', () => {
    it('shows "benchmark estimate" with no Hermes history', () => {
        addOne('Write the October newsletter');
        renderPanel();
        expect(screen.getByText('benchmark estimate')).toBeInTheDocument();
    });

    it('shows "measured from your last N Hermes tasks" once 5+ Hermes tasks completed in 30 days', () => {
        for (let i = 0; i < 5; i++) {
            const id = addTask(MERCURY, `past task ${i}`, 'user');
            startTask(MERCURY, id);
            completeTask(MERCURY, id);
        }
        recordLlmUsage({ provider: 'anthropic', model: 'claude-haiku-4-5', promptChars: 400, responseChars: 400, source: 'hermes', userId: 'test-user' });

        addOne('Write the October newsletter');
        renderPanel();
        expect(screen.getByText(/measured from your last 5 Hermes tasks/)).toBeInTheDocument();
    });
});

describe('CostAdvisorPanel — compact variant', () => {
    it('renders recommendations read-only, no action buttons', () => {
        addOne('Write the October newsletter');
        renderPanel({ variant: "compact" });
        expect(screen.getByText('Write the October newsletter')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});

describe('CostAdvisorPanel — no active LLM', () => {
    it('Delegate button still works; row notes Hermes needs a key', async () => {
        mockLlmActive = false;
        const user = userEvent.setup();
        addOne('Write the October newsletter');
        renderPanel();

        expect(screen.getByText('Hermes runs it once an AI key is set')).toBeInTheDocument();
        const delegateBtn = screen.getByRole('button', { name: /Delegate to/ });
        await user.click(delegateBtn);
        expect(screen.getByText('Delegated')).toBeInTheDocument();
    });
});

describe('CostAdvisorPanel — failed delegation and focus (review fixes)', () => {
    it('a Failed Hermes task offers "Back to my list"; a Queued one does not; reclaim returns it to the advice list', async () => {
        const user = userEvent.setup();
        setCostKpi(100);
        const id = addOne('Research property tax appeal deadlines');
        renderPanel();
        await user.click(screen.getByRole('button', { name: /^Delegate[^:]*: Research property tax/ }));
        expect(screen.queryByRole('button', { name: /Back to my list/ })).toBeNull(); // Queued
        const link = todoStore.getSnapshot().find(t => t.id === id)!.advisor!.delegatedTo!;
        act(() => failTask(link.personaId, link.taskId, 'provider error'));
        const back = await screen.findByRole('button', { name: 'Back to my list: Research property tax appeal deadlines' });
        await user.click(back);
        expect(todoStore.getSnapshot().find(t => t.id === id)!.advisor?.delegatedTo).toBeUndefined();
        expect(screen.getByRole('button', { name: /^Dismiss: Research property tax/ })).toBeTruthy();
        expect(document.activeElement?.tagName).not.toBe('BODY');
    });

    it('Undo keeps keyboard focus in the panel', async () => {
        const user = userEvent.setup();
        setCostKpi(100);
        addOne('Write the October newsletter');
        renderPanel();
        await user.click(screen.getByRole('button', { name: /^Dismiss: Write the October/ }));
        await user.click(screen.getByText(/Hidden \(1\)/));
        await user.click(screen.getByRole('button', { name: /Undo.*Write the October/ }));
        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement?.textContent).toMatch(/Do it cheaper/);
    });
});

describe('CostAdvisorPanel — only AI-capable work can be delegated to Hermes', () => {
    it('a phone call is advised as outsourcing to a person, with Snooze/Dismiss but no Delegate button', () => {
        setCostKpi(100);
        addOne('Call the electrician about the lobby lights');
        renderPanel();
        expect(screen.getByText(/→ outsource/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^Delegate[^:]*: Call the electrician/ })).toBeNull();
        expect(screen.getByRole('button', { name: /^Snooze[^:]*: Call the electrician/ })).toBeTruthy();
    });
});
