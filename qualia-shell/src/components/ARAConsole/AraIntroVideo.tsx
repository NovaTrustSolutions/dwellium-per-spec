import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { araPrefsStore } from '../../lib/araPrefsStore';

/**
 * ARA startup intro — plays a short video ONCE PER USER/DEVICE (045-D1c): the
 * first time ARA opens, until it ends or Skip is pressed. That is persisted as
 * `araPrefsStore.introSeen` (localStorage `dwellium-ara-prefs`), so a fresh
 * logon does NOT replay the 21 MB clip. Within a session a sessionStorage marker
 * still stops replays if the user closed ARA mid-video (and is migrated into
 * introSeen on the next mount). Tries to autoplay with sound; if the browser
 * blocks unmuted autoplay it falls back to muted playback and surfaces a
 * tap-to-unmute button. Always skippable. Dismisses on end, on error, or
 * immediately when video playback isn't available (e.g. jsdom in tests) so it
 * never blocks the UI.
 */
/** Manual override (ARA Settings): never show the intro. */
export const ARA_SKIP_INTRO_KEY = 'dwellium-ara-skip-intro';
/** Per-session marker: set once the intro has mounted this session. */
export const ARA_INTRO_PLAYED_KEY = 'dwellium-ara-intro-played';

const markSeen = () => araPrefsStore.set('introSeen', true);

export default function AraIntroVideo() {
    const [show, setShow] = useState(() => {
        try {
            // Persistent "skip intro" toggle (ARA Settings) wins.
            if (localStorage.getItem(ARA_SKIP_INTRO_KEY) === 'true') return false;
            if (araPrefsStore.getSnapshot().introSeen) return false;
            // Already played this session (old per-session scheme) → migrated
            // to introSeen in the mount effect below.
            if (sessionStorage.getItem(ARA_INTRO_PLAYED_KEY) === 'true') return false;
            return true;
        } catch { return true; }
    });
    const [needsUnmute, setNeedsUnmute] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) {
            // Not showing. Migration (045-D1c): the old per-session marker
            // means the user already sat through it → count as seen.
            try { if (sessionStorage.getItem(ARA_INTRO_PLAYED_KEY) === 'true') markSeen(); } catch { /* sandboxed */ }
            setShow(false);
            return;
        }
        // Mark as played for this session the moment the intro mounts, so
        // reopening ARA in the same session won't replay it.
        try { sessionStorage.setItem(ARA_INTRO_PLAYED_KEY, 'true'); } catch { /* sandboxed */ }
        let done = false;
        const dismiss = () => {
            if (done) return;
            done = true;
            setShow(false);
        };

        v.onended = () => { markSeen(); dismiss(); };
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
                preload="none"
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
                        markSeen();
                        setShow(false);
                    }}
                >
                    Skip ▶
                </button>
            </div>
        </div>
    );
}
