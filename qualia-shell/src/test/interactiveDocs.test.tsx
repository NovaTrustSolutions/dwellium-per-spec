/**
 * Interactive Docs — mode root smoke: library → Blank → editor → Present →
 * Esc; widget-action bus verb registered + consumed. Real timers only.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach } from 'vitest';
import InteractiveDocs from '../components/Scribe/idocs/InteractiveDocs';
import { idocsStore, idocsUserIdHolder } from '../components/Scribe/idocs/idocsStore';
import { consumePendingWidgetAction, performWidgetAction, supportsWidgetAction } from '../lib/widgetActions';

class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('ResizeObserver', MockResizeObserver); });
afterEach(cleanup);
beforeEach(() => {
    localStorage.clear();
    idocsStore.reset();
    idocsUserIdHolder.current = null;
    consumePendingWidgetAction('scribe');
});

describe('InteractiveDocs', () => {
    it('library → Blank → editor autosaves → Present overlay → Esc back to editor', async () => {
        render(<InteractiveDocs />);
        expect(screen.getByRole('heading', { name: 'Interactive Docs' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Blank' }));
        const title = await screen.findByLabelText('Document title');
        fireEvent.change(title, { target: { value: 'My First Doc' } });
        expect(idocsStore.getSnapshot().docs[0].title).toBe('My First Doc');
        fireEvent.click(screen.getByRole('button', { name: '▶ Present' }));
        expect(await screen.findByTestId('idoc-present')).toBeInTheDocument();
        await waitFor(() => expect(idocsStore.getSnapshot().docs[0].analytics.views).toBe(1));
        fireEvent.keyDown(window, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByTestId('idoc-present')).toBeNull());
        expect(screen.getByLabelText('Document title')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '← Library' }));
        expect(await screen.findByText('My First Doc')).toBeInTheDocument();
    });

    it('registers scribe.create-interactive-doc and, without an LLM, prefills the composer', async () => {
        expect(supportsWidgetAction('scribe', 'create-interactive-doc')).toBe(true);
        expect(performWidgetAction('scribe', 'create-interactive-doc', { text: 'Onboarding for new tenants' })).toBe(true);
        render(<InteractiveDocs />);
        const prompt = await screen.findByLabelText('Prompt');
        expect((prompt as HTMLTextAreaElement).value).toBe('Onboarding for new tenants');
        expect(consumePendingWidgetAction('scribe')).toBeNull(); // consumed on mount
    });

    it('⌘Z reverts a title edit and ⌘⇧Z redoes it (outside text fields only)', async () => {
        render(<InteractiveDocs />);
        fireEvent.click(screen.getByRole('button', { name: 'Blank' }));
        const title = await screen.findByLabelText('Document title');
        const docId = idocsStore.getSnapshot().docs[0].id;
        expect(idocsStore.getSnapshot().history[docId]?.snapshots).toHaveLength(1); // baseline pushed on mount
        fireEvent.change(title, { target: { value: 'Renamed' } });
        expect(idocsStore.getSnapshot().docs[0].title).toBe('Renamed');
        // inside the input → native undo, store untouched
        fireEvent.keyDown(title, { key: 'z', metaKey: true });
        expect(idocsStore.getSnapshot().docs[0].title).toBe('Renamed');
        const editor = screen.getByTestId('idoc-editor');
        fireEvent.keyDown(editor, { key: 'z', metaKey: true });
        expect(idocsStore.getSnapshot().docs[0].title).toBe('Untitled doc');
        expect((screen.getByLabelText('Document title') as HTMLInputElement).value).toBe('Untitled doc');
        fireEvent.keyDown(editor, { key: 'z', metaKey: true, shiftKey: true });
        expect(idocsStore.getSnapshot().docs[0].title).toBe('Renamed');
        // History popover lists snapshots + Restore
        fireEvent.click(screen.getByRole('button', { name: /History/ }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]);
        expect(idocsStore.getSnapshot().docs[0].title).toBe('Untitled doc');
    });

    it('drag-and-drop reorders cards in the outline; Shift-click multi-selects; nested cards show indented', async () => {
        render(<InteractiveDocs />);
        fireEvent.click(screen.getByRole('button', { name: 'Blank' }));
        await screen.findByLabelText('Document title');
        fireEvent.click(screen.getByRole('button', { name: '+ Add card' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Add card' }));
        const docId = idocsStore.getSnapshot().docs[0].id;
        const [c1, c2, c3] = idocsStore.getSnapshot().docs[0].cards.map((c) => c.id);
        // drop c1 onto c3 (no dragOver → defaults to "after")
        fireEvent.dragStart(screen.getByTestId(`idoc-outline-${c1}`));
        expect(screen.getByTestId(`idoc-outline-${c1}`)).toHaveAttribute('aria-grabbed', 'true');
        fireEvent.drop(screen.getByTestId(`idoc-outline-${c3}`));
        expect(idocsStore.getSnapshot().docs[0].cards.map((c) => c.id)).toEqual([c2, c3, c1]);
        // keyboard fallback still works
        fireEvent.click(screen.getAllByRole('button', { name: 'Move card up' })[2]);
        expect(idocsStore.getSnapshot().docs[0].cards.map((c) => c.id)).toEqual([c2, c1, c3]);
        // Shift-click multi-select → group toolbar → group delete
        fireEvent.click(screen.getByText('Card 2'));
        fireEvent.click(screen.getByText('Card 3'), { shiftKey: true });
        expect(screen.getByRole('toolbar', { name: 'Selected cards' })).toHaveTextContent('2 selected');
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(idocsStore.getSnapshot().docs[0].cards.map((c) => c.id)).toEqual([c1]);
        // nested card via outline "+sub" → indented (aria-level 2) and editable inline in the canvas
        fireEvent.click(screen.getByRole('button', { name: 'Add nested card' }));
        const child = idocsStore.getSnapshot().docs[0].cards[0].children![0];
        expect(screen.getByTestId(`idoc-outline-${child.id}`)).toHaveAttribute('aria-level', '2');
        fireEvent.click(screen.getByText('Card 1'));
        fireEvent.change(screen.getByLabelText('Nested card title'), { target: { value: 'Sub A' } });
        expect(idocsStore.getSnapshot().docs[0].cards[0].children![0].title).toBe('Sub A');
        fireEvent.click(screen.getByRole('button', { name: 'Un-nest card' }));
        expect(idocsStore.getSnapshot().docs[0].cards.map((c) => c.title)).toEqual(['Card 1', 'Sub A']);
        expect(idocsStore.getSnapshot().history[docId]).toBeDefined();
    });

    it('block DnD, copy/paste card, ⌘D / ⌘⏎ / ? shortcuts, page size, notes + footnotes', async () => {
        render(<InteractiveDocs />);
        fireEvent.click(screen.getByRole('button', { name: 'Blank' }));
        await screen.findByLabelText('Document title');
        const doc = () => idocsStore.getSnapshot().docs[0];
        // add a heading after the text block, then drag the text block onto the heading (→ after it)
        fireEvent.click(screen.getByRole('button', { name: '+ Add block ▾' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'heading' }));
        const [b1, b2] = doc().cards[0].blocks.map((b) => b.id);
        expect(doc().cards[0].blocks.map((b) => b.type)).toEqual(['text', 'heading']);
        fireEvent.dragStart(screen.getAllByLabelText('Drag to reorder block')[0]);
        fireEvent.drop(screen.getByTestId(`idoc-block-${b2}`));
        expect(doc().cards[0].blocks.map((b) => b.id)).toEqual([b2, b1]);
        // copy → paste (jsdom has no navigator.clipboard → in-memory path)
        fireEvent.click(screen.getByRole('button', { name: 'Copy card' }));
        fireEvent.click(screen.getByRole('button', { name: 'Paste card' }));
        await waitFor(() => expect(doc().cards).toHaveLength(2));
        expect(doc().cards[1].id).not.toBe(doc().cards[0].id);
        expect(doc().cards[1].blocks.map((b) => b.type)).toEqual(['heading', 'text']);
        // ⌘D duplicates the active card
        const editor = screen.getByTestId('idoc-editor');
        fireEvent.keyDown(editor, { key: 'd', metaKey: true });
        expect(doc().cards).toHaveLength(3);
        // ? opens the shortcuts sheet, Esc closes it
        fireEvent.keyDown(editor, { key: '?' });
        expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
        fireEvent.keyDown(editor, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
        // page size + notes + footnotes persist
        fireEvent.change(screen.getByLabelText('Page size'), { target: { value: '16:9' } });
        expect(doc().pageSize).toBe('16:9');
        fireEvent.change(screen.getByLabelText('Presenter notes'), { target: { value: 'say hi' } });
        fireEvent.click(screen.getByRole('button', { name: '+ Footnote' }));
        fireEvent.change(screen.getByLabelText('Footnote 1'), { target: { value: 'source' } });
        const active = doc().cards.find((c) => c.notes === 'say hi')!;
        expect(active.footnotes).toHaveLength(1);
        expect(active.footnotes![0].text).toBe('source');
        fireEvent.click(screen.getByRole('button', { name: 'Remove footnote 1' }));
        expect(doc().cards.find((c) => c.notes === 'say hi')!.footnotes).toHaveLength(0);
        // Doc settings chrome
        fireEvent.click(screen.getByRole('button', { name: /Doc settings/ }));
        fireEvent.change(screen.getByLabelText('Footer text'), { target: { value: '© Dwellium' } });
        expect(doc().chrome?.footer).toBe('© Dwellium');
        // ⌘⏎ presents
        fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
        expect(await screen.findByTestId('idoc-present')).toBeInTheDocument();
    });
});
