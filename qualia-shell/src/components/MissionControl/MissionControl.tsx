/**
 * MissionControl — P12-5 (gap item 7): midterm goals with agent-drafted
 * plans. Each goal card shows the BRIEF, the agent's actions (run in-card or
 * hand to ARA), YOUR actions (the video's "my role"), open clarifying
 * questions (answered inline to refine), progress, target date, and notes.
 * Create here or by telling ARA "new goal …".
 *
 * Plan 075 P3: rename/target-date/action edit-add-remove, in-card agent runs
 * (stored on the action so a result survives reload), and inline refine —
 * see MissionControl.css class contract comment + the plan's §5 UI contract
 * for exact accessible names (a harness drives the UI by these).
 */
import { useEffect, useRef, useState } from 'react';
import { Target, Play, Trash2, Plus, Pencil, X } from 'lucide-react';
import {
    useGoals,
    goalProgress,
    type Goal,
    type GoalAction,
    type GoalSide,
} from '../../lib/goalsStore';
import { generateGoalPlan } from '../../lib/goalPlanner';
import { runGoalAction, refineGoal } from '../../lib/goalRunner';
import { useIntegrations } from '../../hooks/useIntegrations';
import { requestAraPrompt } from '../../lib/llmRouter';
import { captureOwner } from '../../lib/perUserIdentity';
import { recordArtifact } from '../../lib/artifactStore';
import type { IntegrationsBundle } from '../../types/integrations';
import './MissionControl.css';

/** `YYYY-MM-DD` parsed as a LOCAL calendar date (never `new Date(str)` — that's UTC and shifts a day west of UTC). */
function parseLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function pluralDays(n: number): string {
    return `${n} day${n === 1 ? '' : 's'}`;
}

/** Due badge text + modifier class, computed from LOCAL calendar days (today's local midnight vs the target). */
function computeDueBadge(targetDate: string): { text: string; cls: string } {
    const target = parseLocalDate(targetDate);
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((target.getTime() - todayMidnight.getTime()) / 86_400_000);
    if (diffDays === 0) return { text: 'Due today', cls: 'mc__due--soon' };
    if (diffDays > 0) return { text: `Due in ${pluralDays(diffDays)}`, cls: diffDays <= 7 ? 'mc__due--soon' : '' };
    return { text: `Overdue by ${pluralDays(-diffDays)}`, cls: 'mc__due--overdue' };
}

/** Per-action run + edit row. Its own component so run/edit state doesn't leak across rows or actions. */
function ActionRow({ goal, side, action, index }: { goal: Goal; side: GoalSide; action: GoalAction; index: number }) {
    const { toggleGoalAction, editGoalAction, removeGoalAction, setGoalActionResult, addGoalNote } = useGoals();
    const { integrations } = useIntegrations();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(action.text);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<'no-llm' | 'failed' | null>(null);
    // ponytail: per-row mounted flag (JS has no async-cancel primitive here); re-armed
    // in the effect BODY (not just at declaration) so StrictMode's mount→unmount→mount
    // double-invoke in dev can't leave this stuck `false` on the surviving instance.
    const mountedRef = useRef(false);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const canRun = side === 'agentActions';

    function openEdit() {
        setDraft(action.text);
        setEditing(true);
    }
    function saveEdit() {
        const t = draft.trim();
        if (t) editGoalAction(goal.id, side, index, t);
        setEditing(false);
    }

    async function run() {
        if (busy) return;
        setBusy(true);
        setError(null);
        const stillOwner = captureOwner();
        const result = await runGoalAction(goal, action.text, integrations.llm);
        if (!stillOwner()) return; // account switched mid-run — drop the result entirely
        // Attach first; the note + artifact only when the result actually landed (the action
        // may have been edited/removed or the goal deleted while the run was in flight).
        const saved = result.ok && setGoalActionResult(goal.id, side, action.text, result.text, index);
        if (saved) {
            addGoalNote(goal.id, `▶ ${action.text} — result saved`);
            recordArtifact({
                content: result.text,
                source: 'mission-control',
                title: `${goal.title}: ${action.text}`.slice(0, 60),
                type: 'markdown',
            });
        }
        if (!mountedRef.current) return; // card left the tree meanwhile — no local state left to update
        setBusy(false);
        if (!result.ok) setError(result.reason);
    }

    function markDone() {
        if (!action.done) toggleGoalAction(goal.id, side, index);
    }

    function openInAra() {
        const draftLine = action.result ? `\n\nYour earlier draft:\n${action.result.text}` : '';
        requestAraPrompt(`For my goal "${goal.title}": ${action.text}${draftLine}`);
        window.dispatchEvent(new CustomEvent('qualia-open-widget', { detail: 'ara-console' }));
    }

    return (
        <div className="mc__action">
            <label className={action.done ? 'is-done' : ''}>
                <input type="checkbox" checked={action.done} onChange={() => toggleGoalAction(goal.id, side, index)} />
                {editing ? (
                    <input
                        className="mc__action-edit"
                        aria-label="Action text"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit();
                            else if (e.key === 'Escape') setEditing(false);
                        }}
                        autoFocus
                    />
                ) : (
                    <span className="mc__action-text">{action.text}</span>
                )}
            </label>
            <span className="mc__action-tools">
                {!editing && (
                    <button className="mc__icon-btn" aria-label={`Edit action: ${action.text}`} onClick={openEdit}>
                        <Pencil size={11} aria-hidden />
                    </button>
                )}
                <button className="mc__icon-btn" aria-label={`Remove action: ${action.text}`} onClick={() => removeGoalAction(goal.id, side, index)}>
                    <Trash2 size={11} aria-hidden />
                </button>
                {canRun && (
                    <button className="mc__icon-btn" aria-label={`Run with agent: ${action.text}`} onClick={() => void run()} disabled={busy}>
                        <Play size={11} aria-hidden />
                    </button>
                )}
            </span>

            {busy && <p className="mc__running" role="status">Running…</p>}
            {error && (
                <p className="mc__run-error" role="alert">
                    {error === 'no-llm'
                        ? 'Add an AI key in Control Panel → API Keys to run agent actions.'
                        : 'The agent run failed — try again.'}
                </p>
            )}

            {action.result && (
                <div className="mc__result" role="region" aria-label={`Result for ${action.text}`}>
                    <pre className="mc__result-body">{action.result.text}</pre>
                    <div className="mc__result-actions">
                        <button aria-label={`Mark done: ${action.text}`} onClick={markDone} disabled={action.done}>Mark done</button>
                        <button aria-label={`Open in ARA: ${action.text}`} onClick={openInAra}>Open in ARA</button>
                        <button aria-label={`Dismiss result: ${action.text}`} onClick={() => setGoalActionResult(goal.id, side, action.text, null, index)}>Dismiss</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function AddActionForm({ goal, side }: { goal: Goal; side: GoalSide }) {
    const { addGoalAction } = useGoals();
    const [text, setText] = useState('');
    const label = side === 'agentActions' ? `Add agent action to ${goal.title}` : `Add your action to ${goal.title}`;

    function submit() {
        const t = text.trim();
        if (!t) return;
        addGoalAction(goal.id, side, t);
        setText('');
    }

    return (
        <form className="mc__add-action" onSubmit={e => { e.preventDefault(); submit(); }}>
            <input aria-label={label} value={text} onChange={e => setText(e.target.value)} placeholder="Add an action…" />
            <button type="submit" disabled={!text.trim()}><Plus size={11} aria-hidden /> Add</button>
        </form>
    );
}

type RefineStatus = 'idle' | 'refining' | 'refined' | 'failed';

function AnswerBox({ goal, llm }: { goal: Goal; llm: IntegrationsBundle['llm'] }) {
    const [text, setText] = useState('');
    const [status, setStatus] = useState<RefineStatus>('idle');
    const mountedRef = useRef(false);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    async function refine() {
        const t = text.trim();
        if (!t || status === 'refining') return;
        setStatus('refining');
        const stillOwner = captureOwner();
        const result = await refineGoal(goal.id, t, llm);
        if (!stillOwner()) return; // account switched mid-refine — do nothing
        if (!mountedRef.current) return;
        if (result.ok) {
            setText('');
            setStatus('refined');
        } else {
            // 'empty' can't happen (guarded above); 'not-found' is the only realistic failure left.
            setStatus('failed');
        }
    }

    return (
        <form className="mc__answer" onSubmit={e => { e.preventDefault(); void refine(); }}>
            <textarea
                aria-label={`Answers for ${goal.title}`}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={goal.plan?.clarifyingQuestions.length ? 'Answer the open questions to refine the plan…' : 'Add details or changes to refine the plan…'}
            />
            <button type="submit" disabled={!text.trim() || status === 'refining'}>Refine plan</button>
            {status !== 'idle' && (
                <p className="mc__answer-status" role="status">
                    {status === 'refining' ? 'Refining…' : status === 'refined' ? 'Plan refined.' : 'Refine failed — try again.'}
                </p>
            )}
        </form>
    );
}

function GoalCard({ goal }: { goal: Goal }) {
    const { setGoalStatus, addGoalNote, deleteGoal, renameGoal, setGoalTargetDate } = useGoals();
    const { integrations } = useIntegrations();
    const [note, setNote] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const progress = goalProgress(goal);

    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(goal.title);
    const escapingTitle = useRef(false);

    const [notesExpanded, setNotesExpanded] = useState(false);

    const clearDisarmTimer = () => {
        if (disarmTimer.current) { clearTimeout(disarmTimer.current); disarmTimer.current = null; }
    };
    // D10: a "Sure?" confirm state that never disarms is a footgun — arm it with
    // a 4s auto-disarm (and disarm on blur), clearing the timer on re-arm/unmount.
    const armDelete = () => {
        setConfirmDelete(true);
        clearDisarmTimer();
        disarmTimer.current = setTimeout(() => setConfirmDelete(false), 4000);
    };
    const disarmDelete = () => {
        clearDisarmTimer();
        setConfirmDelete(false);
    };
    useEffect(() => clearDisarmTimer, []);

    function openTitleEdit() {
        setTitleDraft(goal.title);
        escapingTitle.current = false;
        setEditingTitle(true);
    }
    function saveTitle() {
        const t = titleDraft.trim();
        if (t) renameGoal(goal.id, t);
        setEditingTitle(false);
    }

    const dueBadge = goal.targetDate ? computeDueBadge(goal.targetDate) : null;
    const answeredCount = goal.answers?.length ?? 0;

    const visibleNotes = notesExpanded ? goal.notes : goal.notes.slice(-3);

    return (
        <article className={`mc__card mc__card--${goal.status}`}>
            <header className="mc__card-head">
                <div className="mc__title-row" style={{ flex: 1 }}>
                    {editingTitle ? (
                        <input
                            className="mc__title-edit"
                            aria-label="Goal title"
                            value={titleDraft}
                            onChange={e => setTitleDraft(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') saveTitle();
                                else if (e.key === 'Escape') { escapingTitle.current = true; setEditingTitle(false); }
                            }}
                            onBlur={() => {
                                if (escapingTitle.current) { escapingTitle.current = false; return; }
                                saveTitle();
                            }}
                            autoFocus
                        />
                    ) : (
                        <h3>{goal.title}</h3>
                    )}
                    <button className="mc__icon-btn" aria-label={`Rename goal ${goal.title}`} onClick={openTitleEdit}>
                        <Pencil size={12} aria-hidden />
                    </button>
                </div>
                <select value={goal.status} onChange={e => setGoalStatus(goal.id, e.target.value as Goal['status'])} aria-label={`Status of ${goal.title}`}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="done">Done</option>
                </select>
                <button
                    className="mc__del"
                    onClick={() => { if (confirmDelete) deleteGoal(goal.id); else armDelete(); }}
                    onBlur={disarmDelete}
                    aria-label={`Delete goal ${goal.title}`}
                >
                    <Trash2 size={13} aria-hidden /> {confirmDelete ? 'Sure?' : ''}
                </button>
            </header>

            <div
                className="mc__progress"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress for ${goal.title}`}
            >
                <div className="mc__progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>

            <div className="mc__meta">
                <label className="mc__target">
                    <input
                        type="date"
                        aria-label={`Target date for ${goal.title}`}
                        value={goal.targetDate ?? ''}
                        onChange={e => setGoalTargetDate(goal.id, e.target.value || null)}
                    />
                </label>
                {goal.targetDate && (
                    <button className="mc__icon-btn" aria-label={`Clear target date for ${goal.title}`} onClick={() => setGoalTargetDate(goal.id, null)}>
                        <X size={11} aria-hidden />
                    </button>
                )}
                {dueBadge && <span className={`mc__due ${dueBadge.cls}`}>{dueBadge.text}</span>}
                {answeredCount > 0 && <span>{`Answered ${answeredCount}×`}</span>}
            </div>

            {goal.plan ? (
                <>
                    <p className="mc__brief">{goal.plan.brief}</p>
                    <div className="mc__lists">
                        <section>
                            <h4>Agent&apos;s actions</h4>
                            {goal.plan.agentActions.map((a, i) => (
                                <ActionRow key={`${a.text}-${i}`} goal={goal} side="agentActions" action={a} index={i} />
                            ))}
                            <AddActionForm goal={goal} side="agentActions" />
                        </section>
                        <section>
                            <h4>Your role</h4>
                            {goal.plan.userActions.map((a, i) => (
                                <ActionRow key={`${a.text}-${i}`} goal={goal} side="userActions" action={a} index={i} />
                            ))}
                            <AddActionForm goal={goal} side="userActions" />
                        </section>
                    </div>
                    {goal.plan.clarifyingQuestions.length > 0 && (
                        <div className="mc__questions">
                            <h4>Open questions</h4>
                            <ul>{goal.plan.clarifyingQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                        </div>
                    )}
                </>
            ) : (
                <p className="mc__brief">No plan yet — answer below to have the agent draft one.</p>
            )}

            {/* Always shown: a refine usually answers every open question, and hiding the box
                then would unmount it before "Plan refined." renders (and block further refines). */}
            <AnswerBox goal={goal} llm={integrations.llm} />

            {goal.notes.length > 0 && (
                <div className="mc__notes">
                    {visibleNotes.map((n, i) => (
                        <p key={i}><time>{new Date(n.ts).toLocaleDateString()}</time> {n.text}</p>
                    ))}
                    {goal.notes.length > 3 && (
                        <button
                            className="mc__notes-toggle"
                            aria-expanded={notesExpanded}
                            onClick={() => setNotesExpanded(v => !v)}
                        >
                            {notesExpanded ? 'Show fewer notes' : `Show all ${goal.notes.length} notes`}
                        </button>
                    )}
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
        const stillOwner = captureOwner(); // owner-race guard: account may switch mid-await
        setBusy(true);
        try {
            const goal = createGoal(t); // appears immediately…
            const plan = await generateGoalPlan(t, integrations.llm);
            if (!stillOwner()) return;
            updateGoalPlan(goal.id, plan); // …plan fills in when ready
        } finally {
            setTitle(''); // D9: clear on every exit path, not just the happy one — an
            // account switch mid-await must not leave user A's text in user B's input.
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
