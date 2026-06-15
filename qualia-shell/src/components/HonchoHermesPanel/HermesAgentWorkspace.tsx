import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useUser } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { hasActiveLlm } from '../../lib/llmClient';
import { getIcon } from '../Sidebar/iconMap';
import {
    agentLabUserIdHolder,
    agentTeamsStore,
} from '../../lib/agents/agentTeamsStore';
import {
    HERMES_PERSONA_IDS,
    type Persona,
} from '../../lib/agents/personas';
import {
    addTask,
    deleteTask,
    personaWorkStore,
    personaWorkUserIdHolder,
    retryTask,
    type PersonaTask,
} from '../../lib/agents/personaWorkStore';
import {
    agentWikiStore,
    agentWikiUserIdHolder,
} from './agentWikiStore';
import { computePersonaStatus } from '../../lib/agents/hermesStatus';
import type { IntegrationsBundle, LlmProvider } from '../../types/integrations';

const BACKUP_PROMPT =
    'Create or update a private GitHub repository named hermes-memory-backup. Back up MEMORY.md, USER.md, SOUL.md, the LLM Wiki, persona task history, and persona working memory. Never commit API keys or access tokens. Return the commit summary and any files intentionally excluded.';
const RESTORE_PROMPT =
    'Restore Hermes memory from my private hermes-memory-backup repository. Show a dry-run diff first, preserve newer local facts, flag contradictions, and do not overwrite API keys or access tokens.';

/** Per-persona portrait assets (crafted SVGs). An uploaded image avatar wins. */
const PORTRAIT_BY_ID: Record<string, string> = {
    'hermes-labyrinth': '/assets/personas/hermes-labyrinth.svg',
    'hermes-mercury': '/assets/personas/hermes-mercury.svg',
    'hermes-orpheus': '/assets/personas/hermes-orpheus.svg',
    'hermes-philosopher': '/assets/personas/hermes-philosopher.svg',
    'hermes-scribe': '/assets/personas/hermes-scribe.svg',
};

function portraitFor(persona: Persona): string | null {
    if (persona.avatar?.kind === 'image' && persona.avatar.src) return persona.avatar.src;
    return PORTRAIT_BY_ID[persona.id] ?? null;
}

function providerDetails(llm: IntegrationsBundle['llm'], persona: Persona): {
    provider: LlmProvider | null;
    model: string;
    ready: boolean;
    fallback: boolean;
} {
    const provider = persona.preferredModel?.provider ?? llm.active;
    if (!provider) return { provider: null, model: 'No provider assigned', ready: false, fallback: false };
    const preferredReady = hasActiveLlm({ ...llm, active: provider });
    const config = llm[provider];
    const model = persona.preferredModel?.model || ('model' in (config ?? {}) ? String(config?.model || '') : '') || 'provider default';
    return {
        provider,
        model,
        ready: preferredReady || hasActiveLlm(llm),
        fallback: !preferredReady && hasActiveLlm(llm),
    };
}

function statusLabel(task: PersonaTask): string {
    if (task.status === 'running') return 'running';
    if (task.status === 'failed') return 'needs retry';
    if (task.status === 'done') return 'complete';
    return 'queued';
}

export function HermesAgentWorkspace() {
    const { user } = useUser();
    const { integrations } = useIntegrations();
    const uid = user?.id ?? null;
    agentLabUserIdHolder.current = uid;
    personaWorkUserIdHolder.current = uid;
    agentWikiUserIdHolder.current = uid;

    const lab = useSyncExternalStore(agentTeamsStore.subscribe, agentTeamsStore.getSnapshot, agentTeamsStore.getServerSnapshot);
    const work = useSyncExternalStore(personaWorkStore.subscribe, personaWorkStore.getSnapshot, personaWorkStore.getServerSnapshot);
    const wiki = useSyncExternalStore(agentWikiStore.subscribe, agentWikiStore.getSnapshot, agentWikiStore.getServerSnapshot);
    const personas = HERMES_PERSONA_IDS
        .map(id => lab.personas.find(p => p.id === id))
        .filter((p): p is Persona => !!p);

    const [selectedId, setSelectedId] = useState<string>(personas[0]?.id ?? HERMES_PERSONA_IDS[0]);
    const [taskTitle, setTaskTitle] = useState('');
    const [copied, setCopied] = useState<'backup' | 'restore' | null>(null);
    // Live clock so the "on task" ETA counts down while a run is in flight.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 5_000);
        return () => window.clearInterval(id);
    }, []);
    const selected = personas.find(p => p.id === selectedId) ?? personas[0];
    const selectedWork = selected ? work[selected.id] : undefined;
    const activeTasks = selectedWork?.tasks.filter(t => t.status !== 'done') ?? [];
    const completedTasks = selectedWork?.tasks.filter(t => t.status === 'done') ?? [];

    const queueTask = () => {
        if (!selected || !taskTitle.trim()) return;
        addTask(selected.id, taskTitle, 'user');
        setTaskTitle('');
    };

    const copyPrompt = async (kind: 'backup' | 'restore') => {
        try {
            await navigator.clipboard.writeText(kind === 'backup' ? BACKUP_PROMPT : RESTORE_PROMPT);
            setCopied(kind);
            setTimeout(() => setCopied(null), 1_500);
        } catch { /* clipboard access can be blocked in sandboxed contexts */ }
    };

    return (
        <section className="haw" aria-label="Hermes autonomous agent workspace">
            <div className="haw__hero">
                <div>
                    <span className="haw__eyebrow">Hermes Agent</span>
                    <h3>Give the team work. Return to completed tasks.</h3>
                    <p>
                        Tasks persist per user and run in the background while Dwellium is open.
                        Each persona uses its assigned provider when configured, then honestly falls back to your active key.
                    </p>
                </div>
                <div className={`haw__runner ${hasActiveLlm(integrations.llm) ? 'is-ready' : ''}`}>
                    <span className="haw__pulse" />
                    {hasActiveLlm(integrations.llm) ? 'Autonomous runner listening' : 'Add an LLM key to start the runner'}
                </div>
            </div>

            <div className="haw__cards" aria-label="Hermes personas">
                {personas.map(persona => {
                    const details = providerDetails(integrations.llm, persona);
                    const personaWork = work[persona.id];
                    const Icon = getIcon(persona.icon);
                    const status = computePersonaStatus(
                        { ready: details.ready, provider: details.provider, fallback: details.fallback },
                        personaWork,
                        now,
                    );
                    const portrait = portraitFor(persona);
                    return (
                        <button
                            key={persona.id}
                            type="button"
                            className={`haw__card is-${status.tone} ${selected?.id === persona.id ? 'is-selected' : ''}`}
                            onClick={() => setSelectedId(persona.id)}
                            style={{ '--persona-color': persona.color } as CSSProperties}
                            aria-label={`${persona.name} — ${status.label}${status.runningTask ? `: ${status.runningTask.title}` : ''}`}
                        >
                            <span className="haw__card-glow" aria-hidden="true" />
                            <span className="haw__portrait">
                                {portrait
                                    ? <img src={portrait} alt="" loading="lazy" draggable={false} />
                                    : <span className="haw__portrait-fallback">{Icon ? <Icon size={28} /> : persona.name.slice(0, 1)}</span>}
                                <span className={`haw__dot is-${status.tone}`} title={status.label} />
                            </span>
                            <span className="haw__card-body">
                                <span className="haw__card-top">
                                    <strong>{persona.name}</strong>
                                    <span className={`haw__status-pill is-${status.tone}`}>{status.label}</span>
                                </span>
                                <small className="haw__card-desc">{persona.tagline}</small>
                                <span className="haw__card-meta">
                                    <span className="haw__chip">{details.provider ?? 'unassigned'}{details.fallback ? ' · fallback' : ''}</span>
                                    <span className="haw__chip haw__chip--muted">{persona.tools?.length ?? 0} skills</span>
                                    <span className="haw__chip haw__chip--muted">{personaWork?.usageCount ?? 0} runs</span>
                                </span>
                                {status.tone === 'yellow' && status.runningTask && (
                                    <span className="haw__card-live">
                                        <span className="haw__live-title" title={status.runningTask.title}>▶ {status.runningTask.title}</span>
                                        <span className="haw__live-eta">{status.etaText}{status.queued > 0 ? ` · ${status.queued} queued` : ''}</span>
                                    </span>
                                )}
                                {status.tone === 'red' && (
                                    <span className="haw__card-live haw__card-live--warn">{status.hint}</span>
                                )}
                                {status.tone === 'green' && (
                                    <span className="haw__card-live haw__card-live--idle">
                                        {status.queued > 0 ? `${status.queued} queued · ready to run` : 'Ready for work'}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>

            {selected && (
                <div className="haw__detail">
                    <div className="haw__memory-grid">
                        <article className="haw__memory-card">
                            <div className="haw__card-head"><strong>MEMORY.md</strong><span>{selectedWork?.memory.length ?? 0} persona memories</span></div>
                            <pre>{wiki.identity['MEMORY.md']}</pre>
                        </article>
                        <article className="haw__memory-card">
                            <div className="haw__card-head"><strong>SOUL.md</strong><span>{selected.name} operating principles</span></div>
                            <pre>{wiki.identity['SOUL.md']}</pre>
                        </article>
                    </div>

                    <div className="haw__task-composer">
                        <div>
                            <strong>Queue work for {selected.name}</strong>
                            <span>The shell runner claims the oldest queued task every 30 seconds.</span>
                        </div>
                        <div className="haw__task-row">
                            <input
                                value={taskTitle}
                                onChange={event => setTaskTitle(event.target.value)}
                                onKeyDown={event => { if (event.key === 'Enter') queueTask(); }}
                                placeholder={`Give ${selected.name} a task...`}
                                aria-label={`Task for ${selected.name}`}
                            />
                            <button type="button" onClick={queueTask} disabled={!taskTitle.trim()}>Queue task</button>
                        </div>
                    </div>

                    <div className="haw__tasks">
                        <div className="haw__section-head"><strong>Active queue</strong><span>{activeTasks.length}</span></div>
                        {activeTasks.length === 0 && <p className="haw__empty">No queued work for {selected.name}.</p>}
                        {activeTasks.map(task => (
                            <div key={task.id} className={`haw__task haw__task--${task.status}`}>
                                <span className="haw__task-state">{statusLabel(task)}</span>
                                <span className="haw__task-copy"><strong>{task.title}</strong>{task.lastError && <small>{task.lastError}</small>}</span>
                                {task.status === 'failed' && <button type="button" onClick={() => retryTask(selected.id, task.id)}>Retry</button>}
                                <button type="button" aria-label={`Delete task ${task.title}`} onClick={() => deleteTask(selected.id, task.id)}>Delete</button>
                            </div>
                        ))}

                        <div className="haw__section-head"><strong>Completed</strong><span>{completedTasks.length}</span></div>
                        {completedTasks.slice(0, 6).map(task => (
                            <details key={task.id} className="haw__completed">
                                <summary>{task.title}<span>{task.attempts ?? 1} attempt{(task.attempts ?? 1) === 1 ? '' : 's'}</span></summary>
                                <pre>{task.result || 'Completed without a written result.'}</pre>
                            </details>
                        ))}
                    </div>
                </div>
            )}

            <div className="haw__backup-grid">
                <article className="haw__prompt-card">
                    <span>Private backup prompt</span>
                    <strong>Back up Hermes memory to GitHub</strong>
                    <p>Includes identity files, wiki facts, persona memory, and task history. Excludes secrets.</p>
                    <button type="button" onClick={() => copyPrompt('backup')}>{copied === 'backup' ? 'Copied' : 'Copy prompt'}</button>
                </article>
                <article className="haw__prompt-card">
                    <span>Private restore prompt</span>
                    <strong>Restore without erasing newer knowledge</strong>
                    <p>Requests a dry-run diff, merges newer facts, and flags contradictions before writing.</p>
                    <button type="button" onClick={() => copyPrompt('restore')}>{copied === 'restore' ? 'Copied' : 'Copy prompt'}</button>
                </article>
            </div>
        </section>
    );
}
