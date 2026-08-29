/**
 * ResearchLab — sandboxed playground over the 31 free LLM API providers from
 * github.com/NovaTrustSolutions/awesome-freellm-apis (labs tier, ⌘K "labs:").
 *
 * THE DATA FIREWALL: this widget and src/lib/researchLlm/** import NOTHING
 * from the app's property/customer data modules (strataApi, StrataDashboard,
 * ARA chat, Library/NotebookLM, hierarchy, Gmail/calendar/tasks,
 * integrationsStore). Requests are built ONLY from user-typed text plus a
 * fixed preset system prompt — no context injection, no attachments (no
 * attach control exists on purpose). Enforced statically by
 * researchLabImportGuard.test.ts and at runtime by researchLlm/guard.ts.
 *
 * CORS reality: browser-direct calls die on providers that send no CORS
 * headers. We probe on first use (fetch TypeError ⇒ likely CORS), badge the
 * row "browser-blocked — needs the research proxy (planned)" and disable it
 * for runs instead of pretending. The backend research proxy is a follow-up
 * (backend deploys are blocked); streaming is also deliberately out (v1 is
 * stream:false).
 */
import { useState, useSyncExternalStore } from 'react';
import { ExternalLink, FlaskConical, KeyRound, Play, Trash2 } from 'lucide-react';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { RESEARCH_PROVIDERS, RESEARCH_PROVIDERS_UPDATED, ResearchProvider } from '../../data/researchProviders';
import { guardOutbound } from '../../lib/researchLlm/guard';
import { RESEARCH_PRESETS, ResearchRunResult, runResearchChat } from '../../lib/researchLlm/client';
import { getResearchKey, researchKeysStore, setResearchKey } from '../../lib/researchLlm/researchKeysStore';
import { addLogEntry, removeLogEntry, researchLogStore } from '../../lib/researchLlm/researchLogStore';
import './ResearchLab.css';

type Tab = 'playground' | 'providers' | 'keys' | 'history';
type CorsStatus = 'unknown' | 'ok' | 'blocked';

const MAX_SELECTED = 4;

export default function ResearchLab() {
    usePerUserIdentity();
    const keys = useSyncExternalStore(researchKeysStore.subscribe, researchKeysStore.getSnapshot, researchKeysStore.getServerSnapshot);
    const log = useSyncExternalStore(researchLogStore.subscribe, researchLogStore.getSnapshot, researchLogStore.getServerSnapshot);

    const [tab, setTab] = useState<Tab>('playground');
    const [prompt, setPrompt] = useState('');
    const [presetId, setPresetId] = useState(RESEARCH_PRESETS[0].id);
    /** providerId → chosen model id (selection = presence in this map). */
    const [selected, setSelected] = useState<Record<string, string>>({});
    const [results, setResults] = useState<ResearchRunResult[] | null>(null);
    const [running, setRunning] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [pendingWarn, setPendingWarn] = useState<string | null>(null);
    /** Session-only CORS probe results (first real call per provider decides). */
    const [cors, setCors] = useState<Record<string, CorsStatus>>({});

    const toggleProvider = (p: ResearchProvider) => {
        if (p.unusable || cors[p.id] === 'blocked') return;
        setSelected(prev => {
            if (p.id in prev) {
                const next = { ...prev };
                delete next[p.id];
                return next;
            }
            if (Object.keys(prev).length >= MAX_SELECTED) return prev;
            return { ...prev, [p.id]: '' };
        });
    };

    const execute = async () => {
        const entries = Object.entries(selected);
        setNotice(null);
        setRunning(true);
        setResults(null);
        const runs = await Promise.all(entries.map(([providerId, model]) =>
            runResearchChat({ providerId, model: model.trim(), apiKey: getResearchKey(providerId), presetId, prompt })));
        setCors(prev => {
            const next = { ...prev };
            for (const r of runs) next[r.providerId] = r.corsBlocked ? 'blocked' : (next[r.providerId] === 'blocked' ? 'blocked' : (r.error && !r.status ? next[r.providerId] ?? 'unknown' : 'ok'));
            return next;
        });
        setResults(runs);
        setRunning(false);
        addLogEntry({
            prompt,
            systemPreset: presetId,
            responses: runs.map(({ providerId, model, text, latencyMs, error, usage }) => ({ providerId, model, text, latencyMs, error, usage })),
        });
    };

    const run = (confirmed = false) => {
        const entries = Object.entries(selected);
        if (!prompt.trim()) { setNotice('Type a prompt first.'); return; }
        if (entries.length === 0) { setNotice('Pick 1–4 providers below.'); return; }
        const missingKey = entries.find(([id]) => !getResearchKey(id));
        if (missingKey) { setNotice(`No API key set for ${providerName(missingKey[0])} — add it in the Keys tab.`); return; }
        const missingModel = entries.find(([, m]) => !m.trim());
        if (missingModel) { setNotice(`Enter a model id for ${providerName(missingModel[0])}.`); return; }
        const verdict = guardOutbound(prompt, { confirmed });
        if (verdict.kind === 'block') { setNotice(verdict.reason); return; }
        if (verdict.kind === 'warn') { setPendingWarn(verdict.reason); return; }
        setPendingWarn(null);
        void execute();
    };

    return (
        <div className="research-lab">
            <div className="rl-banner" role="note">
                <FlaskConical size={14} aria-hidden />
                Research sandbox — isolated from all property data. Free providers may train on what you type. Never paste resident, lease, or financial records.
            </div>

            <div className="rl-tabs" role="tablist">
                {(['playground', 'providers', 'keys', 'history'] as Tab[]).map(t => (
                    <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'rl-tab active' : 'rl-tab'} onClick={() => setTab(t)}>
                        {t === 'playground' ? 'Playground' : t === 'providers' ? `Providers (${RESEARCH_PROVIDERS.length})` : t === 'keys' ? 'Keys' : 'History'}
                    </button>
                ))}
            </div>

            {tab === 'playground' && (
                <div className="rl-pane">
                    <label className="rl-label">
                        System preset
                        <select value={presetId} onChange={e => setPresetId(e.target.value)} aria-label="System preset">
                            {RESEARCH_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                    </label>
                    <textarea
                        className="rl-prompt"
                        placeholder="Your research prompt — user-typed text only; no app data is ever attached."
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        aria-label="Research prompt"
                    />
                    <div className="rl-select-strip">
                        <span className="rl-hint">Run side-by-side on up to {MAX_SELECTED}:</span>
                        {RESEARCH_PROVIDERS.filter(p => !p.unusable).map(p => (
                            <button
                                key={p.id}
                                className={p.id in selected ? 'rl-chip active' : 'rl-chip'}
                                disabled={cors[p.id] === 'blocked'}
                                title={cors[p.id] === 'blocked' ? 'browser-blocked — needs the research proxy (planned)' : p.name}
                                onClick={() => toggleProvider(p)}
                            >
                                {p.name}{keys[p.id] ? '' : ' (no key)'}
                            </button>
                        ))}
                    </div>
                    {Object.keys(selected).length > 0 && (
                        <div className="rl-models">
                            {Object.entries(selected).map(([id, model]) => (
                                <label key={id} className="rl-label">
                                    {providerName(id)} model
                                    <input
                                        value={model}
                                        placeholder="model id, e.g. llama-3.3-70b-versatile"
                                        onChange={e => setSelected(prev => ({ ...prev, [id]: e.target.value }))}
                                        aria-label={`${providerName(id)} model id`}
                                    />
                                </label>
                            ))}
                        </div>
                    )}
                    {notice && <div className="rl-notice" role="alert">{notice}</div>}
                    {pendingWarn && (
                        <div className="rl-warn" role="alertdialog">
                            {pendingWarn}
                            <div className="rl-warn-actions">
                                <button onClick={() => { setPendingWarn(null); run(true); }}>Send anyway</button>
                                <button onClick={() => setPendingWarn(null)}>Cancel</button>
                            </div>
                        </div>
                    )}
                    <button className="rl-run" disabled={running} onClick={() => run()}>
                        <Play size={14} aria-hidden /> {running ? 'Running…' : 'Run'}
                    </button>

                    {results && (
                        <div className="rl-results">
                            {results.map((r, i) => (
                                <div key={`${r.providerId}-${i}`} className="rl-result">
                                    <div className="rl-result-head">
                                        <strong>{providerName(r.providerId)}</strong> · {r.model || '(no model)'} · {r.latencyMs} ms
                                        {r.usage && ` · ${r.usage.promptTokens ?? '?'}→${r.usage.completionTokens ?? '?'} tok`}
                                    </div>
                                    {r.error
                                        ? <pre className="rl-error">{r.error}</pre>
                                        : r.text
                                            ? <pre className="rl-text">{r.text}</pre>
                                            : <div className="rl-empty">Empty response.</div>}
                                </div>
                            ))}
                        </div>
                    )}
                    {!results && !running && <div className="rl-empty">No runs yet — pick providers, type a prompt, hit Run.</div>}
                </div>
            )}

            {tab === 'providers' && (
                <div className="rl-pane rl-providers">
                    <div className="rl-hint">From {`github.com/NovaTrustSolutions/awesome-freellm-apis`} · last updated {RESEARCH_PROVIDERS_UPDATED}.</div>
                    {RESEARCH_PROVIDERS.map(p => (
                        <div key={p.id} className="rl-provider-row">
                            <div className="rl-provider-main">
                                <strong>{p.name}</strong>
                                <span className="rl-meta">{p.freeModels} free models · {p.maxContext} ctx · card: {p.creditCard}</span>
                                <span className="rl-meta">{p.modalities.join(', ')}</span>
                                {p.note && <span className="rl-meta rl-note">{p.note}</span>}
                            </div>
                            <div className="rl-provider-side">
                                {p.unusable
                                    ? <span className="rl-badge rl-badge-bad">unusable</span>
                                    : cors[p.id] === 'blocked'
                                        ? <span className="rl-badge rl-badge-bad">browser-blocked — needs the research proxy (planned)</span>
                                        : cors[p.id] === 'ok'
                                            ? <span className="rl-badge rl-badge-ok">browser-direct ok</span>
                                            : <span className="rl-badge">CORS untested</span>}
                                <span className={keys[p.id] ? 'rl-badge rl-badge-ok' : 'rl-badge'}>{keys[p.id] ? 'key set' : 'no key'}</span>
                                {p.getKeyUrl && (
                                    <a href={p.getKeyUrl} target="_blank" rel="noopener noreferrer">
                                        Get key <ExternalLink size={12} aria-hidden />
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'keys' && (
                <div className="rl-pane">
                    <div className="rl-hint">
                        <KeyRound size={13} aria-hidden /> Keys are stored per-account like the app's other keys and sync encrypted with your account. The main app's AI never sees them.
                    </div>
                    {RESEARCH_PROVIDERS.filter(p => !p.unusable).map(p => (
                        <KeyRow key={p.id} provider={p} hasKey={!!keys[p.id]} />
                    ))}
                </div>
            )}

            {tab === 'history' && (
                <div className="rl-pane">
                    {log.length === 0 && <div className="rl-empty">No experiments logged yet.</div>}
                    {log.map(e => (
                        <div key={e.id} className="rl-log-entry">
                            <div className="rl-result-head">
                                {new Date(e.createdAt).toLocaleString()} · {e.responses.map(r => providerName(r.providerId)).join(', ')}
                                <button className="rl-icon-btn" aria-label={`Delete log entry from ${new Date(e.createdAt).toLocaleString()}`} onClick={() => removeLogEntry(e.id)}>
                                    <Trash2 size={13} aria-hidden />
                                </button>
                            </div>
                            <pre className="rl-text">{e.prompt}</pre>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function providerName(id: string): string {
    return RESEARCH_PROVIDERS.find(p => p.id === id)?.name ?? id;
}

function KeyRow({ provider, hasKey }: { provider: ResearchProvider; hasKey: boolean }) {
    const [draft, setDraft] = useState('');
    return (
        <div className="rl-key-row">
            <span className="rl-key-name">{provider.name}</span>
            <input
                type="password"
                value={draft}
                placeholder={hasKey ? '•••••••• (key set)' : 'paste API key'}
                onChange={e => setDraft(e.target.value)}
                aria-label={`${provider.name} API key`}
            />
            <button onClick={() => { setResearchKey(provider.id, draft); setDraft(''); }}>Save</button>
            {hasKey && <button onClick={() => setResearchKey(provider.id, '')}>Clear</button>}
        </div>
    );
}
