/**
 * Speaker Library 2026-06-12 — auto-enrollment of unknown voices,
 * rename-flows-into-transcripts event, and name-searchable transcripts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    speakerLibraryStore,
    speakerLibraryUserIdHolder,
    enrollSpeaker,
    renameSpeaker,
    autoEnrollUnknown,
    SPEAKER_RENAMED_EVENT,
} from '../components/TranscriptionHub/speakerLibraryStore';
import { identifyWithConfidence } from '../components/TranscriptionHub/speakerLibrary';
import { searchTranscriptions } from '../lib/transcriptSearch';

beforeEach(() => {
    speakerLibraryUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (speakerLibraryStore as unknown as { reset?: () => void }).reset?.();
});

describe('autoEnrollUnknown (cross-session matching without manual enrollment)', () => {
    it('captures a provisional profile with sequential Unknown Speaker names', () => {
        const a = autoEnrollUnknown([1, 0, 0]);
        const b = autoEnrollUnknown([0, 1, 0]);
        expect(a.label).toBe('Unknown Speaker 1');
        expect(b.label).toBe('Unknown Speaker 2');
        expect(a.auto).toBe(true);
        expect(speakerLibraryStore.getSnapshot()).toHaveLength(2);
    });

    it('an auto-captured voice MATCHES in a later session', () => {
        const voice = [0.5, 0.3, 0.2, 0.7];
        autoEnrollUnknown(voice);
        // "a week later": same voice, fresh identification pass
        const detail = identifyWithConfidence(voice, speakerLibraryStore.getSnapshot(), { threshold: 0.75, margin: 0 });
        expect(detail.match?.label).toBe('Unknown Speaker 1');
    });
});

describe('renameSpeaker', () => {
    it('clears the auto flag and fires the retro-rename event with old+new labels', () => {
        const s = autoEnrollUnknown([1, 0, 0]);
        const handler = vi.fn();
        window.addEventListener(SPEAKER_RENAMED_EVENT, handler);
        try {
            renameSpeaker(s.id, 'Andy');
        } finally {
            window.removeEventListener(SPEAKER_RENAMED_EVENT, handler);
        }
        const updated = speakerLibraryStore.getSnapshot()[0];
        expect(updated.label).toBe('Andy');
        expect(updated.auto).toBe(false);
        expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ oldLabel: 'Unknown Speaker 1', newLabel: 'Andy' });
    });

    it('no event when the label is unchanged', () => {
        const s = enrollSpeaker('Lisa', [1, 0]);
        const handler = vi.fn();
        window.addEventListener(SPEAKER_RENAMED_EVENT, handler);
        try { renameSpeaker(s.id, 'Lisa'); } finally { window.removeEventListener(SPEAKER_RENAMED_EVENT, handler); }
        expect(handler).not.toHaveBeenCalled();
    });
});

describe('searchTranscriptions (⌘K source)', () => {
    const LOG = JSON.stringify([
        {
            id: 'log-1', title: 'Vendor call', createdAt: 200,
            segments: [{ text: 'roof estimate is 12k', speaker: 'Andy' }, { text: 'send the contract', speaker: 'Lisa' }],
        },
        {
            id: 'log-2', title: 'Standup', createdAt: 100,
            segments: [{ text: 'shipping friday', speaker: 'Unknown Speaker 1' }],
        },
    ]);

    it('finds transcripts by SPEAKER NAME and flags the speaker match', () => {
        const hits = searchTranscriptions('andy', 5, LOG);
        expect(hits).toHaveLength(1);
        expect(hits[0]).toMatchObject({ id: 'log-1', speakerMatch: 'Andy' });
    });

    it('finds by spoken text and by title', () => {
        expect(searchTranscriptions('roof estimate', 5, LOG)[0].id).toBe('log-1');
        expect(searchTranscriptions('standup', 5, LOG)[0].id).toBe('log-2');
    });

    it('speaker-name matches rank above text matches', () => {
        const log = JSON.stringify([
            { id: 'text-hit', title: 'A', createdAt: 999, segments: [{ text: 'talked about lisa today', speaker: 'Andy' }] },
            { id: 'speaker-hit', title: 'B', createdAt: 1, segments: [{ text: 'hello', speaker: 'Lisa' }] },
        ]);
        const hits = searchTranscriptions('lisa', 5, log);
        expect(hits[0].id).toBe('speaker-hit');
    });

    it('garbage/absent logs return []', () => {
        expect(searchTranscriptions('andy', 5, 'not json')).toEqual([]);
        expect(searchTranscriptions('andy', 5, null)).toEqual([]);
    });
});
