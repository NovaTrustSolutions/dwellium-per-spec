import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import TaskBoard from '../components/TaskBoard/TaskBoard';
import { taskBoardStore, taskBoardUserIdHolder, addCard } from '../components/TaskBoard/taskBoardStore';

// No UserProvider in this test → component resolves holder to null (anonymous),
// so we add cards under the same anonymous key to match.
beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    taskBoardUserIdHolder.current = null;
    taskBoardStore.reset();
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
});
