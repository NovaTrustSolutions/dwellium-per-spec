/**
 * BackendConnectionBanner — GLOBAL banner shown whenever the backend is
 * unreachable. Requirement (Ilya, 2026-06): a backend failure must NEVER log
 * the user out — instead show a message + a "Do you want to connect?" prompt.
 *
 * Mounted once in App.tsx (DefaultRoute) so it overlays login, loading, and the
 * dashboard alike. Reads global state from backendStatusStore via
 * useSyncExternalStore (SSR-safe: getServerSnapshot → 'online' → renders null).
 */
import { useSyncExternalStore, useState, useEffect } from 'react';
import { backendStatusStore, rateLimitCountdownText } from '../../lib/backendStatusStore';

export default function BackendConnectionBanner() {
    const snap = useSyncExternalStore(
        backendStatusStore.subscribe,
        backendStatusStore.getSnapshot,
        backendStatusStore.getServerSnapshot,
    );
    const [dismissed, setDismissed] = useState(false);

    // Re-show on every fresh offline event, even if previously dismissed.
    useEffect(() => {
        if (snap.state === 'offline') setDismissed(false);
    }, [snap.state, snap.lastCheckedAt]);

    // Auto-connect — the user should never have to click "Connect" (Ilya, 2026-06).
    // The instant the backend is flagged offline (on login / launch), start
    // reconnecting automatically with a bounded backoff; the button below stays as
    // an instant-retry fallback. checkConnection() only pings, so auth is untouched.
    useEffect(() => {
        if (snap.state === 'offline') backendStatusStore.startAutoConnect();
    }, [snap.state, snap.lastCheckedAt]);
    useEffect(() => () => backendStatusStore.stopAutoConnect(), []);

    // ponytail: Ilya (2026-09-02) — "get rid of the not connected to dwellium msg".
    // The visible banner is gone; the auto-reconnect effects above are kept so a
    // backend blip still heals itself silently and never logs anyone out.
    void dismissed; void setDismissed;

    // Plan 060 phase 2: rate-limited IS shown — it's not "backend down", it's
    // "backend said slow down", and the countdown answers the "why is
    // everything broken" question the offline banner used to answer.
    const [countdownText, setCountdownText] = useState<string | null>(null);
    useEffect(() => {
        if (snap.state !== 'rate-limited' || snap.retryAt == null) { setCountdownText(null); return; }
        const retryAt = snap.retryAt;
        const tick = () => setCountdownText(rateLimitCountdownText(retryAt));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [snap.state, snap.retryAt]);

    if (snap.state === 'rate-limited' && countdownText != null) {
        return (
            <div className="backend-connection-banner" role="status" aria-live="polite">
                {countdownText}
            </div>
        );
    }
    return null;
}
