import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({
        hierarchy: [
            { id: 'global', name: 'Global Board', type: 'project' }
        ]
    })
}));

import TaskBoard from '../components/TaskBoard/TaskBoard';
import { taskBoardStore, taskBoardUserIdHolder, addCard } from '../components/TaskBoard/taskBoardStore';
import { patchWidgetMemory, readWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';

// No UserProvider in this test → component resolves holder to null (anonymous),
// so we add cards under the same anonymous key to match.
beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    taskBoardUserIdHolder.current = null;
    taskBoardStore.reset();
    resetWidgetMemory(); // plan 055 phase 2 — v2.72.1 standing convention
    cleanup();
});

describe('TaskBoard renders (real component mount)', () => {
    it('mounts and shows the four default columns', () => {
        render(<TaskBoard />);
        expect(screen.getByText('Backlog')).toBeTruthy();
        expect(screen.getByText('To Do')).toBeTruthy();
        expect(screen.getByText('In Progress')).toBeTruthy();
        expect(screen.getByText('Done')).toBeTruthy();
    });

    it('renders a card that exists in the store', () => {
        addCard({ title: 'Render me', columnId: 'todo' });
        render(<TaskBoard />);
        expect(screen.getByText('Render me')).toBeTruthy();
    });

    it('opens the activity drawer and shows the logged add', () => {
        addCard({ title: 'Logged card', columnId: 'todo' });
        render(<TaskBoard />);
        // toggle the Activity drawer
        fireEvent.click(screen.getByText(/Activity \(/));
        expect(screen.getByText('Activity log')).toBeTruthy();
        expect(screen.getByText(/Added "Logged card"/)).toBeTruthy();
    });

    // Plan 055 phase 2 — widget memory round-trip.
    it('reopens the remembered card; a deleted card id falls back to no modal', () => {
        const state = addCard({ title: 'Resume me', columnId: 'todo' });
        const card = state.cards.find(c => c.title === 'Resume me')!;
        patchWidgetMemory('task-board', { openCardId: card.id });
        render(<TaskBoard />);
        expect(screen.getByLabelText('Task title')).toHaveValue('Resume me'); // project view restored
        // close → memory clears
        fireEvent.click(screen.getByRole('button', { name: 'Close project view' }));
        expect(readWidgetMemory('task-board', { openCardId: null as string | null }).openCardId).toBeNull();
        // stale id → board renders with no crash and no modal
        cleanup();
        patchWidgetMemory('task-board', { openCardId: 'card-that-was-deleted' });
        render(<TaskBoard />);
        expect(screen.getByText('Backlog')).toBeTruthy();
    });
});
