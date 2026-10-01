/**
 * Plan 079 phase 4 — Task Board accessibility contract (plans/079-task-board-widget.md section 10).
 * Written from the UI contract table + behaviours 1-9; accessible names are used verbatim.
 * jsdom has no layout and no real Tab traversal, so this file covers roles, names, focus
 * placement/return, keyboard handlers, announcements and the store effects — not geometry.
 * Tests marked `guard:` pin behaviour that already works and must not regress.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const hier = vi.hoisted(() => ({ list: [] as Array<{ id: string; name: string; type: string }> }));
vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({ hierarchy: hier.list }),
}));

import TaskBoard from '../components/TaskBoard/TaskBoard';
import {
    taskBoardStore, taskBoardUserIdHolder, taskBoardProjectIdHolder,
    addCard, moveCard, moveCards, undo, addColumn, renameColumn, resizeColumn,
    updateColumnLimits, updateColumnPolicies, loadBoardState, removeCard, removeColumn, addSubtask,
} from '../components/TaskBoard/taskBoardStore';
import type { BoardState, TaskCard } from '../components/TaskBoard/taskBoardModel';
import { patchWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';

const PICKER = 'Select active project board';
const DAY = 86_400_000;
const T0 = Date.parse('2026-09-01T00:00:00.000Z');

const board = (): BoardState => taskBoardStore.getSnapshot();
const cardByTitle = (t: string): TaskCard => board().cards.find(c => c.title === t)!;
const colOf = (t: string): string | undefined => cardByTitle(t)?.columnId;
const width = (colId: string): number => board().columns.find(c => c.id === colId)!.width;
const region = (): string => document.getElementById('a11y-live-region')?.textContent ?? '';
const at = (days: number): void => { vi.setSystemTime(T0 + days * DAY); };

beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    hier.list = [{ id: 'p1', name: 'Alpha', type: 'project' }, { id: 'p2', name: 'Beta', type: 'project' }];
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

afterEach(() => { cleanup(); vi.useRealTimers(); });

// ── 1. Card view ────────────────────────────────────────────────────
describe('card view dialog', () => {
    it('opens on Enter from the title button as a modal dialog named "Card: <title>"', async () => {
        addCard({ title: 'Alpha job', columnId: 'todo' });
        render(<TaskBoard />);
        const opener = screen.getByRole('button', { name: 'Alpha job' });
        opener.focus();
        await userEvent.setup().keyboard('{Enter}');
        const dialog = await screen.findByRole('dialog', { name: 'Card: Alpha job' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('moves focus inside the dialog after it opens', async () => {
        addCard({ title: 'Focus me', columnId: 'todo' });
        render(<TaskBoard />);
        const opener = screen.getByRole('button', { name: 'Focus me' });
        opener.focus();
        await userEvent.setup().keyboard('{Enter}');
        const dialog = await screen.findByRole('dialog', { name: 'Card: Focus me' });
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    });

    it('closes on Escape and returns focus to the title button', async () => {
        addCard({ title: 'Close me', columnId: 'todo' });
        render(<TaskBoard />);
        const opener = screen.getByRole('button', { name: 'Close me' });
        opener.focus();
        await userEvent.setup().keyboard('{Enter}');
        const dialog = await screen.findByRole('dialog', { name: 'Card: Close me' });
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
        fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close me' })));
    });

    it('guard: the close button still closes the card view', async () => {
        addCard({ title: 'Button close', columnId: 'todo' });
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Button close' }));
        expect(await screen.findByLabelText('Task title')).toHaveValue('Button close');
        await userEvent.setup().click(screen.getByRole('button', { name: 'Close project view' }));
        expect(screen.queryByLabelText('Task title')).toBeNull();
    });
});

// ── 2 + 3. WIP and exit-criteria modals ─────────────────────────────
describe('WIP limit modal', () => {
    function seedFullTodo(): void {
        addCard({ title: 'Resident', columnId: 'todo' });
        addCard({ title: 'Newcomer', columnId: 'backlog' });
        updateColumnLimits('todo', undefined, 1);
    }
    async function bulkMoveNewcomerToTodo(): Promise<void> {
        const user = userEvent.setup();
        await user.click(screen.getByRole('checkbox', { name: 'Select Newcomer' }));
        await user.selectOptions(screen.getByLabelText('Move selected cards to column'), 'To Do');
    }

    it('moving into a column at its max WIP opens a modal dialog named "WIP Limit Exceeded"', async () => {
        seedFullTodo();
        render(<TaskBoard />);
        await bulkMoveNewcomerToTodo();
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('Escape closes the WIP dialog without moving the card', async () => {
        seedFullTodo();
        render(<TaskBoard />);
        await bulkMoveNewcomerToTodo();
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        fireEvent.keyDown(dialog, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'WIP Limit Exceeded' })).toBeNull());
        expect(colOf('Newcomer')).toBe('backlog');
    });

    it('moves focus inside the WIP dialog', async () => {
        seedFullTodo();
        render(<TaskBoard />);
        await bulkMoveNewcomerToTodo();
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    });

    it('guard: Override & Proceed still performs the move', async () => {
        seedFullTodo();
        render(<TaskBoard />);
        await bulkMoveNewcomerToTodo();
        await screen.findByRole('heading', { name: 'WIP Limit Exceeded' });
        await userEvent.setup().click(screen.getByRole('button', { name: 'Override & Proceed' }));
        expect(colOf('Newcomer')).toBe('todo');
    });
});

describe('exit criteria modal', () => {
    function seedPolicy(): void {
        addCard({ title: 'Leaver', columnId: 'backlog' });
        updateColumnPolicies('backlog', ['Reviewed by a second person']);
    }
    async function bulkMoveLeaver(): Promise<void> {
        const user = userEvent.setup();
        await user.click(screen.getByRole('checkbox', { name: 'Select Leaver' }));
        await user.selectOptions(screen.getByLabelText('Move selected cards to column'), 'To Do');
    }

    it('moving out of a column with policies opens a modal dialog named "Column Exit Criteria Enforced"', async () => {
        seedPolicy();
        render(<TaskBoard />);
        await bulkMoveLeaver();
        const dialog = await screen.findByRole('dialog', { name: 'Column Exit Criteria Enforced' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(colOf('Leaver')).toBe('backlog');
    });

    it('Escape closes the exit-criteria dialog without moving the card', async () => {
        seedPolicy();
        render(<TaskBoard />);
        await bulkMoveLeaver();
        const dialog = await screen.findByRole('dialog', { name: 'Column Exit Criteria Enforced' });
        fireEvent.keyDown(dialog, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(colOf('Leaver')).toBe('backlog');
    });

    it('guard: ticking the policy then confirming performs the move', async () => {
        seedPolicy();
        render(<TaskBoard />);
        await bulkMoveLeaver();
        await screen.findByRole('heading', { name: 'Column Exit Criteria Enforced' });
        const user = userEvent.setup();
        await user.click(screen.getByRole('checkbox', { name: 'Reviewed by a second person' }));
        await user.click(screen.getByRole('button', { name: 'Move Card' }));
        expect(colOf('Leaver')).toBe('todo');
    });
});

// ── 4. Per-card move select ─────────────────────────────────────────
describe('per-card "Move <title> to" select', () => {
    it('lists the placeholder then only the OTHER columns, in board order', () => {
        addCard({ title: 'Mover', columnId: 'todo' });
        render(<TaskBoard />);
        const select = screen.getByRole('combobox', { name: 'Move Mover to' });
        const options = within(select).getAllByRole('option') as HTMLOptionElement[];
        expect(options.map(o => o.textContent)).toEqual(['Move to…', 'Backlog', 'In Progress', 'Done']);
        expect(options[0].disabled).toBe(true);
    });

    it('choosing a column moves the card', async () => {
        addCard({ title: 'Mover', columnId: 'todo' });
        render(<TaskBoard />);
        await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Move Mover to' }), 'Done');
        expect(colOf('Mover')).toBe('done');
    });

    it('announces the move in #a11y-live-region', async () => {
        addCard({ title: 'Mover', columnId: 'todo' });
        render(<TaskBoard />);
        await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Move Mover to' }), 'Done');
        await waitFor(() => expect(region()).toMatch(/Moved.*Mover.*to.*Done/));
    });

    it('still opens the WIP dialog when the target column is full, and does not move yet', async () => {
        addCard({ title: 'Resident', columnId: 'in-progress' });
        addCard({ title: 'Mover', columnId: 'todo' });
        updateColumnLimits('in-progress', undefined, 1);
        render(<TaskBoard />);
        await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Move Mover to' }), 'In Progress');
        await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        expect(colOf('Mover')).toBe('todo');
    });

    it('still opens the exit-criteria dialog when the source column has policies, and does not move yet', async () => {
        addCard({ title: 'Mover', columnId: 'todo' });
        updateColumnPolicies('todo', ['Tests written']);
        render(<TaskBoard />);
        await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Move Mover to' }), 'Done');
        await screen.findByRole('dialog', { name: 'Column Exit Criteria Enforced' });
        expect(colOf('Mover')).toBe('todo');
    });
});

// ── 5. Bulk move clears the selection ───────────────────────────────
describe('bulk "Move selected cards to column"', () => {
    it('moves every selected card and clears the selection', async () => {
        addCard({ title: 'One', columnId: 'backlog' });
        addCard({ title: 'Two', columnId: 'backlog' });
        render(<TaskBoard />);
        const user = userEvent.setup();
        await user.click(screen.getByRole('checkbox', { name: 'Select One' }));
        await user.click(screen.getByRole('checkbox', { name: 'Select Two' }));
        await user.selectOptions(screen.getByLabelText('Move selected cards to column'), 'Done');
        expect(colOf('One')).toBe('done');
        expect(colOf('Two')).toBe('done');
        expect(screen.queryByLabelText('Move selected cards to column')).toBeNull();
        expect(screen.getByRole('checkbox', { name: 'Select One' })).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Select Two' })).not.toBeChecked();
    });

    it('announces the bulk move', async () => {
        addCard({ title: 'One', columnId: 'backlog' });
        addCard({ title: 'Two', columnId: 'backlog' });
        render(<TaskBoard />);
        const user = userEvent.setup();
        await user.click(screen.getByRole('checkbox', { name: 'Select One' }));
        await user.click(screen.getByRole('checkbox', { name: 'Select Two' }));
        await user.selectOptions(screen.getByLabelText('Move selected cards to column'), 'Done');
        await waitFor(() => expect(region()).toMatch(/Moved 2 cards to Done/));
    });
});

// ── 6. Attachments ──────────────────────────────────────────────────
describe('attachments in the card view', () => {
    async function openCard(title: string): Promise<HTMLElement> {
        await userEvent.setup().click(screen.getByRole('button', { name: title }));
        return screen.findByRole('dialog', { name: `Card: ${title}` });
    }

    it('has a file input labelled "Attach files"', async () => {
        addCard({ title: 'Docs card', columnId: 'todo' });
        render(<TaskBoard />);
        const dialog = await openCard('Docs card');
        const input = within(dialog).getByLabelText('Attach files') as HTMLInputElement;
        expect(input.type).toBe('file');
        expect(input.multiple).toBe(true);
    });

    it('attaching a small file adds a "Download <name>" link carrying the bytes', async () => {
        addCard({ title: 'Docs card', columnId: 'todo' });
        render(<TaskBoard />);
        const dialog = await openCard('Docs card');
        const input = within(dialog).getByLabelText('Attach files') as HTMLInputElement;
        await userEvent.setup().upload(input, new File(['hello world'], 'notes.txt', { type: 'text/plain' }));
        const link = await within(dialog).findByRole('link', { name: 'Download notes.txt' });
        expect(link.getAttribute('href') ?? '').toMatch(/^data:/);
        expect(link).toHaveAttribute('download');
        expect(cardByTitle('Docs card').attachments?.map(a => a.name)).toEqual(['notes.txt']);
    });

    it('resets the input value after use so the same file can be chosen again', async () => {
        addCard({ title: 'Docs card', columnId: 'todo' });
        render(<TaskBoard />);
        const dialog = await openCard('Docs card');
        const input = within(dialog).getByLabelText('Attach files') as HTMLInputElement;
        await userEvent.setup().upload(input, new File(['x'], 'again.txt', { type: 'text/plain' }));
        await within(dialog).findByRole('link', { name: 'Download again.txt' });
        await waitFor(() => expect(input.value).toBe(''));
        expect(input.files?.length ?? 0).toBe(0);
    });
});

// ── 7. Undo ─────────────────────────────────────────────────────────
describe('toolbar "Undo last action"', () => {
    it('is disabled on an empty log and enabled after an action', () => {
        render(<TaskBoard />);
        expect(screen.getByRole('button', { name: 'Undo last action' })).toBeDisabled();
        act(() => { addCard({ title: 'Reversible' }); });
        expect(screen.getByRole('button', { name: 'Undo last action' })).toBeEnabled();
    });

    it('announces the UNDO entry summary and is disabled again once nothing is reversible', async () => {
        render(<TaskBoard />);
        act(() => { addCard({ title: 'Reversible' }); });
        await userEvent.setup().click(screen.getByRole('button', { name: 'Undo last action' }));
        const last = board().audit[board().audit.length - 1];
        expect(last.type).toBe('UNDO');
        await waitFor(() => expect(region()).toBe(last.summary));
        expect(screen.getByRole('button', { name: 'Undo last action' })).toBeDisabled();
    });
});

// ── 8. Destructive confirms ─────────────────────────────────────────
describe('removing a column', () => {
    it('guard: Remove column is enabled while several columns exist', () => {
        render(<TaskBoard />);
        expect(screen.getByRole('button', { name: 'Remove column To Do' })).toBeEnabled();
    });

    it('Remove column is disabled when only one column remains', () => {
        loadBoardState({ columns: [{ id: 'only', title: 'Only', width: 288, order: 0 }], cards: [], audit: [] });
        render(<TaskBoard />);
        expect(screen.getByRole('button', { name: 'Remove column Only' })).toBeDisabled();
    });

    it('asks window.confirm for a column that holds cards; cancel leaves it, OK removes it', async () => {
        addCard({ title: 'A', columnId: 'todo' });
        addCard({ title: 'B', columnId: 'todo' });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<TaskBoard />);
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Remove column To Do' }));
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Remove column "To Do" and its 2 card'));
        expect(board().columns).toHaveLength(4);
        expect(board().cards).toHaveLength(2);

        confirm.mockReturnValue(true);
        await user.click(screen.getByRole('button', { name: 'Remove column To Do' }));
        expect(board().columns.map(c => c.id)).not.toContain('todo');
        expect(board().cards).toHaveLength(0);
    });

    it('announces the removed column', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Remove column To Do' }));
        await waitFor(() => expect(region()).toMatch(/To Do/));
        expect(region()).toMatch(/remov/i);
    });
});

describe('Load Board', () => {
    const backup = (): File => new File([JSON.stringify({
        columns: [{ id: 'c1', title: 'Imported col', width: 288, order: 0 }],
        cards: [{ id: 'k1', title: 'Imported card', description: '', columnId: 'c1', order: 0,
            createdAt: '2026-01-01T00:00:00.000Z', enteredColumnAt: '2026-01-01T00:00:00.000Z' }],
        audit: [],
    })], 'backup.json', { type: 'application/json' });
    const loadInput = (): HTMLInputElement => document.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement;

    it('asks window.confirm before replacing; cancel keeps the current board', async () => {
        addCard({ title: 'Mine', columnId: 'todo' });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<TaskBoard />);
        await userEvent.setup().upload(loadInput(), backup());
        await waitFor(() => expect(confirm).toHaveBeenCalled());
        await act(async () => { await new Promise(r => setTimeout(r, 50)); });
        expect(board().cards.map(c => c.title)).toEqual(['Mine']);
        expect(screen.getByText('Mine')).toBeTruthy();
        expect(loadInput().value).toBe('');
    });

    it('replaces the board when confirmed and resets the file input', async () => {
        addCard({ title: 'Mine', columnId: 'todo' });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<TaskBoard />);
        await userEvent.setup().upload(loadInput(), backup());
        await waitFor(() => expect(board().cards.map(c => c.title)).toEqual(['Imported card']));
        expect(confirm).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(loadInput().value).toBe(''));
    });
});

// ── 9. Resize separator ─────────────────────────────────────────────
describe('column resize separator', () => {
    const sep = (title = 'To Do'): HTMLElement => screen.getByRole('separator', { name: `Resize column ${title}` });

    it('is keyboard-focusable and exposes its width as aria-valuenow with 200/640 bounds', () => {
        render(<TaskBoard />);
        expect(sep().tabIndex).toBe(0);
        expect(sep()).toHaveAttribute('aria-orientation', 'vertical');
        expect(sep()).toHaveAttribute('aria-valuenow', String(width('todo')));
        expect(sep()).toHaveAttribute('aria-valuemin', '200');
        expect(sep()).toHaveAttribute('aria-valuemax', '640');
    });

    it('ArrowRight widens the column by 16 and ArrowLeft narrows it back (committed on blur)', () => {
        render(<TaskBoard />);
        const start = width('todo');
        fireEvent.keyDown(sep(), { key: 'ArrowRight' });
        expect(sep()).toHaveAttribute('aria-valuenow', String(start + 16));
        fireEvent.blur(sep());
        expect(width('todo')).toBe(start + 16);
        fireEvent.keyDown(sep(), { key: 'ArrowLeft' });
        fireEvent.blur(sep());
        expect(width('todo')).toBe(start);
    });

    it('clamps at 640 on the right and 200 on the left', () => {
        render(<TaskBoard />);
        act(() => { resizeColumn('todo', 640); });
        fireEvent.keyDown(sep(), { key: 'ArrowRight' });
        fireEvent.blur(sep());
        expect(width('todo')).toBe(640);
        act(() => { resizeColumn('todo', 200); });
        fireEvent.keyDown(sep(), { key: 'ArrowLeft' });
        fireEvent.blur(sep());
        expect(width('todo')).toBe(200);
    });

    const resizeEntries = (): number => board().audit.filter(e => e.type === 'RESIZE_COLUMN').length;

    it('review fix 3: 40 key presses track aria-valuenow live and write ONE audit entry on blur', () => {
        render(<TaskBoard />);
        const start = width('todo');
        const before = resizeEntries();
        for (let i = 0; i < 40; i++) { fireEvent.keyDown(sep(), { key: 'ArrowRight' }); fireEvent.keyUp(sep(), { key: 'ArrowRight' }); }
        expect(sep()).toHaveAttribute('aria-valuenow', String(Math.min(640, start + 640)));
        expect(width('todo')).toBe(start); // nothing persisted yet
        expect(resizeEntries()).toBe(before);
        fireEvent.blur(sep());
        expect(width('todo')).toBe(640);
        expect(resizeEntries()).toBe(before + 1);
    });

    it('review fix 3: the resize also lands on its own once the keys go idle', async () => {
        render(<TaskBoard />);
        const start = width('todo');
        fireEvent.keyDown(sep(), { key: 'ArrowRight' });
        fireEvent.keyDown(sep(), { key: 'ArrowRight' });
        await waitFor(() => expect(width('todo')).toBe(start + 32), { timeout: 1500 });
    });
});

// ── 10. Reset on project switch + stale remembered project ──────────
describe('switching the project board', () => {
    it('closes an open column-settings popover and clears the add-card draft', async () => {
        render(<TaskBoard />);
        const user = userEvent.setup();
        await user.click(screen.getAllByRole('button', { name: '+ Add a card' })[0]);
        await user.type(screen.getByPlaceholderText('Card title…'), 'half typed');
        await user.click(screen.getAllByRole('button', { name: 'Column Settings & Limits' })[0]);
        expect(screen.getByRole('heading', { name: 'Column Settings' })).toBeTruthy();

        fireEvent.change(screen.getByLabelText(PICKER), { target: { value: 'p1' } });

        await waitFor(() => expect(screen.queryByRole('heading', { name: 'Column Settings' })).toBeNull());
        expect(screen.queryByPlaceholderText('Card title…')).toBeNull();
        expect(screen.getAllByRole('button', { name: '+ Add a card' }).length).toBeGreaterThan(0);
    });

    it('clears the multi-selection (guard: already true today)', async () => {
        addCard({ title: 'Picked', columnId: 'todo' });
        render(<TaskBoard />);
        await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select Picked' }));
        expect(screen.getByLabelText('Move selected cards to column')).toBeTruthy();
        fireEvent.change(screen.getByLabelText(PICKER), { target: { value: 'p1' } });
        await waitFor(() => expect(screen.queryByLabelText('Move selected cards to column')).toBeNull());
    });

    it('falls back to the Global board when the remembered project is not in a non-empty list', () => {
        patchWidgetMemory('task-board', { activeProjectId: 'deleted-project' });
        render(<TaskBoard />);
        expect((screen.getByLabelText(PICKER) as HTMLSelectElement).value).toBe('global');
        expect(['global', null]).toContain(taskBoardProjectIdHolder.current);
    });

    it('guard: keeps the remembered project while the project list is still empty (not loaded yet)', () => {
        hier.list = [];
        patchWidgetMemory('task-board', { activeProjectId: 'p1' });
        render(<TaskBoard />);
        expect(taskBoardProjectIdHolder.current).toBe('p1');
    });
});

// ── 11. Metrics ─────────────────────────────────────────────────────
describe('metrics dashboard', () => {
    async function openMetrics(): Promise<HTMLElement> {
        await userEvent.setup().click(screen.getByRole('button', { name: 'Metrics' }));
        return (screen.getByText('Kanban System Metrics').closest('aside') ?? document.body) as HTMLElement;
    }
    // Falls back to the pre-phase-4 button so the metric-logic tests below fail on logic, not on the missing tab role.
    const clickTab = async (name: RegExp): Promise<void> => {
        await userEvent.setup().click(screen.queryByRole('tab', { name }) ?? screen.getByRole('button', { name }));
    };
    const text = (el: HTMLElement): string => (el.textContent ?? '').replace(/\s+/g, ' ');

    it('exposes a tablist of role=tab with exactly one aria-selected tab that follows clicks', async () => {
        render(<TaskBoard />);
        await openMetrics();
        expect(screen.getByRole('tablist')).toBeTruthy();
        const tabs = screen.getAllByRole('tab');
        expect(tabs.length).toBeGreaterThanOrEqual(4);
        expect(tabs.filter(t => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
        expect(tabs.every(t => t.getAttribute('aria-selected') === 'true' || t.getAttribute('aria-selected') === 'false')).toBe(true);
        await clickTab(/throughput/i);
        expect(screen.getByRole('tab', { name: /throughput/i })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getAllByRole('tab').filter(t => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    });

    function seedDoneCard(): void {
        at(0);
        addCard({ title: 'Shipped one', columnId: 'backlog' });
        at(2); moveCards([cardByTitle('Shipped one').id], 'todo');
        at(6); moveCards([cardByTitle('Shipped one').id], 'done');
    }

    it('every chart wrapper is role=img with a non-empty aria-label (throughput and cycle tabs)', async () => {
        seedDoneCard();
        render(<TaskBoard />);
        const drawer = await openMetrics();
        for (const tab of [/throughput/i, /cycle/i]) {
            await clickTab(tab);
            const imgs = within(drawer).queryAllByRole('img');
            expect(imgs.length).toBeGreaterThanOrEqual(1);
            for (const img of imgs) expect((img.getAttribute('aria-label') ?? '').trim().length).toBeGreaterThan(0);
        }
    });

    it('cycle time starts at the first non-first-column bulk move (cardIds/to), not at creation', async () => {
        seedDoneCard(); // created day 0 in Backlog, bulk To Do on day 2, bulk Done on day 6
        render(<TaskBoard />);
        const drawer = await openMetrics();
        await clickTab(/cycle/i);
        expect(text(drawer)).toMatch(/Average Cycle Time\s*4(\.0)?\s*d/);
        expect(text(drawer)).toMatch(/Average Lead Time\s*6(\.0)?\s*d/);
        const label = within(drawer).getAllByRole('img').map(i => i.getAttribute('aria-label') ?? '').join(' | ');
        expect(label).toMatch(/\b4(\.0)?\b/);
    });

    it('cycle time ignores a reversed move: undone To Do move on day 1, real start on day 3', async () => {
        at(0);
        addCard({ title: 'Wobbly', columnId: 'backlog' });
        at(1); moveCard(cardByTitle('Wobbly').id, 'todo');
        undo(); // reverses the day-1 move; the card is back in Backlog
        at(3); moveCard(cardByTitle('Wobbly').id, 'in-progress');
        at(7); moveCard(cardByTitle('Wobbly').id, 'done');
        render(<TaskBoard />);
        const drawer = await openMetrics();
        await clickTab(/cycle/i);
        expect(text(drawer)).toMatch(/Average Cycle Time\s*4(\.0)?\s*d/);
        expect(text(drawer)).toMatch(/Average Lead Time\s*7(\.0)?\s*d/);
    });

    it('guard: a renamed last column still counts as Done', async () => {
        at(0);
        addCard({ title: 'Finished', columnId: 'backlog' });
        at(1); moveCard(cardByTitle('Finished').id, 'done');
        act(() => { renameColumn('done', 'Released'); });
        render(<TaskBoard />);
        const drawer = await openMetrics();
        await clickTab(/throughput/i);
        expect(text(drawer)).toMatch(/Completed Tasks\s*1(?!\d)/);
    });

    it('Done is the LAST column by order: cards in a newly added final column are completed, the old "done" column no longer counts', async () => {
        at(0);
        addCard({ title: 'Old done', columnId: 'backlog' });
        addCard({ title: 'New last 1', columnId: 'backlog' });
        addCard({ title: 'New last 2', columnId: 'backlog' });
        at(1);
        addColumn('Archive');
        const archive = board().columns.reduce((a, b) => (b.order > a.order ? b : a));
        expect(archive.title).toBe('Archive');
        moveCard(cardByTitle('Old done').id, 'done');
        moveCard(cardByTitle('New last 1').id, archive.id);
        moveCard(cardByTitle('New last 2').id, archive.id);
        render(<TaskBoard />);
        const drawer = await openMetrics();
        await clickTab(/throughput/i);
        expect(text(drawer)).toMatch(/Completed Tasks\s*2(?!\d)/); // id-based "done" logic would say 1
    });

    it('renders the throughput average per week', async () => {
        seedDoneCard();
        render(<TaskBoard />);
        const drawer = await openMetrics();
        await clickTab(/throughput/i);
        expect(text(drawer)).toMatch(/per week/i);
    });
});


// ── Review fixes (adversarial pass on 1aa7baa) ──────────────────────
describe('review fixes', () => {
    const opener = (title: string): HTMLElement => screen.getByRole('button', { name: title });
    const openMetricsTab = async (tab: RegExp): Promise<HTMLElement> => {
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Metrics' }));
        await user.click(screen.getByRole('tab', { name: tab }));
        return screen.getByText('Kanban System Metrics').closest('aside') as HTMLElement;
    };

    it('1: opening a next step from inside the card view keeps focus in the dialog and Escape still closes', async () => {
        const parent = addCard({ title: 'Parent', columnId: 'todo' }).cards.find(c => c.title === 'Parent')!;
        addSubtask(parent.id, 'Child step');
        patchWidgetMemory('task-board', { openCardId: parent.id });
        render(<TaskBoard />);
        const dialog = await screen.findByRole('dialog', { name: 'Card: Parent' });
        await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Child step' }));
        const next = await screen.findByRole('dialog', { name: 'Card: Child step' });
        await waitFor(() => expect(next.contains(document.activeElement)).toBe(true));
        fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('2: after a bulk move focus lands on the first moved card title', async () => {
        addCard({ title: 'One', columnId: 'backlog' });
        addCard({ title: 'Two', columnId: 'backlog' });
        render(<TaskBoard />);
        const user = userEvent.setup();
        await user.click(screen.getByRole('checkbox', { name: 'Select One' }));
        await user.click(screen.getByRole('checkbox', { name: 'Select Two' }));
        await user.selectOptions(screen.getByLabelText('Move selected cards to column'), 'Done');
        await waitFor(() => expect(document.activeElement).toBe(opener('One')));
    });

    it('2: after a per-card move confirmed through the exit dialog focus lands on the moved card title', async () => {
        addCard({ title: 'Mover', columnId: 'todo' });
        updateColumnPolicies('todo', ['Tests written']);
        render(<TaskBoard />);
        const user = userEvent.setup();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Move Mover to' }), 'Done');
        const dialog = await screen.findByRole('dialog', { name: 'Column Exit Criteria Enforced' });
        await user.click(within(dialog).getByRole('checkbox'));
        await user.click(within(dialog).getByRole('button', { name: 'Move Card' }));
        await waitFor(() => expect(document.activeElement).toBe(opener('Mover')));
        expect(colOf('Mover')).toBe('done');
    });

    it('4: an unparsable audit timestamp never shows NaN in the cycle metrics', async () => {
        at(0);
        addCard({ title: 'Odd', columnId: 'backlog' });
        at(2); moveCard(cardByTitle('Odd').id, 'todo');
        at(6); moveCard(cardByTitle('Odd').id, 'done');
        act(() => { taskBoardStore.set({ ...board(), audit: board().audit.map(e => (e.type === 'MOVE_CARD' && e.to === 'todo' ? { ...e, ts: 'yesterday' } : e)) }, () => undefined); });
        render(<TaskBoard />);
        const drawer = await openMetricsTab(/cycle/i);
        expect(drawer.textContent).not.toMatch(/NaN/);
        const label = within(drawer).getAllByRole('img').map(i => i.getAttribute('aria-label') ?? '').join(' | ');
        expect(label).not.toMatch(/NaN/);
    });

    it('5: a one-column board has no Done, so nothing counts as completed', async () => {
        for (const id of ['backlog', 'todo', 'in-progress']) removeColumn(id);
        addCard({ title: 'Lonely', columnId: 'done' });
        render(<TaskBoard />);
        const drawer = await openMetricsTab(/throughput/i);
        expect((drawer.textContent ?? '').replace(/\s+/g, ' ')).toMatch(/Completed Tasks\s*0(?!\d)/);
    });

    it('6: an orphaned sub-task (parent deleted) shows no "Parent project" button', async () => {
        const parent = addCard({ title: 'Doomed parent', columnId: 'todo' }).cards.find(c => c.title === 'Doomed parent')!;
        addSubtask(parent.id, 'Orphan');
        removeCard(parent.id);
        patchWidgetMemory('task-board', { openCardId: cardByTitle('Orphan').id });
        render(<TaskBoard />);
        await screen.findByRole('dialog', { name: 'Card: Orphan' });
        expect(screen.queryByRole('button', { name: /Parent project/ })).toBeNull();
    });

    it('7: cancelling the WIP dialog after a bulk move keeps the selection', async () => {
        addCard({ title: 'Resident', columnId: 'todo' });
        addCard({ title: 'Newcomer', columnId: 'backlog' });
        updateColumnLimits('todo', undefined, 1);
        render(<TaskBoard />);
        const user = userEvent.setup();
        await user.click(screen.getByRole('checkbox', { name: 'Select Newcomer' }));
        await user.selectOptions(screen.getByLabelText('Move selected cards to column'), 'To Do');
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(screen.getByRole('checkbox', { name: 'Select Newcomer' })).toBeChecked();
        expect(screen.getByLabelText('Move selected cards to column')).toBeTruthy();
    });

    it('7: no "Moved…" announcement when the confirmed move changed nothing (card removed meanwhile)', async () => {
        addCard({ title: 'Resident', columnId: 'in-progress' });
        addCard({ title: 'Mover', columnId: 'todo' });
        updateColumnLimits('in-progress', undefined, 1);
        render(<TaskBoard />);
        const user = userEvent.setup();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Move Mover to' }), 'In Progress');
        const dialog = await screen.findByRole('dialog', { name: 'WIP Limit Exceeded' });
        act(() => { removeCard(cardByTitle('Mover').id); });
        await user.click(within(dialog).getByRole('button', { name: /Override/ }));
        await act(async () => { await new Promise(r => setTimeout(r, 80)); });
        expect(region()).not.toMatch(/Moved/);
    });
});
