/**
 * copawStore — CoPaw continuous auto-capture (spec §8.5). Silently extracts key
 * facts from agent responses and writes them to a per-user "memory" that
 * compounds over time. Local-first via createLocalStorageStore.
 *
 * Storage key:  dwellium:copaw-memory:<userId>   (fallback :_anonymous)
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export interface MemoryFact {
    id: string;
    text: string;
    source: string;      // agent name
    createdAt: string;   // ISO
}

export const copawUserIdHolder: { current: string | null } = { current: null };

export function resolveCopawKey(): string {
    const uid = copawUserIdHolder.current;
    return uid ? `dwellium:copaw-memory:${uid}` : 'dwellium:copaw-memory:_anonymous';
}

function deserialize(raw: string | null): MemoryFact[] {
    if (!raw) return [];
    try {
        const o = JSON.parse(raw);
        return Array.isArray(o) ? o.filter((x) => x && typeof x.text === 'string') : [];
    } catch {
        return [];
    }
}

export const copawStore = withSync(
    createLocalStorageStore<MemoryFact[]>({
        key: resolveCopawKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'copaw', holder: copawUserIdHolder, resolveKey: resolveCopawKey },
);

/**
 * Heuristic fact extractor — pure + testable. Pulls declarative, self-contained
 * sentences (not questions/fragments) from a response, deduped, capped. This is
 * the "~50 lines" CoPaw the spec describes; an LLM extractor can replace it
 * later without changing the store contract.
 */
export function extractFacts(text: string, max = 5): string[] {
    if (!text) return [];
    const sentences = text
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        // strip leading markdown bullets / numbering
        .map((s) => s.replace(/^[-*\d.)\s]+/, '').trim());
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of sentences) {
        if (s.length < 25 || s.length > 240) continue;   // not a fragment, not a wall
        if (s.endsWith('?')) continue;                    // skip questions
        if (/^(here|okay|ok|sure|let me|i'?ll|i will)\b/i.test(s)) continue; // skip filler openers
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
        if (out.length >= max) break;
    }
    return out;
}

function newId(): string {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* */ }
    return `fact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Extract + persist facts from one agent response. Returns the new facts. */
export function captureFacts(source: string, response: string, now: Date = new Date()): MemoryFact[] {
    if (typeof window === 'undefined') return [];
    const facts = extractFacts(response).map((text) => ({ id: newId(), text, source, createdAt: now.toISOString() }));
    if (facts.length === 0) return [];
    const current = copawStore.getSnapshot();
    // De-dupe against existing memory by text.
    const existing = new Set(current.map((f) => f.text.toLowerCase()));
    const fresh = facts.filter((f) => !existing.has(f.text.toLowerCase()));
    if (fresh.length === 0) return [];
    const next = [...fresh, ...current].slice(0, 500);
    copawStore.set(next, () => {
        try { localStorage.setItem(resolveCopawKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
    return fresh;
}

export function clearMemory(): void {
    if (typeof window === 'undefined') return;
    copawStore.set([], () => {
        try { localStorage.removeItem(resolveCopawKey()); } catch { /* sandboxed */ }
    });
}
