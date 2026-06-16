/**
 * HydraIntro — startup intro for the Hydra widget (2026-06-14). Plays a short
 * video ONCE PER SESSION (the first time Hydra opens this session), mirroring
 * AraIntroVideo's logic. A per-session flag (sessionStorage) records playback;
 * a persistent "skip" toggle is honored. Tries autoplay with sound, falls back
 * to muted + a tap-to-unmute button, and is always skippable. Dismisses on end,
 * on error, or when video playback isn't available (tests) so it never blocks.
 */
import { useEffect, useRef, useState } from 'react';
import './HydraIntro.css';

export const HYDRA_SKIP_INTRO_KEY = 'dwellium-hydra-skip-intro';
export const HYDRA_INTRO_PLAYED_KEY = 'dwellium-hydra-intro-played';

export default function HydraIntro() {
    const [show, setShow] = useState(() => {
        try {
            if (localStorage.getItem(HYDRA_SKIP_INTRO_KEY) === 'true') return false;
            if (sessionStorage.getItem(HYDRA_INTRO_PLAYED_KEY) === 'true') return false;
            return true;
        } catch { return true; }
    });
    const [needsUnmute, setNeedsUnmute] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        // Mark played for this session the moment it mounts, so reopening Hydra
        // in the same session won't replay it.
        try { sessionStorage.setItem(HYDRA_INTRO_PLAYED_KEY, 'true'); } catch { /* sandboxed */ }
        const v = videoRef.current;
        if (!v) { setShow(false); return; }
        let done = false;
        const dismiss = () => { if (done) return; done = true; setShow(false); };
        v.onended = dismiss;
        v.onerror = dismiss;
        let played: Promise<void> | undefined;
        try { played = v.play() as Promise<void> | undefined; } catch { dismiss(); return () => undefined; }
        if (played === undefined) {
            dismiss();
        } else if (typeof played.catch === 'function') {
            played.catch(() => {
                try { v.muted = true; setNeedsUnmute(true); const retry = v.play() as Promise<void> | undefined; if (retry && typeof retry.catch === 'function') retry.catch(dismiss); }
                catch { dismiss(); }
            });
        }
        return () => { v.onended = null; v.onerror = null; };
    }, []);

    if (!show) return null;

    const unmute = () => { const v = videoRef.current; if (!v) return; v.muted = false; void v.play(); setNeedsUnmute(false); };

    return (
        <div className="hydra-intro" role="dialog" aria-label="Hydra intro">
            <video ref={videoRef} className="hydra-intro__video" autoPlay playsInline preload="auto">
                <source src="/assets/hydra-intro.mp4" type="video/mp4" />
            </video>
            <div className="hydra-intro__controls">
                {needsUnmute && <button type="button" className="hydra-intro__btn" onClick={unmute}>Tap for sound</button>}
                <button type="button" className="hydra-intro__btn hydra-intro__skip" onClick={() => setShow(false)}>Skip ▶</button>
            </div>
        </div>
    );
}
