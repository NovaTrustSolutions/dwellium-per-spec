/**
 * dumpStore — local-first persistence for Scribe's Brain Dump / Intake tab
 * (spec §5.2). Adapts the holocron-reference `DumpMode` (which relied on
 * Electron `window.electronAPI.dumpAppend` + a per-thread file on disk) to the
 * current browser-first Dwellium architecture: every dump is written into a
 * per-user localStorage namespace via the established `createLocalStorageStore`
 * dynamic-key factory (Phase-8+ Task 8.10 Option β; sister-shape to
 * `thoughtWeaverStore`, `integrationsStore`, `savedLayoutsStore`).
 *
 * This makes brain dumps survive both tab navigation (component unmount) and
 * app restart with NO backend dependency — the key requirement for the
 * offline-capable Electron build. When a backend/agent is connected the
 * compiled markdown can still be pushed to it; the local copy is the source of
 * truth the user always owns.
 *
 * Storage key shape:   scribe:braindump:<userId>
 * Fallback for anon:   scribe:braindump:_anonymous
 *
 * Append-only by design (spec §5.1: "Brain dumps and notes are append-only").
 * Each entry gets a monotonically increasing `promptNumber` (1-based, oldest
 * first) so the compiled file reads `# Prompt 1`, `# Prompt 2`, … top to
 * bottom — matching the reference's `# Prompt N` header convention.
 *
 * Pure helpers (`now` injectable) → unit-testable without a DOM.
 */

import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export interface DumpEntry {
    /** Stable id (uuid when available, timestamp fallback). */
    id: string;
    /** 1-based, oldest-first. Rendered as `# Prompt N`. */
    promptNumber: number;
    /** Human-readable local timestamp shown next to the prompt header. */
    timestamp: string;
    /** ISO timestamp for stable sorting / provenance. */
    iso: string;
    /** Raw user text — stored verbatim, never re-interpreted. */
    content: string;
}

/** Holder updated by the DumpMode render path BEFORE useSyncExternalStore reads. */
export const dumpUserIdHolder: { current: string | null } = { current: null };

export function resolveDumpKey(): string {
    const uid = dumpUserIdHolder.current;
    return uid ? `scribe:braindump:${uid}` : 'scribe:braindump:_anonymous';
}

function deserialize(raw: string | null): DumpEntry[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (e): e is DumpEntry =>
                e && typeof e.content === 'string' && typeof e.promptNumber === 'number',
        );
    } catch {
        return [];
    }
}

export const dumpStore = withSync(
    createLocalStorageStore<DumpEntry[]>({
        key: resolveDumpKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'scribe-dump', holder: dumpUserIdHolder, resolveKey: resolveDumpKey },
);

function newId(): string {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch { /* older runtime */ }
    return `dump-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build the next entry for the active user's brain dump. Pure: given the
 * current list it returns the list with one entry appended (oldest-first) plus
 * the entry itself. The DumpMode component handles persistence/notify via the
 * store; this split keeps the numbering logic unit-testable.
 */
export function buildNextDump(
    current: DumpEntry[],
    content: string,
    now: Date = new Date(),
): { entry: DumpEntry; next: DumpEntry[] } {
    const promptNumber = current.length + 1;
    const entry: DumpEntry = {
        id: newId(),
        promptNumber,
        timestamp: now.toLocaleString(),
        iso: now.toISOString(),
        content,
    };
    return { entry, next: [...current, entry] };
}

/** Append one dump for the active user, persist, and notify subscribers. */
export function appendDump(content: string, now: Date = new Date()): DumpEntry | null {
    const trimmed = content.trim();
    if (!trimmed) return null;
    if (typeof window === 'undefined') return null;
    const current = dumpStore.getSnapshot();
    const { entry, next } = buildNextDump(current, trimmed, now);
    dumpStore.set(next, () => {
        try { localStorage.setItem(resolveDumpKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
    return entry;
}

/** Wipe every dump for the current user (destructive — wire to a confirm). */
export function clearDumps(): void {
    if (typeof window === 'undefined') return;
    dumpStore.set([], () => {
        try { localStorage.removeItem(resolveDumpKey()); } catch { /* sandboxed */ }
    });
}

/**
 * Compile accumulated dumps into a single markdown document with `# Prompt N`
 * headers + timestamps. This is the "thread's brain dump file" the spec refers
 * to — materialized on demand from the local store.
 */
export function compileBrainDumpMarkdown(entries: DumpEntry[], title = 'Brain Dump'): string {
    if (entries.length === 0) return `# ${title}\n\n_No dumps yet._\n`;
    const blocks = entries
        .slice()
        .sort((a, b) => a.promptNumber - b.promptNumber)
        .map((e) => `# Prompt ${e.promptNumber} — ${e.timestamp}\n\n${e.content.trim()}\n`);
    return `# ${title}\n\n${blocks.join('\n---\n\n')}`;
}
