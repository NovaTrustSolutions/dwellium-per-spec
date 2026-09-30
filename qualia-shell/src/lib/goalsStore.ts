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
import { useMemo, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { goalsUserIdHolder, usePerUserIdentity } from './perUserIdentity';

export interface GoalActionResult {
    ts: number;
    /** What the agent produced when the action was run in the card (plan 075 P3). */
    text: string;
}

export interface GoalAction {
    text: string;
    done: boolean;
    /** Latest in-card run output for this action (agent side), if any. */
    result?: GoalActionResult;
}

export type GoalSide = 'agentActions' | 'userActions';

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
    /** Optional target date, local calendar day `YYYY-MM-DD` (plan 075 P3). */
    targetDate?: string;
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

/* ─── D4 repair (plan 075): a remote/local payload of unknown shape is
 * repaired into a valid Goal rather than dropped outright — a null/missing
 * `plan.agentActions` or a garbage `notes` array used to throw in
 * `goalProgress` or fail `isGoal` entirely. Used by `deserialize` AND by
 * `mergeGoals` for BOTH sides (One Save hydrate hands the remote payload
 * straight to `merge`, bypassing the deserializer). */

const STATUS_VALUES: ReadonlyArray<Goal['status']> = ['active', 'done', 'paused'];

function toFiniteNumber(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sanitizeAction(a: unknown): GoalAction | null {
    if (!a || typeof a !== 'object') return null;
    const text = (a as Record<string, unknown>).text;
    if (typeof text !== 'string') return null;
    return { text, done: !!(a as Record<string, unknown>).done };
}

function sanitizeActionList(v: unknown): GoalAction[] {
    if (!Array.isArray(v)) return [];
    return v.map(sanitizeAction).filter((a): a is GoalAction => a !== null);
}

function sanitizeTimedNote(n: unknown): GoalNote | null {
    if (!n || typeof n !== 'object') return null;
    const text = (n as Record<string, unknown>).text;
    if (typeof text !== 'string') return null;
    return { ts: toFiniteNumber((n as Record<string, unknown>).ts, 0), text };
}

function sanitizeTimedNoteList(v: unknown): GoalNote[] {
    if (!Array.isArray(v)) return [];
    return v.map(sanitizeTimedNote).filter((n): n is GoalNote => n !== null);
}

function sanitizePlan(v: unknown): GoalPlan | undefined {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const p = v as Record<string, unknown>;
    return {
        brief: typeof p.brief === 'string' ? p.brief : '',
        agentActions: sanitizeActionList(p.agentActions),
        userActions: sanitizeActionList(p.userActions),
        clarifyingQuestions: Array.isArray(p.clarifyingQuestions)
            ? p.clarifyingQuestions.filter((q): q is string => typeof q === 'string')
            : [],
    };
}

/** Keep iff `id` is a non-empty string and `title` is a string; repair everything else. */
export function sanitizeGoal(raw: unknown): Goal | null {
    if (!raw || typeof raw !== 'object') return null;
    const g = raw as Record<string, unknown>;
    if (typeof g.id !== 'string' || g.id.length === 0) return null;
    if (typeof g.title !== 'string') return null;

    const status = STATUS_VALUES.includes(g.status as Goal['status']) ? (g.status as Goal['status']) : 'active';
    const plan = sanitizePlan(g.plan);
    const goal: Goal = {
        id: g.id,
        title: g.title,
        status,
        notes: sanitizeTimedNoteList(g.notes),
        createdAt: toFiniteNumber(g.createdAt, 0),
        updatedAt: toFiniteNumber(g.updatedAt, 0),
    };
    if (plan) goal.plan = plan;
    if (Array.isArray(g.answers)) goal.answers = sanitizeTimedNoteList(g.answers);
    if (typeof g.deletedAt === 'number' && Number.isFinite(g.deletedAt)) goal.deletedAt = g.deletedAt;
    return goal;
}

function deserialize(raw: string | null): Goal[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(sanitizeGoal).filter((g): g is Goal => g !== null);
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
    { objectType: 'goals', holder: goalsUserIdHolder, resolveKey, merge: mergeGoals },
);

function persist(next: Goal[]): void {
    goalsStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

function newGoalId(): string {
    return `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** A deleted goal (D5 tombstone) — every mutator below no-ops on it. */
function isTombstone(g: Goal): boolean {
    return g.deletedAt != null;
}

/** Normalize action text for `keepDone` comparison: case/whitespace/trailing-punctuation insensitive. */
function normalizeActionText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}

const MAX_NOTES = 200;
const MAX_ANSWERS = 20;
const MAX_ANSWER_LEN = 1000;

/* ─── Mutators ─── */

export function createGoal(title: string, plan?: GoalPlan): Goal {
    const now = Date.now();
    const goal: Goal = { id: newGoalId(), title: title.trim().slice(0, 160), status: 'active', plan, notes: [], createdAt: now, updatedAt: now };
    persist([...goalsStore.getSnapshot(), goal]);
    return goal;
}

/**
 * D2: replace a goal's plan. `keepDone` carries `done` forward onto actions
 * in the NEW plan whose normalized text matches a done action on the SAME
 * side of the CURRENT snapshot (read here, at write time — so a checkbox
 * toggled during the LLM call that produced `plan` is respected, not the
 * stale plan the caller captured before awaiting). `answer` appends the
 * refine answer (trimmed, capped) to the goal's answer history.
 */
export function updateGoalPlan(id: string, plan: GoalPlan, opts?: UpdatePlanOptions): void {
    persist(goalsStore.getSnapshot().map(g => {
        if (g.id !== id || isTombstone(g)) return g;

        let nextPlan = plan;
        if (opts?.keepDone && g.plan) {
            const carryDone = (side: 'agentActions' | 'userActions'): GoalAction[] => {
                const priorDone = new Set(
                    g.plan![side].filter(a => a.done).map(a => normalizeActionText(a.text)),
                );
                return plan[side].map(a => (a.done ? a : { ...a, done: priorDone.has(normalizeActionText(a.text)) }));
            };
            nextPlan = { ...plan, agentActions: carryDone('agentActions'), userActions: carryDone('userActions') };
        }

        let answers = g.answers;
        const answerText = opts?.answer?.trim().slice(0, MAX_ANSWER_LEN);
        if (answerText) {
            answers = [...(g.answers ?? []), { ts: Date.now(), text: answerText }].slice(-MAX_ANSWERS);
        }

        return { ...g, plan: nextPlan, answers, updatedAt: Date.now() };
    }));
}

export function setGoalStatus(id: string, status: Goal['status']): void {
    persist(goalsStore.getSnapshot().map(g => (g.id === id && !isTombstone(g) ? { ...g, status, updatedAt: Date.now() } : g)));
}

export function toggleGoalAction(id: string, side: 'agentActions' | 'userActions', index: number): void {
    persist(goalsStore.getSnapshot().map(g => {
        if (g.id !== id || !g.plan || isTombstone(g)) return g;
        const actions = g.plan[side].map((a, i) => (i === index ? { ...a, done: !a.done } : a));
        return { ...g, plan: { ...g.plan, [side]: actions }, updatedAt: Date.now() };
    }));
}

export function addGoalNote(id: string, text: string): void {
    const t = text.trim();
    if (!t) return;
    persist(goalsStore.getSnapshot().map(g => (g.id === id && !isTombstone(g)
        ? { ...g, notes: [...g.notes, { ts: Date.now(), text: t.slice(0, 500) }].slice(-MAX_NOTES), updatedAt: Date.now() }
        : g)));
}

/**
 * D5: replace the goal with a tombstone instead of removing it from the
 * array — a stale device's merge must never resurrect a delete. Every
 * reader skips it: the UI via `liveGoals`, everything else because it's
 * 'done' with an empty title.
 */
export function deleteGoal(id: string): void {
    persist(goalsStore.getSnapshot().map(g => {
        if (g.id !== id) return g;
        const now = Date.now();
        return { id: g.id, title: '', status: 'done', notes: [], createdAt: g.createdAt, updatedAt: now, deletedAt: now };
    }));
}

/* ─── Plan 075 P3 editing mutators — P0 contract stubs, implemented in W1 ─── */

/** Rename (trimmed, 1..160 chars); empty → no-op. */
export function renameGoal(_id: string, _title: string): void { /* P0 stub */ }

/** Set or clear (null) the target date; only `YYYY-MM-DD` accepted. */
export function setGoalTargetDate(_id: string, _date: string | null): void { /* P0 stub */ }

/** Append an action (trimmed, ≤200 chars) to a side; creates an empty plan when missing. */
export function addGoalAction(_id: string, _side: GoalSide, _text: string): void { /* P0 stub */ }

/** Replace an action's text (trimmed, ≤200 chars; empty → no-op); clears its stale result. */
export function editGoalAction(_id: string, _side: GoalSide, _index: number, _text: string): void { /* P0 stub */ }

/** Remove the action at `index`. */
export function removeGoalAction(_id: string, _side: GoalSide, _index: number): void { /* P0 stub */ }

/**
 * Store (or clear with null) the run result on the action whose text equals
 * `actionText` — located by text, not index, so an edit during the run can't
 * attach it to the wrong row. Returns false when no such action exists.
 */
export function setGoalActionResult(_id: string, _side: GoalSide, _actionText: string, _text: string | null): boolean { return false; }

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
    const goals = liveGoals(goalsStore.getSnapshot());
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
    const goals = liveGoals(goalsStore.getSnapshot()).filter(g => g.title.toLowerCase().includes(f));
    return [...goals.filter(g => g.status !== 'done'), ...goals.filter(g => g.status === 'done')];
}

/** Goals the user can see: tombstones removed. */
export function liveGoals(goals: Goal[]): Goal[] {
    return goals.filter(g => !g.deletedAt);
}

/** Tombstones older than this are pruned during merge.
 * ponytail: 90-day ceiling — a device that stays offline longer than that
 * could see one of its deletes resurrected by a stale remote; raise this if
 * that ever actually happens. */
const TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * One Save merge (plan 075 D5): sanitize both sides (One Save hydrate hands
 * the raw remote payload straight here, bypassing `deserialize`), union by
 * id, newer `updatedAt` wins (tie → local; a tombstone is just a goal, so a
 * delete newer than an edit wins and vice versa), drop tombstones older than
 * 90 days, stable output order by createdAt then id. Pure + deterministic.
 */
export function mergeGoals(local: Goal[], remote: Goal[]): Goal[] {
    const localSane = (Array.isArray(local) ? local : []).map(sanitizeGoal).filter((g): g is Goal => g !== null);
    const remoteSane = (Array.isArray(remote) ? remote : []).map(sanitizeGoal).filter((g): g is Goal => g !== null);

    const byId = new Map<string, Goal>();
    for (const g of localSane) byId.set(g.id, g);
    for (const g of remoteSane) {
        const cur = byId.get(g.id);
        if (!cur || g.updatedAt > cur.updatedAt) byId.set(g.id, g);
    }

    const now = Date.now();
    const merged = [...byId.values()].filter(g => g.deletedAt == null || now - g.deletedAt <= TOMBSTONE_MAX_AGE_MS);
    merged.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    return merged;
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
    const snapshot = useSyncExternalStore(
        goalsStore.subscribe,
        goalsStore.getSnapshot,
        goalsStore.getServerSnapshot,
    );
    const goals = useMemo(() => liveGoals(snapshot), [snapshot]);
    return { goals, createGoal, updateGoalPlan, setGoalStatus, toggleGoalAction, addGoalNote, deleteGoal, renameGoal, setGoalTargetDate, addGoalAction, editGoalAction, removeGoalAction, setGoalActionResult };
}
