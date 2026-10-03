import { describe, it, expect } from 'vitest';
import { navKey, visibleRows } from '../components/FileExplorer/treeNav';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

const f = (path: string): FileEntry => ({ name: path.split('/').pop()!, path, tier: 'file' });
const d = (path: string, children?: FileEntry[]): FileEntry => ({ name: path.split('/').pop()!, path, tier: 'folder', children });

const tree: FileEntry[] = [
    d('A', [f('A/a1.md'), d('A/S', [f('A/S/x.md')]), d('A/b', [f('A/b/y.md')])]),
    d('B', [f('B/z.md')]),
    d('E', []),
    f('f.md'),
];
const expandedMap = { A: true, 'A/S': true, E: true };
const rows = visibleRows(tree, expandedMap);

describe('visibleRows', () => {
    it('lists depth-first, children only when expanded, with parents', () => {
        expect(rows.map((r) => [r.path, r.parent, r.expanded, r.isFolder])).toEqual([
            ['A', null, true, true],
            ['A/a1.md', 'A', false, false],
            ['A/S', 'A', true, true],
            ['A/S/x.md', 'A/S', false, false],
            ['A/b', 'A', false, true],
            ['B', null, false, true],
            ['E', null, true, true],
            ['f.md', null, false, false],
        ]);
    });
    it('collapsed map hides everything below root', () => {
        expect(visibleRows(tree, {}).map((r) => r.path)).toEqual(['A', 'B', 'E', 'f.md']);
    });
    it('a file flagged expanded stays not-expanded; empty input gives []', () => {
        expect(visibleRows([f('q')], { q: true })[0].expanded).toBe(false);
        expect(visibleRows([], {})).toEqual([]);
    });
});

// [current, key, expected]
const cases: [string, string, unknown][] = [
    // ArrowDown
    ['A', 'ArrowDown', { focus: 'A/a1.md' }],
    ['A/b', 'ArrowDown', { focus: 'B' }],
    ['f.md', 'ArrowDown', null],
    // ArrowUp
    ['A/a1.md', 'ArrowUp', { focus: 'A' }],
    ['A', 'ArrowUp', null],
    ['B', 'ArrowUp', { focus: 'A/b' }],
    // ArrowRight
    ['B', 'ArrowRight', { toggle: 'B' }],
    ['A/b', 'ArrowRight', { toggle: 'A/b' }],
    ['A', 'ArrowRight', { focus: 'A/a1.md' }],
    ['A/S', 'ArrowRight', { focus: 'A/S/x.md' }],
    ['E', 'ArrowRight', null],
    ['f.md', 'ArrowRight', null],
    ['A/a1.md', 'ArrowRight', null],
    // ArrowLeft
    ['A', 'ArrowLeft', { toggle: 'A' }],
    ['A/S', 'ArrowLeft', { toggle: 'A/S' }],
    ['A/b', 'ArrowLeft', { focus: 'A' }],
    ['A/S/x.md', 'ArrowLeft', { focus: 'A/S' }],
    ['A/a1.md', 'ArrowLeft', { focus: 'A' }],
    ['B', 'ArrowLeft', null],
    ['f.md', 'ArrowLeft', null],
    // Home / End
    ['A/S/x.md', 'Home', { focus: 'A' }],
    ['A', 'Home', { focus: 'A' }],
    ['A/S/x.md', 'End', { focus: 'f.md' }],
    ['f.md', 'End', { focus: 'f.md' }],
    // Enter
    ['f.md', 'Enter', { open: 'f.md' }],
    ['A/S/x.md', 'Enter', { open: 'A/S/x.md' }],
    ['A', 'Enter', { toggle: 'A' }],
    ['B', 'Enter', { toggle: 'B' }],
    // unknown keys
    ['A', 'Tab', null],
    ['A', 'a', null],
    ['f.md', ' ', null],
    ['A', 'PageDown', null],
];

describe('navKey', () => {
    it.each(cases)('%s + %s', (cur, key, expected) => {
        expect(navKey(rows, cur, key)).toEqual(expected);
    });

    it('unknown current path: Down/Home focus first row, End last, others null', () => {
        expect(navKey(rows, 'nope', 'ArrowDown')).toEqual({ focus: 'A' });
        expect(navKey(rows, 'nope', 'Home')).toEqual({ focus: 'A' });
        expect(navKey(rows, 'nope', 'End')).toEqual({ focus: 'f.md' });
        for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter']) expect(navKey(rows, 'nope', k)).toBeNull();
        expect(navKey(rows, '', 'ArrowDown')).toEqual({ focus: 'A' });
    });

    it('empty rows: every key is null', () => {
        for (const k of ['ArrowDown', 'Home', 'End', 'Enter']) expect(navKey([], 'A', k)).toBeNull();
    });

    it('single row: Down/Up are null, Home/End stay', () => {
        const one = visibleRows([f('only')], {});
        expect(navKey(one, 'only', 'ArrowDown')).toBeNull();
        expect(navKey(one, 'only', 'ArrowUp')).toBeNull();
        expect(navKey(one, 'only', 'End')).toEqual({ focus: 'only' });
    });
});
