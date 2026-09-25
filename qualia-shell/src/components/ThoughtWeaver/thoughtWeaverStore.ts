/**
 * thoughtWeaverStore — per-user local persistence for ThoughtWeaver captures.
 *
 * Original product ask (2026-05-26): every capture must persist AND only the
 * user can delete it. The component used to rely entirely on the backend
 * `/api/thought-weaver/captures` endpoint, so a backend outage (or simply a
 * different machine) erased history. This store solves that by writing every
 * capture into a per-user localStorage namespace via the established
 * `createLocalStorageStore` dynamic-key factory (Phase-8+ Task 8.10 Option β;
 * sister-shape to `integrationsStore`, `savedLayoutsStore`).
 *
 * Storage key shape:   thought-weaver:captures:<userId>
 * Fallback for anon:   thought-weaver:captures:_anonymous
 *
 * Each entry is the LocalCapture record below — a superset of the backend
 * `CaptureEntry` so the UI can render local and backend records uniformly.
 * `source: 'local'` distinguishes user-owned records the user is allowed to
 * delete; `source: 'backend'` records (seeds, demos, other devices) display
 * without a delete handle and are merged in by the component, NOT stored here.
 */

import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export interface LocalCapture {
    id: string;
    text: string;                          // raw user input
    filed_to: string;                       // people | projects | ideas | admin | needs_review
    confidence: number;                     // 0..1
    destination_name: string | null;        // short LLM-suggested label
    source: 'local';                        // marker — distinguishes from backend
    createdAt: string;                      // ISO
}

/** Holder updated by the ThoughtWeaver render path BEFORE useSyncExternalStore reads. */
export const thoughtWeaverUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = thoughtWeaverUserIdHolder.current;
    return uid ? `thought-weaver:captures:${uid}` : 'thought-weaver:captures:_anonymous';
}

function deserialize(raw: string | null): LocalCapture[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((c: any): c is LocalCapture =>
            c && typeof c.id === 'string' && typeof c.text === 'string' && typeof c.createdAt === 'string'
        );
    } catch {
        return [];
    }
}

export const thoughtWeaverStore = withSync(
    createLocalStorageStore<LocalCapture[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'thought-weaver', holder: thoughtWeaverUserIdHolder, resolveKey },
);

/** Append one capture, persist, notify. Most-recent-first ordering. */
export function appendLocalCapture(entry: Omit<LocalCapture, 'source'>): void {
    if (typeof window === 'undefined') return;
    const current = thoughtWeaverStore.getSnapshot();
    const next: LocalCapture[] = [{ ...entry, source: 'local' }, ...current];
    thoughtWeaverStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Delete one local capture by id. Backend records pass through silently. */
export function deleteLocalCapture(id: string): void {
    if (typeof window === 'undefined') return;
    const current = thoughtWeaverStore.getSnapshot();
    const next = current.filter(c => c.id !== id);
    if (next.length === current.length) return; // nothing to do
    thoughtWeaverStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Wipe all local captures for the current user (destructive — wire to a confirm). */
export function clearLocalCaptures(): void {
    if (typeof window === 'undefined') return;
    thoughtWeaverStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

/**
 * Import Supabase rows (plan 067 one-time import) into the local store in a
 * SINGLE `set()` — not N appends, which would fire N notifications/writes.
 * Rows whose id is already present are skipped (the caller — `planImport` —
 * already filters these, but this is the last line of defense against a
 * duplicate row). Result is re-sorted newest-first (stable for equal
 * `createdAt`, per `Array.prototype.sort`'s ES2019+ stability guarantee) —
 * imported rows are not necessarily newer than existing local ones. No-op
 * (no `set()` call) when every row is already present. Returns the count
 * actually added.
 */
export function importCaptures(rows: Array<Omit<LocalCapture, 'source'>>): number {
    if (typeof window === 'undefined') return 0;
    if (rows.length === 0) return 0;
    const current = thoughtWeaverStore.getSnapshot();
    const existingIds = new Set(current.map(c => c.id));
    const toAdd: LocalCapture[] = rows
        .filter(r => !existingIds.has(r.id))
        .map(r => ({ ...r, source: 'local' as const }));
    if (toAdd.length === 0) return 0;
    const next = [...current, ...toAdd].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    thoughtWeaverStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
    return toAdd.length;
}

/**
 * Re-file a local capture into a user-chosen bucket — a user override of the
 * AI's guess. The original `text` is preserved verbatim (never re-interpreted);
 * only `filed_to` changes and `confidence` is set to 1 (user-confirmed). This is
 * the "never misinterpreted by the AI" guarantee: the user always has the final
 * say over how their own stored thought is classified.
 */
export function recategorizeLocalCapture(id: string, bucket: string): void {
    if (typeof window === 'undefined') return;
    const current = thoughtWeaverStore.getSnapshot();
    let changed = false;
    const next = current.map(c => {
        if (c.id !== id) return c;
        changed = true;
        return { ...c, filed_to: bucket, confidence: 1 }; // text intentionally untouched
    });
    if (!changed) return;
    thoughtWeaverStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}
