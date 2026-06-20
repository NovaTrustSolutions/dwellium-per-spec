/**
 * halocronOsStore — interface-layout state for the Holocron OS shell
 * (2026-06-12). Dwellium has two interchangeable layouts over the SAME
 * features: the Classic windowed desktop, and the Holocron OS launcher shell.
 * This store holds (a) which layout is active and (b) whether the OS overlay
 * is currently showing.
 *
 * useSyncExternalStore-shaped + localStorage-persisted, matching the repo
 * convention (sister to widgetEnhancementsStore). getServerSnapshot returns a
 * stable default so SSR/first-paint never throws.
 */
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSyncStatic } from './oneSaveStore';

export interface HalocronOsState {
    /** Holocron OS is the chosen interface layout (vs. Classic desktop). */
    enabled: boolean;
    /** The full-screen OS shell is currently visible. When a widget is opened
     *  from the shell it collapses (open=false) to reveal the window; the
     *  launcher rune brings it back. */
    open: boolean;
    /** Hide the left rail/extra chrome for a Zen-style compact workspace. */
    compactChrome: boolean;
    /** Remove hosted header bands so widgets get maximum vertical room. */
    focusCanvas: boolean;
    /** Active hosted-tab view mode. */
    splitLayout: 'single' | 'two' | 'three' | 'quad';
}

export const DEFAULT_HOLOCRON_OS_STATE: HalocronOsState = {
    enabled: false,
    open: false,
    compactChrome: false,
    focusCanvas: false,
    splitLayout: 'single',
};
const KEY = 'dwellium-halocron-os';

function normalize(raw: unknown): HalocronOsState {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_HOLOCRON_OS_STATE };
    const parsed = raw as Partial<HalocronOsState>;
    return {
        ...DEFAULT_HOLOCRON_OS_STATE,
        ...parsed,
        splitLayout: ['single', 'two', 'three', 'quad'].includes(parsed.splitLayout ?? '')
            ? parsed.splitLayout!
            : DEFAULT_HOLOCRON_OS_STATE.splitLayout,
    };
}

function deserialize(raw: string | null): HalocronOsState {
    try {
        if (!raw) return { ...DEFAULT_HOLOCRON_OS_STATE };
        return normalize(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_HOLOCRON_OS_STATE };
    }
}

const syncedStore = withSyncStatic(
    createLocalStorageStore<HalocronOsState>({
        key: KEY,
        deserializer: deserialize,
        defaultValue: { ...DEFAULT_HOLOCRON_OS_STATE },
    }),
    { objectType: 'halocron-os', storageKey: KEY },
);

function commit(next: HalocronOsState): void {
    syncedStore.set(normalize(next), () => {
        try { localStorage.setItem(KEY, JSON.stringify(normalize(next))); } catch { /* sandboxed */ }
    });
}

export const halocronOsStore = {
    subscribe(listener: () => void): () => void {
        return syncedStore.subscribe(listener);
    },
    getSnapshot(): HalocronOsState {
        return syncedStore.getSnapshot();
    },
    getServerSnapshot(): HalocronOsState {
        return { ...DEFAULT_HOLOCRON_OS_STATE };
    },
    /** Switch interface layout. Entering Holocron OS shows the shell. */
    setEnabled(enabled: boolean): void {
        commit({ ...syncedStore.getSnapshot(), enabled, open: enabled });
    },
    /** Show/hide the OS overlay (launcher rune ↔ open widget). */
    setOpen(open: boolean): void {
        commit({ ...syncedStore.getSnapshot(), open });
    },
    setCompactChrome(compactChrome: boolean): void {
        commit({ ...syncedStore.getSnapshot(), compactChrome });
    },
    setFocusCanvas(focusCanvas: boolean): void {
        commit({ ...syncedStore.getSnapshot(), focusCanvas });
    },
    setSplitLayout(splitLayout: HalocronOsState['splitLayout']): void {
        commit({ ...syncedStore.getSnapshot(), splitLayout });
    },
    toggleOpen(): void {
        const current = syncedStore.getSnapshot();
        commit({ ...current, open: !current.open });
    },
    /** Standing convention: reset to defaults. */
    reset(): void {
        commit({ ...DEFAULT_HOLOCRON_OS_STATE });
    },
};
