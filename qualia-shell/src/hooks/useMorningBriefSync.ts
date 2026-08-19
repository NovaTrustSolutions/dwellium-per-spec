/**
 * useMorningBriefSync — pull the SERVER morning brief on resume (plan 046 B2).
 *
 * Login already hydrates 'morning-brief' via oneSaveSync.bootstrap. This adds
 * tab focus / visibility-visible: if the client has no brief for today yet,
 * re-hydrate the store (bounded: never re-fetch once today's brief is here, and
 * never clobber one the client already has). When a NEW unseen brief appears,
 * fire the desktop notification (B3). Effect-time only — SSR-safe.
 */
import { useEffect } from 'react';
import { morningBriefStore, todaysBrief } from '../lib/morningBriefStore';
import { notifyNewBrief } from '../lib/briefNotifier';

export function useMorningBriefSync(): void {
    useEffect(() => {
        let inFlight = false;
        const sync = async () => {
            if (inFlight || todaysBrief()) return;
            inFlight = true;
            try {
                await morningBriefStore.hydrate();
                const fresh = todaysBrief();
                if (fresh && !fresh.seen) notifyNewBrief(fresh);
            } catch { /* background — never surface */ } finally {
                inFlight = false;
            }
        };
        const onFocus = () => { void sync(); };
        const onVisible = () => { if (document.visibilityState === 'visible') void sync(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);
}
