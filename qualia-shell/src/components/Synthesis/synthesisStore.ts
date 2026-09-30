/**
 * synthesisStore — local-first store for the Synthesis / compounding loop
 * (spec §7.3). Captured syntheses are fed back into the corpus: each one is a
 * document the next query can build on. Six-pass loop:
 *   Ingest → Compile → Query & Synthesize → Capture → Return → Recompile.
 * The actionable parts here are Query & Synthesize, Capture, and the one-click
 * "second-layer query" (Return) that re-queries using a prior synthesis as
 * additional context.
 *
 * Storage key:  dwellium:synthesis:<userId>   (fallback :_anonymous)
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';
import { synthesisUserIdHolder } from '../../lib/perUserIdentity';
import { applyTombstones, synthesisTombstoneStore, recordDelete, recordClear, type SynthesisTombstones } from './synthesisTombstones';

export interface Synthesis {
    id: string;
    query: string;
    result: string;
    /** 1 = first-layer; 2+ = second-layer (re-query over a prior synthesis). */
    layer: number;
    /** id of the synthesis this one built on, if any. */
    parentId: string | null;
    capturedAt: string;
    /** Plan 070 P2: what the second-layer pass was asked to focus on. */
    followUp?: string;
    /** Plan 070 P2: the saved sources that were sent with the question. */
    sources?: SynthesisSource[];
}

export interface SynthesisSource { sourceId: string; sourceKind: string; title: string; }

/** Set for every shell render by setPerUserIdentity (plan 067) — tied to the signed-in user. */
export { synthesisUserIdHolder };

/** Oldest captures are dropped past this (copaw caps at 500 facts; a synthesis is a full answer). */
export const MAX_SYNTHESES = 300;

export type CaptureResult =
    | { ok: true; synthesis: Synthesis }
    | { ok: false; reason: 'empty' | 'quota' | 'full' };

export function resolveSynthesisKey(): string {
    const uid = synthesisUserIdHolder.current;
    return uid ? `dwellium:synthesis:${uid}` : 'dwellium:synthesis:_anonymous';
}

/** Drop non-objects / entries missing a string `result` — the shape every
 *  reader (local deserialize AND remote merge) requires. */
function sanitizeSyntheses(raw: unknown): Synthesis[] {
    return Array.isArray(raw) ? (raw as unknown[]).filter((x): x is Synthesis => !!x && typeof x === 'object' && typeof (x as Synthesis).result === 'string') : [];
}

function deserialize(raw: string | null): Synthesis[] {
    if (!raw) return [];
    try {
        return sanitizeSyntheses(JSON.parse(raw));
    } catch {
        return [];
    }
}

function capturedAtMs(s: Synthesis): number {
    const t = Date.parse(s.capturedAt);
    return Number.isNaN(t) ? 0 : t;
}

/**
 * Pure: union local + remote captures by id (same id on both sides → later
 * capturedAt wins; an exact tie favors local, mirroring mergeWikiMaps), apply
 * tombstones, sort newest-first (stable), and cap at MAX_SYNTHESES.
 * CONTRACT (plan 070 P4) — the cross-device merge for `synthesisStore`.
 */
export function mergeSyntheses(local: Synthesis[], remote: Synthesis[], t: SynthesisTombstones): Synthesis[] {
    const byId = new Map<string, Synthesis>();
    for (const s of local) byId.set(s.id, s);
    for (const s of sanitizeSyntheses(remote)) {
        const existing = byId.get(s.id);
        // Tie (or existing newer) keeps the LOCAL entry already in the map.
        if (!existing || capturedAtMs(s) > capturedAtMs(existing)) byId.set(s.id, s);
    }
    const pruned = applyTombstones(Array.from(byId.values()), t);
    // No cap here: a merge must never drop a capture nobody deleted (two devices
    // with MAX_SYNTHESES each would otherwise silently lose half). The cap is
    // enforced only at capture time, as a visible refusal (plan 070 P4 review).
    return pruned
        .slice()
        .sort((a, b) => capturedAtMs(b) - capturedAtMs(a));
}

export const synthesisStore = withSync(
    createLocalStorageStore<Synthesis[]>({
        key: resolveSynthesisKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    {
        objectType: 'synthesis',
        holder: synthesisUserIdHolder,
        resolveKey: resolveSynthesisKey,
        merge: (l, r) => mergeSyntheses(l, r, synthesisTombstoneStore.getSnapshot()),
    },
);

// Prune captures the moment a tombstone arrives from ANOTHER device — One
// Save's bootstrap order between `synthesis` and `synthesis-tombstones` is
// not guaranteed, so a delete/clear that hydrates AFTER the captures already
// landed must still take effect. Both stores resolve their owner from the
// same `synthesisUserIdHolder`-driven holders at the moment this fires, so
// there's no cross-owner leak. `applyTombstones` returns the SAME array
// reference when nothing is removed, so `set()` only fires (and this can
// only loop) when the pruned result actually differs.
if (typeof window !== 'undefined') {
    synthesisTombstoneStore.subscribe(() => {
        const cur = synthesisStore.getSnapshot();
        const next = applyTombstones(cur, synthesisTombstoneStore.getSnapshot());
        if (next !== cur) {
            synthesisStore.set(next, () => {
                try { localStorage.setItem(resolveSynthesisKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
            });
        }
    });
}

/** Id for a synthesis — generated when a run STARTS so tags added before Capture keep their key. */
export function newSynthesisId(): string {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* */ }
    return `syn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Capture a synthesis (feed it back into the corpus). Most-recent-first, capped
 * at MAX_SYNTHESES. The caller supplies `id` (its draft id); re-capturing the
 * same id (e.g. after an edit) replaces the existing entry in place rather
 * than duplicating it. Returns `{ok:false, reason:'quota'}` WITHOUT changing
 * the store when localStorage is full.
 * CONTRACT (plan 070 P0) — implemented by the W1 store agent.
 */
export function captureSynthesis(
    entry: { id: string; query: string; result: string; layer: number; parentId: string | null; followUp?: string; sources?: SynthesisSource[] },
    now: Date = new Date(),
): CaptureResult {
    // SSR: nothing to persist
    if (typeof window === 'undefined') return { ok: false, reason: 'empty' };
    if (!entry.result.trim()) return { ok: false, reason: 'empty' };

    const s: Synthesis = {
        id: entry.id,
        query: entry.query,
        result: entry.result,
        layer: entry.layer,
        parentId: entry.parentId,
        capturedAt: new Date(stampAfterKnownDeletes(entry.id, now.getTime())).toISOString(),
        ...(entry.followUp?.trim() ? { followUp: entry.followUp.trim() } : {}),
        ...(entry.sources?.length ? { sources: entry.sources } : {}),
    };
    const cur = synthesisStore.getSnapshot();
    const rest = cur.filter((x) => x.id !== entry.id);
    // Full: refuse visibly instead of silently dropping the oldest capture.
    if (rest.length >= MAX_SYNTHESES) return { ok: false, reason: 'full' };
    const next = [s, ...rest];

    // Try the write directly first so a quota error can be detected and
    // reported WITHOUT mutating the store — createLocalStorageStore.set()'s
    // persistToStorage callback swallows all errors (by design, for private
    // browsing), so quota can only be surfaced by writing before calling set().
    try {
        localStorage.setItem(resolveSynthesisKey(), JSON.stringify(next));
    } catch (err) {
        if (isQuotaError(err)) return { ok: false, reason: 'quota' };
        // Sandboxed / private-mode throw (not quota) — accept in-memory only,
        // matching createLocalStorageStore's own private-browsing fallback.
    }
    // The localStorage write already happened above (or was skipped for a
    // non-quota sandbox throw) — pass a no-op persist callback so set() does
    // not write a second time.
    synthesisStore.set(next, () => {});
    return { ok: true, synthesis: s };
}

function isQuotaError(err: unknown): boolean {
    if (!(err instanceof DOMException)) return false;
    return err.name === 'QuotaExceededError'
        || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || err.code === 22
        || err.code === 1014;
}

/** Remove one captured synthesis by id (user-initiated, from the UI). CONTRACT (plan 070 P0). */
function timeOf(s: Synthesis): number {
    const t = Date.parse(s.capturedAt);
    return Number.isFinite(t) ? t : 0;
}

/**
 * A capture must postdate every clear/delete this device already knows about,
 * or a device whose clock runs behind would have its brand-new capture removed
 * by an older clear. (A clear this device hasn't synced yet can still win if it
 * happened within the clock gap before the capture — timestamps can't fix that.)
 */
function stampAfterKnownDeletes(id: string, nowMs: number): number {
    const t = synthesisTombstoneStore.getSnapshot();
    return Math.max(nowMs, t.clearedAt + 1, (t.deleted[id] ?? -1) + 1);
}

export function removeSynthesis(id: string): void {
    if (typeof window === 'undefined') return;
    const cur = synthesisStore.getSnapshot();
    const next = cur.filter((x) => x.id !== id);
    // Unknown id — no-op, and no tombstone either: nothing here was deleted,
    // so recording one would just be dead weight in synthesisTombstoneStore.
    if (next.length === cur.length) return;
    // Clock skew: capturedAt may come from another device whose clock runs ahead.
    // Stamp the delete strictly after the capture so the rule (survive iff captured
    // after the delete) removes it on every device.
    const item = cur.find((x) => x.id === id)!;
    recordDelete(id, Math.max(Date.now(), timeOf(item) + 1));
    synthesisStore.set(next, () => {
        try { localStorage.setItem(resolveSynthesisKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function clearSyntheses(): void {
    if (typeof window === 'undefined') return;
    // Same clock-skew rule: the clear must postdate every capture it is clearing.
    const newest = synthesisStore.getSnapshot().reduce((m, x) => Math.max(m, timeOf(x)), 0);
    recordClear(Math.max(Date.now(), newest + 1));
    synthesisStore.set([], () => {
        try { localStorage.removeItem(resolveSynthesisKey()); } catch { /* sandboxed */ }
    });
}

/**
 * Compose a second-layer prompt: re-query using a prior synthesis as additional
 * context (the "Return" pass of the compounding loop). Pure → unit-testable.
 */
export function buildSecondLayerPrompt(originalQuery: string, priorSynthesis: string, followUp?: string): string {
    return [
        `Original question: ${originalQuery}`,
        '',
        'A first-pass synthesis produced the following. Treat it as additional context and go deeper — refine, challenge, and extend it; surface what the first pass missed.',
        '',
        '--- First-pass synthesis ---',
        priorSynthesis.trim(),
        '--- end ---',
        '',
        followUp?.trim() ? `Focus this second pass on: ${followUp.trim()}` : 'Produce a sharper, more complete second-layer synthesis.',
    ].join('\n');
}
