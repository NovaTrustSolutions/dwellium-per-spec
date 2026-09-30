/**
 * P12-5 Mission Control (gap item 7): goals with agent-drafted plans —
 * brief + agent-vs-you actions + clarifying questions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    goalsStore,
    goalsUserIdHolder,
    createGoal,
    updateGoalPlan,
    setGoalStatus,
    toggleGoalAction,
    addGoalNote,
    deleteGoal,
    findGoalByTitle,
    findGoalCandidates,
    goalProgress,
    liveGoals,
    resetGoals,
} from '../lib/goalsStore';
import { heuristicPlan, generateGoalPlan, NEW_GOAL_PATTERN, REFINE_GOAL_PATTERN, formatPlanForChat } from '../lib/goalPlanner';

const NO_LLM = { active: null } as never;

// D6 'failed' path: mock llmClient so generateGoalPlan takes the catch/invalid-reply branch.
let llmActive = false;
let callLlmImpl: () => Promise<{ text: string }> = async () => { throw new Error('network'); };
vi.mock('../lib/llmClient', () => ({
    hasActiveLlm: () => llmActive,
    callLlm: (...args: unknown[]) => callLlmImpl(...(args as [])),
    LlmError: class LlmError extends Error {},
}));
const SOME_LLM = { active: 'anthropic' } as never;

beforeEach(() => {
    goalsUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    resetGoals();
});

describe('goal lifecycle', () => {
    it('create → plan → toggle actions → progress → note → status → delete', () => {
        const g = createGoal('Grow to 1,000 subscribers');
        expect(goalsStore.getSnapshot()).toHaveLength(1);
        expect(goalProgress(g)).toBe(0);

        updateGoalPlan(g.id, heuristicPlan(g.title));
        toggleGoalAction(g.id, 'agentActions', 0);
        const after = goalsStore.getSnapshot()[0];
        expect(after.plan?.agentActions[0].done).toBe(true);
        expect(goalProgress(after)).toBeGreaterThan(0);

        addGoalNote(g.id, 'Recorded two videos');
        expect(goalsStore.getSnapshot()[0].notes).toHaveLength(1);

        setGoalStatus(g.id, 'done');
        expect(goalsStore.getSnapshot()[0].status).toBe('done');

        deleteGoal(g.id);
        // D5: delete leaves a tombstone in the raw array (so a stale device's
        // merge never resurrects it) — the visible list is what drops to 0.
        expect(liveGoals(goalsStore.getSnapshot())).toHaveLength(0);
        const tombstone = goalsStore.getSnapshot()[0];
        expect(tombstone.deletedAt).toBeTypeOf('number');
        expect(tombstone.status).toBe('done');
        expect(tombstone.title).toBe('');
    });

    it('findGoalByTitle matches exact then fuzzy', () => {
        createGoal('Grow the rent roll');
        createGoal('Launch email list');
        expect(findGoalByTitle('launch email list')?.title).toBe('Launch email list');
        expect(findGoalByTitle('rent roll')?.title).toBe('Grow the rent roll');
        expect(findGoalByTitle('nonexistent')).toBeNull();
    });

    it('findGoalByTitle: two active goals sharing a substring → null, candidates length 2', () => {
        createGoal('Refine reports');
        createGoal('Research renters');
        expect(findGoalByTitle('re')).toBeNull();
        expect(findGoalCandidates('re')).toHaveLength(2);
    });

    it('findGoalByTitle: a done goal and an active goal with the same title → returns the active one', () => {
        const done = createGoal('Grow the rent roll');
        setGoalStatus(done.id, 'done');
        const active = createGoal('Grow the rent roll');
        const found = findGoalByTitle('grow the rent roll');
        expect(found?.id).toBe(active.id);
        expect(found?.status).toBe('active');
    });

    it('findGoalByTitle: substring matches only a done goal (no active match) → still resolves', () => {
        const done = createGoal('Archived listing sweep');
        setGoalStatus(done.id, 'done');
        expect(findGoalByTitle('archived listing')?.id).toBe(done.id);
    });
});

describe('ARA intake patterns', () => {
    it('matches "new goal …" and "refine goal …: answers"', () => {
        expect('new goal grow my youtube channel'.match(NEW_GOAL_PATTERN)?.[1]).toBe('grow my youtube channel');
        expect('Create goal: launch the email list'.match(NEW_GOAL_PATTERN)?.[1]).toBe('launch the email list');
        const m = 'refine goal grow my channel: 500 subs now, tech niche, 40 videos'.match(REFINE_GOAL_PATTERN);
        expect(m?.[1]).toBe('grow my channel');
        expect(m?.[2]).toContain('500 subs');
        expect('open strata'.match(NEW_GOAL_PATTERN)).toBeNull();
    });

    it('REFINE_GOAL_PATTERN: bare hyphen is never a separator; only `:` or spaced em/en dash', () => {
        const a = 'refine goal re-lease units: 12 doors'.match(REFINE_GOAL_PATTERN);
        expect(a?.[1]).toBe('re-lease units');
        expect(a?.[2]).toBe('12 doors');

        const b = 'refine goal Q3 2026 - revenue: yes'.match(REFINE_GOAL_PATTERN);
        expect(b?.[1]).toBe('Q3 2026 - revenue');
        expect(b?.[2]).toBe('yes');

        expect('refine goal grow my channel'.match(REFINE_GOAL_PATTERN)).toBeNull();

        const c = 'refine goal grow my channel — 500 subs'.match(REFINE_GOAL_PATTERN);
        expect(c?.[1]).toBe('grow my channel');
        expect(c?.[2]).toBe('500 subs');
    });
});

describe('planner', () => {
    it('no LLM → honest heuristic plan with both action lists', async () => {
        const plan = await generateGoalPlan('Test goal', NO_LLM);
        expect(plan.agentActions.length).toBeGreaterThan(0);
        expect(plan.userActions.length).toBeGreaterThan(0);
        expect(plan.brief).toContain('No LLM key');
    });

    it('heuristicPlan("failed") does not say no key is configured', () => {
        const plan = heuristicPlan('Test goal', 'failed');
        expect(plan.brief).toContain('AI planner call failed');
        expect(plan.brief).not.toContain('No LLM key');
        expect(plan.brief).toContain('refine goal');
    });

    it('generateGoalPlan: LLM call throws → "failed" heuristic (not "no-llm")', async () => {
        llmActive = true;
        callLlmImpl = async () => { throw new Error('rate limited'); };
        const plan = await generateGoalPlan('Test goal', SOME_LLM);
        expect(plan.brief).toContain('AI planner call failed');
        llmActive = false;
    });

    it('generateGoalPlan: unparsable LLM reply → "failed" heuristic', async () => {
        llmActive = true;
        callLlmImpl = async () => ({ text: 'not json at all' });
        const plan = await generateGoalPlan('Test goal', SOME_LLM);
        expect(plan.brief).toContain('AI planner call failed');
        llmActive = false;
    });

    it('formatPlanForChat renders brief, both lists, and questions', () => {
        const text = formatPlanForChat('My goal', heuristicPlan('My goal'));
        expect(text).toContain("I'll handle:");
        expect(text).toContain('Your role:');
        expect(text).toContain('refine goal');
    });
});
