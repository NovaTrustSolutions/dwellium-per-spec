/**
 * D3 (plan 075) — honchoBackgroundRunner's nightly deepCycle prints
 * goalProgress() (a 0..1 fraction) with a raw `%` suffix. Pins the fix
 * (Math.round(goalProgress(g) * 100)) through the real deepCycle path,
 * mirroring src/test/honchoRunnerBriefGuard.test.tsx's harness.
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
import { morningBriefUserIdHolder, resetMorningBriefs, todaysBrief } from '../lib/morningBriefStore';
import { goalsStore, goalsUserIdHolder, createGoal } from '../lib/goalsStore';

const UID = 'u-runner-progress';
const wrapper = ({ children }: { children: ReactNode }) => (
    <UserContext.Provider value={{ user: { id: UID, name: 'R' } } as never}>{children}</UserContext.Provider>
);

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    morningBriefUserIdHolder.current = UID;
    goalsUserIdHolder.current = UID;
    goalsStore.reset();
    resetMorningBriefs();
});
afterEach(() => { vi.useRealTimers(); });

describe('deepCycle goal progress line', () => {
    it('renders a whole percent, not a 0..1 fraction', async () => {
        // 1 of 2 actions done → goalProgress() = 0.5 → must print "50%", not "0.5%".
        createGoal('Fix the roof', {
            brief: 'b',
            agentActions: [{ text: 'a', done: true }],
            userActions: [{ text: 'b', done: false }],
            clarifyingQuestions: [],
        });
        renderHook(() => useHonchoBackgroundRunner(), { wrapper });
        await vi.advanceTimersByTimeAsync(60 * 1000 + 10);
        const line = todaysBrief()?.dataLines[0];
        expect(line).toContain('Fix the roof 50%');
        expect(line).not.toContain('0.5%');
    });
});
