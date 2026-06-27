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
import { WifiOff, RefreshCw, X } from 'lucide-react';
import { backendStatusStore } from '../../lib/backendStatusStore';
import './BackendConnectionBanner.css';

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

    if (snap.state === 'online') return null;
    if (dismissed && snap.state !== 'checking') return null;

    const checking = snap.state === 'checking';

    return (
        <div className="backend-banner" role="alert" aria-live="assertive">
            <span className="backend-banner__icon" aria-hidden="true"><WifiOff size={16} /></span>
            <div className="backend-banner__body">
                <strong className="backend-banner__title">Backend connection failed</strong>
                <span className="backend-banner__msg">
                    {snap.message || 'The Dwellium backend isn’t reachable.'} You’re still signed in.
                </span>
            </div>
            <div className="backend-banner__actions">
                <span className="backend-banner__prompt">Do you want to connect?</span>
                <button
                    type="button"
                    className="backend-banner__connect"
                    onClick={() => { void backendStatusStore.checkConnection(); }}
                    disabled={checking}
                >
                    <RefreshCw size={14} className={checking ? 'backend-banner__spin' : undefined} aria-hidden="true" />
                    {checking ? 'Connecting…' : 'Connect'}
                </button>
                <button
                    type="button"
                    className="backend-banner__dismiss"
                    aria-label="Dismiss"
                    onClick={() => setDismissed(true)}
                >
                    <X size={14} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
