/**
 * workspaceScribe — the Workspace → Scribe "open in Scribe" handoff (decision D4 / C9-D1).
 *
 * Holocron's `loadThreadForPath()` opened a thread's docs in the editor and moved the
 * active Domaine/Project/Thread. Dwellium's analog is intentionally MINIMAL and
 * DECOUPLED: a thread is a folder, so opening it in Scribe means opening each of its
 * file-tier children as Scribe tabs (`scribeStore.openFile` is idempotent — it dedupes
 * by filepath), then asking the shell to surface the Scribe widget via the existing
 * cross-widget intent bus (`dwellium:open-widget`, WindowContext.tsx:447). Using the
 * event bus instead of `useWindows()` keeps Workspace free of a WindowProvider
 * dependency (so it stays test-friendly) and makes the whole handoff trivially
 * removable (decision C9-D1).
 *
 * Path-namespace assumption: the file-explorer tree path (`FileEntry.path`) and the
 * Scribe file path (`/api/scribe/files/:path`) address the SAME per-user filesystem
 * root, so a relative path is portable between them. If the sibling backend ever
 * diverges those roots, the handoff degrades gracefully — `openFile` surfaces a
 * Scribe-side error rather than throwing here.
 *
 * The two side effects are injected as `deps` so this is unit-testable without a real
 * Scribe store or a DOM event listener.
 */
import type { FileEntry } from '../FileExplorer/FileExplorerCell';

export interface ScribeHandoffDeps {
    /** Open one file as a Scribe tab (idempotent). */
    openFile: (filepath: string) => void | Promise<void>;
    /** Ask the shell to open/focus a widget by id. */
    openWidget: (widgetId: string, label?: string, icon?: string) => void;
}

/** The file-tier children of a thread folder, in tree order. */
export function threadFiles(thread: FileEntry): FileEntry[] {
    return (thread.children ?? []).filter((c) => c.tier === 'file');
}

/** True when a thread has at least one file to hand off to Scribe. */
export function threadHasFiles(thread: FileEntry): boolean {
    return threadFiles(thread).length > 0;
}

/**
 * Open every file in `thread` as a Scribe tab, then surface the Scribe widget.
 * Returns the number of files handed off (0 = nothing opened, widget not surfaced).
 */
export function openThreadInScribe(thread: FileEntry, deps: ScribeHandoffDeps): number {
    const files = threadFiles(thread);
    if (files.length === 0) return 0;
    for (const f of files) {
        void deps.openFile(f.path);
    }
    deps.openWidget('scribe', 'Scribe', 'pen-tool');
    return files.length;
}

/** Default `openWidget` impl: fire the shell's cross-widget intent bus. */
export function dispatchOpenWidget(widgetId: string, label?: string, icon?: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
        new CustomEvent('dwellium:open-widget', { detail: { widgetId, label, icon } }),
    );
}
