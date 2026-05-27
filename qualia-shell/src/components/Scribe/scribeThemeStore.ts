/**
 * Per-user Scribe theme persistence via createLocalStorageStore dynamic-key.
 * Sister-shape to integrationsStore + savedLayoutsStore (Phase-8+ Task 8.10
 * Option β). Andy's theme choice ≠ Lisa's; loads on login.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

export const scribeThemeUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = scribeThemeUserIdHolder.current;
    return uid ? `scribe-theme:${uid}` : 'scribe-theme:_anonymous';
}

export const scribeThemeStore = createLocalStorageStore<string>({
    key: resolveKey,
    deserializer: (raw) => raw || 'dwellium-default',
    defaultValue: 'dwellium-default',
});

export function saveScribeTheme(name: string): void {
    scribeThemeStore.set(name, () => {
        try { localStorage.setItem(resolveKey(), name); } catch { /* sandboxed */ }
    });
}
