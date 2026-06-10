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

export const synthesisUserIdHolder: { current: string | null } = { current: null };

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

function newId(): string {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* */ }
    return `syn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Capture a synthesis (feed it back into the corpus). Most-recent-first. */
export function captureSynthesis(
    entry: { query: string; result: string; layer?: number; parentId?: string | null },
    now: Date = new Date(),
): Synthesis | null {
    if (typeof window === 'undefined') return null;
    if (!entry.result.trim()) return null;
    const s: Synthesis = {
        id: newId(),
        query: entry.query,
        result: entry.result,
        layer: entry.layer ?? 1,
        parentId: entry.parentId ?? null,
        capturedAt: now.toISOString(),
    };
    const cur = synthesisStore.getSnapshot();
    const next = [s, ...cur];
    synthesisStore.set(next, () => {
        try { localStorage.setItem(resolveSynthesisKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
    return s;
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
