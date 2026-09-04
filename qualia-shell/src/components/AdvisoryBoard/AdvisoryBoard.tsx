/**
 * AdvisoryBoard — the 5 Persona Advisory Board widget.
 *
 * CRIT flow, enforced in that order: the user states a decision → the board
 * INTERVIEWS first (≤3 focused questions) → the user answers or explicitly
 * skips (assumptions get stated instead) → the full board runs → the result
 * renders in SKILL.md's Output Format section order.
 *
 * Completions route through the existing `callLlm(req, integrations.llm)`; no
 * provider code lives here. With no key configured the widget shows the shared
 * <AIDegradedState> banner — never a blank panel.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Copy, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { useAIAvailability } from '../../hooks/useAIAvailability';
import AIDegradedState from '../Shell/AIDegradedState';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { advisoryLensBus } from '../../lib/busChannels';
import {
    CRIT_STEPS, LENS_BY_ID, LENSES, MAX_INTERVIEW_QUESTIONS,
    NON_AFFILIATION_DISCLAIMER, type LensId,
} from '../../lib/advisoryBoard/lenses';
import {
    BOARD_SYSTEM_PROMPT, STARTER_PROMPT,
    buildBoardPrompt, buildInterviewPrompt, buildLensPrompt,
} from '../../lib/advisoryBoard/prompts';
import { parseBoard, parseInterviewQuestions } from '../../lib/advisoryBoard/parse';
import { advisoryBoardStore, removeSession, saveSession } from '../../lib/advisoryBoard/store';
import { DEMO_BOARD } from '../../lib/advisoryBoard/demo';
import type { AdvisoryBoardSession } from '../../lib/advisoryBoard/types';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import AdvisoryBoardDiagram from './AdvisoryBoardDiagram';
import './AdvisoryBoard.css';

type Stage = 'topic' | 'interview' | 'result';

const newId = () => `ab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export default function AdvisoryBoard() {
    usePerUserIdentity();
    const { integrations } = useIntegrations();
    const ai = useAIAvailability();
    const llmReady = hasActiveLlm(integrations.llm);
    const sessions = useSyncExternalStore(
        advisoryBoardStore.subscribe, advisoryBoardStore.getSnapshot, advisoryBoardStore.getServerSnapshot,
    );

    const [stage, setStage] = useState<Stage>('topic');
    const [topic, setTopic] = useState('');
    const [questions, setQuestions] = useState<string[]>([]);
    const [answers, setAnswers] = useState<string[]>([]);
    const [session, setSession] = useState<AdvisoryBoardSession | null>(null);
    const [busy, setBusy] = useState<'' | 'interview' | 'board' | LensId>('');
    const [err, setErr] = useState('');
    const [copied, setCopied] = useState(false);
    const [focusLens, setFocusLens] = useState<LensId | null>(null);

    // Demo mode: no saved session yet → show the worked example.
    const showingDemo = !session && sessions.length === 0;
    const shown = session ?? (sessions.length > 0 ? sessions[0] : DEMO_BOARD);
    const result = shown.result;

    // Persona card on the Home diagram → focus this widget on that lens.
    // `replayWithinMs` closes the mount race: the Home diagram emits the lens
    // BEFORE this widget's window has mounted.
    useEffect(() => advisoryLensBus.on((p) => {
        const id = p.lensId as LensId;
        if (LENS_BY_ID[id]) setFocusLens(id);
    }, { replayWithinMs: 8000 }), []);

    const run = useCallback(async (prompt: string, maxTokens: number): Promise<string> => {
        const res = await callLlm({ systemPrompt: BOARD_SYSTEM_PROMPT, prompt, maxTokens, temperature: 0.4 }, integrations.llm);
        return res?.text?.trim() ?? '';
    }, [integrations.llm]);

    const startInterview = async () => {
        const t = topic.trim();
        if (!t || busy) return;
        if (!llmReady) { setErr('Add an AI key to run the board.'); return; }
        setBusy('interview'); setErr('');
        try {
            const text = await run(buildInterviewPrompt(t), 400);
            const qs = parseInterviewQuestions(text, MAX_INTERVIEW_QUESTIONS);
            setQuestions(qs.length ? qs : []);
            setAnswers(new Array(qs.length).fill(''));
            setStage('interview');
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'The interview step failed.');
        } finally { setBusy(''); }
    };

    const runBoard = async (skipped: boolean) => {
        if (busy) return;
        if (!llmReady) { setErr('Add an AI key to run the board.'); return; }
        setBusy('board'); setErr('');
        try {
            const raw = await run(buildBoardPrompt({ topic, questions, answers, skipped }), 2600);
            const next: AdvisoryBoardSession = {
                id: newId(), topic: topic.trim(), questions, answers, skipped,
                result: parseBoard(raw), lensNotes: {}, updatedAt: Date.now(),
            };
            setSession(next);
            saveSession(next);
            setStage('result');
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'The board run failed.');
        } finally { setBusy(''); }
    };

    const askOneLens = async (lensId: LensId) => {
        if (busy) return;
        setFocusLens(lensId);
        if (!llmReady) { setErr('Add an AI key to ask a single lens.'); return; }
        const target = session ?? (sessions.length > 0 ? sessions[0] : null);
        const subject = (target?.topic || topic).trim();
        if (!subject) { setErr('Write the decision first, then ask a single lens.'); return; }
        setBusy(lensId); setErr('');
        try {
            const raw = await run(buildLensPrompt(lensId, subject, target?.result?.contextRead), 700);
            if (target) {
                const next = { ...target, lensNotes: { ...target.lensNotes, [lensId]: raw }, updatedAt: Date.now() };
                setSession(next);
                saveSession(next);
            }
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'That lens failed to answer.');
        } finally { setBusy(''); }
    };

    const restart = () => {
        setSession(null); setStage('topic'); setTopic(''); setQuestions([]); setAnswers([]); setErr('');
    };

    const copyStarter = () => {
        void navigator.clipboard?.writeText(STARTER_PROMPT).then(() => {
            setCopied(true); setTimeout(() => setCopied(false), 1600);
        }).catch(() => setErr('Could not copy to the clipboard.'));
    };

    const orderedViews = useMemo(
        () => (result ? LENSES.map((l) => result.views.find((v) => v.lensId === l.id)).filter(Boolean) : []),
        [result],
    );

    return (
        <div className="ab" data-testid="advisory-board-widget">
            <AdvisoryBoardDiagram onSelectLens={askOneLens} />

            <AIDegradedState availability={ai} needsKey />
            {err && <div className="ab__err" role="alert">{err}</div>}

            {/* ── How to use it ── */}
            <details className="ab__how">
                <summary>How to use it — the CRIT loop in four steps</summary>
                <ol className="ab__how-list">
                    {CRIT_STEPS.map((s) => (
                        <li key={s.key}><b>{s.label}</b> — {s.blurb}</li>
                    ))}
                </ol>
                <p className="ab__how-note">
                    Interview first, always. Skipping it is allowed — the board then states its assumptions out loud before advising.
                </p>
                <pre className="ab__starter">{STARTER_PROMPT}</pre>
                <button type="button" className="ab__btn ab__btn--ghost" onClick={copyStarter}>
                    <Copy size={13} aria-hidden="true" /> {copied ? 'Copied' : 'Copy starter prompt'}
                </button>
            </details>

            {/* ── Step 1: the decision ── */}
            {stage === 'topic' && (
                <div className="ab__step">
                    <label className="ab__label" htmlFor="ab-topic">The decision you want stress-tested</label>
                    <textarea
                        id="ab-topic"
                        className="ab__input"
                        rows={3}
                        value={topic}
                        placeholder="e.g. Raise renewal rents 6% across Woodland Parc, or hold at 3% to protect occupancy?"
                        onChange={(e) => setTopic(e.target.value)}
                    />
                    <div className="ab__actions">
                        <button type="button" className="ab__btn" onClick={startInterview} disabled={!topic.trim() || !!busy}>
                            {busy === 'interview' ? <><Loader2 size={14} className="ab__spin" aria-hidden="true" /> Preparing questions…</> : 'Interview me first →'}
                        </button>
                        {/* Ilya 2026-09-04: the board must be runnable without the interview — same skip path as step 2. */}
                        <button type="button" className="ab__btn ab__btn--ghost" onClick={() => runBoard(true)} disabled={!topic.trim() || !!busy}>
                            {busy === 'board' ? <><Loader2 size={14} className="ab__spin" aria-hidden="true" /> Running the board…</> : 'Run the board →'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Step 2: the interview ── */}
            {stage === 'interview' && (
                <div className="ab__step" data-testid="advisory-board-interview">
                    <h3 className="ab__h3">The board asks first</h3>
                    {questions.length === 0 && <p className="ab__muted">No questions came back — run the board and it will state its assumptions.</p>}
                    {questions.map((q, i) => (
                        <div key={q} className="ab__qa">
                            <label className="ab__label" htmlFor={`ab-a-${i}`}>{i + 1}. {q}</label>
                            <textarea
                                id={`ab-a-${i}`}
                                className="ab__input"
                                rows={2}
                                value={answers[i] ?? ''}
                                onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                            />
                        </div>
                    ))}
                    <div className="ab__row">
                        <button type="button" className="ab__btn" onClick={() => runBoard(false)} disabled={busy === 'board'}>
                            {busy === 'board' ? <><Loader2 size={14} className="ab__spin" aria-hidden="true" /> Running the board…</> : 'Run the board →'}
                        </button>
                        <button type="button" className="ab__btn ab__btn--ghost" onClick={() => runBoard(true)} disabled={busy === 'board'}>
                            Skip the interview (state assumptions)
                        </button>
                    </div>
                </div>
            )}

            {/* ── The board output ── */}
            {result && (stage === 'result' || stage === 'topic') && (
                <div className="ab__result" data-testid="advisory-board-result">
                    <div className="ab__result-head">
                        <span className={`ab__chip ${showingDemo ? 'ab__chip--demo' : ''}`}>
                            {showingDemo ? 'Example board — not your data' : 'Your board'}
                        </span>
                        <span className="ab__result-topic">{shown.topic}</span>
                        <button type="button" className="ab__btn ab__btn--ghost" onClick={restart}>
                            <RotateCcw size={13} aria-hidden="true" /> Run your own decision
                        </button>
                        {!showingDemo && (
                            <button type="button" className="ab__btn ab__btn--ghost" onClick={() => { removeSession(shown.id); restart(); }}>
                                <Trash2 size={13} aria-hidden="true" /> Delete
                            </button>
                        )}
                    </div>

                    {result.unparsed ? (
                        <pre className="ab__raw" data-testid="advisory-board-raw">{result.raw}</pre>
                    ) : (
                        <>
                            <section className="ab__sec"><h3 className="ab__h3">Decision</h3><p>{result.decision}</p></section>
                            <section className="ab__sec"><h3 className="ab__h3">Context Read</h3><p>{result.contextRead}</p></section>
                            <section className="ab__sec">
                                <h3 className="ab__h3">5 Lens Views</h3>
                                {orderedViews.map((v) => v && (
                                    <article key={v.lensId} className={`ab__lens ${focusLens === v.lensId ? 'is-focused' : ''}`} data-lens={v.lensId}>
                                        <header className="ab__lens-h">
                                            <span className="ab__lens-name">{LENS_BY_ID[v.lensId].name}</span>
                                            <span className="ab__lens-tag">{LENS_BY_ID[v.lensId].shorthand} · {LENS_BY_ID[v.lensId].role}</span>
                                            <button type="button" className="ab__btn ab__btn--ghost ab__btn--xs"
                                                onClick={() => askOneLens(v.lensId)} disabled={busy === v.lensId}>
                                                {busy === v.lensId ? 'Asking…' : 'Ask just this lens'}
                                            </button>
                                        </header>
                                        <p><b>View:</b> {v.view}</p>
                                        <p><b>Blind spot:</b> {v.blindSpot}</p>
                                        <p><b>Recommendation:</b> {v.recommendation}</p>
                                        {shown.lensNotes[v.lensId] && (
                                            <pre className="ab__note">{shown.lensNotes[v.lensId]}</pre>
                                        )}
                                    </article>
                                ))}
                            </section>
                            <section className="ab__sec"><h3 className="ab__h3">Disagreement</h3><p>{result.disagreement}</p></section>
                            <section className="ab__sec"><h3 className="ab__h3">Future Self Check</h3><p>{result.futureSelfCheck}</p></section>
                            <section className="ab__sec ab__sec--brief">
                                <h3 className="ab__h3">Final Decision Brief</h3>
                                <p><b>Decision:</b> {result.brief.decision}</p>
                                <p><b>Why:</b> {result.brief.why}</p>
                                <p><b>Risk:</b> {result.brief.risk}</p>
                                <p><b>Next action:</b> {result.brief.nextAction}</p>
                                <p><b>Do not do:</b> {result.brief.doNotDo}</p>
                            </section>
                        </>
                    )}
                </div>
            )}

            <p className="ab__disclaimer">{NON_AFFILIATION_DISCLAIMER}</p>
        </div>
    );
}
