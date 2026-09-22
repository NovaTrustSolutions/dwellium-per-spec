/**
 * DocViewer — undo/redo history covering annotations, text edits AND pdf
 * byte mutations (insert/delete/rotate page, text-edit bake).
 *
 * P0 item 5: the old undo stack only snapshotted the annotation Map, so
 * undo could not reverse a page insert/delete/rotate or a baked text edit.
 * This hook snapshots `{ annotations, textEdits, pdfBytes }` together so a
 * single undo restores all three in lockstep.
 */
import { useCallback, useState } from 'react';
import type { AnnotationMap, TextEdit } from './docViewerTypes';

export interface DocSnapshot {
    annotations: AnnotationMap;
    textEdits: TextEdit[];
    pdfBytes: Uint8Array | null;
}

// ponytail: fixed 25 MB ceiling on a SINGLE history entry's bytes (not a
// rolling budget across the whole stack). Good enough for single-user
// desktop PDFs; upgrade to a real byte budget / diff-based snapshots if a
// workflow with routinely-huge PDFs + long undo chains shows up.
export const MAX_UNDOABLE_BYTES = 25 * 1024 * 1024;
const MAX_HISTORY_DEPTH = 30;

function cloneAnnotations(map: AnnotationMap): AnnotationMap {
    const next: AnnotationMap = new Map();
    map.forEach((list, page) => next.set(page, [...list]));
    return next;
}

function cloneSnapshot(snap: DocSnapshot): DocSnapshot {
    return {
        annotations: cloneAnnotations(snap.annotations),
        textEdits: [...snap.textEdits],
        pdfBytes: snap.pdfBytes,
    };
}

export interface UseAnnotationHistory {
    canUndo: boolean;
    canRedo: boolean;
    /** Call BEFORE applying a mutation, with the state as it is right now. */
    pushHistory: (current: DocSnapshot, bytesChanged: boolean) => void;
    /** Returns the snapshot to restore, or null if there's nothing to undo. */
    undo: (current: DocSnapshot) => DocSnapshot | null;
    /** Returns the snapshot to restore, or null if there's nothing to redo. */
    redo: (current: DocSnapshot) => DocSnapshot | null;
    reset: () => void;
}

export function useAnnotationHistory(showToast?: (msg: string) => void): UseAnnotationHistory {
    const [undoStack, setUndoStack] = useState<DocSnapshot[]>([]);
    const [redoStack, setRedoStack] = useState<DocSnapshot[]>([]);

    // R1 (adversarial review): a step whose pre-mutation bytes are over the
    // ceiling used to be pushed anyway with pdfBytes:null, kept alongside
    // the (already re-keyed) annotations/textEdits — undoing it then
    // restored PRE-mutation annotation page-keys onto the STILL-POST-mutation
    // pdfBytes, corrupting which page an annotation/edit landed on. A step
    // that can't carry its bytes now isn't pushed at all: undo skips straight
    // past it to the last entry that CAN be restored consistently, so
    // annotations/textEdits and pdfBytes never restore out of lockstep.
    const pushHistory = useCallback((current: DocSnapshot, bytesChanged: boolean) => {
        const bytesTooBig = !!current.pdfBytes && current.pdfBytes.length > MAX_UNDOABLE_BYTES;
        if (bytesChanged && bytesTooBig) {
            // ponytail: over the ceiling a byte change is not snapshotted. Clear BOTH stacks so
            // neither undo nor redo can jump back across it (older entries hold older bytes and
            // would silently revert the change the toast just called permanent).
            setUndoStack([]);
            setRedoStack([]);
            showToast?.('Large document — this change cannot be undone, so undo history was cleared');
            return;
        }
        setUndoStack(prev => [...prev.slice(-(MAX_HISTORY_DEPTH - 1)), cloneSnapshot(current)]);
        setRedoStack([]);
    }, [showToast]);

    const undo = useCallback((current: DocSnapshot): DocSnapshot | null => {
        if (undoStack.length === 0) return null;
        const popped = undoStack[undoStack.length - 1];
        setUndoStack(prev => prev.slice(0, -1));
        setRedoStack(prev => [...prev, cloneSnapshot(current)]);
        return popped;
    }, [undoStack]);

    const redo = useCallback((current: DocSnapshot): DocSnapshot | null => {
        if (redoStack.length === 0) return null;
        const popped = redoStack[redoStack.length - 1];
        setRedoStack(prev => prev.slice(0, -1));
        setUndoStack(prev => [...prev, cloneSnapshot(current)]);
        return popped;
    }, [redoStack]);

    const reset = useCallback(() => {
        setUndoStack([]);
        setRedoStack([]);
    }, []);

    return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, pushHistory, undo, redo, reset };
}
