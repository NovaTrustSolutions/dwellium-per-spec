/**
 * synthesisContext — grounds a Synthesis Lab question in the user's saved
 * sources (plan 070 phase 2). Pure → unit-testable. Sources come from the
 * shared Cognitive Memory Network via `recallPassages` (lib/memoryGraphRag/recall).
 */
import type { RecalledPassage } from '../../lib/memoryGraphRag/recall';

export const DEFAULT_SOURCE_CHARS = 6000;

/**
 * Wrap `task` (the question, or a second-layer prompt) with numbered sources
 * `[1]…[n]`, fenced as untrusted reference text, with instructions to cite
 * `[n]` and to say plainly when the sources do not cover the question. Sources
 * that would exceed `maxChars` are dropped (never truncated mid-text);
 * `used` is exactly the list the prompt numbers, in order. With no sources the
 * prompt is `task` unchanged and `used` is [].
 * CONTRACT (plan 070 phase 2 P0) — implemented by the W1 context agent.
 */
export function buildGroundedPrompt(task: string, sources: RecalledPassage[], maxChars: number = DEFAULT_SOURCE_CHARS): { prompt: string; used: RecalledPassage[] } {
    void task; void sources; void maxChars;
    throw new Error('plan 070 P2 W1: not implemented');
}

/** Widget id that opens a source of this kind (for `[n]` clicks), or null when none fits. CONTRACT (P0). */
export function sourceWidget(sourceKind: string): string | null {
    void sourceKind;
    throw new Error('plan 070 P2 W1: not implemented');
}
