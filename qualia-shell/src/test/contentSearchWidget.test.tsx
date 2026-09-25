/**
 * ContentSearch — Phase 2 UI test (plan 069). Seeds the real dumpStore (localStorage-backed,
 * anonymous key since no UserContext.Provider wraps the render) with two brain dumps that both
 * match the query "alpha", then drives the widget through keyboard nav, highlighting, the type
 * filter chips, and the files-unavailable path. fetchTree is mocked per the sister pattern in
 * Workspace.loadTree.test.ts.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fetchTreeMock = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', () => ({
    fetchTree: () => fetchTreeMock(),
}));

import ContentSearch from '../components/ContentSearch/ContentSearch';
import { dumpStore, appendDump, clearDumps } from '../components/Scribe/dumpStore';
import { copawStore, clearMemory } from '../components/Hive/copawStore';

beforeEach(() => {
    fetchTreeMock.mockReset();
    fetchTreeMock.mockResolvedValue([]);
    clearDumps();
    dumpStore.reset();
    clearMemory();
    appendDump('alpha the first entry');
    appendDump('alpha the second entry, mentions alpha twice alpha');
});

describe('ContentSearch — Phase 2', () => {
    it('typing shows results with a <mark> highlight', async () => {
        const user = userEvent.setup();
        render(<ContentSearch />);

        await user.type(screen.getByRole('combobox', { name: 'Search all content' }), 'alpha');

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(2);
        expect(document.querySelectorAll('.cs-mark').length).toBeGreaterThan(0);
    });

    it('ArrowDown then Enter opens the selected (third) hit via dwellium:open-widget', async () => {
        // Ranked: dump "…alpha twice alpha" (3), "Prompt 1" (1), memory "zz-agent" (1) — the
        // memory hit is last and opens a different widget, so the dispatch proves WHICH row opened.
        copawStore.set([{ id: 'm1', text: 'alpha fact', source: 'zz-agent', createdAt: '2026-09-25T00:00:00Z' }], () => {});
        const user = userEvent.setup();
        const onOpen = vi.fn();
        window.addEventListener('dwellium:open-widget', onOpen as EventListener);

        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });
        await user.type(input, 'alpha');
        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(3);

        await user.keyboard('{ArrowDown}{ArrowDown}');
        expect(input).toHaveAttribute('aria-activedescendant', options[2].id);

        await user.keyboard('{Enter}');

        expect(onOpen).toHaveBeenCalledTimes(1);
        const detail = (onOpen.mock.calls[0][0] as CustomEvent).detail;
        expect(detail.widgetId).toBe('hive');

        window.removeEventListener('dwellium:open-widget', onOpen as EventListener);
    });

    it('Escape clears the query', async () => {
        const user = userEvent.setup();
        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });
        await user.type(input, 'alpha');
        await screen.findAllByRole('option');

        await user.keyboard('{Escape}');
        expect(input).toHaveValue('');
    });

    it('the type filter chip narrows the list to one result', async () => {
        copawStore.set([{ id: 'm1', text: 'alpha fact', source: 'zz-agent', createdAt: '2026-09-25T00:00:00Z' }], () => {});
        const user = userEvent.setup();
        render(<ContentSearch />);
        await user.type(screen.getByRole('combobox', { name: 'Search all content' }), 'alpha');
        expect(await screen.findAllByRole('option')).toHaveLength(3);

        const chip = screen.getByRole('button', { name: /Memory \(1\)/ });
        await user.click(chip);
        expect(chip).toHaveAttribute('aria-pressed', 'true');
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent('alpha fact');
    });

    it('Enter during IME composition does not open a hit', async () => {
        const user = userEvent.setup();
        const onOpen = vi.fn();
        window.addEventListener('dwellium:open-widget', onOpen as EventListener);
        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });
        await user.type(input, 'alpha');
        await screen.findAllByRole('option');

        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
        expect(onOpen).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onOpen).toHaveBeenCalledTimes(1);
        window.removeEventListener('dwellium:open-widget', onOpen as EventListener);
    });

    it('a new query resets the filter and selection in the same render', async () => {
        copawStore.set([{ id: 'm1', text: 'alpha fact', source: 'zz-agent', createdAt: '2026-09-25T00:00:00Z' }], () => {});
        const user = userEvent.setup();
        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });
        await user.type(input, 'alpha');
        await user.click(await screen.findByRole('button', { name: /Memory \(1\)/ }));
        expect(screen.getAllByRole('option')).toHaveLength(1);

        await user.type(input, ' the');   // "alpha the" matches only the two dumps
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(2);
        expect(screen.getByRole('button', { name: /All \(2\)/ })).toHaveAttribute('aria-pressed', 'true');
        expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
    });

    it('shows "Files unavailable" when fetchTree rejects', async () => {
        fetchTreeMock.mockReset();
        fetchTreeMock.mockRejectedValue(new Error('boom'));
        render(<ContentSearch />);
        await waitFor(() => {
            expect(screen.getByText(/Files unavailable/)).toBeInTheDocument();
        });
    });

    it('aria-activedescendant points at the selected option', async () => {
        const user = userEvent.setup();
        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });
        await user.type(input, 'alpha');
        const options = await screen.findAllByRole('option');

        expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('filters before the 50-row cap: a match ranked below the top 50 is reachable via its chip', async () => {
        for (let i = 0; i < 60; i++) appendDump(`alpha filler ${i}`);
        copawStore.set([{ id: 'm1', text: 'alpha fact', source: 'zz-agent', createdAt: '2026-09-25T00:00:00Z' }], () => {});
        const user = userEvent.setup();
        render(<ContentSearch />);
        await user.type(screen.getByRole('combobox', { name: 'Search all content' }), 'alpha');
        await screen.findAllByRole('option');

        expect(screen.getAllByRole('option')).toHaveLength(50);
        expect(screen.getByText('showing 50 of 63')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Memory \(1\)/ }));
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent('alpha fact');
    });
});
