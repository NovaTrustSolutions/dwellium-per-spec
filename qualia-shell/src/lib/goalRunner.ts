/**
 * goalRunner — plan 075 P3: the two agent operations Mission Control runs
 * in place (no ARA round-trip), shared with ARA's "refine goal" tier.
 */
import { callLlm, hasActiveLlm } from './llmClient';
import { captureOwner } from './perUserIdentity';
import type { IntegrationsBundle } from '../types/integrations';
import { answersForPrompt, generateGoalPlan } from './goalPlanner';
import { goalsStore, updateGoalPlan, type Goal, type GoalPlan } from './goalsStore';

export type RunActionResult =
    | { ok: true; text: string }
    | { ok: false; reason: 'no-llm' | 'failed' };

const MAX_ACTION_RESULT_LEN = 4000;
/** Delimiters that could be used to forge fake sections in the prompt — neutralized when they open a line inside untrusted goal text. */
const BLOCK_DELIMITERS = ['GOAL TITLE', 'GOAL BRIEF', 'ACTION', 'ANSWERS', 'RECENT NOTES', 'TARGET DATE'];

/** Strip/neutralize lines that start (after optional leading punctuation/whitespace) with one of our block delimiters, so goal text can't forge a new section. */
function neutralizeDelimiterLines(text: string): string {
    return text
        .split('\n')
        .map(line => {
            const trimmed = line.trimStart();
            const isForged = BLOCK_DELIMITERS.some(d => trimmed.toUpperCase().startsWith(d));
            return isForged ? line.replace(/^(\s*)/, '$1​') : line;
        })
        .join('\n');
}

const RUN_ACTION_SYSTEM = `You are an agent inside Dwellium, a property-management workspace, doing ONE step of the user's goal.
Produce the actual deliverable for the given action (a draft, a research summary, a checklist, an analysis — whatever the action calls for) in concise markdown, at most 350 words.
State any assumptions you make explicitly.
You NEVER claim to have contacted anyone, sent anything, or taken any real-world action — you only produce text.`;

function buildRunActionPrompt(goal: Goal, actionText: string): string {
    const answers = (goal.answers ?? []).map(a => a.text).join('\n');
    const notes = goal.notes.slice(-3).map(n => n.text);
    const parts = [
        `GOAL TITLE:\n${neutralizeDelimiterLines(goal.title)}`,
        `GOAL BRIEF:\n${neutralizeDelimiterLines(goal.plan?.brief ?? '')}`,
        `ACTION TO DO NOW:\n${neutralizeDelimiterLines(actionText)}`,
    ];
    if (answers) parts.push(`ANSWERS THE USER GAVE EARLIER:\n${neutralizeDelimiterLines(answers)}`);
    if (notes.length) parts.push(`RECENT NOTES:\n${notes.map(n => neutralizeDelimiterLines(n)).join('\n')}`);
    if (goal.targetDate) parts.push(`TARGET DATE:\n${goal.targetDate}`);
    return parts.join('\n\n');
}

/**
 * Run one agent action for a goal with a single LLM call (source 'goals').
 * Pure: never writes a store — the caller owns the owner guard and persistence.
 */
export async function runGoalAction(goal: Goal, actionText: string, llm: IntegrationsBundle['llm']): Promise<RunActionResult> {
    if (!hasActiveLlm(llm)) return { ok: false, reason: 'no-llm' };
    try {
        const res = await callLlm({
            systemPrompt: RUN_ACTION_SYSTEM,
            prompt: buildRunActionPrompt(goal, actionText),
            maxTokens: 900,
            temperature: 0.4,
            source: 'goals',
        }, llm);
        const text = res?.text?.trim();
        if (!text) return { ok: false, reason: 'failed' };
        return { ok: true, text: text.slice(0, MAX_ACTION_RESULT_LEN) };
    } catch {
        return { ok: false, reason: 'failed' };
    }
}

export type RefineResult =
    | { ok: true; plan: GoalPlan }
    | { ok: false; reason: 'empty' | 'not-found' | 'owner-changed' };

function findLiveGoal(id: string): Goal | undefined {
    return goalsStore.getSnapshot().find(g => g.id === id && g.deletedAt == null);
}

/**
 * Refine a goal's plan with an answer: whole answer history → planner,
 * owner-guarded, then updateGoalPlan(id, plan, { keepDone: true, answer }).
 * Used by the Mission Control card AND ARA's "refine goal" tier.
 */
export async function refineGoal(goalId: string, answer: string, llm: IntegrationsBundle['llm']): Promise<RefineResult> {
    const trimmed = answer.trim();
    if (!trimmed) return { ok: false, reason: 'empty' };

    const stillOwner = captureOwner();
    const goal = findLiveGoal(goalId);
    if (!goal) return { ok: false, reason: 'not-found' };

    const plan = await generateGoalPlan(goal.title, llm, answersForPrompt(goal.answers, trimmed));
    if (!stillOwner()) return { ok: false, reason: 'owner-changed' };

    // Re-read after the await — the goal may have been deleted meanwhile.
    if (!findLiveGoal(goalId)) return { ok: false, reason: 'not-found' };

    updateGoalPlan(goalId, plan, { keepDone: true, answer: trimmed });
    return { ok: true, plan };
}
