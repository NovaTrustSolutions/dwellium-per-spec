import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { type Persona } from '../../lib/agents/personas';
import {
    usePersonaWork, addTask, completeTask, deleteTask, addMemory, updateMemory, deleteMemory, formatDuration,
    type PersonaWork,
} from '../../lib/agents/personaWorkStore';
import { STELLA_TOOL_CATALOG, CATEGORY_ORDER } from '../StellaAgent/stellaToolCatalog';
import './PersonaWorkspace.css';

export type WorkspaceView = 'tools' | 'tasks' | 'memory' | 'audit';

/**
 * PersonaWorkspace — the Tools / Tasks / Memory / Audit panels for a persona.
 * Tasks can be run (timed → completed with duration); memory grows with use;
 * the audit log records every action.
 */
export default function PersonaWorkspace({ persona, view, onPersonaChange, onRunTask, runningTaskId }: {
    persona: Persona;
    view: WorkspaceView;
    onPersonaChange: (p: Persona) => void;
    onRunTask: (taskId: string, title: string) => void;
    runningTaskId: string | null;
}) {
    const work = usePersonaWork(persona.id);
    if (view === 'tools') return <ToolsView persona={persona} onPersonaChange={onPersonaChange} />;
    if (view === 'tasks') return <TasksView persona={persona} work={work} onRunTask={onRunTask} runningTaskId={runningTaskId} />;
    if (view === 'memory') return <MemoryView persona={persona} work={work} />;
    return <AuditView work={work} />;
}

function ToolsView({ persona, onPersonaChange }: { persona: Persona; onPersonaChange: (p: Persona) => void }) {
    const equipped = new Set(persona.tools ?? []);
    const toggle = (id: string) => onPersonaChange({ ...persona, tools: equipped.has(id) ? [...equipped].filter(x => x !== id) : [...equipped, id] });
    const groups = CATEGORY_ORDER.map(cat => ({ cat, tools: STELLA_TOOL_CATALOG.filter(t => t.category === cat) })).filter(g => g.tools.length > 0);
    const known = new Set(CATEGORY_ORDER);
    const extra = STELLA_TOOL_CATALOG.filter(t => !known.has(t.category));
    if (extra.length) groups.push({ cat: 'Other', tools: extra });

    return (
        <div className="pw">
            <div className="pw-head">Equipped tools ({equipped.size})</div>
            <div className="pw-chips">
                {STELLA_TOOL_CATALOG.filter(t => equipped.has(t.id)).map(t => {
                    const ToolIcon = t.icon;
                    return (
                        <button key={t.id} type="button" className="pw-chip pw-chip--on" onClick={() => toggle(t.id)} title="Remove from persona"><ToolIcon size={12} aria-hidden /> {t.name} <X size={12} aria-hidden /></button>
                    );
                })}
                {equipped.size === 0 && <span className="pw-empty">No tools yet — add from the library below.</span>}
            </div>
            <div className="pw-head">Tool library</div>
            {groups.map(g => (
                <div key={g.cat} className="pw-group">
                    <div className="pw-cat">{g.cat}</div>
                    {g.tools.map(t => {
                        const ToolIcon = t.icon;
                        return (
                            <button key={t.id} type="button" className={`pw-tool ${equipped.has(t.id) ? 'pw-tool--on' : ''}`} onClick={() => toggle(t.id)} title={t.description}>
                                <span className="pw-tool-ico"><ToolIcon size={16} aria-hidden /></span>
                                <span className="pw-tool-meta">
                                    <span className="pw-tool-name">{t.name}</span>
                                    <span className="pw-tool-desc">{t.description}</span>
                                </span>
                                <span className="pw-tool-add">{equipped.has(t.id) ? <Check size={14} aria-hidden /> : '+'}</span>
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function TasksView({ persona, work, onRunTask, runningTaskId }: {
    persona: Persona; work: PersonaWork; onRunTask: (id: string, title: string) => void; runningTaskId: string | null;
}) {
    const [title, setTitle] = useState('');
    const todo = work.tasks.filter(t => t.status !== 'done');
    const done = work.tasks.filter(t => t.status === 'done');
    const add = () => { if (title.trim()) { addTask(persona.id, title, 'user'); setTitle(''); } };

    return (
        <div className="pw">
            <div className="pw-addrow">
                <input className="pw-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Give this persona a task…"
                    onKeyDown={e => { if (e.key === 'Enter') add(); }} />
                <button type="button" className="pw-btn" onClick={add} disabled={!title.trim()}>Add task</button>
            </div>

            <div className="pw-head">Active ({todo.length})</div>
            {todo.length === 0 && <div className="pw-empty">No active tasks. Add one above, or the orchestrator can assign them.</div>}
            {todo.map(t => {
                const running = t.status === 'running' || runningTaskId === t.id;
                return (
                    <div key={t.id} className="pw-task">
                        <span className={`pw-task-dot pw-task-dot--${running ? 'running' : 'todo'}`} />
                        <span className="pw-task-title">{t.title}</span>
                        <span className={`pw-task-by pw-task-by--${t.assignedBy}`}>{t.assignedBy}</span>
                        {running
                            ? <span className="pw-task-running">running…</span>
                            : <button type="button" className="pw-mini" onClick={() => onRunTask(t.id, t.title)}>Run</button>}
                        <button type="button" className="pw-mini" onClick={() => completeTask(persona.id, t.id)} title="Mark done">Done</button>
                        <button type="button" className="pw-mini pw-mini--del" onClick={() => deleteTask(persona.id, t.id)} aria-label="Delete task"><X size={16} /></button>
                    </div>
                );
            })}

            <div className="pw-head">Completed ({done.length})</div>
            {done.length === 0 && <div className="pw-empty">Completed tasks show here with the time they took.</div>}
            {done.map(t => (
                <div key={t.id} className="pw-task pw-task--done">
                    <span className="pw-task-dot pw-task-dot--done" />
                    <span className="pw-task-title">{t.title}</span>
                    <span className="pw-task-dur" title={t.completedAt ? new Date(t.completedAt).toLocaleString() : ''}>{formatDuration(t.durationMs ?? 0)}</span>
                    <button type="button" className="pw-mini pw-mini--del" onClick={() => deleteTask(persona.id, t.id)} aria-label="Delete task"><X size={16} /></button>
                </div>
            ))}
        </div>
    );
}

function MemoryView({ persona, work }: { persona: Persona; work: PersonaWork }) {
    const [note, setNote] = useState('');
    const remember = () => { if (note.trim()) { addMemory(persona.id, note, 'note'); setNote(''); } };
    return (
        <div className="pw">
            <div className="pw-usage">Used <strong>{work.usageCount}</strong> times — this persona's memory sharpens with every run.</div>
            <div className="pw-addrow">
                <input className="pw-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a memory or standing instruction…"
                    onKeyDown={e => { if (e.key === 'Enter') remember(); }} />
                <button type="button" className="pw-btn" onClick={remember} disabled={!note.trim()}>Remember</button>
            </div>
            {work.memory.length === 0 && <div className="pw-empty">No memory yet — it builds automatically as the persona runs, plus anything you add here.</div>}
            {work.memory.map(m => (
                <div key={m.id} className="pw-mem">
                    <span className={`pw-mem-kind pw-mem-kind--${m.kind}`}>{m.kind}</span>
                    <input className="pw-mem-text" value={m.text} onChange={e => updateMemory(persona.id, m.id, e.target.value)} />
                    <button type="button" className="pw-mini pw-mini--del" onClick={() => deleteMemory(persona.id, m.id)} aria-label="Delete memory"><X size={16} /></button>
                </div>
            ))}
        </div>
    );
}

function AuditView({ work }: { work: PersonaWork }) {
    return (
        <div className="pw">
            <div className="pw-head">Action history ({work.audit.length})</div>
            {work.audit.length === 0 && <div className="pw-empty">No actions logged yet.</div>}
            {work.audit.map(a => (
                <div key={a.id} className="pw-audit">
                    <span className="pw-audit-time">{new Date(a.ts).toLocaleString()}</span>
                    <span className="pw-audit-action">{a.action}</span>
                    {a.detail && <span className="pw-audit-detail">{a.detail}</span>}
                </div>
            ))}
        </div>
    );
}
