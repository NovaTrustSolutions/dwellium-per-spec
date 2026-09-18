/**
 * SyncStatusPill — passive "Saving… / Saved ✓ / Offline — will retry" pill
 * (plan 046 S1e). Reads syncStatusStore (oneSaveStore) + backendStatusStore.
 * Renders nothing when One Save is off or nothing has been saved this session.
 */

import { useSyncExternalStore, useState, useEffect } from 'react';
import { ONE_SAVE_ENABLED, syncRateLimitStore } from '../../lib/oneSaveClient';
import { syncStatusStore } from '../../lib/oneSaveStore';
import { backendStatusStore, rateLimitCountdownText } from '../../lib/backendStatusStore';
import './SyncStatusPill.css';

export default function SyncStatusPill() {
    const sync = useSyncExternalStore(
        syncStatusStore.subscribe,
        syncStatusStore.getSnapshot,
        syncStatusStore.getServerSnapshot,
    );
    const backend = useSyncExternalStore(
        backendStatusStore.subscribe,
        backendStatusStore.getSnapshot,
        backendStatusStore.getServerSnapshot,
    );
    // Login-storm fix (swarm C item 3): a 429 from the objects API used to be
    // swallowed as an indistinguishable `null` — this makes it visible instead.
    const rate = useSyncExternalStore(
        syncRateLimitStore.subscribe,
        syncRateLimitStore.getSnapshot,
        syncRateLimitStore.getServerSnapshot,
    );
    // Countdown text ticks every second while rate-limited (plan 060 phase 2:
    // reuse the same wording as the banner instead of "Sync paused — retrying").
    const [countdownText, setCountdownText] = useState<string | null>(null);
    useEffect(() => {
        if (backend.state !== 'rate-limited' || backend.retryAt == null) { setCountdownText(null); return; }
        const retryAt = backend.retryAt;
        const tick = () => setCountdownText(rateLimitCountdownText(retryAt));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [backend.state, backend.retryAt]);

    if (!ONE_SAVE_ENABLED) return null;

    let text: string;
    let mod = '';
    let title: string | undefined;
    if (backend.state === 'offline') {
        text = 'Offline — will retry';
        mod = ' sync-pill--offline';
    } else if (backend.state === 'rate-limited' && countdownText != null) {
        text = countdownText;
        mod = ' sync-pill--offline';
    } else if (rate.limited) {
        text = 'Sync paused — retrying';
        mod = ' sync-pill--offline';
    } else if (sync.pending > 0) {
        text = 'Saving…';
    } else if (sync.lastSavedAt != null) {
        text = 'Saved ✓';
        // ponytail: no ticking "just now" clock — tooltip carries the time; add a 60 s tick if Ilya wants relative text
        title = new Date(sync.lastSavedAt).toLocaleTimeString();
    } else {
        return null;
    }
    return (
        <div className={`sync-pill${mod}`} role="status" aria-live="polite" title={title}>
            {text}
        </div>
    );
}
