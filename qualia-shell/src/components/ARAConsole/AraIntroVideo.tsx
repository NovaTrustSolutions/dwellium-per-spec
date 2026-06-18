import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';

/**
 * ARA startup intro — plays a short video ONCE PER LOGIN SESSION (the first time
 * ARA opens after the user logs on), not every time the console is opened. A
 * per-session flag (sessionStorage) records that it has played; the flag is
 * cleared at login (see UserContext) so a fresh logon replays it. Tries to
 * autoplay with sound; if the browser blocks unmuted autoplay it falls back to
 * muted playback and surfaces a tap-to-unmute button. Always skippable. Dismisses
 * on end, on error, or immediately when video playback isn't available (e.g.
 * jsdom in tests) so it never blocks the UI.
 */
export const ARA_SKIP_INTRO_KEY = 'dwellium-ara-skip-intro';
/** Per-session marker: set once the intro has played this login session. */
export const ARA_INTRO_PLAYED_KEY = 'dwellium-ara-intro-played';

export default function AraIntroVideo() {
    const [show, setShow] = useState(() => {
        try {
            // Persistent "skip intro" toggle (ARA Settings) wins.
            if (localStorage.getItem(ARA_SKIP_INTRO_KEY) === 'true') return false;
            // Already played this login session → don't replay on subsequent opens.
            if (sessionStorage.getItem(ARA_INTRO_PLAYED_KEY) === 'true') return false;
            return true;
        } catch { return true; }
    });
    const [needsUnmute, setNeedsUnmute] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        // Mark as played for this login session the moment the intro mounts, so
        // reopening ARA in the same session won't replay it.
        try { sessionStorage.setItem(ARA_INTRO_PLAYED_KEY, 'true'); } catch { /* sandboxed */ }
        const v = videoRef.current;
        if (!v) {
            setShow(false);
            return;
        }
        let done = false;
        const dismiss = () => {
            if (done) return;
            done = true;
            setShow(false);
        };

        v.onended = dismiss;
        v.onerror = dismiss;

        // Attempt playback with sound; fall back to muted; bail if unsupported.
        let played: Promise<void> | undefined;
        try {
            played = v.play() as Promise<void> | undefined;
        } catch {
            dismiss();
            return () => undefined;
        }
        if (played === undefined) {
            // No media element support (jsdom/test env) — don't block the console.
            dismiss();
        } else if (typeof played.catch === 'function') {
            played.catch(() => {
                // Unmuted autoplay was blocked — replay muted and offer unmute.
                try {
                    v.muted = true;
                    setNeedsUnmute(true);
                    const retry = v.play() as Promise<void> | undefined;
                    if (retry && typeof retry.catch === 'function') retry.catch(dismiss);
                } catch {
                    dismiss();
                }
            });
        }

        return () => {
            v.onended = null;
            v.onerror = null;
            // Stop the intro's audio when it's dismissed/unmounted (Skip, end, or
            // ARA closing) — detaching a <video> alone doesn't reliably stop sound.
            try { v.pause(); v.muted = true; } catch { /* ignore */ }
        };
    }, []);

    if (!show) return null;

    const unmute = () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = false;
        void v.play();
        setNeedsUnmute(false);
    };

    return (
        <div className="ara-intro" role="dialog" aria-label="ARA intro">
            <video
                ref={videoRef}
                className="ara-intro__video"
                autoPlay
                playsInline
                preload="auto"
            >
                <source src="/assets/ara-intro.mp4" type="video/mp4" />
            </video>
            <div className="ara-intro__controls">
                {needsUnmute && (
                    <button type="button" className="ara-intro__btn" onClick={unmute}>
                        <Volume2 size={14} aria-hidden /> Tap for sound
                    </button>
                )}
                <button
                    type="button"
                    className="ara-intro__btn ara-intro__skip"
                    onClick={() => {
                        const v = videoRef.current;
                        if (v) { try { v.pause(); v.muted = true; } catch { /* ignore */ } }
                        setShow(false);
                    }}
                >
                    Skip ▶
                </button>
            </div>
        </div>
    );
}
