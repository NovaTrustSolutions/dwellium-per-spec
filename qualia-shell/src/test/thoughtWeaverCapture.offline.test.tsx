import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ThoughtWeaver from '../components/ThoughtWeaver/ThoughtWeaver';

/**
 * The exact failure the user reported: no personal LLM key set, and the backend
 * unreachable (the default API base points at http://localhost:3000, which a
 * normal/deployed run can't reach). Every fetch rejects.
 *
 * BEFORE the fix: the thought was filed as needs_review / confidence 0 with no
 * indication anything failed — "it doesn't send / nothing happens".
 * AFTER the fix: the thought is sorted locally into a real bucket and the UI
 * says so. This test renders the REAL component and drives the REAL button, so
 * it fails if the wiring regresses — unlike the old compile-only gate.
 */
describe('ThoughtWeaver capture — offline (no LLM, backend unreachable)', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:3000'))));
        try { localStorage.clear(); } catch { /* jsdom */ }
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('still sorts the thought into a real bucket and shows it was sorted locally', async () => {
        render(<ThoughtWeaver />);

        const box = await screen.findByPlaceholderText(/Drop a thought/i);
        // userEvent-free: directly set the value and fire input so React state updates.
        const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
        await act(async () => {
            setValue.call(box, 'Call the plumber tomorrow about unit 4B');
            box.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const captureBtn = document.querySelector('.tw-capture__btn') as HTMLButtonElement;
        expect(captureBtn).toBeTruthy();
        await act(async () => {
            captureBtn.click();
        });

        // 1) Honest provenance is surfaced (previously a silent failure).
        expect(await screen.findByText(/sorted locally/i)).toBeInTheDocument();
        // 2) It was actually categorized — toast shows "Filed → …", not "Needs Review".
        expect(screen.getByText(/Filed →/)).toBeInTheDocument();
        expect(screen.queryByText(/Needs Review/)).not.toBeInTheDocument();
    });
});
