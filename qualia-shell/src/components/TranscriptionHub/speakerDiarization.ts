/**
 * speakerDiarization — temporal smoothing + clustering on top of the matching
 * core. Pure + deterministic (the smoother is a small explicit state machine).
 *
 *  - createSpeakerSmoother: hysteresis so a single noisy segment can't flip the
 *    labeled speaker (people don't change every ~3s). This is what robustly
 *    kills the "one speaker → many labels" failure.
 *  - clusterEmbeddings: greedy agglomerative clustering by cosine similarity —
 *    a real client-side slice of diarization for grouping UNKNOWN voices in a
 *    recording so they can be bulk-labeled. (Full pyannote-grade diarization
 *    with neural VAD/segmentation + overlap handling is a separate backend job.)
 */
import { cosineSimilarity, l2normalize, meanVector } from './speakerLibrary';

export interface SmootherOptions {
    /** Consecutive segments a NEW label must win before we switch to it. */
    minSwitchStreak?: number;
}

export interface SpeakerSmoother {
    /** Feed a raw per-segment label ('Unknown' allowed); returns smoothed label. */
    push(raw: string): string;
    current(): string | null;
    reset(): void;
}

export function createSpeakerSmoother(opts: SmootherOptions = {}): SpeakerSmoother {
    const minSwitchStreak = Math.max(1, opts.minSwitchStreak ?? 2);
    let current: string | null = null;
    let pendingLabel: string | null = null;
    let pendingStreak = 0;

    return {
        push(raw: string): string {
            // Don't flip to "Unknown" on a single miss — hold the known speaker.
            if (raw === 'Unknown' || raw === '') return current ?? 'Unknown';
            if (raw === current) { pendingLabel = null; pendingStreak = 0; return current; }
            // A different label: require a streak before switching.
            if (raw === pendingLabel) pendingStreak++;
            else { pendingLabel = raw; pendingStreak = 1; }
            if (current === null || pendingStreak >= minSwitchStreak) {
                current = raw; pendingLabel = null; pendingStreak = 0;
            }
            return current ?? raw;
        },
        current() { return current; },
        reset() { current = null; pendingLabel = null; pendingStreak = 0; },
    };
}

export interface EmbeddingCluster {
    indices: number[];
    centroid: number[];
}

/**
 * Greedy agglomerative clustering of embeddings by cosine similarity. Repeatedly
 * merges the two most-similar clusters while their centroid similarity ≥
 * threshold. Deterministic. Returns clusters (member indices into `embeddings`).
 */
export function clusterEmbeddings(embeddings: number[][], threshold = 0.72): EmbeddingCluster[] {
    if (embeddings.length === 0) return [];
    let clusters: EmbeddingCluster[] = embeddings.map((e, i) => ({ indices: [i], centroid: l2normalize(e) }));

    // eslint-disable-next-line no-constant-condition
    while (clusters.length > 1) {
        let bestI = -1, bestJ = -1, bestSim = -Infinity;
        for (let i = 0; i < clusters.length; i++) {
            for (let j = i + 1; j < clusters.length; j++) {
                const sim = cosineSimilarity(clusters[i].centroid, clusters[j].centroid);
                if (sim > bestSim) { bestSim = sim; bestI = i; bestJ = j; }
            }
        }
        if (bestSim < threshold || bestI < 0) break;
        const mergedIndices = [...clusters[bestI].indices, ...clusters[bestJ].indices];
        const centroid = l2normalize(meanVector(mergedIndices.map(k => embeddings[k])));
        const next = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
        next.push({ indices: mergedIndices, centroid });
        clusters = next;
    }
    // Stable order: largest clusters first, then by first index.
    return clusters.sort((a, b) => (b.indices.length - a.indices.length) || (a.indices[0] - b.indices[0]));
}
