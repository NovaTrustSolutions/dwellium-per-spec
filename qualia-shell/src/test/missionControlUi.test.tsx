/**
 * MissionControl UI fixes (plan 075 §2):
 *  - D9: the "New goal" title input must clear on every exit path of create(),
 *    including an account switch mid-await (owner guard trips → early return).
 *  - D10: the delete button's "Sure?" confirm must disarm — on blur, and after
 *    a 4s timeout — never staying armed forever.
 *  - D11: the progress bar needs an accessible name naming the goal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn(), history: vi.fn() },
}));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { active: null } } }),
}));

// D9: control captureOwner() so create() can be made to hit its early-return
// (stale-owner) branch deterministically.
let ownerIsStale = false;
vi.mock('../lib/perUserIdentity', async (orig) => ({
    ...(await orig<object>()),
    captureOwner: () => () => !ownerIsStale,
}));

// generateGoalPlan awaits — resolve it manually so the test can flip
// ownerIsStale "mid-await", mirroring an account switch racing the plan call.
let resolvePlan: (() => void) | null = null;
vi.mock('../lib/goalPlanner', () => ({
    generateGoalPlan: () => new Promise<{ brief: string; agentActions: never[]; userActions: never[]; clarifyingQuestions: never[] }>(resolve => {
        resolvePlan = () => resolve({ brief: 'b', agentActions: [], userActions: [], clarifyingQuestions: [] });
    }),
}));

import { UserContext } from '../context/UserContext';
import MissionControl from '../components/MissionControl/MissionControl';
import { goalsUserIdHolder, resetGoals, createGoal } from '../lib/goalsStore';

const UID = 'mc-ui-test';
function renderMc() {
    return render(
        <UserContext.Provider value={{ user: { id: UID, name: 'T' } } as never}>
            <MissionControl />
        </UserContext.Provider>,
    );
}

beforeEach(() => {
    goalsUserIdHolder.current = UID;
    try { localStorage.clear(); } catch { /* */ }
    resetGoals();
    ownerIsStale = false;
    resolvePlan = null;
});
afterEach(() => { vi.useRealTimers(); });

describe('D9 — title clears on every create() exit path', () => {
    it('clears the input even when the owner guard trips mid-await (account switch)', async () => {
        renderMc();
        const input = screen.getByLabelText('New goal title') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Grow the rent roll' } });
        fireEvent.click(screen.getByRole('button', { name: /New goal/i }));

        // Simulate the account switch landing before the plan resolves.
        ownerIsStale = true;
        expect(resolvePlan).not.toBeNull();
        resolvePlan!();

        await waitFor(() => expect(input.value).toBe(''));
    });
});

describe('D10 — delete confirm disarms', () => {
    it('disarms on blur', () => {
        createGoal('Fix the roof');
        renderMc();
        const del = screen.getAllByRole('button', { name: /Delete goal/i })[0];
        fireEvent.click(del);
        expect(del.textContent).toContain('Sure?');
        fireEvent.blur(del);
        expect(del.textContent).not.toContain('Sure?');
    });

    it('disarms after 4s even with no blur', () => {
        vi.useFakeTimers();
        createGoal('Fix the roof');
        renderMc();
        const del = screen.getAllByRole('button', { name: /Delete goal/i })[0];
        fireEvent.click(del);
        expect(del.textContent).toContain('Sure?');
        act(() => { vi.advanceTimersByTime(4000); });
        expect(del.textContent).not.toContain('Sure?');
    });
});

describe('D11 — progress bar accessible name', () => {
    it('names the goal in the progressbar aria-label', () => {
        createGoal('Fix the roof');
        renderMc();
        expect(screen.getByRole('progressbar', { name: 'Progress for Fix the roof' })).toBeInTheDocument();
    });
});
