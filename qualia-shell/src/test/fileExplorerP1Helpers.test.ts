/** Plan 076 P1 — pure helpers for multi-delete and batch failure reporting. */
import { describe, it, expect } from 'vitest';
import { deleteTargets, batchSummary } from '../components/FileExplorer/moveTargets';

describe('deleteTargets', () => {
    it('deletes only the clicked row when it is not in the selection', () => {
        expect(deleteTargets('d.md', ['a.md', 'b.md'])).toEqual(['d.md']);
    });
    it('deletes the whole selection when the clicked row is part of it', () => {
        expect(deleteTargets('b.md', ['a.md', 'b.md', 'c.md'])).toEqual(['a.md', 'b.md', 'c.md']);
    });
    it('drops paths inside an also-selected folder (prefix must be a whole segment)', () => {
        expect(deleteTargets('A', ['A', 'A/x.md', 'AB/y.md', 'A/sub/z.md'])).toEqual(['A', 'AB/y.md']);
    });
    it('single selection behaves like a plain delete', () => {
        expect(deleteTargets('a.md', ['a.md'])).toEqual(['a.md']);
    });
});

describe('batchSummary', () => {
    it('says nothing when all succeeded', () => {
        expect(batchSummary('Moved', 3, 3, [])).toBeNull();
    });
    it('names every failure', () => {
        expect(batchSummary('Moved', 1, 3, ['"a": x', '"b": y'])).toBe('Moved 1 of 3. Not moved:\n"a": x\n"b": y');
    });
});
