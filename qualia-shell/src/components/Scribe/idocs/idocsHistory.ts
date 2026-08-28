/**
 * idocsHistory — pure per-doc snapshot ring buffer for undo/redo + "History ▾".
 * No timers, no store access: the store owns persistence, the editor owns the
 * debounce (via `createSnapshotDebouncer`, which takes injectable
 * `schedule`/`now` seams so tests never need fake timers).
 *
 * Model: `snapshots[cursor]` is the state the doc is "at". A push while the
 * cursor is not at the tail truncates the redo tail (standard editor semantics).
 */
import type { IDoc } from './idocTypes';

export interface Snapshot { at: number; doc: IDoc }
export interface DocHistory { snapshots: Snapshot[]; cursor: number }
export type HistoryMap = Record<string, DocHistory>;

export const HISTORY_MAX = 30;
export const HISTORY_MAX_BYTES = 2_000_000;
export const HISTORY_DEBOUNCE_MS = 800;

export const emptyHistory = (): DocHistory => ({ snapshots: [], cursor: -1 });

/** Structural equality of docs ignoring `updatedAt` (autosave stamps it on every write). */
export function sameDoc(a: IDoc | undefined, b: IDoc | undefined): boolean {
    if (!a || !b) return false;
    const strip = (d: IDoc) => JSON.stringify({ ...d, updatedAt: undefined });
    return strip(a) === strip(b);
}

/** Append a snapshot (structural clone). Skips when identical to the one at the cursor. */
export function pushSnapshot(h: DocHistory | undefined, doc: IDoc, at: number, max = HISTORY_MAX): DocHistory {
    const cur = h ?? emptyHistory();
    if (sameDoc(cur.snapshots[cur.cursor]?.doc, doc)) return cur;
    const kept = cur.snapshots.slice(0, cur.cursor + 1);
    kept.push({ at, doc: structuredClone(doc) });
    const snapshots = kept.length > max ? kept.slice(kept.length - max) : kept;
    return { snapshots, cursor: snapshots.length - 1 };
}

export function canUndo(h: DocHistory | undefined): boolean { return !!h && h.cursor > 0; }
export function canRedo(h: DocHistory | undefined): boolean { return !!h && h.cursor >= 0 && h.cursor < h.snapshots.length - 1; }

/**
 * Undo: if `current` has unsnapshotted edits (debounce still pending) they are
 * pushed first so ⌘Z never loses the latest keystrokes. Returns null when nothing to undo.
 */
export function undo(h: DocHistory | undefined, current: IDoc, at: number): { history: DocHistory; doc: IDoc } | null {
    const flushed = pushSnapshot(h, current, at);
    if (!canUndo(flushed)) return null;
    const cursor = flushed.cursor - 1;
    return { history: { ...flushed, cursor }, doc: structuredClone(flushed.snapshots[cursor].doc) };
}

export function redo(h: DocHistory | undefined): { history: DocHistory; doc: IDoc } | null {
    if (!canRedo(h)) return null;
    const cursor = h!.cursor + 1;
    return { history: { ...h!, cursor }, doc: structuredClone(h!.snapshots[cursor].doc) };
}

export function restoreSnapshot(h: DocHistory | undefined, index: number): { history: DocHistory; doc: IDoc } | null {
    if (!h || index < 0 || index >= h.snapshots.length) return null;
    return { history: { ...h, cursor: index }, doc: structuredClone(h.snapshots[index].doc) };
}

/**
 * Keep the whole map under `maxBytes` (serialized) by dropping the oldest
 * snapshots first, across docs. Never drops a doc's cursor snapshot or last one.
 */
export function capHistoryBytes(map: HistoryMap, maxBytes = HISTORY_MAX_BYTES): HistoryMap {
    const size = (m: HistoryMap) => JSON.stringify(m).length;
    if (size(map) <= maxBytes) return map;
    const next: HistoryMap = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { snapshots: v.snapshots.slice(), cursor: v.cursor }]));
    // ponytail: O(n·docs) re-serialize per drop; fine at 30 snapshots × a handful of docs; trigger: snapshot cap raised above 30 or docs per user exceeds ~20.
    for (let guard = 0; guard < 10_000 && size(next) > maxBytes; guard++) {
        let victim: string | null = null; let oldest = Infinity;
        for (const [id, h] of Object.entries(next)) {
            const dropIdx = h.cursor === 0 ? 1 : 0; // never drop the cursor snapshot
            const s = h.snapshots[dropIdx];
            if (h.snapshots.length > 1 && s && s.at < oldest) { oldest = s.at; victim = id; }
        }
        if (!victim) break;
        const h = next[victim];
        const dropIdx = h.cursor === 0 ? 1 : 0;
        h.snapshots.splice(dropIdx, 1);
        if (dropIdx < h.cursor) h.cursor -= 1;
    }
    return next;
}

/** Loose validator for persisted payloads (older docs have no history at all). */
export function normalizeHistory(raw: unknown, isDoc: (d: unknown) => d is IDoc): HistoryMap {
    if (!raw || typeof raw !== 'object') return {};
    const out: HistoryMap = {};
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
        const h = v as Partial<DocHistory>;
        if (!h || !Array.isArray(h.snapshots)) continue;
        const snapshots = h.snapshots.filter((s): s is Snapshot => !!s && typeof s.at === 'number' && isDoc(s.doc));
        if (!snapshots.length) continue;
        const cursor = typeof h.cursor === 'number' ? Math.max(0, Math.min(h.cursor, snapshots.length - 1)) : snapshots.length - 1;
        out[id] = { snapshots, cursor };
    }
    return out;
}

/** Relative time for the History popover ("just now", "3m ago", "2h ago", else locale date). */
export function relativeTime(at: number, now = Date.now()): string {
    const s = Math.max(0, Math.round((now - at) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return new Date(at).toLocaleDateString();
}

export type Schedule = (fn: () => void, ms: number) => () => void;
const defaultSchedule: Schedule = (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); };

/** Trailing debounce with an injectable scheduler (tests drive it by hand — real timers only). */
export function createSnapshotDebouncer(push: () => void, opts: { delayMs?: number; schedule?: Schedule } = {}) {
    const { delayMs = HISTORY_DEBOUNCE_MS, schedule = defaultSchedule } = opts;
    let cancel: (() => void) | null = null;
    return {
        touch() { cancel?.(); cancel = schedule(() => { cancel = null; push(); }, delayMs); },
        flush() { if (cancel) { cancel(); cancel = null; push(); } },
        cancel() { cancel?.(); cancel = null; },
        get pending() { return cancel !== null; },
    };
}
