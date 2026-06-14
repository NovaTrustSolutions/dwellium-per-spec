/**
 * HydraSplit — query EVERY configured LLM at once, side by side (2026-06-14).
 *
 * Reads the user's per-user LLM keys (integrationsStore). One pane per provider
 * that is enabled + has a key; the split grid sizes to however many that is. A
 * single prompt fans out to all of them in PARALLEL via the browser-direct
 * `callLlm` router (each pane gets its own provider-pinned bundle), so you see
 * every model's answer to the same question simultaneously.
 */
import { useMemo, useState, useCallback } from 'react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm } from '../../lib/llmClient';
import { PROVIDER_LABELS, type LlmProvider, type IntegrationsBundle } from '../../types/integrations';
import { renderSafeMarkdown } from '../../utils/safeMarkdown';
import HydraIntro from './HydraIntro';
import './HydraSplit.css';

const PROVIDER_COLOR: Record<string, string> = {
    anthropic: '#d97757', openai: '#19c37d', gemini: '#4d8aff', local: '#a855f7', custom: '#e7c879',
};

interface Head { provider: LlmProvider; label: string; model: string; }

function configuredHeads(llm: IntegrationsBundle['llm']): Head[] {
    const heads: Head[] = [];
    if (llm.anthropic?.enabled && llm.anthropic.apiKey) heads.push({ provider: 'anthropic', label: PROVIDER_LABELS.anthropic, model: llm.anthropic.model });
    if (llm.openai?.enabled && llm.openai.apiKey) heads.push({ provider: 'openai', label: PROVIDER_LABELS.openai, model: llm.openai.model });
    if (llm.gemini?.enabled && llm.gemini.apiKey) heads.push({ provider: 'gemini', label: PROVIDER_LABELS.gemini, model: llm.gemini.model });
    if (llm.local?.enabled && llm.local.baseUrl) heads.push({ provider: 'local', label: PROVIDER_LABELS.local, model: llm.local.model });
    if (llm.custom?.enabled && llm.custom.baseUrl && llm.custom.apiKey && llm.custom.model) heads.push({ provider: 'custom', label: PROVIDER_LABELS.custom, model: llm.custom.model });
    return heads;
}

interface PaneState { status: 'idle' | 'loading' | 'done' | 'error'; content: string; ms: number; }

export default function HydraSplit() {
    const { integrations: bundle } = useIntegrations();
    const llm = bundle.llm;
    const heads = useMemo(() => configuredHeads(llm), [llm]);
    const [prompt, setPrompt] = useState('');
    const [panes, setPanes] = useState<Record<string, PaneState>>({});
    const [running, setRunning] = useState(false);

    const ask = useCallback(async () => {
        const q = prompt.trim();
        if (!q || running || heads.length === 0) return;
        setRunning(true);
        setPanes(Object.fromEntries(heads.map((h) => [h.provider, { status: 'loading', content: '', ms: 0 }])));
        await Promise.all(heads.map(async (h) => {
            const t0 = performance.now();
            try {
                // Pin the bundle to THIS provider so callLlm routes here.
                const res = await callLlm({ prompt: q, systemPrompt: 'You are a concise, helpful assistant.' }, { ...llm, active: h.provider });
                const ms = Math.round(performance.now() - t0);
                setPanes((p) => ({ ...p, [h.provider]: { status: res ? 'done' : 'error', content: res?.text ?? '(no response — provider returned nothing)', ms } }));
            } catch (e) {
                const ms = Math.round(performance.now() - t0);
                setPanes((p) => ({ ...p, [h.provider]: { status: 'error', content: (e as Error).message, ms } }));
            }
        }));
        setRunning(false);
    }, [prompt, running, heads, llm]);

    return (
        <div className="hyd">
            <HydraIntro />
            <div className="hyd__bar">
                <div className="hyd__title">🐉 Hydra · {heads.length} {heads.length === 1 ? 'head' : 'heads'}</div>
                <textarea
                    className="hyd__input"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(); }}
                    placeholder={heads.length ? 'Ask every configured model at once… (⌘/Ctrl+Enter)' : 'No LLM keys configured yet'}
                    rows={2}
                />
                <button className="hyd__send" onClick={ask} disabled={running || !heads.length || !prompt.trim()}>
                    {running ? 'Querying…' : `Ask all ${heads.length}`}
                </button>
            </div>

            {heads.length === 0 ? (
                <div className="hyd__empty">
                    No LLM providers are configured. Open <b>Control Panel → API Keys</b> and add at least one
                    provider key (Anthropic, OpenAI, Gemini, Local, or Custom). Each enabled key becomes a Hydra head here.
                </div>
            ) : (
                <div className="hyd__grid" style={{ gridTemplateColumns: `repeat(${Math.min(heads.length, 3)}, minmax(0, 1fr))` }}>
                    {heads.map((h) => {
                        const st = panes[h.provider] ?? { status: 'idle', content: '', ms: 0 };
                        const color = PROVIDER_COLOR[h.provider] || 'var(--accent)';
                        return (
                            <div key={h.provider} className="hyd__pane" style={{ ['--head' as string]: color }}>
                                <div className="hyd__pane-hdr">
                                    <span className="hyd__dot" style={{ background: color }} />
                                    <span className="hyd__pane-name">{h.label}</span>
                                    <span className="hyd__pane-model">{h.model}</span>
                                    {st.status === 'done' && <span className="hyd__ms">{st.ms} ms</span>}
                                </div>
                                <div className="hyd__pane-body">
                                    {st.status === 'idle' && <div className="hyd__idle">Ready.</div>}
                                    {st.status === 'loading' && <div className="hyd__loading">Thinking…</div>}
                                    {st.status === 'error' && <div className="hyd__err">{st.content}</div>}
                                    {st.status === 'done' && <div className="hyd__md" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(st.content) }} />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
