/**
 * speakerLibraryStore — migrateAnonLibraryToUser (Bug-fix 2026-06-15, Ilya).
 *
 * Voices enrolled BEFORE local multi-user login shipped live under the
 * pre-login `tw:speakers:_anonymous` key. Once a user logs in, those orphaned
 * enrollments must be adopted into `tw:speakers:<userId>` — otherwise a
 * previously-labeled voice is re-detected as "Unknown Speaker N" (the reported
 * symptom). Adoption must be non-destructive, never overwrite a user's own
 * data, and run at most once per user.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    speakerLibraryStore,
    speakerLibraryUserIdHolder,
    migrateAnonLibraryToUser,
    speakerLibraryResolvedKey,
} from '../components/TranscriptionHub/speakerLibraryStore';
import type { EnrolledSpeaker } from '../components/TranscriptionHub/speakerLibrary';

const ANON_KEY = 'tw:speakers:_anonymous';

function spk(id: string, label: string): EnrolledSpeaker {
    const now = new Date().toISOString();
    return { id, label, centroid: [0.5, 0.3, 0.2], sampleCount: 1, createdAt: now, updatedAt: now };
}

const resetStore = () => (speakerLibraryStore as unknown as { reset?: () => void }).reset?.();

beforeEach(() => {
    speakerLibraryUserIdHolder.current = null;
    try { localStorage.clear(); } catch { /* sandboxed */ }
    resetStore();
});

describe('migrateAnonLibraryToUser', () => {
    it('adopts orphaned _anonymous enrollments into the logged-in user key', () => {
        localStorage.setItem(ANON_KEY, JSON.stringify([spk('a', 'Andy'), spk('b', 'Lisa')]));

        const adopted = migrateAnonLibraryToUser('user-1');

        expect(adopted).toBe(2);
        // holder now points at user-1; the LIVE store reflects the adopted lib
        expect(speakerLibraryResolvedKey()).toBe('tw:speakers:user-1');
        expect(speakerLibraryStore.getSnapshot().map(s => s.label)).toEqual(['Andy', 'Lisa']);
        // persisted under the user key
        expect(JSON.parse(localStorage.getItem('tw:speakers:user-1')!)).toHaveLength(2);
        // NON-destructive: _anonymous is left intact
        expect(JSON.parse(localStorage.getItem(ANON_KEY)!)).toHaveLength(2);
    });

    it('never overwrites a user that already has their own enrollments', () => {
        localStorage.setItem(ANON_KEY, JSON.stringify([spk('a', 'Andy')]));
        localStorage.setItem('tw:speakers:user-1', JSON.stringify([spk('z', 'Existing')]));
        // prime the store cache for user-1
        speakerLibraryUserIdHolder.current = 'user-1';
        expect(speakerLibraryStore.getSnapshot()).toHaveLength(1);

        const adopted = migrateAnonLibraryToUser('user-1');

        expect(adopted).toBe(0);
        expect(speakerLibraryStore.getSnapshot().map(s => s.label)).toEqual(['Existing']);
    });

    it('is idempotent — a second call adopts nothing even if the lib is later cleared', () => {
        localStorage.setItem(ANON_KEY, JSON.stringify([spk('a', 'Andy')]));
        expect(migrateAnonLibraryToUser('user-1')).toBe(1);

        // simulate a later mount: cache reset + user key gone, but the
        // per-user migration flag persists → no second adoption
        resetStore();
        localStorage.removeItem('tw:speakers:user-1');
        expect(migrateAnonLibraryToUser('user-1')).toBe(0);
    });

    it('does nothing for an anonymous / empty user id', () => {
        localStorage.setItem(ANON_KEY, JSON.stringify([spk('a', 'Andy')]));
        expect(migrateAnonLibraryToUser('')).toBe(0);
        expect(migrateAnonLibraryToUser('_anonymous')).toBe(0);
    });

    it('returns 0 when there are no orphaned enrollments', () => {
        expect(migrateAnonLibraryToUser('user-1')).toBe(0);
    });
});
