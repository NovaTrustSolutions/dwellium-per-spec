/**
 * docViewerLauncher — the ONE "open this file in Doc Viewer" implementation
 * (P2 item 15, audit: three near-duplicate copies of this dispatch existed at
 * `Shell/Desktop.tsx`, `CommandPalette/CommandPalette.tsx` and the dead
 * `FileManager/FileManager.tsx`).
 *
 * A caller may fire this before DocViewer has mounted (cold-open — the user
 * clicked a file and the window is still spawning), so `requestDocViewerOpen`
 * both writes a global "pending" slot AND dispatches the DOM event, with the
 * same retry schedule the original `Desktop.tsx::openFileInWindow` used
 * (pdf.js/Vite/lazy-loaded DocViewer can still be mounting when the first
 * couple of dispatches land — the window is set before the listener exists).
 * DocViewer drains the pending slot once on mount (`takePendingDocViewerOpen`)
 * and subscribes to the live event for anything dispatched after
 * (`subscribeDocViewerOpen`) — see `components/DocViewer/DocViewer.tsx`.
 */

/** Event name kept stable — some callers may still dispatch it directly. */
export const DOCVIEWER_OPEN_EVENT = 'qualia-docviewer-open-file';

/** Global pending-open slot name kept stable for the same reason. */
const PENDING_SLOT_KEY = '__qualiaDocViewerPendingFile';

export interface DocViewerOpenRequest {
    fileId: string;
    name: string;
    type?: string;
}

type PendingSlotWindow = Window & { [PENDING_SLOT_KEY]?: DocViewerOpenRequest | null };

function pendingWindow(): PendingSlotWindow | null {
    return typeof window === 'undefined' ? null : (window as PendingSlotWindow);
}

/**
 * Sets the pending-open slot and dispatches the open event on the same
 * exponential-backoff retry schedule the pre-unification `Desktop.tsx` used:
 * an initial 250ms delay, then 6 dispatches (attempts 0-5) each doubling the
 * previous 300ms gap. A slow-mounting DocViewer (lazy chunk load, cold
 * window spawn) still has several chances to pick up the live event; the
 * pending slot is the fallback if none of them land before mount.
 */
export function requestDocViewerOpen(req: DocViewerOpenRequest): void {
    const win = pendingWindow();
    if (!win) return;
    win[PENDING_SLOT_KEY] = req;
    const dispatch = (attempt: number) => {
        if (attempt > 5) return;
        // Stop replaying once the request has been consumed: a subscriber (or a mount drain)
        // clears the slot, and re-asking an already-open viewer to open the same file used to
        // reset it, discarding unsaved annotations.
        if (win[PENDING_SLOT_KEY] !== req) return;
        win.dispatchEvent(new CustomEvent<DocViewerOpenRequest>(DOCVIEWER_OPEN_EVENT, { detail: req }));
        win.setTimeout(() => dispatch(attempt + 1), 300 * Math.pow(2, attempt));
    };
    win.setTimeout(() => dispatch(0), 250);
}

/** Reads AND clears the pending-open slot — a fresh DocViewer mount drains it once. */
export function takePendingDocViewerOpen(): DocViewerOpenRequest | null {
    const win = pendingWindow();
    if (!win) return null;
    const pending = win[PENDING_SLOT_KEY] ?? null;
    win[PENDING_SLOT_KEY] = null;
    return pending;
}

/**
 * Subscribes to the live open event. A request consumed this way also clears
 * the pending slot (mirrors the original DocViewer N2 fix) — otherwise a
 * later remount's drain-pending read would reopen the same already-handled
 * request.
 */
export function subscribeDocViewerOpen(cb: (req: DocViewerOpenRequest) => void): () => void {
    const win = pendingWindow();
    if (!win) return () => {};
    const handler = (event: Event) => {
        const detail = (event as CustomEvent<Partial<DocViewerOpenRequest>>).detail;
        if (!detail?.fileId && !detail?.name) return;
        win[PENDING_SLOT_KEY] = null;
        cb(detail as DocViewerOpenRequest);
    };
    win.addEventListener(DOCVIEWER_OPEN_EVENT, handler);
    return () => win.removeEventListener(DOCVIEWER_OPEN_EVENT, handler);
}
