/**
 * copawStore — CoPaw continuous auto-capture (spec §8.5). Silently extracts key
 * facts from agent responses and writes them to a per-user "memory" that
 * compounds over time. Local-first via createLocalStorageStore.
 *
 * Storage key:  dwellium:copaw-memory:<userId>   (fallback :_anonymous)
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';
import { copawUserIdHolder } from '../../lib/perUserIdentity';
import { isSensitiveFact, ZERO_WIDTH } from '../../lib/sensitiveText';

export { copawUserIdHolder, isSensitiveFact };

export interface MemoryFact {
    id: string;
    text: string;
    source: string;      // agent name
    createdAt: string;   // ISO
}


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
    // Strip fenced code blocks first (an unterminated fence drops the rest: it is code).
    const withoutCodeBlocks = text.replace(ZERO_WIDTH, '').replace(/```[\s\S]*?(```|$)/g, '\n');
    // Re-join soft-wrapped prose into paragraphs; list items, blank lines and
    // skipped blocks (tables, headings, rules) end a paragraph. Splitting per
    // raw line let "The password\nis X" slip past the secret filter.
    const paragraphs: string[] = [];
    let cur = '';
    const flush = () => { if (cur.trim()) paragraphs.push(cur); cur = ''; };
    for (const rawLine of withoutCodeBlocks.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('|') || /^#{1,6}\s/.test(line) || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flush(); continue; }
        const item = line.replace(/^(?:[-*+>]\s*|\d+[.)]\s+)+/, ''); // bullet / "1." numbering / blockquote — not "30 days"
        if (item !== line) flush();
        cur = cur ? `${cur} ${item}` : item;
    }
    flush();
    const sentences: string[] = [];
    for (const p of paragraphs) {
        const cleaned = p
            .replace(/`([^`]*)`/g, '$1')                     // inline code → its text (secret filter still applies)
            .replace(/\s+/g, ' ')
            .trim();
        for (const s of cleaned.split(/(?<=[.!?])\s+/)) {
            const t = s.trim();
            if (t) sentences.push(t);
        }
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of sentences) {
        if (s.length < 25 || s.length > 240) continue;   // not a fragment, not a wall
        if (s.endsWith('?')) continue;                    // skip questions
        if (/^(here|okay|ok|sure|let me|i'?ll|i will)\b/i.test(s)) continue; // skip filler openers
        if (isSensitiveFact(s)) continue;                  // skip secrets/PII
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

/**
 * Extract + persist facts from one agent response. Returns the new facts.
 * `userId` is REQUIRED and must be captured BEFORE the caller's LLM `await`
 * (same contract as recordLlmUsage): if the account switched while the call
 * was in flight, the capture is dropped rather than written under the new
 * account's key.
 */
export function captureFacts(source: string, response: string, userId: string | null, now: Date = new Date()): MemoryFact[] {
    if (typeof window === 'undefined') return [];
    if (userId !== copawUserIdHolder.current) return [];
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

/** Remove one fact (user-initiated, from the Hive memory rail). */
export function deleteFact(id: string): void {
    if (typeof window === 'undefined') return;
    const next = copawStore.getSnapshot().filter((f) => f.id !== id);
    copawStore.set(next, () => {
        try { localStorage.setItem(resolveCopawKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function clearMemory(): void {
    if (typeof window === 'undefined') return;
    copawStore.set([], () => {
        try { localStorage.removeItem(resolveCopawKey()); } catch { /* sandboxed */ }
    });
}
