/**
 * widgetMemory — plan 055 phase 2: every widget reopens at its exact point.
 *
 * ONE per-user store (`widgetMemory:<uid>` → `Record<widgetId, slice>`)
 * behind a tiny hook: `useWidgetMemory(widgetId, defaults)` returns the
 * widget's remembered VIEW state (active tab, selection, scroll, drafts —
 * never data that already lives in another store) and a `patch` function.
 *
 * remoteMachinesStore sister shape: dynamic-key `createLocalStorageStore`
 * keyed off `widgetMemoryUserIdHolder` + One Save `withSync('widgetMemory')`.
 *
 * Write path: a patch updates the in-memory snapshot + notifies subscribers
 * IMMEDIATELY (the widget's view is controlled by the slice), while the
 * localStorage write is debounced ~500 ms and flushed on
 * `visibilitychange → hidden` + `beforeunload` so a closed tab never loses
 * the last edit. One Save write-through debounces separately inside
 * `withSync` (800 ms) with the same last-value semantics.
 *
 * Hardening: the deserializer keeps only a plain object map; a corrupt or
 * non-object slice falls back to that widget's defaults at read time without
 * touching any other widget's slice. Values must be JSON-serializable — a
 * dev-only console.warn fires on patches that are not.
 */
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { widgetMemoryUserIdHolder } from './perUserIdentity';

type WidgetMemoryMap = Record<string, unknown>;

export { widgetMemoryUserIdHolder };

function resolveKey(): string {
    const uid = widgetMemoryUserIdHolder.current;
    return uid ? `widgetMemory:${uid}` : 'widgetMemory:_anonymous';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deserialize(raw: string | null): WidgetMemoryMap {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export const widgetMemoryStore = withSync(
    createLocalStorageStore<WidgetMemoryMap>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: {},
    }),
    { objectType: 'widgetMemory', holder: widgetMemoryUserIdHolder, resolveKey },
);

/* ── debounced localStorage persistence + flush ─────────────────────────── */

const PERSIST_DEBOUNCE_MS = 500;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
/** Key+value of the not-yet-persisted write (null = nothing pending). */
let pendingPersist: { key: string; json: string } | null = null;
let flushListenersInstalled = false;

function persistNow(): void {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    if (!pendingPersist) return;
    const { key, json } = pendingPersist;
    pendingPersist = null;
    try { localStorage.setItem(key, json); } catch { /* sandboxed */ }
}

function installFlushListeners(): void {
    if (flushListenersInstalled || typeof window === 'undefined') return;
    flushListenersInstalled = true;
    window.addEventListener('beforeunload', persistNow);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') persistNow();
    });
}

/** Flush any pending debounced write immediately (blur/unmount rule). */
export function flushWidgetMemory(): void {
    persistNow();
}

function warnIfNotSerializable(widgetId: string, patch: unknown): void {
    if (!import.meta.env.DEV) return;
    try {
        const round: unknown = JSON.parse(JSON.stringify(patch));
        if (JSON.stringify(round) !== JSON.stringify(patch)) {
            console.warn(`[widgetMemory] patch for "${widgetId}" is not JSON-serializable (functions/undefined/Date are dropped or mangled)`);
        }
    } catch {
        console.warn(`[widgetMemory] patch for "${widgetId}" is not JSON-serializable (circular or BigInt)`);
    }
}

/**
 * Merge a partial view-state patch into one widget's slice. Snapshot +
 * subscribers update immediately; the localStorage write is debounced.
 * Callable outside React (blur handlers, unmount cleanups).
 */
export function patchWidgetMemory(widgetId: string, patch: Record<string, unknown>): void {
    warnIfNotSerializable(widgetId, patch);
    installFlushListeners();
    const map = widgetMemoryStore.getSnapshot();
    const prev = map[widgetId];
    const next: WidgetMemoryMap = {
        ...map,
        [widgetId]: { ...(isPlainObject(prev) ? prev : {}), ...patch },
    };
    // If an older pending write targeted a different user's key (account
    // switch mid-debounce), flush semantics don't apply — drop it rather than
    // writing the previous user's data under any key.
    const key = resolveKey();
    if (pendingPersist && pendingPersist.key !== key) pendingPersist = null;
    widgetMemoryStore.set(next, () => {
        pendingPersist = { key, json: JSON.stringify(next) };
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    });
}

/** Test escape hatch (v2.72.1 standing convention). */
export function resetWidgetMemory(): void {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    pendingPersist = null;
    widgetMemoryStore.reset();
}

/** Read one widget's slice merged over its defaults (corrupt slice → defaults). */
export function readWidgetMemory<T extends Record<string, unknown>>(widgetId: string, defaults: T): T {
    const slice = widgetMemoryStore.getSnapshot()[widgetId];
    return isPlainObject(slice) ? { ...defaults, ...(slice as Partial<T>) } : defaults;
}

/**
 * The primitive. `const [mem, patch] = useWidgetMemory('scribe', { activeTab: 'files' })`
 * — `mem` is the remembered view state (defaults filled in), `patch` merges a
 * partial update. `defaults` is captured on first render (treat it as constant).
 */
export function useWidgetMemory<T extends Record<string, unknown>>(
    widgetId: string,
    defaults: T,
): [T, (patch: Partial<T>) => void] {
    const defaultsRef = useRef(defaults);
    const map = useSyncExternalStore(
        widgetMemoryStore.subscribe,
        widgetMemoryStore.getSnapshot,
        widgetMemoryStore.getServerSnapshot,
    );
    const slice = useMemo(
        () => {
            const raw = map[widgetId];
            return isPlainObject(raw) ? { ...defaultsRef.current, ...(raw as Partial<T>) } : defaultsRef.current;
        },
        [map, widgetId],
    );
    const patch = useCallback(
        (p: Partial<T>) => patchWidgetMemory(widgetId, p),
        [widgetId],
    );
    return [slice, patch];
}
