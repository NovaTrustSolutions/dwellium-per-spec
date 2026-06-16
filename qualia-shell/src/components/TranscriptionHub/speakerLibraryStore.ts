/**
 * speakerLibraryStore — per-user persistence for enrolled speaker voiceprints.
 *
 * The user enrolls a voice (the AI takes a sample → embedding) and labels it;
 * the label + centroid persist here, namespaced by user id via the established
 * `createLocalStorageStore` dynamic-key factory (sister to thoughtWeaverStore /
 * integrationsStore). On the next meeting, identification matches against these
 * centroids so the speaker is recognized and the conversation links to them.
 *
 * Storage key:  tw:speakers:<userId>   (anon → tw:speakers:_anonymous)
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';
import { updateCentroid, l2normalize, type EnrolledSpeaker } from './speakerLibrary';

export const speakerLibraryUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = speakerLibraryUserIdHolder.current;
    return uid ? `tw:speakers:${uid}` : 'tw:speakers:_anonymous';
}

/** Diagnostic: the localStorage key the library currently resolves to. */
export function speakerLibraryResolvedKey(): string {
    return resolveKey();
}

function deserialize(raw: string | null): EnrolledSpeaker[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((s: any): s is EnrolledSpeaker =>
            s && typeof s.id === 'string' && typeof s.label === 'string' && Array.isArray(s.centroid),
        );
    } catch {
        return [];
    }
}

export const speakerLibraryStore = withSync(
    createLocalStorageStore<EnrolledSpeaker[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'speaker-library', holder: speakerLibraryUserIdHolder, resolveKey },
);

function persist(next: EnrolledSpeaker[]): void {
    speakerLibraryStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

function newId(): string {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* fall through */ }
    return `spk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Enroll a new speaker from a first sample embedding + user label. */
export function enrollSpeaker(label: string, embedding: number[]): EnrolledSpeaker {
    const now = new Date().toISOString();
    const speaker: EnrolledSpeaker = {
        id: newId(),
        label: label.trim() || 'Unnamed speaker',
        centroid: l2normalize(embedding),
        sampleCount: 1,
        createdAt: now,
        updatedAt: now,
    };
    persist([...speakerLibraryStore.getSnapshot(), speaker]);
    return speaker;
}

/** Fold another voice sample into an existing speaker (improves the voiceprint). */
export function addSpeakerSample(id: string, embedding: number[]): void {
    const now = new Date().toISOString();
    persist(speakerLibraryStore.getSnapshot().map(s =>
        s.id === id
            ? { ...s, centroid: updateCentroid(s.centroid, s.sampleCount, embedding), sampleCount: s.sampleCount + 1, updatedAt: now }
            : s,
    ));
}

/** Window event fired on rename so transcripts can retro-relabel segments. */
export const SPEAKER_RENAMED_EVENT = 'dwellium:speaker-renamed';

/** User correction: rename a speaker (the label the conversation links to). */
export function renameSpeaker(id: string, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) return;
    const oldLabel = speakerLibraryStore.getSnapshot().find(s => s.id === id)?.label;
    persist(speakerLibraryStore.getSnapshot().map(s =>
        s.id === id ? { ...s, label: trimmed, auto: false, updatedAt: new Date().toISOString() } : s,
    ));
    // Speaker-Library 2026-06-12: renames flow into PAST transcripts too —
    // "search a person's name, get their conversations" requires old logs to
    // carry the new name. TranscriptionHub listens and remaps live + saved.
    if (oldLabel && oldLabel !== trimmed) {
        try {
            window.dispatchEvent(new CustomEvent(SPEAKER_RENAMED_EVENT, { detail: { oldLabel, newLabel: trimmed } }));
        } catch { /* SSR / sandbox */ }
    }
}

/**
 * Speaker-Library 2026-06-12: auto-capture an UNRECOGNIZED voice as a
 * provisional profile ("Unknown Speaker N") so the same person auto-matches
 * in a future session even without manual enrollment — rename it in the
 * library whenever you learn who it is.
 */
export function autoEnrollUnknown(embedding: number[]): EnrolledSpeaker {
    const existing = speakerLibraryStore.getSnapshot();
    const autoCount = existing.filter(s => s.auto || /^Unknown Speaker \d+$/.test(s.label)).length;
    const now = new Date().toISOString();
    const speaker: EnrolledSpeaker = {
        id: newId(),
        label: `Unknown Speaker ${autoCount + 1}`,
        centroid: l2normalize(embedding),
        sampleCount: 1,
        auto: true,
        createdAt: now,
        updatedAt: now,
    };
    persist([...existing, speaker]);
    return speaker;
}

/** Remove an enrolled speaker (user-owned; only the user deletes their voiceprints). */
export function removeSpeaker(id: string): void {
    const next = speakerLibraryStore.getSnapshot().filter(s => s.id !== id);
    persist(next);
}

/**
 * Bug-fix 2026-06-15 (Ilya — "speaker library not used / Unknown Speaker 1"):
 * the library is keyed per logged-in user (`tw:speakers:<userId>`). Voices
 * enrolled BEFORE local multi-user login shipped live under the pre-login key
 * `tw:speakers:_anonymous`, so a now logged-in user's library looks empty and
 * every voice re-auto-enrolls as "Unknown Speaker N".
 *
 * This one-time, NON-DESTRUCTIVE adoption copies the orphaned `_anonymous`
 * enrollments into the user's key — but ONLY when the user has none of their
 * own yet (so it can never overwrite real per-user voiceprints), and it only
 * ever reads from `_anonymous` (= "no user"), never from another real user's
 * key (account isolation preserved). `_anonymous` is left intact.
 *
 * Returns the number of enrollments adopted (0 if nothing to do). Idempotent:
 * a per-user flag prevents it from running twice.
 */
export function migrateAnonLibraryToUser(userId: string): number {
    if (!userId || userId === '_anonymous') return 0;
    speakerLibraryUserIdHolder.current = userId;
    const userKey = `tw:speakers:${userId}`;
    const flagKey = `tw:speakers:migrated-anon:${userId}`;
    const markDone = () => { try { localStorage.setItem(flagKey, '1'); } catch { /* sandboxed */ } };

    try {
        if (localStorage.getItem(flagKey)) return 0; // already migrated
    } catch {
        return 0; // private browsing / sandboxed — nothing to migrate
    }

    // Never overwrite the user's own data.
    if (speakerLibraryStore.getSnapshot().length > 0) { markDone(); return 0; }

    let anon: EnrolledSpeaker[] = [];
    try { anon = deserialize(localStorage.getItem('tw:speakers:_anonymous')); } catch { anon = []; }
    if (anon.length === 0) { markDone(); return 0; }

    // Adopt under the user key + push into the live store so subscribers
    // (useSyncExternalStore in TranscriptionHub) re-read immediately.
    speakerLibraryStore.set(anon, () => {
        try { localStorage.setItem(userKey, JSON.stringify(anon)); } catch { /* sandboxed */ }
    });
    markDone();
    return anon.length;
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetSpeakerLibrary(): void {
    speakerLibraryStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}
