/**
 * Cycle 9 — Workspace → Scribe handoff (decision C9-D1).
 *
 * Unit-tests the pure handoff helpers in `workspaceScribe.ts` with injected side
 * effects, so no real Scribe store or DOM listener is needed. Covers:
 *   - threadFiles / threadHasFiles filter to file-tier children only
 *   - openThreadInScribe opens every file then surfaces the Scribe widget
 *   - a fileless thread opens nothing and does NOT surface the widget
 *   - dispatchOpenWidget fires the `dwellium:open-widget` intent bus event
 */
import { describe, it, expect, vi } from 'vitest';
import {
    threadFiles, threadHasFiles, openThreadInScribe, dispatchOpenWidget,
    type ScribeHandoffDeps,
} from '../components/Workspace/workspaceScribe';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

function thread(children: Partial<FileEntry>[]): FileEntry {
    return {
        name: 'Thread A', path: 'Dom/Proj/Thread A', tier: 'thread',
        children: children.map((c) => ({
            name: c.name ?? 'f', path: c.path ?? 'p', tier: c.tier ?? 'file', ...c,
        })) as FileEntry[],
    };
}

describe('workspaceScribe helpers', () => {
    it('threadFiles keeps only file-tier children, in order', () => {
        const t = thread([
            { name: 'a.md', path: 'Dom/Proj/Thread A/a.md', tier: 'file' },
            { name: 'sub', path: 'Dom/Proj/Thread A/sub', tier: 'folder' },
            { name: 'b.md', path: 'Dom/Proj/Thread A/b.md', tier: 'file' },
        ]);
        expect(threadFiles(t).map((f) => f.name)).toEqual(['a.md', 'b.md']);
        expect(threadHasFiles(t)).toBe(true);
    });

    it('threadHasFiles is false for a thread with no file children', () => {
        expect(threadHasFiles(thread([]))).toBe(false);
        expect(threadHasFiles(thread([{ name: 'sub', tier: 'folder' }]))).toBe(false);
    });

    it('openThreadInScribe opens every file then surfaces the Scribe widget', () => {
        const openFile = vi.fn();
        const openWidget = vi.fn();
        const deps: ScribeHandoffDeps = { openFile, openWidget };
        const t = thread([
            { name: 'a.md', path: 'Dom/Proj/Thread A/a.md', tier: 'file' },
            { name: 'b.md', path: 'Dom/Proj/Thread A/b.md', tier: 'file' },
        ]);

        const n = openThreadInScribe(t, deps);

        expect(n).toBe(2);
        expect(openFile).toHaveBeenCalledTimes(2);
        expect(openFile).toHaveBeenNthCalledWith(1, 'Dom/Proj/Thread A/a.md');
        expect(openFile).toHaveBeenNthCalledWith(2, 'Dom/Proj/Thread A/b.md');
        expect(openWidget).toHaveBeenCalledTimes(1);
        expect(openWidget).toHaveBeenCalledWith('scribe', 'Scribe', 'pen-tool');
    });

    it('a fileless thread opens nothing and never surfaces the widget', () => {
        const openFile = vi.fn();
        const openWidget = vi.fn();
        const n = openThreadInScribe(thread([{ name: 'sub', tier: 'folder' }]), { openFile, openWidget });
        expect(n).toBe(0);
        expect(openFile).not.toHaveBeenCalled();
        expect(openWidget).not.toHaveBeenCalled();
    });

    it('dispatchOpenWidget fires the dwellium:open-widget intent bus event', () => {
        const handler = vi.fn();
        window.addEventListener('dwellium:open-widget', handler);
        try {
            dispatchOpenWidget('scribe', 'Scribe', 'pen-tool');
            expect(handler).toHaveBeenCalledTimes(1);
            const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
            expect(detail).toEqual({ widgetId: 'scribe', label: 'Scribe', icon: 'pen-tool' });
        } finally {
            window.removeEventListener('dwellium:open-widget', handler);
        }
    });
});
