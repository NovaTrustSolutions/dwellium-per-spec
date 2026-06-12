/**
 * MissionControl — P12-5 (gap item 7): midterm goals with agent-drafted
 * plans. Each goal card shows the BRIEF, the agent's actions (▶ hands one to
 * ARA), YOUR actions (the video's "my role"), open clarifying questions,
 * progress, and notes. Create here or by telling ARA "new goal …".
 */
import { useState } from 'react';
import { Target, Play, Trash2, Plus } from 'lucide-react';
import { useGoals, goalProgress, type Goal } from '../../lib/goalsStore';
import { generateGoalPlan } from '../../lib/goalPlanner';
import { useIntegrations } from '../../hooks/useIntegrations';
import { requestAraPrompt } from '../../lib/llmRouter';
import './MissionControl.css';

function GoalCard({ goal }: { goal: Goal }) {
    const { setGoalStatus, toggleGoalAction, addGoalNote, deleteGoal } = useGoals();
    const [note, setNote] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const progress = goalProgress(goal);

    const runWithAra = (action: string) => {
        requestAraPrompt(`For my goal "${goal.title}": ${action}`);
        window.dispatchEvent(new CustomEvent('qualia-open-widget', { detail: 'ara-console' }));
    };

    return (
        <article className={`mc__card mc__card--${goal.status}`}>
            <header className="mc__card-head">
                <h3>{goal.title}</h3>
                <select value={goal.status} onChange={e => setGoalStatus(goal.id, e.target.value as Goal['status'])} aria-label={`Status of ${goal.title}`}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="done">Done</option>
                </select>
                <button
                    className="mc__del"
                    onClick={() => { if (confirmDelete) deleteGoal(goal.id); else setConfirmDelete(true); }}
                    aria-label={`Delete goal ${goal.title}`}
                >
                    <Trash2 size={13} aria-hidden /> {confirmDelete ? 'Sure?' : ''}
                </button>
            </header>

            <div className="mc__progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="mc__progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>

            {goal.plan ? (
                <>
                    <p className="mc__brief">{goal.plan.brief}</p>
                    <div className="mc__lists">
                        <section>
                            <h4>Agent's actions</h4>
                            {goal.plan.agentActions.map((a, i) => (
                                <div key={i} className="mc__action">
                                    <label className={a.done ? 'is-done' : ''}>
                                        <input type="checkbox" checked={a.done} onChange={() => toggleGoalAction(goal.id, 'agentActions', i)} />
                                        <span>{a.text}</span>
                                    </label>
                                    <button onClick={() => runWithAra(a.text)} title="Run with ARA" aria-label={`Run with ARA: ${a.text}`}>
                                        <Play size={11} aria-hidden />
                                    </button>
                                </div>
                            ))}
                        </section>
                        <section>
                            <h4>Your role</h4>
                            {goal.plan.userActions.map((a, i) => (
                                <div key={i} className="mc__action">
                                    <label className={a.done ? 'is-done' : ''}>
                                        <input type="checkbox" checked={a.done} onChange={() => toggleGoalAction(goal.id, 'userActions', i)} />
                                        <span>{a.text}</span>
                                    </label>
                                </div>
                            ))}
                        </section>
                    </div>
                    {goal.plan.clarifyingQuestions.length > 0 && (
                        <div className="mc__questions">
                            <h4>Open questions (answer via ARA: "refine goal {goal.title.slice(0, 30)}: …")</h4>
                            <ul>{goal.plan.clarifyingQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                        </div>
                    )}
                </>
            ) : (
                <p className="mc__brief">No plan yet — ask ARA to "refine goal {goal.title.slice(0, 30)}: …"</p>
            )}

            {goal.notes.length > 0 && (
                <div className="mc__notes">
                    {goal.notes.slice(-3).map((n, i) => (
                        <p key={i}><time>{new Date(n.ts).toLocaleDateString()}</time> {n.text}</p>
                    ))}
                </div>
            )}
            <div className="mc__note-add">
                <input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && note.trim()) { addGoalNote(goal.id, note); setNote(''); } }}
                    placeholder="Add a progress note…"
                    aria-label={`Add note to ${goal.title}`}
                />
            </div>
        </article>
    );
}

export default function MissionControl() {
    const { goals, createGoal, updateGoalPlan } = useGoals();
    const { integrations } = useIntegrations();
    const [title, setTitle] = useState('');
    const [busy, setBusy] = useState(false);

    const create = async () => {
        const t = title.trim();
        if (!t || busy) return;
        setBusy(true);
        try {
            const goal = createGoal(t); // appears immediately…
            const plan = await generateGoalPlan(t, integrations.llm);
            updateGoalPlan(goal.id, plan); // …plan fills in when ready
            setTitle('');
        } finally {
            setBusy(false);
        }
    };

    const active = goals.filter(g => g.status !== 'done');
    const done = goals.filter(g => g.status === 'done');

    return (
        <div className="mc">
            <header className="mc__head">
                <div className="mc__title"><Target size={15} aria-hidden /> Mission Control</div>
                <div className="mc__new">
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void create(); }}
                        placeholder='e.g. "Grow to 1,000 subscribers" — or tell ARA: new goal …'
                        aria-label="New goal title"
                        disabled={busy}
                    />
                    <button onClick={() => void create()} disabled={busy || !title.trim()}>
                        <Plus size={13} aria-hidden /> {busy ? 'Planning…' : 'New goal'}
                    </button>
                </div>
            </header>

            {goals.length === 0 && (
                <p className="mc__empty">No goals yet. Create one above, or tell ARA <em>"new goal grow the rent roll by 10 doors"</em> — the agent drafts the brief, splits the work between itself and you, and asks what it needs to know.</p>
            )}

            <div className="mc__grid">
                {active.map(g => <GoalCard key={g.id} goal={g} />)}
            </div>
            {done.length > 0 && (
                <>
                    <h3 className="mc__done-head">Done</h3>
                    <div className="mc__grid">{done.map(g => <GoalCard key={g.id} goal={g} />)}</div>
                </>
            )}
        </div>
    );
}
