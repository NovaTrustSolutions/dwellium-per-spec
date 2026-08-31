/**
 * Notepad → Scribe drag (copy semantics).
 *
 * Covers: the dataTransfer payloads set on dragStart (Phase D widget MIME +
 * text/plain fallback), the store staying untouched by a drag, Scribe's
 * dropHandler inserting the note as markdown at the drop point, and the
 * FileTree drop creating + opening a new deduped doc.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import Notepad, { noteDragData, NOTEPAD_DRAG_MIME } from '../components/Notepad/Notepad';
import { handleDrop, formatNotepadDrop, DWELLIUM_WIDGET_MIME } from '../components/Scribe/dropHandler';
import { uniqueMdPath } from '../components/Scribe/docTree';
import { FileTree } from '../components/Scribe/FileTree';
import { useScribeStore } from '../components/Scribe/scribeStore';

vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({ hierarchy: [] }),
}));

function stubDataTransfer(data: Record<string, string> = {}) {
    const store: Record<string, string> = { ...data };
    return {
        setData: vi.fn((type: string, value: string) => { store[type] = value; }),
        getData: (type: string) => store[type] ?? '',
        get types() { return Object.keys(store); },
        effectAllowed: 'uninitialized',
        dropEffect: 'none',
        files: { length: 0 },
    };
}

beforeEach(() => {
    localStorage.clear();
    useScribeStore.setState({ openFiles: [], activeFilepath: null, loading: false, error: null });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('noteDragData payload', () => {
    it('carries the Phase D widget payload and a text/plain fallback', () => {
        const data = noteDragData({ id: 'n1', title: 'Groceries', content: '- milk\n- eggs' });
        expect(data.text).toBe('- milk\n- eggs');
        expect(JSON.parse(data.widget)).toEqual({
            widgetId: 'n1',
            widgetType: 'notepad',
            source: 'notepad',
            title: 'Groceries',
            content: '- milk\n- eggs',
        });
        expect(NOTEPAD_DRAG_MIME).toBe(DWELLIUM_WIDGET_MIME);
    });
});

describe('Notepad item drag wiring', () => {
    it('sets both MIMEs on dragStart and leaves the note list unchanged (copy semantics)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<Notepad />);
        // Offline fetch → demo notes seed the list.
        const item = await screen.findByText('Meeting Notes — Q1 Review');
        const row = item.closest('.np-note-item') as HTMLElement;
        expect(row.getAttribute('draggable')).toBe('true');
        expect(row.getAttribute('aria-label')).toMatch(/draggable/i);

        const dt = stubDataTransfer();
        fireEvent.dragStart(row, { dataTransfer: dt });

        expect(dt.setData).toHaveBeenCalledTimes(2);
        const widgetRaw = dt.getData(NOTEPAD_DRAG_MIME);
        expect(JSON.parse(widgetRaw).title).toBe('Meeting Notes — Q1 Review');
        expect(dt.getData('text/plain')).toContain('Q1 Review');
        expect(dt.effectAllowed).toBe('copy');

        // Copy semantics: the note is still in the list, untouched.
        expect(screen.getByText('Meeting Notes — Q1 Review')).toBeTruthy();
    });
});

describe('formatNotepadDrop', () => {
    it('renders "## title\\n\\ncontent"', () => {
        expect(formatNotepadDrop({ widgetId: 'x', widgetType: 'notepad', title: 'T', content: 'body' }))
            .toBe('## T\n\nbody\n');
    });
    it('skips the heading when untitled', () => {
        expect(formatNotepadDrop({ widgetId: 'x', widgetType: 'notepad', title: 'Untitled', content: 'body' }))
            .toBe('body\n');
        expect(formatNotepadDrop({ widgetId: 'x', widgetType: 'notepad', content: 'body' }))
            .toBe('body\n');
    });
});

describe('dropHandler inserts notepad markdown at the drop point', () => {
    it('inserts the formatted note into the editor document', async () => {
        const view = new EditorView({ doc: 'before after' });
        try {
            view.dispatch({ selection: { anchor: 7 } }); // between the words
            const data = noteDragData({ id: 'n1', title: 'Plan', content: 'do the thing' });
            const e = {
                dataTransfer: stubDataTransfer({ [NOTEPAD_DRAG_MIME]: data.widget, 'text/plain': data.text }),
                clientX: 0,
                clientY: 0,
            } as unknown as DragEvent;
            const handled = await handleDrop(view, e);
            expect(handled).toBe(true);
            // jsdom has no layout → posAtCoords may resolve to any valid pos;
            // assert the markdown landed intact in the doc.
            expect(view.state.doc.toString()).toContain('## Plan\n\ndo the thing');
        } finally {
            view.destroy();
        }
    });
});

describe('uniqueMdPath', () => {
    it('uses the plain name when free and suffixes numerically when taken', () => {
        expect(uniqueMdPath('Note', [])).toBe('Note.md');
        expect(uniqueMdPath('Note', ['Note.md'])).toBe('Note 2.md');
        expect(uniqueMdPath('Note', ['note.md', 'Note 2.md'])).toBe('Note 3.md');
        expect(uniqueMdPath('', [])).toBe('Note.md');
        expect(uniqueMdPath('a/b', [])).toBe('a-b.md');
    });
});

describe('FileTree accepts a notepad drop', () => {
    it('creates a deduped doc from the note content and opens it', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        const { container } = render(
            <FileTree files={[{ filepath: 'Plan.md' }]} onOpen={() => { /* noop */ }} />,
        );
        const tree = container.querySelector('.scribe__file-tree') as HTMLElement;
        const data = noteDragData({ id: 'n1', title: 'Plan', content: 'note body' });
        const dt = stubDataTransfer({ [NOTEPAD_DRAG_MIME]: data.widget, 'text/plain': data.text });

        fireEvent.dragOver(tree, { dataTransfer: dt });
        expect(dt.dropEffect).toBe('copy');
        fireEvent.drop(tree, { dataTransfer: dt });

        await waitFor(() => {
            const s = useScribeStore.getState();
            expect(s.activeFilepath).toBe('Plan 2.md'); // deduped past the existing Plan.md
            expect(s.openFiles.find(f => f.filepath === 'Plan 2.md')?.content).toBe('note body');
        });
    });

    it('ignores non-notepad widget payloads', () => {
        const { container } = render(<FileTree files={[]} onOpen={() => { /* noop */ }} />);
        const tree = container.querySelector('.scribe__file-tree') as HTMLElement;
        const dt = stubDataTransfer({
            [NOTEPAD_DRAG_MIME]: JSON.stringify({ widgetId: 'w', widgetType: 'clock' }),
        });
        fireEvent.drop(tree, { dataTransfer: dt });
        expect(useScribeStore.getState().openFiles).toHaveLength(0);
    });
});
