import { describe, it, expect } from 'vitest';
import { SLASH_COMMANDS, filterSlashCommands, commandSnippet } from '../components/Scribe/slashCommands';
import { searchDocuments, countMatchedFiles } from '../components/Scribe/docSearch';
import { buildDocTree, flattenTree } from '../components/Scribe/docTree';
import { markdownToPdfBytes } from '../components/Scribe/pdfExport';

describe('Scribe ← Docs parity: slash commands', () => {
    it('empty query returns the full registry', () => {
        expect(filterSlashCommands('')).toHaveLength(SLASH_COMMANDS.length);
    });
    it('matches headings and to-do by label/keyword', () => {
        expect(filterSlashCommands('head').map(c => c.id)).toEqual(expect.arrayContaining(['h1', 'h2', 'h3']));
        expect(filterSlashCommands('todo').map(c => c.id)).toContain('checklist');
        expect(filterSlashCommands('table').map(c => c.id)).toContain('table');
    });
    it('insertion snippets place the cursor correctly', () => {
        expect(commandSnippet('checklist')?.text).toBe('- [ ] ');
        expect(commandSnippet('code')?.cursor).toBe(4);       // inside the fence
        expect(commandSnippet('link')?.cursor).toBe(1);       // inside [ ]
        expect(commandSnippet('nope')).toBeNull();
    });
});

describe('Scribe ← Docs parity: cross-document search', () => {
    const docs = [
        { filepath: 'a.md', content: 'hello world\nanother HELLO here' },
        { filepath: 'b.md', content: 'nothing relevant' },
        { filepath: 'c.md', content: 'HeLLo c' },
    ];
    it('finds matches across files, case-insensitive by default', () => {
        const m = searchDocuments(docs, 'hello');
        expect(m).toHaveLength(3);
        expect(countMatchedFiles(m)).toBe(2);
        expect(m[0]).toMatchObject({ filepath: 'a.md', line: 1, column: 1 });
        expect(m[1]).toMatchObject({ filepath: 'a.md', line: 2 });
    });
    it('respects caseSensitive and empty query', () => {
        expect(searchDocuments(docs, 'HELLO', { caseSensitive: true }).map(x => x.filepath)).toEqual(['a.md']);
        expect(searchDocuments(docs, '   ')).toEqual([]);
    });
    it('respects maxTotal', () => {
        expect(searchDocuments(docs, 'hello', { maxTotal: 1 })).toHaveLength(1);
    });
});

describe('Scribe ← Docs parity: subpage/file tree', () => {
    it('builds a nested tree from paths, folders before files', () => {
        const tree = buildDocTree(['notes/a.md', 'notes/sub/c.md', 'readme.md', 'notes/b.md']);
        expect(tree.map(n => n.name)).toEqual(['notes', 'readme.md']); // folder first
        const notes = tree[0];
        expect(notes.isFile).toBe(false);
        expect(notes.children.map(n => `${n.name}:${n.isFile ? 'f' : 'd'}`)).toEqual(['sub:d', 'a.md:f', 'b.md:f']);
        expect(notes.children[0].children[0].path).toBe('notes/sub/c.md');
    });
    it('flattenTree expands only opened folders', () => {
        const tree = buildDocTree(['notes/a.md', 'readme.md']);
        const collapsed = flattenTree(tree, new Set());
        expect(collapsed.map(r => r.node.name)).toEqual(['notes', 'readme.md']); // notes not expanded
        const expanded = flattenTree(tree, new Set(['notes']));
        expect(expanded.map(r => r.node.name)).toEqual(['notes', 'a.md', 'readme.md']);
    });
});

describe('Scribe ← Docs parity: PDF export', () => {
    it('produces real PDF bytes from markdown', async () => {
        const bytes = await markdownToPdfBytes('My Doc', '# Hello\n\nSome body text that is reasonably long.');
        expect(bytes.length).toBeGreaterThan(100);
        // PDF magic number "%PDF"
        expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x25, 0x50, 0x44, 0x46]);
    });
    it('does not throw on unicode/emoji input', async () => {
        await expect(markdownToPdfBytes('Tïtlé', 'café — “smart” quotes \n日本語')).resolves.toBeInstanceOf(Uint8Array);
    });
});
