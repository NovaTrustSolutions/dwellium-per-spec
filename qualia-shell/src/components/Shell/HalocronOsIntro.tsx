/**
 * HalocronOsIntro — cinematic entry to the Halocron OS (2026-06-12).
 *
 * When you enter the Halocron OS layout, the Lament-cube video plays
 * fullscreen; as it blooms into the glowing stellated star, we fly INTO its
 * center and the OS shell emerges from inside. Plays once per browser session
 * (so relaunching from the rune doesn't replay it). Click anywhere to skip.
 *
 * Accessibility: under reduced-motion (app `animations-off` or the OS pref)
 * it skips the cinematic entirely and reveals the OS immediately.
 *
 * Mounted in Desktop above HalocronOS; renders null whenever it shouldn't play.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { halocronOsStore } from '../../lib/halocronOsStore';
import './HalocronOsIntro.css';

const PLAYED_KEY = 'halocron-os-intro-played';
const VIDEO_SRC = '/assets/halocron-intro-v2.mp4';
const ZOOM_MS = 1500;

function reducedMotion(): boolean {
    try {
        return document.body.classList.contains('animations-off')
            || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch { return false; }
}

function shouldPlay(): boolean {
    try {
        if (sessionStorage.getItem(PLAYED_KEY) === '1') return false;
        if (reducedMotion()) return false;
        return true;
    } catch {
        return false;
    }
}

export default function HalocronOsIntro() {
    const state = useSyncExternalStore(halocronOsStore.subscribe, halocronOsStore.getSnapshot, halocronOsStore.getServerSnapshot);
    const [phase, setPhase] = useState<'playing' | 'zooming' | 'done'>('done');
    const videoRef = useRef<HTMLVideoElement>(null);
    const zoomTimer = useRef<number | undefined>(undefined);
    // Tracks the previous "OS is showing" state so we fire the intro on the
    // false→true TRANSITION — both on a fresh load with the OS already enabled
    // AND when entering from Classic (the component is always mounted, so a
    // one-shot useState initializer would miss the later toggle: the bug where
    // entering didn't play but a refresh did). Refs persist across StrictMode's
    // effect double-invoke, so the trigger fires exactly once.
    const wasShowing = useRef(false);
    const playedRef = useRef<boolean>(false);

    // Begin the fly-into-center, then reveal the OS. useCallback so the
    // playback effect can depend on a stable reference.
    const beginZoom = useCallback(() => {
        setPhase((p) => (p === 'playing' ? 'zooming' : p));
        window.clearTimeout(zoomTimer.current);
        zoomTimer.current = window.setTimeout(() => setPhase('done'), ZOOM_MS);
    }, []);

    // Fire the intro when the OS becomes visible (transition), once per session.
    useEffect(() => {
        const showing = state.enabled && state.open;
        const justOpened = showing && !wasShowing.current;
        wasShowing.current = showing;
        if (!justOpened || playedRef.current) return;
        if (!shouldPlay()) return;
        playedRef.current = true;
        try { sessionStorage.setItem(PLAYED_KEY, '1'); } catch { /* sandboxed */ }
        setPhase('playing');
    }, [state.enabled, state.open]);

    // Force playback. React's `muted` prop sets the property too late for the
    // browser's autoplay gate, so the video can mount paused — set muted on the
    // element and call play() ourselves. A safety timer guarantees we ALWAYS
    // advance to the zoom even if the video never plays/ends (no stuck shell).
    useEffect(() => {
        if (phase !== 'playing') return;
        const v = videoRef.current;
        let safety = window.setTimeout(beginZoom, 11000);
        if (v) {
            v.muted = true;
            const p = v.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => { window.clearTimeout(safety); safety = window.setTimeout(beginZoom, 2200); });
            }
        }
        return () => window.clearTimeout(safety);
    }, [phase, beginZoom]);

    useEffect(() => () => window.clearTimeout(zoomTimer.current), []);

    if (phase !== 'playing' && phase !== 'zooming') return null;

    return (
        <div className={`hos-intro ${phase === 'zooming' ? 'hos-intro--zoom' : ''}`}
            onClick={beginZoom} role="presentation">
            <video
                ref={videoRef}
                className="hos-intro__video"
                src={VIDEO_SRC}
                autoPlay muted playsInline preload="auto"
                onEnded={beginZoom}
                onError={() => setPhase('done')}
            />
            <div className="hos-intro__flash" aria-hidden="true" />
            {phase === 'playing' && <button type="button" className="hos-intro__skip" onClick={beginZoom}>Skip</button>}
        </div>
    );
}
