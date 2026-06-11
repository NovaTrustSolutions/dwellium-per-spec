/**
 * Hook for reading + switching + EDITING the active Scribe editor theme.
 * Per-user via scribeThemeStore (active key) + scribeCustomsStore (saved
 * custom themes). useEffect applies the resolved theme to all registered
 * CodeMirror views on change.
 *
 * Uses useContext(UserContext) directly for test resilience (not useUser
 * which throws without a provider).
 */
import { useContext, useSyncExternalStore, useEffect } from 'react';
import { UserContext } from '../../context/UserContext';
import {
    scribeThemeStore, scribeCustomsStore, scribeThemeUserIdHolder,
    saveScribeTheme, saveScribeCustoms,
} from './scribeThemeStore';
import { PRESETS, resolveTheme, type ScribeColorTheme, type ScribeTokenKey } from './scribeThemes';
import { applyEditorThemeToAllViews } from './markdownConfig';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';

export function useScribeTheme() {
    const userCtx = useContext(UserContext);
    scribeThemeUserIdHolder.current = userCtx?.user?.id ?? null;

    const themeName = useSyncExternalStore(
        scribeThemeStore.subscribe, scribeThemeStore.getSnapshot, scribeThemeStore.getServerSnapshot,
    );
    const customs = useSyncExternalStore(
        scribeCustomsStore.subscribe, scribeCustomsStore.getSnapshot, scribeCustomsStore.getServerSnapshot,
    );

    const theme = resolveTheme(themeName, customs);

    useEffect(() => {
        applyEditorThemeToAllViews(resolveTheme(themeName, customs));
    }, [themeName, customs]);

    const apply = (name: string, c: Record<string, ScribeColorTheme>) => {
        saveScribeTheme(name);
        applyEditorThemeToAllViews(resolveTheme(name, c));
    };

    return {
        themeName,
        theme,
        presets: PRESETS,
        customs,
        setTheme: (name: string) => apply(name, customs),

        /**
         * Edit one syntax token. Editing a preset forks it into a new custom
         * theme named "{preset} (custom)" and switches to it (matches the
         * manual). Editing an existing custom updates it in place. Live.
         */
        setToken: (key: ScribeTokenKey, color: string) => {
            const base = resolveTheme(themeName, customs);
            const isPreset = !!PRESETS[themeName];
            const targetKey = isPreset ? `${themeName}-custom` : themeName;
            const targetName = isPreset ? `${base.name} (custom)` : base.name;
            const next: ScribeColorTheme = { name: targetName, isCustom: true, tokens: { ...base.tokens, [key]: color } };
            const nextCustoms = { ...customs, [targetKey]: next };
            saveScribeCustoms(nextCustoms);
            apply(targetKey, nextCustoms);
        },

        /** Save the current working theme under a new name as a custom theme. */
        saveCustomAs: (name: string) => {
            const base = resolveTheme(themeName, customs);
            const key = `custom-${slug(name)}`;
            const next: ScribeColorTheme = { name, isCustom: true, tokens: { ...base.tokens } };
            const nextCustoms = { ...customs, [key]: next };
            saveScribeCustoms(nextCustoms);
            apply(key, nextCustoms);
        },

        /** Delete a custom theme (presets cannot be deleted). */
        deleteCustom: (key: string) => {
            if (PRESETS[key]) return;
            const nextCustoms = { ...customs };
            delete nextCustoms[key];
            saveScribeCustoms(nextCustoms);
            if (themeName === key) apply('agenteryx', nextCustoms);
        },
    };
}
