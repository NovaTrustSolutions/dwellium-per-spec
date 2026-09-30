/**
 * Wiki widget hardening tests (plan wiki-widget-hardening §C).
 *
 * Covers: content-backed compile (excerpts, no invented sources), confirm
 * before an outline overwrites an AI page, error clearing on selection
 * change, offline fallback to stored pages + retry, stale badge, list
 * filter + count, deep-link selection, and a StrictMode compile pass.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import Wiki from '../components/Wiki/Wiki';
import { wikiStore, setWikiPage, type WikiPage } from '../components/Wiki/wikiStore';
import type { FileEntry } from '../components/FileExplorer/FileExplorerCell';

const mockFetchTree = vi.fn();
const mockReadFile = vi.fn();
vi.mock('../components/FileExplorer/fileExplorerApi', () => ({
    fetchTree: (...args: unknown[]) => mockFetchTree(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// Control the active LLM bundle directly; keep the real hasActiveLlm/callLlm
// wiring otherwise (StellaAgent.test.tsx pattern) so Wiki's own logic decides
// the LLM-vs-outline path exactly as it does in production.
let mockLlmBundle: any = { active: null };
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: mockLlmBundle } }),
}));
const mockCallLlm = vi.fn();
vi.mock('../lib/llmClient', async (orig) => ({
    ...(await orig<object>()),
    callLlm: (...args: unknown[]) => mockCallLlm(...args),
}));

const ACTIVE_LLM = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'sk-test' } };
const NO_LLM = { active: null };

const TREE: FileEntry[] = [
    {
        name: 'Acme', path: 'Acme', tier: 'domain', children: [
            { name: 'notes.md', path: 'Acme/notes.md', tier: 'file', modified: '2026-01-01T00:00:00.000Z' },
        ],
    },
    { name: 'Beta', path: 'Beta', tier: 'domain', children: [] },
];

function llmJson(overview: string, sources: string[]): { text: string } {
    return { text: JSON.stringify({ overview, concepts: ['c1'], openQuestions: ['q1'], sources }) };
}

beforeEach(() => {
    localStorage.clear();
    wikiStore.reset();
    mockLlmBundle = NO_LLM;
    mockFetchTree.mockReset();
    mockFetchTree.mockResolvedValue(TREE);
    mockReadFile.mockReset();
    mockReadFile.mockImplementation(async (p: string) => ({ content: `content of ${p}`, size: 10, modified: '2026-01-01T00:00:00.000Z' }));
    mockCallLlm.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Wiki compile', () => {
    it('sends real excerpts in the prompt and renders the page; invented source paths are not shown', async () => {
        mockLlmBundle = ACTIVE_LLM;
        mockCallLlm.mockResolvedValue(llmJson('Overview text', ['Acme/notes.md', 'invented.md']));
        render(<Wiki />);
        fireEvent.click(await screen.findByRole('button', { name: 'Acme, domain' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Compile' }));
        await screen.findByText('Overview text');

        expect(mockCallLlm).toHaveBeenCalledTimes(1);
        const prompt = mockCallLlm.mock.calls[0][0].prompt as string;
        expect(prompt).toContain('content of Acme/notes.md');

        expect(screen.getByText('Acme/notes.md')).toBeInTheDocument();
        expect(screen.queryByText('invented.md')).not.toBeInTheDocument();
    });
});

describe('outline-over-AI confirm gate', () => {
    beforeEach(() => {
        const aiPage: WikiPage = {
            path: 'Acme', tier: 'domain', name: 'Acme',
            overview: 'Original AI overview', concepts: [], openQuestions: [],
            sources: ['Acme/notes.md'], compiledAt: '2026-01-01T00:00:00.000Z', compiledBy: 'llm',
        };
        setWikiPage(aiPage);
    });

    it('cancel keeps the AI page', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<Wiki />);
        fireEvent.click(await screen.findByRole('button', { name: /^Acme, domain/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Recompile' }));
        expect(window.confirm).toHaveBeenCalled();
        expect(screen.getByText('Original AI overview')).toBeInTheDocument();
    });

    it('accept replaces it with a structure-only outline', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<Wiki />);
        fireEvent.click(await screen.findByRole('button', { name: /^Acme, domain/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Recompile' }));
        await waitFor(() => expect(screen.queryByText('Original AI overview')).not.toBeInTheDocument());
        expect(screen.getByText((_, el) => el?.className === 'wiki-meta' && !!el.textContent?.includes('structure only'))).toBeInTheDocument();
    });
});

describe('error handling', () => {
    it('clears the error on selection change', async () => {
        mockLlmBundle = ACTIVE_LLM;
        mockCallLlm.mockRejectedValue(new Error('LLM boom'));
        render(<Wiki />);
        fireEvent.click(await screen.findByRole('button', { name: 'Acme, domain' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Compile' }));
        await screen.findByText('LLM boom');

        fireEvent.click(await screen.findByRole('button', { name: 'Beta, domain' }));
        expect(screen.queryByText('LLM boom')).not.toBeInTheDocument();
    });
});

describe('offline fallback', () => {
    it('shows stored pages when the tree fetch fails, and Retry refetches', async () => {
        const stored: WikiPage = {
            path: 'Stored/Page', tier: 'thread', name: 'Stored Page',
            overview: '', concepts: [], openQuestions: [], sources: [],
            compiledAt: '2026-01-01T00:00:00.000Z', compiledBy: 'outline',
        };
        setWikiPage(stored);
        mockFetchTree.mockRejectedValueOnce(new Error('network down'));

        render(<Wiki />);
        await screen.findByText('File backend offline — showing saved pages.');
        expect(screen.getByRole('button', { name: /^Stored Page,/ })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.queryByText('File backend offline — showing saved pages.')).not.toBeInTheDocument());
        expect(await screen.findByRole('button', { name: 'Acme, domain' })).toBeInTheDocument();
    });
});

describe('stale badge', () => {
    it('appears when a source was modified after compiledAt', async () => {
        const page: WikiPage = {
            path: 'Acme', tier: 'domain', name: 'Acme',
            overview: 'X', concepts: [], openQuestions: [],
            sources: ['Acme/notes.md'], inputs: ['Acme/notes.md'],
            compiledAt: '2020-01-01T00:00:00.000Z', compiledBy: 'outline',
        };
        setWikiPage(page); // notes.md's tree `modified` (2026-01-01) postdates this compiledAt
        render(<Wiki />);
        expect(await screen.findByRole('button', { name: /^Acme, domain, compiled, out of date$/ })).toBeInTheDocument();
        expect(screen.getAllByText('Out of date').length).toBeGreaterThan(0);
    });
});

describe('list filter + count', () => {
    it('narrows the list and updates the count text', async () => {
        const page: WikiPage = {
            path: 'Acme', tier: 'domain', name: 'Acme',
            overview: 'X', concepts: [], openQuestions: [], sources: [],
            compiledAt: '2026-06-01T00:00:00.000Z', compiledBy: 'outline',
        };
        setWikiPage(page);
        render(<Wiki />);
        await screen.findByRole('button', { name: /^Beta, domain/ });
        expect(screen.getByText('1 of 2 compiled')).toBeInTheDocument();

        const filterInput = screen.getByRole('searchbox', { name: 'Filter pages' });
        fireEvent.change(filterInput, { target: { value: 'Ac' } });
        expect(screen.getByText('1 of 1 compiled')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Beta,/ })).not.toBeInTheDocument();

        fireEvent.change(filterInput, { target: { value: 'zzz' } });
        expect(screen.getByText('No pages match.')).toBeInTheDocument();
    });
});

describe('deep link', () => {
    it('selects the page named by dwellium:wiki-open-page', async () => {
        render(<Wiki />);
        await screen.findByRole('button', { name: 'Acme, domain' });
        // The listener effect is already attached (findByRole above proved a committed
        // render), but `dispatchEvent` fires outside React's event system, so the
        // resulting setState is only scheduled, not applied. Flush it inside `act` —
        // under CPU load (parallel test workers) the flush can take longer than
        // `waitFor`'s default 1s timeout, which read as a flaky "event lost" failure
        // but was really the assertion racing an unflushed update.
        await act(async () => {
            window.dispatchEvent(new CustomEvent('dwellium:wiki-open-page', { detail: { path: 'Beta' } }));
        });
        expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument();
    });
});

describe('StrictMode', () => {
    it('completes a compile without unmounted-ref errors', async () => {
        render(
            <React.StrictMode>
                <Wiki />
            </React.StrictMode>,
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Acme, domain' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Compile' }));
        await screen.findByText('Page compiled.');
        expect(await screen.findByRole('button', { name: 'Recompile' })).toBeInTheDocument();
    });
});

describe('Wiki focus', () => {
    it('follows an active-thread change from another widget without stealing focus', async () => {
        const { setActiveThread, activeThreadStore } = await import('../components/Workspace/activeThreadStore');
        activeThreadStore.reset();
        render(<><input aria-label="other widget" /><Wiki /></>);
        await screen.findByRole('button', { name: 'Acme, domain' });
        const other = screen.getByLabelText('other widget');
        other.focus();
        setActiveThread({ path: 'Beta', name: 'Beta' } as any);
        await screen.findByRole('heading', { level: 2, name: 'Beta' });
        expect(document.activeElement).toBe(other);
        activeThreadStore.reset();
    });

    it('moves focus to the page heading when the user picks a node', async () => {
        render(<Wiki />);
        fireEvent.click(await screen.findByRole('button', { name: 'Beta, domain' }));
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Beta' })));
    });
});
