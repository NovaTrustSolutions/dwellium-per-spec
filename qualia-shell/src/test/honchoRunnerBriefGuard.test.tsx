/**
 * honchoBackgroundRunner — plan 046 B2 ownership rule: when a brief for today
 * already exists (server-written, or an earlier client one) the nightly deep
 * cycle must NOT overwrite it; with no brief it still generates the data-only one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn(), history: vi.fn() },
}));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { active: null } } }),
}));

import { UserContext } from '../context/UserContext';
import { useHonchoBackgroundRunner } from '../services/honchoBackgroundRunner';
import { morningBriefUserIdHolder, resetMorningBriefs, todaysBrief, upsertBrief } from '../lib/morningBriefStore';
import { goalsStore, goalsUserIdHolder, createGoal } from '../lib/goalsStore';
import { dayKey } from '../lib/dailySynthesis';

const UID = 'u-runner';
const wrapper = ({ children }: { children: ReactNode }) => (
    <UserContext.Provider value={{ user: { id: UID, name: 'R' } } as never}>{children}</UserContext.Provider>
);

async function runFirstTick() {
    renderHook(() => useHonchoBackgroundRunner(), { wrapper });
    await vi.advanceTimersByTimeAsync(60 * 1000 + 10);
}

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    morningBriefUserIdHolder.current = UID;
    goalsUserIdHolder.current = UID;
    goalsStore.reset();
    resetMorningBriefs();
    createGoal('Fix the roof', { brief: 'b', agentActions: [{ text: 'a', done: true }], userActions: [{ text: 'b', done: false }], clarifyingQuestions: [] });
});
afterEach(() => { vi.useRealTimers(); });

describe('deepCycle vs an existing brief for today', () => {
    it('control: no brief today → the runner writes the data-only brief', async () => {
        expect(todaysBrief()).toBeNull();
        await runFirstTick();
        expect(todaysBrief()?.dataLines[0]).toMatch(/^Goals: Fix the roof/);
    });

    it('server brief present → untouched (todaysBrief() wins the day)', async () => {
        upsertBrief({ date: dayKey(), insights: [], suggestions: [], dataLines: ['server-line'] });
        await runFirstTick();
        expect(todaysBrief()?.dataLines).toEqual(['server-line']);
        expect(localStorage.getItem(`honcho:bg:deepDay:${UID}`)).toBeNull(); // never even claimed the day
    });
});
