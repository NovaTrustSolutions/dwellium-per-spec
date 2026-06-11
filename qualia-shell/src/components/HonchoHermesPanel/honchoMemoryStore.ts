/**
 * honchoMemoryStore — local-first persistence for Honcho memories.
 *
 * The Honcho backend memory routes (`/api/honcho/memories`) are not always
 * available (Python/Honcho service offline, or the Express backend lacks the
 * route — it 404s). Without a local layer, "+ Add Memory" POSTs into the void
 * and the list stays empty: the feature renders but does nothing.
 *
 * This store gives Add Memory + Delete a real, persistent home in the browser,
 * per-user, so the feature FUNCTIONS offline. When the backend IS present, the
 * component still fetches + merges backend memories on top; locals are additive
 * and user-owned (deleted-by-user), mirroring honchoDreamStore / todoStore.
 *
 * Storage key:  honcho:memories:<userId>
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export interface LocalMemory {
    id: string;
    userId: string;
    content: string;
    memoryType: string;
    source: string;
    importance: number;
    metadata: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}

export const memoryUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = memoryUserIdHolder.current;
    return uid ? `honcho:memories:${uid}` : 'honcho:memories:_anonymous';
}

function deserialize(raw: string | null): LocalMemory[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((m: any): m is LocalMemory =>
            m && typeof m.id === 'string' && typeof m.content === 'string'
        );
    } catch {
        return [];
    }
}

export const memoryStore = withSync(
    createLocalStorageStore<LocalMemory[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'honcho-memory', holder: memoryUserIdHolder, resolveKey },
);

function persist(next: LocalMemory[]) {
    memoryStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function addLocalMemory(
    input: { userId: string; content: string; memoryType: string; importance: number; source?: string; metadata?: Record<string, any> },
): LocalMemory {
    const now = new Date().toISOString();
    const mem: LocalMemory = {
        id: `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        userId: input.userId,
        content: input.content,
        memoryType: input.memoryType,
        source: input.source ?? 'manual',
        importance: input.importance,
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now,
    };
    const current = memoryStore.getSnapshot();
    persist([mem, ...current]);
    return mem;
}

export function deleteLocalMemory(id: string): boolean {
    const current = memoryStore.getSnapshot();
    if (!current.some(m => m.id === id)) return false;
    persist(current.filter(m => m.id !== id));
    return true;
}

export function clearLocalMemories(): void {
    memoryStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}
