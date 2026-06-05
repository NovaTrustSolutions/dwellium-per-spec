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
import { updateCentroid, l2normalize, type EnrolledSpeaker } from './speakerLibrary';

export const speakerLibraryUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = speakerLibraryUserIdHolder.current;
    return uid ? `tw:speakers:${uid}` : 'tw:speakers:_anonymous';
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

export const speakerLibraryStore = createLocalStorageStore<EnrolledSpeaker[]>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: [],
});

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

/** User correction: rename a speaker (the label the conversation links to). */
export function renameSpeaker(id: string, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) return;
    persist(speakerLibraryStore.getSnapshot().map(s =>
        s.id === id ? { ...s, label: trimmed, updatedAt: new Date().toISOString() } : s,
    ));
}

/** Remove an enrolled speaker (user-owned; only the user deletes their voiceprints). */
export function removeSpeaker(id: string): void {
    const next = speakerLibraryStore.getSnapshot().filter(s => s.id !== id);
    persist(next);
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetSpeakerLibrary(): void {
    speakerLibraryStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}
