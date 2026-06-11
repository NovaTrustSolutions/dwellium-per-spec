import { useEffect, useRef, useState } from 'react';

/**
 * ARA startup intro — plays a short video each time ARA mounts (i.e. every time
 * the console is opened). Tries to autoplay with sound; if the browser blocks
 * unmuted autoplay it falls back to muted playback and surfaces a tap-to-unmute
 * button. Always skippable. Dismisses on end, on error, or immediately when
 * video playback isn't available (e.g. jsdom in tests) so it never blocks the UI.
 */
export const ARA_SKIP_INTRO_KEY = 'dwellium-ara-skip-intro';

export default function AraIntroVideo() {
    // Respect the persistent "skip intro" toggle (set in ARA Settings).
    const [show, setShow] = useState(() => {
        try { return localStorage.getItem(ARA_SKIP_INTRO_KEY) !== 'true'; } catch { return true; }
    });
    const [needsUnmute, setNeedsUnmute] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
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
                        🔊 Tap for sound
                    </button>
                )}
                <button
                    type="button"
                    className="ara-intro__btn ara-intro__skip"
                    onClick={() => setShow(false)}
                >
                    Skip ▶
                </button>
            </div>
        </div>
    );
}
