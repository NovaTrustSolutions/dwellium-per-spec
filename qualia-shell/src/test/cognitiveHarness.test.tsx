import React, { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import CognitiveHarness from '../components/CognitiveHarness/CognitiveHarness';
import { getCmn, resetCmnForTests } from '../lib/memoryGraphRag/shared';
import { hermesLearningStore, recordRun } from '../components/HonchoHermesPanel/hermesLearningStore';
import { personaWorkStore } from '../lib/agents/personaWorkStore';

/** matchMedia isn't implemented in jsdom; stub it not-matching (no reduced motion) by default. */
function stubMatchMedia(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    });
}

describe('CognitiveHarness', () => {
    beforeEach(() => {
        resetCmnForTests();
        hermesLearningStore.reset?.();
        personaWorkStore.reset?.();
        localStorage.clear();
        stubMatchMedia(false);
        // No 2D context in jsdom by default — harnessCanvas.ts returns an inert
        // handle when getContext() is null, so the canvas effect is a no-op.
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    });

    it('renders a tablist with 10 tabs and RAG selected by default', () => {
        render(<CognitiveHarness />);
        const tablist = screen.getByRole('tablist', { name: 'Harness subsystems' });
        const tabs = screen.getAllByRole('tab');
        expect(tabs).toHaveLength(10);
        expect(tablist).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /RAG SYSTEM/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('shows Connected on the RAG pill', () => {
        render(<CognitiveHarness />);
        expect(screen.getByRole('status')).toHaveTextContent('Connected');
    });

    it('ArrowRight moves selection to the 2nd tab and focuses it', () => {
        render(<CognitiveHarness />);
        const tabs = screen.getAllByRole('tab');
        tabs[0].focus();
        fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
        const updated = screen.getAllByRole('tab');
        expect(updated[1]).toHaveAttribute('aria-selected', 'true');
        expect(updated[1]).toHaveFocus();
    });

    it('End selects the last tab', () => {
        render(<CognitiveHarness />);
        const tabs = screen.getAllByRole('tab');
        tabs[0].focus();
        fireEvent.keyDown(tabs[0], { key: 'End' });
        const updated = screen.getAllByRole('tab');
        expect(updated[updated.length - 1]).toHaveAttribute('aria-selected', 'true');
    });

    it('clicking Prompt Optimization shows "No activity yet" with no runs, then "Live" after a recorded run', () => {
        render(<CognitiveHarness />);
        fireEvent.click(screen.getByRole('tab', { name: /PROMPT OPTIMIZATION/ }));
        expect(screen.getByRole('status')).toHaveTextContent('No activity yet');

        act(() => {
            recordRun({ prompt: 'x', outcome: 'success', toolsUsed: ['ara-chat'] });
        });
        expect(screen.getByRole('status')).toHaveTextContent('Live');
    });

    it('shows "—" for last latency before any query', () => {
        render(<CognitiveHarness />);
        expect(screen.getByText('Last latency')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('canvas is hidden from assistive tech', () => {
        const { container } = render(<CognitiveHarness />);
        const canvas = container.querySelector('canvas');
        expect(canvas).toHaveAttribute('aria-hidden', 'true');
    });

    it('does not re-run probe() on a re-render that does not bump the engine version', () => {
        render(<CognitiveHarness />);
        const cmn = getCmn(null);
        const probeSpy = vi.spyOn(cmn, 'probe');
        // Pause the auto-cycle — a state update that re-renders the component
        // without touching the engine.
        fireEvent.click(screen.getByRole('button', { name: 'Pause auto-cycle' }));
        expect(probeSpy).not.toHaveBeenCalled();
    });

    it('pauses the auto-cycle button when reduced motion is on', () => {
        stubMatchMedia(true);
        render(<CognitiveHarness />);
        const playButton = screen.getByRole('button', { name: /auto-cycle/i });
        expect(playButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('renders under StrictMode and unmounts cleanly', () => {
        const { unmount } = render(
            <StrictMode>
                <CognitiveHarness />
            </StrictMode>,
        );
        expect(screen.getByText('COGNITIVE HARNESS')).toBeInTheDocument();
        expect(() => unmount()).not.toThrow();
    });
});
