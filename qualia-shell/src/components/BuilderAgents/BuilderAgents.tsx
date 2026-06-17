/**
 * BuilderAgents — the three §8 builder agents in one widget:
 *   Schema Producer (§8.6) · PRD Synthesis (§8.7) · Gap Analysis (§8.8).
 * Each is an input → `callLlm` → structured output flow. Output can be copied
 * or opened in Scribe. Honest offline state when no LLM is configured.
 */
import { useState, useCallback, useContext } from 'react';
import { Bot, Play, Copy, FileUp, RefreshCw, TriangleAlert } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { useScribeStore } from '../Scribe/scribeStore';
import { UserContext } from '../../context/UserContext';
import { captureFacts, copawUserIdHolder } from '../Hive/copawStore';
import { AGENTS, composePrompt, canRun, type AgentMode } from './agentDefs';

const ACCENT = '#D6FE51';
const MODES: AgentMode[] = ['schema', 'prd', 'gap'];

export default function BuilderAgents() {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const userCtx = useContext(UserContext);
    copawUserIdHolder.current = userCtx?.user?.id ?? null;
    const [mode, setMode] = useState<AgentMode>('schema');
    const [values, setValues] = useState<Record<string, string>>({ format: 'JSON Schema' });
    const [output, setOutput] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [copied, setCopied] = useState(false);

    const def = AGENTS[mode];
    const ready = canRun(mode, values);

    const run = useCallback(async () => {
        if (!canRun(mode, values) || busy) return;
        if (!hasActiveLlm(integrations.llm)) { setErr('No LLM configured — add a provider in Settings → API Keys to run agents.'); return; }
        setBusy(true); setErr(''); setOutput(''); setCopied(false);
        try {
            const { systemPrompt, prompt } = composePrompt(mode, values);
            const res = await callLlm({ systemPrompt, prompt, maxTokens: 1500, temperature: 0.2, responseFormat: mode === 'schema' ? 'text' : 'text' }, integrations.llm);
            if (res && res.text.trim()) {
                setOutput(res.text.trim());
                captureFacts(def.label, res.text.trim()); // CoPaw §8.5
            }
            else setErr('The agent returned no output.');
        } catch (e: any) {
            setErr(e?.message || 'Agent run failed.');
        } finally {
            setBusy(false);
        }
    }, [mode, values, busy, integrations.llm]);

    const copy = () => { try { void navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } };
    const openInScribe = () => {
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        const ext = mode === 'schema' && (values.format || '').includes('TypeScript') ? 'ts' : 'md';
        useScribeStore.getState().openInMemoryFile(`${def.label.replace(/\s+/g, '-')}-${stamp}.${ext}`, output);
        window.dispatchEvent(new CustomEvent('qualia-open-widget', { detail: 'scribe' }));
    };

    const setField = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--bg-desktop)', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            {/* Header + mode tabs */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Bot size={15} style={{ color: ACCENT }} />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Builder Agents</span>
                    {!llmReady && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#666' }}>add an LLM in Settings to run</span>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {MODES.map((m) => (
                        <button key={m} onClick={() => { setMode(m); setOutput(''); setErr(''); }}
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: mode === m ? '#000' : 'transparent', color: mode === m ? ACCENT : '#888', borderBottom: mode === m ? `2px solid ${ACCENT}` : '2px solid transparent', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {AGENTS[m].label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                {/* Inputs */}
                <div style={{ width: '46%', minWidth: 280, flexShrink: 0, borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', padding: 14, gap: 10, overflowY: 'auto' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{def.blurb}</div>
                    {def.fields.map((f) => (
                        <div key={f.key}>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>{f.label}</label>
                            {f.kind === 'select' ? (
                                <select value={values[f.key] ?? f.options?.[0] ?? ''} onChange={(e) => setField(f.key, e.target.value)}
                                    style={{ width: '100%', background: 'var(--bg-desktop)', color: '#ddd', border: '1px solid #333', borderRadius: 6, padding: '7px 9px', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}>
                                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                            ) : (
                                <textarea value={values[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} placeholder={f.placeholder} rows={f.rows ?? 5}
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-desktop)', border: '1px solid #333', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
                            )}
                        </div>
                    ))}
                    <button onClick={() => void run()} disabled={!ready || busy}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 0', borderRadius: 7, border: 'none', background: (!ready || busy) ? '#1a1a1a' : ACCENT, color: (!ready || busy) ? '#666' : '#000', fontSize: 12, fontWeight: 700, cursor: (!ready || busy) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        {busy ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Play size={13} />}
                        {busy ? 'Running…' : `Run ${def.label}`}
                    </button>
                    {err && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 6, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)', color: '#ff8da5', fontSize: 11 }}><TriangleAlert size={14} aria-hidden style={{ flexShrink: 0 }} /><span>{err}</span></div>}
                </div>

                {/* Output */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid #222' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT, flex: 1 }}>Output</span>
                        {output && <>
                            <button onClick={copy} title="Copy" style={iconBtn}><Copy size={12} /> {copied ? 'Copied' : 'Copy'}</button>
                            <button onClick={openInScribe} title="Open in Scribe" style={iconBtn}><FileUp size={12} /> Scribe</button>
                        </>}
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
                        {output ? (
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#ddd', fontSize: 12, lineHeight: 1.65, fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>{output}</pre>
                        ) : (
                            <div style={{ color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.7 }}>
                                {def.label} output will appear here. Fill the inputs and click <strong style={{ color: ACCENT }}>Run</strong>.
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

const iconBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 5,
    border: '1px solid #333', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
};
