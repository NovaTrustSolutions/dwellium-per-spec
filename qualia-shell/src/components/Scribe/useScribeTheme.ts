/**
 * Hook for reading + switching the active Scribe editor theme. Per-user
 * via scribeThemeStore dynamic-key. useEffect applies the theme to all
 * registered CodeMirror views on change.
 *
 * Uses useContext(UserContext) directly for test resilience (not useUser
 * which throws without a provider).
 */
import { useContext, useSyncExternalStore, useEffect } from 'react';
import { UserContext } from '../../context/UserContext';
import { scribeThemeStore, scribeThemeUserIdHolder, saveScribeTheme } from './scribeThemeStore';
import { PRESETS, DWELLIUM_DEFAULT, resolveTheme } from './scribeThemes';
import { applyEditorThemeToAllViews } from './markdownConfig';

export function useScribeTheme() {
    const userCtx = useContext(UserContext);
    scribeThemeUserIdHolder.current = userCtx?.user?.id ?? null;

    const themeName = useSyncExternalStore(
        scribeThemeStore.subscribe,
        scribeThemeStore.getSnapshot,
        scribeThemeStore.getServerSnapshot,
    );

    useEffect(() => {
        const theme = resolveTheme(themeName, {});
        applyEditorThemeToAllViews(theme);
    }, [themeName]);

    return {
        themeName,
        theme: resolveTheme(themeName, {}),
        presets: PRESETS,
        setTheme: (name: string) => {
            saveScribeTheme(name);
            const theme = resolveTheme(name, {});
            applyEditorThemeToAllViews(theme);
        },
    };
}
