/**
 * halocronOsStore — interface-layout state for the Halocron OS shell
 * (2026-06-12). Dwellium has two interchangeable layouts over the SAME
 * features: the Classic windowed desktop, and the Halocron OS launcher shell.
 * This store holds (a) which layout is active and (b) whether the OS overlay
 * is currently showing.
 *
 * useSyncExternalStore-shaped + localStorage-persisted, matching the repo
 * convention (sister to widgetEnhancementsStore). getServerSnapshot returns a
 * stable default so SSR/first-paint never throws.
 */

export interface HalocronOsState {
    /** Halocron OS is the chosen interface layout (vs. Classic desktop). */
    enabled: boolean;
    /** The full-screen OS shell is currently visible. When a widget is opened
     *  from the shell it collapses (open=false) to reveal the window; the
     *  launcher rune brings it back. */
    open: boolean;
}

const DEFAULT: HalocronOsState = { enabled: false, open: false };
const KEY = 'dwellium-halocron-os';

function read(): HalocronOsState {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return DEFAULT;
        return { ...DEFAULT, ...(JSON.parse(raw) as Partial<HalocronOsState>) };
    } catch {
        return DEFAULT;
    }
}

let current: HalocronOsState = read();
const listeners = new Set<() => void>();

function commit(next: HalocronOsState): void {
    current = next;
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* sandboxed */ }
    listeners.forEach((l) => l());
}

export const halocronOsStore = {
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    getSnapshot(): HalocronOsState {
        return current;
    },
    getServerSnapshot(): HalocronOsState {
        return DEFAULT;
    },
    /** Switch interface layout. Entering Halocron OS shows the shell. */
    setEnabled(enabled: boolean): void {
        commit({ enabled, open: enabled });
    },
    /** Show/hide the OS overlay (launcher rune ↔ open widget). */
    setOpen(open: boolean): void {
        commit({ ...current, open });
    },
    toggleOpen(): void {
        commit({ ...current, open: !current.open });
    },
    /** Standing convention: reset to defaults. */
    reset(): void {
        commit({ ...DEFAULT });
    },
};
