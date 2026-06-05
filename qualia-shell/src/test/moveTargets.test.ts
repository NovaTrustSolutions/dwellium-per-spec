/**
 * File Explorer "Move to…" target helpers (spec §4.3, Move-to-Thread).
 */
import { describe, it, expect } from 'vitest';
import { collectMoveTargets, destFor, parentOf } from '../components/FileExplorer/moveTargets';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

const tree: FileEntry[] = [
    {
        name: 'Acme', path: 'Acme', tier: 'domain', children: [
            {
                name: 'Renovation', path: 'Acme/Renovation', tier: 'project', children: [
                    { name: 'Permits', path: 'Acme/Renovation/Permits', tier: 'thread', children: [] },
                    { name: 'notes.md', path: 'Acme/Renovation/notes.md', tier: 'file' },
                ],
            },
            { name: 'summary.md', path: 'Acme/summary.md', tier: 'file' },
        ],
    },
    { name: 'Archive', path: 'Archive', tier: 'folder', children: [] },
];

describe('collectMoveTargets', () => {
    it('lists every folder-like destination for a file (depth-first)', () => {
        const t = collectMoveTargets(tree, 'Acme/Renovation/notes.md');
        expect(t.map((x) => x.path)).toEqual(['Acme', 'Acme/Renovation', 'Acme/Renovation/Permits', 'Archive']);
        expect(t.find((x) => x.path === 'Acme/Renovation/Permits')?.tier).toBe('thread');
    });

    it('excludes the moving folder and its own subtree', () => {
        const t = collectMoveTargets(tree, 'Acme/Renovation');
        const paths = t.map((x) => x.path);
        expect(paths).toContain('Acme');
        expect(paths).toContain('Archive');
        expect(paths).not.toContain('Acme/Renovation');
        expect(paths).not.toContain('Acme/Renovation/Permits');
    });

    it('never includes file entries', () => {
        const t = collectMoveTargets(tree, 'Archive');
        expect(t.every((x) => x.tier !== 'file')).toBe(true);
    });
});

describe('destFor', () => {
    it('joins folder + name', () => {
        expect(destFor('Acme/Renovation/Permits', 'notes.md')).toBe('Acme/Renovation/Permits/notes.md');
    });
    it('returns bare name for root', () => {
        expect(destFor('', 'notes.md')).toBe('notes.md');
    });
});

describe('parentOf', () => {
    it('returns the parent path', () => {
        expect(parentOf('Acme/Renovation/notes.md')).toBe('Acme/Renovation');
    });
    it('returns empty string for a root entry', () => {
        expect(parentOf('Acme')).toBe('');
    });
});
