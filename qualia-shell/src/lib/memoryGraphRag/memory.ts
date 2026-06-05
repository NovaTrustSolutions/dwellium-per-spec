/**
 * MemoryStore — the three-layer memory (Ontology / Fact / Passage).
 *
 * Pure in-memory data structure with the Schema-Instance Alignment rule baked
 * in: every fact must be governed by a schema relation in the Ontology layer.
 * When a fact's (subjectType, predicate, objectType) shape has no schema rule,
 * the store can induce one (the ontology learns from data) OR flag it — and
 * `validate()` reports the genuine violations (facts whose entity types are
 * unknown). A per-user persistence wrapper serialises `snapshot()`.
 */
import type {
    OntologyType, SchemaRelation, Entity, Fact, Passage,
    ExtractionResult, GraphEdge, HeteroGraph,
} from './types';
import { buildHeteroGraph } from './pagerank';

const LITERAL_TYPE = 'literal';

export interface MemorySnapshot {
    types: OntologyType[];
    schemaRelations: SchemaRelation[];
    entities: Entity[];
    facts: Fact[];
    passages: Passage[];
}

export class MemoryStore {
    types = new Map<string, OntologyType>();
    schemaRelations = new Map<string, SchemaRelation>();
    entities = new Map<string, Entity>();
    facts = new Map<string, Fact>();
    passages = new Map<string, Passage>();

    // ── Ontology ────────────────────────────────────────────────────
    addType(t: OntologyType): void {
        const existing = this.types.get(t.id);
        if (existing) existing.count = Math.max(existing.count, t.count);
        else this.types.set(t.id, { ...t });
    }
    addSchemaRelation(r: SchemaRelation): void {
        this.schemaRelations.set(r.id, r);
    }
    private schemaRelId(subjectType: string, predicate: string, objectType: string): string {
        return `${subjectType}::${predicate}::${objectType}`;
    }
    /** Find (or, when autoCreate, induce) the schema rule governing a shape. */
    ensureSchemaRelation(subjectType: string, predicate: string, objectType: string, autoCreate = true): string | null {
        const id = this.schemaRelId(subjectType, predicate, objectType);
        if (this.schemaRelations.has(id)) return id;
        if (!autoCreate) return null;
        this.schemaRelations.set(id, { id, subjectType, predicate, objectType });
        return id;
    }

    // ── Fact / Passage / Entity ─────────────────────────────────────
    addPassage(p: Passage): void { this.passages.set(p.id, p); }
    addEntity(e: Entity): void {
        if (!this.entities.has(e.id)) {
            this.entities.set(e.id, { ...e });
            // bump ontology frequency
            const t = this.types.get(e.typeId);
            if (t) t.count += 1;
            else this.types.set(e.typeId, { id: e.typeId, name: e.typeId, count: 1 });
        }
    }
    addFact(f: Fact, autoCreateSchema = true): Fact {
        const aligned = { ...f, schemaRelId: this.alignFact(f, autoCreateSchema) ?? undefined };
        this.facts.set(f.id, aligned);
        return aligned;
    }

    /** Returns the governing schema relation id, or null if the shape is unknown + autoCreate is off. */
    alignFact(f: Fact, autoCreate = true): string | null {
        const subjType = this.entities.get(f.subjectId)?.typeId;
        const objType = f.objectLiteral !== undefined ? LITERAL_TYPE : this.entities.get(f.objectId)?.typeId;
        if (!subjType || !objType) return null; // unknown entity type → genuine violation
        return this.ensureSchemaRelation(subjType, f.predicate, objType, autoCreate);
    }

    /** Facts that violate Schema-Instance Alignment (no governing schema rule). */
    validate(): Fact[] {
        const bad: Fact[] = [];
        for (const f of this.facts.values()) {
            if (!f.schemaRelId || !this.schemaRelations.has(f.schemaRelId)) bad.push(f);
        }
        return bad;
    }

    // ── Bulk ingest from an extraction agent ────────────────────────
    ingest(result: ExtractionResult): void {
        result.types?.forEach((t) => this.addType(t));
        result.schemaRelations?.forEach((r) => this.addSchemaRelation(r));
        result.passages?.forEach((p) => this.addPassage(p));
        result.entities?.forEach((e) => this.addEntity(e));
        result.facts?.forEach((f) => this.addFact(f));
    }

    /** Remove the losing facts from a resolved conflict (keep the truth). */
    removeFacts(ids: string[]): void {
        for (const id of ids) this.facts.delete(id);
    }

    // ── Views ───────────────────────────────────────────────────────
    toGraph(bridges: GraphEdge[] = []): HeteroGraph {
        return buildHeteroGraph([...this.facts.values()], [...this.passages.values()], bridges);
    }
    counts() {
        return {
            types: this.types.size,
            schemaRelations: this.schemaRelations.size,
            entities: this.entities.size,
            facts: this.facts.size,
            passages: this.passages.size,
        };
    }
    snapshot(): MemorySnapshot {
        return {
            types: [...this.types.values()],
            schemaRelations: [...this.schemaRelations.values()],
            entities: [...this.entities.values()],
            facts: [...this.facts.values()],
            passages: [...this.passages.values()],
        };
    }
    static fromSnapshot(s: MemorySnapshot): MemoryStore {
        const m = new MemoryStore();
        s.types?.forEach((t) => m.types.set(t.id, t));
        s.schemaRelations?.forEach((r) => m.schemaRelations.set(r.id, r));
        s.passages?.forEach((p) => m.passages.set(p.id, p));
        s.entities?.forEach((e) => m.entities.set(e.id, e));
        s.facts?.forEach((f) => m.facts.set(f.id, f));
        return m;
    }
}
