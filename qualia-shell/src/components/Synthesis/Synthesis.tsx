/**
 * Synthesis — the Synthesis / compounding-loop widget (spec §7.3).
 *
 * Ask → grounded in saved sources (Cognitive Memory Network) → Synthesize →
 * Capture (feed back into the corpus) → one-click Second-layer query
 * (re-query using the first synthesis + fresh sources as added context).
 * Runs client-side via `callLlm`; captured syntheses persist per-user.
 *
 * The on-screen answer is tracked separately from the query textarea (plan
 * 070 B3/C1): editing the textarea after a run never changes what Capture
 * saves, and a failed/empty run leaves the previous answer exactly as it was.
 *
 * Plan 070 phase 2: a live source preview (debounced recallPassages) lets the
 * user see and uncheck what will ground the answer before it's sent; the
 * grounded prompt is built by synthesisContext.buildGroundedPrompt; runs are
 * cancellable; citations in the rendered answer open their source widget.
 */
import { useState, useSyncExternalStore, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { UserContext } from '../../context/UserContext';
import { Sparkles, RefreshCw, Save, Layers, Trash2, TriangleAlert, X } from 'lucide-react';
import { usePerUserIdentity, captureOwner } from '../../lib/perUserIdentity';
import { TagInput } from '../Tags/TagInput';
import { useIntegrations } from '../../hooks/useIntegrations';
import { useAIAvailability } from '../../hooks/useAIAvailability';
import AIDegradedState from '../Shell/AIDegradedState';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { recallPassages, type RecalledPassage } from '../../lib/memoryGraphRag/recall';
import { buildGroundedPrompt, sourceWidget } from './synthesisContext';
import {
    synthesisStore, captureSynthesis, removeSynthesis, clearSyntheses,
    newSynthesisId, buildSecondLayerPrompt, type Synthesis as SynthesisEntry, type SynthesisSource,
} from './synthesisStore';
import { captureFacts } from '../Hive/copawStore';

const ACCENT = '#D6FE51';
const MIN_QUERY_CHARS = 3;
const PREVIEW_DEBOUNCE_MS = 300;

const SR_ONLY: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };

const SYSTEM_PROMPT = 'You are a synthesis engine. Given a question (and any provided prior context and numbered sources), produce a concise, well-structured synthesis in Markdown. When numbered sources are provided, cite them inline as [1], [2]… where they ground a claim; when they do not cover part of the question, say so and answer from general knowledge, flagged as such. Flag other assumptions too, and end with the most important open question.';

/** The answer currently on screen — independent of the (editable) query textarea. */
interface Answer {
    id: string;
    query: string;
    result: string;
    layer: number;
    parentId: string | null;
    followUp?: string;
    sources?: SynthesisSource[];
    truncated?: boolean;
}

function openWidget(widget: string) {
    window.dispatchEvent(new CustomEvent('qualia-open-widget', { detail: widget }));
}

/** Render `text` with `[n]` tokens (1..sources.length) turned into inline citation buttons. */
function renderAnswerText(text: string, sources: SynthesisSource[] | undefined) {
    if (!sources || sources.length === 0) return text;
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const n = parseInt(m[1], 10);
        if (n < 1 || n > sources.length) return <span key={i}>{part}</span>;
        const src = sources[n - 1];
        const widget = sourceWidget(src.sourceKind);
        return (
            <button
                key={i}
                type="button"
                disabled={!widget}
                aria-label={`Open source ${n}: ${src.title || '(untitled)'}`}
                title={widget ? (src.title || '(untitled)') : 'No widget opens this source'}
                onClick={() => widget && openWidget(widget)}
                style={{ display: 'inline', border: 'none', background: 'none', padding: 0, font: 'inherit', textDecoration: 'underline dotted', color: widget ? ACCENT : '#666', cursor: widget ? 'pointer' : 'default' }}
            >{part}</button>
        );
    });
}

export default function Synthesis() {
    usePerUserIdentity();
    const { integrations } = useIntegrations();
    const ai = useAIAvailability();
    const llmReady = hasActiveLlm(integrations.llm);
    const history: SynthesisEntry[] = useSyncExternalStore(synthesisStore.subscribe, synthesisStore.getSnapshot, synthesisStore.getServerSnapshot);

    const [query, setQuery] = useState('');
    const [answer, setAnswer] = useState<Answer | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [focusText, setFocusText] = useState('');

    // Source preview (debounced recallPassages over the question textarea).
    const [previewSources, setPreviewSources] = useState<RecalledPassage[]>([]);
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
    const requestSeqRef = useRef(0);

    const abortRef = useRef<AbortController | null>(null);
    useEffect(() => () => { abortRef.current?.abort(); }, []);

    // Account switch (UserContext changes without a remount): drop everything the
    // previous user had on screen so the next user can't see or Capture it.
    const uid = useContext(UserContext)?.user?.id ?? null;
    const [shownFor, setShownFor] = useState(uid);
    if (shownFor !== uid) {
        setShownFor(uid);
        setAnswer(null);
        setQuery('');
        setErr('');
        setFocusText('');
        setPreviewSources([]);
        setChecked({});
        setSearchedQuery(null);
    }

    // Debounced source preview — never blocks typing; ignores stale responses
    // (request counter) and responses that land after an account switch.
    useEffect(() => {
        const q = query.trim();
        if (q.replace(/\s+/g, '').length < MIN_QUERY_CHARS) {
            requestSeqRef.current++;
            setPreviewSources([]);
            setChecked({});
            setSearchedQuery(null);
            return;
        }
        const seq = ++requestSeqRef.current;
        const stillOwner = captureOwner();
        const timer = setTimeout(() => {
            void recallPassages(uid, q, { limit: 6, silent: true }).then((res) => {
                if (seq !== requestSeqRef.current || !stillOwner()) return; // stale query or account switched
                setPreviewSources(res);
                setSearchedQuery(q);
                // Keep the user's unticks for sources that are still in the list.
                setChecked((prev) => {
                    const next: Record<string, boolean> = {};
                    res.forEach((rp) => { next[rp.passageId] = prev[rp.passageId] ?? true; });
                    return next;
                });
            });
        }, PREVIEW_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [query, uid]);

    const checkedSources = useMemo(
        () => previewSources.filter((rp) => checked[rp.passageId] !== false),
        [previewSources, checked],
    );

    const captured = answer ? history.some((h) => h.id === answer.id) : false;

    type Prepared = { prompt: string; pending: { id: string; query: string; layer: number; parentId: string | null; followUp?: string }; used: RecalledPassage[] };

    /**
     * One run path for both passes. Busy, Cancel and the owner check cover the
     * source lookup AND the LLM call, so Cancel during retrieval stops the paid
     * call from ever going out, and nothing leaves busy stuck on.
     */
    const runSynthesis = useCallback(async (prepare: () => Promise<Prepared>) => {
        if (!hasActiveLlm(integrations.llm)) { setErr('No LLM configured — add a key above.'); return; }
        setBusy(true); setErr('');
        const stillOwner = captureOwner();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const { prompt, pending, used } = await prepare();
            if (controller.signal.aborted || !stillOwner()) return; // cancelled / account switched during retrieval
            const res = await callLlm({
                systemPrompt: SYSTEM_PROMPT,
                prompt,
                maxTokens: 1200,
                temperature: 0.4,
                source: 'synthesis',
                signal: controller.signal,
            }, integrations.llm);
            if (!stillOwner()) return; // account switched mid-run — drop, never show/store the old owner's answer
            if (res && res.text.trim()) {
                setAnswer({
                    id: pending.id, query: pending.query, result: res.text.trim(), layer: pending.layer, parentId: pending.parentId,
                    followUp: pending.followUp,
                    sources: used.map(({ sourceId, sourceKind, title }) => ({ sourceId, sourceKind, title })),
                    truncated: !!res.truncated,
                });
            } else {
                setErr('The LLM returned an empty synthesis.');
            }
        } catch (e: any) {
            if (e?.name === 'AbortError') return; // cancelled — no error banner, previous answer untouched
            if (!stillOwner()) return;
            setErr(e?.message || 'Synthesis failed.');
        } finally {
            setBusy(false);
            if (abortRef.current === controller) abortRef.current = null;
        }
    }, [integrations.llm]);

    const onSynthesize = () => {
        const q = query.trim();
        if (!q || busy) return;
        // The preview may lag the textarea (debounce / slow recall): never send
        // sources that were found for a different question — look up fresh ones.
        const previewCurrent = searchedQuery === q;
        const picked = checkedSources;
        void runSynthesis(async () => {
            const sources = previewCurrent ? picked : await recallPassages(uid, q, { limit: 6 });
            const { prompt, used } = buildGroundedPrompt(q, sources);
            return { prompt, pending: { id: newSynthesisId(), query: q, layer: 1, parentId: null }, used };
        });
    };

    const onCancel = () => { abortRef.current?.abort(); };

    const onCapture = () => {
        if (!answer || busy || captured) return;
        const res = captureSynthesis({ id: answer.id, query: answer.query, result: answer.result, layer: answer.layer, parentId: answer.parentId, followUp: answer.followUp, sources: answer.sources });
        if (res.ok) {
            captureFacts('Synthesis Lab', answer.result); // CoPaw §8.5 — only on Capture, never on a bare Synthesize
        } else if (res.reason === 'quota') {
            setErr('Storage is full — delete some captured syntheses and try again.');
        }
    };

    const onSecondLayer = () => {
        if (!answer || busy) return;
        const prior = answer;
        const focus = focusText.trim();
        // Chain from the nearest CAPTURED ancestor — never point parentId at an id
        // that was never (or is no longer) in the captured history.
        const parentId = captured ? prior.id : prior.parentId;
        const exclude = [`synthesis:${prior.id}`, ...(prior.parentId ? [`synthesis:${prior.parentId}`] : [])];
        void runSynthesis(async () => {
            const passages = await recallPassages(uid, `${prior.query} ${focus}`.trim(), { limit: 6, excludeSourceIds: exclude });
            const basePrompt = buildSecondLayerPrompt(prior.query, prior.result, focus || undefined);
            const { prompt, used } = buildGroundedPrompt(basePrompt, passages);
            return { prompt, pending: { id: newSynthesisId(), query: prior.query, layer: prior.layer + 1, parentId, followUp: focus || undefined }, used };
        });
    };

    const loadFromHistory = (h: SynthesisEntry) => {
        if (answer && !captured) {
            if (!window.confirm('Replace the current uncaptured synthesis?')) return;
        }
        setAnswer({ id: h.id, query: h.query, result: h.result, layer: h.layer, parentId: h.parentId, followUp: h.followUp, sources: h.sources });
        setQuery(h.query);
        setErr('');
    };

    const onClearAll = () => {
        if (!window.confirm(`Delete all ${history.length} captured syntheses? This cannot be undone.`)) return;
        clearSyntheses();
    };

    const onDeleteOne = (h: SynthesisEntry) => {
        if (!window.confirm('Delete this captured synthesis?')) return;
        removeSynthesis(h.id);
    };

    const badges = [
        { label: 'Retrieve', done: !!(answer?.sources && answer.sources.length > 0) },
        { label: 'Synthesize', done: !!answer },
        { label: 'Capture', done: captured },
        { label: 'Deepen', done: !!answer && answer.layer > 1 },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--bg-desktop)', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            {/* Header + pipeline */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={15} style={{ color: ACCENT }} />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Synthesis Lab</span>
                    {answer && answer.layer > 1 && <span style={{ marginLeft: 'auto', fontSize: 11, color: ACCENT, fontFamily: 'monospace' }}>layer {answer.layer}</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {badges.map((b) => (
                        <span key={b.label} aria-current={b.done ? 'step' : undefined}
                            style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, background: b.done ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'color-mix(in srgb, var(--accent) 6%, transparent)', border: `1px solid ${b.done ? ACCENT : '#222'}`, color: b.done ? ACCENT : 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
                            {b.label}{b.done && <span style={SR_ONLY}> (done)</span>}
                        </span>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                {/* Main column */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, padding: 16, gap: 10, overflowY: 'auto' }}>
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ask a question — matching saved notes, tags and captures are used as sources…"
                        aria-label="Question to synthesize"
                        rows={3}
                        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-desktop)', border: '1px solid #333', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, padding: '10px 12px', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                    />

                    {previewSources.length > 0 ? (
                        <details open>
                            <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)' }}>Sources ({previewSources.length})</summary>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, paddingLeft: 4 }}>
                                {previewSources.map((rp) => (
                                    <label key={rp.passageId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#bbb', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={checked[rp.passageId] !== false}
                                            onChange={(e) => setChecked((c) => ({ ...c, [rp.passageId]: e.target.checked }))}
                                        />
                                        {(rp.title.trim() || '(untitled)')} · {rp.sourceKind}
                                    </label>
                                ))}
                            </div>
                        </details>
                    ) : searchedQuery !== null && searchedQuery === query.trim() ? (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No saved sources match — the answer will use general knowledge.</div>
                    ) : null}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={onSynthesize} disabled={busy || !query.trim()}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, border: 'none', background: (busy || !query.trim()) ? '#1a1a1a' : ACCENT, color: (busy || !query.trim()) ? '#666' : '#000', fontSize: 12, fontWeight: 700, cursor: (busy || !query.trim()) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                            {busy ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkles size={13} />}
                            {busy ? 'Synthesizing…' : 'Synthesize'}
                        </button>
                        {busy && (
                            <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: '1px solid #333', background: 'transparent', color: '#ccc', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                <X size={12} /> Cancel
                            </button>
                        )}
                        {!llmReady && <span style={{ fontSize: 11, color: '#666' }}>· add an LLM in Settings to enable</span>}
                    </div>

                    <AIDegradedState availability={ai} needsKey ctaLabel="Add a key" />
                    {err && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)', color: '#ff8da5', fontSize: 12 }}><TriangleAlert size={14} aria-hidden style={{ flexShrink: 0 }} /><span>{err}</span></div>}

                    {answer && (
                        <div style={{ border: '1px solid #222', borderRadius: 8, background: '#070707', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '8px 12px', borderBottom: '1px solid #222' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT }}>
                                    {busy ? 'Synthesizing…' : `Synthesis${answer.layer > 1 ? ` · layer ${answer.layer}` : ''}`}
                                </span>
                                <div style={{ flex: 1 }} />
                                <button onClick={onCapture} disabled={captured || busy} title="Capture as a document — feeds back into the corpus"
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: '1px solid #333', background: captured ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: captured ? ACCENT : '#ccc', fontSize: 11, fontWeight: 600, cursor: (captured || busy) ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                                    <Save size={12} /> {captured ? 'Captured' : 'Capture'}
                                </button>
                                <input
                                    type="text"
                                    value={focusText}
                                    onChange={(e) => setFocusText(e.target.value)}
                                    placeholder="Focus the second pass on… (optional)"
                                    aria-label="Focus the second pass on"
                                    style={{ width: 160, background: 'var(--bg-desktop)', border: '1px solid #333', borderRadius: 6, color: 'var(--text-primary)', fontSize: 11, padding: '4px 8px', fontFamily: 'inherit' }}
                                />
                                <button onClick={onSecondLayer} disabled={busy} title="Second-layer query — re-query using this synthesis as added context"
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: `1px solid ${ACCENT}`, background: 'transparent', color: ACCENT, fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                                    <Layers size={12} /> Second-layer query
                                </button>
                            </div>
                            {answer.truncated && (
                                <div role="status" style={{ padding: '6px 14px', fontSize: 11, color: '#ffb84d', borderBottom: '1px solid #222' }}>
                                    This answer hit the length limit and may be cut off.
                                </div>
                            )}
                            <div style={{ padding: '12px 14px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: '#ddd', fontSize: 13, lineHeight: 1.7 }}>{renderAnswerText(answer.result, answer.sources)}</div>
                            {answer.sources && answer.sources.length > 0 && (
                                <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--text-tertiary)', borderTop: '1px solid #222' }}>
                                    Sources: {answer.sources.map((s, i) => (
                                        <span key={`${s.sourceId}-${i}`}>{i > 0 ? ' · ' : ''}[{i + 1}] {s.title || '(untitled)'}</span>
                                    ))}
                                </div>
                            )}
                            <div style={{ padding: '8px 12px', borderTop: '1px solid #222' }}>
                                <TagInput source="synthesis" sourceId={answer.id} title={answer.query || 'Synthesis'} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Captured corpus */}
                <div style={{ width: 240, flexShrink: 0, borderLeft: '1px solid #222', background: '#070707', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #222' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', flex: 1 }}>Captured ({history.length})</span>
                        {history.length > 0 && (
                            <button onClick={onClearAll} title="Clear captured syntheses" aria-label="Delete all captured syntheses" style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', display: 'flex' }}><Trash2 size={12} /></button>
                        )}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
                        {history.length === 0 ? (
                            <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 11, lineHeight: 1.6 }}>Captured syntheses feed search, Memory Graph RAG and the knowledge graph.</div>
                        ) : history.map((h) => (
                            <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 4 }}>
                                <button onClick={() => loadFromHistory(h)}
                                    style={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'left', padding: '7px 9px', background: 'transparent', border: '1px solid #222', borderRadius: 6, color: '#bbb', cursor: 'pointer', fontFamily: 'inherit' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#161616'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                    <div style={{ fontSize: 11, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.query || '(untitled)'}</div>
                                    <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>layer {h.layer} · {new Date(h.capturedAt).toLocaleDateString()}</div>
                                </button>
                                <button onClick={() => onDeleteOne(h)} aria-label={`Delete synthesis: ${h.query || 'untitled'}`} title="Delete"
                                    style={{ flexShrink: 0, background: 'none', border: 'none', color: '#666', cursor: 'pointer', display: 'flex', padding: 4 }}>
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
