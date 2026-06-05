/**
 * MemoryGraphRAG — shared types for the three-layer memory architecture.
 *
 * Three interconnected layers:
 *   • Ontology  — schema-level types + relation constraints (the frequency filter).
 *   • Fact      — concrete instantiated entity→predicate→entity triplets.
 *   • Passage   — original source text, so every fact is tethered to evidence.
 *
 * Everything here is plain data (no DOM, no React) so the engine is portable +
 * unit-testable and can run client-side or be mirrored by a backend.
 */

// ── Ontology layer ─────────────────────────────────────────────────
export interface OntologyType {
    id: string;          // slug, e.g. 'person'
    name: string;        // display, e.g. 'Person'
    parent?: string;     // parent type id (taxonomy), optional
    count: number;       // how many entities instantiate this type (frequency)
}

/** A schema-level relation constraint: subjectType --predicate--> objectType. */
export interface SchemaRelation {
    id: string;
    subjectType: string; // OntologyType id
    predicate: string;
    objectType: string;  // OntologyType id
}

// ── Fact layer ─────────────────────────────────────────────────────
export interface Entity {
    id: string;          // stable id (slug of name+type)
    name: string;
    typeId: string;      // OntologyType id
    aliases?: string[];
}

export interface Fact {
    id: string;
    subjectId: string;   // Entity id
    predicate: string;
    objectId: string;    // Entity id (object entity) …
    objectLiteral?: string; // … OR a literal value (e.g. "1643") when the object isn't an entity
    passageId: string;   // Passage that grounds this fact (evidence)
    schemaRelId?: string; // the SchemaRelation this fact aligns to (set by alignment)
    confidence: number;  // 0..1
    createdAt: string;
}

// ── Passage layer ──────────────────────────────────────────────────
export type SourceKind = 'scribe' | 'workspace' | 'tag' | 'upload' | 'transcript' | 'capture' | 'synthesis' | 'other';

export interface Passage {
    id: string;
    text: string;
    sourceId: string;    // e.g. filepath, tag item id, transcript id
    sourceKind: SourceKind;
    title?: string;
    offset?: number;     // char offset within the source, if chunked
}

/** A document fed to ingestion; the engine chunks it into passages. */
export interface SourceDocument {
    sourceId: string;
    sourceKind: SourceKind;
    title?: string;
    text: string;
}

// ── Graph (heterogeneous: entities + passages as nodes) ────────────
export interface GraphEdge {
    from: string;
    to: string;
    weight: number;
    kind: 'fact' | 'type-bridge' | 'similarity-bridge' | 'evidence';
}

export interface HeteroGraph {
    nodes: string[];                       // node ids (entity:* and passage:*)
    edges: GraphEdge[];
}

// ── Conflict handling ──────────────────────────────────────────────
export interface FactConflict {
    subjectId: string;
    predicate: string;
    facts: Fact[];        // ≥2 facts that disagree on the object
}

export interface ConflictResolution {
    conflict: FactConflict;
    winnerId: string;     // Fact id chosen as the truth
    reason: string;
    losers: string[];     // Fact ids superseded
}

// ── Retrieval ──────────────────────────────────────────────────────
export interface RetrievalCandidates {
    passageIds: string[];
    factIds: string[];
    typeIds: string[];
}

export interface RankedPassage {
    passage: Passage;
    score: number;
}

export interface RetrievalResult {
    query: string;
    rankedPassages: RankedPassage[];
    rankedFactIds: string[];
    nodeScores: Map<string, number>;
    candidates: RetrievalCandidates;
}

export interface QueryAnswer extends RetrievalResult {
    answer: string;          // LLM-generated, or an honest extractive fallback
    generatedByLlm: boolean;
}

// ── Embedding provider (client fallback OR backend) ────────────────
export interface EmbeddingProvider {
    embed(texts: string[]): Promise<number[][]>;
    readonly dim: number;
    readonly kind: 'local' | 'backend';
}

// ── Agent contracts (single-responsibility) ───────────────────────
export interface ExtractionResult {
    types: OntologyType[];
    schemaRelations: SchemaRelation[];
    entities: Entity[];
    facts: Fact[];
    passages: Passage[];
}

export interface ExtractionAgent {
    extract(doc: SourceDocument): Promise<ExtractionResult>;
}
export interface ConflictResolverAgent {
    /** Given a conflict + its evidence passages, choose the truth. */
    resolve(conflict: FactConflict, passages: Passage[]): Promise<ConflictResolution>;
}
