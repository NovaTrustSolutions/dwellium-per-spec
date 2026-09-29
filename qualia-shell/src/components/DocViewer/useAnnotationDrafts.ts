/**
 * DocViewer — P3 item 16d: annotation drafts sidecar (autosave-in-progress
 * markup, restorable after a crash/reload/accidental close).
 *
 * Backend contract (ai-dashboard369-file-manager/src/routes/fileRoutes.ts,
 * see DOCVIEWER_FIX_PLAN.md "P3 contract — annotation drafts sidecar"):
 *   GET    /api/files/:fileId/annotations -> 200 {success:true, data:{fileId,
 *          annotations, baseSize, baseUpdatedAt, updatedBy, updatedAt}} or
 *          404 {success:false, error:'No draft'}.
 *   PUT    /api/files/:fileId/annotations  JSON {annotations, baseSize,
 *          baseUpdatedAt} -> 200 with the stored record.
 *   DELETE /api/files/:fileId/annotations -> 200 {success:true}, idempotent.
 *
 * `annotations` is opaque JSON the viewer owns — the server never interprets
 * it. AnnotationMap (a Map) doesn't survive JSON.stringify on its own, so
 * this hook serializes it to `[page, Annotation[]][]` on the wire and
 * reconstructs a Map on the way back.
 *
 * Contract this hook implements (never violates):
 *   - Offer restore/discard ONLY when the draft's baseSize/baseUpdatedAt
 *     still match the file that's open right now — never apply a draft
 *     silently onto a file it wasn't taken from.
 *   - Debounced autosave (~1.5s) while there is markup (non-empty
 *     annotations) — not on every keystroke/pointermove.
 *   - DELETE the draft after a successful Save Back (clearAfterSave).
 *   - A failed draft write (PUT/DELETE) never blocks or breaks anything else
 *     — caught, toasted, and otherwise ignored.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { AnnotationMap, Annotation } from './docViewerTypes';

const AUTOSAVE_DEBOUNCE_MS = 1500;

type WireAnnotations = Array<[number, Annotation[]]>;

function toWire(map: AnnotationMap): WireAnnotations {
    return Array.from(map.entries());
}

function fromWire(wire: unknown): AnnotationMap | null {
    if (!Array.isArray(wire)) return null;
    try {
        return new Map(wire as WireAnnotations);
    } catch {
        return null;
    }
}

function hasMarkup(map: AnnotationMap): boolean {
    for (const list of map.values()) {
        if (list.length > 0) return true;
    }
    return false;
}

export interface UseAnnotationDraftsOptions {
    /** `${API_BASE}/api/files` — this hook appends `/:fileId/annotations`. */
    apiFilesBase: string;
    fileId: string | null;
    /** The file's OWN size/updatedAt at open time (not the live pdfBytes
     * length, which changes with every page insert/delete/rotate) — the
     * fingerprint a draft is checked against. */
    baseSize: number | null;
    baseUpdatedAt: string | null;
    annotations: AnnotationMap;
    /** Gates the initial GET and all autosaves — false while the document is
     * still loading/resetting (fileId/baseSize churn during that window). */
    ready: boolean;
    showToast: (msg: string) => void;
}

export interface UseAnnotationDrafts {
    /** A restorable draft's annotations, or null when there's nothing to
     * offer (no draft, or its base no longer matches this file). */
    pendingRestore: AnnotationMap | null;
    /** Applies pendingRestore and clears the offer. Returns what to apply
     * (null if there was nothing pending — defensive). */
    restoreDraft: () => AnnotationMap | null;
    /** Dismisses the offer AND deletes the server-side draft (an explicit
     * "no, don't keep this" — not the same as just navigating away). */
    discardDraft: () => void;
    /** Deletes the draft after a successful Save Back. Never throws — a
     * failed delete is toasted and otherwise ignored, so it can never break
     * the save that already succeeded. */
    clearAfterSave: () => Promise<void>;
}

export function useAnnotationDrafts(opts: UseAnnotationDraftsOptions): UseAnnotationDrafts {
    const { apiFilesBase, fileId, baseSize, baseUpdatedAt, annotations, ready, showToast } = opts;

    const [pendingRestore, setPendingRestore] = useState<AnnotationMap | null>(null);
    const draftUrl = fileId ? `${apiFilesBase}/${fileId}/annotations` : null;
    // Guards the initial-load GET so it only ever fires once per opened file
    // (StrictMode double-effects / re-renders with the same fileId must not
    // re-fetch and re-offer an already-dismissed/restored prompt).
    const checkedFileRef = useRef<string | null>(null);
    // R1/R3 (adversarial review): Save Back re-bakes the annotations into the
    // PDF and calls setSelectedFile with the NEW baseSize/baseUpdatedAt —
    // which changes this hook's own deps and re-fires the autosave effect
    // below in the SAME tick clearAfterSave() DELETEs the draft. `annotations`
    // still has markup (Save Back never clears it — the user keeps editing),
    // so without this guard the autosave effect immediately re-PUTs the exact
    // content that was just saved+deleted, silently recreating a "draft" for
    // content that's already durably baked into the file. Tracks the wire
    // snapshot of what clearAfterSave last saw so the autosave effect can
    // skip re-arming for that SAME content — any further edit changes the
    // snapshot and autosave resumes normally.
    const lastSavedWireRef = useRef<string | null>(null);
    const annotationsRef = useRef(annotations);
    annotationsRef.current = annotations;

    // ---- Load: offer restore only when the draft's base matches ----
    useEffect(() => {
        if (!ready || !draftUrl || !fileId || baseSize == null || baseUpdatedAt == null) return;
        if (checkedFileRef.current === fileId) return;
        checkedFileRef.current = fileId;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(draftUrl);
                if (cancelled) return;
                if (res.status === 404) return; // no draft — nothing to offer
                if (!res.ok) return;
                const json = await res.json();
                const data = json?.data;
                if (!data || cancelled) return;
                if (data.baseSize !== baseSize || data.baseUpdatedAt !== baseUpdatedAt) {
                    // Base moved on (a newer save happened since the draft was
                    // written) — never apply this onto the CURRENT file.
                    return;
                }
                const restored = fromWire(data.annotations);
                if (restored) setPendingRestore(restored);
            } catch {
                // Backend unreachable — a draft is a convenience, not a
                // load-blocking dependency. Silently skip.
            }
        })();
        return () => { cancelled = true; };
    }, [ready, draftUrl, fileId, baseSize, baseUpdatedAt]);

    // Reset the per-file guard (and any stale prompt) when the open file changes.
    useEffect(() => {
        checkedFileRef.current = null;
        setPendingRestore(null);
        lastSavedWireRef.current = null;
    }, [fileId]);

    const restoreDraft = useCallback((): AnnotationMap | null => {
        const draft = pendingRestore;
        setPendingRestore(null);
        return draft;
    }, [pendingRestore]);

    const discardDraft = useCallback(() => {
        setPendingRestore(null);
        if (!draftUrl) return;
        fetch(draftUrl, { method: 'DELETE' }).catch(() => {
            // Best-effort — the prompt is already dismissed either way.
        });
    }, [draftUrl]);

    const clearAfterSave = useCallback(async (): Promise<void> => {
        // R1/R3: remember what this save covered BEFORE the DELETE settles —
        // the autosave effect below compares against this to avoid
        // re-creating a draft for content that's already baked in.
        lastSavedWireRef.current = JSON.stringify(toWire(annotationsRef.current));
        if (!draftUrl) return;
        try {
            await fetch(draftUrl, { method: 'DELETE' });
        } catch {
            // Contract: a failed draft write never blocks or breaks a save —
            // the save already succeeded by the time this runs.
            showToast('Saved, but the pending draft could not be cleared');
        }
    }, [draftUrl, showToast]);

    // ---- Autosave: debounced ~1.5s while there is markup ----
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!ready || !draftUrl || baseSize == null || baseUpdatedAt == null) return;
        if (!hasMarkup(annotations)) return;
        // Don't autosave over a still-undecided restore offer — the user
        // hasn't said whether to keep the EXISTING draft yet, and the
        // in-memory `annotations` at this point may just be the empty/blank
        // state from before they choose (never apply silently applies here
        // too: don't silently overwrite either).
        if (pendingRestore) return;
        // R1/R3: skip re-arming for the EXACT content a Save Back just
        // cleared — it's already durably baked into the saved file. A
        // further edit changes the wire snapshot and autosave resumes.
        if (lastSavedWireRef.current !== null && JSON.stringify(toWire(annotations)) === lastSavedWireRef.current) {
            return;
        }

        debounceRef.current = setTimeout(() => {
            void fetch(draftUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ annotations: toWire(annotations), baseSize, baseUpdatedAt }),
            }).catch(() => {
                // Contract: a failing draft write never blocks or breaks
                // anything else in the viewer — silently retried on the next
                // annotation change instead of surfacing every transient failure.
            });
        }, AUTOSAVE_DEBOUNCE_MS);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [ready, draftUrl, baseSize, baseUpdatedAt, annotations, pendingRestore]);

    return { pendingRestore, restoreDraft, discardDraft, clearAfterSave };
}
