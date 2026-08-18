/**
 * Interactive Docs — "/" palette: pure helpers + RTL flow through the editor
 * (typing "/" at line start opens, filter narrows, Enter inserts a block after
 * the current one and strips the query, Esc closes). Real timers only.
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import InteractiveDocs from '../components/Scribe/idocs/InteractiveDocs';
import { idocsStore, idocsUserIdHolder } from '../components/Scribe/idocs/idocsStore';
import { detectSlash, filterSlashBlocks, stripSlash, SLASH_BLOCKS } from '../components/Scribe/idocs/SlashPalette';
import { BLOCK_TYPES } from '../components/Scribe/idocs/idocTypes';

class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('ResizeObserver', MockResizeObserver); });
afterEach(cleanup);
beforeEach(() => { localStorage.clear(); idocsStore.reset(); idocsUserIdHolder.current = null; });

describe('SlashPalette helpers', () => {
    it('covers every block type and ranks label/type-prefix > keyword-prefix > substring', () => {
        expect(SLASH_BLOCKS.map((b) => b.type)).toEqual([...BLOCK_TYPES]);
        expect(filterSlashBlocks('')).toHaveLength(BLOCK_TYPES.length);
        expect(filterSlashBlocks('cal')[0].type).toBe('callout');
        expect(filterSlashBlocks('h2')[0].type).toBe('heading'); // keyword prefix
        expect(filterSlashBlocks('mermaid')[0].type).toBe('diagram');
        expect(filterSlashBlocks('zzzz')).toEqual([]);
        expect(filterSlashBlocks('qu').map((b) => b.type).slice(0, 2)).toEqual(['quote', 'quiz']); // both prefix hits → registry order
    });

    it('detectSlash only fires at line start; stripSlash removes the /query line', () => {
        expect(detectSlash('/', 1)).toEqual({ query: '', lineStart: 0 });
        expect(detectSlash('hello\n/ta', 9)).toEqual({ query: 'ta', lineStart: 6 });
        expect(detectSlash('a /b', 4)).toBeNull();          // not at line start
        expect(detectSlash('/tab le', 7)).toBeNull();       // space breaks the query
        expect(detectSlash('/x', 0)).toBeNull();            // caret before the slash
        expect(stripSlash('hello\n/ta', 9)).toEqual({ value: 'hello', caret: 5 });
        expect(stripSlash('/ta\nworld', 3)).toEqual({ value: 'world', caret: 0 });
        expect(stripSlash('a\n/x\nb', 4)).toEqual({ value: 'a\nb', caret: 2 });
        expect(stripSlash('plain', 5)).toEqual({ value: 'plain', caret: 5 });
    });
});

describe('SlashPalette in the editor', () => {
    async function openTextEditor() {
        render(<InteractiveDocs />);
        fireEvent.click(screen.getByRole('button', { name: 'Blank' }));
        await screen.findByLabelText('Document title');
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        const ta = screen.getByLabelText('Text (markdown)') as HTMLTextAreaElement;
        ta.focus();
        return ta;
    }
    const type = (ta: HTMLTextAreaElement, value: string) => { fireEvent.change(ta, { target: { value } }); fireEvent.keyUp(ta, { key: value.slice(-1) }); };

    it('"/" at line start opens, filter narrows, Enter inserts the block AFTER the current one and strips the query', async () => {
        const ta = await openTextEditor();
        expect(screen.queryByTestId('idoc-slash')).toBeNull();
        type(ta, '/');
        const pal = await screen.findByTestId('idoc-slash');
        expect(within(pal).getAllByRole('option')).toHaveLength(BLOCK_TYPES.length);
        type(ta, '/cal');
        expect(within(pal).getAllByRole('option')[0]).toHaveTextContent('Callout');
        expect(within(pal).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(ta, { key: 'Enter' });
        expect(screen.queryByTestId('idoc-slash')).toBeNull();
        const blocks = idocsStore.getSnapshot().docs[0].cards[0].blocks;
        expect(blocks.map((b) => b.type)).toEqual(['text', 'callout']);
        expect((blocks[0] as { md: string }).md).toBe(''); // "/cal" stripped
        // the new block opens in edit mode
        expect(screen.getByLabelText('Callout (markdown)')).toBeInTheDocument();
    });

    it('↑/↓ move the highlight; Esc closes and does not reopen for the same query; mid-line "/" is ignored', async () => {
        const ta = await openTextEditor();
        type(ta, '/');
        const pal = await screen.findByTestId('idoc-slash');
        fireEvent.keyDown(ta, { key: 'ArrowDown' });
        expect(within(pal).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(ta, { key: 'ArrowUp' });
        expect(within(pal).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(ta, { key: 'Escape' });
        expect(screen.queryByTestId('idoc-slash')).toBeNull();
        fireEvent.keyUp(ta, { key: 'Escape' }); // keyup after Esc must not reopen
        expect(screen.queryByTestId('idoc-slash')).toBeNull();
        expect(idocsStore.getSnapshot().docs[0].cards[0].blocks).toHaveLength(1);
        type(ta, 'see /this');
        expect(screen.queryByTestId('idoc-slash')).toBeNull();
        type(ta, 'see /this\n/');
        expect(await screen.findByTestId('idoc-slash')).toBeInTheDocument();
    });
});
