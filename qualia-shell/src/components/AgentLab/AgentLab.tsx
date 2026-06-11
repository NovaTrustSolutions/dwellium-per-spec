/**
 * AgentLab — the "AI space". Spawn discipline personas + teams, hand them a
 * goal (and sources), and an orchestrator decomposes the work, each specialist
 * completes it, outputs are verified against the sources, and the orchestrator
 * merges a final product. Every run feeds Hermes so the agents improve.
 */
import { useCallback, useContext, useMemo, useState } from 'react';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm } from '../../lib/llmClient';
import {
    hermesLearningUserIdHolder,
    recordRun,
    rateRun,
    relevantPastRuns,
    formatFewShot,
} from '../HonchoHermesPanel/hermesLearningStore';
import { useAgentLab, newPersonaId, newTeamId } from '../../lib/agents/agentTeamsStore';
import { type Persona, type AgentTeam, type Discipline, ORCHESTRATOR_ID, findPersona, defaultDossier, resolveAvatar, resolveNeuralVideo } from '../../lib/agents/personas';
import AvatarDossier from './AvatarDossier';
import PersonaWorkspace, { type WorkspaceView } from './PersonaWorkspace';
import { recordRun as recordPersonaRun, addTask, startTask, completeTask, logAudit, formatMemory } from '../../lib/agents/personaWorkStore';
import { runTeam, runPersona, type OrchestratorDeps, type RunEvent, type TeamRunResult, type PersonaOutput } from '../../lib/agents/orchestrator';
import { getIcon } from '../Sidebar/iconMap';
import './AgentLab.css';

const DISCIPLINES: Discipline[] = ['research', 'legal', 'engineering', 'data', 'comms', 'strategy', 'creative', 'operations', 'general'];

function Icon({ k, size = 16 }: { k: string; size?: number }) {
    const L = getIcon(k);
    return L ? <L size={size} strokeWidth={1.75} /> : <span>{k}</span>;
}

export default function AgentLab() {
    const userCtx = useContext(UserContext);
    hermesLearningUserIdHolder.current = userCtx?.user?.id ?? null; // record/recall to this user
    const { integrations } = useIntegrations();
    const { personas, teams, upsertPersona, deletePersona, upsertTeam, deleteTeam } = useAgentLab();

    const llmReady = useMemo(() => {
        const llm = integrations.llm;
        return !!llm.active && Boolean(
            llm.anthropic?.apiKey || llm.openai?.apiKey || llm.gemini?.apiKey || llm.local?.baseUrl || llm.custom?.apiKey,
        );
    }, [integrations.llm]);

    const [sel, setSel] = useState<{ kind: 'team' | 'persona'; id: string } | null>(
        teams[0] ? { kind: 'team', id: teams[0].id } : null,
    );
    const [goal, setGoal] = useState('');
    const [sources, setSources] = useState('');
    const [running, setRunning] = useState(false);
    const [events, setEvents] = useState<RunEvent[]>([]);
    const [teamResult, setTeamResult] = useState<TeamRunResult | null>(null);
    const [soloResult, setSoloResult] = useState<PersonaOutput | null>(null);
    const [lastRunId, setLastRunId] = useState<string | null>(null);
    const [rating, setRating] = useState<number | null>(null);
    const [editing, setEditing] = useState<Persona | null>(null);
    const [teamEditing, setTeamEditing] = useState<AgentTeam | null>(null);
    const [personaTab, setPersonaTab] = useState<'dossier' | WorkspaceView>('dossier');
    const [runningTaskId, setRunningTaskId] = useState<string | null>(null);

    const deps: OrchestratorDeps = useMemo(() => ({
        invoke: async (req) => {
            const r = await callLlm(req, integrations.llm);
            return r?.text ?? null;
        },
        recall: (prompt) => formatFewShot(relevantPastRuns(prompt, 3)),
        record: (input) => { recordRun(input); },
    }), [integrations.llm]);

    const resetRun = () => { setEvents([]); setTeamResult(null); setSoloResult(null); setLastRunId(null); setRating(null); };

    const run = useCallback(async () => {
        if (!sel || running || !goal.trim()) return;
        resetRun();
        setRunning(true);
        try {
            if (sel.kind === 'team') {
                const team = teams.find(t => t.id === sel.id);
                if (!team) return;
                // Drop each member's subtask into that persona's task list (orchestrator-assigned),
                // start it, then complete it with its duration as the run proceeds.
                const memberTaskIds = new Map<string, string>();
                const result = await runTeam({
                    goal, sources, team, personas, deps,
                    onEvent: e => setEvents(prev => [...prev, e]),
                    onMemberTask: m => {
                        if (m.phase === 'assigned') {
                            memberTaskIds.set(m.personaId, addTask(m.personaId, m.title, 'orchestrator'));
                        } else if (m.phase === 'start') {
                            const id = memberTaskIds.get(m.personaId);
                            if (id) startTask(m.personaId, id);
                        } else {
                            const id = memberTaskIds.get(m.personaId);
                            if (id) completeTask(m.personaId, id, m.result);
                            recordPersonaRun(m.personaId, `Team task: ${m.title} → ${(m.result ?? '').slice(0, 140)}`, m.durationMs ?? 0, m.ok ? 'success' : 'fail');
                        }
                    },
                });
                setTeamResult(result);
                if (!result.error) {
                    const rec = recordRun({ prompt: goal, taskType: 'planning', outcome: 'success', summary: result.final.slice(0, 200), toolsUsed: [team.id] });
                    setLastRunId(rec.id);
                }
            } else {
                const persona = findPersona(personas, sel.id);
                if (!persona) return;
                setEvents([{ phase: 'execute', personaId: persona.id, message: `${persona.name} is working…` }]);
                const t0 = performance.now();
                // Inject this persona's working memory so it gets better with use.
                const augmented = { ...persona, systemPrompt: persona.systemPrompt + formatMemory(persona.id) };
                const out = await runPersona({ goal, sources, persona: augmented, deps });
                const durationMs = performance.now() - t0;
                setSoloResult(out);
                const rec = recordRun({ prompt: goal, taskType: 'general', outcome: out.output ? 'success' : 'fail', summary: out.verified.slice(0, 200), toolsUsed: [persona.id] });
                setLastRunId(rec.id);
                recordPersonaRun(persona.id, `Goal: ${goal} → ${out.verified.slice(0, 160)}`, durationMs, out.output ? 'success' : 'fail');
            }
        } finally {
            setRunning(false);
        }
    }, [sel, running, goal, sources, teams, personas, deps]);

    const rate = (value: number) => {
        if (!lastRunId) return;
        rateRun(lastRunId, value);
        setRating(value);
    };

    const selectedTeam = sel?.kind === 'team' ? teams.find(t => t.id === sel.id) : undefined;
    const selectedPersona = sel?.kind === 'persona' ? findPersona(personas, sel.id) : undefined;

    // Run a single task the persona was given (timed → completed with duration).
    const runTask = useCallback(async (taskId: string, taskTitle: string) => {
        if (!selectedPersona || running || runningTaskId) return;
        setRunningTaskId(taskId);
        startTask(selectedPersona.id, taskId);
        logAudit(selectedPersona.id, 'Task started', taskTitle);
        const t0 = performance.now();
        try {
            const augmented = { ...selectedPersona, systemPrompt: selectedPersona.systemPrompt + formatMemory(selectedPersona.id) };
            const out = await runPersona({ goal: taskTitle, sources, persona: augmented, deps });
            const durationMs = performance.now() - t0;
            completeTask(selectedPersona.id, taskId, out.verified.slice(0, 400));
            recordPersonaRun(selectedPersona.id, `Task: ${taskTitle} → ${out.verified.slice(0, 140)}`, durationMs, out.output ? 'success' : 'fail');
            setSoloResult(out);
        } finally {
            setRunningTaskId(null);
        }
    }, [selectedPersona, running, runningTaskId, sources, deps]);

    // ── persona / team editors ──
    const startNewPersona = () => {
        const p: Persona = { id: newPersonaId(), name: 'New Specialist', discipline: 'general', icon: 'bot', color: '#6366f1', tagline: 'Describe this specialist', systemPrompt: 'You are a specialist. ' };
        setEditing(p);
    };
    const savePersona = () => { if (editing) { upsertPersona(editing); setSel({ kind: 'persona', id: editing.id }); setEditing(null); } };

    const startNewTeam = () => {
        const t: AgentTeam = { id: newTeamId(), name: 'New Team', icon: 'users', memberIds: [], orchestratorId: ORCHESTRATOR_ID };
        setTeamEditing(t);
    };
    const saveTeam = () => { if (teamEditing && teamEditing.memberIds.length > 0) { upsertTeam(teamEditing); setSel({ kind: 'team', id: teamEditing.id }); setTeamEditing(null); } };

    return (
        <div className="alab">
            <aside className="alab-rail">
                <div className="alab-rail-sec">
                    <div className="alab-rail-head"><span>Teams</span><button className="alab-add" onClick={startNewTeam} title="New team">+</button></div>
                    {teams.map(t => (
                        <button key={t.id} className={`alab-item ${sel?.kind === 'team' && sel.id === t.id ? 'alab-item--active' : ''}`} onClick={() => { setSel({ kind: 'team', id: t.id }); setEditing(null); setTeamEditing(null); resetRun(); }}>
                            <Icon k={t.icon} /><span className="alab-item-name">{t.name}</span><span className="alab-item-meta">{t.memberIds.length}</span>
                        </button>
                    ))}
                </div>
                <div className="alab-rail-sec">
                    <div className="alab-rail-head"><span>Personas</span><button className="alab-add" onClick={startNewPersona} title="New persona">+</button></div>
                    {personas.filter(p => p.id !== ORCHESTRATOR_ID).map(p => (
                        <button key={p.id} className={`alab-item ${sel?.kind === 'persona' && sel.id === p.id ? 'alab-item--active' : ''}`} onClick={() => { setSel({ kind: 'persona', id: p.id }); setEditing(null); setTeamEditing(null); setPersonaTab('dossier'); resetRun(); }}>
                            <span className="alab-dot" style={{ background: p.color }} /><Icon k={p.icon} /><span className="alab-item-name">{p.name}</span>
                        </button>
                    ))}
                </div>
            </aside>

            <main className="alab-main">
                <div className="alab-topbar">
                    <h2 className="alab-title">Agent Lab</h2>
                    <span className={`alab-llm ${llmReady ? 'alab-llm--ok' : 'alab-llm--off'}`}>
                        {llmReady ? 'LLM ready' : 'No LLM key'}
                    </span>
                </div>
                {!llmReady && (
                    <div className="alab-banner">
                        Add an LLM key in <strong>Settings → API Keys</strong> to run agents. You can still create personas + teams now.
                        <button className="alab-banner-btn" onClick={() => window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: 'control-panel' } }))}>Open Settings</button>
                    </div>
                )}

                {editing ? (
                    <PersonaEditor persona={editing} onChange={setEditing} onSave={savePersona} onCancel={() => setEditing(null)}
                        onDelete={editing.builtin ? undefined : () => { deletePersona(editing.id); setEditing(null); setSel(null); }} />
                ) : teamEditing ? (
                    <TeamEditor team={teamEditing} personas={personas} onChange={setTeamEditing} onSave={saveTeam} onCancel={() => setTeamEditing(null)}
                        onDelete={teamEditing.builtin ? undefined : () => { deleteTeam(teamEditing.id); setTeamEditing(null); setSel(null); }} />
                ) : selectedTeam ? (
                    <>
                        <div className="alab-sel-head">
                            <div><Icon k={selectedTeam.icon} size={18} /> <strong>{selectedTeam.name}</strong></div>
                            <div className="alab-members">
                                {selectedTeam.memberIds.map(id => findPersona(personas, id)).filter((p): p is Persona => !!p).map(p => (
                                    <span key={p.id} className="alab-chip" style={{ borderColor: p.color }}><Icon k={p.icon} size={12} />{p.name}</span>
                                ))}
                                {!selectedTeam.builtin && <button className="alab-edit-link" onClick={() => setTeamEditing(selectedTeam)}>Edit</button>}
                            </div>
                        </div>
                        <RunPanel goal={goal} setGoal={setGoal} sources={sources} setSources={setSources} run={run} running={running} runLabel="Run team" disabled={!llmReady} />
                        <RunOutput events={events} teamResult={teamResult} soloResult={null} running={running} lastRunId={lastRunId} rating={rating} onRate={rate} />
                    </>
                ) : selectedPersona ? (
                    <>
                        <div className="alab-sel-head">
                            <div><span className="alab-dot" style={{ background: selectedPersona.color }} /> <strong>{selectedPersona.name}</strong> <span className="alab-tagline">{selectedPersona.tagline}</span></div>
                            {!selectedPersona.builtin && <button className="alab-edit-link" onClick={() => setEditing(selectedPersona)}>Edit</button>}
                        </div>
                        <div className="alab-ptabs">
                            {(['dossier', 'tools', 'tasks', 'memory', 'audit'] as const).map(tk => (
                                <button key={tk} type="button" className={`alab-ptab ${personaTab === tk ? 'alab-ptab--active' : ''}`} onClick={() => setPersonaTab(tk)}>
                                    {({ dossier: 'Dossier', tools: 'Tools', tasks: 'Tasks', memory: 'Memory', audit: 'Audit' } as const)[tk]}
                                </button>
                            ))}
                        </div>
                        {personaTab === 'dossier' ? (
                            <AvatarDossier
                                dossier={selectedPersona.dossier ?? defaultDossier(selectedPersona)}
                                onChange={d => upsertPersona({ ...selectedPersona, dossier: d })}
                                avatar={resolveAvatar(selectedPersona)}
                                onAvatarChange={a => upsertPersona({ ...selectedPersona, avatar: a })}
                                neuralVideo={resolveNeuralVideo(selectedPersona)}
                                onNeuralVideoChange={v => upsertPersona({ ...selectedPersona, neuralVideo: v })}
                            />
                        ) : (
                            <PersonaWorkspace persona={selectedPersona} view={personaTab} onPersonaChange={upsertPersona} onRunTask={runTask} runningTaskId={runningTaskId} />
                        )}
                        <RunPanel goal={goal} setGoal={setGoal} sources={sources} setSources={setSources} run={run} running={running} runLabel={`Run ${selectedPersona.name}`} disabled={!llmReady} />
                        <RunOutput events={events} teamResult={null} soloResult={soloResult} running={running} lastRunId={lastRunId} rating={rating} onRate={rate} />
                    </>
                ) : (
                    <div className="alab-empty">Pick a team or persona on the left, or create one with “+”.</div>
                )}
            </main>
        </div>
    );
}

function RunPanel(props: { goal: string; setGoal: (v: string) => void; sources: string; setSources: (v: string) => void; run: () => void; running: boolean; runLabel: string; disabled: boolean }) {
    return (
        <div className="alab-runpanel">
            <label className="alab-label">Goal</label>
            <textarea className="alab-goal" value={props.goal} onChange={e => props.setGoal(e.target.value)} placeholder="What should the team accomplish?" />
            <label className="alab-label">Sources <span className="alab-label-hint">(optional — outputs are verified against these)</span></label>
            <textarea className="alab-sources" value={props.sources} onChange={e => props.setSources(e.target.value)} placeholder="Paste reference text, notes, or facts the agents must rely on…" />
            <button className="alab-run" onClick={props.run} disabled={props.running || props.disabled || !props.goal.trim()}>
                {props.running ? 'Running…' : props.runLabel}
            </button>
        </div>
    );
}

function RunOutput(props: { events: RunEvent[]; teamResult: TeamRunResult | null; soloResult: PersonaOutput | null; running: boolean; lastRunId: string | null; rating: number | null; onRate: (v: number) => void }) {
    const { events, teamResult, soloResult, running } = props;
    if (events.length === 0 && !teamResult && !soloResult) return null;
    const final = teamResult?.final;
    const outputs = teamResult?.outputs ?? (soloResult ? [soloResult] : []);
    return (
        <div className="alab-output">
            {running && (
                <div className="alab-phases">
                    {events.map((e, i) => <div key={i} className="alab-phase">{e.message}</div>)}
                </div>
            )}
            {teamResult?.error && <div className="alab-error">{teamResult.error}</div>}
            {outputs.length > 0 && (
                <div className="alab-contribs">
                    {outputs.map(o => (
                        <details key={o.personaId} className="alab-contrib">
                            <summary>{o.personaName}{!o.supported && <span className="alab-unverified"> · unverified claims</span>}</summary>
                            <pre className="alab-pre">{o.verified}</pre>
                        </details>
                    ))}
                </div>
            )}
            {final && (
                <div className="alab-final">
                    <div className="alab-final-head">
                        <span>Final product</span>
                        <span className="alab-rate">
                            <button className={`alab-rate-btn ${props.rating === 1 ? 'alab-rate-btn--on' : ''}`} onClick={() => props.onRate(1)} disabled={!props.lastRunId} title="Good — Hermes learns from this">👍</button>
                            <button className={`alab-rate-btn ${props.rating === -1 ? 'alab-rate-btn--on' : ''}`} onClick={() => props.onRate(-1)} disabled={!props.lastRunId} title="Bad">👎</button>
                        </span>
                    </div>
                    <pre className="alab-pre alab-pre--final">{final}</pre>
                </div>
            )}
        </div>
    );
}

function PersonaEditor(props: { persona: Persona; onChange: (p: Persona) => void; onSave: () => void; onCancel: () => void; onDelete?: () => void }) {
    const { persona, onChange } = props;
    return (
        <div className="alab-editor">
            <h3>{persona.builtin ? 'Persona (built-in — read-only)' : 'Edit persona'}</h3>
            <label className="alab-label">Name</label>
            <input className="alab-input" value={persona.name} disabled={persona.builtin} onChange={e => onChange({ ...persona, name: e.target.value })} />
            <label className="alab-label">Discipline</label>
            <select className="alab-input" value={persona.discipline} disabled={persona.builtin} onChange={e => onChange({ ...persona, discipline: e.target.value as Discipline })}>
                {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <label className="alab-label">Tagline</label>
            <input className="alab-input" value={persona.tagline} disabled={persona.builtin} onChange={e => onChange({ ...persona, tagline: e.target.value })} />
            <label className="alab-label">System prompt</label>
            <textarea className="alab-input alab-input--tall" value={persona.systemPrompt} disabled={persona.builtin} onChange={e => onChange({ ...persona, systemPrompt: e.target.value })} />
            <div className="alab-editor-actions">
                {!persona.builtin && <button className="alab-run" onClick={props.onSave}>Save</button>}
                <button className="alab-btn" onClick={props.onCancel}>{persona.builtin ? 'Close' : 'Cancel'}</button>
                {props.onDelete && <button className="alab-btn alab-btn--danger" onClick={props.onDelete}>Delete</button>}
            </div>
        </div>
    );
}

function TeamEditor(props: { team: AgentTeam; personas: Persona[]; onChange: (t: AgentTeam) => void; onSave: () => void; onCancel: () => void; onDelete?: () => void }) {
    const { team, personas, onChange } = props;
    const toggle = (id: string) => {
        const has = team.memberIds.includes(id);
        onChange({ ...team, memberIds: has ? team.memberIds.filter(m => m !== id) : [...team.memberIds, id] });
    };
    return (
        <div className="alab-editor">
            <h3>{team.builtin ? 'Team (built-in)' : 'Edit team'}</h3>
            <label className="alab-label">Name</label>
            <input className="alab-input" value={team.name} disabled={team.builtin} onChange={e => onChange({ ...team, name: e.target.value })} />
            <label className="alab-label">Members</label>
            <div className="alab-member-grid">
                {personas.filter(p => p.id !== ORCHESTRATOR_ID).map(p => (
                    <label key={p.id} className={`alab-member ${team.memberIds.includes(p.id) ? 'alab-member--on' : ''}`}>
                        <input type="checkbox" checked={team.memberIds.includes(p.id)} disabled={team.builtin} onChange={() => toggle(p.id)} />
                        <Icon k={p.icon} size={13} /> {p.name}
                    </label>
                ))}
            </div>
            <div className="alab-editor-actions">
                {!team.builtin && <button className="alab-run" onClick={props.onSave} disabled={team.memberIds.length === 0}>Save</button>}
                <button className="alab-btn" onClick={props.onCancel}>{team.builtin ? 'Close' : 'Cancel'}</button>
                {props.onDelete && <button className="alab-btn alab-btn--danger" onClick={props.onDelete}>Delete</button>}
            </div>
        </div>
    );
}
