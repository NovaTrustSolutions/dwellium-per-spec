/**
 * TimeTravel + oneSaveClient.history — assessment sweep 2026-06-12 (C7,
 * upgrade #7). Honest degradation when the backend /history route is absent.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TimeTravel from '../components/TimeTravel/TimeTravel';
import { oneSaveClient } from '../lib/oneSaveClient';

describe('TimeTravel', () => {
    beforeEach(() => vi.restoreAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it('shows an honest banner when history is empty (route not wired)', async () => {
        vi.spyOn(oneSaveClient, 'history').mockResolvedValue([]);
        render(<TimeTravel />);
        fireEvent.change(screen.getByPlaceholderText(/Object id/), { target: { value: 'morningbrief:andy' } });
        fireEvent.click(screen.getByText('Load history'));
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        expect(screen.getByText(/not wired yet|One Save is off/)).toBeTruthy();
    });

    it('renders versions with restore buttons when history exists', async () => {
        vi.spyOn(oneSaveClient, 'history').mockResolvedValue([
            { version: 2, at: '2026-06-12T10:00:00Z', op: 'put', payload: { v: 'newest' } },
            { version: 1, at: '2026-06-11T10:00:00Z', op: 'put', payload: { v: 'older' } },
        ]);
        render(<TimeTravel />);
        fireEvent.change(screen.getByPlaceholderText(/Object id/), { target: { value: 'x' } });
        fireEvent.click(screen.getByText('Load history'));
        await waitFor(() => expect(screen.getByText('v2')).toBeTruthy());
        expect(screen.getByText('v1')).toBeTruthy();
        expect(screen.getAllByText('Restore').length).toBe(2);
    });

    it('selecting a version reveals its payload (diff/inspect)', async () => {
        vi.spyOn(oneSaveClient, 'history').mockResolvedValue([
            { version: 0, at: '2026-06-10T10:00:00Z', op: 'put', payload: { hello: 'world' } },
        ]);
        render(<TimeTravel />);
        fireEvent.change(screen.getByPlaceholderText(/Object id/), { target: { value: 'x' } });
        fireEvent.click(screen.getByText('Load history'));
        await waitFor(() => expect(screen.getByText('v0')).toBeTruthy());
        fireEvent.click(screen.getByText('v0'));
        expect(screen.getByText(/"hello": "world"/)).toBeTruthy();
    });
});
