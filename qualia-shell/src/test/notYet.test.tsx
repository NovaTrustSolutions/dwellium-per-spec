/**
 * NotYet — plan 046 D3: the one inline chip for every stub + the string
 * variant for the static-mode write guards.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotYet, notYetMessage } from '../components/common/NotYet';

describe('NotYet', () => {
    it('renders the "Coming soon" chip + reason, forwards testId', () => {
        render(<NotYet testId="x-stub" reason="Invoice ledger per work order." />);
        const el = screen.getByTestId('x-stub');
        expect(el.getAttribute('role')).toBe('note');
        expect(screen.getByText(/Coming soon/i)).toBeTruthy();
        expect(screen.getByText(/invoice ledger/i)).toBeTruthy();
    });

    it('notYetMessage keeps "not available" (SentimentModule classifies "not " as an error)', () => {
        expect(notYetMessage('Upload')).toBe('Upload is not available in this read-only preview.');
        expect(/not /.test(notYetMessage('Survey submission'))).toBe(true);
    });
});
