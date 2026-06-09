/**
 * Per-user Scribe theme persistence via createLocalStorageStore dynamic-key.
 * Sister-shape to integrationsStore + savedLayoutsStore (Phase-8+ Task 8.10
 * Option β). Andy's theme choice ≠ Lisa's; loads on login.
 *
 * Two stores:
 *  - scribeThemeStore   → the active theme key (string)
 *  - scribeCustomsStore → the user's saved custom themes (key → ScribeColorTheme)
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import type { ScribeColorTheme } from './scribeThemes';

export const scribeThemeUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = scribeThemeUserIdHolder.current;
    return uid ? `scribe-theme:${uid}` : 'scribe-theme:_anonymous';
}

function resolveCustomsKey(): string {
    const uid = scribeThemeUserIdHolder.current;
    return uid ? `scribe-customs:${uid}` : 'scribe-customs:_anonymous';
}

export const scribeThemeStore = createLocalStorageStore<string>({
    key: resolveKey,
    deserializer: (raw) => raw || 'dwellium-default',
    defaultValue: 'dwellium-default',
});

export const scribeCustomsStore = createLocalStorageStore<Record<string, ScribeColorTheme>>({
    key: resolveCustomsKey,
    deserializer: (raw) => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } },
    defaultValue: {},
});

export function saveScribeTheme(name: string): void {
    scribeThemeStore.set(name, () => {
        try { localStorage.setItem(resolveKey(), name); } catch { /* sandboxed */ }
    });
}

export function saveScribeCustoms(customs: Record<string, ScribeColorTheme>): void {
    scribeCustomsStore.set(customs, () => {
        try { localStorage.setItem(resolveCustomsKey(), JSON.stringify(customs)); } catch { /* sandboxed */ }
    });
}
