/**
 * ClaudeCodeRow — plan 068 Phase 3. Verifies the row never claims Claude Code
 * CLI usage is spend, and renders nothing when there's no usage to show.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClaudeCodeRow from '../components/AiSpend/ClaudeCodeRow';

const mockUseClaudeCodeUsage = vi.fn();
vi.mock('../lib/cliUsage', () => ({
    useClaudeCodeUsage: () => mockUseClaudeCodeUsage(),
}));

afterEach(() => {
    mockUseClaudeCodeUsage.mockReset();
});

describe('ClaudeCodeRow', () => {
    it('renders nothing when usage is null (prod, missing file, garbage)', () => {
        mockUseClaudeCodeUsage.mockReturnValue(null);
        const { container } = render(<ClaudeCodeRow />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the API-equivalent figure and covered-by-plan note when a model was priced', () => {
        mockUseClaudeCodeUsage.mockReturnValue({
            totals: { freshInputTokens: 100_000, cacheReadTokens: 2_000_000, cacheCreationTokens: 50_000, outputTokens: 20_000 },
            periodLabel: 'as of 9/25/2026',
            apiEquivalentUsd: 12.34,
        });
        render(<ClaudeCodeRow />);

        expect(screen.getByText('Claude Code (CLI)')).toBeInTheDocument();
        expect(screen.getByText(/\$12\.34 at API rates/)).toBeInTheDocument();
        expect(screen.getByText(/Covered by your plan — not counted in spend/)).toBeInTheDocument();
        expect(screen.getByText('as of 9/25/2026')).toBeInTheDocument();
    });

    it('shows "unavailable" copy, never a fabricated dollar figure, when no model was recorded', () => {
        mockUseClaudeCodeUsage.mockReturnValue({
            totals: { freshInputTokens: 100_000, cacheReadTokens: 2_000_000, cacheCreationTokens: 50_000, outputTokens: 20_000 },
            periodLabel: 'all time',
            apiEquivalentUsd: null,
        });
        render(<ClaudeCodeRow />);

        expect(screen.getByText('API-equivalent unavailable — model not recorded')).toBeInTheDocument();
        expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    });

    it('never labels the figure as spend', () => {
        mockUseClaudeCodeUsage.mockReturnValue({
            totals: { freshInputTokens: 1, cacheReadTokens: 1, cacheCreationTokens: 1, outputTokens: 1 },
            periodLabel: 'all time',
            apiEquivalentUsd: 0.01,
        });
        const { container } = render(<ClaudeCodeRow />);
        expect(container.textContent).not.toMatch(/\bspend\b/i);
    });
});
