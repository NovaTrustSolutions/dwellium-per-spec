/**
 * fluidOsStore — interface-layout state for the Fluid OS shell (2026-07-04).
 *
 * Dwellium has three interchangeable layouts over the SAME features: the
 * Classic windowed desktop, the Holocron OS launcher shell, and Fluid OS — a
 * fluid, physics-driven swap-navigation shell (EverSwap/Lusion motion
 * language). This store is the sister of `halocronOsStore.ts`: same shape,
 * same persistence approach, same `.reset()` convention. Only Fluid OS's own
 * `enabled`/`open` are tracked here — enabling Fluid OS disables Holocron OS
 * (and vice versa) via the TOGGLE UI handlers, not store coupling (plan 039).
 *
 * useSyncExternalStore-shaped + localStorage-persisted, matching the repo
 * convention. getServerSnapshot returns a stable default so SSR/first-paint
 * never throws.
 */
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSyncStatic } from './oneSaveStore';

export interface FluidOsState {
    /** Fluid OS is the chosen interface layout (vs. Classic desktop / Holocron OS). */
    enabled: boolean;
    /** The full-screen Fluid OS shell is currently visible. When a widget is
     *  opened from the shell it collapses (open=false) to reveal the window;
     *  the FluidLauncher droplet brings it back. */
    open: boolean;
}

export const DEFAULT_FLUID_OS_STATE: FluidOsState = {
    enabled: false,
    open: false,
};
const KEY = 'dwellium-fluid-os';

function normalize(raw: unknown): FluidOsState {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_FLUID_OS_STATE };
    const parsed = raw as Partial<FluidOsState>;
    return {
        ...DEFAULT_FLUID_OS_STATE,
        ...parsed,
        enabled: Boolean(parsed.enabled),
        open: Boolean(parsed.open),
    };
}

function deserialize(raw: string | null): FluidOsState {
    try {
        if (!raw) return { ...DEFAULT_FLUID_OS_STATE };
        return normalize(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_FLUID_OS_STATE };
    }
}

const syncedStore = withSyncStatic(
    createLocalStorageStore<FluidOsState>({
        key: KEY,
        deserializer: deserialize,
        defaultValue: { ...DEFAULT_FLUID_OS_STATE },
    }),
    { objectType: 'fluid-os', storageKey: KEY },
);

function commit(next: FluidOsState): void {
    syncedStore.set(normalize(next), () => {
        try { localStorage.setItem(KEY, JSON.stringify(normalize(next))); } catch { /* sandboxed */ }
    });
}

export const fluidOsStore = {
    subscribe(listener: () => void): () => void {
        return syncedStore.subscribe(listener);
    },
    getSnapshot(): FluidOsState {
        return syncedStore.getSnapshot();
    },
    getServerSnapshot(): FluidOsState {
        return { ...DEFAULT_FLUID_OS_STATE };
    },
    /** Switch interface layout. Entering Fluid OS shows the shell. */
    setEnabled(enabled: boolean): void {
        commit({ ...syncedStore.getSnapshot(), enabled, open: enabled });
    },
    /** Show/hide the OS overlay (launcher droplet ↔ open widget). */
    setOpen(open: boolean): void {
        commit({ ...syncedStore.getSnapshot(), open });
    },
    toggleOpen(): void {
        const current = syncedStore.getSnapshot();
        commit({ ...current, open: !current.open });
    },
    /** Standing convention: reset to defaults. */
    reset(): void {
        commit({ ...DEFAULT_FLUID_OS_STATE });
    },
};
