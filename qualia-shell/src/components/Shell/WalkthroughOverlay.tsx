/**
 * WalkthroughOverlay — the interactive onboarding walkthrough (spotlight tour).
 *
 * Seven steps over the REAL shell: dimmed overlay, an SVG even-odd cutout
 * around the target's bounding rect (recomputed on resize/scroll, no
 * dependency), and a small card (title + a sentence + Back/Next/Skip).
 * Targets are `data-tour="<id>"` attributes on the live elements; when a
 * target is missing or has no size (collapsed sidebar, different layout),
 * the step renders CENTERED with the same copy — never a broken cutout.
 *
 * Auto-starts once per user on their first login (walkthroughStore `done`),
 * and only while Classic is the active layout — in Holocron/Fluid the
 * auto-start defers until Classic. Manual replay (? sheet / ⌘K) works in any
 * layout; non-Classic replays run fully centered. Skip and Finish both mark
 * done. Esc = skip (dismisses transient chrome — never a window; capture +
 * stopPropagation so Desktop's Esc handler doesn't also fire). Backdrop
 * clicks do nothing — leaving is an explicit button. While the tour runs,
 * FirstRunCard and SystemHealthBanner hide via walkthroughActiveStore (they
 * crowd the spotlight); the final step un-hides the first-win card because
 * it points at it.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { halocronOsStore } from '../../lib/halocronOsStore';
import { fluidOsStore } from '../../lib/fluidOsStore';
import {
    useWalkthrough, markWalkthroughDone, shouldAutoStartWalkthrough,
    walkthroughStore, walkthroughActiveStore, WALKTHROUGH_REPLAY_EVENT,
} from '../../lib/walkthroughStore';
import './WalkthroughOverlay.css';

export interface WalkthroughStep {
    id: string;
    /** data-tour attribute value of the anchor; undefined = always centered. */
    target?: string;
    title: string;
    body: string;
}

/** The seven steps — Classic layout v1. Copy is asserted verbatim in tests. */
export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to Dwellium',
        body: 'Dwellium is your whole desk. Close it anytime — everything saves, and you’ll come back to exactly where you left off.',
    },
    {
        id: 'sidebar',
        target: 'sidebar',
        title: 'Everything lives here',
        body: 'Your daily five are pinned on top, with the rest in groups below. Hover anything for a one-line description.',
    },
    {
        id: 'command-bar',
        target: 'command-bar',
        title: 'One shortcut to learn',
        body: 'Press ⌘K to open anything by name — or a whole sentence. Your recent work appears at the top as Resume.',
    },
    {
        id: 'ara',
        target: 'ara',
        title: 'Meet ARA',
        body: 'Your AI team — it answers from your real data, posts a morning brief at 7 AM, and runs on your own key.',
    },
    {
        id: 'strata',
        target: 'strata',
        title: 'The property desk',
        body: 'Strata holds your properties, leasing, residents, and accounting — one desk for all of it.',
    },
    {
        id: 'tools',
        target: 'tools-hub',
        title: 'The tool shed',
        body: 'Ten open-source tools live in the Tools hub — statuses flip live as each one is connected.',
    },
    {
        id: 'finish',
        target: 'first-win',
        title: 'Your first win',
        body: 'The Get to your first win card walks three steps in about five minutes. Press ? anytime for shortcuts and to replay this tour.',
    },
];

/** Non-Classic replays add this line to step 1 (centered-only honesty, v1). */
export const NON_CLASSIC_NOTE =
    'You’re in a different layout right now, so this tour points with words instead of highlights.';

/** Delay before the first-login auto-start, so the shell paints first. */
export const WALKTHROUGH_AUTOSTART_DELAY_MS = 900;

const CARD_W = 320;
const CARD_H_ESTIMATE = 190;
const GAP = 12;

function targetRectFor(step: WalkthroughStep, classic: boolean): DOMRect | null {
    // Non-Classic layouts: v1 has Classic anchors only — every step centers.
    if (!step.target || !classic || typeof document === 'undefined') return null;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Zero-size = hidden/unlaid-out → degrade to centered, never a broken cutout.
    if (rect.width <= 0 || rect.height <= 0) return null;
    return rect;
}

export default function WalkthroughOverlay({ autoStartDelayMs = WALKTHROUGH_AUTOSTART_DELAY_MS }: { autoStartDelayMs?: number } = {}) {
    const state = useWalkthrough();
    const halocron = useSyncExternalStore(halocronOsStore.subscribe, halocronOsStore.getSnapshot, halocronOsStore.getServerSnapshot);
    const fluid = useSyncExternalStore(fluidOsStore.subscribe, fluidOsStore.getSnapshot, fluidOsStore.getServerSnapshot);
    const isClassic = !halocron.enabled && !fluid.enabled;

    const [step, setStep] = useState<number | null>(null);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const open = step !== null;

    // ── Auto-start: first login only, Classic only; deferred until Classic. ──
    useEffect(() => {
        if (open || state.done || !isClassic) return;
        const t = window.setTimeout(() => {
            // Re-check at fire time — One Save may have hydrated `done` meanwhile.
            if (shouldAutoStartWalkthrough(walkthroughStore.getSnapshot())) setStep(0);
        }, autoStartDelayMs);
        return () => window.clearTimeout(t);
    }, [open, state.done, isClassic, autoStartDelayMs]);

    // ── Replay (? sheet row, ⌘K "walkthrough"/"tour") — any layout. ──
    useEffect(() => {
        const onReplay = () => setStep(0);
        window.addEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
        return () => window.removeEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
    }, []);

    // ── Publish the tour session so FirstRunCard / SystemHealthBanner hide. ──
    useEffect(() => {
        walkthroughActiveStore.set({
            active: open,
            spotlightFirstWin: step === WALKTHROUGH_STEPS.length - 1,
        });
        return () => walkthroughActiveStore.set({ active: false, spotlightFirstWin: false });
    }, [open, step]);

    const finish = useCallback(() => { markWalkthroughDone(); setStep(null); }, []);
    const next = useCallback(() => {
        setStep(s => {
            if (s === null) return s;
            if (s >= WALKTHROUGH_STEPS.length - 1) { markWalkthroughDone(); return null; }
            return s + 1;
        });
    }, []);
    const back = useCallback(() => setStep(s => (s === null || s === 0 ? s : s - 1)), []);

    // ── Target measurement: scroll into view, then track resize/scroll. ──
    useEffect(() => {
        if (step === null) { setRect(null); return; }
        const current = WALKTHROUGH_STEPS[step];
        const el = current.target && isClassic ? document.querySelector(`[data-tour="${current.target}"]`) : null;
        try { el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* jsdom */ }
        const measure = () => setRect(targetRectFor(current, isClassic));
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [step, isClassic]);

    // ── Keyboard: →/Enter next, ← back, Esc skip; Tab trapped in the card. ──
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // Esc dismisses transient chrome — the tour, never a window.
                e.preventDefault(); e.stopPropagation();
                finish();
                return;
            }
            if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); back(); return; }
            if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') {
                e.preventDefault(); e.stopPropagation(); next(); return;
            }
            if (e.key === 'Tab') {
                // Focus trap: cycle among the card's buttons.
                const card = cardRef.current;
                if (!card) return;
                const focusables = Array.from(card.querySelectorAll<HTMLElement>('button'));
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                const activeEl = document.activeElement as HTMLElement | null;
                if (!activeEl || !card.contains(activeEl)) { e.preventDefault(); first.focus(); return; }
                if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus(); }
                else if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus(); }
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, finish, next, back]);

    // ── Focus moves into the card on every step change. ──
    useEffect(() => {
        if (step === null) return;
        const btn = cardRef.current?.querySelector<HTMLButtonElement>('.walkthrough-card__next');
        btn?.focus();
    }, [step]);

    if (step === null) return null;
    const current = WALKTHROUGH_STEPS[step];
    const last = step === WALKTHROUGH_STEPS.length - 1;

    // Viewport + cutout geometry.
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const pad = 6;
    const cut = rect
        ? { x: Math.max(0, rect.left - pad), y: Math.max(0, rect.top - pad), w: rect.width + pad * 2, h: rect.height + pad * 2 }
        : null;

    // Card placement: adjacent to the cutout, flipped/clamped to fit; centered otherwise.
    let cardStyle: React.CSSProperties;
    if (cut) {
        let top = cut.y + cut.h + GAP;                       // prefer below
        if (top + CARD_H_ESTIMATE > vh) top = cut.y - CARD_H_ESTIMATE - GAP; // flip above
        if (top < GAP) {                                     // neither fits → beside
            top = Math.min(Math.max(cut.y, GAP), Math.max(GAP, vh - CARD_H_ESTIMATE - GAP));
        }
        let left = cut.x;
        if (left + CARD_W > vw - GAP) left = vw - CARD_W - GAP;
        if (left < GAP) left = Math.min(cut.x + cut.w + GAP, Math.max(GAP, vw - CARD_W - GAP));
        cardStyle = { position: 'fixed', top, left, width: CARD_W };
    } else {
        cardStyle = {};
    }

    const body = current.id === 'welcome' && !isClassic
        ? `${current.body} ${NON_CLASSIC_NOTE}`
        : current.body;

    return (
        <div className="walkthrough" data-step={current.id}>
            {/* Dimmer with an even-odd cutout; clicks land here and do nothing. */}
            <svg className="walkthrough__dim" width="100%" height="100%" aria-hidden="true">
                <path
                    fillRule="evenodd"
                    d={cut
                        ? `M0 0H${vw}V${vh}H0Z M${cut.x} ${cut.y}h${cut.w}v${cut.h}h${-cut.w}Z`
                        : `M0 0H${vw}V${vh}H0Z`}
                />
            </svg>
            <div
                ref={cardRef}
                className={`walkthrough-card ${cut ? '' : 'walkthrough-card--centered'}`}
                style={cardStyle}
                role="dialog"
                aria-modal="true"
                aria-label={`Walkthrough — ${current.title}`}
            >
                <div className="walkthrough-card__count">{step + 1} of {WALKTHROUGH_STEPS.length}</div>
                <h2 className="walkthrough-card__title">{current.title}</h2>
                <p className="walkthrough-card__body">{body}</p>
                <div className="walkthrough-card__actions">
                    <button type="button" className="walkthrough-card__skip" onClick={finish}>Skip tour</button>
                    <div className="walkthrough-card__nav">
                        {step > 0 && (
                            <button type="button" className="walkthrough-card__back" onClick={back}>Back</button>
                        )}
                        <button type="button" className="walkthrough-card__next" onClick={next}>
                            {last ? 'Finish' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
