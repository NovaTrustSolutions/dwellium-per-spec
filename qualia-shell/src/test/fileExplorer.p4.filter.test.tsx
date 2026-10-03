import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { filterTree } from '../components/FileExplorer/treeFilter';
import { Breadcrumbs } from '../components/FileExplorer/Breadcrumbs';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

const f = (path: string): FileEntry => ({ name: path.split('/').pop()!, path, tier: 'file' });
const d = (path: string, children: FileEntry[]): FileEntry => ({ name: path.split('/').pop()!, path, tier: 'folder', children });
const make = (): FileEntry[] => [
    d('Docs', [f('Docs/readme.md'), d('Docs/Invoices', [f('Docs/Invoices/jan.pdf'), f('Docs/Invoices/feb.pdf')])]),
    d('Legal', [d('Legal/Deep', [f('Legal/Deep/Lease.md')]), f('Legal/other.txt')]),
    f('notes.md'),
];
const paths = (es: FileEntry[]): string[] => es.flatMap((e) => [e.path, ...paths(e.children ?? [])]);

describe('filterTree', () => {
    it('empty and whitespace-only queries return the input unchanged', () => {
        const t = make();
        for (const q of ['', '   ', '\t']) {
            const r = filterTree(t, q);
            expect(r.entries).toBe(t);
            expect(r.expand.size).toBe(0);
        }
    });

    it('file match keeps only the branch and expands each ancestor', () => {
        const r = filterTree(make(), 'lease');
        expect(paths(r.entries)).toEqual(['Legal', 'Legal/Deep', 'Legal/Deep/Lease.md']);
        expect([...r.expand].sort()).toEqual(['Legal', 'Legal/Deep']);
    });

    it('is case-insensitive and trims the query', () => {
        expect(paths(filterTree(make(), '  NOTES.MD ').entries)).toEqual(['notes.md']);
    });

    it('folder-name match keeps all descendants', () => {
        const r = filterTree(make(), 'invoices');
        expect(paths(r.entries)).toEqual(['Docs', 'Docs/Invoices', 'Docs/Invoices/jan.pdf', 'Docs/Invoices/feb.pdf']);
        expect(r.expand.has('Docs')).toBe(true);
        expect(r.expand.has('Docs/Invoices')).toBe(false);
    });

    it('folder match with a matching descendant also expands the folder', () => {
        const r = filterTree(make(), 'docs');
        expect(paths(r.entries)).toEqual(paths([make()[0]]));
        expect(r.expand.size).toBe(0);
        const r2 = filterTree([d('x', [f('x/xa')])], 'x');
        expect(r2.expand.has('x')).toBe(true);
    });

    it('no match gives empty entries and empty expand', () => {
        const r = filterTree(make(), 'zzz');
        expect(r.entries).toEqual([]);
        expect(r.expand.size).toBe(0);
    });

    it('does not mutate the input', () => {
        const t = make();
        const snap = JSON.stringify(t);
        filterTree(t, 'jan');
        filterTree(t, 'invoices');
        expect(JSON.stringify(t)).toBe(snap);
        expect(t[0].children).toHaveLength(2);
    });

    it('prunes non-matching siblings inside a kept folder', () => {
        expect(paths(filterTree(make(), 'jan').entries)).toEqual(['Docs', 'Docs/Invoices', 'Docs/Invoices/jan.pdf']);
    });
});

describe('Breadcrumbs', () => {
    it('renders root > A > B > file; last is not a button; nav labelled Location', () => {
        render(<Breadcrumbs path="A/B/file.md" onNavigate={() => {}} />);
        expect(screen.getByRole('navigation', { name: 'Location' })).toBeTruthy();
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['root', 'A', 'B']);
        expect(screen.getByText('file.md').closest('button')).toBeNull();
        expect(screen.getByText('file.md').getAttribute('aria-current')).toBe('page');
    });

    it('navigates with cumulative paths, root is ""', () => {
        const nav = vi.fn();
        render(<Breadcrumbs path="A/B/file.md" onNavigate={nav} />);
        fireEvent.click(screen.getByText('B'));
        fireEvent.click(screen.getByText('A'));
        fireEvent.click(screen.getByText('root'));
        expect(nav.mock.calls).toEqual([['A/B'], ['A'], ['']]);
    });

    it('empty path shows only root, not a button', () => {
        render(<Breadcrumbs path="" onNavigate={() => {}} />);
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        expect(screen.getByText('root')).toBeTruthy();
    });

    it('crumb buttons are at least 32px tall', () => {
        render(<Breadcrumbs path="A/b" onNavigate={() => {}} />);
        for (const b of screen.getAllByRole('button')) expect((b as HTMLElement).style.minHeight).toBe('32px');
    });

    it('4 segments do not collapse', () => {
        render(<Breadcrumbs path="a/b/c/d" onNavigate={() => {}} />);
        expect(screen.queryByText('…')).toBeNull();
        expect(screen.getAllByRole('button')).toHaveLength(4);
    });

    it('more than 4 segments collapse the middle, full path in title', () => {
        const nav = vi.fn();
        render(<Breadcrumbs path="a/b/c/d/e" onNavigate={nav} />);
        const gap = screen.getByText('…');
        expect(gap.getAttribute('title')).toBe('a/b/c/d/e');
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['root', 'a', 'd']);
        expect(screen.getByText('e').getAttribute('aria-current')).toBe('page');
        expect(screen.queryByText('b')).toBeNull();
        fireEvent.click(screen.getByText('d'));
        expect(nav).toHaveBeenCalledWith('a/b/c/d');
    });
});
