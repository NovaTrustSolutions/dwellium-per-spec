/**
 * scribeMemory — plan 055 phase 2: Scribe reopens at its exact point.
 *
 * View state only (the documents themselves live in the backend + the
 * scribe-local-files cache): the open-tab list, the active file, and a
 * per-file { scrollTop, cursor } record. All of it rides the shared
 * `widgetMemory` per-user store under the 'scribe' slice.
 *
 * Restore is tolerant by construction: a remembered file that no longer
 * exists simply fails its `openFile` (error surfaced by the store's normal
 * offline/404 path) and the rest of the session still comes back.
 */
import { patchWidgetMemory, readWidgetMemory } from '../../lib/widgetMemory';
import { useScribeStore } from './scribeStore';

export interface ScribeFileView { scrollTop: number; cursor: number }

export const SCRIBE_MEM_DEFAULTS = {
    openFilepaths: [] as string[],
    activeFilepath: null as string | null,
    fileView: {} as Record<string, ScribeFileView>,
};

/** Remember one file's scroll + cursor (live capture — debounced by widgetMemory). */
export function captureScribeView(filepath: string, scrollTop: number, cursor: number): void {
    const fileView = { ...readWidgetMemory('scribe', SCRIBE_MEM_DEFAULTS).fileView, [filepath]: { scrollTop, cursor } };
    patchWidgetMemory('scribe', { fileView });
}

/** The remembered scroll/cursor for a file, or null. */
export function readScribeView(filepath: string | null): ScribeFileView | null {
    if (!filepath) return null;
    const v = readWidgetMemory('scribe', SCRIBE_MEM_DEFAULTS).fileView[filepath];
    return v && typeof v.scrollTop === 'number' ? { scrollTop: v.scrollTop, cursor: typeof v.cursor === 'number' ? v.cursor : 0 } : null;
}

/**
 * Reopen the remembered tabs + active file. No-op when the in-memory session
 * already has open files (widget remount within a session) or nothing is
 * remembered. Deleted files fail their individual open and are skipped.
 */
export async function restoreScribeSession(): Promise<void> {
    if (useScribeStore.getState().openFiles.length > 0) return;
    const mem = readWidgetMemory('scribe', SCRIBE_MEM_DEFAULTS);
    const remembered = mem.openFilepaths.filter((p): p is string => typeof p === 'string' && p.length > 0);
    if (remembered.length === 0) return;
    for (const filepath of remembered) {
        await useScribeStore.getState().openFile(filepath);
    }
    const s = useScribeStore.getState();
    if (mem.activeFilepath && s.openFiles.some(f => f.filepath === mem.activeFilepath)) {
        s.setActiveFile(mem.activeFilepath);
    }
}

/** Subscribe: keep the remembered tab list + active file in step with the store. */
export function trackScribeSession(): () => void {
    return useScribeStore.subscribe((s) => {
        patchWidgetMemory('scribe', {
            openFilepaths: s.openFiles.map(f => f.filepath),
            activeFilepath: s.activeFilepath,
        });
    });
}
