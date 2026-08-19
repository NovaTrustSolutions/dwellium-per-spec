/**
 * useAIAvailability + aiHealthStore — assessment sweep 2026-06-12 (weakness #8).
 * The single AI-degradation contract every widget shares.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import {
    aiHealthStore,
    recordAiFailure,
    recordAiSuccess,
    isRateLimited,
} from '../lib/aiHealthStore';
import { useAIAvailability } from '../hooks/useAIAvailability';
import AIDegradedState from '../components/Shell/AIDegradedState';
import HydraSplit from '../components/HydraAI/HydraSplit';

// No UserProvider in test → hook degrades to _anonymous (no key). Backend
// status store defaults to 'online'. So with no key + backend up → 'backend-only'.

function Probe() {
    const a = useAIAvailability();
    return (
        <div>
            <span data-testid="status">{a.status}</span>
            <span data-testid="canCall">{String(a.canCall)}</span>
            <AIDegradedState availability={a} lastKnownLabel="cached value" />
        </div>
    );
}

describe('aiHealthStore', () => {
    beforeEach(() => aiHealthStore.reset());

    it('records success → clears failure state', () => {
        recordAiFailure('openai', 500);
        recordAiSuccess();
        const s = aiHealthStore.getSnapshot();
        expect(s.consecutiveFailures).toBe(0);
        expect(s.lastFailure).toBeNull();
        expect(s.lastSuccessAt).toBeTypeOf('number');
    });

    it('counts consecutive failures', () => {
        recordAiFailure('openai', 500);
        recordAiFailure('openai', 500);
        expect(aiHealthStore.getSnapshot().consecutiveFailures).toBe(2);
    });

    it('isRateLimited true only for a fresh 429', () => {
        recordAiFailure('anthropic', 429);
        expect(isRateLimited()).toBe(true);
        aiHealthStore.reset();
        recordAiFailure('anthropic', 500);
        expect(isRateLimited()).toBe(false); // 500 is not a rate limit
    });

    it('429 cooldown expires after the window', () => {
        vi.setSystemTime(new Date('2026-06-12T08:00:00Z'));
        recordAiFailure('anthropic', 429);
        expect(isRateLimited()).toBe(true);
        vi.setSystemTime(new Date('2026-06-12T08:02:00Z')); // 2min later
        expect(isRateLimited()).toBe(false);
        vi.useRealTimers();
    });
});

describe('useAIAvailability + AIDegradedState', () => {
    beforeEach(() => aiHealthStore.reset());

    it('no key + backend online → backend-only, can still call, no CTA', () => {
        render(<Probe />);
        expect(screen.getByTestId('status').textContent).toBe('backend-only');
        expect(screen.getByTestId('canCall').textContent).toBe('true');
        // backend-only suppresses the configure CTA (it's not an error)
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('rate-limited state renders the cooldown banner + cached value', () => {
        act(() => { recordAiFailure('anthropic', 429); });
        render(<Probe />);
        expect(screen.getByTestId('status').textContent).toBe('rate-limited');
        expect(screen.getByText(/rate limit/i)).toBeTruthy();
        expect(screen.getByText(/Showing last known: cached value/)).toBeTruthy();
    });

    // plan 046 S1a — direct-`callLlm` surfaces pass needsKey so 'backend-only'
    // is treated as degraded and the CTA opens the API Keys window.
    it('needsKey: backend-only renders "Open API Keys" and the CTA opens api-keys', () => {
        function NeedsKeyProbe() {
            const a = useAIAvailability();
            return <AIDegradedState availability={a} needsKey />;
        }
        const listener = vi.fn();
        window.addEventListener('dwellium:open-widget', listener);
        render(<NeedsKeyProbe />);
        expect(screen.getByText(/Needs your own AI key/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Open API Keys' }));
        expect(listener).toHaveBeenCalledTimes(1);
        const evt = listener.mock.calls[0][0] as CustomEvent;
        expect(evt.detail).toEqual({ widgetId: 'api-keys', label: 'API Keys' });
        window.removeEventListener('dwellium:open-widget', listener);
    });

    it('needsKey + reason override replaces the default text', () => {
        function ReasonProbe() {
            const a = useAIAvailability();
            return <AIDegradedState availability={a} needsKey reason="Custom reason." ctaLabel="Add a key" />;
        }
        render(<ReasonProbe />);
        expect(screen.getByText('Custom reason.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Add a key' })).toBeTruthy();
    });

    // plan 046 S1b — one wired widget as a representative (others use the same props).
    it('HydraSplit shows the "Add a key" banner when no provider is configured', () => {
        render(<HydraSplit />);
        expect(screen.getByRole('button', { name: 'Add a key' })).toBeTruthy();
    });

    it('AIDegradedState renders nothing when status is ready', () => {
        const ready = {
            status: 'ready' as const,
            canCall: true,
            reason: null,
            configure: () => {},
        };
        const { container } = render(<AIDegradedState availability={ready} />);
        expect(container.querySelector('.ai-degraded')).toBeNull();
    });
});
