/**
 * SyncStatusPill — passive "Saving… / Saved ✓ / Offline — will retry" pill
 * (plan 046 S1e). Reads syncStatusStore (oneSaveStore) + backendStatusStore.
 * Renders nothing when One Save is off or nothing has been saved this session.
 */

import { useSyncExternalStore } from 'react';
import { ONE_SAVE_ENABLED } from '../../lib/oneSaveClient';
import { syncStatusStore } from '../../lib/oneSaveStore';
import { backendStatusStore } from '../../lib/backendStatusStore';
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
    if (!ONE_SAVE_ENABLED) return null;

    let text: string;
    let mod = '';
    let title: string | undefined;
    if (backend.state === 'offline') {
        text = 'Offline — will retry';
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
