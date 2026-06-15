/**
 * personaWorkStore — per-user, per-persona "working file": a memory that grows
 * with use, a task list (with completion times), and an audit log of actions.
 *
 * Dynamic-key per-user store (sister-shape to agentTeamsStore): each user gets
 * their own persona working data, keyed by persona id. SSR-safe.
 */
import { useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../../context/UserContext';
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

export interface PersonaMemoryEntry {
    id: string;
    text: string;
    kind: 'learned' | 'note';
    ts: number;
}
export interface PersonaTask {
    id: string;
    title: string;
    status: 'todo' | 'running' | 'done' | 'failed';
    assignedBy: 'user' | 'orchestrator';
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
    result?: string;
    attempts?: number;
    lastError?: string;
}
export interface PersonaAuditEntry {
    id: string;
    ts: number;
    action: string;
    detail?: string;
}
export interface PersonaWork {
    memory: PersonaMemoryEntry[];
    tasks: PersonaTask[];
    audit: PersonaAuditEntry[];
    usageCount: number;
}
/** Keyed by persona id. */
export type PersonaWorkState = Record<string, PersonaWork>;

export const personaWorkUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = personaWorkUserIdHolder.current;
    return uid ? `personawork:${uid}` : 'personawork:_anonymous';
}
function deserialize(raw: string | null): PersonaWorkState {
    if (!raw) return {};
    try { const p = JSON.parse(raw); return p && typeof p === 'object' && !Array.isArray(p) ? (p as PersonaWorkState) : {}; }
    catch { return {}; }
}

export const personaWorkStore = createLocalStorageStore<PersonaWorkState>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: {},
});

function emptyWork(): PersonaWork { return { memory: [], tasks: [], audit: [], usageCount: 0 }; }
function rid(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

function persist(next: PersonaWorkState): void {
    personaWorkStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

function update(personaId: string, fn: (w: PersonaWork) => PersonaWork): void {
    const cur = personaWorkStore.getSnapshot();
    const next = { ...cur, [personaId]: fn(cur[personaId] ?? emptyWork()) };
    persist(next);
}

export function getWork(personaId: string): PersonaWork {
    return personaWorkStore.getSnapshot()[personaId] ?? emptyWork();
}

/* ── memory ── */
export function addMemory(personaId: string, text: string, kind: 'learned' | 'note' = 'note'): void {
    if (!text.trim()) return;
    update(personaId, w => ({ ...w, memory: [{ id: rid('m'), text: text.trim(), kind, ts: Date.now() }, ...w.memory].slice(0, 200) }));
}
export function updateMemory(personaId: string, id: string, text: string): void {
    update(personaId, w => ({ ...w, memory: w.memory.map(m => (m.id === id ? { ...m, text } : m)) }));
}
export function deleteMemory(personaId: string, id: string): void {
    update(personaId, w => ({ ...w, memory: w.memory.filter(m => m.id !== id) }));
}

/* ── tasks ── */
export function addTask(personaId: string, title: string, assignedBy: 'user' | 'orchestrator' = 'user'): string {
    if (!title.trim()) return '';
    const id = rid('t');
    update(personaId, w => ({ ...w, tasks: [...w.tasks, { id, title: title.trim(), status: 'todo', assignedBy, createdAt: Date.now() }] }));
    logAudit(personaId, 'Task added', `${assignedBy}: ${title.trim()}`);
    return id;
}
export function startTask(personaId: string, id: string): void {
    update(personaId, w => ({ ...w, tasks: w.tasks.map(t => (t.id === id ? { ...t, status: 'running', startedAt: Date.now(), attempts: (t.attempts ?? 0) + 1, lastError: undefined } : t)) }));
}
export function completeTask(personaId: string, id: string, result?: string): void {
    update(personaId, w => ({
        ...w,
        tasks: w.tasks.map(t => {
            if (t.id !== id) return t;
            const completedAt = Date.now();
            const durationMs = t.startedAt ? completedAt - t.startedAt : (t.durationMs ?? 0);
            return { ...t, status: 'done', completedAt, durationMs, result };
        }),
    }));
    logAudit(personaId, 'Task completed', id);
}
export function failTask(personaId: string, id: string, error: string): void {
    update(personaId, w => ({
        ...w,
        tasks: w.tasks.map(t => {
            if (t.id !== id) return t;
            const completedAt = Date.now();
            return {
                ...t,
                status: 'failed',
                completedAt,
                durationMs: t.startedAt ? completedAt - t.startedAt : t.durationMs,
                lastError: error.slice(0, 400),
            };
        }),
    }));
    logAudit(personaId, 'Task failed', error.slice(0, 200));
}
export function retryTask(personaId: string, id: string): void {
    update(personaId, w => ({
        ...w,
        tasks: w.tasks.map(t => (t.id === id ? {
            ...t,
            status: 'todo',
            startedAt: undefined,
            completedAt: undefined,
            durationMs: undefined,
            lastError: undefined,
        } : t)),
    }));
    logAudit(personaId, 'Task re-queued', id);
}
export function deleteTask(personaId: string, id: string): void {
    update(personaId, w => ({ ...w, tasks: w.tasks.filter(t => t.id !== id) }));
}

export interface ClaimedPersonaTask {
    personaId: string;
    task: PersonaTask;
}

/**
 * Atomically claim the oldest queued task across a persona roster. This is the
 * durable hand-off used by the shell-level autonomous runner.
 */
export function claimNextTask(personaIds: readonly string[], now: number = Date.now()): ClaimedPersonaTask | null {
    const cur = personaWorkStore.getSnapshot();
    const allowed = new Set(personaIds);
    let claim: ClaimedPersonaTask | null = null;
    for (const [personaId, work] of Object.entries(cur)) {
        if (!allowed.has(personaId)) continue;
        for (const task of work.tasks) {
            if (task.status !== 'todo') continue;
            if (!claim || task.createdAt < claim.task.createdAt) claim = { personaId, task };
        }
    }
    if (!claim) return null;

    const work = cur[claim.personaId] ?? emptyWork();
    const claimedTask: PersonaTask = {
        ...claim.task,
        status: 'running',
        startedAt: now,
        attempts: (claim.task.attempts ?? 0) + 1,
        lastError: undefined,
    };
    persist({
        ...cur,
        [claim.personaId]: {
            ...work,
            tasks: work.tasks.map(t => (t.id === claimedTask.id ? claimedTask : t)),
        },
    });
    logAudit(claim.personaId, 'Autonomous task claimed', claimedTask.title);
    return { personaId: claim.personaId, task: claimedTask };
}

/** Re-queue tasks left running by a closed/reloaded browser session. */
export function recoverStaleTasks(personaIds: readonly string[], staleBefore: number): number {
    const cur = personaWorkStore.getSnapshot();
    const allowed = new Set(personaIds);
    let recovered = 0;
    const next: PersonaWorkState = {};
    for (const [personaId, work] of Object.entries(cur)) {
        if (!allowed.has(personaId)) {
            next[personaId] = work;
            continue;
        }
        next[personaId] = {
            ...work,
            tasks: work.tasks.map(task => {
                if (task.status !== 'running' || (task.startedAt ?? 0) >= staleBefore) return task;
                recovered += 1;
                return { ...task, status: 'todo', startedAt: undefined, lastError: 'Recovered after Dwellium restarted before the run completed.' };
            }),
        };
    }
    if (recovered > 0) persist(next);
    return recovered;
}

/* ── audit ── */
export function logAudit(personaId: string, action: string, detail?: string): void {
    update(personaId, w => ({ ...w, audit: [{ id: rid('a'), ts: Date.now(), action, detail }, ...w.audit].slice(0, 300) }));
}

/* ── run recording (the "gets better with use" loop) ── */
export function recordRun(personaId: string, summary: string, durationMs: number, outcome: 'success' | 'fail'): void {
    update(personaId, w => ({
        ...w,
        usageCount: w.usageCount + 1,
        memory: [{ id: rid('m'), text: `[${outcome}] ${summary}`.replace(/\s+/g, ' ').trim().slice(0, 280), kind: 'learned' as const, ts: Date.now() }, ...w.memory].slice(0, 200),
        audit: [{ id: rid('a'), ts: Date.now(), action: 'Run', detail: `${outcome} · ${formatDuration(durationMs)}` }, ...w.audit].slice(0, 300),
    }));
}

/** Inject a persona's recent memory into its prompt (self-improvement). */
export function formatMemory(personaId: string, limit = 6): string {
    const mem = getWork(personaId).memory.slice(0, limit);
    if (mem.length === 0) return '';
    return `\n\n## Working memory (learned from past runs — apply what is relevant)\n${mem.map(m => `- ${m.text}`).join('\n')}`;
}

export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)} s`;
    const m = Math.floor(s / 60);
    return `${m}m ${Math.round(s % 60)}s`;
}

/* ── hook ── */
export function usePersonaWork(personaId: string): PersonaWork {
    const userCtx = useContext(UserContext);
    personaWorkUserIdHolder.current = userCtx?.user?.id ?? null;
    const state = useSyncExternalStore(
        personaWorkStore.subscribe,
        personaWorkStore.getSnapshot,
        personaWorkStore.getServerSnapshot,
    );
    return state[personaId] ?? emptyWork();
}
