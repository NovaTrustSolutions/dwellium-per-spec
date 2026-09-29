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
 *
 * Plan 070 phase 3: styling moved to Synthesis.css (token-only, container
 * query for narrow windows); the answer body is rendered Markdown with
 * citation buttons via synthesisRender.renderAnswerHtml (one delegated click
 * handler); accessibility pass (alert/status roles, unique delete names,
 * keyboard submit); Copy-to-clipboard; history search; lineage chip back to
 * a captured parent.
 */
import { useState, useSyncExternalStore, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { UserContext } from '../../context/UserContext';
import { Sparkles, RefreshCw, Save, Layers, Trash2, TriangleAlert, X } from 'lucide-react';
import { usePerUserIdentity, captureOwner } from '../../lib/perUserIdentity';
import { TagInput } from '../Tags/TagInput';
import { useIntegrations } from '../../hooks/useIntegrations';
import { useAIAvailability } from '../../hooks/useAIAvailability';
import AIDegradedState from '../Shell/AIDegradedState';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { recallPassages, type RecalledPassage } from '../../lib/memoryGraphRag/recall';
import { buildGroundedPrompt, sourceWidget, sourceKindLabel } from './synthesisContext';
import { renderAnswerHtml } from './synthesisRender';
import {
    synthesisStore, captureSynthesis, removeSynthesis, clearSyntheses, MAX_SYNTHESES,
    newSynthesisId, buildSecondLayerPrompt, type Synthesis as SynthesisEntry, type SynthesisSource,
} from './synthesisStore';
import { captureFacts } from '../Hive/copawStore';
import './Synthesis.css';

const MIN_QUERY_CHARS = 3;
const PREVIEW_DEBOUNCE_MS = 300;
const COPY_FEEDBACK_MS = 1500;

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
    const [copied, setCopied] = useState(false);
    const [historyQuery, setHistoryQuery] = useState('');

    // Source preview (debounced recallPassages over the question textarea).
    const [previewSources, setPreviewSources] = useState<RecalledPassage[]>([]);
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
    const requestSeqRef = useRef(0);

    const abortRef = useRef<AbortController | null>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { abortRef.current?.abort(); }, []);
    useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

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
        setHistoryQuery('');
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
    const parentEntry = useMemo(
        () => (answer?.parentId ? history.find((h) => h.id === answer.parentId) : undefined),
        [answer?.parentId, history],
    );

    const answerHtml = useMemo(
        () => (answer ? renderAnswerHtml(answer.result, answer.sources ?? []) : ''),
        [answer?.result, answer?.sources],
    );

    const filteredHistory = useMemo(() => {
        const q = historyQuery.trim().toLowerCase();
        if (!q) return history;
        return history.filter((h) =>
            h.query.toLowerCase().includes(q)
            || h.result.toLowerCase().includes(q)
            || (h.followUp ?? '').toLowerCase().includes(q));
    }, [history, historyQuery]);
    const isFiltering = historyQuery.trim() !== '';

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

    const onQueryKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // IME: Enter confirms a CJK composition — never submit mid-composition.
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSynthesize();
        }
    };

    const onCancel = () => { abortRef.current?.abort(); };

    const onCapture = () => {
        if (!answer || busy || captured) return;
        const res = captureSynthesis({ id: answer.id, query: answer.query, result: answer.result, layer: answer.layer, parentId: answer.parentId, followUp: answer.followUp, sources: answer.sources });
        if (res.ok) {
            captureFacts('Synthesis Lab', answer.result); // CoPaw §8.5 — only on Capture, never on a bare Synthesize
        } else if (res.reason === 'full') {
            setErr(`You have ${MAX_SYNTHESES} captured syntheses — delete some to capture more.`);
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

    const onCopy = async () => {
        if (!answer) return;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(answer.result);
            setErr('');
            setCopied(true);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
        } catch {
            // MUTATION-CHECK: never show "Copied" on a clipboard failure (Docs/code.md).
            setCopied(false);
            setErr("Couldn't copy — select the text instead.");
        }
    };

    /** One delegated handler for every rendered `[n]` citation button (synthesisRender). */
    const onCiteClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const btn = (e.target as HTMLElement).closest('button.syn-cite');
        if (!btn || !answer?.sources) return;
        const n = parseInt(btn.getAttribute('data-cite') || '', 10);
        const src = answer.sources[n - 1];
        if (!src) return;
        const widget = sourceWidget(src.sourceKind);
        if (widget) openWidget(widget);
    };

    const badges = [
        { label: 'Retrieve', done: !!(answer?.sources && answer.sources.length > 0) },
        { label: 'Synthesize', done: !!answer },
        { label: 'Capture', done: captured },
        { label: 'Deepen', done: !!answer && answer.layer > 1 },
    ];

    return (
        <div className="syn-host">
            <div className="syn-root">
                {/* Header + pipeline */}
                <div className="syn-header">
                    <div className="syn-title">
                        <Sparkles size={15} aria-hidden />
                        <span>Synthesis Lab</span>
                        {answer && answer.layer > 1 && <span className="syn-layer">layer {answer.layer}</span>}
                    </div>
                    <div className="syn-steps">
                        {badges.map((b) => (
                            <span key={b.label} aria-current={b.done ? 'step' : undefined} className={`syn-step${b.done ? ' syn-step--done' : ''}`}>
                                {b.label}{b.done && <span className="syn-sr-only"> (done)</span>}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="syn-body">
                    {/* Main column */}
                    <div className="syn-main">
                        <label htmlFor="syn-query-input" className="syn-sr-only">Question to synthesize</label>
                        <textarea
                            id="syn-query-input"
                            className="syn-query"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onQueryKeyDown}
                            placeholder="Ask a question — your notes, tags, captures, wiki pages and memory are used as sources…"
                            aria-label="Question to synthesize"
                            rows={3}
                        />
                        <span className="syn-sr-only" aria-live="polite">
                            {busy ? 'Synthesizing…' : answer ? 'Synthesis ready' : ''}
                        </span>

                        {previewSources.length > 0 ? (
                            <details open className="syn-sources">
                                <summary className="syn-sources__head">Sources ({previewSources.length})</summary>
                                {previewSources.map((rp) => (
                                    <label key={rp.passageId} className="syn-sources__item">
                                        <input
                                            type="checkbox"
                                            checked={checked[rp.passageId] !== false}
                                            onChange={(e) => setChecked((c) => ({ ...c, [rp.passageId]: e.target.checked }))}
                                        />
                                        {(rp.title.trim() || '(untitled)')} · {sourceKindLabel(rp.sourceKind)}
                                    </label>
                                ))}
                            </details>
                        ) : searchedQuery !== null && searchedQuery === query.trim() ? (
                            <div className="syn-sources__empty">No saved sources match — the answer will use general knowledge.</div>
                        ) : null}

                        <div className="syn-actions">
                            <button className="syn-btn syn-btn--primary" onClick={onSynthesize} disabled={busy || !query.trim()}>
                                {busy ? <RefreshCw size={13} className="syn-spin" /> : <Sparkles size={13} />}
                                {busy ? 'Synthesizing…' : 'Synthesize'}
                            </button>
                            {busy && (
                                <button className="syn-btn syn-btn--ghost" onClick={onCancel}>
                                    <X size={12} /> Cancel
                                </button>
                            )}
                            {!llmReady && <span className="syn-hint">· add an LLM in Settings to enable</span>}
                        </div>

                        <AIDegradedState availability={ai} needsKey ctaLabel="Add a key" />
                        {busy && <div role="status" className="syn-notice">Synthesizing…</div>}
                        {err && (
                            <div role="alert" className="syn-error">
                                <TriangleAlert size={14} aria-hidden /><span>{err}</span>
                            </div>
                        )}

                        {answer && (
                            <div className="syn-answer">
                                <div className="syn-answer__head">
                                    <span className="syn-answer__label">
                                        {busy ? 'Synthesizing…' : `Synthesis${answer.layer > 1 ? ` · layer ${answer.layer}` : ''}`}
                                    </span>
                                    <button className="syn-btn syn-btn--ghost syn-push" onClick={onCopy} disabled={busy} title="Copy the answer text" >
                                        {copied ? 'Copied' : 'Copy'}
                                    </button>
                                    <button className="syn-btn syn-btn--accent" onClick={onCapture} disabled={captured || busy} title="Capture as a document — feeds back into the corpus">
                                        <Save size={12} /> {captured ? 'Captured' : 'Capture'}
                                    </button>
                                    <label htmlFor="syn-focus-input" className="syn-sr-only">Second-pass focus (optional)</label>
                                    <input
                                        id="syn-focus-input"
                                        type="text"
                                        className="syn-focus"
                                        value={focusText}
                                        onChange={(e) => setFocusText(e.target.value)}
                                        placeholder="Focus the second pass on… (optional)"
                                        aria-label="Second-pass focus (optional)"
                                    />
                                    <button className="syn-btn syn-btn--accent" onClick={onSecondLayer} disabled={busy} title="Second-layer query — re-query using this synthesis as added context">
                                        <Layers size={12} /> Second-layer query
                                    </button>
                                </div>
                                {parentEntry && (
                                    <button type="button" className="syn-lineage" onClick={() => loadFromHistory(parentEntry)}>
                                        Built on: {parentEntry.query || '(untitled)'} (layer {parentEntry.layer})
                                    </button>
                                )}
                                {answer.truncated && (
                                    <div role="status" className="syn-notice">
                                        This answer hit the length limit and may be cut off.
                                    </div>
                                )}
                                <div className="syn-answer__body" onClick={onCiteClick} dangerouslySetInnerHTML={{ __html: answerHtml }} />
                                {answer.sources && answer.sources.length > 0 && (
                                    <div className="syn-answer__sources">
                                        Sources: {answer.sources.map((s, i) => (
                                            <span key={`${s.sourceId}-${i}`}>{i > 0 ? ' · ' : ''}[{i + 1}] {s.title || '(untitled)'}</span>
                                        ))}
                                    </div>
                                )}
                                <div className="syn-answer__foot">
                                    <TagInput source="synthesis" sourceId={answer.id} title={answer.query || 'Synthesis'} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Captured corpus */}
                    <div className="syn-side">
                        <div className="syn-side__head">
                            <span>Captured ({isFiltering ? `${filteredHistory.length}/${history.length}` : history.length})</span>
                            {history.length > 0 && (
                                <button className="syn-icon-btn syn-push" onClick={onClearAll} title="Clear captured syntheses" aria-label="Delete all captured syntheses" ><Trash2 size={12} /></button>
                            )}
                        </div>
                        {history.length > 0 && (
                            <input
                                type="text"
                                className="syn-side__search"
                                value={historyQuery}
                                onChange={(e) => setHistoryQuery(e.target.value)}
                                placeholder="Search captured syntheses…"
                                aria-label="Search captured syntheses"
                            />
                        )}
                        <div className="syn-side__list">
                            {history.length === 0 ? (
                                <div className="syn-side__empty">Captured syntheses feed search, Memory Graph RAG and the knowledge graph.</div>
                            ) : filteredHistory.length === 0 ? (
                                <div className="syn-side__empty">No captures match</div>
                            ) : filteredHistory.map((h) => (
                                <div key={h.id} className="syn-hist">
                                    <button className="syn-hist__open" onClick={() => loadFromHistory(h)}>
                                        <div className="syn-hist__title">{h.query || '(untitled)'}</div>
                                        <div className="syn-hist__meta">layer {h.layer} · {new Date(h.capturedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                                    </button>
                                    <button
                                        className="syn-hist__del syn-icon-btn"
                                        onClick={() => onDeleteOne(h)}
                                        aria-label={`Delete synthesis: ${h.query || 'untitled'} (captured ${new Date(h.capturedAt).toLocaleString()})`}
                                        title="Delete"
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
