/**
 * Plan 079 phase 5 — UI contract (plans/079-task-board-widget.md section 11, parts B + C).
 *   B1 filter, B2 due date, B3 ordering (Alt+Arrow + drop-on-card), B4 WIP on add + "AI: file Backlog",
 *   C2 Tag File button, C3 Task Menu tab/note/"Send to Task Board", C4 ThoughtWeaver "Send to Task Board".
 * Accessible names and strings are the contract's, verbatim. jsdom has no layout, so this covers
 * roles, names, keyboard handlers, dialogs and store effects. Tests marked `guard:` pin existing behaviour.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const hier = vi.hoisted(() => ({ list: [] as Array<{ id: string; name: string; type: string }> }));
vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({ hierarchy: hier.list }),
}));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { active: null } } }),
}));
vi.mock('../lib/llmClient', () => ({
    hasActiveLlm: () => false,
    callLlm: () => new Promise(() => { /* never */ }),
}));

import TaskBoard from '../components/TaskBoard/TaskBoard';
import TaskMenu from '../components/TaskMenu/TaskMenu';
import TagFile from '../components/TagFile/TagFile';
import ThoughtWeaver from '../components/ThoughtWeaver/ThoughtWeaver';
import {
    taskBoardStore, taskBoardUserIdHolder, taskBoardProjectIdHolder,
    addCard, addSubtask, editCard, assignCard, updateColumnLimits, updateColumnPolicies, undo,
} from '../components/TaskBoard/taskBoardStore';
import { cardsInColumn, repairBoard, type BoardState, type TaskCard } from '../components/TaskBoard/taskBoardModel';
import { resetWidgetMemory, readWidgetMemory } from '../lib/widgetMemory';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { UserContext, type DwelliumUser } from '../context/UserContext';
import { tagStore, tagStoreUserIdHolder, setItemTags } from '../lib/tagStore';
import { thoughtWeaverStore, thoughtWeaverUserIdHolder } from '../components/ThoughtWeaver/thoughtWeaverStore';
import { twImportedStore, twImportedUserIdHolder } from '../components/ThoughtWeaver/twImportedStore';
import { todoStore, todoUserIdHolder, addTodo } from '../components/ThoughtWeaver/todoStore';
import { reportStore, reportUserIdHolder } from '../components/ThoughtWeaver/reportStore';

/* eslint-disable @typescript-eslint/no-explicit-any */
const board = (): BoardState => taskBoardStore.getSnapshot();
const cardByTitle = (t: string): TaskCard => board().cards.find(c => c.title === t)!;
const colTitles = (colId: string): string[] => cardsInColumn(board().cards, colId).map(c => c.title);
const region = (): string => document.getElementById('a11y-live-region')?.textContent ?? '';
const PAST = '2020-03-14';
const FUTURE = '2999-06-15';

function makeUser(id: string): DwelliumUser {
    return {
        id, email: `${id}@example.com`, name: id, role: 'god', assignedProperties: [], active: true,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as DwelliumUser;
}
const withUser = (id: string, ui: React.ReactNode): React.ReactElement =>
    <UserContext.Provider value={{ user: makeUser(id) } as unknown as React.ContextType<typeof UserContext>}>{ui}</UserContext.Provider>;
const storedBoard = (key: string): BoardState => repairBoard(JSON.parse(localStorage.getItem(key) ?? 'null'));

beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    hier.list = [{ id: 'p1', name: 'Alpha', type: 'project' }];
    setPerUserIdentity(null);
    taskBoardUserIdHolder.current = null;
    taskBoardProjectIdHolder.current = null;
    taskBoardStore.reset();
    resetWidgetMemory();
    document.getElementById('a11y-live-region')?.remove();
    vi.spyOn(taskBoardStore, 'hydrate').mockImplementation(async () => { /* no network */ });
    vi.spyOn(taskBoardStore, 'migrate').mockImplementation(async () => { /* no network */ });
    if (!('ResizeObserver' in globalThis)) {
        vi.stubGlobal('ResizeObserver', class { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } });
    }
    cleanup();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setPerUserIdentity(null); });

// ═════════════════════════ B1. filter ═════════════════════════
describe('[B1] Filter cards', () => {
    function seed(): void {
        addCard({ title: 'Boiler repair', columnId: 'todo' });
        addCard({ title: 'Pay rent', description: 'Leak behind the sink', columnId: 'todo' });
        addCard({ title: 'Fix door', columnId: 'backlog' });
        editCard(cardByTitle('Fix door').id, { tags: ['legal'] });
        assignCard(cardByTitle('Pay rent').id, { kind: 'person', id: 'lisa', label: 'Lisa Park', email: 'lisa@example.com' });
    }
    const filter = (): HTMLInputElement => screen.getByLabelText('Filter cards') as HTMLInputElement;
    const visible = (title: string): boolean => screen.queryByRole('button', { name: title }) !== null;

    it('is a search input in the toolbar named "Filter cards"', () => {
        seed();
        render(<TaskBoard />);
        expect(filter().type).toBe('search');
    });

    it('guard: with no filter every card shows and the count reads "3 cards"', () => {
        seed();
        render(<TaskBoard />);
        expect(visible('Boiler repair') && visible('Pay rent') && visible('Fix door')).toBe(true);
        expect(screen.getByText('3 cards')).toBeTruthy();
    });

    it('hides non-matching cards by title (case-insensitive) and shows "N of M cards"', async () => {
        seed();
        render(<TaskBoard />);
        await userEvent.setup().type(filter(), 'BOILER');
        expect(visible('Boiler repair')).toBe(true);
        expect(visible('Pay rent')).toBe(false);
        expect(visible('Fix door')).toBe(false);
        expect(screen.getByText('1 of 3 cards')).toBeTruthy();
    });

    it('matches the description', async () => {
        seed();
        render(<TaskBoard />);
        await userEvent.setup().type(filter(), 'sink');
        expect(visible('Pay rent')).toBe(true);
        expect(visible('Boiler repair')).toBe(false);
    });

    it('matches tags', async () => {
        seed();
        render(<TaskBoard />);
        await userEvent.setup().type(filter(), 'LEGAL');
        expect(visible('Fix door')).toBe(true);
        expect(visible('Pay rent')).toBe(false);
    });

    it('matches the assignee label', async () => {
        seed();
        render(<TaskBoard />);
        await userEvent.setup().type(filter(), 'lisa p');
        expect(visible('Pay rent')).toBe(true);
        expect(visible('Boiler repair')).toBe(false);
    });

    it('a filter with no matches hides every card and reads "0 of 3 cards"', async () => {
        seed();
        render(<TaskBoard />);
        await userEvent.setup().type(filter(), 'zzz-nothing');
        expect(visible('Boiler repair') || visible('Pay rent') || visible('Fix door')).toBe(false);
        expect(screen.getByText('0 of 3 cards')).toBeTruthy();
    });

    it('Escape clears the filter and restores every card and the plain count', async () => {
        seed();
        render(<TaskBoard />);
        await userEvent.setup().type(filter(), 'boiler');
        expect(visible('Pay rent')).toBe(false);
        fireEvent.keyDown(filter(), { key: 'Escape' });
        await waitFor(() => expect(filter().value).toBe(''));
        expect(visible('Pay rent') && visible('Fix door') && visible('Boiler repair')).toBe(true);
        expect(screen.getByText('3 cards')).toBeTruthy();
    });

    it('filtering is view-only: the stored board is unchanged', async () => {
        seed();
        render(<TaskBoard />);
        const before = board();
        await userEvent.setup().type(filter(), 'boiler');
        expect(board()).toBe(before);
        expect(board().cards).toHaveLength(3);
    });
});

// ═════════════════════════ B2. due date ═════════════════════════
describe('[B2] Due date', () => {
    it('the card view has a date input named "Due date" that sets dueAt', async () => {
        addCard({ title: 'Due job', columnId: 'todo' });
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Due job' }));
        await screen.findByRole('dialog', { name: 'Card: Due job' });
        const input = screen.getByLabelText('Due date') as HTMLInputElement;
        expect(input.type).toBe('date');
        fireEvent.change(input, { target: { value: FUTURE } });
        fireEvent.blur(input);
        await waitFor(() => expect((cardByTitle('Due job') as any).dueAt).toBe(FUTURE));
    });

    it('shows the stored date in the input when the card view opens', async () => {
        addCard({ title: 'Has date', columnId: 'todo' });
        editCard(cardByTitle('Has date').id, { dueAt: FUTURE } as any);
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Has date' }));
        expect((await screen.findByLabelText('Due date') as HTMLInputElement).value).toBe(FUTURE);
    });

    it('clearing the input unsets dueAt', async () => {
        addCard({ title: 'Clear me', columnId: 'todo' });
        editCard(cardByTitle('Clear me').id, { dueAt: FUTURE } as any);
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Clear me' }));
        const input = await screen.findByLabelText('Due date');
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);
        await waitFor(() => expect((cardByTitle('Clear me') as any).dueAt ?? undefined).toBeUndefined());
    });

    it('the card face shows "Due <Mon D>" for a future date', () => {
        addCard({ title: 'Later job', columnId: 'todo' });
        editCard(cardByTitle('Later job').id, { dueAt: FUTURE } as any);
        render(<TaskBoard />);
        expect(screen.getByText(/Due Jun 15/)).toBeTruthy();
        expect(screen.queryByText(/Overdue/)).toBeNull();
    });

    it('the card face shows "Overdue · <Mon D>" as text for a past date in an open column', () => {
        addCard({ title: 'Late job', columnId: 'todo' });
        editCard(cardByTitle('Late job').id, { dueAt: PAST } as any);
        render(<TaskBoard />);
        expect(screen.getByText(/Overdue · Mar 14/)).toBeTruthy();
    });

    it('a past date in the last column is not overdue', () => {
        addCard({ title: 'Finished job', columnId: 'done' });
        editCard(cardByTitle('Finished job').id, { dueAt: PAST } as any);
        render(<TaskBoard />);
        expect(screen.queryByText(/Overdue/)).toBeNull();
        expect(screen.getByText(/Due Mar 14/)).toBeTruthy();
    });

    it('guard: a card without a date shows no due text', () => {
        addCard({ title: 'No date', columnId: 'todo' });
        render(<TaskBoard />);
        expect(screen.queryByText(/Due |Overdue/)).toBeNull();
    });
});

// ═════════════════════════ B3. ordering ═════════════════════════
describe('[B3] ordering inside a column', () => {
    beforeEach(() => {
        addCard({ title: 'Alpha job', columnId: 'todo' });
        addCard({ title: 'Bravo job', columnId: 'todo' });
        addCard({ title: 'Charlie job', columnId: 'todo' });
    });
    const titleBtn = (t: string): HTMLElement => screen.getByRole('button', { name: t });
    const alt = (t: string, key: 'ArrowUp' | 'ArrowDown'): void => { fireEvent.keyDown(titleBtn(t), { key, altKey: true }); };

    it('Alt+ArrowUp moves a card up one place and announces it', async () => {
        render(<TaskBoard />);
        alt('Bravo job', 'ArrowUp');
        expect(colTitles('todo')).toEqual(['Bravo job', 'Alpha job', 'Charlie job']);
        await waitFor(() => expect(region()).toContain('Bravo job'));
    });

    it('Alt+ArrowDown moves a card down one place', () => {
        render(<TaskBoard />);
        alt('Bravo job', 'ArrowDown');
        expect(colTitles('todo')).toEqual(['Alpha job', 'Charlie job', 'Bravo job']);
    });

    it('Alt+ArrowUp on the first card and Alt+ArrowDown on the last card change nothing (no audit entry)', () => {
        render(<TaskBoard />);
        const before = board();
        alt('Alpha job', 'ArrowUp');
        alt('Charlie job', 'ArrowDown');
        expect(colTitles('todo')).toEqual(['Alpha job', 'Bravo job', 'Charlie job']);
        expect(board().audit.length).toBe(before.audit.length);
    });

    it('guard: ArrowUp/ArrowDown without Alt do not reorder', () => {
        render(<TaskBoard />);
        fireEvent.keyDown(titleBtn('Bravo job'), { key: 'ArrowUp' });
        fireEvent.keyDown(titleBtn('Bravo job'), { key: 'ArrowDown' });
        expect(colTitles('todo')).toEqual(['Alpha job', 'Bravo job', 'Charlie job']);
    });

    it('the reorder is one undoable step that restores the original order', () => {
        render(<TaskBoard />);
        alt('Charlie job', 'ArrowUp');
        expect(colTitles('todo')).toEqual(['Alpha job', 'Charlie job', 'Bravo job']);
        act(() => { undo(); });
        expect(colTitles('todo')).toEqual(['Alpha job', 'Bravo job', 'Charlie job']);
    });

    it('guard: Enter on the title button still opens the card view', async () => {
        render(<TaskBoard />);
        titleBtn('Bravo job').focus();
        await userEvent.setup().keyboard('{Enter}');
        expect(await screen.findByRole('dialog', { name: 'Card: Bravo job' })).toBeTruthy();
    });

    // drag and drop — a minimal in-memory DataTransfer
    function dnd(): any {
        const data: Record<string, string> = {};
        return { setData: (k: string, v: string) => { data[k] = v; }, getData: (k: string) => data[k] ?? '', effectAllowed: 'move', dropEffect: 'move', types: ['text/plain'], files: [] };
    }
    const cardEl = (t: string): HTMLElement => titleBtn(t).closest('.tb-card') as HTMLElement;
    function drag(from: string, onto: HTMLElement): void {
        const dataTransfer = dnd();
        fireEvent.dragStart(cardEl(from), { dataTransfer });
        fireEvent.dragOver(onto, { dataTransfer });
        fireEvent.drop(onto, { dataTransfer });
        fireEvent.dragEnd(cardEl(from), { dataTransfer });
    }

    it('dropping a card ON another card in the same column inserts it before that card', () => {
        render(<TaskBoard />);
        drag('Charlie job', cardEl('Alpha job'));
        expect(colTitles('todo')).toEqual(['Charlie job', 'Alpha job', 'Bravo job']);
    });

    it('dropping a card from another column ON a card inserts it before that card', () => {
        addCard({ title: 'Newcomer', columnId: 'backlog' });
        render(<TaskBoard />);
        drag('Newcomer', cardEl('Bravo job'));
        expect(colTitles('todo')).toEqual(['Alpha job', 'Newcomer', 'Bravo job', 'Charlie job']);
        expect(colTitles('backlog')).toEqual([]);
    });

    it('guard: dropping on the column body (not a card) still appends at the end', () => {
        addCard({ title: 'Newcomer', columnId: 'backlog' });
        render(<TaskBoard />);
        drag('Newcomer', cardEl('Alpha job').closest('.tb-col') as HTMLElement);
        expect(colTitles('todo')).toEqual(['Alpha job', 'Bravo job', 'Charlie job', 'Newcomer']);
    });
});

// ═════════════════════════ B4. WIP that means something ═════════════════════════
describe('[B4] WIP on add and on "AI: file Backlog"', () => {
    const addBtnFor = (colId: string): HTMLElement => {
        const idx = [...board().columns].sort((a, b) => a.order - b.order).findIndex(c => c.id === colId);
        return screen.getAllByRole('button', { name: '+ Add a card' })[idx];
    };
    async function addVia(colId: string, title: string): Promise<void> {
        const user = userEvent.setup();
        await user.click(addBtnFor(colId));
        await user.type(screen.getByPlaceholderText('Card title…'), `${title}{Enter}`);
    }
    function fullTodo(): void {
        addCard({ title: 'Resident', columnId: 'todo' });
        updateColumnLimits('todo', undefined, 1);
    }

    it('adding a card to a column below its max just adds it (no dialog)', async () => {
        addCard({ title: 'Resident', columnId: 'todo' });
        updateColumnLimits('todo', undefined, 2);
        render(<TaskBoard />);
        await addVia('todo', 'Second');
        expect(screen.queryByRole('dialog', { name: 'WIP Limit Exceeded' })).toBeNull();
        expect(colTitles('todo')).toContain('Second');
    });

    it('adding a card into a column at its max opens the WIP dialog and does not add yet', async () => {
        fullTodo();
        render(<TaskBoard />);
        await addVia('todo', 'Extra');
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(colTitles('todo')).toEqual(['Resident']);
    });

    it('"Add anyway" adds the card', async () => {
        fullTodo();
        render(<TaskBoard />);
        await addVia('todo', 'Extra');
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Add anyway' }));
        await waitFor(() => expect(colTitles('todo')).toEqual(['Resident', 'Extra']));
        expect(screen.queryByRole('dialog', { name: 'WIP Limit Exceeded' })).toBeNull();
    });

    it('Cancel closes the dialog and does not add the card', async () => {
        fullTodo();
        render(<TaskBoard />);
        await addVia('todo', 'Extra');
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'WIP Limit Exceeded' })).toBeNull());
        expect(colTitles('todo')).toEqual(['Resident']);
    });

    it('sub-tasks do not count toward the limit (wipCount): one parent + its sub-task leaves room under max 2', async () => {
        addCard({ title: 'Parent', columnId: 'todo' });
        addSubtask(cardByTitle('Parent').id, 'Sub step');
        updateColumnLimits('todo', undefined, 2);
        render(<TaskBoard />);
        await addVia('todo', 'Second top-level');
        expect(screen.queryByRole('dialog', { name: 'WIP Limit Exceeded' })).toBeNull();
        expect(colTitles('todo')).toContain('Second top-level');
    });

    it('"AI: file Backlog" into a full To Do opens the WIP dialog and moves nothing', async () => {
        fullTodo();
        addCard({ title: 'Newcomer', columnId: 'backlog' });
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'AI: file Backlog' }));
        expect(await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' })).toBeTruthy();
        expect(cardByTitle('Newcomer').columnId).toBe('backlog');
    });

    it('"AI: file Backlog" keeps the AI actor when the WIP dialog is overridden', async () => {
        fullTodo();
        addCard({ title: 'Newcomer', columnId: 'backlog' });
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'AI: file Backlog' }));
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Override & Proceed' }));
        await waitFor(() => expect(cardByTitle('Newcomer').columnId).toBe('todo'));
        expect(board().audit[board().audit.length - 1].actor).toMatchObject({ kind: 'ai', agent: 'ara' });
    });

    it('"AI: file Backlog" Cancel leaves the card in Backlog', async () => {
        fullTodo();
        addCard({ title: 'Newcomer', columnId: 'backlog' });
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'AI: file Backlog' }));
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(cardByTitle('Newcomer').columnId).toBe('backlog');
    });

    it('"AI: file Backlog" also honours the Backlog exit policy (exit-criteria dialog first)', async () => {
        addCard({ title: 'Newcomer', columnId: 'backlog' });
        updateColumnPolicies('backlog', ['Reviewed with owner']);
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'AI: file Backlog' }));
        expect(await screen.findByRole('dialog', { name: 'Column Exit Criteria Enforced' })).toBeTruthy();
        expect(cardByTitle('Newcomer').columnId).toBe('backlog');
    });

    it('guard: "AI: file Backlog" with room moves the card as ARA with no dialog', async () => {
        addCard({ title: 'Newcomer', columnId: 'backlog' });
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'AI: file Backlog' }));
        await waitFor(() => expect(cardByTitle('Newcomer').columnId).toBe('todo'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(board().audit[board().audit.length - 1].actor).toMatchObject({ kind: 'ai', agent: 'ara' });
    });
});

// ═════════════════════════ C2. Tag File ═════════════════════════
describe('[C2] Tag File task-board rows', () => {
    const opened: Array<{ widgetId: string }> = [];
    const onOpen = (e: Event): void => { opened.push((e as CustomEvent).detail); };
    beforeEach(() => {
        opened.length = 0;
        window.addEventListener('dwellium:open-widget', onOpen);
        localStorage.setItem('taskboard:u1:projA', JSON.stringify({ columns: undefined, cards: [{ id: 'c-proj', title: 'Project job', columnId: 'todo' }] }));
        tagStoreUserIdHolder.current = 'u1';
        tagStore.reset();
        setItemTags({ source: 'task-board', sourceId: 'c-proj', title: 'Project job' }, ['x']);
        setItemTags({ source: 'notepad', sourceId: 'n1', title: 'Note one' }, ['x']);
        setPerUserIdentity('u1');
    });
    afterEach(() => { window.removeEventListener('dwellium:open-widget', onOpen); tagStoreUserIdHolder.current = null; tagStore.reset(); });

    it('a task-board row is a button named with the item title', () => {
        render(withUser('u1', <TagFile />));
        expect(screen.getByRole('button', { name: 'Project job' })).toBeTruthy();
    });

    it('clicking it opens that card: widget memory (project + card) and the Task Board widget', () => {
        render(withUser('u1', <TagFile />));
        fireEvent.click(screen.getByRole('button', { name: 'Project job' }));
        const mem = readWidgetMemory<Record<string, unknown>>('task-board', {});
        expect(mem.activeProjectId).toBe('projA');
        expect(mem.openCardId).toBe('c-proj');
        expect(opened.map(o => o.widgetId)).toEqual(['task-board']);
    });

    it('guard: rows from other sources stay plain text, not buttons', () => {
        render(withUser('u1', <TagFile />));
        expect(screen.getByText('Note one')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Note one' })).toBeNull();
    });

    it('guard: tag chips and the tag cloud still filter', () => {
        render(withUser('u1', <TagFile />));
        expect(screen.getAllByRole('button').some(b => /#x/.test(b.textContent ?? ''))).toBe(true);
    });
});

// ═════════════════════════ C3. Task Menu ═════════════════════════
describe('[C3] Task Menu', () => {
    const tasks = [
        { id: 't1', title: 'Fix gutter', description: 'Back side', source: 'gmail', projectId: 'proj-msa', urgency: 'high', status: 'open', createdAt: '2026-09-01T00:00:00.000Z' },
        { id: 't2', title: 'Order paint', description: '', source: 'gmail', projectId: 'proj-msa', urgency: 'low', status: 'open', createdAt: '2026-09-02T00:00:00.000Z' },
        { id: 't3', title: 'Call vendor', description: 'About quote', source: 'gmail', projectId: 'proj-msa', urgency: 'medium', status: 'open', createdAt: '2026-09-03T00:00:00.000Z' },
    ];
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
            ok: true,
            json: async () => ({ success: true, data: String(url).startsWith('/api/tasks') ? tasks : [] }),
        })));
    });

    // The name may carry a leading decorative glyph ("▤ Task Board"), so match the label, not the whole string.
    it('the Board tab is labelled "Task Board" (no bare "Board" tab left)', async () => {
        render(withUser('u1', <TaskMenu />));
        expect(await screen.findByRole('tab', { name: /Task Board$/ })).toBeTruthy();
        expect(screen.queryByRole('tab', { name: /^[^A-Za-z]*Board$/ })).toBeNull();
    });

    it('guard: the List tab is still there', async () => {
        render(withUser('u1', <TaskMenu />));
        expect(await screen.findByRole('tab', { name: /List/ })).toBeTruthy();
    });

    it('the Task Board tab starts with the "separate list" note', async () => {
        render(withUser('u1', <TaskMenu />));
        await userEvent.setup().click(await screen.findByRole('tab', { name: /Task Board$/ }));
        expect(await screen.findByText('This is your Task Board — a separate list from these tasks.')).toBeTruthy();
    });

    it('each list row has a "Send <title> to Task Board" button', async () => {
        render(withUser('u1', <TaskMenu />));
        for (const t of tasks) expect(await screen.findByRole('button', { name: `Send ${t.title} to Task Board` })).toBeTruthy();
    });

    it('clicking it adds a card (title, description, urgency) to that user\'s Task Board', async () => {
        render(withUser('u1', <TaskMenu />));
        await userEvent.setup().click(await screen.findByRole('button', { name: 'Send Fix gutter to Task Board' }));
        await waitFor(() => expect(storedBoard('taskboard:u1').cards).toHaveLength(1));
        expect(storedBoard('taskboard:u1').cards[0]).toMatchObject({ title: 'Fix gutter', description: 'Back side', urgency: 'high' });
    });

    it.each([['Order paint', 'low'], ['Call vendor', 'medium']])('passes urgency through: %s -> %s', async (title, urgency) => {
        render(withUser('u1', <TaskMenu />));
        await userEvent.setup().click(await screen.findByRole('button', { name: `Send ${title} to Task Board` }));
        await waitFor(() => expect(storedBoard('taskboard:u1').cards).toHaveLength(1));
        expect(storedBoard('taskboard:u1').cards[0].urgency).toBe(urgency);
    });

    it('is audited as a user ADD_CARD (goes through addCard)', async () => {
        render(withUser('u1', <TaskMenu />));
        await userEvent.setup().click(await screen.findByRole('button', { name: 'Send Fix gutter to Task Board' }));
        await waitFor(() => expect(storedBoard('taskboard:u1').cards).toHaveLength(1));
        const audit = storedBoard('taskboard:u1').audit;
        expect(audit[audit.length - 1]).toMatchObject({ type: 'ADD_CARD', actor: { kind: 'user' } });
    });

    it('shows a status message that mentions the Task Board after sending', async () => {
        render(withUser('u1', <TaskMenu />));
        const leaves = (): HTMLElement[] => Array.from(document.body.querySelectorAll<HTMLElement>('*'))
            .filter(el => el.children.length === 0 && /task board/i.test(el.textContent ?? '') && !el.closest('button, [role="tab"]'));
        const btn = await screen.findByRole('button', { name: 'Send Fix gutter to Task Board' });
        const before = leaves().length;
        await userEvent.setup().click(btn);
        await waitFor(() => expect(leaves().length).toBeGreaterThan(before));
    });
});

// ═════════════════════════ C4. ThoughtWeaver ═════════════════════════
describe('[C4] ThoughtWeaver to-dos', () => {
    beforeEach(() => {
        thoughtWeaverStore.reset(); twImportedStore.reset(); todoStore.reset(); reportStore.reset();
        thoughtWeaverUserIdHolder.current = null; twImportedUserIdHolder.current = null;
        todoUserIdHolder.current = null; reportUserIdHolder.current = null;
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))));
        todoUserIdHolder.current = 'u1';
        addTodo({ text: 'Call the plumber', sourceCaptureId: null, priority: 'high' });
        addTodo({ text: 'Water the plants', sourceCaptureId: null, priority: 'low' });
        addTodo({ text: 'Review the lease', sourceCaptureId: null, priority: 'medium' });
    });
    async function openToday(): Promise<void> {
        render(withUser('u1', <ThoughtWeaver />));
        const tab = Array.from(document.querySelectorAll<HTMLElement>('.tw-tab')).find(b => /Today/.test(b.textContent ?? ''))!;
        await act(async () => { tab.click(); });
    }

    it('every to-do row has a "Send "<text>" to Task Board" button', async () => {
        await openToday();
        for (const text of ['Call the plumber', 'Water the plants', 'Review the lease']) {
            expect(await screen.findByRole('button', { name: `Send "${text}" to Task Board` })).toBeTruthy();
        }
    });

    it.each([['Call the plumber', 'high'], ['Water the plants', 'low'], ['Review the lease', 'medium']])(
        'sending "%s" adds a card with urgency %s', async (text, urgency) => {
            await openToday();
            await act(async () => { (await screen.findByRole('button', { name: `Send "${text}" to Task Board` })).click(); });
            await waitFor(() => expect(storedBoard('taskboard:u1').cards).toHaveLength(1));
            expect(storedBoard('taskboard:u1').cards[0]).toMatchObject({ title: text, urgency });
        });

    it('guard: sending does not remove or complete the to-do', async () => {
        await openToday();
        await act(async () => { (await screen.findByRole('button', { name: 'Send "Call the plumber" to Task Board' })).click(); });
        await waitFor(() => expect(storedBoard('taskboard:u1').cards).toHaveLength(1));
        expect(screen.getByText('Call the plumber')).toBeTruthy();
        expect(todoStore.getSnapshot().find(t => t.text === 'Call the plumber')?.done).toBe(false);
    });
});
