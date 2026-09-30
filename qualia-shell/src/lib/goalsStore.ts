/**
 * goalsStore — P12-5 Mission Control (gap item 7, 2026-06-12): midterm goals
 * with agent-generated plans. The video's shape: a goal carries a BRIEF, the
 * agent's action list, and YOUR action list ("I can even see what my role
 * is") — tracked on the dashboard, refined by answering clarifying questions.
 *
 * Storage: per-user One Save ('goals'), tabGroupStore sister shape incl.
 * `.reset()`. Identity rides integrationsUserIdHolder so ARA's intake tier
 * (outside React) namespaces correctly.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { goalsUserIdHolder, usePerUserIdentity } from './perUserIdentity';

export interface GoalAction {
    text: string;
    done: boolean;
}

export interface GoalPlan {
    /** The agent's brief — how it understands the goal + approach. */
    brief: string;
    /** What the AGENT will do (each runnable via ARA). */
    agentActions: GoalAction[];
    /** What YOU need to do (the video's "my role"). */
    userActions: GoalAction[];
    /** Open clarifying questions — answering them refines the plan. */
    clarifyingQuestions: string[];
}

export interface GoalNote {
    ts: number;
    text: string;
}

export interface GoalAnswer {
    ts: number;
    text: string;
}

export interface Goal {
    id: string;
    title: string;
    status: 'active' | 'done' | 'paused';
    plan?: GoalPlan;
    notes: GoalNote[];
    /** Answers given to the planner's clarifying questions (refine history), oldest first. */
    answers?: GoalAnswer[];
    createdAt: number;
    updatedAt: number;
    /**
     * Tombstone (plan 075 D5): set when the goal is deleted. The entry stays in
     * the synced array — status 'done', empty title — so a merge with a stale
     * device never resurrects it; every reader skips it (UI via liveGoals, the
     * rest because it is 'done').
     */
    deletedAt?: number;
}

export interface UpdatePlanOptions {
    /** Carry `done` forward onto actions whose normalized text is unchanged. */
    keepDone?: boolean;
    /** Refine answer to append to `answers`. */
    answer?: string;
}

export { goalsUserIdHolder };

function resolveKey(): string {
    const uid = goalsUserIdHolder.current;
    return uid ? `goals:${uid}` : 'goals:_anonymous';
}

function isGoal(g: unknown): g is Goal {
    return !!g && typeof (g as Goal).id === 'string' && typeof (g as Goal).title === 'string';
}

function deserialize(raw: string | null): Goal[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isGoal) : [];
    } catch {
        return [];
    }
}

export const goalsStore = withSync(
    createLocalStorageStore<Goal[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'goals', holder: goalsUserIdHolder, resolveKey },
);

function persist(next: Goal[]): void {
    goalsStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

function newGoalId(): string {
    return `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── Mutators ─── */

export function createGoal(title: string, plan?: GoalPlan): Goal {
    const now = Date.now();
    const goal: Goal = { id: newGoalId(), title: title.trim().slice(0, 160), status: 'active', plan, notes: [], createdAt: now, updatedAt: now };
    persist([...goalsStore.getSnapshot(), goal]);
    return goal;
}

// P0 contract stub (plan 075): options accepted, implemented in phase 2 W1.
export function updateGoalPlan(id: string, plan: GoalPlan, _opts?: UpdatePlanOptions): void {
    persist(goalsStore.getSnapshot().map(g => (g.id === id ? { ...g, plan, updatedAt: Date.now() } : g)));
}

export function setGoalStatus(id: string, status: Goal['status']): void {
    persist(goalsStore.getSnapshot().map(g => (g.id === id ? { ...g, status, updatedAt: Date.now() } : g)));
}

export function toggleGoalAction(id: string, side: 'agentActions' | 'userActions', index: number): void {
    persist(goalsStore.getSnapshot().map(g => {
        if (g.id !== id || !g.plan) return g;
        const actions = g.plan[side].map((a, i) => (i === index ? { ...a, done: !a.done } : a));
        return { ...g, plan: { ...g.plan, [side]: actions }, updatedAt: Date.now() };
    }));
}

export function addGoalNote(id: string, text: string): void {
    const t = text.trim();
    if (!t) return;
    persist(goalsStore.getSnapshot().map(g => (g.id === id ? { ...g, notes: [...g.notes, { ts: Date.now(), text: t.slice(0, 500) }], updatedAt: Date.now() } : g)));
}

export function deleteGoal(id: string): void {
    persist(goalsStore.getSnapshot().filter(g => g.id !== id));
}

/**
 * Find a goal by fuzzy title match (ARA "refine goal X" tier).
 * Order: exact match (preferring a non-done goal over a done one with the
 * same title) → else a substring match among non-done goals, but ONLY when
 * exactly one non-done goal matches → else a substring match among ALL
 * goals, but ONLY when exactly one matches overall → else null (ambiguous
 * or not found; see findGoalCandidates for the ambiguous-reply tier).
 */
export function findGoalByTitle(fragment: string): Goal | null {
    const f = fragment.trim().toLowerCase();
    if (!f) return null;
    const goals = goalsStore.getSnapshot();
    const exact = goals.filter(g => g.title.toLowerCase() === f);
    if (exact.length > 0) {
        return exact.find(g => g.status !== 'done') ?? exact[0];
    }
    const activeSubstr = goals.filter(g => g.status !== 'done' && g.title.toLowerCase().includes(f));
    if (activeSubstr.length === 1) return activeSubstr[0];
    if (activeSubstr.length === 0) {
        const allSubstr = goals.filter(g => g.title.toLowerCase().includes(f));
        if (allSubstr.length === 1) return allSubstr[0];
    }
    return null;
}

/** All substring-title matches for `fragment` (non-done goals first) — used to list candidates when findGoalByTitle can't disambiguate. */
export function findGoalCandidates(fragment: string): Goal[] {
    const f = fragment.trim().toLowerCase();
    if (!f) return [];
    const goals = goalsStore.getSnapshot().filter(g => g.title.toLowerCase().includes(f));
    return [...goals.filter(g => g.status !== 'done'), ...goals.filter(g => g.status === 'done')];
}

/** Goals the user can see: tombstones removed. */
export function liveGoals(goals: Goal[]): Goal[] {
    return goals.filter(g => !g.deletedAt);
}

/**
 * One Save merge (plan 075 D5): union by id, newer updatedAt wins, tombstones
 * kept. P0 contract stub — returns remote (today's behaviour) until W1.
 */
export function mergeGoals(_local: Goal[], remote: Goal[]): Goal[] {
    return remote;
}

/** Progress 0..1 across both action lists (no plan → 0). */
export function goalProgress(goal: Goal): number {
    if (!goal.plan) return 0;
    const all = [...goal.plan.agentActions, ...goal.plan.userActions];
    if (all.length === 0) return 0;
    return all.filter(a => a.done).length / all.length;
}

export function resetGoals(): void {
    goalsStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

/* ─── Hook ─── */

export function useGoals() {
    // Single writer: sets every per-user holder to the active user.id at once.
    usePerUserIdentity();
    const goals = useSyncExternalStore(
        goalsStore.subscribe,
        goalsStore.getSnapshot,
        goalsStore.getServerSnapshot,
    );
    return { goals, createGoal, updateGoalPlan, setGoalStatus, toggleGoalAction, addGoalNote, deleteGoal };
}
