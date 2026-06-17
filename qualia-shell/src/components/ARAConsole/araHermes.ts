/**
 * araHermes — Phase-10 A2: Hermes run-memory for ARA QUICK CHAT, kept separate
 * from Agent Lab team batches per the Phase-10 plan ("ARA is quick interactive;
 * labs are team batches"). Separation is by tag, not by store: ARA chat runs
 * are recorded into the ONE per-user Hermes log with `toolsUsed: ['ara-chat']`,
 * and ARA few-shot ranks ONLY over ara-chat-tagged runs — so the Honcho/Hermes
 * panel still sees everything, but lab runs never bleed into chat hints and
 * vice versa.
 *
 * Voting: thumbs-up (+1) boosts a run's rank (rankPastRuns ratingBoost);
 * thumbs-down (−1) EXCLUDES the run from future ARA few-shot entirely — the
 * strongest "don't do that again" signal available without model training.
 */
import {
    hermesLearningStore,
    rankPastRuns,
    recordRun,
    similarity,
    type HermesRunRecord,
} from '../HonchoHermesPanel/hermesLearningStore';

/** Tag distinguishing ARA quick-chat runs from Agent Lab batches in the log. */
export const ARA_CHAT_TOOL = 'ara-chat';

/** Few-shot fan-out cap (Phase-10 risk register: 3–5; we pin the low end). */
export const ARA_FEWSHOT_K = 3;

/** ARA-tagged, not-thumbed-down subset of the per-user Hermes log. Pure-ish (store read only). */
export function araChatRuns(): HermesRunRecord[] {
    return hermesLearningStore
        .getSnapshot()
        .filter(r => (r.toolsUsed || []).includes(ARA_CHAT_TOOL))
        .filter(r => !(typeof r.rating === 'number' && r.rating < 0));
}

/**
 * Top-K past ARA answers relevant to `prompt` (successes only, downvoted excluded).
 * Stricter than the store's rankPastRuns: requires POSITIVE token similarity,
 * because rankPastRuns' taskType boost alone (0.15) would otherwise inject
 * completely unrelated exchanges that merely share a coarse task type —
 * acceptable for Hermes tool-routing, noise for chat hints.
 */
export function relevantAraRuns(prompt: string, k: number = ARA_FEWSHOT_K): HermesRunRecord[] {
    const similarOnly = araChatRuns().filter(r => similarity(prompt, r.prompt) > 0);
    return rankPastRuns(similarOnly, prompt, k);
}

/**
 * Render past ARA exchanges as a context block for injection. '' when no
 * relevant history. Pure (takes its data as an argument).
 */
export function formatAraFewShot(runs: HermesRunRecord[]): string {
    if (!runs.length) return '';
    const lines = ["## Similar past exchanges the user kept (reference for style + substance — adapt, don't repeat verbatim)"];
    for (const r of runs) {
        lines.push(`- Q: ${r.prompt}`);
        if (r.summary) lines.push(`  A: ${r.summary}`);
    }
    return lines.join('\n');
}

/** Convenience: ranked + formatted in one call (reads the store). */
export function araFewShot(prompt: string): string {
    return formatAraFewShot(relevantAraRuns(prompt));
}

/**
 * Record a successful ARA chat exchange into the per-user Hermes log.
 * Caller must set `hermesLearningUserIdHolder.current` first (ARAConsole does).
 * Returns the record so the message can carry its id for thumbs-up/down voting.
 */
export function recordAraChat(prompt: string, answer: string): HermesRunRecord {
    return recordRun({
        prompt,
        outcome: 'success',
        summary: answer,
        toolsUsed: [ARA_CHAT_TOOL],
    });
}
