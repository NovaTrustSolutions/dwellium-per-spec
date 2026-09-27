/**
 * Synthesis — the Synthesis / compounding-loop widget (spec §7.3).
 *
 * Query & Synthesize → Capture (feed back into the corpus) → one-click
 * Second-layer query (re-query using the first synthesis as added context).
 * Runs client-side via `callLlm`; captured syntheses persist per-user.
 *
 * The on-screen answer is tracked separately from the query textarea (plan
 * 070 B3/C1): editing the textarea after a run never changes what Capture
 * saves, and a failed/empty run leaves the previous answer exactly as it was.
 */
import { useState, useSyncExternalStore, useCallback, useContext } from 'react';
import { UserContext } from '../../context/UserContext';
import { Sparkles, RefreshCw, Save, Layers, Trash2, TriangleAlert } from 'lucide-react';
import { usePerUserIdentity, captureOwner } from '../../lib/perUserIdentity';
import { TagInput } from '../Tags/TagInput';
import { useIntegrations } from '../../hooks/useIntegrations';
import { useAIAvailability } from '../../hooks/useAIAvailability';
import AIDegradedState from '../Shell/AIDegradedState';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import {
    synthesisStore, captureSynthesis, removeSynthesis, clearSyntheses,
    newSynthesisId, buildSecondLayerPrompt, type Synthesis as SynthesisEntry,
} from './synthesisStore';
import { captureFacts } from '../Hive/copawStore';

const ACCENT = '#D6FE51';
const PASSES = ['Synthesize', 'Capture', 'Second layer'];

/** The answer currently on screen — independent of the (editable) query textarea. */
interface Answer {
    id: string;
    query: string;
    result: string;
    layer: number;
    parentId: string | null;
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

    // Account switch (UserContext changes without a remount): drop everything the
    // previous user had on screen so the next user can't see or Capture it.
    const uid = useContext(UserContext)?.user?.id ?? null;
    const [shownFor, setShownFor] = useState(uid);
    if (shownFor !== uid) {
        setShownFor(uid);
        setAnswer(null);
        setQuery('');
        setErr('');
    }

    const captured = answer ? history.some((h) => h.id === answer.id) : false;

    const runSynthesis = useCallback(async (
        prompt: string,
        pending: { id: string; query: string; layer: number; parentId: string | null },
    ) => {
        if (!hasActiveLlm(integrations.llm)) { setErr('No LLM configured — add a key above.'); return; }
        setBusy(true); setErr('');
        const stillOwner = captureOwner();
        try {
            const res = await callLlm({
                systemPrompt: 'You are a synthesis engine. Given a question (and any provided prior context), produce a concise, well-structured synthesis in Markdown — claims grounded, assumptions flagged, ending with the most important open question.',
                prompt,
                maxTokens: 1200,
                temperature: 0.4,
            }, integrations.llm);
            if (!stillOwner()) return; // account switched mid-run — drop, never show/store the old owner's answer
            if (res && res.text.trim()) {
                setAnswer({ id: pending.id, query: pending.query, result: res.text.trim(), layer: pending.layer, parentId: pending.parentId });
            } else {
                setErr('The LLM returned an empty synthesis.');
            }
        } catch (e: any) {
            if (!stillOwner()) return;
            setErr(e?.message || 'Synthesis failed.');
        } finally {
            setBusy(false);
        }
    }, [integrations.llm]);

    const onSynthesize = () => {
        const q = query.trim();
        if (!q || busy) return;
        void runSynthesis(q, { id: newSynthesisId(), query: q, layer: 1, parentId: null });
    };

    const onCapture = () => {
        if (!answer || busy || captured) return;
        const res = captureSynthesis({ id: answer.id, query: answer.query, result: answer.result, layer: answer.layer, parentId: answer.parentId });
        if (res.ok) {
            captureFacts('Synthesis Lab', answer.result); // CoPaw §8.5 — only on Capture, never on a bare Synthesize
        } else if (res.reason === 'quota') {
            setErr('Storage is full — delete some captured syntheses and try again.');
        }
    };

    const onSecondLayer = () => {
        if (!answer || busy) return;
        const prompt = buildSecondLayerPrompt(answer.query, answer.result);
        // Chain from the nearest CAPTURED ancestor — never point parentId at an id
        // that was never (or is no longer) in the captured history.
        const parentId = captured ? answer.id : answer.parentId;
        void runSynthesis(prompt, { id: newSynthesisId(), query: answer.query, layer: answer.layer + 1, parentId });
    };

    const loadFromHistory = (h: SynthesisEntry) => {
        if (answer && !captured) {
            if (!window.confirm('Replace the current uncaptured synthesis?')) return;
        }
        setAnswer({ id: h.id, query: h.query, result: h.result, layer: h.layer, parentId: h.parentId });
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
                    {PASSES.map((p, i) => (
                        <span key={p} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 6%, transparent)', border: '1px solid #222', color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
                            {i + 1}. {p}
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
                        placeholder="Ask a question to synthesize…"
                        aria-label="Question to synthesize"
                        rows={3}
                        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-desktop)', border: '1px solid #333', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, padding: '10px 12px', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={onSynthesize} disabled={busy || !query.trim()}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, border: 'none', background: (busy || !query.trim()) ? '#1a1a1a' : ACCENT, color: (busy || !query.trim()) ? '#666' : '#000', fontSize: 12, fontWeight: 700, cursor: (busy || !query.trim()) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                            {busy ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkles size={13} />}
                            {busy ? 'Synthesizing…' : 'Synthesize'}
                        </button>
                        {!llmReady && <span style={{ fontSize: 11, color: '#666' }}>· add an LLM in Settings to enable</span>}
                    </div>

                    <AIDegradedState availability={ai} needsKey ctaLabel="Add a key" />
                    {err && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)', color: '#ff8da5', fontSize: 12 }}><TriangleAlert size={14} aria-hidden style={{ flexShrink: 0 }} /><span>{err}</span></div>}

                    {answer && (
                        <div style={{ border: '1px solid #222', borderRadius: 8, background: '#070707', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #222' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT }}>
                                    {busy ? 'Synthesizing…' : `Synthesis${answer.layer > 1 ? ` · layer ${answer.layer}` : ''}`}
                                </span>
                                <div style={{ flex: 1 }} />
                                <button onClick={onCapture} disabled={captured || busy} title="Capture as a document — feeds back into the corpus"
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: '1px solid #333', background: captured ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: captured ? ACCENT : '#ccc', fontSize: 11, fontWeight: 600, cursor: (captured || busy) ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                                    <Save size={12} /> {captured ? 'Captured' : 'Capture'}
                                </button>
                                <button onClick={onSecondLayer} disabled={busy} title="Second-layer query — re-query using this synthesis as added context"
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: `1px solid ${ACCENT}`, background: 'transparent', color: ACCENT, fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                                    <Layers size={12} /> Second-layer query
                                </button>
                            </div>
                            <div style={{ padding: '12px 14px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: '#ddd', fontSize: 13, lineHeight: 1.7 }}>{answer.result}</div>
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
