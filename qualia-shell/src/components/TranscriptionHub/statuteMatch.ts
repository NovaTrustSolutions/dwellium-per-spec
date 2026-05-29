/**
 * statuteMatch — pure helpers for extracting, normalizing, and de-duplicating
 * Georgia-code statute citations out of the Legal Shield LLM result, and for
 * building the `matchedStatutes` list the TranscriptionHub UI renders.
 *
 * Before Cycle 9 the LLM-adapt path produced exactly ONE matched statute per
 * segment (similarity hard-coded to 1, excerpt = summary) — even when the LLM
 * named several O.C.G.A. sections in `code_ref`/`summary`. These helpers extract
 * ALL cited sections, normalize their format, de-dupe them, and weight a primary
 * (cited in `code_ref`) above secondary (only mentioned in the summary) match.
 *
 * Pure + SSR-safe by construction: no window / localStorage / module-eval
 * browser globals and no Date.now() — unit-testable without rendering the Hub
 * (which requires UserProvider). Mirrors the Cycle-7 markdownArrange.ts pattern.
 */

export interface MatchedStatute {
    volumeId: string;
    similarity: number;
    excerpt: string;
}

/** The fields of an LLM legal-scan result we mine for statute citations. */
export interface StatuteSource {
    code_ref?: string | null;
    summary?: string | null;
    suggested_action?: string | null;
}

// A Georgia code section number: 44-7-7, 44-7-30, 16-5-1, 44-7-30(a), 9-11-4.1
// (No trailing \b — a ")" terminator has no word boundary after it, which would
//  otherwise force the optional sub-section paren group to be dropped.)
const SECTION_RE = /\b\d{1,2}-\d{1,2}-\d{1,3}(?:\.\d+)?(?:\([a-zA-Z0-9]+\))?/g;

const CANONICAL_PREFIX = 'O.C.G.A. § ';

/**
 * Normalize a citation string to canonical `O.C.G.A. § <section>` form.
 * If no coded section number is present (e.g. "Fair Housing Act"), the
 * whitespace-collapsed original is returned verbatim.
 */
export function normalizeStatute(raw: string | null | undefined): string {
    const text = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    // Reset lastIndex — SECTION_RE is global, shared across calls.
    SECTION_RE.lastIndex = 0;
    const m = SECTION_RE.exec(text);
    return m ? `${CANONICAL_PREFIX}${m[0]}` : text;
}

/**
 * Extract every distinct coded statute citation from a free-text string,
 * normalized to canonical form, order preserved, de-duplicated.
 */
export function extractStatuteRefs(text: string | null | undefined): string[] {
    if (!text) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    SECTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SECTION_RE.exec(text)) !== null) {
        const norm = `${CANONICAL_PREFIX}${m[0]}`;
        if (!seen.has(norm)) {
            seen.add(norm);
            out.push(norm);
        }
    }
    return out;
}

/**
 * Build the de-duplicated matched-statute list for one LLM scan result.
 * Sections cited in `code_ref` are PRIMARY (similarity 1); sections that appear
 * only in the `summary` are SECONDARY (similarity 0.6). If `code_ref` names a
 * non-coded authority (e.g. "Fair Housing Act") with no section number, it is
 * kept verbatim as a primary match so the citation is never silently dropped.
 */
export function buildMatchedStatutes(src: StatuteSource): MatchedStatute[] {
    const excerpt = (src.summary ?? src.suggested_action ?? '').trim();
    const map = new Map<string, MatchedStatute>();

    for (const v of extractStatuteRefs(src.code_ref)) {
        map.set(v, { volumeId: v, similarity: 1, excerpt });
    }
    for (const v of extractStatuteRefs(src.summary)) {
        if (!map.has(v)) map.set(v, { volumeId: v, similarity: 0.6, excerpt });
    }
    // code_ref is a non-coded authority (no section number matched) — keep it.
    if (map.size === 0 && src.code_ref && src.code_ref.trim()) {
        const v = normalizeStatute(src.code_ref);
        if (v) map.set(v, { volumeId: v, similarity: 1, excerpt });
    }
    return dedupMatchedStatutes([...map.values()]);
}

/**
 * De-duplicate a matched-statute list by normalized volumeId, keeping the
 * highest similarity (and backfilling an excerpt from a duplicate when the
 * winner has none). Sorted by similarity descending. Robust against
 * backend-supplied arrays that may carry the same section twice.
 */
export function dedupMatchedStatutes(list: MatchedStatute[] | null | undefined): MatchedStatute[] {
    const map = new Map<string, MatchedStatute>();
    for (const s of list ?? []) {
        const volumeId = normalizeStatute(s.volumeId) || (s.volumeId ?? '').trim();
        if (!volumeId) continue;
        const existing = map.get(volumeId);
        if (!existing) {
            map.set(volumeId, { volumeId, similarity: s.similarity ?? 0, excerpt: s.excerpt ?? '' });
        } else {
            if ((s.similarity ?? 0) > existing.similarity) existing.similarity = s.similarity ?? 0;
            if (!existing.excerpt && s.excerpt) existing.excerpt = s.excerpt;
        }
    }
    return [...map.values()].sort((a, b) => b.similarity - a.similarity);
}

/** Render a similarity (0..1, clamped) as a whole-percentage string. */
export function formatSimilarity(n: number): string {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
    return `${Math.round(clamped * 100)}%`;
}

/**
 * Short label for the inline legal badge: the top match's volumeId, with a
 * "+N" suffix when more statutes matched. Falls back to the raw statute string
 * when nothing was extracted.
 */
export function primaryStatuteLabel(matched: MatchedStatute[], fallback: string): string {
    if (!matched || matched.length === 0) return fallback;
    const top = matched[0].volumeId;
    return matched.length > 1 ? `${top} +${matched.length - 1}` : top;
}
