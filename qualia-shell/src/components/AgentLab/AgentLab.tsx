/**
 * AgentLab — the "AI space". Spawn discipline personas + teams, hand them a
 * goal (and sources), and an orchestrator decomposes the work, each specialist
 * completes it, outputs are verified against the sources, and the orchestrator
 * merges a final product. Every run feeds Hermes so the agents improve.
 */
import { useCallback, useContext, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Bot, ThumbsDown, ThumbsUp } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, applyModelPreference, hasActiveLlm } from '../../lib/llmClient';
import {
    hermesLearningUserIdHolder,
    recordRun,
    rateRun,
    relevantPastRuns,
    formatFewShot,
} from '../HonchoHermesPanel/hermesLearningStore';
import { useAgentLab, newPersonaId, newTeamId, agentTeamsStore } from '../../lib/agents/agentTeamsStore';
import { type Persona, type AgentTeam, type Discipline, ORCHESTRATOR_ID, findPersona, defaultDossier, resolveAvatar, resolveNeuralVideo } from '../../lib/agents/personas';
import AvatarDossier from './AvatarDossier';
import PersonaWorkspace, { type WorkspaceView } from './PersonaWorkspace';
import {
    recordRun as recordPersonaRun, addTask, startTask, completeTask, failTask, logAudit, formatMemory, usePersonaWork,
} from '../../lib/agents/personaWorkStore';
import { personaStats } from '../../lib/agents/hermesStatus';
import {
    runTeam, runPersona, describeLlmFailure, NO_RESPONSE_MESSAGE,
    type OrchestratorDeps, type RunEvent, type TeamRunResult, type PersonaOutput,
} from '../../lib/agents/orchestrator';
import { AGENT_SKILLS, runSkillForInput } from '../../lib/agents/skills';
import { getIcon, ICON_KEYS } from '../Sidebar/iconMap';
import type { IntegrationsBundle } from '../../types/integrations';
import { PROVIDER_LABELS } from '../../types/integrations';
import './AgentLab.css';

const DISCIPLINES: Discipline[] = ['research', 'legal', 'engineering', 'data', 'comms', 'strategy', 'creative', 'operations', 'general'];

/** WAI-ARIA tabs order for the persona sub-views (Dossier + the PersonaWorkspace views). */
const PERSONA_TAB_KEYS = ['dossier', 'tools', 'tasks', 'memory', 'audit'] as const;
const PERSONA_TAB_LABELS: Record<(typeof PERSONA_TAB_KEYS)[number], string> = {
    dossier: 'Dossier', tools: 'Tools', tasks: 'Tasks', memory: 'Memory', audit: 'Audit',
};

/** D5: name the real problem — no provider picked vs. active provider has no key. */
function llmProblemMessage(llm: IntegrationsBundle['llm']): string {
    if (!llm.active) return 'No AI provider is selected. Choose one in Settings → API Keys to run agents.';
    return `The active provider (${PROVIDER_LABELS[llm.active]}) has no key configured. Add one in Settings → API Keys to run agents.`;
}

function Icon({ k, size = 16 }: { k: string; size?: number }) {
    // P3: an icon key that isn't in the map (a stale default, a bad save) must
    // never render as literal text — fall back to a real lucide icon.
    const L = getIcon(k) ?? Bot;
    return <L size={size} strokeWidth={1.75} />;
}

export default function AgentLab() {
    const userCtx = useContext(UserContext);
    hermesLearningUserIdHolder.current = userCtx?.user?.id ?? null; // record/recall to this user
    const { integrations } = useIntegrations();
    const { personas, teams, upsertPersona, deletePersona, upsertTeam, deleteTeam } = useAgentLab();

    // D5: readiness is "the ACTIVE provider is configured", not "some provider
    // somewhere has a key" — the old `||` chain across every provider reported
    // ready with (say) an Anthropic key saved while OpenAI was active and bare.
    const llmReady = useMemo(() => hasActiveLlm(integrations.llm), [integrations.llm]);

    const [sel, setSel] = useState<{ kind: 'team' | 'persona'; id: string } | null>(
        teams[0] ? { kind: 'team', id: teams[0].id } : null,
    );
    const [goal, setGoal] = useState('');
    const [sources, setSources] = useState('');
    const [running, setRunning] = useState(false);
    const [events, setEvents] = useState<RunEvent[]>([]);
    const [teamResult, setTeamResult] = useState<TeamRunResult | null>(null);
    const [soloResult, setSoloResult] = useState<PersonaOutput | null>(null);
    // F1 (review): tagged with its persona, like soloResult, so a late error can't land on another persona's screen.
    const [soloError, setSoloError] = useState<{ personaId: string; message: string } | null>(null);
    const [lastRunId, setLastRunId] = useState<string | null>(null);
    const [rating, setRating] = useState<number | null>(null);
    const [editing, setEditing] = useState<Persona | null>(null);
    const [teamEditing, setTeamEditing] = useState<AgentTeam | null>(null);
    const [personaTab, setPersonaTab] = useState<'dossier' | WorkspaceView>('dossier');
    // D16: per-persona task lock — a map, not one shared id, so persona A
    // running a task never blocks persona B's Run button.
    const [runningTasks, setRunningTasks] = useState<Record<string, string>>({});

    const personaTabsUid = useId();
    const personaTabRefs = useRef<Partial<Record<(typeof PERSONA_TAB_KEYS)[number], HTMLButtonElement | null>>>({});

    const deps: OrchestratorDeps = useMemo(() => ({
        invoke: async (req) => {
            // P12-2: persona's preferred model wins when set + configured.
            const pref = req.personaId ? agentTeamsStore.getSnapshot().personas.find(p => p.id === req.personaId)?.preferredModel : undefined;
            const r = await callLlm(req, applyModelPreference(integrations.llm, pref));
            return r?.text ?? null;
        },
        recall: (prompt) => formatFewShot(relevantPastRuns(prompt, 3)),
        record: (input) => { recordRun(input); },
        // P11-5: members EXECUTE their equipped skills (Researcher actually
        // web-searches) — output feeds the member prompt as evidence.
        runSkill: async (input, skillIds) => {
            const catalog = AGENT_SKILLS.filter(s => skillIds.includes(s.id));
            // PROVENANCE GATE: member-task skill input is orchestrator/model-derived,
            // not human-typed — origin 'model' so only the autonomous-safe allowlist
            // runs (code runner / widget-mutating / memory-write are refused).
            const r = await runSkillForInput(input, { llm: integrations.llm, search: integrations.search }, catalog, 'model');
            return r && r.ok ? { name: r.skill.name, text: r.text } : null;
        },
        // D14: `integrations.search` feeds runSkill above — it belongs in the
        // dep list (react-hooks/exhaustive-deps was right to flag it).
    }), [integrations.llm, integrations.search]);

    const resetRun = () => { setEvents([]); setTeamResult(null); setSoloResult(null); setSoloError(null); setLastRunId(null); setRating(null); };

    const run = useCallback(async () => {
        if (!sel || running || !goal.trim()) return;
        resetRun();
        setRunning(true);
        try {
            if (sel.kind === 'team') {
                const team = teams.find(t => t.id === sel.id);
                if (!team) return;
                // D15: team members get their working memory too (solo/task runs
                // already did) — every persona except the orchestrator, which
                // plans/merges rather than "improving with use" itself.
                const augmentedPersonas = personas.map(p => (
                    p.id === ORCHESTRATOR_ID ? p : { ...p, systemPrompt: p.systemPrompt + formatMemory(p.id) }
                ));
                // Drop each member's subtask into that persona's task list (orchestrator-assigned),
                // start it, then complete it with its duration as the run proceeds.
                const memberTaskIds = new Map<string, string>();
                const result = await runTeam({
                    goal, sources, team, personas: augmentedPersonas, deps,
                    onEvent: e => setEvents(prev => [...prev, e]),
                    onMemberTask: m => {
                        if (m.phase === 'assigned') {
                            memberTaskIds.set(m.personaId, addTask(m.personaId, m.title, 'orchestrator'));
                        } else if (m.phase === 'start') {
                            const id = memberTaskIds.get(m.personaId);
                            if (id) startTask(m.personaId, id);
                        } else {
                            const id = memberTaskIds.get(m.personaId);
                            // D8: a member that failed gets a FAILED task with the real reason, not "done".
                            if (id) {
                                if (m.ok) completeTask(m.personaId, id, m.result);
                                else failTask(m.personaId, id, m.error ?? NO_RESPONSE_MESSAGE);
                            }
                            recordPersonaRun(m.personaId, `Team task: ${m.title} → ${(m.result ?? '').slice(0, 140)}`, m.durationMs ?? 0, m.ok ? 'success' : 'fail');
                        }
                    },
                });
                setTeamResult(result);
                // D3/D1: record whenever a run actually happened — including a
                // failed one — with an HONEST outcome, not "only on success".
                const rec = recordRun({
                    prompt: goal, taskType: 'planning',
                    outcome: result.outcome === 'success' ? 'success' : 'fail',
                    summary: (result.final || result.error || '').slice(0, 200),
                    toolsUsed: [team.id],
                });
                setLastRunId(rec.id);
            } else {
                const persona = findPersona(personas, sel.id);
                if (!persona) return;
                setEvents([{ phase: 'execute', personaId: persona.id, message: `${persona.name} is working…` }]);
                const t0 = performance.now();
                // Inject this persona's working memory so it gets better with use.
                const augmented = { ...persona, systemPrompt: persona.systemPrompt + formatMemory(persona.id) };
                try {
                    const out = await runPersona({ goal, sources, persona: augmented, deps });
                    const durationMs = performance.now() - t0;
                    setSoloResult(out);
                    // D3: outcome from `ok`, never from output-text truthiness.
                    const rec = recordRun({ prompt: goal, taskType: 'general', outcome: out.ok ? 'success' : 'fail', summary: out.verified.slice(0, 200), toolsUsed: [persona.id] });
                    setLastRunId(rec.id);
                    recordPersonaRun(persona.id, `Goal: ${goal} → ${out.verified.slice(0, 160)}`, durationMs, out.ok ? 'success' : 'fail');
                } catch (e) {
                    // D1: runPersona doesn't catch a thrown provider error —
                    // this is that catch. Never let it vanish silently.
                    const durationMs = performance.now() - t0;
                    const msg = describeLlmFailure(e);
                    setSoloError({ personaId: persona.id, message: msg });
                    recordPersonaRun(persona.id, `Goal: ${goal} → ${msg}`, durationMs, 'fail');
                    logAudit(persona.id, 'Run failed', msg);
                }
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
    // P2: real Hermes activity for the dossier's Activity block. Called
    // unconditionally (rules of hooks) — usePersonaWork tolerates an empty id.
    const personaWork = usePersonaWork(selectedPersona?.id ?? '');

    // Run a single task the persona was given (timed → completed with duration).
    const runTask = useCallback(async (taskId: string, taskTitle: string) => {
        if (!selectedPersona || running || runningTasks[selectedPersona.id]) return;
        const personaId = selectedPersona.id;
        const augmented = { ...selectedPersona, systemPrompt: selectedPersona.systemPrompt + formatMemory(personaId) };
        setRunningTasks(prev => ({ ...prev, [personaId]: taskId }));
        // A task result is not a Hermes run: clear the rating target so its
        // 👍/👎 can't land on an earlier Goal run of this persona.
        setLastRunId(null);
        setRating(null);
        startTask(personaId, taskId);
        logAudit(personaId, 'Task started', taskTitle);
        const t0 = performance.now();
        try {
            const out = await runPersona({ goal: taskTitle, sources, persona: augmented, deps });
            const durationMs = performance.now() - t0;
            // D8: a real answer completes the task; anything else — including a
            // clean "no response" — fails it with the real reason, never a
            // silent "completed" with nothing in it.
            if (out.ok) completeTask(personaId, taskId, out.verified.slice(0, 400));
            else failTask(personaId, taskId, out.error ?? NO_RESPONSE_MESSAGE);
            recordPersonaRun(personaId, `Task: ${taskTitle} → ${out.verified.slice(0, 140)}`, durationMs, out.ok ? 'success' : 'fail');
            setSoloResult(out);
        } catch (e) {
            // D1: a thrown provider error fails the task with the real message.
            const durationMs = performance.now() - t0;
            const msg = describeLlmFailure(e);
            failTask(personaId, taskId, msg);
            recordPersonaRun(personaId, `Task: ${taskTitle} → ${msg}`, durationMs, 'fail');
            logAudit(personaId, 'Task failed', msg);
        } finally {
            setRunningTasks(prev => { const next = { ...prev }; delete next[personaId]; return next; });
        }
    }, [selectedPersona, running, runningTasks, sources, deps]);

    // ── persona / team editors ──
    const startNewPersona = () => {
        // P3: 'bot' isn't a lucide key in ICON_MAP — it used to render as the
        // literal text "bot" in the rail. 'cpu' exists.
        const p: Persona = { id: newPersonaId(), name: 'New Specialist', discipline: 'general', icon: 'cpu', color: '#6366f1', tagline: 'Describe this specialist', systemPrompt: 'You are a specialist. ' };
        setEditing(p);
    };
    const savePersona = () => { if (editing) { upsertPersona(editing); setSel({ kind: 'persona', id: editing.id }); setEditing(null); } };

    const startNewTeam = () => {
        // P3: 'users' isn't a lucide key in ICON_MAP either — 'layers' is.
        const t: AgentTeam = { id: newTeamId(), name: 'New Team', icon: 'layers', memberIds: [], orchestratorId: ORCHESTRATOR_ID };
        setTeamEditing(t);
    };
    const saveTeam = () => { if (teamEditing && teamEditing.memberIds.length > 0) { upsertTeam(teamEditing); setSel({ kind: 'team', id: teamEditing.id }); setTeamEditing(null); } };

    // D19: WAI-ARIA tabs keyboard pattern (roving tabIndex) for the persona sub-tabs.
    const handlePersonaTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        const idx = PERSONA_TAB_KEYS.indexOf(personaTab as (typeof PERSONA_TAB_KEYS)[number]);
        if (idx < 0) return;
        let next = idx;
        if (e.key === 'ArrowRight') next = (idx + 1) % PERSONA_TAB_KEYS.length;
        else if (e.key === 'ArrowLeft') next = (idx - 1 + PERSONA_TAB_KEYS.length) % PERSONA_TAB_KEYS.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = PERSONA_TAB_KEYS.length - 1;
        else return;
        e.preventDefault();
        const nextKey = PERSONA_TAB_KEYS[next];
        setPersonaTab(nextKey);
        personaTabRefs.current[nextKey]?.focus();
    };

    // D16: a background task's result must never paint over another persona's
    // screen — only show it when it belongs to the persona currently in view.
    const gatedSoloResult = soloResult && selectedPersona && soloResult.personaId === selectedPersona.id ? soloResult : null;
    const gatedSoloError = soloError && selectedPersona && soloError.personaId === selectedPersona.id ? soloError.message : null;

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
                        {llmReady ? 'LLM ready' : 'LLM not ready'}
                    </span>
                </div>
                {!llmReady && (
                    <div className="alab-banner">
                        {llmProblemMessage(integrations.llm)}
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
                        <RunOutput events={events} teamResult={teamResult} soloResult={null} running={running} lastRunId={lastRunId} rating={rating} onRate={rate} error={null} />
                    </>
                ) : selectedPersona ? (
                    <>
                        <div className="alab-sel-head">
                            <div><span className="alab-dot" style={{ background: selectedPersona.color }} /> <strong>{selectedPersona.name}</strong> <span className="alab-tagline">{selectedPersona.tagline}</span></div>
                            {/* D11: built-ins get Edit too — only their preferred model is editable there. */}
                            <button className="alab-edit-link" onClick={() => setEditing(selectedPersona)}>Edit</button>
                        </div>
                        <div className="alab-ptabs" role="tablist" aria-label="Persona views">
                            {PERSONA_TAB_KEYS.map(tk => (
                                <button
                                    key={tk}
                                    type="button"
                                    id={`${personaTabsUid}-tab-${tk}`}
                                    role="tab"
                                    aria-selected={personaTab === tk}
                                    // F2 (review): only the selected tab's panel is mounted, so only it can be referenced.
                                    aria-controls={personaTab === tk ? `${personaTabsUid}-panel-${tk}` : undefined}
                                    tabIndex={personaTab === tk ? 0 : -1}
                                    ref={el => { personaTabRefs.current[tk] = el; }}
                                    className={`alab-ptab ${personaTab === tk ? 'alab-ptab--active' : ''}`}
                                    onClick={() => setPersonaTab(tk)}
                                    onKeyDown={handlePersonaTabKeyDown}
                                >
                                    {PERSONA_TAB_LABELS[tk]}
                                </button>
                            ))}
                        </div>
                        <div role="tabpanel" id={`${personaTabsUid}-panel-${personaTab}`} aria-labelledby={`${personaTabsUid}-tab-${personaTab}`} tabIndex={0}>
                            {personaTab === 'dossier' ? (
                                <AvatarDossier
                                    dossier={selectedPersona.dossier ?? defaultDossier(selectedPersona)}
                                    onChange={d => upsertPersona({ ...selectedPersona, dossier: d })}
                                    avatar={resolveAvatar(selectedPersona)}
                                    onAvatarChange={a => upsertPersona({ ...selectedPersona, avatar: a })}
                                    neuralVideo={resolveNeuralVideo(selectedPersona)}
                                    onNeuralVideoChange={v => upsertPersona({ ...selectedPersona, neuralVideo: v })}
                                    icon={selectedPersona.icon}
                                    onIconChange={k => upsertPersona({ ...selectedPersona, icon: k })}
                                    stats={personaStats(personaWork)}
                                />
                            ) : (
                                <PersonaWorkspace
                                    persona={selectedPersona}
                                    view={personaTab}
                                    onPersonaChange={upsertPersona}
                                    onRunTask={runTask}
                                    runningTaskId={runningTasks[selectedPersona.id] ?? null}
                                    llmReady={llmReady}
                                />
                            )}
                        </div>
                        <RunPanel goal={goal} setGoal={setGoal} sources={sources} setSources={setSources} run={run} running={running} runLabel={`Run ${selectedPersona.name}`} disabled={!llmReady} />
                        <RunOutput events={events} teamResult={null} soloResult={gatedSoloResult} running={running} lastRunId={lastRunId} rating={rating} onRate={rate} error={gatedSoloError} />
                    </>
                ) : (
                    <div className="alab-empty">Pick a team or persona on the left, or create one with “+”.</div>
                )}
            </main>
        </div>
    );
}

function RunPanel(props: { goal: string; setGoal: (v: string) => void; sources: string; setSources: (v: string) => void; run: () => void; running: boolean; runLabel: string; disabled: boolean }) {
    const uid = useId();
    const goalId = `${uid}-goal`;
    const sourcesId = `${uid}-sources`;
    return (
        <div className="alab-runpanel">
            <label className="alab-label" htmlFor={goalId}>Goal</label>
            <textarea id={goalId} className="alab-goal" value={props.goal} onChange={e => props.setGoal(e.target.value)} placeholder="What should the team accomplish?" />
            <label className="alab-label" htmlFor={sourcesId}>Sources <span className="alab-label-hint">(optional — outputs are verified against these)</span></label>
            <textarea id={sourcesId} className="alab-sources" value={props.sources} onChange={e => props.setSources(e.target.value)} placeholder="Paste reference text, notes, or facts the agents must rely on…" />
            <button className="alab-run" onClick={props.run} disabled={props.running || props.disabled || !props.goal.trim()}>
                {props.running ? 'Running…' : props.runLabel}
            </button>
        </div>
    );
}

function RunOutput(props: {
    events: RunEvent[]; teamResult: TeamRunResult | null; soloResult: PersonaOutput | null; running: boolean;
    lastRunId: string | null; rating: number | null; onRate: (v: number) => void; error?: string | null;
}) {
    const { events, teamResult, soloResult, running, error } = props;
    if (events.length === 0 && !teamResult && !soloResult && !error) return null;
    const final = teamResult?.final;
    const teamOutputs = teamResult?.outputs ?? [];
    // A solo run that resolved but didn't succeed (no throw — e.g. an empty
    // reply) still needs to say so; a thrown solo error arrives via `error`.
    const soloFailure = soloResult && !soloResult.ok ? (soloResult.error ?? soloResult.verified) : null;
    const alertMessage = teamResult?.error ?? error ?? soloFailure;
    // D12: rating needs a real result to rate — a team's merged final, or a
    // solo run that actually succeeded.
    const showRatingFor: 'team' | 'solo' | null = final ? 'team' : (soloResult?.ok ? 'solo' : null);
    return (
        <div className="alab-output">
            {running && (
                <div className="alab-phases" role="status" aria-live="polite">
                    {events.map((e, i) => <div key={i} className="alab-phase">{e.message}</div>)}
                </div>
            )}
            {alertMessage && <div className="alab-error" role="alert">{alertMessage}</div>}
            {teamResult && teamResult.warnings.length > 0 && (
                <ul className="alab-warnings" role="status">
                    {teamResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
            )}
            {teamOutputs.length > 0 && (
                <div className="alab-contribs">
                    {teamOutputs.map(o => (
                        <details key={o.personaId} className="alab-contrib">
                            <summary>
                                {o.personaName}
                                {!o.ok && <span className="alab-error-suffix"> · failed</span>}
                                {o.ok && o.verifyStatus === 'flagged' && <span className="alab-unverified"> · unverified claims</span>}
                                {o.ok && o.verifyStatus === 'unavailable' && <span className="alab-unverified"> · verification unavailable</span>}
                            </summary>
                            <pre className="alab-pre">{o.ok ? o.verified : (o.error ?? o.verified)}</pre>
                        </details>
                    ))}
                </div>
            )}
            {showRatingFor && (
                <div className="alab-final">
                    <div className="alab-final-head">
                        <span>
                            {showRatingFor === 'team' ? 'Final product' : 'Result'}
                            {/* D2: a solo result carries its own verification status (team members show theirs above). */}
                            {showRatingFor === 'solo' && soloResult?.verifyStatus === 'flagged' && <span className="alab-unverified"> · unverified claims</span>}
                            {showRatingFor === 'solo' && soloResult?.verifyStatus === 'unavailable' && <span className="alab-unverified"> · verification unavailable</span>}
                        </span>
                        <span className="alab-rate">
                            <button className={`alab-rate-btn ${props.rating === 1 ? 'alab-rate-btn--on' : ''}`} onClick={() => props.onRate(1)} disabled={!props.lastRunId} title="Good — Hermes learns from this" aria-label="Mark result good"><ThumbsUp size={16} /></button>
                            <button className={`alab-rate-btn ${props.rating === -1 ? 'alab-rate-btn--on' : ''}`} onClick={() => props.onRate(-1)} disabled={!props.lastRunId} title="Bad" aria-label="Mark result bad"><ThumbsDown size={16} /></button>
                        </span>
                    </div>
                    <pre className="alab-pre alab-pre--final">{showRatingFor === 'team' ? final : soloResult?.verified}</pre>
                </div>
            )}
        </div>
    );
}

function PersonaEditor(props: { persona: Persona; onChange: (p: Persona) => void; onSave: () => void; onCancel: () => void; onDelete?: () => void }) {
    const { persona, onChange } = props;
    const uid = useId();
    return (
        <div className="alab-editor">
            <h3>{persona.builtin ? 'Persona (built-in — only the model can be changed)' : 'Edit persona'}</h3>
            <label className="alab-label" htmlFor={`${uid}-name`}>Name</label>
            <input id={`${uid}-name`} className="alab-input" value={persona.name} disabled={persona.builtin} onChange={e => onChange({ ...persona, name: e.target.value })} />
            <label className="alab-label" htmlFor={`${uid}-discipline`}>Discipline</label>
            <select id={`${uid}-discipline`} className="alab-input" value={persona.discipline} disabled={persona.builtin} onChange={e => onChange({ ...persona, discipline: e.target.value as Discipline })}>
                {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <label className="alab-label" htmlFor={`${uid}-tagline`}>Tagline</label>
            <input id={`${uid}-tagline`} className="alab-input" value={persona.tagline} disabled={persona.builtin} onChange={e => onChange({ ...persona, tagline: e.target.value })} />
            <label className="alab-label" htmlFor={`${uid}-prompt`}>System prompt</label>
            <textarea id={`${uid}-prompt`} className="alab-input alab-input--tall" value={persona.systemPrompt} disabled={persona.builtin} onChange={e => onChange({ ...persona, systemPrompt: e.target.value })} />
            {/* P12-2: per-persona model routing — editable even on built-ins
                (it's a routing preference, not identity). Empty = inherit the
                user's active provider. This caption labels a 2-control group
                (each control already carries its own aria-label), so it's a
                span, not an unassociated <label>. */}
            <span className="alab-label">Preferred model (optional)</span>
            <div className="alab-pref-model">
                <select
                    className="alab-input"
                    value={persona.preferredModel?.provider ?? ''}
                    aria-label="Preferred provider"
                    onChange={e => {
                        const provider = e.target.value as '' | 'anthropic' | 'openai' | 'gemini' | 'local' | 'custom';
                        onChange({ ...persona, preferredModel: provider ? { provider, model: persona.preferredModel?.model } : undefined });
                    }}
                >
                    <option value="">Inherit active provider</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                    <option value="local">Local</option>
                    <option value="custom">Custom</option>
                </select>
                <input
                    className="alab-input"
                    placeholder="model id (optional, e.g. claude-haiku-4-5)"
                    aria-label="Preferred model id"
                    value={persona.preferredModel?.model ?? ''}
                    disabled={!persona.preferredModel}
                    onChange={e => persona.preferredModel && onChange({ ...persona, preferredModel: { ...persona.preferredModel, model: e.target.value || undefined } })}
                />
            </div>
            <div className="alab-editor-actions">
                <button className="alab-run" onClick={props.onSave}>Save</button>
                <button className="alab-btn" onClick={props.onCancel}>{persona.builtin ? 'Close' : 'Cancel'}</button>
                {props.onDelete && <button className="alab-btn alab-btn--danger" onClick={props.onDelete}>Delete</button>}
            </div>
        </div>
    );
}

function TeamEditor(props: { team: AgentTeam; personas: Persona[]; onChange: (t: AgentTeam) => void; onSave: () => void; onCancel: () => void; onDelete?: () => void }) {
    const { team, personas, onChange } = props;
    const uid = useId();
    const toggle = (id: string) => {
        const has = team.memberIds.includes(id);
        onChange({ ...team, memberIds: has ? team.memberIds.filter(m => m !== id) : [...team.memberIds, id] });
    };
    return (
        <div className="alab-editor">
            <h3>{team.builtin ? 'Team (built-in)' : 'Edit team'}</h3>
            <label className="alab-label" htmlFor={`${uid}-name`}>Name</label>
            <input id={`${uid}-name`} className="alab-input" value={team.name} disabled={team.builtin} onChange={e => onChange({ ...team, name: e.target.value })} />
            {/* P3: an icon picker for the team, same pattern as the persona dossier's. */}
            <span className="alab-label">Icon</span>
            <div className="alab-icon-picker">
                {ICON_KEYS.filter(key => getIcon(key)).map(key => {
                    const Ic = getIcon(key)!;
                    return (
                        <button
                            key={key}
                            type="button"
                            className={`alab-icon-opt ${team.icon === key ? 'alab-icon-opt--active' : ''}`}
                            title={key}
                            aria-label={`Use ${key} icon`}
                            aria-pressed={team.icon === key}
                            disabled={team.builtin}
                            onClick={() => onChange({ ...team, icon: key })}
                        >
                            <Ic size={16} />
                        </button>
                    );
                })}
            </div>
            {/* D19: "Members" labels a GROUP of checkboxes, not one control —
                a span (not an unassociated <label>) is the correct element. */}
            <span className="alab-label">Members</span>
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
