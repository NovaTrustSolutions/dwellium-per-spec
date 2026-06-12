/**
 * uiEditStore — 2026-06-12 (Ilya): natural-language UI editor. "Change the
 * header color to yellow" / "move the text container to the right corner"
 * become persisted CSS override rules, applied app-wide via ONE injected
 * <style> tag and surviving reload (per-user dynamic-key factory + One Save —
 * the tabGroupStore sister shape, incl. the v2.72.1 `.reset()` convention).
 *
 * Safety model: every edit is a (selector, css-declarations) pair where the
 * PROPERTIES are whitelisted and the VALUES are sanitized (no url(), no
 * expression(), no braces/semicolons that could escape the rule). Edits are
 * individually toggleable + deletable in the UI Editor panel; "reset" wipes
 * them all. Nothing here touches source styles — it's a reversible overlay.
 */
import { useContext, useEffect, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { UserContext } from '../context/UserContext';

export interface UiEdit {
    id: string;
    /** CSS selector this edit targets (named target or picked element). */
    selector: string;
    /** Human label shown in the panel ("Window headers", "Picked: button…"). */
    label: string;
    /** Whitelisted property → sanitized value. */
    css: Record<string, string>;
    /** The original spoken/typed instruction (for the panel history). */
    instruction: string;
    enabled: boolean;
    createdAt: string;
}

export const uiEditsUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = uiEditsUserIdHolder.current;
    return uid ? `uiedits:${uid}` : 'uiedits:_anonymous';
}

/* ─── Sanitization (the security boundary for LLM-suggested CSS) ─── */

/** Properties the editor may set — layout-safe, presentation-only. */
export const ALLOWED_PROPERTIES = new Set([
    'color', 'background', 'background-color', 'border', 'border-color',
    'border-radius', 'border-width', 'outline', 'box-shadow', 'opacity',
    'font-size', 'font-weight', 'font-family', 'font-style', 'text-align',
    'text-transform', 'letter-spacing', 'line-height', 'text-decoration',
    'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
    'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
    'width', 'max-width', 'min-width', 'height', 'max-height', 'min-height',
    'display', 'visibility', 'justify-content', 'align-items', 'align-self',
    'justify-self', 'gap', 'flex-direction', 'order', 'filter', 'backdrop-filter',
]);

const VALUE_BLOCKLIST = /url\s*\(|expression\s*\(|javascript:|@import|<|>/i;

/** True when a property:value pair is safe to inject. */
export function isSafeDeclaration(prop: string, value: string): boolean {
    const p = prop.trim().toLowerCase();
    const v = value.trim();
    if (!ALLOWED_PROPERTIES.has(p)) return false;
    if (!v || v.length > 200) return false;
    if (VALUE_BLOCKLIST.test(v)) return false;
    if (/[{};]/.test(v)) return false; // cannot escape the declaration
    return true;
}

/** Keep only safe declarations; returns null when nothing survives. */
export function sanitizeCss(css: Record<string, string>): Record<string, string> | null {
    const out: Record<string, string> = {};
    for (const [p, v] of Object.entries(css)) {
        if (isSafeDeclaration(p, v)) out[p.trim().toLowerCase()] = v.trim();
    }
    return Object.keys(out).length > 0 ? out : null;
}

/** Selectors must look like selectors — never raw CSS or HTML. */
export function isSafeSelector(selector: string): boolean {
    const s = selector.trim();
    if (!s || s.length > 300) return false;
    if (/[{}@<>]/.test(s)) return false;
    try { document.createDocumentFragment().querySelector(s); } catch { return false; }
    return true;
}

/* ─── Store ─── */

function isEdit(e: unknown): e is UiEdit {
    return !!e
        && typeof (e as UiEdit).id === 'string'
        && typeof (e as UiEdit).selector === 'string'
        && typeof (e as UiEdit).css === 'object';
}

function deserialize(raw: string | null): UiEdit[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isEdit).map((e): UiEdit => ({
            id: e.id,
            selector: e.selector,
            label: typeof e.label === 'string' ? e.label : e.selector,
            css: sanitizeCss(e.css || {}) ?? {},
            instruction: typeof e.instruction === 'string' ? e.instruction : '',
            enabled: e.enabled !== false,
            createdAt: typeof e.createdAt === 'string' ? e.createdAt : '',
        })).filter(e => Object.keys(e.css).length > 0);
    } catch {
        return [];
    }
}

export const uiEditStore = withSync(
    createLocalStorageStore<UiEdit[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'ui-edits', holder: uiEditsUserIdHolder, resolveKey },
);

function persist(next: UiEdit[]): void {
    uiEditStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
    applyUiEditsToDocument(next);
}

/* ─── Style injection (the single overlay <style> tag) ─── */

const STYLE_TAG_ID = 'dwellium-ui-edits';

/** Render the edits to CSS text. `!important` so overrides beat source styles. */
export function buildCssText(edits: UiEdit[]): string {
    return edits
        .filter(e => e.enabled && isSafeSelectorLazy(e.selector))
        .map(e => {
            const body = Object.entries(e.css)
                .filter(([p, v]) => isSafeDeclaration(p, v))
                .map(([p, v]) => `  ${p}: ${v} !important;`)
                .join('\n');
            return body ? `${e.selector} {\n${body}\n}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
}

// document-free guard for tests / SSR (buildCssText must stay pure).
function isSafeSelectorLazy(selector: string): boolean {
    if (typeof document === 'undefined') return !/[{}@<>]/.test(selector) && selector.trim().length > 0 && selector.length <= 300;
    return isSafeSelector(selector);
}

/** Create/update the overlay style tag. No-op on SSR. */
export function applyUiEditsToDocument(edits?: UiEdit[]): void {
    if (typeof document === 'undefined') return;
    const list = edits ?? uiEditStore.getSnapshot();
    let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!tag) {
        tag = document.createElement('style');
        tag.id = STYLE_TAG_ID;
        document.head.appendChild(tag);
    }
    tag.textContent = buildCssText(list);
}

/* ─── Mutators ─── */

function newEditId(): string {
    return `ue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Add an edit (sanitized). Returns null when nothing safe survives. */
export function addUiEdit(input: { selector: string; label: string; css: Record<string, string>; instruction: string }): UiEdit | null {
    const css = sanitizeCss(input.css);
    if (!css) return null;
    const edit: UiEdit = {
        id: newEditId(),
        selector: input.selector,
        label: input.label,
        css,
        instruction: input.instruction,
        enabled: true,
        createdAt: new Date().toISOString(),
    };
    persist([...uiEditStore.getSnapshot(), edit]);
    return edit;
}

export function toggleUiEdit(id: string): void {
    persist(uiEditStore.getSnapshot().map(e => (e.id === id ? { ...e, enabled: !e.enabled } : e)));
}

export function removeUiEdit(id: string): void {
    persist(uiEditStore.getSnapshot().filter(e => e.id !== id));
}

/** Undo the most recent edit. Returns the removed edit (or null). */
export function undoLastUiEdit(): UiEdit | null {
    const list = uiEditStore.getSnapshot();
    if (list.length === 0) return null;
    const last = list[list.length - 1];
    persist(list.slice(0, -1));
    return last;
}

/** Wipe all edits (the "reset my UI" escape hatch). */
export function clearUiEdits(): void {
    persist([]);
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetUiEdits(): void {
    uiEditStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

/* ─── Hooks (tabGroupStore sister shape) ─── */

/** Panel hook: holder set during render BEFORE useSyncExternalStore reads. */
export function useUiEdits() {
    const userCtx = useContext(UserContext);
    uiEditsUserIdHolder.current = userCtx?.user?.id ?? null;
    const edits = useSyncExternalStore(
        uiEditStore.subscribe,
        uiEditStore.getSnapshot,
        uiEditStore.getServerSnapshot,
    );
    return { edits, addUiEdit, toggleUiEdit, removeUiEdit, undoLastUiEdit, clearUiEdits };
}

/**
 * Shell-level applier: keeps the overlay <style> tag in sync with the store
 * even when the panel was never opened (edits persist across reloads). Mount
 * ONCE near the top of the authed tree (AdminShell).
 */
export function useApplyUiEdits(): void {
    const userCtx = useContext(UserContext);
    uiEditsUserIdHolder.current = userCtx?.user?.id ?? null;
    const edits = useSyncExternalStore(
        uiEditStore.subscribe,
        uiEditStore.getSnapshot,
        uiEditStore.getServerSnapshot,
    );
    useEffect(() => { applyUiEditsToDocument(edits); }, [edits]);
}
