/**
 * CostAdvisorPanel — the "is this worth your time?" surface.
 *
 * Plan 068 Phase 4: the advisor now reads the user's OWN to-dos (ThoughtWeaver
 * "Today" list), not the AI personas' queue — persona-queue tasks are already
 * with AI. A sliding $/hour KPI (what your time is worth) drives a live list
 * of open to-dos that AI delegation (Hermes) or online outsourcing could do
 * for LESS than doing them yourself. Same component in two places:
 *   - variant="full"    → slider + recommendations + delegate/snooze/dismiss
 *                          + Delegated / Hidden lists (AI Spend widget)
 *   - variant="compact" → recommendations only, read-only (Honcho/Hermes panel)
 */
import { useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import { Gauge, Sparkles, Users, TrendingDown, Clock, Trash2, RotateCcw } from 'lucide-react';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { todoStore, type TodoItem } from '../ThoughtWeaver/todoStore';
import { personaWorkStore, type PersonaWork } from '../../lib/agents/personaWorkStore';
import { useLlmUsage } from '../../lib/llmUsageStore';
import { useIntegrations } from '../../hooks/useIntegrations';
import { hasActiveLlm } from '../../lib/llmClient';
import { useCostKpi, setCostKpi, MIN_HOURLY_KPI, MAX_HOURLY_KPI } from '../../lib/costKpiStore';
import {
    advisorCandidates,
    evaluateTasks,
    totalSavings,
    measuredHermesTaskCost,
    pickHermesPersona,
    type Recommendation,
} from '../../lib/costAdvisor';
import { dismissAdvice, snoozeAdvice, undoAdvice, delegateTodo, reclaimTodo } from '../../lib/advisorActions';
import { findPersona, DEFAULT_PERSONAS } from '../../lib/agents/personas';
import './CostAdvisorPanel.css';

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const money = (n: number): string => `$${n.toFixed(2)}`;

function useTodos(): TodoItem[] {
    return useSyncExternalStore(todoStore.subscribe, todoStore.getSnapshot, todoStore.getServerSnapshot);
}
function usePersonaWork(): Record<string, PersonaWork> {
    return useSyncExternalStore(personaWorkStore.subscribe, personaWorkStore.getSnapshot, personaWorkStore.getServerSnapshot);
}

function personaName(personaId: string): string {
    return findPersona(DEFAULT_PERSONAS, personaId)?.name ?? personaId;
}

/** Delegated to-do's live status from personaWorkStore (Queued / Running / Done / Failed / Missing). */
function delegatedStatus(work: Record<string, PersonaWork>, personaId: string, taskId: string): string {
    const task = work[personaId]?.tasks.find(t => t.id === taskId);
    if (!task) return 'Missing';
    switch (task.status) {
        case 'todo': return 'Queued';
        case 'running': return 'Running';
        case 'done': return 'Done';
        case 'failed': return 'Failed';
        default: return 'Missing';
    }
}

/** Focus the next row's first action button, or fall back to the section heading — never lose focus to body. */
function focusAfterAction(
    order: string[],
    fromId: string,
    rowRefs: Map<string, HTMLButtonElement>,
    headingRef: RefObject<HTMLElement | null>,
) {
    requestAnimationFrame(() => {
        const idx = order.indexOf(fromId);
        for (let i = idx + 1; i < order.length; i++) {
            const btn = rowRefs.get(order[i]);
            if (btn && document.contains(btn)) { btn.focus(); return; }
        }
        for (let i = idx - 1; i >= 0; i--) {
            const btn = rowRefs.get(order[i]);
            if (btn && document.contains(btn)) { btn.focus(); return; }
        }
        headingRef.current?.focus();
    });
}

export default function CostAdvisorPanel({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
    usePerUserIdentity();
    const kpi = useCostKpi();
    const todos = useTodos();
    const work = usePersonaWork();
    const ledger = useLlmUsage();
    const { integrations } = useIntegrations();
    const llmActive = hasActiveLlm(integrations.llm);

    const measured = useMemo(() => measuredHermesTaskCost(ledger, work), [ledger, work]);
    const candidates = useMemo(() => advisorCandidates(todos), [todos]);
    const recs = useMemo(
        () => evaluateTasks(candidates, kpi, { aiCostOverrideUsd: measured?.perTaskUsd }),
        [candidates, kpi, measured],
    );
    const reclaimable = totalSavings(recs);

    const openTodos = useMemo(() => todos.filter(t => !t.done), [todos]);
    const now = Date.now();
    const delegated = useMemo(() => openTodos.filter(t => t.advisor?.delegatedTo), [openTodos]);
    const hidden = useMemo(
        () => openTodos.filter(t => !t.advisor?.delegatedTo && (t.advisor?.dismissed || (t.advisor?.snoozedUntil != null && t.advisor.snoozedUntil > now))),
        [openTodos, now],
    );

    const headingRef = useRef<HTMLHeadingElement>(null);
    const rowRefs = useRef(new Map<string, HTMLButtonElement>()).current;
    const order = recs.map(r => r.taskId);

    const handleDismiss = (taskId: string) => { dismissAdvice(taskId); focusAfterAction(order, taskId, rowRefs, headingRef); };
    const handleSnooze = (taskId: string) => { snoozeAdvice(taskId, Date.now() + SNOOZE_MS); focusAfterAction(order, taskId, rowRefs, headingRef); };
    const handleDelegate = (taskId: string, category: Recommendation['category']) => {
        delegateTodo(taskId, pickHermesPersona(category));
        focusAfterAction(order, taskId, rowRefs, headingRef);
    };
    // The Undo button unmounts with its row — keep keyboard users in the panel.
    const handleUndo = (taskId: string) => { undoAdvice(taskId); headingRef.current?.focus(); };
    const handleReclaim = (todoId: string) => { reclaimTodo(todoId); headingRef.current?.focus(); };

    return (
        <section className="cadv" aria-label="Time-value advisor">
            {variant === 'full' && (
                <div className="cadv__kpi">
                    <label className="cadv__kpi-label" htmlFor="cadv-kpi">
                        <Gauge size={14} aria-hidden /> My time is worth
                        <strong className="cadv__kpi-value">${kpi}/hr</strong>
                    </label>
                    <input
                        id="cadv-kpi"
                        className="cadv__slider"
                        type="range"
                        min={MIN_HOURLY_KPI}
                        max={MAX_HOURLY_KPI}
                        step={5}
                        value={kpi}
                        onChange={(e) => setCostKpi(Number(e.target.value))}
                        aria-label="Value of your time in dollars per hour"
                    />
                    <div className="cadv__kpi-scale"><span>${MIN_HOURLY_KPI}/hr</span><span>${MAX_HOURLY_KPI}/hr</span></div>
                </div>
            )}

            <div className="cadv__head">
                <h3 className="cadv__title" ref={headingRef} tabIndex={-1}>
                    <TrendingDown size={14} aria-hidden /> Do it cheaper
                </h3>
                {recs.length > 0 && <span className="cadv__total" title="Estimated time-value reclaimable if delegated">≈ {money(reclaimable)} reclaimable</span>}
            </div>

            {openTodos.length === 0 ? (
                <p className="cadv__empty">No open to-dos — add some to ThoughtWeaver&apos;s Today list.</p>
            ) : recs.length === 0 ? (
                <p className="cadv__empty">Nothing flagged — your open to-dos cost about ${kpi}/hr or less to do yourself.</p>
            ) : (
                <ul className="cadv__list">
                    {recs.map((r) => (
                        <li key={r.taskId} className="cadv__item">
                            <div className="cadv__item-top">
                                <span className="cadv__item-title" title={r.title}>{r.title}</span>
                                <span className="cadv__save">save ≈ {money(r.savingsUsd)}</span>
                            </div>
                            <div className="cadv__item-meta">
                                <span className="cadv__badge">
                                    {r.cheapest === 'ai'
                                        ? <><Sparkles size={11} aria-hidden /> AI automation</>
                                        : <><Users size={11} aria-hidden /> {r.role}</>}
                                </span>
                                <span className="cadv__cost">
                                    you {money(r.manualCostUsd)} → {r.cheapest === 'ai' ? 'AI' : 'outsource'} {money(r.cheapestCostUsd)}
                                </span>
                                {r.aiCostUsd != null && (
                                    <span className="cadv__source">
                                        {r.aiCostSource === 'measured'
                                            ? `measured from your last ${measured?.samples ?? 0} Hermes tasks`
                                            : 'benchmark estimate'}
                                    </span>
                                )}
                            </div>

                            {variant === 'full' && (
                                <div className="cadv__actions">
                                    {/* Only offer Hermes for work an AI can actually do (not phone calls, design, dev). */}
                                    {r.aiCostUsd != null && (
                                        <button
                                            type="button"
                                            className="cadv__action cadv__action--primary"
                                            aria-label={`Delegate to ${personaName(pickHermesPersona(r.category))}: ${r.title}`}
                                            onClick={() => handleDelegate(r.taskId, r.category)}
                                        >
                                            <Sparkles size={12} aria-hidden /> Delegate to {personaName(pickHermesPersona(r.category))}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="cadv__action"
                                        ref={(el) => { if (el) rowRefs.set(r.taskId, el); else rowRefs.delete(r.taskId); }}
                                        aria-label={`Snooze 1 week: ${r.title}`}
                                        onClick={() => handleSnooze(r.taskId)}
                                    >
                                        <Clock size={12} aria-hidden /> Snooze 1 week
                                    </button>
                                    <button
                                        type="button"
                                        className="cadv__action"
                                        aria-label={`Dismiss: ${r.title}`}
                                        onClick={() => handleDismiss(r.taskId)}
                                    >
                                        <Trash2 size={12} aria-hidden /> Dismiss
                                    </button>
                                    {!llmActive && r.aiCostUsd != null && (
                                        <span className="cadv__no-llm">Hermes runs it once an AI key is set</span>
                                    )}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {variant === 'full' && delegated.length > 0 && (
                <div className="cadv__delegated">
                    <h4 className="cadv__subhead">Delegated</h4>
                    <ul className="cadv__list">
                        {delegated.map(t => {
                            const link = t.advisor!.delegatedTo!;
                            const status = delegatedStatus(work, link.personaId, link.taskId);
                            return (
                                <li key={t.id} className="cadv__item cadv__item--delegated">
                                    <span className="cadv__item-title" title={t.text}>{t.text}</span>
                                    <span className="cadv__delegated-meta">
                                        {personaName(link.personaId)} · {status}
                                    </span>
                                    {(status === 'Failed' || status === 'Missing') && (
                                        <button type="button" className="cadv__action" onClick={() => handleReclaim(t.id)} aria-label={`Back to my list: ${t.text}`}>
                                            Back to my list
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {variant === 'full' && hidden.length > 0 && (
                <details className="cadv__hidden">
                    <summary>Hidden ({hidden.length})</summary>
                    <ul className="cadv__list">
                        {hidden.map(t => (
                            <li key={t.id} className="cadv__item cadv__item--hidden">
                                <span className="cadv__item-title" title={t.text}>{t.text}</span>
                                <button
                                    type="button"
                                    className="cadv__action"
                                    aria-label={`Undo: ${t.text}`}
                                    onClick={() => handleUndo(t.id)}
                                >
                                    <RotateCcw size={12} aria-hidden /> Undo
                                </button>
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            <footer className="cadv__foot">
                Estimates · your rate × typical task time vs. AI automation / public online outsourcing rates
            </footer>
        </section>
    );
}
