/**
 * Multi-agent extraction + conflict resolution.
 *
 * Single-responsibility agents (per the architecture): an Extraction Agent
 * populates the three layers, and a Conflict Resolver judges contradictions
 * against passage evidence. Each runs through the user's configured LLM
 * (`callLlm`) when available, and falls back to a deterministic, offline
 * heuristic when no LLM is configured — so the feature is fully usable
 * local-first and never fabricates an LLM that isn't there.
 */
import { callLlm } from '../llmClient';
import type {
    SourceDocument, ExtractionResult, ExtractionAgent, ConflictResolverAgent,
    Entity, Fact, Passage, OntologyType, FactConflict, ConflictResolution,
} from './types';
import { resolveConflictLocal } from './conflicts';

type LlmBundle = Parameters<typeof callLlm>[1];

export function slug(s: string): string {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'x';
}

/** Deterministic passage chunking — split on blank lines, then cap length. */
export function chunkToPassages(doc: SourceDocument, maxChars = 600): Passage[] {
    const blocks = doc.text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const out: Passage[] = [];
    let idx = 0;
    for (const block of blocks) {
        for (let i = 0; i < block.length; i += maxChars) {
            const text = block.slice(i, i + maxChars);
            out.push({
                id: `${doc.sourceId}#${idx}`,
                text,
                sourceId: doc.sourceId,
                sourceKind: doc.sourceKind,
                title: doc.title,
                offset: i,
            });
            idx++;
        }
    }
    if (out.length === 0 && doc.text.trim()) {
        out.push({ id: `${doc.sourceId}#0`, text: doc.text.trim().slice(0, maxChars), sourceId: doc.sourceId, sourceKind: doc.sourceKind, title: doc.title, offset: 0 });
    }
    return out;
}

const CAP_SEQ = /\b([A-Z][a-zA-Z0-9]+(?:\s+(?:of|the|and|for)?\s*[A-Z][a-zA-Z0-9]+)*)\b/g;
const STOP = new Set(['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'It', 'He', 'She', 'They', 'We', 'I', 'In', 'On', 'At', 'For']);

/**
 * Offline extraction: chunk into passages, pull capitalized noun phrases as
 * entities (type 'concept'), and emit co-mention facts within each passage.
 * Entity ids are slugs of the name, so the same name across documents collapses
 * to one node — which is what makes multi-hop links form across boundaries.
 */
export function localExtract(doc: SourceDocument): ExtractionResult {
    const passages = chunkToPassages(doc);
    const entities = new Map<string, Entity>();
    const facts: Fact[] = [];
    const now = new Date().toISOString();

    for (const p of passages) {
        const names = new Set<string>();
        let m: RegExpExecArray | null;
        CAP_SEQ.lastIndex = 0;
        while ((m = CAP_SEQ.exec(p.text)) !== null) {
            const name = m[1].trim();
            if (name.length < 3 || STOP.has(name)) continue;
            names.add(name);
        }
        const list = [...names].slice(0, 12);
        for (const name of list) entities.set(slug(name), { id: slug(name), name, typeId: 'concept' });
        // co-mention facts (chain) within the passage
        for (let i = 0; i + 1 < list.length; i++) {
            facts.push({
                id: `${p.id}:f${i}`,
                subjectId: slug(list[i]),
                predicate: 'related-to',
                objectId: slug(list[i + 1]),
                passageId: p.id,
                confidence: 0.4,
                createdAt: now,
            });
        }
    }
    const types: OntologyType[] = [{ id: 'concept', name: 'Concept', count: entities.size }];
    return { types, schemaRelations: [], entities: [...entities.values()], facts, passages };
}

function parseJsonLoose(text: string): any {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    try { return JSON.parse(cleaned); } catch { /* fall through */ }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) { try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* noop */ } }
    return null;
}

const EXTRACT_SYSTEM =
    'You are an extraction agent for a knowledge graph. From the passage, extract entities and factual triplets. ' +
    'Respond with JSON ONLY: {"entities":[{"name":string,"type":string}],"facts":[{"subject":string,"predicate":string,"object":string,"confidence":number}]}. ' +
    'Types are lowercase singular categories (person, organization, place, date, concept, …). Do not invent facts not supported by the passage.';

/** LLM extraction per passage; defensively parsed; falls back to localExtract on failure. */
export async function llmExtract(doc: SourceDocument, llm: LlmBundle): Promise<ExtractionResult> {
    const passages = chunkToPassages(doc);
    const entities = new Map<string, Entity>();
    const typeCounts = new Map<string, number>();
    const facts: Fact[] = [];
    const now = new Date().toISOString();
    let anySuccess = false;

    for (const p of passages) {
        let parsed: any = null;
        try {
            const res = await callLlm({ prompt: p.text, systemPrompt: EXTRACT_SYSTEM, responseFormat: 'json', temperature: 0.1 }, llm);
            if (res?.text) parsed = parseJsonLoose(res.text);
        } catch { parsed = null; }
        if (!parsed || !Array.isArray(parsed.entities)) continue;
        anySuccess = true;
        for (const e of parsed.entities) {
            if (!e?.name) continue;
            const type = slug(e.type || 'concept');
            entities.set(slug(e.name), { id: slug(e.name), name: String(e.name), typeId: type });
            typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
        }
        let fi = 0;
        for (const f of Array.isArray(parsed.facts) ? parsed.facts : []) {
            if (!f?.subject || !f?.predicate) continue;
            const subjId = slug(f.subject);
            if (!entities.has(subjId)) entities.set(subjId, { id: subjId, name: String(f.subject), typeId: 'concept' });
            const objIsEntity = f.object && typeof f.object === 'string' && !/^\d/.test(String(f.object).trim());
            const objId = objIsEntity ? slug(f.object) : '';
            if (objIsEntity && !entities.has(objId)) entities.set(objId, { id: objId, name: String(f.object), typeId: 'concept' });
            facts.push({
                id: `${p.id}:f${fi++}`,
                subjectId: subjId,
                predicate: String(f.predicate),
                objectId: objId,
                objectLiteral: objIsEntity ? undefined : String(f.object ?? ''),
                passageId: p.id,
                confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.7,
                createdAt: now,
            });
        }
    }
    if (!anySuccess) return localExtract(doc); // honest fallback — no fabricated graph
    const types: OntologyType[] = [...typeCounts].map(([id, count]) => ({ id, name: id, count }));
    return { types, schemaRelations: [], entities: [...entities.values()], facts, passages };
}

export function makeExtractionAgent(llm: LlmBundle | null): ExtractionAgent {
    return {
        extract: (doc) => (llm && llm.active ? llmExtract(doc, llm) : Promise.resolve(localExtract(doc))),
    };
}

const RESOLVE_SYSTEM =
    'You are a conflict-resolution judge. Given contradictory facts and their source passages, pick the single fact id best supported by the evidence. ' +
    'Respond with JSON ONLY: {"winnerId":string,"reason":string}.';

export function makeConflictResolver(llm: LlmBundle | null): ConflictResolverAgent {
    return {
        async resolve(conflict: FactConflict, passages: Passage[]): Promise<ConflictResolution> {
            if (!llm || !llm.active) return resolveConflictLocal(conflict, passages);
            try {
                const evidence = conflict.facts
                    .map((f) => `- factId=${f.id} claims ${f.subjectId} ${f.predicate} ${f.objectLiteral ?? f.objectId} [passage: ${passages.find((p) => p.id === f.passageId)?.text?.slice(0, 200) ?? 'n/a'}]`)
                    .join('\n');
                const res = await callLlm({ prompt: evidence, systemPrompt: RESOLVE_SYSTEM, responseFormat: 'json', temperature: 0 }, llm);
                const parsed = res?.text ? parseJsonLoose(res.text) : null;
                const winnerId = parsed?.winnerId;
                if (winnerId && conflict.facts.some((f) => f.id === winnerId)) {
                    return { conflict, winnerId, losers: conflict.facts.filter((f) => f.id !== winnerId).map((f) => f.id), reason: String(parsed.reason || 'LLM evidence judgement') };
                }
            } catch { /* fall through to local */ }
            return resolveConflictLocal(conflict, passages);
        },
    };
}
