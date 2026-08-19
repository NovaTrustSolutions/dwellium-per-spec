/**
 * InteractiveDocs — Scribe's third mode: Gamma-style card/block documents.
 * Zero props; reads the per-user idocs store + integrations. Three views:
 * library → editor → present (full-panel overlay inside `.scribe`).
 *
 * Widget-action bus: `scribe.create-interactive-doc` (payload.text/title) is
 * consumed on mount and while mounted → generates a doc and opens the editor.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UserContext } from '../../../context/UserContext';
import { useIntegrations } from '../../../hooks/useIntegrations';
import { WIDGET_ACTION_EVENT, consumePendingWidgetAction, type WidgetActionRequest } from '../../../lib/widgetActions';
import IDocEditor from './IDocEditor';
import IDocLibrary from './IDocLibrary';
import IDocRenderer from './IDocRenderer';
import PresenterHost from './PresenterView';
import SharedDocViewer from './SharedDocViewer';
import { generateDocFromPrompt } from './idocsAi';
import { addCardSeconds, idocsUserIdHolder, recordView, replaceDoc, setActive, setView, useIdocs } from './idocsStore';
import './InteractiveDocs.css';

export default function InteractiveDocs() {
    // Per-user namespace — raw context (NOT useUser()) so anon/test envs degrade to `_anonymous`.
    const userCtx = useContext(UserContext);
    idocsUserIdHolder.current = userCtx?.user?.id ?? null;
    const state = useIdocs();
    const { integrations } = useIntegrations();
    const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
    const [genBusy, setGenBusy] = useState(false);
    const llmRef = useRef(integrations.llm);
    llmRef.current = integrations.llm;

    // ── widget action bus ──
    useEffect(() => {
        const apply = (req: WidgetActionRequest) => {
            if (req.verb !== 'create-interactive-doc') return;
            const prompt = String(req.payload.text ?? req.payload.title ?? '').trim();
            if (!prompt) return;
            setView('library');
            setGenBusy(true);
            void generateDocFromPrompt(prompt, {}, llmRef.current)
                .then((doc) => {
                    if (doc) { replaceDoc(doc); setActive(doc.id); setView('edit'); }
                    else setPendingPrompt(prompt); // no LLM / bad reply → prefill the composer instead
                })
                .catch(() => setPendingPrompt(prompt))
                .finally(() => setGenBusy(false));
        };
        const handler = (ev: Event) => {
            consumePendingWidgetAction('scribe'); // live event supersedes the slot
            const req = (ev as CustomEvent<WidgetActionRequest>).detail;
            if (req?.widget === 'scribe') apply(req);
        };
        window.addEventListener(WIDGET_ACTION_EVENT, handler);
        const pending = consumePendingWidgetAction('scribe');
        if (pending) apply(pending);
        return () => window.removeEventListener(WIDGET_ACTION_EVENT, handler);
    }, []);

    const active = state.activeId ? state.docs.find((d) => d.id === state.activeId) ?? null : null;

    // ── present-mode analytics: views + per-card seconds ──
    const presenting = state.view === 'present' && !!active;
    const cardTimer = useRef<{ cardId: string; since: number } | null>(null);
    const flushCard = useCallback((docId: string) => {
        const t = cardTimer.current;
        if (!t) return;
        addCardSeconds(docId, t.cardId, (Date.now() - t.since) / 1000);
        cardTimer.current = null;
    }, []);
    const activeIdRef = useRef<string | null>(null);
    activeIdRef.current = active?.id ?? null;
    useEffect(() => {
        if (!presenting || !active) return;
        const docId = active.id;
        recordView(docId);
        return () => flushCard(docId);
        // Only re-run when entering/leaving present mode for a doc — not on every store write.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presenting, active?.id]);
    const onCardVisible = useCallback((cardId: string) => {
        const docId = activeIdRef.current;
        if (!docId) return;
        if (cardTimer.current?.cardId === cardId) return;
        flushCard(docId);
        cardTimer.current = { cardId, since: Date.now() };
    }, [flushCard]);
    const [scrollPresent, setScrollPresent] = useState(false);
    // Wave 2: Present is controlled here so the presenter window can drive it.
    const [presentIdx, setPresentIdx] = useState(0);
    const [presenter, setPresenter] = useState(false);
    useEffect(() => { if (!presenting) { setPresentIdx(0); setPresenter(false); } }, [presenting]);
    const exitPresent = useCallback(() => { setScrollPresent(false); setView('edit'); }, []);
    const toggleScroll = useCallback(() => setScrollPresent((s) => !s), []);
    const closePresenter = useCallback(() => setPresenter(false), []);

    return (
        <div className="scribe-idocs">
            {genBusy && <div className="scribe-idocs__genbar" role="status">✦ Generating your Interactive Doc…</div>}
            {state.view === 'edit' && active
                // Wave 3B role gating: view/comment members get the renderer (no editor chrome); owner/edit get the editor.
                ? (active.shared && (active.shared.role === 'view' || active.shared.role === 'comment')
                    ? <SharedDocViewer key={active.id} doc={active} />
                    : <IDocEditor key={active.id} doc={active} />)
                : <IDocLibrary state={state} initialPrompt={pendingPrompt} />}
            {presenting && active && (
                <div className="scribe-idocs__present-overlay">
                    {!scrollPresent && (
                        <button type="button" className={`scribe-idocs__presenter-btn${presenter ? ' is-active' : ''}`} onClick={() => setPresenter((p) => !p)} aria-pressed={presenter} title="Open presenter view (notes, timer, next card)">Presenter view</button>
                    )}
                    {presenter && !scrollPresent && <PresenterHost doc={active} index={presentIdx} onIndex={setPresentIdx} onClose={closePresenter} />}
                    {scrollPresent ? (
                        <div className="scribe-idocs__present-scroll">
                            <div className="scribe-idocs__present-bar scribe-idocs__present-bar--top">
                                <button type="button" className="scribe-idocs__pbtn" onClick={toggleScroll}>Cards</button>
                                <span className="scribe-idocs__spacer" />
                                <button type="button" className="scribe-idocs__pbtn" onClick={exitPresent} aria-label="Exit presentation">Esc</button>
                            </div>
                            <IDocRenderer doc={active} mode="scroll" onCardVisible={onCardVisible} />
                        </div>
                    ) : (
                        <IDocRenderer doc={active} mode="present" activeCardIndex={presentIdx} onActiveCardChange={setPresentIdx} onExit={exitPresent} onToggleScroll={toggleScroll} onCardVisible={onCardVisible} />
                    )}
                </div>
            )}
        </div>
    );
}
