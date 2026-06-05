import { describe, it, expect, beforeEach } from 'vitest';
import {
    speakerLibraryStore,
    speakerLibraryUserIdHolder,
    enrollSpeaker,
    addSpeakerSample,
    renameSpeaker,
    removeSpeaker,
    resetSpeakerLibrary,
} from '../components/TranscriptionHub/speakerLibraryStore';

describe('speakerLibraryStore — per-user enrollment persistence', () => {
    beforeEach(() => {
        speakerLibraryUserIdHolder.current = 'test-user';
        resetSpeakerLibrary();
        try { localStorage.clear(); } catch { /* */ }
    });

    it('enrolls a speaker with a normalized centroid', () => {
        const s = enrollSpeaker('Andy', [3, 4, 0]);
        expect(s.label).toBe('Andy');
        expect(Math.hypot(...s.centroid)).toBeCloseTo(1, 6);
        expect(speakerLibraryStore.getSnapshot()).toHaveLength(1);
    });

    it('folds extra samples in and bumps sampleCount', () => {
        const s = enrollSpeaker('Andy', [1, 0, 0]);
        addSpeakerSample(s.id, [0, 1, 0]);
        const after = speakerLibraryStore.getSnapshot()[0];
        expect(after.sampleCount).toBe(2);
        expect(after.centroid[1]).toBeGreaterThan(0); // moved toward the new sample
        expect(Math.hypot(...after.centroid)).toBeCloseTo(1, 6);
    });

    it('renames and removes speakers; persists to localStorage', () => {
        const s = enrollSpeaker('Andy', [1, 0, 0]);
        renameSpeaker(s.id, 'Andy K.');
        expect(speakerLibraryStore.getSnapshot()[0].label).toBe('Andy K.');
        // persisted under the per-user key
        const raw = localStorage.getItem('tw:speakers:test-user');
        expect(raw && raw.includes('Andy K.')).toBeTruthy();
        removeSpeaker(s.id);
        expect(speakerLibraryStore.getSnapshot()).toHaveLength(0);
    });

    it('namespaces by user id (different users see different libraries)', () => {
        enrollSpeaker('Andy', [1, 0, 0]);
        speakerLibraryUserIdHolder.current = 'other-user';
        resetSpeakerLibrary();
        expect(speakerLibraryStore.getSnapshot()).toHaveLength(0);
        speakerLibraryUserIdHolder.current = 'test-user';
        expect(speakerLibraryStore.getSnapshot().some(s => s.label === 'Andy')).toBe(true);
    });
});
