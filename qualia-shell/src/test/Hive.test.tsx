/**
 * Hive — plan 071 Phase 2 (D2/D4/D5/D6/D8/D9). Renders the REAL widget with
 * no UserProvider (useIntegrations degrades to `_anonymous`, matching the
 * ApiKeysWidget test convention). WindowContext is mocked so `windows` /
 * `openWindow` are controllable per test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { copawStore, copawUserIdHolder, type MemoryFact } from '../components/Hive/copawStore';

const openWindow = vi.fn((component: string) => component);
let mockWindows: Array<{ component: string; minimized?: boolean }> = [];

vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({
        windows: mockWindows,
        openWindow,
    }),
}));

import Hive from '../components/Hive/Hive';

function seedFacts(facts: Partial<MemoryFact>[]) {
    const now = new Date().toISOString();
    const full: MemoryFact[] = facts.map((f, i) => ({
        id: f.id ?? `f${i}`,
        text: f.text ?? `Fact number ${i}`,
        source: f.source ?? 'Synthesis Lab',
        createdAt: f.createdAt ?? now,
    }));
    copawStore.set(full, () => {
        try { localStorage.setItem('dwellium:copaw-memory:_anonymous', JSON.stringify(full)); } catch { /* */ }
    });
}

beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
    copawUserIdHolder.current = null;
    copawStore.reset();
    mockWindows = [];
    openWindow.mockClear();
    cleanup();
});

describe('Hive agent grid', () => {
    it('renders all 7 agent cards', () => {
        render(<Hive />);
        expect(screen.getByText('ARA')).toBeTruthy();
        expect(screen.getByText('Stella')).toBeTruthy();
        expect(screen.getByText('Hydra')).toBeTruthy();
        expect(screen.getByText('Honcho')).toBeTruthy();
        expect(screen.getByText('Two Brains')).toBeTruthy();
        expect(screen.getByText('Synthesis Lab')).toBeTruthy();
        expect(screen.getByText('Builder Agents')).toBeTruthy();
    });

    it('header count only counts AGENTS windows, ignoring non-agent windows', () => {
        mockWindows = [{ component: 'scribe' }, { component: 'ara-console' }];
        render(<Hive />);
        expect(screen.getByText('1 open · 7 agents')).toBeTruthy();
    });

    it('a minimized agent window counts as closed', () => {
        mockWindows = [{ component: 'ara-console', minimized: true }];
        render(<Hive />);
        expect(screen.getByText('0 open · 7 agents')).toBeTruthy();
    });

    it('Run calls openWindow with the agent id, name, and empty icon', () => {
        render(<Hive />);
        fireEvent.click(screen.getAllByText('Run')[1]); // Stella card's Run button
        expect(openWindow).toHaveBeenCalledWith('stella-agent', 'Stella', '');
    });
});

describe('Hive CoPaw memory rail', () => {
    it('Clear with confirm=false leaves the store unchanged', () => {
        seedFacts([{ text: 'a persisted fact worth keeping around' }]);
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<Hive />);
        fireEvent.click(screen.getByLabelText('Clear CoPaw memory'));
        expect(copawStore.getSnapshot().length).toBe(1);
    });

    it('Clear with confirm=true empties the store', () => {
        seedFacts([{ text: 'a persisted fact worth keeping around' }]);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<Hive />);
        fireEvent.click(screen.getByLabelText('Clear CoPaw memory'));
        expect(copawStore.getSnapshot().length).toBe(0);
    });

    it('per-fact delete removes only that fact, no confirm needed', () => {
        seedFacts([
            { id: 'keep', text: 'keep this fact around please yes' },
            { id: 'drop', text: 'drop this other fact right now' },
        ]);
        const confirmSpy = vi.spyOn(window, 'confirm');
        render(<Hive />);
        fireEvent.click(screen.getByLabelText(/Delete fact: drop this other fact/));
        expect(confirmSpy).not.toHaveBeenCalled();
        const remaining = copawStore.getSnapshot();
        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe('keep');
    });

    it('filter narrows the visible list by text or source', () => {
        seedFacts([
            { id: 'a', text: 'the quarterly report ships on friday', source: 'Synthesis Lab' },
            { id: 'b', text: 'unrelated fact about something else', source: 'Builder Agents' },
        ]);
        render(<Hive />);
        fireEvent.change(screen.getByLabelText('Filter CoPaw memory'), { target: { value: 'quarterly' } });
        expect(screen.getByText('the quarterly report ships on friday')).toBeTruthy();
        expect(screen.queryByText('unrelated fact about something else')).toBeNull();
    });
});
