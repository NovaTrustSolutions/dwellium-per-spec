/**
 * TabGroupManager — Phase-10 Task 10.10 (C2): CRUD panel behavior against the
 * real tabGroupStore (no UserProvider needed — useTabGroups reads UserContext
 * via useContext and null-guards, per the repo's test-resilient convention).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TabGroupManager from '../components/Shell/TabGroupManager';
import { tabGroupStore, tabGroupsUserIdHolder, createGroup } from '../lib/tabGroupStore';

const OPEN_WINDOWS = [
    { component: 'scribe', title: 'Scribe' },
    { component: 'notepad', title: 'Notepad' },
    { component: 'inbox', title: 'Inbox Zero' },
];

beforeEach(() => {
    tabGroupsUserIdHolder.current = null; // anonymous in tests (no provider)
    try { localStorage.clear(); } catch { /* */ }
    (tabGroupStore as unknown as { reset?: () => void }).reset?.();
});

describe('TabGroupManager', () => {
    it('creates a group from selected open windows', () => {
        render(<TabGroupManager openWindows={OPEN_WINDOWS} onClose={() => { }} />);
        fireEvent.click(screen.getByLabelText('Include Scribe in the new group'));
        fireEvent.click(screen.getByLabelText('Include Notepad in the new group'));
        fireEvent.change(screen.getByLabelText('New group name'), { target: { value: 'Writing' } });
        fireEvent.click(screen.getByRole('button', { name: /Group \(2\)/ }));
        const groups = tabGroupStore.getSnapshot();
        expect(groups).toHaveLength(1);
        expect(groups[0].title).toBe('Writing');
        expect(groups[0].componentIds).toEqual(['scribe', 'notepad']);
    });

    it('create button is disabled with nothing selected', () => {
        render(<TabGroupManager openWindows={OPEN_WINDOWS} onClose={() => { }} />);
        expect(screen.getByRole('button', { name: /^Group\s*$/ })).toBeDisabled();
    });

    it('opens a saved group over the apply-space tabbed bus', () => {
        createGroup('Stack', ['scribe', 'notepad']);
        const handler = vi.fn();
        window.addEventListener('dwellium:apply-space', handler);
        try {
            render(<TabGroupManager openWindows={[]} onClose={() => { }} />);
            fireEvent.click(screen.getByLabelText('Open group Stack (2 tabs)'));
        } finally {
            window.removeEventListener('dwellium:apply-space', handler);
        }
        expect(handler).toHaveBeenCalledTimes(1);
        expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ widgets: ['scribe', 'notepad'], mode: 'tabbed' });
    });

    it('renames inline (Enter commits) and deletes', () => {
        createGroup('Old Name', ['scribe']);
        render(<TabGroupManager openWindows={[]} onClose={() => { }} />);
        fireEvent.click(screen.getByRole('button', { name: 'Rename group Old Name' }));
        const input = screen.getByLabelText('New name for group Old Name');
        fireEvent.change(input, { target: { value: 'New Name' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(tabGroupStore.getSnapshot()[0].title).toBe('New Name');
        fireEvent.click(screen.getByRole('button', { name: 'Delete group New Name' }));
        expect(tabGroupStore.getSnapshot()).toHaveLength(0);
    });

    it('removes a tab chip; removing the last chip deletes the group', () => {
        createGroup('Solo', ['scribe']);
        render(<TabGroupManager openWindows={[]} onClose={() => { }} />);
        fireEvent.click(screen.getByLabelText('Remove Scribe from Solo'));
        expect(tabGroupStore.getSnapshot()).toHaveLength(0);
    });

    it('P11-2: dropping a window-grip drag onto a group adds the tab', () => {
        createGroup('Drop Target', ['scribe']);
        render(<TabGroupManager openWindows={[]} onClose={() => { }} />);
        const row = screen.getByText('Drop Target').closest('li')!;
        const dataTransfer = {
            types: ['application/x-dwellium-widget'],
            getData: (t: string) => (t === 'application/x-dwellium-widget'
                ? JSON.stringify({ widgetType: 'notepad', title: 'Notepad' }) : ''),
            dropEffect: '',
        };
        fireEvent.dragOver(row, { dataTransfer });
        fireEvent.drop(row, { dataTransfer });
        expect(tabGroupStore.getSnapshot()[0].componentIds).toEqual(['scribe', 'notepad']);
    });

    it('P11-2: dropping a region-tab drag resolves the window id via openWindows', () => {
        createGroup('Drop Target', ['scribe']);
        render(<TabGroupManager openWindows={[{ id: 'win-7', component: 'inbox', title: 'Inbox Zero' }]} onClose={() => { }} />);
        const row = screen.getByText('Drop Target').closest('li')!;
        const dataTransfer = {
            types: ['text/tab-window-id'],
            getData: (t: string) => (t === 'text/tab-window-id' ? 'win-7' : ''),
            dropEffect: '',
        };
        fireEvent.dragOver(row, { dataTransfer });
        fireEvent.drop(row, { dataTransfer });
        expect(tabGroupStore.getSnapshot()[0].componentIds).toEqual(['scribe', 'inbox']);
    });

    it('dedupes open windows by component in the candidate list', () => {
        render(<TabGroupManager openWindows={[...OPEN_WINDOWS, { component: 'scribe', title: 'Scribe' }]} onClose={() => { }} />);
        expect(screen.getAllByLabelText(/Include Scribe/)).toHaveLength(1);
    });
});
