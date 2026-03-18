/**
 * ErrorBoundary Tests — Regression coverage for crash recovery
 *
 * Ensures:
 * - Renders children normally when no error
 * - Shows fallback UI when a child throws
 * - Calls reportError to send crash to backend
 * - Reset button clears error state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary';

// Mock the error reporter
vi.mock('../services/errorReporter', () => ({
    reportError: vi.fn(),
}));

// Component that throws on demand
function ThrowOnRender({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) {
        throw new Error('Test render crash');
    }
    return <div data-testid="child-content">All good</div>;
}

describe('ErrorBoundary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Suppress console.error from React's error boundary logging
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('renders children when no error occurs', () => {
        render(
            <ErrorBoundary>
                <ThrowOnRender shouldThrow={false} />
            </ErrorBoundary>
        );

        expect(screen.getByTestId('child-content')).toBeInTheDocument();
        expect(screen.getByText('All good')).toBeInTheDocument();
    });

    it('shows fallback UI when child throws', () => {
        render(
            <ErrorBoundary>
                <ThrowOnRender shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText(/Test render crash/)).toBeInTheDocument();
    });

    it('calls reportError when a child throws', async () => {
        const { reportError } = await import('../services/errorReporter');

        render(
            <ErrorBoundary>
                <ThrowOnRender shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(reportError).toHaveBeenCalledTimes(1);
        expect(reportError).toHaveBeenCalledWith(
            expect.any(Error),
            'ErrorBoundary',
            expect.objectContaining({ componentStack: expect.any(String) }),
        );
    });

    it('shows "Try Again" button that resets error state', () => {
        // We use a stateful wrapper to control when the error fires
        let shouldThrow = true;

        function ControlledChild() {
            if (shouldThrow) throw new Error('crash');
            return <div data-testid="recovered">Recovered!</div>;
        }

        const { rerender } = render(
            <ErrorBoundary>
                <ControlledChild />
            </ErrorBoundary>
        );

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();

        // Fix the error and click retry
        shouldThrow = false;
        fireEvent.click(screen.getByText('Try Again'));

        // Force re-render after state reset
        rerender(
            <ErrorBoundary>
                <ControlledChild />
            </ErrorBoundary>
        );

        expect(screen.getByTestId('recovered')).toBeInTheDocument();
    });

    it('renders custom fallback when provided', () => {
        const customFallback = <div data-testid="custom-fallback">Custom error page</div>;

        render(
            <ErrorBoundary fallback={customFallback}>
                <ThrowOnRender shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
        expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('calls onError callback when provided', async () => {
        const onError = vi.fn();

        render(
            <ErrorBoundary onError={onError}>
                <ThrowOnRender shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ componentStack: expect.any(String) }),
        );
    });
});
