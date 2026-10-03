/**
 * Plan 079 phase 5 — review fixes (UI side). Each describe pins one finding:
 *   1. a filter drops hidden cards from the selection (count, bulk move, multi-drag)
 *   2. Alt+Arrow while filtered steps to the next VISIBLE neighbour; no visible neighbour = no-op, no audit
 *   3. the due-date input commits on blur / Enter / close, not on every intermediate value
 *   4. a no-op reorder neither audits nor announces
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
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
import {
    taskBoardStore, taskBoardUserIdHolder, taskBoardProjectIdHolder, addCard, editCard,
} from '../components/TaskBoard/taskBoardStore';
import { cardsInColumn, type BoardState, type TaskCard } from '../components/TaskBoard/taskBoardModel';
import { resetWidgetMemory } from '../lib/widgetMemory';
import { setPerUserIdentity } from '../lib/perUserIdentity';

const board = (): BoardState => taskBoardStore.getSnapshot();
const cardByTitle = (t: string): TaskCard => board().cards.find(c => c.title === t)!;
const colTitles = (colId: string): string[] => cardsInColumn(board().cards, colId).map(c => c.title);
const region = (): string => document.getElementById('a11y-live-region')?.textContent ?? '';
const dueOf = (t: string): string | null | undefined => (cardByTitle(t) as TaskCard & { dueAt?: string | null }).dueAt;
const FUTURE = '2999-06-15';

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

const filter = (): HTMLInputElement => screen.getByLabelText('Filter cards') as HTMLInputElement;
const titleBtn = (t: string): HTMLElement => screen.getByRole('button', { name: t });
const cardEl = (t: string): HTMLElement => titleBtn(t).closest('.tb-card') as HTMLElement;
const colEl = (title: string): HTMLElement => screen.getByText(title, { selector: 'h4' }).closest('.tb-col') as HTMLElement;
const alt = (t: string, key: 'ArrowUp' | 'ArrowDown'): void => { fireEvent.keyDown(titleBtn(t), { key, altKey: true }); };
const select = (...titles: string[]): void => { for (const t of titles) fireEvent.click(screen.getByLabelText(`Select ${t}`)); };

function dnd(): { setData: (k: string, v: string) => void; getData: (k: string) => string; effectAllowed: string; dropEffect: string; types: string[]; files: never[] } {
    const data: Record<string, string> = {};
    return { setData: (k, v) => { data[k] = v; }, getData: k => data[k] ?? '', effectAllowed: 'move', dropEffect: 'move', types: ['text/plain'], files: [] };
}
function drag(from: string, onto: HTMLElement): void {
    const dataTransfer = dnd();
    fireEvent.dragStart(cardEl(from), { dataTransfer });
    fireEvent.dragOver(onto, { dataTransfer });
    fireEvent.drop(onto, { dataTransfer });
    fireEvent.dragEnd(cardEl(from), { dataTransfer });
}

// ═════════════ 1. selection vs filter ═════════════
describe('[review 1] a filter drops hidden cards from the selection', () => {
    beforeEach(() => {
        addCard({ title: 'Boiler repair', columnId: 'todo' });
        addCard({ title: 'Pay rent', columnId: 'todo' });
        addCard({ title: 'Fix door', columnId: 'todo' });
    });

    it('select 3, filter to 1: reads "1 selected" and Move to Done moves only the visible card', async () => {
        const user = userEvent.setup();
        render(<TaskBoard />);
        select('Boiler repair', 'Pay rent', 'Fix door');
        expect(screen.getByText('3 selected')).toBeTruthy();
        await user.type(filter(), 'boiler');
        expect(screen.getByText('1 selected')).toBeTruthy();
        await user.selectOptions(screen.getByLabelText('Move selected cards to column'), 'Done');
        expect(colTitles('done')).toEqual(['Boiler repair']);
        expect(colTitles('todo').sort()).toEqual(['Fix door', 'Pay rent']);
    });

    it('the hidden cards stay deselected after the filter is cleared', async () => {
        const user = userEvent.setup();
        render(<TaskBoard />);
        select('Boiler repair', 'Pay rent', 'Fix door');
        await user.type(filter(), 'boiler');
        await user.clear(filter());
        expect(screen.getByText('1 selected')).toBeTruthy();
        expect((screen.getByLabelText('Select Pay rent') as HTMLInputElement).checked).toBe(false);
        expect((screen.getByLabelText('Select Boiler repair') as HTMLInputElement).checked).toBe(true);
    });

    it('dragging a multi-selection moves only the selected cards the filter shows', async () => {
        addCard({ title: 'Boiler service', columnId: 'todo' });
        render(<TaskBoard />);
        select('Boiler repair', 'Boiler service', 'Pay rent');
        await userEvent.setup().type(filter(), 'boiler');
        drag('Boiler repair', colEl('Done'));
        expect(colTitles('done').sort()).toEqual(['Boiler repair', 'Boiler service']);
        expect(colTitles('todo').sort()).toEqual(['Fix door', 'Pay rent']);
    });
});

// ═════════════ 2. Alt+Arrow while filtered ═════════════
describe('[review 2] Alt+Arrow while filtered skips hidden neighbours', () => {
    beforeEach(() => {
        addCard({ title: 'Alpha ship', columnId: 'todo' });
        addCard({ title: 'Bravo hold', columnId: 'todo' });
        addCard({ title: 'Charlie ship', columnId: 'todo' });
        addCard({ title: 'Delta hold', columnId: 'todo' });
    });

    it('Alt+ArrowDown moves past the hidden card to the next visible one', async () => {
        render(<TaskBoard />);
        await userEvent.setup().type(filter(), 'ship');
        alt('Alpha ship', 'ArrowDown');
        expect(colTitles('todo')).toEqual(['Bravo hold', 'Charlie ship', 'Alpha ship', 'Delta hold']);
        await waitFor(() => expect(region()).toContain('Moved Alpha ship down'));
    });

    it('Alt+ArrowUp moves past the hidden card to the previous visible one', async () => {
        render(<TaskBoard />);
        await userEvent.setup().type(filter(), 'ship');
        alt('Charlie ship', 'ArrowUp');
        expect(colTitles('todo')).toEqual(['Charlie ship', 'Alpha ship', 'Bravo hold', 'Delta hold']);
    });

    it('at the visible boundary it does nothing: no audit entry, no announcement', async () => {
        render(<TaskBoard />);
        await userEvent.setup().type(filter(), 'ship');
        const before = board();
        alt('Charlie ship', 'ArrowDown'); // only a hidden card lies below
        alt('Alpha ship', 'ArrowUp');
        expect(board()).toBe(before);
        expect(region()).toBe('');
    });
});

// ═════════════ 3. due date commits once ═════════════
describe('[review 3] the due-date input commits on blur / Enter / close', () => {
    async function openDue(title: string): Promise<HTMLInputElement> {
        await userEvent.setup().click(titleBtn(title));
        await screen.findByRole('dialog', { name: `Card: ${title}` });
        return screen.getByLabelText('Due date') as HTMLInputElement;
    }

    it('intermediate values write nothing; blur writes one EDIT_CARD with the final value', async () => {
        addCard({ title: 'Due job', columnId: 'todo' });
        render(<TaskBoard />);
        const input = await openDue('Due job');
        const before = board().audit.length;
        fireEvent.change(input, { target: { value: '0002-06-15' } });
        fireEvent.change(input, { target: { value: '0020-06-15' } });
        fireEvent.change(input, { target: { value: FUTURE } });
        expect(input.value).toBe(FUTURE);
        expect(board().audit.length).toBe(before);
        expect(dueOf('Due job') ?? null).toBeNull();
        fireEvent.blur(input);
        expect(dueOf('Due job')).toBe(FUTURE);
        expect(board().audit.length).toBe(before + 1);
    });

    it('Enter commits and keeps the card view open', async () => {
        addCard({ title: 'Enter job', columnId: 'todo' });
        render(<TaskBoard />);
        const input = await openDue('Enter job');
        fireEvent.change(input, { target: { value: FUTURE } });
        expect(dueOf('Enter job') ?? null).toBeNull();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(dueOf('Enter job')).toBe(FUTURE);
        expect(screen.getByRole('dialog', { name: 'Card: Enter job' })).toBeTruthy();
    });

    it('closing the card view (Escape, then the x button) commits a pending date', async () => {
        addCard({ title: 'Esc job', columnId: 'todo' });
        addCard({ title: 'Close job', columnId: 'todo' });
        render(<TaskBoard />);
        fireEvent.change(await openDue('Esc job'), { target: { value: FUTURE } });
        fireEvent.keyDown(screen.getByLabelText('Due date'), { key: 'Escape' });
        expect(dueOf('Esc job')).toBe(FUTURE);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        fireEvent.change(await openDue('Close job'), { target: { value: FUTURE } });
        fireEvent.click(screen.getByRole('button', { name: 'Close project view' }));
        expect(dueOf('Close job')).toBe(FUTURE);
    });

    it('clearing the field and blurring sets dueAt to null', async () => {
        addCard({ title: 'Clear job', columnId: 'todo' });
        editCard(cardByTitle('Clear job').id, { dueAt: FUTURE });
        render(<TaskBoard />);
        const input = await openDue('Clear job');
        fireEvent.change(input, { target: { value: '' } });
        expect(dueOf('Clear job')).toBe(FUTURE);
        fireEvent.blur(input);
        expect(dueOf('Clear job') ?? null).toBeNull();
    });

    it('blurring an untouched field writes nothing', async () => {
        addCard({ title: 'Quiet job', columnId: 'todo' });
        render(<TaskBoard />);
        const input = await openDue('Quiet job');
        const before = board();
        fireEvent.blur(input);
        expect(board()).toBe(before);
    });
});

// ═════════════ 4. no-op reorder is silent ═════════════
describe('[review 4] a no-op reorder neither audits nor announces', () => {
    beforeEach(() => {
        addCard({ title: 'Alpha job', columnId: 'todo' });
        addCard({ title: 'Bravo job', columnId: 'todo' });
        addCard({ title: 'Charlie job', columnId: 'todo' });
    });

    it('dropping a card on the card right below it leaves the same slot: nothing changes, nothing is announced', () => {
        render(<TaskBoard />);
        const before = board();
        drag('Alpha job', cardEl('Bravo job'));
        expect(board()).toBe(before);
        expect(region()).toBe('');
    });

    it('control: a real reorder announces "before <target>"', async () => {
        render(<TaskBoard />);
        drag('Charlie job', cardEl('Alpha job'));
        expect(colTitles('todo')).toEqual(['Charlie job', 'Alpha job', 'Bravo job']);
        await waitFor(() => expect(region()).toContain('Moved Charlie job before Alpha job'));
    });
});
