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
import { useContext, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { UserContext } from '../context/UserContext';
import { integrationsUserIdHolder } from '../utils/integrationsStore';

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

export interface Goal {
    id: string;
    title: string;
    status: 'active' | 'done' | 'paused';
    plan?: GoalPlan;
    notes: GoalNote[];
    createdAt: number;
    updatedAt: number;
}

export const goalsUserIdHolder = integrationsUserIdHolder; // shared identity

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

export function updateGoalPlan(id: string, plan: GoalPlan): void {
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

/** Find a goal by fuzzy title match (ARA "refine goal X" tier). */
export function findGoalByTitle(fragment: string): Goal | null {
    const f = fragment.trim().toLowerCase();
    if (!f) return null;
    const goals = goalsStore.getSnapshot();
    return goals.find(g => g.title.toLowerCase() === f)
        ?? goals.find(g => g.title.toLowerCase().includes(f))
        ?? null;
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
    const userCtx = useContext(UserContext);
    goalsUserIdHolder.current = userCtx?.user?.id ?? goalsUserIdHolder.current ?? null;
    const goals = useSyncExternalStore(
        goalsStore.subscribe,
        goalsStore.getSnapshot,
        goalsStore.getServerSnapshot,
    );
    return { goals, createGoal, updateGoalPlan, setGoalStatus, toggleGoalAction, addGoalNote, deleteGoal };
}
