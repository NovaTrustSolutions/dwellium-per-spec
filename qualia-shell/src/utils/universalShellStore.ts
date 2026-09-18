/**
 * universalShellStore — SSR-safe per-user store for Universal Shell
 * navigation persistence (active container + scratch pad note).
 *
 * Per-USER, dynamic key `dwellium:universalShell:<uid>` (holder
 * `universalShellUserIdHolder`, written by the perUserIdentity single writer)
 * + One Save `withSync('universalShell')` — gridLockStore sister shape — so
 * the state follows the account to any machine. One-time adoption: a user
 * whose per-user key is empty inherits this device's legacy device-global
 * scratch value `dwellium-universal-scratch` (never written or removed
 * again), so nobody's note is lost on upgrade.
 *
 * Mirrors the established createLocalStorageStore + useSyncExternalStore
 * pattern (see gridLockStore.ts). Read via the useUniversalShellState() hook.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from './createLocalStorageStore';
import { withSync } from '../lib/oneSaveStore';
import { universalShellUserIdHolder, usePerUserIdentity } from '../lib/perUserIdentity';

export interface UniversalShellState {
    activeContainerId: string;
    scratch: string;
}

const DEFAULT_STATE: UniversalShellState = { activeContainerId: '', scratch: '' };

/** Per-user key prefix. Full key is `${UNIVERSAL_SHELL_KEY}:<uid>` or `:_anonymous`. */
export const UNIVERSAL_SHELL_KEY = 'dwellium:universalShell';

/** Legacy device-global scratch key (pre per-user). Read once for adoption; never written or removed. */
export const LEGACY_SCRATCH_KEY = 'dwellium-universal-scratch';

function resolveKey(): string {
    return `${UNIVERSAL_SHELL_KEY}:${universalShellUserIdHolder.current ?? '_anonymous'}`;
}

function deserialize(raw: string | null): UniversalShellState {
    if (raw == null) {
        // Empty per-user key → adopt the legacy global scratch value once.
        let legacyScratch = '';
        try { legacyScratch = localStorage.getItem(LEGACY_SCRATCH_KEY) ?? ''; } catch { /* sandboxed */ }
        return { ...DEFAULT_STATE, scratch: legacyScratch };
    }
    try {
        const parsed = JSON.parse(raw) as Partial<UniversalShellState>;
        return {
            activeContainerId: typeof parsed.activeContainerId === 'string' ? parsed.activeContainerId : '',
            scratch: typeof parsed.scratch === 'string' ? parsed.scratch : '',
        };
    } catch {
        return DEFAULT_STATE;
    }
}

export const universalShellStore = withSync(
    createLocalStorageStore<UniversalShellState>({ key: resolveKey, deserializer: deserialize, defaultValue: DEFAULT_STATE }),
    { objectType: 'universalShell', holder: universalShellUserIdHolder, resolveKey },
);

/** Merge a partial patch into the stored state and notify subscribers. */
export function setUniversalShellState(patch: Partial<UniversalShellState>): void {
    const next = { ...universalShellStore.getSnapshot(), ...patch };
    universalShellStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* quota / sandboxed — keep typing */ }
    });
}

/** Read the current + subscribe to changes. SSR-safe. */
export function useUniversalShellState(): UniversalShellState {
    usePerUserIdentity(); // single writer — resolve this render's user.id into every holder first
    return useSyncExternalStore(
        universalShellStore.subscribe,
        universalShellStore.getSnapshot,
        universalShellStore.getServerSnapshot,
    );
}
