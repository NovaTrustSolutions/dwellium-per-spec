/**
 * Ilya 2026-09-04: "run the board button needs to exist apart from the interview me button".
 * The first screen must offer "Run the board →" next to "Interview me first →", and clicking it
 * must run the board directly (skip-interview path) with exactly one LLM call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const callLlmMock = vi.fn();
vi.mock('../lib/llmClient', () => ({
    hasActiveLlm: () => true,
    callLlm: (...args: any[]) => callLlmMock(...args),
    LlmError: class LlmError extends Error {},
}));
vi.mock('../lib/oneSaveClient', () => ({
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue([]) },
    ONE_SAVE_ENABLED: false,
}));
vi.mock('../hooks/useAIAvailability', () => ({
    useAIAvailability: () => ({ status: 'ready', ready: true, reason: null, configure: () => {}, recheck: () => {} }),
}));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { active: 'anthropic', anthropic: { enabled: true, apiKey: 'test' } } }, update: () => {}, replace: () => {}, clear: () => {}, removeSecret: () => {} }),
}));
vi.mock('../lib/perUserIdentity', async (orig) => ({ ...(await orig<any>()), usePerUserIdentity: () => 'u-test' }));

import AdvisoryBoard from '../components/AdvisoryBoard/AdvisoryBoard';

const BOARD_MD = `## Decision
Hold at 3%.
## Final decision brief
- Decision: Hold renewals at 3%.
- Why: occupancy first.
- Risk: revenue lag.
- Next action: re-price in Q2.
- Do not do: blanket 6%.`;

describe('Advisory Board — Run the board on the first screen', () => {
    beforeEach(() => { callLlmMock.mockReset(); callLlmMock.mockResolvedValue({ text: BOARD_MD }); });

    it('shows "Run the board →" beside "Interview me first →", disabled until a decision is typed', () => {
        render(<AdvisoryBoard />);
        const run = screen.getByRole('button', { name: /Run the board/i });
        const interview = screen.getByRole('button', { name: /Interview me first/i });
        expect(run).toBeDisabled();
        expect(interview).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/decision you want stress-tested/i), { target: { value: 'Raise rents 6% or hold at 3%?' } });
        expect(run).toBeEnabled();
        expect(interview).toBeEnabled();
    });

    it('runs the board directly with ONE LLM call (no interview call) and reaches the result', async () => {
        render(<AdvisoryBoard />);
        fireEvent.change(screen.getByLabelText(/decision you want stress-tested/i), { target: { value: 'Raise rents 6% or hold at 3%?' } });
        fireEvent.click(screen.getByRole('button', { name: /Run the board/i }));
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByText(/Hold renewals at 3%/)).toBeInTheDocument());
        expect(screen.queryByTestId('advisory-board-interview')).toBeNull();
    });
});
