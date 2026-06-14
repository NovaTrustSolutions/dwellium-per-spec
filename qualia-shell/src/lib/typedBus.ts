/**
 * typedBus — ONE typed window-event bus with last-value replay.
 *
 * Assessment sweep 2026-06-12 (weakness #4): the mount-race class of bug
 * (default stack, ⌘K ara-prompt, morning brief — each independently fixed
 * with a hand-rolled "pending slot" module variable) exists because a
 * CustomEvent dispatched before its listener mounts is silently lost.
 * This module makes the race structurally impossible:
 *
 *   - Every channel remembers its LAST emit. Late subscribers can replay it
 *     (`on(handler, { replayWithinMs })`) or consume it one-shot (`consume()`
 *     — the pending-slot semantic, generalized).
 *   - Full legacy interop: `emit()` also dispatches a real window CustomEvent
 *     under the same name with the payload as `detail`, and `on()` attaches a
 *     real window listener. Un-migrated dispatchEvent/addEventListener call
 *     sites keep working 1:1, in both directions.
 *
 * Reversibility: migrated modules keep their exported function signatures
 * (requestAraPrompt / consumePendingSpawn / …) and delegate here — reverting
 * a migration is a one-file change with zero caller churn.
 */

interface LastEmit<T> {
    payload: T;
    at: number; // Date.now() at emit
    /**
     * True once at least one subscriber has seen this emit (live at emit
     * time, or via replay). Replay ONLY fires for undelivered emits — a
     * subscriber re-attaching (e.g. a React effect re-running on dep change)
     * never re-receives an already-handled event, so replay cannot loop.
     */
    delivered: boolean;
}

export interface BusOnOptions {
    /**
     * On subscribe, replay the channel's last emit IF it was never delivered
     * to any subscriber (i.e. it fired before anyone was listening — the
     * mount-race case) and it is younger than this many ms. Already-delivered
     * emits are never replayed. Omit (or 0) for live-only semantics.
     */
    replayWithinMs?: number;
}

export interface BusChannel<T> {
    readonly name: string;
    /** Publish: remembers last value + dispatches the legacy CustomEvent. */
    emit(payload: T): void;
    /** Subscribe (window listener under the hood). Returns unsubscribe. */
    on(handler: (payload: T) => void, opts?: BusOnOptions): () => void;
    /** One-shot pending-slot read: returns last unconsumed emit, then clears. */
    consume(): T | null;
    /** Read the last emit without consuming it. */
    peek(): T | null;
    /** Forget the last emit (e.g. after it has been fully handled). */
    clear(): void;
}

const registry = new Map<string, BusChannel<unknown>>();
const lastEmits = new Map<string, LastEmit<unknown>>();

function makeChannel<T>(name: string): BusChannel<T> {
    let subscriberCount = 0;
    return {
        name,
        emit(payload: T): void {
            // Delivered immediately if anyone is listening right now —
            // window.dispatchEvent below is synchronous.
            lastEmits.set(name, { payload, at: Date.now(), delivered: subscriberCount > 0 });
            try {
                window.dispatchEvent(new CustomEvent(name, { detail: payload }));
            } catch { /* SSR / sandboxed window — late subscribers still replay/consume */ }
        },
        on(handler: (payload: T) => void, opts?: BusOnOptions): () => void {
            const listener = (e: Event) => handler((e as CustomEvent<T>).detail);
            try {
                window.addEventListener(name, listener);
            } catch { /* SSR — no live events; replay below still works on client */ }
            subscriberCount += 1;
            const within = opts?.replayWithinMs ?? 0;
            if (within > 0) {
                const last = lastEmits.get(name) as LastEmit<T> | undefined;
                if (last && !last.delivered && Date.now() - last.at <= within) {
                    last.delivered = true;
                    handler(last.payload);
                }
            }
            let active = true;
            return () => {
                if (active) { active = false; subscriberCount -= 1; }
                try { window.removeEventListener(name, listener); } catch { /* SSR */ }
            };
        },
        consume(): T | null {
            const last = lastEmits.get(name) as LastEmit<T> | undefined;
            if (!last) return null;
            lastEmits.delete(name);
            return last.payload;
        },
        peek(): T | null {
            return (lastEmits.get(name) as LastEmit<T> | undefined)?.payload ?? null;
        },
        clear(): void {
            lastEmits.delete(name);
        },
    };
}

/**
 * Get (or create) the typed channel for `name`. Channels are singletons per
 * name — two modules asking for the same name share replay state.
 *
 * NOTE: legacy `window.dispatchEvent(new CustomEvent(name, …))` call sites
 * do NOT populate replay state (only live listeners see them) — replay/
 * consume guarantees require emits to go through `channel.emit()`.
 */
export function busChannel<T = unknown>(name: string): BusChannel<T> {
    let ch = registry.get(name);
    if (!ch) {
        ch = makeChannel<T>(name) as BusChannel<unknown>;
        registry.set(name, ch);
    }
    return ch as BusChannel<T>;
}

/** Test escape hatch (createLocalStorageStore `.reset()` convention sister). */
export function __resetTypedBusForTests(): void {
    lastEmits.clear();
    registry.clear();
}
