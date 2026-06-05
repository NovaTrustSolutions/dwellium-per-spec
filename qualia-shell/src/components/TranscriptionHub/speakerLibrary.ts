/**
 * speakerLibrary — pure matching core for neural speaker identification.
 *
 * Speaker identity is represented by an embedding vector (a "voiceprint")
 * produced by a neural model (see speakerEmbedder.ts). Enrollment stores a
 * speaker's centroid (mean of their sample embeddings); identification compares
 * a new embedding to every enrolled centroid by cosine similarity and returns
 * the best match above a threshold.
 *
 * This module is PURE (no model, no DOM, no storage) so the math + decision
 * logic is fully unit-testable and deterministic.
 */

export interface EnrolledSpeaker {
    id: string;
    label: string;
    /** L2-normalized mean embedding (voiceprint). */
    centroid: number[];
    /** How many samples have been folded into the centroid. */
    sampleCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface IdentifyResult {
    id: string;
    label: string;
    /** Cosine similarity to the matched centroid, 0..1 (after normalization). */
    score: number;
}

/** Default cosine-similarity threshold to accept a match. Tunable in the UI. */
export const DEFAULT_MATCH_THRESHOLD = 0.72;

/** L2-normalize a vector (unit length). Zero vector returns a copy of zeros. */
export function l2normalize(v: number[]): number[] {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    const norm = Math.sqrt(sum);
    if (norm === 0) return v.slice();
    return v.map(x => x / norm);
}

/** Cosine similarity of two equal-length vectors (−1..1). Mismatched/empty → 0. */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}

/** Element-wise mean of vectors (returns [] for empty input). */
export function meanVector(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    const dim = vectors[0].length;
    const out = new Array(dim).fill(0);
    for (const v of vectors) {
        for (let i = 0; i < dim; i++) out[i] += v[i];
    }
    for (let i = 0; i < dim; i++) out[i] /= vectors.length;
    return out;
}

/**
 * Fold a new sample embedding into an existing centroid via running mean, then
 * re-normalize. `count` is the number of samples already in the centroid.
 */
export function updateCentroid(centroid: number[], count: number, embedding: number[]): number[] {
    const e = l2normalize(embedding);
    if (count <= 0 || centroid.length !== e.length) return e;
    const merged = centroid.map((c, i) => (c * count + e[i]) / (count + 1));
    return l2normalize(merged);
}

/**
 * Identify the best-matching enrolled speaker for an embedding. Returns the
 * match (id/label/score) when the top cosine similarity meets `threshold`,
 * otherwise null (caller treats as an unknown speaker / offer to enroll).
 */
export function identifySpeaker(
    embedding: number[],
    speakers: EnrolledSpeaker[],
    threshold: number = DEFAULT_MATCH_THRESHOLD,
): IdentifyResult | null {
    if (!embedding || embedding.length === 0 || speakers.length === 0) return null;
    const e = l2normalize(embedding);
    let best: IdentifyResult | null = null;
    for (const s of speakers) {
        const score = cosineSimilarity(e, s.centroid);
        if (!best || score > best.score) best = { id: s.id, label: s.label, score };
    }
    return best && best.score >= threshold ? best : null;
}

/** Minimum gap between top-1 and top-2 cosine scores to accept a match. */
export const DEFAULT_MARGIN = 0.06;

export interface IdentifyDetail {
    /** Accepted match — passes BOTH the threshold and the top1-vs-top2 margin. */
    match: IdentifyResult | null;
    /** Top-1 candidate regardless of acceptance (for UI / debugging). */
    best: IdentifyResult | null;
    /** Top-2 similarity score (−1 if only one enrolled speaker). */
    runnerUpScore: number;
    /** best.score − runnerUpScore. */
    margin: number;
}

/**
 * Like identifySpeaker, but also enforces a top-1-vs-top-2 MARGIN so we don't
 * confidently label a segment when two enrolled voices are nearly tied. Returns
 * rich detail so callers (smoothing, UI) can reason about confidence.
 */
export function identifyWithConfidence(
    embedding: number[],
    speakers: EnrolledSpeaker[],
    opts: { threshold?: number; margin?: number } = {},
): IdentifyDetail {
    const threshold = opts.threshold ?? DEFAULT_MATCH_THRESHOLD;
    const marginReq = opts.margin ?? DEFAULT_MARGIN;
    const empty: IdentifyDetail = { match: null, best: null, runnerUpScore: -1, margin: 0 };
    if (!embedding || embedding.length === 0 || speakers.length === 0) return empty;

    const e = l2normalize(embedding);
    const scored = speakers
        .map(s => ({ id: s.id, label: s.label, score: cosineSimilarity(e, s.centroid) }))
        .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const runnerUpScore = scored.length > 1 ? scored[1].score : -1;
    const margin = best.score - runnerUpScore;
    const accepted = best.score >= threshold && margin >= marginReq;
    return { match: accepted ? best : null, best, runnerUpScore, margin };
}
