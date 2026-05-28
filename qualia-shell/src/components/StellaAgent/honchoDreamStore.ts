/**
 * honchoDreamStore — Honcho "dream" mode persistence.
 *
 * Dreams are LLM-synthesized reflections over the user's accumulated memories
 * + recent interaction snapshots. Each dream is a short narrative the LLM
 * generates when asked to look for patterns, connections, and unsurfaced
 * to-dos across recent inputs. Stored per-user via the
 * createLocalStorageStore dynamic-key factory (Phase-8+ Task 8.10 Option β;
 * sister-shape to thoughtWeaverStore).
 *
 * Storage key:  honcho:dreams:<userId>
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

export interface DreamEntry {
    id: string;
    title: string;       // 3-6 word LLM headline ("Pattern: meetings cluster Wednesdays")
    text: string;        // 1-3 paragraph synthesis
    sources: string[];   // memory ids / capture ids referenced
    createdAt: string;
}

export const dreamUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = dreamUserIdHolder.current;
    return uid ? `honcho:dreams:${uid}` : 'honcho:dreams:_anonymous';
}

function deserialize(raw: string | null): DreamEntry[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((d: any): d is DreamEntry =>
            d && typeof d.id === 'string' && typeof d.text === 'string'
        );
    } catch {
        return [];
    }
}

export const dreamStore = createLocalStorageStore<DreamEntry[]>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: [],
});

function persist(next: DreamEntry[]) {
    dreamStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function appendDream(entry: Omit<DreamEntry, 'id' | 'createdAt'>): DreamEntry {
    const dream: DreamEntry = {
        id: `dream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        ...entry,
        createdAt: new Date().toISOString(),
    };
    const current = dreamStore.getSnapshot();
    persist([dream, ...current]);
    return dream;
}

export function deleteDream(id: string): void {
    const current = dreamStore.getSnapshot();
    persist(current.filter(d => d.id !== id));
}

export function clearDreams(): void {
    dreamStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}
