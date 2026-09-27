/**
 * Cognitive Memory Network — recall for agents (plan 058).
 *
 * The one way Stella / ARA / Hermes read from the shared network. Retrieval
 * only (Personalized PageRank over what the user has saved) — never calls an
 * LLM, never spends a key. Returns a bounded markdown block to append to the
 * agent's system prompt, or '' when the network has nothing relevant, so an
 * empty network changes nothing about how an agent behaves.
 */
import { getCmn } from './shared';
import type { RetrievalResult, SourceKind } from './types';

export const RECALL_HEADING = '## Relevant memory (Cognitive M Network)';
const DEFAULT_LIMIT = 5;
const DEFAULT_MAX_CHARS = 2400;
const DEFAULT_PASSAGES_LIMIT = 6;
const MIN_SCORE = 1e-6;

export interface RecallOptions { limit?: number; maxChars?: number; }

/** Same filter `formatRecall` and `recallPassages` both apply: real score, non-empty text. */
function relevantHits(r: RetrievalResult): RetrievalResult['rankedPassages'] {
    return r.rankedPassages.filter((rp) => rp.score > MIN_SCORE && rp.passage.text.trim());
}

/** Pure formatter — exported for tests. */
export function formatRecall(r: RetrievalResult, maxChars = DEFAULT_MAX_CHARS): string {
    const hits = relevantHits(r);
    if (hits.length === 0) return '';
    const lines: string[] = [RECALL_HEADING, 'Facts the user saved earlier. Prefer them over guesses; cite as [M1], [M2]…'];
    let used = lines.join('\n').length;
    hits.forEach((rp, i) => {
        const title = rp.passage.title ? `${rp.passage.title}: ` : '';
        const line = `[M${i + 1}] ${title}${rp.passage.text.replace(/\s+/g, ' ').trim()}`;
        if (used + line.length + 1 > maxChars) return;
        lines.push(line);
        used += line.length + 1;
    });
    return lines.length > 2 ? lines.join('\n') : '';
}

/** Memory block for `query`, or '' — safe to call before the network has hydrated. */
export async function recallContext(userId: string | null | undefined, query: string, opts: RecallOptions = {}): Promise<string> {
    const q = query.trim();
    if (!q) return '';
    try {
        const cmn = getCmn(userId);
        await cmn.ready;
        if (cmn.metrics().counts.passages === 0) return '';
        return formatRecall(cmn.recall(q, opts.limit ?? DEFAULT_LIMIT), opts.maxChars);
    } catch {
        return ''; // ponytail: recall must never break an agent reply
    }
}

/** One recalled passage, flattened for widgets that show their sources (plan 070 Synthesis Lab). */
export interface RecalledPassage {
    passageId: string;
    sourceId: string;      // e.g. `synthesis:<id>`, `tag:<id>`, `scribe:<path>`, `foundry:<id>`
    sourceKind: SourceKind;
    title: string;
    text: string;
    score: number;
}

export interface RecallPassagesOptions {
    limit?: number;
    excludeSourceIds?: string[];
    /** Don't count this as a network query or log it (live previews while typing). */
    silent?: boolean;
}

/**
 * Structured sibling of `recallContext`: the ranked passages themselves (same
 * filter: score > MIN_SCORE, non-empty text), minus `excludeSourceIds`. Retrieval
 * only — never calls an LLM. [] when empty/not hydrated/on any error.
 * CONTRACT (plan 070 phase 2 P0) — implemented by the W1 recall agent.
 */
export async function recallPassages(userId: string | null | undefined, query: string, opts: RecallPassagesOptions = {}): Promise<RecalledPassage[]> {
    const q = query.trim();
    if (!q) return [];
    try {
        const cmn = getCmn(userId);
        await cmn.ready;
        if (cmn.metrics().counts.passages === 0) return [];
        const limit = opts.limit ?? DEFAULT_PASSAGES_LIMIT;
        const exclude = new Set(opts.excludeSourceIds ?? []);
        const result = cmn.recall(q, limit + (opts.excludeSourceIds?.length ?? 0), { silent: opts.silent });
        const seenPassageIds = new Set<string>();
        const out: RecalledPassage[] = [];
        for (const rp of relevantHits(result)) {
            const p = rp.passage;
            if (exclude.has(p.sourceId)) continue;
            if (seenPassageIds.has(p.id)) continue;
            seenPassageIds.add(p.id);
            out.push({
                passageId: p.id,
                sourceId: p.sourceId,
                sourceKind: p.sourceKind,
                title: p.title ?? '',
                text: p.text.trim(),
                score: rp.score,
            });
            if (out.length >= limit) break;
        }
        return out;
    } catch {
        return []; // ponytail: recall must never break a caller
    }
}

/** `systemPrompt` + memory block, or the prompt unchanged when there is no memory. */
export function withRecall(systemPrompt: string, memory: string): string {
    return memory ? `${systemPrompt}\n\n${memory}` : systemPrompt;
}
