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
import type { RetrievalResult } from './types';

export const RECALL_HEADING = '## Relevant memory (Cognitive M Network)';
const DEFAULT_LIMIT = 5;
const DEFAULT_MAX_CHARS = 2400;
const MIN_SCORE = 1e-6;

export interface RecallOptions { limit?: number; maxChars?: number; }

/** Pure formatter — exported for tests. */
export function formatRecall(r: RetrievalResult, maxChars = DEFAULT_MAX_CHARS): string {
    const hits = r.rankedPassages.filter((rp) => rp.score > MIN_SCORE && rp.passage.text.trim());
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

/** `systemPrompt` + memory block, or the prompt unchanged when there is no memory. */
export function withRecall(systemPrompt: string, memory: string): string {
    return memory ? `${systemPrompt}\n\n${memory}` : systemPrompt;
}
