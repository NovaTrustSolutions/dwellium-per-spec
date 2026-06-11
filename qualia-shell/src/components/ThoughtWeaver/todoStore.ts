/**
 * todoStore — per-user persistent to-do list for ThoughtWeaver's Today tab.
 *
 * Each to-do is generated from captures (admin bucket items, action-verb
 * detection in any capture, or LLM synthesis) and gets a stable id so check
 * state survives across renders + sessions. User-owned (deleted-by-user).
 *
 * Storage key:  thought-weaver:todo:<userId>
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export interface TodoItem {
    id: string;
    text: string;
    sourceCaptureId: string | null; // null if user-added
    priority: 'high' | 'medium' | 'low';
    done: boolean;
    createdAt: string;
    completedAt: string | null;
}

export const todoUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = todoUserIdHolder.current;
    return uid ? `thought-weaver:todo:${uid}` : 'thought-weaver:todo:_anonymous';
}

function deserialize(raw: string | null): TodoItem[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((t: any): t is TodoItem =>
            t && typeof t.id === 'string' && typeof t.text === 'string'
        );
    } catch {
        return [];
    }
}

export const todoStore = withSync(
    createLocalStorageStore<TodoItem[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'tw-todo', holder: todoUserIdHolder, resolveKey },
);

function persist(next: TodoItem[]) {
    todoStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function addTodo(item: Omit<TodoItem, 'id' | 'done' | 'createdAt' | 'completedAt'>): void {
    if (typeof window === 'undefined') return;
    const todo: TodoItem = {
        id: `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        ...item,
        done: false,
        createdAt: new Date().toISOString(),
        completedAt: null,
    };
    const current = todoStore.getSnapshot();
    persist([todo, ...current]);
}

/** De-duplicating bulk-add: skip todos whose text already exists (case-insensitive). */
export function syncTodosFromCaptures(generated: Array<Omit<TodoItem, 'id' | 'done' | 'createdAt' | 'completedAt'>>): number {
    if (typeof window === 'undefined') return 0;
    const current = todoStore.getSnapshot();
    const existingTexts = new Set(current.map(t => t.text.trim().toLowerCase()));
    const existingSourceIds = new Set(current.map(t => t.sourceCaptureId).filter(Boolean));
    const fresh: TodoItem[] = [];
    for (const g of generated) {
        const key = g.text.trim().toLowerCase();
        if (existingTexts.has(key)) continue;
        if (g.sourceCaptureId && existingSourceIds.has(g.sourceCaptureId)) continue;
        fresh.push({
            id: `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${fresh.length}`,
            ...g,
            done: false,
            createdAt: new Date().toISOString(),
            completedAt: null,
        });
    }
    if (fresh.length === 0) return 0;
    persist([...fresh, ...current]);
    return fresh.length;
}

export function toggleTodo(id: string): void {
    if (typeof window === 'undefined') return;
    const current = todoStore.getSnapshot();
    const next = current.map(t => t.id === id
        ? { ...t, done: !t.done, completedAt: !t.done ? new Date().toISOString() : null }
        : t);
    persist(next);
}

export function deleteTodo(id: string): void {
    if (typeof window === 'undefined') return;
    const current = todoStore.getSnapshot();
    persist(current.filter(t => t.id !== id));
}

export function clearDoneTodos(): void {
    if (typeof window === 'undefined') return;
    const current = todoStore.getSnapshot();
    persist(current.filter(t => !t.done));
}
