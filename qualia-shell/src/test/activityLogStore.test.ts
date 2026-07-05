import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    activityLogStore, activityUserIdHolder, logActivity, resetActivityLog,
    ACTIVITY_LOG_MAX_ENTRIES, type ActivityEntry,
} from '../lib/activityLogStore';

// withSync-wrapped stores import oneSaveClient at load; mock it so no
// network/side effects fire during these pure-store assertions.
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

describe('activityLogStore', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
        activityUserIdHolder.current = null;
        resetActivityLog();
        activityLogStore.reset();
    });

    it('logActivity appends an entry; getSnapshot reads newest-first', () => {
        logActivity('terminal', 'Terminal', 'open');
        logActivity('scribe', 'Scribe', 'open');
        const entries = activityLogStore.getSnapshot();
        expect(entries).toHaveLength(2);
        // Newest-first: the second logActivity call is entries[0].
        expect(entries[0].widgetId).toBe('scribe');
        expect(entries[1].widgetId).toBe('terminal');
    });

    it('logActivity records widgetId, widgetLabel, action, and optional details', () => {
        logActivity('stella-agent', 'Stella Agent', 'message-sent', { preview: 'hello world' });
        const [entry] = activityLogStore.getSnapshot();
        expect(entry.widgetId).toBe('stella-agent');
        expect(entry.widgetLabel).toBe('Stella Agent');
        expect(entry.action).toBe('message-sent');
        expect(entry.details).toEqual({ preview: 'hello world' });
        expect(typeof entry.id).toBe('string');
        expect(typeof entry.ts).toBe('number');
    });

    it('ring-buffer cap: appending 2,001 entries drops the oldest, keeping exactly the cap', () => {
        for (let i = 0; i < ACTIVITY_LOG_MAX_ENTRIES + 1; i++) {
            logActivity('terminal', 'Terminal', 'open', { seq: i });
        }
        const entries = activityLogStore.getSnapshot();
        expect(entries).toHaveLength(ACTIVITY_LOG_MAX_ENTRIES);
        // Newest-first: the very first append (seq: 0) must have been dropped.
        expect(entries.some((e) => e.details?.seq === 0)).toBe(false);
        // The most recent append (seq: 2000) must be present, at the front.
        expect(entries[0].details?.seq).toBe(ACTIVITY_LOG_MAX_ENTRIES);
    });

    it('per-user isolation: switching the holder id switches to a different list; switching back restores the original', () => {
        activityUserIdHolder.current = 'user-a';
        logActivity('terminal', 'Terminal', 'open');
        const aEntries = activityLogStore.getSnapshot();
        expect(aEntries).toHaveLength(1);

        activityUserIdHolder.current = 'user-b';
        // Cache invalidates on holder change (Option β dynamic-key resolver) —
        // user-b's namespace starts empty, independent of user-a's.
        const bEntries = activityLogStore.getSnapshot();
        expect(bEntries).toHaveLength(0);
        logActivity('scribe', 'Scribe', 'open');
        expect(activityLogStore.getSnapshot()).toHaveLength(1);
        expect(activityLogStore.getSnapshot()[0].widgetId).toBe('scribe');

        activityUserIdHolder.current = 'user-a';
        // Switching back restores user-a's original (untouched) list.
        const aAgain = activityLogStore.getSnapshot();
        expect(aAgain).toHaveLength(1);
        expect(aAgain[0].widgetId).toBe('terminal');
    });

    it('logActivity never throws even when localStorage throws', () => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new Error('quota exceeded'); };
        try {
            expect(() => logActivity('terminal', 'Terminal', 'open')).not.toThrow();
        } finally {
            Storage.prototype.setItem = original;
        }
    });

    it('logActivity never throws even when getSnapshot() itself throws', () => {
        const spy = vi.spyOn(activityLogStore, 'getSnapshot').mockImplementation(() => {
            throw new Error('boom');
        });
        try {
            expect(() => logActivity('terminal', 'Terminal', 'open')).not.toThrow();
        } finally {
            spy.mockRestore();
        }
    });

    it('deserialize gracefully falls back to [] on malformed JSON', () => {
        activityUserIdHolder.current = 'user-c';
        try { localStorage.setItem('dwellium-activity-log:user-c', '{not json'); } catch { /* ignore */ }
        activityLogStore.reset();
        expect(activityLogStore.getSnapshot()).toEqual([]);
    });

    it('resetActivityLog clears the current user namespace', () => {
        activityUserIdHolder.current = 'user-d';
        logActivity('terminal', 'Terminal', 'open');
        expect(activityLogStore.getSnapshot()).toHaveLength(1);
        resetActivityLog();
        expect(activityLogStore.getSnapshot()).toEqual([]);
    });

    it('exported type ActivityEntry matches the contract shape', () => {
        logActivity('terminal', 'Terminal', 'open');
        const entry: ActivityEntry = activityLogStore.getSnapshot()[0];
        expect(entry).toMatchObject({
            widgetId: 'terminal',
            widgetLabel: 'Terminal',
            action: 'open',
        });
    });
});
