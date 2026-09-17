/**
 * Cognitive Memory Network — the ONE engine instance the whole app shares.
 *
 * Before this file every MemoryGraphRAG widget mount built a private, in-memory
 * engine: nothing persisted, nothing else in the app could write to or read
 * from it, and the HUD invented its telemetry. This module is the app-wide
 * layer:
 *
 *   - one engine per signed-in user (`getCmn(userId)`), shared by every caller
 *   - persisted to localStorage and re-hydrated on load
 *   - de-duplicated ingestion, so background feeders can re-offer the same
 *     documents cheaply
 *   - MEASURED metrics + a real event log (no fabricated numbers)
 *   - a real liveness probe for System Health
 *
 * Pure TS (no React). React callers use `subscribe` + `getVersion` with
 * `useSyncExternalStore`.
 */
import { createMemoryGraphRagEngine, type MemoryGraphRagEngine, type MemoryGraphRagOptions, type MemorySnapshot } from './index';
import type { SourceDocument, QueryAnswer, RetrievalResult } from './types';

type LlmBundle = MemoryGraphRagOptions['llm'];

export type CmnEventKind = 'hydrate' | 'ingest' | 'query' | 'conflict' | 'persist' | 'reset';
export interface CmnEvent {
    at: number;
    kind: CmnEventKind;
    detail: string;
    source?: string;
    ms?: number;
}

/** `ok` saved · `empty` nothing to save yet · `full` quota exceeded (memory is NOT saved) · `unavailable` no localStorage. */
export type CmnPersistState = 'ok' | 'empty' | 'full' | 'unavailable';

export interface CmnMetrics {
    counts: ReturnType<MemoryGraphRagEngine['store']['counts']>;
    bridges: number;
    documents: number;
    ingests: number;
    queries: number;
    lastIngestMs: number | null;
    lastQueryMs: number | null;
    conflictsResolved: number;
    persist: CmnPersistState;
    persistedBytes: number;
    hydrated: boolean;
    events: CmnEvent[];
}

export interface CmnProbe { ok: boolean; detail: string; }

interface PersistedV1 { v: 1; snapshot: MemorySnapshot; seen: Record<string, string>; }

const KEY_PREFIX = 'dwellium-cmn-v1:';
const MAX_EVENTS = 50;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** djb2 over the text — change detection only, not security. */
function textHash(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return `${s.length}:${h >>> 0}`;
}

function storage(): Storage | null {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export class CognitiveMemoryNetwork {
    engine: MemoryGraphRagEngine;
    /** Resolves once the persisted snapshot is loaded and bridges are rebuilt. */
    ready: Promise<void>;

    private llm: LlmBundle;
    private seen: Record<string, string> = {};
    private listeners = new Set<() => void>();
    private version = 0;
    private events: CmnEvent[] = [];
    private ingests = 0;
    private queries = 0;
    private lastIngestMs: number | null = null;
    private lastQueryMs: number | null = null;
    private conflictsResolved = 0;
    private persist: CmnPersistState = 'empty';
    private persistedBytes = 0;
    private hydrated = false;
    private queue: Promise<unknown> = Promise.resolve();

    constructor(readonly userKey: string, llm: LlmBundle = null) {
        this.llm = llm;
        this.engine = createMemoryGraphRagEngine({ llm });
        this.ready = this.hydrate();
    }

    // ── subscription (useSyncExternalStore-shaped) ────────────────────
    subscribe = (cb: () => void): (() => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
    getVersion = (): number => this.version;
    private emit(): void { this.version++; this.listeners.forEach((l) => l()); }

    private log(kind: CmnEventKind, detail: string, extra: Partial<CmnEvent> = {}): void {
        this.events = [{ at: Date.now(), kind, detail, ...extra }, ...this.events].slice(0, MAX_EVENTS);
    }

    private get storageKey(): string { return KEY_PREFIX + this.userKey; }

    // ── persistence ───────────────────────────────────────────────────
    private async hydrate(): Promise<void> {
        const ls = storage();
        if (!ls) { this.persist = 'unavailable'; return; }
        try {
            const raw = ls.getItem(this.storageKey);
            if (!raw) return;
            const data = JSON.parse(raw) as PersistedV1;
            if (data?.v !== 1 || !data.snapshot) return;
            this.engine.loadSnapshot(data.snapshot);
            this.seen = data.seen ?? {};
            await this.engine.rebuild();
            this.persist = 'ok';
            this.persistedBytes = raw.length;
            this.hydrated = true;
            const c = this.engine.store.counts();
            this.log('hydrate', `Restored ${c.passages} passages, ${c.entities} entities, ${c.facts} facts`);
            this.emit();
        } catch {
            // Corrupt payload: keep it on disk (never auto-delete user data), start empty in memory.
            this.log('hydrate', 'Saved memory could not be read; starting empty (saved copy left untouched)');
        }
    }

    private save(): void {
        const ls = storage();
        if (!ls) { this.persist = 'unavailable'; return; }
        const payload: PersistedV1 = { v: 1, snapshot: this.engine.snapshot(), seen: this.seen };
        try {
            // ponytail: localStorage (~5 MB/origin). Move to IndexedDB when users hit `full`.
            const raw = JSON.stringify(payload);
            ls.setItem(this.storageKey, raw);
            this.persist = 'ok';
            this.persistedBytes = raw.length;
        } catch {
            this.persist = 'full';
            this.log('persist', 'Browser storage is full — new memory is NOT being saved');
        }
    }

    // ── operations (serialized: ingest + rebuild mutate shared state) ─
    private enqueue<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.queue.then(fn, fn);
        this.queue = run.catch(() => undefined);
        return run;
    }

    /**
     * Ingest documents not seen before (or whose text changed). `offline` forces
     * the heuristic extractor so background feeders never spend the LLM key.
     */
    ingest(docs: SourceDocument[], source: string, opts: { offline?: boolean } = {}): Promise<{ ingested: number; skipped: number }> {
        return this.enqueue(async () => {
            await this.ready;
            const fresh = docs.filter((d) => d.text?.trim() && this.seen[d.sourceId] !== textHash(d.text));
            const skipped = docs.length - fresh.length;
            if (fresh.length === 0) return { ingested: 0, skipped };
            const t0 = now();
            await this.engine.ingest(fresh, opts);
            // ponytail: a re-ingested doc that SHRANK leaves its old higher-index passages behind.
            for (const d of fresh) this.seen[d.sourceId] = textHash(d.text);
            this.lastIngestMs = Math.round(now() - t0);
            this.ingests++;
            const resolved = this.engine.lastResolutions.length;
            if (resolved > 0) {
                this.conflictsResolved += resolved;
                this.log('conflict', `${resolved} contradicting fact(s) resolved`, { source });
            }
            this.log('ingest', `+${fresh.length} doc(s)${skipped ? `, ${skipped} unchanged` : ''}`, { source, ms: this.lastIngestMs });
            this.save();
            this.emit();
            return { ingested: fresh.length, skipped };
        });
    }

    answer(query: string, limit?: number): Promise<QueryAnswer> {
        return this.enqueue(async () => {
            await this.ready;
            const t0 = now();
            const a = await this.engine.answer(query, limit);
            this.lastQueryMs = Math.round(now() - t0);
            this.queries++;
            this.log('query', `"${query.slice(0, 60)}" → ${a.rankedPassages.length} passage(s)${a.generatedByLlm ? ' + LLM answer' : ''}`, { ms: this.lastQueryMs });
            this.emit();
            return a;
        });
    }

    /** Retrieval only (no LLM, no spend) — what other widgets/agents call for context. */
    recall(query: string, limit = 5): RetrievalResult {
        const t0 = now();
        const r = this.engine.retrieve(query, limit);
        this.lastQueryMs = Math.round(now() - t0);
        this.queries++;
        this.log('query', `recall "${query.slice(0, 60)}" → ${r.rankedPassages.length} passage(s)`, { ms: this.lastQueryMs });
        this.emit();
        return r;
    }

    /** Swap the LLM bundle (user changed keys) without losing memory. */
    setLlm(llm: LlmBundle): void {
        if (llm === this.llm) return;
        this.llm = llm;
        void this.enqueue(async () => {
            await this.ready;
            const snap = this.engine.snapshot();
            this.engine = createMemoryGraphRagEngine({ llm });
            this.engine.loadSnapshot(snap);
            await this.engine.rebuild();
            this.emit();
        });
    }

    /** USER-INITIATED ONLY (the widget's Reset button). Clears memory and its saved copy. */
    reset(): Promise<void> {
        return this.enqueue(async () => {
            this.engine = createMemoryGraphRagEngine({ llm: this.llm });
            this.seen = {};
            try { storage()?.removeItem(this.storageKey); } catch { /* ignore */ }
            this.persist = storage() ? 'empty' : 'unavailable';
            this.persistedBytes = 0;
            this.log('reset', 'Memory cleared by user');
            this.emit();
        });
    }

    metrics(): CmnMetrics {
        return {
            counts: this.engine.store.counts(),
            bridges: this.engine.bridges.length,
            documents: Object.keys(this.seen).length,
            ingests: this.ingests,
            queries: this.queries,
            lastIngestMs: this.lastIngestMs,
            lastQueryMs: this.lastQueryMs,
            conflictsResolved: this.conflictsResolved,
            persist: this.persist,
            persistedBytes: this.persistedBytes,
            hydrated: this.hydrated,
            events: this.events,
        };
    }

    /** Real liveness check: the store answers, retrieval runs, storage is writable. */
    probe(): CmnProbe {
        try {
            this.engine.store.counts();
            this.engine.retrieve('cmn-health-probe', 1);
        } catch (e: any) {
            return { ok: false, detail: `Engine error: ${e?.message || e}` };
        }
        if (this.persist === 'full') return { ok: false, detail: 'Browser storage is full — memory is not being saved' };
        if (this.persist === 'unavailable') return { ok: false, detail: 'Browser storage unavailable — memory will not survive a reload' };
        const c = this.engine.store.counts();
        return { ok: true, detail: `${c.passages} passages · ${c.entities} entities · ${c.facts} facts` };
    }
}

// ── per-user singleton ────────────────────────────────────────────────
let current: CognitiveMemoryNetwork | null = null;

/** The shared network for this user. Switching users swaps the instance (Andy ≠ Lisa). */
export function getCmn(userId: string | null | undefined, llm?: LlmBundle): CognitiveMemoryNetwork {
    const key = userId || '_anonymous';
    if (!current || current.userKey !== key) current = new CognitiveMemoryNetwork(key, llm ?? null);
    else if (llm !== undefined) current.setLlm(llm);
    return current;
}

/** The live instance, if any caller has created one (System Health reads this; it never creates). */
export function peekCmn(): CognitiveMemoryNetwork | null { return current; }

/** Test escape hatch — mirrors the factory stores' `.reset()` convention. */
export function resetCmnForTests(): void { current = null; }
