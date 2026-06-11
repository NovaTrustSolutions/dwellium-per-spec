/**
 * unifiedMemory — One Memory (proposal §2). One place to search + write memory,
 * spanning the three per-user memory stores that exist today:
 *   - honcho-memory  (memoryStore)        — canonical, the write target
 *   - copaw          (copawStore)         — auto-captured facts
 *   - thought-weaver (thoughtWeaverStore) — user captures
 *
 * All three are One-Save-synced, so this spine is durable + per-user by
 * construction. `recall` is the single search; `remember` writes to Honcho (the
 * canonical store). This is the seam the Conductor (ARA) reads/writes through.
 */
import { memoryStore, addLocalMemory, memoryUserIdHolder, type LocalMemory } from '../components/HonchoHermesPanel/honchoMemoryStore';
import { copawStore } from '../components/Hive/copawStore';
import { thoughtWeaverStore } from '../components/ThoughtWeaver/thoughtWeaverStore';

export type MemorySource = 'honcho' | 'copaw' | 'thought-weaver';

export interface MemoryHit {
    id: string;
    text: string;
    source: MemorySource | string;
    createdAt: string;
    score: number;
}

function scoreText(text: string, q: string): number {
    if (!q) return 1;
    const t = text.toLowerCase();
    if (t.includes(q)) return 10 + Math.max(0, 20 - Math.floor(text.length / 25)); // prefer concise exact hits
    const toks = q.split(/\s+/).filter(tok => tok.length > 2);
    const overlap = toks.filter(tok => t.includes(tok)).length;
    return overlap > 0 ? overlap * 3 : 0;
}

/** Search every memory store at once, ranked. Empty query → most-recent-first. */
export function recall(query: string, limit = 12): MemoryHit[] {
    const q = query.trim().toLowerCase();
    const hits: MemoryHit[] = [];
    const add = (id: string, text: string, source: string, createdAt?: string): void => {
        if (!text) return;
        const score = scoreText(text, q);
        if (q && score <= 0) return;
        hits.push({ id, text, source, createdAt: createdAt ?? '', score });
    };
    try { for (const m of memoryStore.getSnapshot()) add(m.id, m.content, 'honcho', m.createdAt); } catch { /* ignore */ }
    try { for (const f of copawStore.getSnapshot()) add(f.id, f.text, f.source || 'copaw', f.createdAt); } catch { /* ignore */ }
    try { for (const c of thoughtWeaverStore.getSnapshot()) add(c.id, c.text, 'thought-weaver', c.createdAt); } catch { /* ignore */ }
    return hits.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Write a memory to the canonical Honcho store (per-user). */
export function remember(text: string, opts?: { importance?: number; source?: string }): LocalMemory {
    return addLocalMemory({
        userId: memoryUserIdHolder.current ?? '_anonymous',
        content: text,
        memoryType: 'note',
        importance: opts?.importance ?? 3,
        source: opts?.source ?? 'ara',
    });
}

/** Quick counts across the spine (for diagnostics / the Conductor's status). */
export function memoryCounts(): { honcho: number; copaw: number; captures: number; total: number } {
    const honcho = safeLen(() => memoryStore.getSnapshot().length);
    const copaw = safeLen(() => copawStore.getSnapshot().length);
    const captures = safeLen(() => thoughtWeaverStore.getSnapshot().length);
    return { honcho, copaw, captures, total: honcho + copaw + captures };
}

function safeLen(fn: () => number): number {
    try { return fn(); } catch { return 0; }
}
