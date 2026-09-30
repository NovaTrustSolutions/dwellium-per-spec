/**
 * Plan 075 Phase 3 (integrator W2): MissionControl UI contract tests — one
 * per §5 contract item (rename, target date/due badge, action edit/add/
 * remove, in-card run, refine, notes toggle) plus a StrictMode
 * stuck-unmounted-ref regression and an owner-switch-during-run test.
 */
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn(), history: vi.fn() },
}));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { active: 'anthropic' } } }),
}));
vi.mock('../lib/goalRunner', () => ({
    runGoalAction: vi.fn(),
    refineGoal: vi.fn(),
}));

// Owner-switch tests need to flip "am I still the owner" independently of the
// goals namespace itself (goalsUserIdHolder stays pinned to UID so the goal
// stays reachable, and the write attempt — if the guard is missing — is
// actually observable rather than silently no-op'ing against a namespace
// with no such goal id).
let ownerIsStale = false;
vi.mock('../lib/perUserIdentity', async (orig) => ({
    ...(await orig<object>()),
    captureOwner: () => () => !ownerIsStale,
}));

import { UserContext } from '../context/UserContext';
import MissionControl from '../components/MissionControl/MissionControl';
import { goalsStore, createGoal, resetGoals, addGoalNote, goalsUserIdHolder, updateGoalPlan } from '../lib/goalsStore';
import { heuristicPlan } from '../lib/goalPlanner';
import { artifactStore, resetArtifacts, artifactsUserIdHolder } from '../lib/artifactStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { runGoalAction, refineGoal } from '../lib/goalRunner';

const UID = 'mc-p3-test';

function renderMc(ui?: React.ReactElement) {
    const el = ui ?? <MissionControl />;
    return render(
        <UserContext.Provider value={{ user: { id: UID, name: 'T' } } as never}>{el}</UserContext.Provider>,
    );
}

function goalWithPlan(title: string) {
    return createGoal(title, heuristicPlan(title));
}

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

beforeEach(() => {
    setPerUserIdentity(UID);
    ownerIsStale = false;
    try { localStorage.clear(); } catch { /* */ }
    resetGoals();
    resetArtifacts();
    vi.mocked(runGoalAction).mockReset();
    vi.mocked(refineGoal).mockReset();
});
afterEach(() => { vi.useRealTimers(); });

describe('rename', () => {
    it('Enter saves the new title', () => {
        const g = goalWithPlan('Old title');
        renderMc();
        fireEvent.click(screen.getByRole('button', { name: `Rename goal ${g.title}` }));
        const input = screen.getByLabelText('Goal title');
        fireEvent.change(input, { target: { value: 'New title' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByRole('heading', { name: 'New title' })).toBeInTheDocument();
        expect(goalsStore.getSnapshot().find(x => x.id === g.id)!.title).toBe('New title');
    });

    it('Escape cancels without saving (and a later blur does not save either)', () => {
        const g = goalWithPlan('Old title');
        renderMc();
        fireEvent.click(screen.getByRole('button', { name: `Rename goal ${g.title}` }));
        const input = screen.getByLabelText('Goal title');
        fireEvent.change(input, { target: { value: 'Should not save' } });
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.getByRole('heading', { name: 'Old title' })).toBeInTheDocument();
        expect(goalsStore.getSnapshot().find(x => x.id === g.id)!.title).toBe('Old title');
    });
});

describe('target date + due badge', () => {
    beforeEach(() => { vi.setSystemTime(new Date(2026, 0, 15)); }); // local Jan 15 2026

    it('today', () => {
        const g = goalWithPlan('Grow');
        renderMc();
        const input = screen.getByLabelText(`Target date for ${g.title}`);
        fireEvent.change(input, { target: { value: '2026-01-15' } });
        expect(screen.getByText('Due today')).toBeInTheDocument();
    });

    it('+3 days', () => {
        const g = goalWithPlan('Grow');
        renderMc();
        const input = screen.getByLabelText(`Target date for ${g.title}`);
        fireEvent.change(input, { target: { value: '2026-01-18' } });
        expect(screen.getByText('Due in 3 days')).toBeInTheDocument();
    });

    it('-2 days (overdue) and clear removes the badge', () => {
        const g = goalWithPlan('Grow');
        renderMc();
        const input = screen.getByLabelText(`Target date for ${g.title}`);
        fireEvent.change(input, { target: { value: '2026-01-13' } });
        expect(screen.getByText('Overdue by 2 days')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: `Clear target date for ${g.title}` }));
        expect(screen.queryByText(/Overdue by/)).not.toBeInTheDocument();
    });
});

describe('action add / edit / remove', () => {
    it('adds, edits, and removes an agent action', () => {
        const g = goalWithPlan('Grow');
        renderMc();

        const addInput = screen.getByLabelText(`Add agent action to ${g.title}`);
        fireEvent.change(addInput, { target: { value: 'Brand new action' } });
        fireEvent.submit(addInput.closest('form')!);
        expect(screen.getByText('Brand new action')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Edit action: Brand new action' }));
        const editInput = screen.getByLabelText('Action text');
        fireEvent.change(editInput, { target: { value: 'Edited action' } });
        fireEvent.keyDown(editInput, { key: 'Enter' });
        expect(screen.getByText('Edited action')).toBeInTheDocument();
        expect(screen.queryByText('Brand new action')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Remove action: Edited action' }));
        expect(screen.queryByText('Edited action')).not.toBeInTheDocument();
    });
});

describe('run with agent', () => {
    it('ok -> result region + note + artifact recorded', async () => {
        vi.mocked(runGoalAction).mockResolvedValue({ ok: true, text: 'Draft output text' });
        const g = goalWithPlan('Grow');
        const actionText = g.plan!.agentActions[0].text;
        renderMc();

        fireEvent.click(screen.getByRole('button', { name: `Run with agent: ${actionText}` }));
        await screen.findByRole('region', { name: `Result for ${actionText}` });
        expect(screen.getByText('Draft output text')).toBeInTheDocument();

        const stored = goalsStore.getSnapshot().find(x => x.id === g.id)!;
        expect(stored.notes.some(n => n.text.includes(actionText))).toBe(true);

        const artifacts = artifactStore.getSnapshot();
        expect(artifacts.some(a => a.source === 'mission-control' && a.content === 'Draft output text')).toBe(true);
    });

    it('action edited mid-run -> no "result saved" note, no artifact, no result (review p3 #2)', async () => {
        const run = deferred<{ ok: true; text: string }>();
        vi.mocked(runGoalAction).mockReturnValue(run.promise as never);
        const g = goalWithPlan('Grow');
        const actionText = g.plan!.agentActions[0].text;
        renderMc();
        fireEvent.click(screen.getByRole('button', { name: `Run with agent: ${actionText}` }));
        // Edit the action's text while the run is in flight (straight through the store).
        const { editGoalAction } = await import('../lib/goalsStore');
        editGoalAction(g.id, 'agentActions', 0, 'Changed while running');
        // Rows are keyed by text, so the edited row remounts; settle the in-flight run inside act.
        await act(async () => { run.resolve({ ok: true, text: 'Orphan draft' }); await run.promise; });
        const stored = goalsStore.getSnapshot().find(x => x.id === g.id)!;
        expect(stored.notes).toHaveLength(0);
        expect(stored.plan!.agentActions.some(a => a.result)).toBe(false);
        expect(artifactStore.getSnapshot().some(a => a.content === 'Orphan draft')).toBe(false);
    });

    it('no-llm -> alert', async () => {
        vi.mocked(runGoalAction).mockResolvedValue({ ok: false, reason: 'no-llm' });
        const g = goalWithPlan('Grow');
        const actionText = g.plan!.agentActions[0].text;
        renderMc();
        fireEvent.click(screen.getByRole('button', { name: `Run with agent: ${actionText}` }));
        await screen.findByRole('alert');
        expect(screen.getByText('Add an AI key in Control Panel → API Keys to run agent actions.')).toBeInTheDocument();
    });

    it('failed -> alert', async () => {
        vi.mocked(runGoalAction).mockResolvedValue({ ok: false, reason: 'failed' });
        const g = goalWithPlan('Grow');
        const actionText = g.plan!.agentActions[0].text;
        renderMc();
        fireEvent.click(screen.getByRole('button', { name: `Run with agent: ${actionText}` }));
        await screen.findByRole('alert');
        expect(screen.getByText('The agent run failed — try again.')).toBeInTheDocument();
    });

    it('Mark done checks the action without dismissing the result', async () => {
        vi.mocked(runGoalAction).mockResolvedValue({ ok: true, text: 'Draft' });
        const g = goalWithPlan('Grow');
        const actionText = g.plan!.agentActions[0].text;
        renderMc();
        fireEvent.click(screen.getByRole('button', { name: `Run with agent: ${actionText}` }));
        await screen.findByRole('region', { name: `Result for ${actionText}` });

        const markDoneBtn = screen.getByRole('button', { name: `Mark done: ${actionText}` });
        fireEvent.click(markDoneBtn);
        const stored = goalsStore.getSnapshot().find(x => x.id === g.id)!;
        expect(stored.plan!.agentActions[0].done).toBe(true);
        expect(screen.getByRole('region', { name: `Result for ${actionText}` })).toBeInTheDocument();

        // Clicking it again while already done must NOT toggle it back off.
        fireEvent.click(markDoneBtn);
        expect(goalsStore.getSnapshot().find(x => x.id === g.id)!.plan!.agentActions[0].done).toBe(true);
    });

    it('Dismiss result clears the stored result', async () => {
        vi.mocked(runGoalAction).mockResolvedValue({ ok: true, text: 'Draft' });
        const g = goalWithPlan('Grow');
        const actionText = g.plan!.agentActions[0].text;
        renderMc();
        fireEvent.click(screen.getByRole('button', { name: `Run with agent: ${actionText}` }));
        await screen.findByRole('region', { name: `Result for ${actionText}` });

        fireEvent.click(screen.getByRole('button', { name: `Dismiss result: ${actionText}` }));
        expect(screen.queryByRole('region', { name: `Result for ${actionText}` })).not.toBeInTheDocument();
        const stored = goalsStore.getSnapshot().find(x => x.id === g.id)!;
        expect(stored.plan!.agentActions[0].result).toBeUndefined();
    });
});

describe('refine', () => {
    it('ok -> "Plan refined." and clears the textarea', async () => {
        const g = goalWithPlan('Grow');
        vi.mocked(refineGoal).mockResolvedValue({ ok: true, plan: g.plan! });
        renderMc();
        const textarea = screen.getByLabelText(`Answers for ${g.title}`);
        fireEvent.change(textarea, { target: { value: 'Here is my answer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Refine plan' }));
        await screen.findByText('Plan refined.');
        expect((textarea as HTMLTextAreaElement).value).toBe('');
    });

    it('a refine that answers every question still shows "Plan refined." and keeps the box', async () => {
        // Found in the live harness: the box used to render only while questions were open, so a
        // refine that cleared them unmounted it before the status rendered.
        const g = goalWithPlan('Grow');
        vi.mocked(refineGoal).mockImplementation(async (id) => {
            const plan = { ...g.plan!, clarifyingQuestions: [] };
            updateGoalPlan(id, plan, { keepDone: true, answer: 'all answered' });
            return { ok: true, plan };
        });
        renderMc();
        fireEvent.change(screen.getByLabelText(`Answers for ${g.title}`), { target: { value: 'all answered' } });
        fireEvent.click(screen.getByRole('button', { name: 'Refine plan' }));
        await screen.findByText('Plan refined.');
        expect(screen.getByLabelText(`Answers for ${g.title}`)).toBeInTheDocument();
    });

    it('failed -> "Refine failed — try again."', async () => {
        const g = goalWithPlan('Grow');
        vi.mocked(refineGoal).mockResolvedValue({ ok: false, reason: 'not-found' });
        renderMc();
        const textarea = screen.getByLabelText(`Answers for ${g.title}`);
        fireEvent.change(textarea, { target: { value: 'Here is my answer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Refine plan' }));
        await screen.findByText('Refine failed — try again.');
    });
});

describe('notes toggle', () => {
    it('shows "Show all N notes" past 3 and toggles to all/fewer', () => {
        const g = goalWithPlan('Grow');
        for (let i = 0; i < 5; i++) addGoalNote(g.id, `note ${i}`);
        renderMc();
        expect(screen.queryByText('note 0')).not.toBeInTheDocument();
        const toggle = screen.getByRole('button', { name: 'Show all 5 notes' });
        fireEvent.click(toggle);
        expect(screen.getByText('note 0')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show fewer notes' })).toBeInTheDocument();
    });
});

describe('StrictMode', () => {
    it('a run still surfaces its result region (no stuck-unmounted ref)', async () => {
        vi.mocked(runGoalAction).mockResolvedValue({ ok: true, text: 'Strict draft' });
        const g = goalWithPlan('Grow');
        const actionText = g.plan!.agentActions[0].text;
        renderMc(<StrictMode><MissionControl /></StrictMode>);
        fireEvent.click(screen.getByRole('button', { name: `Run with agent: ${actionText}` }));
        await screen.findByRole('region', { name: `Result for ${actionText}` });
        expect(screen.getByText('Strict draft')).toBeInTheDocument();
    });
});

describe('owner switch during run', () => {
    it('drops the result for both run and refine when the owner changes mid-await', async () => {
        const g = goalWithPlan('Grow');
        const actionText = g.plan!.agentActions[0].text;
        const runDeferred = deferred<{ ok: true; text: string }>();
        vi.mocked(runGoalAction).mockReturnValue(runDeferred.promise as never);

        // goalsUserIdHolder / artifactsUserIdHolder stay pinned to UID throughout —
        // only `captureOwner`'s verdict flips — so a missing guard would actually
        // land a write in a reachable namespace instead of silently no-op'ing.
        renderMc();
        fireEvent.click(screen.getByRole('button', { name: `Run with agent: ${actionText}` }));
        expect(goalsUserIdHolder.current).toBe(UID);

        ownerIsStale = true; // account switch lands before the run resolves
        runDeferred.resolve({ ok: true, text: 'sneaky result' });
        await act(async () => { await runDeferred.promise; await Promise.resolve(); await Promise.resolve(); });

        expect(artifactsUserIdHolder.current).toBe(UID);
        const stored = goalsStore.getSnapshot().find(x => x.id === g.id)!;
        expect(stored.plan!.agentActions[0].result).toBeUndefined();
        expect(stored.notes.length).toBe(0);
        expect(artifactStore.getSnapshot().some(a => a.content === 'sneaky result')).toBe(false);
    });

    it('drops a refine answer when the owner changes mid-await', async () => {
        const g = goalWithPlan('Grow');
        const refineDeferred = deferred<{ ok: true; plan: typeof g.plan }>();
        vi.mocked(refineGoal).mockReturnValue(refineDeferred.promise as never);

        renderMc();
        const textarea = screen.getByLabelText(`Answers for ${g.title}`);
        fireEvent.change(textarea, { target: { value: 'A sneaky answer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Refine plan' }));

        ownerIsStale = true;
        refineDeferred.resolve({ ok: true, plan: g.plan! });
        await act(async () => { await refineDeferred.promise; await Promise.resolve(); await Promise.resolve(); });

        // Owner-changed: no status update (still mid-flight), textarea keeps the draft.
        expect(screen.queryByText('Plan refined.')).not.toBeInTheDocument();
        expect((textarea as HTMLTextAreaElement).value).toBe('A sneaky answer');
    });
});
