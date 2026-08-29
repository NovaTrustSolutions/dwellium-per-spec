/**
 * OpenOPC console (Automation Hub · AI Company).
 *
 * A launch form + a live org-chart / kanban / escalation view over a run of
 * OpenOPC's `opc exec --stream-json`. Dwellium NEVER runs OpenOPC itself — the
 * form builds the exact invocation and POSTs it to the OpenOPC *runner* the
 * operator configured (a sandbox/VM they control, OPC_RUNNER_URL on the
 * backend); the backend relays the runner's stream-json to us over SSE. When
 * the runner is unconfigured every backend route answers 503 needsSetup and we
 * render the install/setup state instead of ever calling a runner that isn't there.
 *
 * The safety banner and the "runs in your sandbox, never against tenant data"
 * framing below are load-bearing, not decoration — OpenOPC agents execute code,
 * edit files and drive a browser autonomously.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AlertTriangle, Bot, Inbox, Play, Square, Terminal, X } from 'lucide-react';
import { API_BASE } from '../../config';
import './OpenOpcPanel.css';
import {
    OPC_COLUMNS,
    answerEscalation,
    emptyOpcState,
    normalizeOpcEvent,
    reduceOpc,
    type OpcRawEvent,
    type OpcState,
} from './opcEvents';

const API_OPC = `${API_BASE}/api/opc`;

type Mode = 'task' | 'company';
type Backend = 'native' | 'codex' | 'claude_code' | 'cursor' | 'opencode';

interface LaunchForm {
    goal: string;
    mode: Mode;
    companyProfile: string;
    agentBackend: Backend;
    project: string;
}

/** Build the exact `opc exec --stream-json` invocation the runner will execute. */
export function buildOpcCommand(f: LaunchForm): string {
    const parts = ['opc', 'exec', '-p', f.project, '--mode', f.mode];
    if (f.mode === 'company') parts.push('--company-profile', f.companyProfile);
    parts.push('--agent', f.agentBackend, '--stream-json', JSON.stringify(f.goal || ''));
    return parts.join(' ');
}

type ConfigState = 'checking' | 'ok' | 'needsSetup';

// The event reducer, adapted to raw lines the SSE relay hands us.
function opcReducer(state: OpcState, action: { type: 'raw'; raw: OpcRawEvent } | { type: 'reset' } | { type: 'answer'; id: string; answer: string }): OpcState {
    if (action.type === 'reset') return emptyOpcState();
    if (action.type === 'answer') return answerEscalation(state, action.id, action.answer);
    const ev = normalizeOpcEvent(action.raw);
    return ev ? reduceOpc(state, ev) : state;
}

export default function OpenOpcPanel({ envVars, onClose }: { envVars: Record<string, string>; onClose: () => void }) {
    const [config, setConfig] = useState<ConfigState>('checking');
    const [form, setForm] = useState<LaunchForm>({
        goal: '',
        mode: (envVars.OPC_MODE as Mode) || 'company',
        companyProfile: envVars.OPC_COMPANY_PROFILE || 'corporate',
        agentBackend: (envVars.OPC_AGENT_BACKEND as Backend) || 'native',
        project: envVars.OPC_PROJECT || 'dwellium',
    });
    const [runId, setRunId] = useState<string | null>(null);
    const [launching, setLaunching] = useState(false);
    const [launchError, setLaunchError] = useState<string | null>(null);
    const [state, dispatch] = useReducer(opcReducer, undefined, emptyOpcState);
    const esRef = useRef<EventSource | null>(null);

    // On mount, ask the backend whether a runner is configured (GET /runs → 503 needsSetup when not).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API_OPC}/runs`, { credentials: 'include' });
                if (cancelled) return;
                if (res.status === 503) { setConfig('needsSetup'); return; }
                setConfig(res.ok ? 'ok' : 'needsSetup');
            } catch {
                if (!cancelled) setConfig('needsSetup'); // backend offline — never invent a runner
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Tear down the SSE stream on unmount.
    useEffect(() => () => { esRef.current?.close(); }, []);

    const openStream = useCallback((id: string) => {
        esRef.current?.close();
        const es = new EventSource(`${API_OPC}/runs/${encodeURIComponent(id)}/stream`, { withCredentials: true });
        es.onmessage = (e) => {
            try { dispatch({ type: 'raw', raw: JSON.parse(e.data) as OpcRawEvent }); } catch { /* keep-alive / non-JSON line */ }
        };
        es.onerror = () => { /* run ended or connection dropped — leave the last state on screen */ es.close(); };
        esRef.current = es;
    }, []);

    const launch = useCallback(async () => {
        setLaunching(true);
        setLaunchError(null);
        dispatch({ type: 'reset' });
        try {
            const res = await fetch(`${API_OPC}/runs`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 503) { setConfig('needsSetup'); return; }
            if (!res.ok || !data?.data?.id) { setLaunchError(data?.error || `Runner answered ${res.status}`); return; }
            setRunId(data.data.id);
            openStream(data.data.id);
        } catch (err) {
            setLaunchError(`Runner unreachable: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setLaunching(false);
        }
    }, [form, openStream]);

    const respond = useCallback(async (escalationId: string, answer: string) => {
        if (!runId) return;
        dispatch({ type: 'answer', id: escalationId, answer }); // optimistic
        try {
            await fetch(`${API_OPC}/runs/${encodeURIComponent(runId)}/input`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ escalationId, answer }),
            });
        } catch { /* runner will re-escalate if this didn't land */ }
    }, [runId]);

    const stop = useCallback(() => { esRef.current?.close(); esRef.current = null; setRunId(null); }, []);

    const roles = Object.values(state.roles);
    const items = Object.values(state.workItems);
    const pendingEscalations = state.escalations.filter(e => !e.answered);

    return (
        <div className="opc" role="region" aria-label="OpenOPC AI Company console">
            <div className="opc__head">
                <span className="opc__title"><Bot size={16} aria-hidden /> AI Company (OpenOPC)</span>
                <button className="opc__close" onClick={onClose} aria-label="Close console"><X size={15} aria-hidden /></button>
            </div>

            {/* ── Safety banner (mandatory) ── */}
            <div className="opc__safety" role="note">
                <AlertTriangle size={15} aria-hidden />
                <div>
                    <strong>OpenOPC agents execute code, edit files, and drive a browser autonomously.</strong>{' '}
                    Runs happen in the OpenOPC runner you configure (a sandbox/VM you control), never inside Dwellium
                    or against tenant/financial data. Point it at a scratch project.
                </div>
            </div>

            {config === 'needsSetup' && (
                <div className="opc__setup">
                    <h4>The OpenOPC runner isn’t configured yet</h4>
                    <p>Dwellium never runs OpenOPC itself — it relays a runner you host on a sandbox or VM you control.</p>
                    <ol>
                        <li>On a scratch machine: <code>uv venv &amp;&amp; uv pip install -e .</code> in a checkout of OpenOPC, then <code>opc project create {form.project}</code>.</li>
                        <li>Add an LLM key to <code>.opc/config/llm_config.yaml</code> (any OpenAI-compatible provider). <strong>A live run needs an LLM key.</strong></li>
                        <li>Stand up the thin HTTP shim (see <code>tools/openopc/README.md</code>) and set <code>OPC_RUNNER_URL</code> on the Dwellium backend to point here.</li>
                    </ol>
                    <p className="opc__setup-safe">The runner runs on <strong>your</strong> sandbox against an isolated project dir — no Dwellium data, no tenant/financial data.</p>
                </div>
            )}

            {config !== 'needsSetup' && (
                <>
                    {/* ── Launch form ── */}
                    <div className="opc__launch">
                        <label className="opc__field opc__field--wide">
                            <span>Goal</span>
                            <textarea
                                className="opc__textarea"
                                rows={3}
                                placeholder="e.g. Draft a vendor-onboarding checklist and a one-page SOP, then review it."
                                value={form.goal}
                                onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
                            />
                        </label>
                        <div className="opc__field-row">
                            <label className="opc__field">
                                <span>Mode</span>
                                <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value as Mode }))}>
                                    <option value="task">task — one agent / team</option>
                                    <option value="company">company — recruit an org</option>
                                </select>
                            </label>
                            <label className="opc__field">
                                <span>Company profile</span>
                                <input type="text" value={form.companyProfile} disabled={form.mode !== 'company'} onChange={e => setForm(f => ({ ...f, companyProfile: e.target.value }))} />
                            </label>
                            <label className="opc__field">
                                <span>Agent backend</span>
                                <select value={form.agentBackend} onChange={e => setForm(f => ({ ...f, agentBackend: e.target.value as Backend }))}>
                                    <option value="native">native</option>
                                    <option value="codex">codex</option>
                                    <option value="claude_code">claude_code</option>
                                    <option value="cursor">cursor</option>
                                    <option value="opencode">opencode</option>
                                </select>
                            </label>
                            <label className="opc__field">
                                <span>Project</span>
                                <input type="text" value={form.project} onChange={e => setForm(f => ({ ...f, project: e.target.value }))} />
                            </label>
                        </div>
                        <div className="opc__cmd" aria-label="Command the runner will execute"><Terminal size={12} aria-hidden /> <code>{buildOpcCommand(form)}</code></div>
                        {launchError && <div className="opc__error" role="alert">{launchError}</div>}
                        <div className="opc__launch-actions">
                            <button className="opc__btn opc__btn--go" onClick={launch} disabled={launching || !form.goal.trim()}>
                                <Play size={13} aria-hidden /> {launching ? 'Launching…' : 'Launch run'}
                            </button>
                            {runId && <button className="opc__btn" onClick={stop}><Square size={13} aria-hidden /> Detach</button>}
                            {runId && <span className="opc__runid">run {runId}{state.done ? ' · done' : ' · live'}</span>}
                        </div>
                    </div>

                    {/* ── Escalation inbox ── */}
                    {pendingEscalations.length > 0 && (
                        <div className="opc__inbox">
                            <div className="opc__inbox-head"><Inbox size={14} aria-hidden /> Escalations — the runtime needs a human decision</div>
                            {pendingEscalations.map(esc => (
                                <div key={esc.id} className="opc__esc">
                                    <p className="opc__esc-msg">{esc.message}</p>
                                    <div className="opc__esc-actions">
                                        {esc.options.length > 0
                                            ? esc.options.map(o => (
                                                <button key={o.id} className="opc__btn opc__btn--sm" onClick={() => respond(esc.id, o.id)}>{o.label}</button>
                                            ))
                                            : <EscalationReply onSend={a => respond(esc.id, a)} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Live org + kanban ── */}
                    {(roles.length > 0 || items.length > 0) ? (
                        <div className="opc__live">
                            <section className="opc__org">
                                <h4>Org chart</h4>
                                <ul className="opc__roles">
                                    {roles.map(r => (
                                        <li key={r.id} className={`opc__role opc__role--${r.status}`}>
                                            <span className="opc__role-title">{r.title}</span>
                                            <span className="opc__role-status">{r.status}</span>
                                            {r.workItemId && <span className="opc__role-item">owns {state.workItems[r.workItemId]?.title ?? r.workItemId}</span>}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                            <section className="opc__kanban">
                                <h4>Work items</h4>
                                <div className="opc__cols">
                                    {OPC_COLUMNS.map(col => {
                                        const colItems = items.filter(i => i.column === col.key);
                                        return (
                                            <div key={col.key} className={`opc__col opc__col--${col.key}`}>
                                                <div className="opc__col-head">{col.label} <span>{colItems.length}</span></div>
                                                {colItems.map(it => (
                                                    <div key={it.id} className="opc__card">
                                                        <div className="opc__card-title">{it.title}</div>
                                                        {it.ownerRoleId && <div className="opc__card-owner">{state.roles[it.ownerRoleId]?.title ?? it.ownerRoleId}</div>}
                                                        {it.dependsOn.length > 0 && <div className="opc__card-dep">waits on {it.dependsOn.length}</div>}
                                                        {it.lastVerdict && <div className={`opc__card-verdict opc__card-verdict--${it.lastVerdict}`}>{it.lastVerdict}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </div>
                    ) : runId ? (
                        <div className="opc__waiting">Waiting for the runner’s first events…</div>
                    ) : null}

                    {state.error && <div className="opc__error" role="alert">Run error: {state.error}</div>}
                </>
            )}
        </div>
    );
}

/** Free-text reply for an escalation with no preset options. */
function EscalationReply({ onSend }: { onSend: (answer: string) => void }) {
    const [text, setText] = useState('');
    return (
        <div className="opc__esc-reply">
            <input type="text" value={text} placeholder="Type an answer…" onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onSend(text.trim()); setText(''); } }} />
            <button className="opc__btn opc__btn--sm" disabled={!text.trim()} onClick={() => { if (text.trim()) { onSend(text.trim()); setText(''); } }}>Send</button>
        </div>
    );
}
