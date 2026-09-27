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

export interface Synthesis {
    id: string;
    query: string;
    result: string;
    /** 1 = first-layer; 2+ = second-layer (re-query over a prior synthesis). */
    layer: number;
    /** id of the synthesis this one built on, if any. */
    parentId: string | null;
    capturedAt: string;
}

export { synthesisUserIdHolder };

/** Oldest captures are dropped past this (copaw caps at 500 facts; a synthesis is a full answer). */
export const MAX_SYNTHESES = 300;

export type CaptureResult =
    | { ok: true; synthesis: Synthesis }
    | { ok: false; reason: 'empty' | 'quota' };

export function resolveSynthesisKey(): string {
    const uid = synthesisUserIdHolder.current;
    return uid ? `dwellium:synthesis:${uid}` : 'dwellium:synthesis:_anonymous';
}

function deserialize(raw: string | null): Synthesis[] {
    if (!raw) return [];
    try {
        const o = JSON.parse(raw);
        return Array.isArray(o) ? o.filter((x) => x && typeof x.result === 'string') : [];
    } catch {
        return [];
    }
}

export const synthesisStore = withSync(
    createLocalStorageStore<Synthesis[]>({
        key: resolveSynthesisKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'synthesis', holder: synthesisUserIdHolder, resolveKey: resolveSynthesisKey },
);

/** Id for a synthesis — generated when a run STARTS so tags added before Capture keep their key. */
export function newSynthesisId(): string {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* */ }
    return `syn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Capture a synthesis (feed it back into the corpus). Most-recent-first, capped
 * at MAX_SYNTHESES. The caller supplies `id` (its draft id). Returns
 * `{ok:false, reason:'quota'}` WITHOUT changing the store when localStorage is full.
 * CONTRACT (plan 070 P0) — implemented by the W1 store agent.
 */
export function captureSynthesis(
    entry: { id: string; query: string; result: string; layer: number; parentId: string | null },
    now: Date = new Date(),
): CaptureResult {
    void entry; void now;
    throw new Error('plan 070 W1: not implemented');
}

/** Remove one captured synthesis by id (user-initiated, from the UI). CONTRACT (plan 070 P0). */
export function removeSynthesis(id: string): void {
    void id;
    throw new Error('plan 070 W1: not implemented');
}

export function clearSyntheses(): void {
    if (typeof window === 'undefined') return;
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
