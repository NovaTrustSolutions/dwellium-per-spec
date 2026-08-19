/**
 * demoWorkspaceStore — per-user runtime flag that routes Strata + Astra through
 * the static data layer (`strataApi.static.ts`: `public/data/*.json` reads,
 * writes sandboxed in `localStorage['dwellium-changes-*']`).
 *
 * Plan 046 D1. Default OFF (new store ⇒ "no value" for every existing account;
 * default-ON would swap a real portfolio for seeds). Durable via One Save like
 * `hiddenWidgetsStore`. Toggle lives in Settings → Data; the Strata empty state
 * offers "Try with demo data" in one click.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSyncStatic } from './oneSaveStore';

const KEY = 'dwellium-demo-workspace';

export const demoWorkspaceStore = withSyncStatic(
    createLocalStorageStore<boolean>(
        () => typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'true',
        false,
    ),
    { objectType: 'demo-workspace', storageKey: KEY },
);

/** Call-time predicate for the strataApi router (never cached by callers). */
export const isDemoWorkspace = (): boolean => demoWorkspaceStore.getSnapshot();

export function setDemoWorkspace(on: boolean): void {
    demoWorkspaceStore.set(on, () => {
        try { localStorage.setItem(KEY, String(on)); } catch { /* sandboxed */ }
    });
}

export function useDemoWorkspace(): boolean {
    return useSyncExternalStore(
        demoWorkspaceStore.subscribe,
        demoWorkspaceStore.getSnapshot,
        demoWorkspaceStore.getServerSnapshot,
    );
}
