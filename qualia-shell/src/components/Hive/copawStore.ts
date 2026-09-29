/**
 * copawStore — CoPaw continuous auto-capture (spec §8.5). Silently extracts key
 * facts from agent responses and writes them to a per-user "memory" that
 * compounds over time. Local-first via createLocalStorageStore.
 *
 * Storage key:  dwellium:copaw-memory:<userId>   (fallback :_anonymous)
 *
 * Sync (plan 071 Phase 4): the store was `withSync` with no `merge`, so a
 * device hydrating a stale local snapshot would blow away another device's
 * newer facts (last-write-wins), and a per-fact delete / clear on one device
 * could be silently resurrected by another device's union on the next sync.
 * Fixed by persisting a v2 shape with tombstones — `{v:2, facts, deleted,
 * clearedAt}` — and a `merge()` that lets deletes/clears win over the union
 * (precedent: llmUsageStore's StoredLedgerV2 + clearedAt tombstone).
 *
 * PUBLIC API for readers is UNCHANGED: `copawStore.getSnapshot()` still
 * returns `MemoryFact[]` (Hive.tsx / ContentSearch.tsx / unifiedMemory.ts /
 * existing tests all read an array). The v2 value lives in an inner
 * `withSync` store; `copawStore` is a thin facade over it whose
 * `getSnapshot()`/`getServerSnapshot()` memoize the returned array (same
 * reference while the inner snapshot is unchanged) so `useSyncExternalStore`
 * doesn't spin (React #185).
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

/** What's actually persisted (localStorage + One Save `copaw`). */
export interface StoredCopaw {
    v: 2;
    facts: MemoryFact[];
    /** Tombstones: id -> deletedAt ms. A per-fact delete on one device must
     *  survive a merge with another device's union of facts. */
    deleted: Record<string, number>;
    /** Tombstone timestamp: a "Clear memory" on one device must drop every
     *  fact older than this even after merging with a device that hasn't
     *  synced the clear yet — NOT an empty-array overwrite (that would lose
     *  the race against a device writing at the same moment). */
    clearedAt: number;
}

const MAX_FACTS = 500;
/** ponytail: tombstones older than this AND unreferenced by any known fact
 * are pruned so `deleted` doesn't grow forever. Bump this (or add per-device
 * pruning) if a device can plausibly stay offline longer than 90 days. */
const TOMBSTONE_MAX_AGE_MS = 90 * 86_400_000;

const EMPTY_STORED: StoredCopaw = { v: 2, facts: [], deleted: {}, clearedAt: 0 };

export function resolveCopawKey(): string {
    const uid = copawUserIdHolder.current;
    return uid ? `dwellium:copaw-memory:${uid}` : 'dwellium:copaw-memory:_anonymous';
}

function newId(): string {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* */ }
    return `fact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Deterministic id for an id-less stored fact, so re-reading the same data never mints new ids. */
function legacyId(text: string): string {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return `legacy-${h.toString(36)}`;
}

function sanitizeFact(x: unknown): MemoryFact | null {
    if (!x || typeof x !== 'object') return null;
    const o = x as Partial<MemoryFact>;
    if (typeof o.text !== 'string') return null;
    return {
        id: typeof o.id === 'string' && o.id ? o.id : legacyId(o.text), // stable across normalizations
        text: o.text,
        source: typeof o.source === 'string' ? o.source : 'unknown',
        createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date(0).toISOString(),
    };
}

function sanitizeDeleted(x: unknown): Record<string, number> {
    if (!x || typeof x !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(x as Record<string, unknown>)) {
        if (typeof v === 'number') out[id] = v;
    }
    return out;
}

/** Normalizes ANY persisted or remote shape (v1 array, v2, or garbage) into v2. */
export function normalize(raw: unknown): StoredCopaw {
    if (Array.isArray(raw)) {
        const facts = raw.map(sanitizeFact).filter((f): f is MemoryFact => f != null);
        return { v: 2, facts, deleted: {}, clearedAt: 0 };
    }
    if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).v === 2) {
        const o = raw as Record<string, unknown>;
        const facts = Array.isArray(o.facts) ? o.facts.map(sanitizeFact).filter((f): f is MemoryFact => f != null) : [];
        return { v: 2, facts, deleted: sanitizeDeleted(o.deleted), clearedAt: typeof o.clearedAt === 'number' ? o.clearedAt : 0 };
    }
    return EMPTY_STORED;
}

function deserialize(raw: string | null): StoredCopaw {
    if (!raw) return EMPTY_STORED;
    try {
        return normalize(JSON.parse(raw));
    } catch {
        return EMPTY_STORED;
    }
}

/**
 * Merge two devices' copaw memory. Deletes and clears win over the union:
 * a fact tombstoned by `deleted` or older than `clearedAt` never resurrects,
 * even though the union step below would otherwise bring it back.
 */
export function merge(local: StoredCopaw, remoteRaw: StoredCopaw): StoredCopaw {
    const remote = normalize(remoteRaw); // defensive: a stale/legacy remote payload
    const clearedAt = Math.max(local.clearedAt ?? 0, remote.clearedAt ?? 0);

    const deleted: Record<string, number> = { ...local.deleted };
    for (const [id, ts] of Object.entries(remote.deleted ?? {})) {
        if (deleted[id] == null || ts > deleted[id]) deleted[id] = ts;
    }

    const byId = new Map<string, MemoryFact>();
    for (const f of [...local.facts, ...remote.facts]) if (!byId.has(f.id)) byId.set(f.id, f);

    const byText = new Map<string, MemoryFact>();
    for (const f of byId.values()) {
        if (deleted[f.id] != null) continue;               // per-fact delete wins
        if (Date.parse(f.createdAt) < clearedAt) continue;  // clear wins
        const key = f.text.toLowerCase();
        const existing = byText.get(key);
        if (!existing || Date.parse(f.createdAt) > Date.parse(existing.createdAt)) byText.set(key, f);
    }

    const facts = [...byText.values()]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, MAX_FACTS);

    const now = Date.now();
    const referenced = new Set([...local.facts, ...remote.facts].map((f) => f.id));
    const prunedDeleted: Record<string, number> = {};
    for (const [id, ts] of Object.entries(deleted)) {
        if (referenced.has(id) || now - ts < TOMBSTONE_MAX_AGE_MS) prunedDeleted[id] = ts;
    }

    return { v: 2, facts, deleted: prunedDeleted, clearedAt };
}

const baseStore = createLocalStorageStore<StoredCopaw>({
    key: resolveCopawKey,
    deserializer: deserialize,
    defaultValue: EMPTY_STORED,
});

const innerStore = withSync(baseStore, { objectType: 'copaw', holder: copawUserIdHolder, resolveKey: resolveCopawKey, merge });

function persistStored(stored: StoredCopaw): void {
    try { localStorage.setItem(resolveCopawKey(), JSON.stringify(stored)); } catch { /* sandboxed */ }
}

// Memoizes the facts array so useSyncExternalStore sees the SAME reference
// across renders while the inner v2 snapshot is unchanged (avoids React #185).
let lastStored: StoredCopaw | null = null;
let lastFacts: MemoryFact[] = [];
function factsOf(stored: StoredCopaw): MemoryFact[] {
    if (stored !== lastStored) {
        lastStored = stored;
        lastFacts = stored.facts;
    }
    return lastFacts;
}

/** Facade: readers keep seeing `MemoryFact[]`; the v2 shape lives in innerStore. */
export const copawStore = {
    subscribe: innerStore.subscribe,
    getSnapshot(): MemoryFact[] { return factsOf(innerStore.getSnapshot()); },
    getServerSnapshot(): MemoryFact[] { return factsOf(innerStore.getServerSnapshot()); },
    /** Replaces the fact list, preserving the current deleted/clearedAt tombstones. */
    set(facts: MemoryFact[], persistToStorage: () => void): void {
        const cur = innerStore.getSnapshot();
        innerStore.set({ v: 2, facts: facts.slice(0, MAX_FACTS), deleted: cur.deleted, clearedAt: cur.clearedAt }, persistToStorage);
    },
    reset(): void { innerStore.reset(); },
};


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
    const next = [...fresh, ...current].slice(0, MAX_FACTS);
    const cur = innerStore.getSnapshot();
    const stored: StoredCopaw = { v: 2, facts: next, deleted: cur.deleted, clearedAt: cur.clearedAt };
    innerStore.set(stored, () => persistStored(stored));
    return fresh;
}

/** Remove one fact (user-initiated, from the Hive memory rail). Tombstoned so
 * a merge with another device's stale union can't resurrect it. */
export function deleteFact(id: string): void {
    if (typeof window === 'undefined') return;
    const cur = innerStore.getSnapshot();
    const stored: StoredCopaw = {
        v: 2,
        facts: cur.facts.filter((f) => f.id !== id),
        deleted: { ...cur.deleted, [id]: Date.now() },
        clearedAt: cur.clearedAt,
    };
    innerStore.set(stored, () => persistStored(stored));
}

/** Clears local memory via a `clearedAt` tombstone (not an empty overwrite) so
 * a device that hasn't synced the clear yet can't resurrect old facts. */
export function clearMemory(): void {
    if (typeof window === 'undefined') return;
    const cur = innerStore.getSnapshot();
    const stored: StoredCopaw = { v: 2, facts: [], deleted: cur.deleted, clearedAt: Date.now() };
    innerStore.set(stored, () => persistStored(stored));
}
