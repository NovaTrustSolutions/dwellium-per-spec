/**
 * Conflict detection + resolution (Agents 2 & 3, local-first core).
 *
 *   • detectConflicts — pure: groups facts by (subject, predicate); a group with
 *     ≥2 distinct object values is a logical inconsistency (e.g. "Newton born
 *     1643" vs "Newton born 1645").
 *   • resolveConflictLocal — deterministic evidence heuristic used when no LLM
 *     is configured: majority object across the grounding passages, then highest
 *     confidence, then most recent. The LLM-backed handler in agents.ts can
 *     override this with a passage-evidence judgement.
 */
import type { Fact, FactConflict, ConflictResolution, Passage } from './types';

function objectValue(f: Fact): string {
    return f.objectLiteral !== undefined ? `lit:${f.objectLiteral}` : `ent:${f.objectId}`;
}

export function detectConflicts(facts: Fact[]): FactConflict[] {
    const groups = new Map<string, Fact[]>();
    for (const f of facts) {
        const key = `${f.subjectId}|${f.predicate}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(f);
    }
    const conflicts: FactConflict[] = [];
    for (const [key, group] of groups) {
        const distinct = new Set(group.map(objectValue));
        if (distinct.size > 1) {
            const [subjectId, predicate] = key.split('|');
            conflicts.push({ subjectId, predicate, facts: group });
        }
    }
    return conflicts;
}

/**
 * Deterministic resolution: tally each candidate object across the conflict's
 * facts (majority vote weighted by confidence), pick the winning object, then
 * the single highest-confidence fact asserting it. `passages` is accepted so
 * the signature matches the LLM agent; the local heuristic uses passage
 * presence as a tiny tie-breaker (a fact with grounding beats one without).
 */
export function resolveConflictLocal(conflict: FactConflict, passages: Passage[] = []): ConflictResolution {
    const passageIds = new Set(passages.map((p) => p.id));
    const tally = new Map<string, number>();
    for (const f of conflict.facts) {
        const grounded = f.passageId && passageIds.size > 0 ? (passageIds.has(f.passageId) ? 0.05 : 0) : 0;
        tally.set(objectValue(f), (tally.get(objectValue(f)) ?? 0) + f.confidence + grounded);
    }
    let bestObj = '';
    let bestScore = -Infinity;
    for (const [obj, score] of tally) {
        if (score > bestScore) { bestScore = score; bestObj = obj; }
    }
    // winner = highest-confidence (then most recent) fact asserting the winning object
    const candidates = conflict.facts
        .filter((f) => objectValue(f) === bestObj)
        .sort((a, b) => b.confidence - a.confidence || b.createdAt.localeCompare(a.createdAt));
    const winner = candidates[0];
    const losers = conflict.facts.filter((f) => f.id !== winner.id).map((f) => f.id);
    return {
        conflict,
        winnerId: winner.id,
        losers,
        reason: `Chosen by majority+confidence (${bestScore.toFixed(2)}) over ${conflict.facts.length} candidates for ${conflict.subjectId} "${conflict.predicate}".`,
    };
}
