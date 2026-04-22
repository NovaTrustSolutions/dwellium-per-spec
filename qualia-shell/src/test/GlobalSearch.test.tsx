import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Mock strataApi — factory must not reference outer variables ──────────
vi.mock('../components/StrataDashboard/strataApi', () => ({
    strataGet: vi.fn(),
    strataPost: vi.fn(),
    strataDelete: vi.fn(),
}));

import { strataGet, strataPost, strataDelete } from '../components/StrataDashboard/strataApi';
import GlobalSearch from '../components/GlobalSearch/GlobalSearch';

const mockStrataGet = strataGet as ReturnType<typeof vi.fn>;
const mockStrataPost = strataPost as ReturnType<typeof vi.fn>;
const mockStrataDelete = strataDelete as ReturnType<typeof vi.fn>;

describe('GlobalSearch', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mockStrataGet.mockReset();
        mockStrataPost.mockReset();
        mockStrataDelete.mockReset();

        // strataPost must always return a promise (used in click-through logging)
        mockStrataPost.mockResolvedValue({});

        // Default mocks for mount effects
        mockStrataGet.mockImplementation(async (path: string) => {
            if (path.includes('/search/saved')) return [];
            if (path.includes('/search/health')) return { totalIndexed: 100 };
            if (path.includes('/search?')) {
                return {
                    results: [
                        { id: 'p1', type: 'property', name: 'Riverwood', subtitle: '123 Oak St', score: 0.95 },
                        { id: 't1', type: 'tenant', name: 'Jane Doe', subtitle: 'Unit 2A', score: 0.82 },
                    ],
                    totalResults: 2,
                    facets: { property: 1, tenant: 1 },
                    query: 'river',
                };
            }
            return {};
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the search input with ⌘K placeholder', () => {
        render(<GlobalSearch />);
        expect(screen.getByPlaceholderText('Search… ⌘K')).toBeInTheDocument();
    });

    it('renders facet filter chips', () => {
        render(<GlobalSearch />);
        expect(screen.getByText('All')).toBeInTheDocument();
        expect(screen.getByText('Property')).toBeInTheDocument();
        expect(screen.getByText('Tenant')).toBeInTheDocument();
    });

    it('shows search results after debounced input', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<GlobalSearch />);

        const input = screen.getByPlaceholderText('Search… ⌘K');
        await user.type(input, 'river');

        // Advance past 300ms debounce
        vi.advanceTimersByTime(350);

        await waitFor(() => {
            expect(screen.getByText('Riverwood')).toBeInTheDocument();
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        });

        // Footer with result count
        expect(screen.getByText('2 results')).toBeInTheDocument();
    });

    it('calls onNavigate when a result is clicked', async () => {
        const onNavigate = vi.fn();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<GlobalSearch onNavigate={onNavigate} />);

        await user.type(screen.getByPlaceholderText('Search… ⌘K'), 'river');
        vi.advanceTimersByTime(350);

        const result = await screen.findByText('Riverwood');
        await user.click(result);

        expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', type: 'property', name: 'Riverwood' }));
    });

    it('clears query and closes dropdown on Escape', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<GlobalSearch />);

        const input = screen.getByPlaceholderText('Search… ⌘K');
        await user.type(input, 'river');
        vi.advanceTimersByTime(350);

        await screen.findByText('Riverwood');
        await user.keyboard('{Escape}');

        expect(input).toHaveValue('');
    });

    it('shows no-results state when search returns empty', async () => {
        mockStrataGet.mockImplementation(async (path: string) => {
            if (path.includes('/search/saved')) return [];
            if (path.includes('/search/health')) return { totalIndexed: 100 };
            if (path.includes('/search?')) return { results: [], totalResults: 0, facets: {}, query: 'zzz' };
            return {};
        });

        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<GlobalSearch />);

        await user.type(screen.getByPlaceholderText('Search… ⌘K'), 'zzz');
        vi.advanceTimersByTime(350);

        await waitFor(() => {
            expect(screen.getByText(/No results for "zzz"/)).toBeInTheDocument();
        });
    });

    it('shows health indicator based on index health', async () => {
        render(<GlobalSearch />);
        // totalIndexed > 50 → 'good' (green dot) — wait for async health fetch
        await waitFor(() => {
            expect(screen.getByTitle('Index: 100 records')).toBeInTheDocument();
        });
    });
});
