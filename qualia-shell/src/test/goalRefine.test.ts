/**
 * Plan 075 Phase 2 (coder A: goalPlanner refine history + ARA refine wiring
 * + ConnectionsPanel tombstone-aware count). Pinning tests for:
 *  - answersForPrompt: ordering/numbering/cap
 *  - REFINE_GOAL_PATTERN: multi-line answers (the `s` flag)
 *  - formatPlanForChat's refine hint: word-boundary truncation
 *  - ConnectionsPanel goals row: tombstones excluded
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { answersForPrompt, formatPlanForChat, heuristicPlan, REFINE_GOAL_PATTERN } from '../lib/goalPlanner';
import { goalsStore, goalsUserIdHolder, createGoal, resetGoals, type Goal } from '../lib/goalsStore';
import { buildMemoryRows } from '../components/Connections/ConnectionsPanel';

beforeEach(() => {
    goalsUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    resetGoals();
});

describe('answersForPrompt', () => {
    it('numbers the latest answer alone when there is no prior history', () => {
        expect(answersForPrompt(undefined, 'first answer')).toBe('1. first answer');
        expect(answersForPrompt([], 'first answer')).toBe('1. first answer');
    });

    it('numbers prior answers oldest-first, then the latest', () => {
        const prior = [{ ts: 1, text: 'first' }, { ts: 2, text: 'second' }];
        expect(answersForPrompt(prior, 'third')).toBe('1. first\n2. second\n3. third');
    });

    it('caps total length to ~3000 chars, dropping the OLDEST entries first', () => {
        const prior = Array.from({ length: 60 }, (_, i) => ({ ts: i, text: `answer number ${i} `.repeat(6) }));
        const latest = 'THE NEWEST ANSWER';
        const result = answersForPrompt(prior, latest);
        expect(result.length).toBeLessThanOrEqual(3000);
        expect(result).toContain(latest);
        expect(result).not.toContain('answer number 0 ');
    });
});

describe('REFINE_GOAL_PATTERN multi-line answers', () => {
    it('captures a multi-line answer body in full', () => {
        const m = 'refine goal grow my channel: line one\nline two'.match(REFINE_GOAL_PATTERN);
        expect(m?.[1]).toBe('grow my channel');
        expect(m?.[2]).toBe('line one\nline two');
    });

    it('still stops the title at the first separator', () => {
        const m = 'refine goal Q3 2026 - revenue: yes\nand also this'.match(REFINE_GOAL_PATTERN);
        expect(m?.[1]).toBe('Q3 2026 - revenue');
        expect(m?.[2]).toBe('yes\nand also this');
    });
});

describe('formatPlanForChat refine hint: word-boundary truncation', () => {
    it('keeps the whole title when it already fits in 40 chars', () => {
        const text = formatPlanForChat('Grow my channel', heuristicPlan('Grow my channel'));
        expect(text).toContain('refine goal Grow my channel:');
    });

    it('cuts a long title at the last word boundary at or under 40 chars, never mid-word', () => {
        const title = 'Grow my YouTube channel to a hundred thousand subscribers by next year';
        const text = formatPlanForChat(title, heuristicPlan(title));
        const m = text.match(/refine goal (.*?):/);
        expect(m).toBeTruthy();
        const hint = m![1];
        expect(hint.length).toBeLessThanOrEqual(40);
        // Never mid-word: the char after the hint in the original title is a space (or the hint is the full title).
        expect(title.startsWith(hint)).toBe(true);
        expect(title[hint.length] === ' ' || hint.length === title.length).toBe(true);
    });
});

describe('ConnectionsPanel goals row', () => {
    it('excludes a tombstoned goal (deletedAt set) from the count', () => {
        const live = createGoal('Live goal');
        const tombstoned = createGoal('Deleted goal');
        const snapshot = goalsStore.getSnapshot() as Goal[];
        goalsStore.set(
            snapshot.map(g => (g.id === tombstoned.id ? { ...g, deletedAt: Date.now() } : g)),
            () => { /* no-op: skip localStorage write for this in-memory test */ },
        );
        const rows = buildMemoryRows();
        const goalsRow = rows.find(r => r.name === 'Goals (Mission Control)');
        expect(goalsRow?.count).toBe(1);
        // sanity: the live goal really is the one counted
        expect(goalsStore.getSnapshot().find(g => g.id === live.id)?.deletedAt).toBeUndefined();
    });
});
