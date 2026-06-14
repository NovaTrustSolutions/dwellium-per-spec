/**
 * MemoryGraphRAG — three-layer memory Graph-RAG widget.
 *
 * Drives the local-first engine in src/lib/memoryGraphRag: ingest documents
 * (paste/upload, Tag File, open Scribe docs) → multi-agent extraction populates
 * the Ontology / Fact / Passage layers → type + similarity bridging →
 * conflict resolution → Personalized-PageRank retrieval → grounded answer.
 *
 * Uses the per-user LLM (llmClient) when configured, and a deterministic
 * offline heuristic otherwise — so it works fully local-first. The engine lives
 * in a ref; counts/views read from its store and re-render on a version bump.
 */
import { useCallback, useContext, useRef, useState } from 'react';
import { UserContext } from '../../context/UserContext';
import { API_BASE } from '../../config';
import { useIntegrations } from '../../hooks/useIntegrations';
import { hasActiveLlm } from '../../lib/llmClient';
import { getTaggedItems, tagStoreUserIdHolder } from '../../lib/tagStore';
import { foundryStore, foundryUserIdHolder } from '../Foundry/foundryStore';
import { synthesisStore, synthesisUserIdHolder } from '../Synthesis/synthesisStore';
import { useScribeStore } from '../Scribe/scribeStore';
import {
    createMemoryGraphRagEngine, type MemoryGraphRagEngine,
    type SourceDocument, type QueryAnswer, type ConflictResolution,
} from '../../lib/memoryGraphRag';
import MemoryGraphView from './MemoryGraphView';
import { DEMO_DOCS, DEMO_QUESTIONS } from './demoCorpus';
import './MemoryGraphRAG.css';

export default function MemoryGraphRAG() {
    const { integrations } = useIntegrations();
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    const llmReady = hasActiveLlm(integrations.llm);
    const engineRef = useRef<MemoryGraphRagEngine | null>(null);
    const [, force] = useState(0);
    const bump = () => force((n) => n + 1);

    const [pasteTitle, setPasteTitle] = useState('');
    const [pasteText, setPasteText] = useState('');
    const [query, setQuery] = useState('');
    const [answer, setAnswer] = useState<QueryAnswer | null>(null);
    const [view, setView] = useState<'graph' | 'panels'>('graph');
    const [sourceFilter, setSourceFilter] = useState<string>('all');
    const [busy, setBusy] = useState('');
    const [toast, setToast] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const getEngine = useCallback((): MemoryGraphRagEngine => {
        if (!engineRef.current) {
            engineRef.current = createMemoryGraphRagEngine({ llm: integrations.llm });
        }
        return engineRef.current;
    }, [integrations.llm]);

    const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

    const ingest = useCallback(async (docs: SourceDocument[], label: string) => {
        const real = docs.filter((d) => d.text && d.text.trim());
        if (real.length === 0) { flash('Nothing to ingest'); return; }
        setBusy(`Ingesting ${real.length} doc(s)…`);
        try {
            await getEngine().ingest(real);
            bump();
            const c = getEngine().store.counts();
            flash(`${label}: +${real.length} doc(s) → ${c.entities} entities, ${c.facts} facts, ${c.passages} passages`);
        } catch (e: any) {
            flash(`Ingest failed: ${e?.message || e}`);
        } finally { setBusy(''); }
    }, [getEngine]);

    const ingestPaste = () => {
        if (!pasteText.trim()) { flash('Paste some text first'); return; }
        void ingest([{ sourceId: `paste-${Date.now()}`, sourceKind: 'upload', title: pasteTitle.trim() || 'Pasted text', text: pasteText }], 'Pasted');
        setPasteText(''); setPasteTitle('');
    };

    // Demo: import a small built-in set of files so the graph populates instantly
    // and you can immediately ask questions about them (prefills a sample query).
    const loadDemo = () => {
        setQuery(DEMO_QUESTIONS[0]);
        void ingest(DEMO_DOCS, 'Demo files');
    };

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        const docs: SourceDocument[] = [];
        for (const f of files) {
            const text = await f.text().catch(() => '');
            docs.push({ sourceId: `file:${f.name}`, sourceKind: 'upload', title: f.name, text });
        }
        void ingest(docs, 'Uploaded');
    };

    const pullTags = () => {
        tagStoreUserIdHolder.current = uid;
        const items = getTaggedItems();
        const docs: SourceDocument[] = items.map((it) => ({
            sourceId: `tag:${it.id}`, sourceKind: 'tag', title: it.title,
            text: `${it.title}. Tags: ${it.tags.join(', ')}. Source: ${it.source}.`,
        }));
        void ingest(docs, 'Tag File');
    };

    const pullScribe = () => {
        const openFiles = useScribeStore.getState().openFiles;
        const docs: SourceDocument[] = openFiles.map((f) => ({
            sourceId: `scribe:${f.filepath}`, sourceKind: 'scribe', title: f.filepath.split('/').pop() || f.filepath, text: f.content || '',
        }));
        void ingest(docs, 'Scribe docs');
    };

    // Captures: Foundry intake items + captured Syntheses (per-user local stores).
    const pullCaptures = () => {
        foundryUserIdHolder.current = uid;
        synthesisUserIdHolder.current = uid;
        const foundry = foundryStore.getSnapshot();
        const synth = synthesisStore.getSnapshot();
        const docs: SourceDocument[] = [
            ...foundry.map((it) => ({ sourceId: `foundry:${it.id}`, sourceKind: 'capture' as const, title: (it.rawContent || '').slice(0, 60) || 'Capture', text: it.rawContent || '' })),
            ...synth.map((s) => ({ sourceId: `synthesis:${s.id}`, sourceKind: 'synthesis' as const, title: s.query || 'Synthesis', text: `${s.query}\n\n${s.result}` })),
        ];
        void ingest(docs, 'Captures');
    };

    // Transcripts: TranscriptionHub saved logs (backend — graceful when offline).
    const pullTranscripts = () => {
        void (async () => {
            setBusy('Fetching transcripts…');
            try {
                const res = await fetch(`${API_BASE}/api/transcribe/logs?limit=200`);
                if (!res.ok) throw new Error(`backend ${res.status}`);
                const json = await res.json();
                const logs = json.data || json.logs || [];
                const docs: SourceDocument[] = logs.map((log: any) => ({
                    sourceId: `transcript:${log.id}`,
                    sourceKind: 'transcript' as const,
                    title: log.title || 'Transcript',
                    text: log.transcript || (Array.isArray(log.segments) ? log.segments.map((s: any) => s.text || '').join(' ') : '') || log.title || '',
                }));
                await ingest(docs, 'Transcripts');
            } catch (e: any) {
                flash(`Transcripts need the backend (offline): ${e?.message || e}`);
                setBusy('');
            }
        })();
    };

    // Workspace docs: the backend file store (text/markdown). Graceful when offline.
    const pullWorkspace = () => {
        void (async () => {
            setBusy('Fetching workspace files…');
            try {
                const res = await fetch(`${API_BASE}/files?limit=50`);
                if (!res.ok) throw new Error(`backend ${res.status}`);
                const json = await res.json();
                const files = (json.data || json.files || []).filter((f: any) =>
                    /\.(md|markdown|txt|csv|json)$/i.test(f.name || f.fileName || '') || (f.type || '').includes('text'));
                const docs: SourceDocument[] = [];
                for (const f of files.slice(0, 25)) {
                    try {
                        const c = await fetch(`${API_BASE}/files/${f.id}`);
                        if (!c.ok) continue;
                        docs.push({ sourceId: `workspace:${f.id}`, sourceKind: 'workspace' as const, title: f.name || f.fileName || String(f.id), text: await c.text() });
                    } catch { /* skip unreadable file */ }
                }
                await ingest(docs, 'Workspace files');
            } catch (e: any) {
                flash(`Workspace files need the backend (offline): ${e?.message || e}`);
                setBusy('');
            }
        })();
    };

    const ask = useCallback(async () => {
        if (!query.trim()) return;
        if (!engineRef.current || engineRef.current.store.counts().passages === 0) { flash('Ingest documents first'); return; }
        setBusy('Retrieving + answering…');
        try {
            const a = await getEngine().answer(query.trim());
            setAnswer(a);
        } catch (e: any) {
            flash(`Query failed: ${e?.message || e}`);
        } finally { setBusy(''); }
    }, [query, getEngine]);

    const reset = () => { engineRef.current = createMemoryGraphRagEngine({ llm: integrations.llm }); setAnswer(null); bump(); flash('Memory reset'); };

    const engine = engineRef.current;
    const counts = engine?.store.counts() ?? { types: 0, schemaRelations: 0, entities: 0, facts: 0, passages: 0 };
    const types = engine ? [...engine.store.types.values()].sort((a, b) => b.count - a.count).slice(0, 12) : [];
    const facts = engine ? [...engine.store.facts.values()].slice(0, 14) : [];
    const passages = engine ? [...engine.store.passages.values()].slice(0, 10) : [];
    const resolutions: ConflictResolution[] = engine?.lastResolutions ?? [];
    const entName = (id: string) => engine?.store.entities.get(id)?.name ?? id;

    // Full graph data for the layered visualization (the panels above use slices).
    const scene = {
        types: engine ? [...engine.store.types.values()] : [],
        schemaRelations: engine ? [...engine.store.schemaRelations.values()] : [],
        entities: engine ? [...engine.store.entities.values()] : [],
        facts: engine ? [...engine.store.facts.values()] : [],
        passages: engine ? [...engine.store.passages.values()] : [],
        bridges: engine?.bridges ?? [],
        resolutions,
        nodeScores: answer?.nodeScores ?? null,
        rankedPassageIds: answer?.rankedPassages.map((rp) => rp.passage.id) ?? [],
    };

    // ── "Files indexed" header stats (image-1 spec) ──
    // Distinct source documents across all ingested passages = files indexed.
    const sourceIds = new Set<string>();
    for (const p of scene.passages as Array<{ sourceId?: string; source?: string; docId?: string }>) {
        const s = p.sourceId ?? p.source ?? p.docId;
        if (s) sourceIds.add(String(s));
    }
    const filesIndexed = sourceIds.size || scene.passages.length;
    // Source "kinds" (prefix before ':' in sourceId) → filter chips (All + each kind).
    const kinds = [...new Set([...sourceIds].map((s) => (s.includes(':') ? s.split(':')[0] : 'local')))];
    const KIND_LABEL: Record<string, string> = { file: 'Files', upload: 'Uploads', tag: 'Tag File', scribe: 'Scribe', capture: 'Captures', foundry: 'Captures', synthesis: 'Synthesis', transcript: 'Transcripts', workspace: 'Workspace', local: 'Local', demo: 'Demo' };
    const passageKind = (p: { sourceId?: string; source?: string; docId?: string }) => {
        const s = p.sourceId ?? p.source ?? p.docId ?? '';
        return s.includes(':') ? s.split(':')[0] : 'local';
    };
    const visiblePassages = sourceFilter === 'all' ? scene.passages : scene.passages.filter((p) => passageKind(p) === sourceFilter);

    return (
        <div className="mgr">
            <input ref={fileRef} type="file" accept=".txt,.md,.json,.csv" multiple hidden onChange={onFile} />

            <div className="mgr__head">
                <div className="mgr__title">🌍 Cognitive M Network</div>
                <span className={`mgr__llm ${llmReady ? 'is-on' : ''}`}>{llmReady ? `LLM: ${integrations.llm.active}` : 'Offline (heuristic) mode'}</span>
                <div className="mgr__spacer" />
                <div className="mgr__viewtoggle" role="tablist" aria-label="View">
                    <button className={`mgr__seg ${view === 'graph' ? 'is-active' : ''}`} role="tab" aria-selected={view === 'graph'} onClick={() => setView('graph')}>◈ Network</button>
                    <button className={`mgr__seg ${view === 'panels' ? 'is-active' : ''}`} role="tab" aria-selected={view === 'panels'} onClick={() => setView('panels')}>☰ Panels</button>
                </div>
                <span className="mgr__counts">{counts.entities} ent · {counts.facts} facts · {counts.passages} psg · {counts.types} types</span>
                <button className="mgr__btn" onClick={reset}>Reset</button>
            </div>

            {/* ── Files-indexed header band (image-1 spec) ── */}
            <div className="mgr__indexed">
                <div className="mgr__indexed-hero">
                    <span className="mgr__indexed-num">{filesIndexed}</span>
                    <div className="mgr__indexed-meta">
                        <span className="mgr__indexed-label">files indexed</span>
                        <span className="mgr__indexed-sub">One shared brain · {counts.entities} entities · {counts.facts} facts mapped across your corpus</span>
                    </div>
                </div>
                <div className="mgr__indexed-stats">
                    <div className="mgr__stat"><span className="mgr__stat-n">{counts.entities}</span><span className="mgr__stat-l">Active</span></div>
                    <div className="mgr__stat"><span className="mgr__stat-n">{counts.facts}</span><span className="mgr__stat-l">Activated</span></div>
                    <div className="mgr__stat"><span className="mgr__stat-n">{kinds.length}</span><span className="mgr__stat-l">Memory sources</span></div>
                    <div className="mgr__stat"><span className="mgr__stat-n">{counts.passages}</span><span className="mgr__stat-l">Passages</span></div>
                </div>
                {kinds.length > 0 && (
                    <div className="mgr__chips" role="group" aria-label="Memory sources">
                        <button className={`mgr__sourcechip ${sourceFilter === 'all' ? 'is-active' : ''}`} onClick={() => setSourceFilter('all')}>All</button>
                        {kinds.map((k) => (
                            <button key={k} className={`mgr__sourcechip ${sourceFilter === k ? 'is-active' : ''}`} onClick={() => setSourceFilter(k)}>{KIND_LABEL[k] ?? k}</button>
                        ))}
                    </div>
                )}
            </div>

            {/* Ingest */}
            <div className="mgr__ingest">
                <input className="mgr__inp" placeholder="Title (optional)" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} />
                <textarea className="mgr__ta" placeholder="Paste text to ingest into the three-layer memory…" value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={3} />
                <div className="mgr__row">
                    <button className="mgr__btn mgr__btn--primary" onClick={loadDemo} disabled={!!busy} title="Import a few sample files so you can ask questions right away">🌍 Load demo</button>
                    <button className="mgr__btn" onClick={ingestPaste} disabled={!!busy}>Ingest text</button>
                    <button className="mgr__btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>Upload files</button>
                    <button className="mgr__btn" onClick={pullTags} disabled={!!busy}>Pull Tag File</button>
                    <button className="mgr__btn" onClick={pullScribe} disabled={!!busy}>Pull Scribe docs</button>
                    <button className="mgr__btn" onClick={pullCaptures} disabled={!!busy}>Pull Captures</button>
                    <button className="mgr__btn" onClick={pullTranscripts} disabled={!!busy}>Pull Transcripts</button>
                    <button className="mgr__btn" onClick={pullWorkspace} disabled={!!busy}>Pull Workspace files</button>
                    {busy && <span className="mgr__busy">⏳ {busy}</span>}
                </div>
            </div>

            {/* Layered visualization (Cognitive Memory Network) — default view */}
            {view === 'graph' && (
                <MemoryGraphView
                    types={scene.types}
                    schemaRelations={scene.schemaRelations}
                    entities={scene.entities}
                    facts={scene.facts}
                    passages={visiblePassages}
                    bridges={scene.bridges}
                    resolutions={scene.resolutions}
                    nodeScores={scene.nodeScores}
                    rankedPassageIds={scene.rankedPassageIds}
                    query={query}
                    llmActive={llmReady}
                />
            )}

            {/* Three interconnected layer views */}
            {view === 'panels' && (
            <div className="mgr__layers">
                <section className="mgr__layer">
                    <h4>Ontology · schema</h4>
                    {types.length === 0 ? <p className="mgr__empty">No types yet</p> : types.map((t) => (
                        <div key={t.id} className="mgr__chip"><span>{t.name}</span><span className="mgr__count">{t.count}</span></div>
                    ))}
                    <div className="mgr__meta">{counts.schemaRelations} schema relations</div>
                </section>
                <section className="mgr__layer">
                    <h4>Facts · triplets</h4>
                    {facts.length === 0 ? <p className="mgr__empty">No facts yet</p> : facts.map((f) => (
                        <div key={f.id} className="mgr__fact">
                            <b>{entName(f.subjectId)}</b> <i>{f.predicate}</i> {f.objectLiteral ?? entName(f.objectId)}
                        </div>
                    ))}
                </section>
                <section className="mgr__layer">
                    <h4>Passages · evidence</h4>
                    {passages.length === 0 ? <p className="mgr__empty">No passages yet</p> : passages.map((p) => (
                        <div key={p.id} className="mgr__psg" title={p.text}>
                            <span className="mgr__src">{p.sourceKind}</span> {p.title || p.sourceId}
                            <div className="mgr__psg-text">{p.text.slice(0, 110)}{p.text.length > 110 ? '…' : ''}</div>
                        </div>
                    ))}
                </section>
            </div>
            )}

            {resolutions.length > 0 && (
                <div className="mgr__conflicts">⚖ Resolved {resolutions.length} conflict(s): {resolutions.map((r) => r.reason).join(' · ')}</div>
            )}

            {/* Query */}
            <div className="mgr__query">
                <input className="mgr__inp" placeholder="Ask a question over the memory graph…" value={query}
                    onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }} />
                <button className="mgr__btn mgr__btn--primary" onClick={() => void ask()} disabled={!!busy}>Ask</button>
            </div>

            {answer && (
                <div className="mgr__answer">
                    <div className="mgr__answer-head">{answer.generatedByLlm ? '✦ Answer' : '✦ Top passages (offline)'}</div>
                    <div className="mgr__answer-body">{answer.answer}</div>
                    {answer.rankedPassages.length > 0 && (
                        <div className="mgr__evidence">
                            <div className="mgr__evidence-head">Evidence (PageRank-ranked)</div>
                            {answer.rankedPassages.map((rp, i) => (
                                <div key={rp.passage.id} className="mgr__ev">
                                    <span className="mgr__ev-n">[{i + 1}]</span>
                                    <span className="mgr__src">{rp.passage.sourceKind}</span>
                                    <span className="mgr__ev-text">{rp.passage.text.slice(0, 160)}{rp.passage.text.length > 160 ? '…' : ''}</span>
                                    <span className="mgr__ev-score">{rp.score.toFixed(3)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {toast && <div className="mgr__toast">{toast}</div>}
        </div>
    );
}
