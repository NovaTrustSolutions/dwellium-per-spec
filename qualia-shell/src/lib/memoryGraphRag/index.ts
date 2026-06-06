/**
 * MemoryGraphRAG — public engine facade.
 *
 * Ties the three-layer memory, multi-agent extraction, anti-fragmentation
 * bridging, conflict resolution, and Personalized-PageRank retrieval into one
 * object the widget drives:
 *
 *   ingest(docs) → extract (LLM or offline) → populate layers → bridge
 *                  (type + similarity) → detect & resolve conflicts
 *   retrieve(q)  → 3-step pipeline → ranked passages + facts
 *   answer(q)    → retrieve → LLM generation grounded in the passages,
 *                  or an honest extractive fallback when no LLM is configured.
 *
 * Hybrid runtime: the engine runs client-side with a LocalEmbeddingProvider by
 * default; pass a BackendEmbeddingProvider (and/or a backend PageRank) to
 * offload the heavy parts when a backend is available.
 */
import { callLlm } from '../llmClient';
import { MemoryStore, type MemorySnapshot } from './memory';
import { makeExtractionAgent, makeConflictResolver } from './agents';
import { typeBasedBridges, similarityBridges } from './bridging';
import { detectConflicts } from './conflicts';
import { retrieve } from './retrieve';
import { LocalEmbeddingProvider } from './embedding';
import type {
    SourceDocument, GraphEdge, EmbeddingProvider, RetrievalResult, QueryAnswer, ConflictResolution,
} from './types';

type LlmBundle = Parameters<typeof callLlm>[1];

export interface MemoryGraphRagOptions {
    llm?: LlmBundle | null;
    embedder?: EmbeddingProvider;
    similarityThreshold?: number;
}

const ANSWER_SYSTEM =
    'You are a retrieval-augmented assistant. Answer the question using ONLY the numbered context passages. ' +
    'Cite the passages you use like [1], [2]. If the answer is not in the context, say you do not have enough information.';

export class MemoryGraphRagEngine {
    readonly store = new MemoryStore();
    bridges: GraphEdge[] = [];
    lastResolutions: ConflictResolution[] = [];
    private readonly embedder: EmbeddingProvider;
    private readonly llm: LlmBundle | null;
    private readonly extractionAgent;
    private readonly conflictResolver;
    private readonly simThreshold: number;

    constructor(opts: MemoryGraphRagOptions = {}) {
        this.llm = opts.llm ?? null;
        this.embedder = opts.embedder ?? new LocalEmbeddingProvider();
        this.simThreshold = opts.similarityThreshold ?? 0.6;
        this.extractionAgent = makeExtractionAgent(this.llm);
        this.conflictResolver = makeConflictResolver(this.llm);
    }

    /** Extract from each document into the three layers, then bridge + de-conflict. */
    async ingest(docs: SourceDocument[]): Promise<void> {
        for (const doc of docs) {
            if (!doc.text?.trim()) continue;
            const result = await this.extractionAgent.extract(doc);
            this.store.ingest(result);
        }
        await this.rebuild();
    }

    /** Recompute offline bridges + resolve conflicts. Call after any ingest. */
    async rebuild(): Promise<void> {
        const entities = [...this.store.entities.values()];
        const typeEdges = typeBasedBridges(entities);
        let simEdges: GraphEdge[] = [];
        try {
            const vecs = await this.embedder.embed(entities.map((e) => e.name));
            const map = new Map<string, number[]>();
            entities.forEach((e, i) => map.set(e.id, vecs[i]));
            simEdges = similarityBridges(map, { threshold: this.simThreshold });
        } catch {
            simEdges = []; // embedding unavailable → type bridges still connect the graph
        }
        this.bridges = [...typeEdges, ...simEdges];
        await this.resolveConflicts();
    }

    /** Detect contradictions and prune the losing facts (keep the evidence-backed truth). */
    async resolveConflicts(): Promise<ConflictResolution[]> {
        const conflicts = detectConflicts([...this.store.facts.values()]);
        const resolutions: ConflictResolution[] = [];
        for (const c of conflicts) {
            const passages = c.facts.map((f) => this.store.passages.get(f.passageId)).filter(Boolean) as any[];
            const res = await this.conflictResolver.resolve(c, passages);
            this.store.removeFacts(res.losers);
            resolutions.push(res);
        }
        this.lastResolutions = resolutions;
        return resolutions;
    }

    retrieve(query: string, limit = 8): RetrievalResult {
        return retrieve(this.store, query, { bridges: this.bridges, limit });
    }

    /** Retrieve + generate. Falls back to an extractive answer when no LLM. */
    async answer(query: string, limit = 6): Promise<QueryAnswer> {
        const r = this.retrieve(query, limit);
        const context = r.rankedPassages
            .map((rp, i) => `[${i + 1}] ${rp.passage.title ? rp.passage.title + ': ' : ''}${rp.passage.text}`)
            .join('\n\n');

        if (this.llm && this.llm.active && context) {
            try {
                const res = await callLlm({ prompt: `Question: ${query}\n\nContext:\n${context}`, systemPrompt: ANSWER_SYSTEM, temperature: 0.2 }, this.llm);
                if (res?.text) return { ...r, answer: res.text, generatedByLlm: true };
            } catch { /* fall through to extractive */ }
        }
        const extractive = context
            ? `No LLM configured — showing the top retrieved passages:\n\n${context}`
            : 'No relevant passages found. Ingest documents first, or refine the query.';
        return { ...r, answer: extractive, generatedByLlm: false };
    }

    snapshot(): MemorySnapshot { return this.store.snapshot(); }
    loadSnapshot(s: MemorySnapshot): void {
        const fresh = MemoryStore.fromSnapshot(s);
        this.store.types = fresh.types;
        this.store.schemaRelations = fresh.schemaRelations;
        this.store.entities = fresh.entities;
        this.store.facts = fresh.facts;
        this.store.passages = fresh.passages;
    }
}

export function createMemoryGraphRagEngine(opts: MemoryGraphRagOptions = {}): MemoryGraphRagEngine {
    return new MemoryGraphRagEngine(opts);
}

// Re-exports for consumers + tests
export * from './types';
export { MemoryStore } from './memory';
export { personalizedPageRank, buildHeteroGraph, ENTITY, PASSAGE, topNodes } from './pagerank';
export { typeBasedBridges, similarityBridges } from './bridging';
export { detectConflicts, resolveConflictLocal } from './conflicts';
export { retrieve, memoryGuidedRetrieval, initNodeWeights, tokenize } from './retrieve';
export { localEmbed, cosine, LocalEmbeddingProvider, BackendEmbeddingProvider } from './embedding';
export { localExtract, chunkToPassages, slug } from './agents';
