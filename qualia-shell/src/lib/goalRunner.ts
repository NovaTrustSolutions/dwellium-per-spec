/**
 * goalRunner — plan 075 P3: the two agent operations Mission Control runs
 * in place (no ARA round-trip), shared with ARA's "refine goal" tier.
 *
 * P0 contract stubs — implemented in W1.
 */
import type { IntegrationsBundle } from '../types/integrations';
import type { Goal, GoalPlan } from './goalsStore';

export type RunActionResult =
    | { ok: true; text: string }
    | { ok: false; reason: 'no-llm' | 'failed' };

/**
 * Run one agent action for a goal with a single LLM call (source 'goals').
 * Pure: never writes a store — the caller owns the owner guard and persistence.
 */
export async function runGoalAction(_goal: Goal, _actionText: string, _llm: IntegrationsBundle['llm']): Promise<RunActionResult> {
    return { ok: false, reason: 'failed' };
}

export type RefineResult =
    | { ok: true; plan: GoalPlan }
    | { ok: false; reason: 'empty' | 'not-found' | 'owner-changed' };

/**
 * Refine a goal's plan with an answer: whole answer history → planner,
 * owner-guarded, then updateGoalPlan(id, plan, { keepDone: true, answer }).
 * Used by the Mission Control card AND ARA's "refine goal" tier.
 */
export async function refineGoal(_goalId: string, _answer: string, _llm: IntegrationsBundle['llm']): Promise<RefineResult> {
    return { ok: false, reason: 'not-found' };
}
