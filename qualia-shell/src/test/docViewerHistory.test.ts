/**
 * Pins P0 item 5's undo/redo coverage of byte mutations (insert/delete/
 * rotate page, baked text edit) — the old undo stack only ever snapshotted
 * the annotation Map, so undo could never restore pdfBytes.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnotationHistory, MAX_UNDOABLE_BYTES, type DocSnapshot } from '../components/DocViewer/useAnnotationHistory';

function snap(pdfBytes: Uint8Array | null): DocSnapshot {
    return { annotations: new Map(), textEdits: [], pdfBytes };
}

describe('useAnnotationHistory', () => {
    it('undo restores a prior pdfBytes snapshot (byte mutation is undoable)', () => {
        const { result } = renderHook(() => useAnnotationHistory());
        const before = new Uint8Array([1, 2, 3]);
        const after = new Uint8Array([4, 5, 6]);

        act(() => result.current.pushHistory(snap(before), true));
        expect(result.current.canUndo).toBe(true);

        let restored: DocSnapshot | null = null;
        act(() => { restored = result.current.undo(snap(after)); });
        expect(restored).not.toBeNull();
        expect(Array.from(restored!.pdfBytes!)).toEqual([1, 2, 3]);
    });

    it('redo restores the state undone', () => {
        const { result } = renderHook(() => useAnnotationHistory());
        const before = new Uint8Array([1]);
        const after = new Uint8Array([2]);

        act(() => result.current.pushHistory(snap(before), true));
        let undone: DocSnapshot | null = null;
        act(() => { undone = result.current.undo(snap(after)); });
        expect(Array.from(undone!.pdfBytes!)).toEqual([1]);

        expect(result.current.canRedo).toBe(true);
        let redone: DocSnapshot | null = null;
        act(() => { redone = result.current.redo(snap(before)); });
        expect(Array.from(redone!.pdfBytes!)).toEqual([2]);
    });

    it('undo/redo on an empty stack returns null and does nothing', () => {
        const { result } = renderHook(() => useAnnotationHistory());
        let restored: DocSnapshot | null = snap(new Uint8Array([9]));
        act(() => { restored = result.current.undo(snap(new Uint8Array([9]))); });
        expect(restored).toBeNull();
        expect(result.current.canUndo).toBe(false);
    });

    it('a new pushHistory after undo clears the redo stack', () => {
        const { result } = renderHook(() => useAnnotationHistory());
        act(() => result.current.pushHistory(snap(new Uint8Array([1])), true));
        act(() => { result.current.undo(snap(new Uint8Array([2]))); });
        expect(result.current.canRedo).toBe(true);

        act(() => result.current.pushHistory(snap(new Uint8Array([3])), true));
        expect(result.current.canRedo).toBe(false);
    });

    it('reset clears both stacks', () => {
        const { result } = renderHook(() => useAnnotationHistory());
        act(() => result.current.pushHistory(snap(new Uint8Array([1])), true));
        act(() => result.current.reset());
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
    });

    it('over the byte ceiling, a byte-changing push warns and is NOT recorded (R1: no annotations/bytes mismatch on undo)', () => {
        // R1 fix: the old behavior pushed the step anyway with pdfBytes:null
        // while keeping the (already re-keyed) annotations/textEdits — an
        // undo then restored pre-mutation annotation keys onto the still
        // post-mutation pdfBytes, corrupting which page content landed on.
        // A step that can't carry its bytes now isn't recorded at all, so
        // undo can never restore annotations/textEdits out of lockstep with
        // pdfBytes.
        const showToast = vi.fn();
        const { result } = renderHook(() => useAnnotationHistory(showToast));
        const huge = new Uint8Array(MAX_UNDOABLE_BYTES + 1);

        act(() => result.current.pushHistory(snap(huge), true));
        expect(showToast).toHaveBeenCalled();
        expect(result.current.canUndo).toBe(false);

        let restored: DocSnapshot | null = null;
        act(() => { restored = result.current.undo(snap(new Uint8Array([1]))); });
        expect(restored).toBeNull();
    });

    it('a non-undoable large byte change clears undo AND redo, so neither can revert it', () => {
        const { result } = renderHook(() => useAnnotationHistory(vi.fn()));
        const small = new Uint8Array([1]);
        const huge = new Uint8Array(MAX_UNDOABLE_BYTES + 1);
        act(() => result.current.pushHistory(snap(small), false)); // annotation step A
        act(() => result.current.pushHistory(snap(huge), false));  // annotation step B
        act(() => { result.current.undo(snap(huge)); });           // B -> redo stack
        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(true);
        act(() => result.current.pushHistory(snap(huge), true));   // non-undoable byte change
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
    });

    it('annotation-only changes (bytesChanged=false) keep bytes even over the ceiling', () => {
        const showToast = vi.fn();
        const { result } = renderHook(() => useAnnotationHistory(showToast));
        const huge = new Uint8Array(MAX_UNDOABLE_BYTES + 1);

        act(() => result.current.pushHistory(snap(huge), false));
        expect(showToast).not.toHaveBeenCalled();

        let restored: DocSnapshot | null = null;
        act(() => { restored = result.current.undo(snap(huge)); });
        expect(restored!.pdfBytes).not.toBeNull();
        expect(restored!.pdfBytes!.length).toBe(MAX_UNDOABLE_BYTES + 1);
    });
});
