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

const fetchFileNamesMock = vi.fn();
const searchRemoteMock = vi.fn();
vi.mock('../components/ContentSearch/remoteSearch', () => ({
    fetchFileNames: (...args: unknown[]) => fetchFileNamesMock(...args),
    searchRemote: (...args: unknown[]) => searchRemoteMock(...args),
}));

import ContentSearch from '../components/ContentSearch/ContentSearch';
import { takePendingDeepLink } from '../lib/pendingDeepLink';
import { dumpStore, appendDump, clearDumps } from '../components/Scribe/dumpStore';
import { copawStore, clearMemory } from '../components/Hive/copawStore';
import { wikiStore } from '../components/Wiki/wikiStore';
import { foundryStore } from '../components/Foundry/foundryStore';

const TRANSCRIPT_LOG_KEY = 'dwellium-transcription-log';

beforeEach(() => {
    fetchTreeMock.mockReset();
    fetchTreeMock.mockResolvedValue([]);
    fetchFileNamesMock.mockReset();
    fetchFileNamesMock.mockResolvedValue(new Map());
    searchRemoteMock.mockReset();
    searchRemoteMock.mockResolvedValue({ hits: [], failed: false });
    clearDumps();
    dumpStore.reset();
    clearMemory();
    wikiStore.set({}, () => {});
    foundryStore.set([], () => {});
    localStorage.removeItem(TRANSCRIPT_LOG_KEY);
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

describe('ContentSearch — Phase 3 (plan 069)', () => {
    it('finds a saved transcript and Enter opens transcription + dispatches dwellium:open-transcription-log', async () => {
        localStorage.setItem(TRANSCRIPT_LOG_KEY, JSON.stringify([
            { id: 'log-1', title: 'Standup call', segments: [{ text: 'we discussed zeta rollout', speaker: 'Ilya' }], createdAt: Date.now() },
        ]));
        const user = userEvent.setup();
        const onOpenWidget = vi.fn();
        const onOpenLog = vi.fn();
        window.addEventListener('dwellium:open-widget', onOpenWidget as EventListener);
        window.addEventListener('dwellium:open-transcription-log', onOpenLog as EventListener);

        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });
        await user.type(input, 'zeta');
        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent('Standup call');

        await user.keyboard('{Enter}');
        expect(onOpenWidget).toHaveBeenCalledTimes(1);
        expect((onOpenWidget.mock.calls[0][0] as CustomEvent).detail.widgetId).toBe('transcription');

        await waitFor(() => expect(onOpenLog).toHaveBeenCalledTimes(1));
        expect((onOpenLog.mock.calls[0][0] as CustomEvent).detail).toEqual({ logId: 'log-1' });

        window.removeEventListener('dwellium:open-widget', onOpenWidget as EventListener);
        window.removeEventListener('dwellium:open-transcription-log', onOpenLog as EventListener);
    });

    it('a remote note hit appears after local hits and opening it dispatches qualia-notepad-open-note', async () => {
        appendDump('gizmo project notes');
        searchRemoteMock.mockResolvedValue({
            hits: [{ id: 'note-77', type: 'note', title: 'Gizmo Notes', body: 'plans for gizmo', widget: 'notepad', ref: '77', score: 0, snippet: 'plans for gizmo' }],
            failed: false,
        });
        const user = userEvent.setup();
        const onOpenWidget = vi.fn();
        const onOpenNote = vi.fn();
        window.addEventListener('dwellium:open-widget', onOpenWidget as EventListener);
        window.addEventListener('qualia-notepad-open-note', onOpenNote as EventListener);

        render(<ContentSearch />);
        await user.type(screen.getByRole('combobox', { name: 'Search all content' }), 'gizmo');

        await waitFor(() => {
            expect(screen.getAllByRole('option').some((o) => o.textContent?.includes('Gizmo Notes'))).toBe(true);
        });
        const options = screen.getAllByRole('option');
        const noteRow = options.find((o) => o.textContent?.includes('Gizmo Notes'))!;
        // Remote hits are appended after local hits, never re-ranked into them.
        expect(options.indexOf(noteRow)).toBe(options.length - 1);

        await user.click(noteRow);
        expect(onOpenWidget).toHaveBeenCalledTimes(1);
        expect((onOpenWidget.mock.calls[0][0] as CustomEvent).detail.widgetId).toBe('notepad');
        await waitFor(() => expect(onOpenNote).toHaveBeenCalledTimes(1));
        expect((onOpenNote.mock.calls[0][0] as CustomEvent).detail).toEqual({ noteId: '77', title: 'Gizmo Notes' });
        // Notepad isn't mounted here, so nobody took the slot — it waits for Notepad's mount.
        expect(takePendingDeepLink('notepad')).toBe('77');

        window.removeEventListener('dwellium:open-widget', onOpenWidget as EventListener);
        window.removeEventListener('qualia-notepad-open-note', onOpenNote as EventListener);
    });

    it('shows an unavailable warning when the remote search fails, without blocking local results', async () => {
        searchRemoteMock.mockResolvedValue({ hits: [], failed: true });
        const user = userEvent.setup();
        render(<ContentSearch />);
        await user.type(screen.getByRole('combobox', { name: 'Search all content' }), 'alpha');
        expect(await screen.findAllByRole('option')).toHaveLength(2); // local dumps unaffected
        await waitFor(() => {
            expect(screen.getByText('Notes / file contents unavailable — showing local results.')).toBeInTheDocument();
        });
    });

    it('a stale slow response for an old query does not replace the newer query\'s results', async () => {
        let resolveOld: (v: { hits: unknown[]; failed: boolean }) => void = () => {};
        searchRemoteMock.mockImplementation((q: string) => {
            if (q === 'ab') return new Promise((resolve) => { resolveOld = resolve; });
            return Promise.resolve({
                hits: [{ id: 'note-new', type: 'note', title: 'New Note', body: '', widget: 'notepad', ref: 'n2', score: 0, snippet: 'new' }],
                failed: false,
            });
        });
        const user = userEvent.setup();
        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });

        await user.type(input, 'ab');
        await waitFor(() => expect(searchRemoteMock).toHaveBeenCalledWith('ab', expect.anything(), expect.anything()));

        await user.type(input, 'c');
        await waitFor(() => expect(searchRemoteMock).toHaveBeenCalledWith('abc', expect.anything(), expect.anything()));
        await screen.findByText('New Note');

        // The old ('ab') request finally resolves AFTER the newer ('abc') one already rendered —
        // the sequence guard must drop it.
        resolveOld({ hits: [{ id: 'note-old', type: 'note', title: 'Old Note', body: '', widget: 'notepad', ref: 'n1', score: 0, snippet: 'old' }], failed: false });
        await new Promise((r) => setTimeout(r, 50));

        expect(screen.queryByText('Old Note')).not.toBeInTheDocument();
        expect(screen.getByText('New Note')).toBeInTheDocument();
    });

    it('wiki sources[] and foundry target/assessment text are searchable', async () => {
        wikiStore.set({
            '/domain/x': {
                path: '/domain/x', tier: 'domain', name: 'X Wiki', overview: 'overview', concepts: [], openQuestions: [],
                sources: ['zorbathon-reference.md'], compiledAt: '2026-09-01T00:00:00Z', compiledBy: 'outline',
            },
        }, () => {});
        foundryStore.set([
            {
                id: 'fd1', createdAt: '2026-09-01T00:00:00Z', sourceType: 'paste', sourceUrl: null,
                rawContent: 'captured text', tags: [], target: null, qualityScore: null,
                assessment: 'quibblewick assessment note', status: 'triaged', triagedBy: 'heuristic',
            },
        ], () => {});

        const user = userEvent.setup();
        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });

        await user.type(input, 'zorbathon');
        const wikiOptions = await screen.findAllByRole('option');
        expect(wikiOptions).toHaveLength(1);
        expect(wikiOptions[0]).toHaveTextContent('X Wiki');

        await user.clear(input);
        await user.type(input, 'quibblewick');
        const foundryOptions = await screen.findAllByRole('option');
        expect(foundryOptions).toHaveLength(1);
        expect(foundryOptions[0]).toHaveTextContent('captured text');
    });

    it('remote hits from the previous query disappear as soon as the query changes', async () => {
        searchRemoteMock.mockImplementation(async (q: string) => (q === 'gizmo'
            ? { hits: [{ id: 'note-1', type: 'note', title: 'Gizmo Remote', body: 'gizmo', widget: 'notepad', ref: '1', score: 0, snippet: 'gizmo' }], failed: false }
            : new Promise(() => {})));   // the next query's request never settles
        const user = userEvent.setup();
        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });
        await user.type(input, 'gizmo');
        const hasRemote = () => screen.queryAllByRole('option').some((o) => o.textContent?.includes('Gizmo Remote'));
        await waitFor(() => expect(hasRemote()).toBe(true));

        await user.type(input, 'x');
        expect(hasRemote()).toBe(false);
    });

    it('a window focus does not re-run the remote search for the same query', async () => {
        fetchFileNamesMock.mockImplementation(async () => new Map());   // real fetchFileNames returns a NEW map each call
        const user = userEvent.setup();
        render(<ContentSearch />);
        await user.type(screen.getByRole('combobox', { name: 'Search all content' }), 'gizmo');
        await waitFor(() => expect(searchRemoteMock).toHaveBeenCalledTimes(1));
        window.dispatchEvent(new Event('focus'));
        await new Promise((r) => setTimeout(r, 400));
        expect(searchRemoteMock).toHaveBeenCalledTimes(1);
    });

    it('a transcript saved in the same tab (no storage/focus event) is found on the next keystroke', async () => {
        const user = userEvent.setup();
        render(<ContentSearch />);
        const input = screen.getByRole('combobox', { name: 'Search all content' });
        await user.type(input, 'quokk');
        localStorage.setItem(TRANSCRIPT_LOG_KEY, JSON.stringify([
            { id: 'log-9', title: 'Zoo visit', segments: [{ text: 'we saw a quokka', speaker: 'Ilya' }], createdAt: Date.now() },
        ]));
        await user.type(input, 'a');
        await waitFor(() => {
            expect(screen.getAllByRole('option').some((o) => o.textContent?.includes('Zoo visit'))).toBe(true);
        });
    });
});
