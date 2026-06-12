/**
 * P12-5 Mission Control (gap item 7): goals with agent-drafted plans —
 * brief + agent-vs-you actions + clarifying questions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
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
    goalProgress,
    resetGoals,
} from '../lib/goalsStore';
import { heuristicPlan, generateGoalPlan, NEW_GOAL_PATTERN, REFINE_GOAL_PATTERN, formatPlanForChat } from '../lib/goalPlanner';

const NO_LLM = { active: null } as never;

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
        expect(goalsStore.getSnapshot()).toHaveLength(0);
    });

    it('findGoalByTitle matches exact then fuzzy', () => {
        createGoal('Grow the rent roll');
        createGoal('Launch email list');
        expect(findGoalByTitle('launch email list')?.title).toBe('Launch email list');
        expect(findGoalByTitle('rent roll')?.title).toBe('Grow the rent roll');
        expect(findGoalByTitle('nonexistent')).toBeNull();
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
});

describe('planner', () => {
    it('no LLM → honest heuristic plan with both action lists', async () => {
        const plan = await generateGoalPlan('Test goal', NO_LLM);
        expect(plan.agentActions.length).toBeGreaterThan(0);
        expect(plan.userActions.length).toBeGreaterThan(0);
        expect(plan.brief).toContain('No LLM key');
    });

    it('formatPlanForChat renders brief, both lists, and questions', () => {
        const text = formatPlanForChat('My goal', heuristicPlan('My goal'));
        expect(text).toContain("I'll handle:");
        expect(text).toContain('Your role:');
        expect(text).toContain('refine goal');
    });
});
