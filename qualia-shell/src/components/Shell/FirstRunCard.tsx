/**
 * FirstRunCard — plan 046 F1 "Get to your first win".
 *
 * Three steps, each ticked from stores that already exist (no polling, no
 * backend): (1) an active LLM key (integrationsStore), (2) a first property
 * (useProperties), (3) an ARA reply (hermesLearningStore via araChatRuns).
 * Live-true → markDone (sticky). Dismiss = this session; "Don't show again"
 * = durable per user. MorningBriefBanner sister (own CSS; fixed, bottom-left
 * so the Assistant FAB / toast corner stays clear).
 */
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { Check, X } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { hasActiveLlm } from '../../lib/llmClient';
import { useProperties } from '../StrataDashboard/useStrataQueries';
import { openStrataModule } from '../StrataDashboard/strataDeepLink';
import { hermesLearningStore, hermesLearningUserIdHolder } from '../HonchoHermesPanel/hermesLearningStore';
import { araChatRuns } from '../ARAConsole/araHermes';
import { openWidgetBus } from '../../lib/busChannels';
import { requestAraPrompt } from '../../lib/llmRouter';
import {
    useFirstRun, markDone, setNeverShow, deriveSteps, shouldShowFirstRun,
    FIRST_RUN_DISMISSED_SESSION_KEY, FIRST_RUN_REPLAY_EVENT, type FirstRunStep,
} from '../../lib/firstRunStore';
import { useOnboarding, setOnboardingRole, deriveOnboardingRole, unlockTier, maybeStampDone, type OnboardingRole } from '../../lib/onboardingStore';
import { useWalkthroughActive } from '../../lib/walkthroughStore';
import { setSidebarGroups } from '../Sidebar/sidebarGroupsStore';
import './FirstRunCard.css';

/** Plan 047 §2 step-0 role chooser copy (G12 roles). */
export const ROLE_COPY: Record<OnboardingRole, { title: string; sub: string }> = {
    owner: { title: 'I run the properties', sub: 'Owner-operator: ARA + Strata open first, Property Management expanded.' },
    staff: { title: 'I help manage them', sub: 'Staff: Strata + Task Board + Inbox Zero to start; more as it’s unlocked.' },
};

/** Plan 047 §3 default expansion per role: owner = Property Management; staff = nothing. */
export function pickRole(role: OnboardingRole): void {
    setOnboardingRole(role);
    setSidebarGroups(() => new Set(role === 'owner' ? ['Property Management'] : []));
}

export const ARA_HELLO_PROMPT = 'What can you help me with in Dwellium?';

const COPY: Record<FirstRunStep, { title: string; sub: string; cta: string }> = {
    key: { title: 'Add an AI key', sub: 'ARA and every AI widget run on your own key.', cta: 'Open API Keys' },
    data: { title: 'Bring your data', sub: 'Add your first property so Strata has something to show.', cta: 'Add a property' },
    ara: { title: 'Ask ARA', sub: 'Say hello — ARA answers in seconds.', cta: 'Ask ARA' },
};

const ACTIONS: Record<FirstRunStep, () => void> = {
    // S1a retargets configure() to the same id; keep in lockstep.
    key: () => openWidgetBus.emit({ widgetId: 'api-keys', label: 'API Keys' }),
    data: () => openStrataModule('properties'),
    ara: () => {
        openWidgetBus.emit({ widgetId: 'ara-console', label: 'ARA' });
        requestAraPrompt(ARA_HELLO_PROMPT);
    },
};

function readSessionDismissed(): boolean {
    try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(FIRST_RUN_DISMISSED_SESSION_KEY) === '1'; } catch { return false; }
}

export default function FirstRunCard() {
    const state = useFirstRun();
    const ob = useOnboarding(); // plan 047 role / seen tips / unlocked tiers
    const { integrations } = useIntegrations();
    const userCtx = useContext(UserContext);
    // Same value ARAConsole writes during render — set BEFORE the store read.
    hermesLearningUserIdHolder.current = userCtx?.user?.id ?? null;
    useSyncExternalStore(hermesLearningStore.subscribe, hermesLearningStore.getSnapshot, hermesLearningStore.getServerSnapshot);
    const [sessionDismissed, setSessionDismissed] = useState(readSessionDismissed);
    // Plan 047 §6 "Replay first-run" (ShortcutSheet) — un-dismiss for this session too.
    useEffect(() => {
        const onReplay = () => setSessionDismissed(false);
        window.addEventListener(FIRST_RUN_REPLAY_EVENT, onReplay);
        return () => window.removeEventListener(FIRST_RUN_REPLAY_EVENT, onReplay);
    }, []);
    // Only fetch /properties while the card can actually show (no extra call once hidden for good).
    const properties = useProperties(!state.neverShow && !sessionDismissed).data;

    const live = {
        hasLlm: hasActiveLlm(integrations.llm),
        hasData: (properties?.length ?? 0) > 0,
        araReplied: araChatRuns().length > 0,
    };
    const derived = deriveSteps(live, state);

    // Live-true → sticky done.
    useEffect(() => {
        if (live.hasLlm) markDone('key');
        if (live.hasData) markDone('data');
        if (live.araReplied) markDone('ara');
    }, [live.hasLlm, live.hasData, live.araReplied]);

    // Plan 047 §3: first ARA reply unlocks the AI tier ONCE — expand "AI Tools"
    // + toast, only for users who went through the role pick (legacy accounts
    // get the flag silently, no toast). Permissions untouched (`can()` rules).
    useEffect(() => {
        if (!live.araReplied) return;
        if (unlockTier('ai') && ob.role) {
            setSidebarGroups(prev => new Set([...prev, 'AI Tools']));
            try { window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'AI Tools unlocked — the group is now open in the sidebar.' })); } catch { /* */ }
        }
    }, [live.araReplied, ob.role]);

    // Plan 047 §7: stamp "done onboarding" once 3/3 + every starter-set tip is seen.
    useEffect(() => { maybeStampDone(state); }, [state, ob.seenTips, ob.role]);

    // 3/3 → show "you're set" briefly, then never again.
    useEffect(() => {
        if (derived.done < 3 || state.neverShow) return;
        const t = window.setTimeout(setNeverShow, 1500);
        return () => window.clearTimeout(t);
    }, [derived.done, state.neverShow]);

    // 3/3 stays up for the "you're set" beat until the timer flips neverShow.
    const celebrating = derived.done === 3 && !state.neverShow && !sessionDismissed;
    // While the walkthrough runs, the card hides (it crowds the spotlight) —
    // EXCEPT on the finish step, which points at this very card.
    const walkthrough = useWalkthroughActive();
    if (walkthrough.active && !walkthrough.spotlightFirstWin) return null;
    if (!shouldShowFirstRun(state, sessionDismissed) && !celebrating) return null;

    const dismiss = () => {
        try { sessionStorage.setItem(FIRST_RUN_DISMISSED_SESSION_KEY, '1'); } catch { /* sandboxed */ }
        setSessionDismissed(true);
    };

    return (
        <aside className="firstrun-card" aria-label="Get to your first win" data-tour="first-win">
            <div className="firstrun-card__head">
                <div>
                    <div className="firstrun-card__title">Get to your first win</div>
                    <div className="firstrun-card__sub">
                        {derived.done === 3 ? '3/3 — you’re set.' : 'Three steps, about five minutes.'}
                    </div>
                </div>
                <span className="firstrun-card__count">{derived.done}/{derived.total}</span>
            </div>
            {/* Plan 047 §2 step 0 — role chooser, shown until a role is picked; derived role is marked. */}
            {ob.role === null && (() => {
                const suggested = deriveOnboardingRole(userCtx?.user?.role);
                return (
                    <div className="firstrun-role" role="group" aria-label="How do you use Dwellium?">
                        <div className="firstrun-role__q">First — how do you use Dwellium?</div>
                        {(['owner', 'staff'] as const).map(r => (
                            <button key={r} type="button" className={`firstrun-role__opt ${r === suggested ? 'is-suggested' : ''}`} onClick={() => pickRole(r)}>
                                <span className="firstrun-role__title">{ROLE_COPY[r].title}{r === suggested ? <em> · recommended</em> : null}</span>
                                <span className="firstrun-role__sub">{ROLE_COPY[r].sub}</span>
                            </button>
                        ))}
                    </div>
                );
            })()}
            <ol className="firstrun-card__steps">
                {derived.steps.map(s => (
                    <li key={s.id} className={`firstrun-step ${s.done ? 'is-done' : ''}`}>
                        <span className="firstrun-step__tick" aria-hidden>{s.done ? <Check size={12} /> : null}</span>
                        <div className="firstrun-step__body">
                            <div className="firstrun-step__title">{COPY[s.id].title}</div>
                            <div className="firstrun-step__sub">{COPY[s.id].sub}</div>
                        </div>
                        {!s.done && (
                            <button type="button" className="firstrun-step__cta" onClick={ACTIONS[s.id]}>{COPY[s.id].cta}</button>
                        )}
                    </li>
                ))}
            </ol>
            <div className="firstrun-card__foot">
                <button type="button" className="firstrun-card__link" onClick={dismiss}>Dismiss</button>
                <span aria-hidden>·</span>
                <button type="button" className="firstrun-card__link" onClick={setNeverShow}>Don&apos;t show again</button>
                <button type="button" className="firstrun-card__x" onClick={dismiss} aria-label="Dismiss first-run checklist"><X size={14} /></button>
            </div>
        </aside>
    );
}
