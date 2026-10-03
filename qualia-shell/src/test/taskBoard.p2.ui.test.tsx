/**
 * Plan 079 phase 2 — Task Board UI (contract B3 and the B7 toolbar alert).
 *   B3  mounting TaskBoard, and changing the project select, hydrates the board that is now active
 *       (taskBoardStore.hydrate() then migrate(), fire-and-forget).
 *   B7  a failed local write shows taskBoardSaveError in the toolbar with role="alert"; a later good write clears it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({
        hierarchy: [{ id: 'p1', name: 'Alpha', type: 'project' }],
    }),
}));

import TaskBoard from '../components/TaskBoard/TaskBoard';
import {
    taskBoardStore, taskBoardUserIdHolder, taskBoardProjectIdHolder, addCard,
} from '../components/TaskBoard/taskBoardStore';
import { resetWidgetMemory } from '../lib/widgetMemory';

const PICKER = 'Select active project board';

beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    taskBoardUserIdHolder.current = null;
    taskBoardProjectIdHolder.current = null;
    taskBoardStore.reset();
    resetWidgetMemory();
    cleanup();
});

afterEach(() => { cleanup(); });

describe('B3 TaskBoard hydrates the active board', () => {
    function spyOnSync(): { hydrate: ReturnType<typeof vi.fn>; migrate: ReturnType<typeof vi.fn>; order: string[]; projectAtHydrate: Array<string | null> } {
        const order: string[] = [];
        const projectAtHydrate: Array<string | null> = [];
        const hydrate = vi.spyOn(taskBoardStore, 'hydrate').mockImplementation(async () => {
            order.push('hydrate');
            projectAtHydrate.push(taskBoardProjectIdHolder.current);
        });
        const migrate = vi.spyOn(taskBoardStore, 'migrate').mockImplementation(async () => { order.push('migrate'); });
        return { hydrate, migrate, order, projectAtHydrate };
    }

    it('hydrates once on mount, then migrates', async () => {
        const spy = spyOnSync();
        render(<TaskBoard />);
        await waitFor(() => expect(spy.migrate).toHaveBeenCalledTimes(1));
        expect(spy.hydrate).toHaveBeenCalledTimes(1);
        expect(spy.order).toEqual(['hydrate', 'migrate']);
    });

    it('changing the project select triggers exactly one more hydrate, for the new board', async () => {
        const spy = spyOnSync();
        render(<TaskBoard />);
        await waitFor(() => expect(spy.migrate).toHaveBeenCalledTimes(1));

        fireEvent.change(screen.getByLabelText(PICKER), { target: { value: 'p1' } });

        await waitFor(() => expect(spy.hydrate).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(spy.migrate).toHaveBeenCalledTimes(2));
        expect(spy.projectAtHydrate[1]).toBe('p1'); // the holder already pointed at the new board when hydrate ran
        expect(spy.order).toEqual(['hydrate', 'migrate', 'hydrate', 'migrate']);
    });

    it('does not hydrate again on a re-render of the same board', async () => {
        const spy = spyOnSync();
        const { rerender } = render(<TaskBoard />);
        await waitFor(() => expect(spy.migrate).toHaveBeenCalledTimes(1));
        rerender(<TaskBoard />);
        act(() => { addCard({ title: 'unrelated re-render' }); });
        await act(async () => { await Promise.resolve(); });
        expect(spy.hydrate).toHaveBeenCalledTimes(1);
    });

    it('a hydrate that rejects does not break the board (errors swallowed)', async () => {
        const hydrate = vi.spyOn(taskBoardStore, 'hydrate').mockRejectedValue(new Error('boom'));
        const onUnhandled = vi.fn();
        process.on('unhandledRejection', onUnhandled);
        try {
            render(<TaskBoard />);
            await act(async () => { await new Promise(r => setTimeout(r, 20)); });
            expect(hydrate).toHaveBeenCalled(); // the board did try to hydrate
            expect(screen.getByText('Backlog')).toBeTruthy();
            expect(onUnhandled).not.toHaveBeenCalled();
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });
});

describe('B7 toolbar shows a local save failure', () => {
    // No UserProvider in this test, so the board key is the anonymous one.
    const KEY = 'taskboard:_anonymous';

    it('shows an alert when the board cannot be written to localStorage and clears it on the next good write', async () => {
        render(<TaskBoard />);
        expect(screen.queryByRole('alert')).toBeNull();

        const real = localStorage.setItem.bind(localStorage);
        const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
            if (k === KEY) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
            real(k, v);
        });
        act(() => { addCard({ title: 'does not fit' }); });
        const alert = await screen.findByRole('alert');
        expect(alert.textContent?.trim().length).toBeGreaterThan(0);

        spy.mockRestore();
        act(() => { addCard({ title: 'fits again' }); });
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
});
