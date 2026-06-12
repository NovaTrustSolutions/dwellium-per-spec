/**
 * hiddenWidgetsStore — which widgets are hidden from the sidebar launcher.
 *
 * "Remove a widget" hides it here (+ the caller closes its open windows);
 * "Add a widget" un-hides it from the gallery. Durable via One Save
 * (`withSyncStatic`, objectType 'hidden-widgets') and consistent with the
 * existing global `sidebarGroupsStore` key model.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSyncStatic } from './oneSaveStore';

const KEY = 'dwellium-hidden-widgets';

function deserialize(raw: string | null): string[] {
    if (!raw) return [];
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

export const hiddenWidgetsStore = withSyncStatic(
    createLocalStorageStore<string[]>(
        () => deserialize(localStorage.getItem(KEY)),
        [],
    ),
    { objectType: 'hidden-widgets', storageKey: KEY },
);

function persist(next: string[]): void {
    hiddenWidgetsStore.set(next, () => {
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Hide a widget (component id) from the sidebar. */
export function hideWidget(component: string): void {
    const cur = hiddenWidgetsStore.getSnapshot();
    if (cur.includes(component)) return;
    persist([...cur, component]);
}

/** Un-hide a widget so it reappears in the sidebar. */
export function unhideWidget(component: string): void {
    persist(hiddenWidgetsStore.getSnapshot().filter(c => c !== component));
}

/**
 * Heavy fold: the standalone agent widgets that are retired into the Agent Lab.
 * Hidden from the sidebar by default; still re-addable from the "+ Add widget"
 * gallery (so nothing is lost).
 */
export const FOLDED_AGENT_WIDGETS = ['stella-agent', 'hydra-ai', 'two-brains', 'synthesis', 'hive', 'builder-agents'];
const FOLD_FLAG = 'dwellium-agents-folded-v1';

/** Fold the standalone agents into the Agent Lab once (reversible via the gallery). */
export function foldStandaloneAgentsOnce(): void {
    if (typeof window === 'undefined') return;
    try { if (localStorage.getItem(FOLD_FLAG)) return; } catch { return; }
    const cur = hiddenWidgetsStore.getSnapshot();
    persist(Array.from(new Set([...cur, ...FOLDED_AGENT_WIDGETS])));
    try {
        localStorage.setItem(FOLD_FLAG, '1');
        window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Agents folded into Agent Lab — re-add any from “+ Add widget”.' }));
    } catch { /* */ }
}

/**
 * Terminal retirement — 2026-06-12 (Ilya): "disable the Terminal and all its
 * tabs for now... make terminal a hidden feature." One-shot hide mirroring
 * foldStandaloneAgentsOnce; the HIDDEN DOORS that remain are deliberate:
 * ARA/⌘K "open terminal" (dwelliumCommands alias) and re-adding from the
 * sidebar's "+ Add widget" gallery.
 */
const TERMINAL_HIDE_FLAG = 'dwellium-terminal-hidden-v1';

export function hideTerminalOnce(): void {
    if (typeof window === 'undefined') return;
    try { if (localStorage.getItem(TERMINAL_HIDE_FLAG)) return; } catch { return; }
    hideWidget('terminal');
    try {
        localStorage.setItem(TERMINAL_HIDE_FLAG, '1');
        window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Terminal tucked away — tell ARA “open terminal” when you need it.' }));
    } catch { /* */ }
}

/** Subscribe to the hidden-widgets list (re-renders the sidebar on change). */
export function useHiddenWidgets(): string[] {
    return useSyncExternalStore(
        hiddenWidgetsStore.subscribe,
        hiddenWidgetsStore.getSnapshot,
        hiddenWidgetsStore.getServerSnapshot,
    );
}
