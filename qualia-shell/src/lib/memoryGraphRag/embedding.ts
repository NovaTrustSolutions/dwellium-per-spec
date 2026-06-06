/**
 * Embedding + similarity utilities.
 *
 * The default provider is a deterministic, dependency-free LOCAL embedding
 * (character n-gram hashing → L2-normalized vector). It is not as good as a
 * real model, but it is offline, instant, and reproducible — the local-first
 * fallback. In the hybrid runtime a backend provider can replace it for real
 * semantic vectors; the rest of the engine is agnostic to which is used.
 */
import type { EmbeddingProvider } from './types';

export function cosine(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** FNV-1a 32-bit hash → stable bucket index. */
function hashToken(token: string, dim: number): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < token.length; i++) {
        h ^= token.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return Math.abs(h) % dim;
}

function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/** Word tokens + char trigrams → hashed bag → L2-normalized vector. */
export function localEmbed(text: string, dim = 256): number[] {
    const vec = new Array(dim).fill(0);
    const words = tokenize(text);
    for (const w of words) {
        vec[hashToken(w, dim)] += 1;
        // char trigrams add sub-word similarity (handles morphology / typos)
        const padded = `#${w}#`;
        for (let i = 0; i + 3 <= padded.length; i++) {
            vec[hashToken(padded.slice(i, i + 3), dim)] += 0.5;
        }
    }
    // L2 normalize
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < dim; i++) vec[i] /= norm;
    return vec;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
    readonly kind = 'local' as const;
    constructor(readonly dim = 256) {}
    async embed(texts: string[]): Promise<number[][]> {
        return texts.map((t) => localEmbed(t, this.dim));
    }
}

/**
 * Backend-backed provider for the hybrid runtime. POSTs to the embeddings
 * endpoint; on any failure the caller should fall back to LocalEmbeddingProvider
 * so the feature still works offline (honest degradation, never fabricated).
 */
export class BackendEmbeddingProvider implements EmbeddingProvider {
    readonly kind = 'backend' as const;
    constructor(
        readonly endpoint: string,
        readonly dim = 768,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}
    async embed(texts: string[]): Promise<number[][]> {
        const res = await this.fetchImpl(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts }),
        });
        if (!res.ok) throw new Error(`Embedding backend ${res.status}`);
        const json = await res.json();
        const vectors = json.vectors ?? json.embeddings ?? json.data;
        if (!Array.isArray(vectors)) throw new Error('Embedding backend returned no vectors');
        return vectors as number[][];
    }
}
