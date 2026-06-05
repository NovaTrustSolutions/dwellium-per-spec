/**
 * Synthesis — the Synthesis / compounding-loop widget (spec §7.3).
 *
 * Query & Synthesize → Capture (feed back into the corpus) → one-click
 * Second-layer query (re-query using the first synthesis as added context).
 * Runs client-side via `callLlm`; captured syntheses persist per-user.
 */
import { useState, useContext, useSyncExternalStore, useCallback } from 'react';
import { Sparkles, RefreshCw, Save, Layers, Trash2 } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import {
    synthesisStore, synthesisUserIdHolder, captureSynthesis, clearSyntheses,
    buildSecondLayerPrompt, type Synthesis as SynthesisEntry,
} from './synthesisStore';
import { captureFacts, copawUserIdHolder } from '../Hive/copawStore';

const ACCENT = '#D6FE51';
const PASSES = ['Ingest', 'Compile', 'Query & Synthesize', 'Capture', 'Return', 'Recompile'];

export default function Synthesis() {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const userCtx = useContext(UserContext);
    synthesisUserIdHolder.current = userCtx?.user?.id ?? null;
    copawUserIdHolder.current = userCtx?.user?.id ?? null;
    const history: SynthesisEntry[] = useSyncExternalStore(synthesisStore.subscribe, synthesisStore.getSnapshot, synthesisStore.getServerSnapshot);

    const [query, setQuery] = useState('');
    const [result, setResult] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [layer, setLayer] = useState(1);
    const [parentId, setParentId] = useState<string | null>(null);
    const [captured, setCaptured] = useState(false);

    const runSynthesis = useCallback(async (prompt: string) => {
        if (!hasActiveLlm(integrations.llm)) { setErr('No LLM configured — add a provider in Settings → API Keys to synthesize.'); return; }
        setBusy(true); setErr(''); setCaptured(false);
        try {
            const res = await callLlm({
                systemPrompt: 'You are a synthesis engine. Given a question (and any provided prior context), produce a concise, well-structured synthesis in Markdown — claims grounded, assumptions flagged, ending with the most important open question.',
                prompt,
                maxTokens: 1200,
                temperature: 0.4,
            }, integrations.llm);
            if (res && res.text.trim()) {
                setResult(res.text.trim());
                captureFacts('Synthesis Lab', res.text.trim()); // CoPaw §8.5
            }
            else setErr('The LLM returned an empty synthesis.');
        } catch (e: any) {
            setErr(e?.message || 'Synthesis failed.');
        } finally {
            setBusy(false);
        }
    }, [integrations.llm]);

    const onSynthesize = () => {
        const q = query.trim();
        if (!q || busy) return;
        setLayer(1); setParentId(null);
        void runSynthesis(q);
    };

    const onCapture = () => {
        if (!result.trim()) return;
        const s = captureSynthesis({ query, result, layer, parentId });
        if (s) { setCaptured(true); setParentId(s.id); }
    };

    const onSecondLayer = () => {
        if (!result.trim() || busy) return;
        const prompt = buildSecondLayerPrompt(query, result);
        setLayer((l) => l + 1);
        void runSynthesis(prompt);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#000', color: '#ccc', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            {/* Header + pipeline */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={15} style={{ color: ACCENT }} />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888' }}>Synthesis Lab</span>
                    {layer > 1 && <span style={{ marginLeft: 'auto', fontSize: 11, color: ACCENT, fontFamily: 'monospace' }}>layer {layer}</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {PASSES.map((p, i) => (
                        <span key={p} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, background: 'rgba(214,254,81,0.06)', border: '1px solid #222', color: '#777', letterSpacing: '0.04em' }}>
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
                        placeholder="Ask a question to synthesize across your corpus…"
                        rows={3}
                        style={{ width: '100%', boxSizing: 'border-box', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 13, padding: '10px 12px', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={onSynthesize} disabled={busy || !query.trim()}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, border: 'none', background: (busy || !query.trim()) ? '#1a1a1a' : ACCENT, color: (busy || !query.trim()) ? '#666' : '#000', fontSize: 12, fontWeight: 700, cursor: (busy || !query.trim()) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                            {busy ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkles size={13} />}
                            {busy ? 'Synthesizing…' : 'Synthesize'}
                        </button>
                        {!llmReady && <span style={{ fontSize: 11, color: '#666' }}>· add an LLM in Settings to enable</span>}
                    </div>

                    {err && <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)', color: '#ff8da5', fontSize: 12 }}>⚠ {err}</div>}

                    {result && (
                        <div style={{ border: '1px solid #222', borderRadius: 8, background: '#070707', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #222' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT }}>Synthesis {layer > 1 ? `· layer ${layer}` : ''}</span>
                                <div style={{ flex: 1 }} />
                                <button onClick={onCapture} disabled={captured} title="Capture as a document — feeds back into the corpus"
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: '1px solid #333', background: captured ? 'rgba(214,254,81,0.12)' : 'transparent', color: captured ? ACCENT : '#ccc', fontSize: 11, fontWeight: 600, cursor: captured ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                                    <Save size={12} /> {captured ? 'Captured' : 'Capture'}
                                </button>
                                <button onClick={onSecondLayer} disabled={busy} title="Second-layer query — re-query using this synthesis as added context"
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: `1px solid ${ACCENT}`, background: 'transparent', color: ACCENT, fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                                    <Layers size={12} /> Second-layer query
                                </button>
                            </div>
                            <div style={{ padding: '12px 14px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: '#ddd', fontSize: 13, lineHeight: 1.7 }}>{result}</div>
                        </div>
                    )}
                </div>

                {/* Captured corpus */}
                <div style={{ width: 240, flexShrink: 0, borderLeft: '1px solid #222', background: '#070707', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #222' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', flex: 1 }}>Captured ({history.length})</span>
                        {history.length > 0 && (
                            <button onClick={() => clearSyntheses()} title="Clear captured syntheses" style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', display: 'flex' }}><Trash2 size={12} /></button>
                        )}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
                        {history.length === 0 ? (
                            <div style={{ padding: 12, color: '#555', fontSize: 11, lineHeight: 1.6 }}>Captured syntheses feed back into the corpus and become context for future queries.</div>
                        ) : history.map((h) => (
                            <button key={h.id} onClick={() => { setQuery(h.query); setResult(h.result); setLayer(h.layer); setParentId(h.id); setCaptured(true); setErr(''); }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', marginBottom: 4, background: 'transparent', border: '1px solid #222', borderRadius: 6, color: '#bbb', cursor: 'pointer', fontFamily: 'inherit' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#161616'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                <div style={{ fontSize: 11, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.query || '(untitled)'}</div>
                                <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>layer {h.layer} · {new Date(h.capturedAt).toLocaleDateString()}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
