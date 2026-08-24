/**
 * dictationHotkeyStore — plan 053 "Dictation to 100%" target 4: the built-in
 * (non-Mac / no-install) dictation hotkey, persisted PER USER.
 *
 * Default ⌥D; configurable in the Control Panel Dictation card. Storage rides
 * the repo-standard `createLocalStorageStore` dynamic-key factory (sister to
 * goalsStore) with its own identity holder. The holder is written ONLY by
 * `useDictationIdentity()` from the raw `user.id` in UserContext — a single
 * value derived from a single context, so the #185 disagreeing-writers loop
 * (FUCKUPS F-015) cannot occur.
 */
import { useContext, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { UserContext } from '../context/UserContext';

export interface DictationHotkey {
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    /** KeyboardEvent.code — layout-independent (⌥D types '∂' on macOS, so `key` is unusable). */
    code: string;
}

export const DEFAULT_DICTATION_HOTKEY: DictationHotkey = {
    altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, code: 'KeyD',
};

/** Per-user identity holder (raw `user.id`, or null → `_anonymous`). */
export const dictationUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    return `dictation-hotkey:${dictationUserIdHolder.current ?? '_anonymous'}`;
}

function isHotkey(h: unknown): h is DictationHotkey {
    const k = h as DictationHotkey;
    return !!k && typeof k.code === 'string' && k.code.length > 0
        && typeof k.altKey === 'boolean' && typeof k.ctrlKey === 'boolean'
        && typeof k.metaKey === 'boolean' && typeof k.shiftKey === 'boolean';
}

function deserialize(raw: string | null): DictationHotkey {
    if (!raw) return DEFAULT_DICTATION_HOTKEY;
    try {
        const parsed = JSON.parse(raw) as unknown;
        return isHotkey(parsed) ? parsed : DEFAULT_DICTATION_HOTKEY;
    } catch {
        return DEFAULT_DICTATION_HOTKEY;
    }
}

export const dictationHotkeyStore = createLocalStorageStore<DictationHotkey>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: DEFAULT_DICTATION_HOTKEY,
});

export function setDictationHotkey(hk: DictationHotkey): void {
    dictationHotkeyStore.set(hk, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(hk)); } catch { /* sandboxed */ }
    });
}

/**
 * Write the active user's raw id into the holder DURING render, before any
 * `useSyncExternalStore` read (perUserIdentity.ts pattern). Reads the raw
 * context (not `useUser()`) so it degrades to `_anonymous` with no provider.
 */
export function useDictationIdentity(): void {
    const userCtx = useContext(UserContext);
    dictationUserIdHolder.current = userCtx?.user?.id ?? null;
}

export function useDictationHotkey(): DictationHotkey {
    return useSyncExternalStore(
        dictationHotkeyStore.subscribe,
        dictationHotkeyStore.getSnapshot,
        dictationHotkeyStore.getServerSnapshot,
    );
}

/** True when the keydown event is exactly the configured hotkey. */
export function matchesHotkey(e: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'code'>, hk: DictationHotkey): boolean {
    return e.code === hk.code && e.altKey === hk.altKey && e.ctrlKey === hk.ctrlKey
        && e.metaKey === hk.metaKey && e.shiftKey === hk.shiftKey;
}

const MODIFIER_CODES = /^(Alt|Control|Shift|Meta|OS)(Left|Right)?$/;

/**
 * Turn a keydown into a hotkey candidate, or null when unusable: modifier-only
 * presses and unmodified keys (which would hijack normal typing) are rejected.
 */
export function eventToHotkey(e: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'code'>): DictationHotkey | null {
    if (!e.code || MODIFIER_CODES.test(e.code)) return null;
    if (!e.altKey && !e.ctrlKey && !e.metaKey) return null;
    return { altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, code: e.code };
}

/** Human label, mac-style: ⌃⌥⇧⌘ + key ('KeyD' → 'D', 'Digit1' → '1'). */
export function formatHotkey(hk: DictationHotkey): string {
    const key = hk.code.startsWith('Key') ? hk.code.slice(3)
        : hk.code.startsWith('Digit') ? hk.code.slice(5)
            : hk.code;
    return `${hk.ctrlKey ? '⌃' : ''}${hk.altKey ? '⌥' : ''}${hk.shiftKey ? '⇧' : ''}${hk.metaKey ? '⌘' : ''}${key}`;
}
