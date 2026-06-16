import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../config', () => ({
    API_BASE: 'http://localhost:3000',
}));

import SecurityPortal from '../components/SecurityPortal/SecurityPortal';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function json(data: any, ok = true, status = 200): Response {
    return { ok, status, json: async () => data, headers: new Headers() } as Response;
}

describe('SecurityPortal', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        sessionStorage.clear();
    });

    it('renders the auth screen with access code input', () => {
        render(<SecurityPortal />);
        expect(screen.getByText('Security Portal')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter security access code')).toBeInTheDocument();
        expect(screen.getByText('Access Portal')).toBeDisabled();
    });

    it('shows auth error on invalid code', async () => {
        mockFetch.mockResolvedValueOnce(json({ success: false }));
        const user = userEvent.setup();
        render(<SecurityPortal />);

        await user.type(screen.getByPlaceholderText('Enter security access code'), 'wrong');
        await user.click(screen.getByText('Access Portal'));

        expect(await screen.findByText('Invalid access code')).toBeInTheDocument();
    });

    it('authenticates and shows the incident form', async () => {
        // Auth success
        mockFetch.mockResolvedValueOnce(json({ success: true, token: 'tok123' }));
        // Properties fetch
        mockFetch.mockResolvedValueOnce(json([
            { id: 'p1', name: 'Riverwood Apartments' },
            { id: 'p2', name: 'Oak Heights' },
        ]));

        const user = userEvent.setup();
        render(<SecurityPortal />);

        await user.type(screen.getByPlaceholderText('Enter security access code'), 'valid-code');
        await user.click(screen.getByText('Access Portal'));

        expect(await screen.findByText('File Incident Report')).toBeInTheDocument();
        expect(screen.getByText('Riverwood Apartments')).toBeInTheDocument();
    });

    it('submits an incident and shows confirmation', async () => {
        // Auth
        mockFetch.mockResolvedValueOnce(json({ success: true, token: 'tok123' }));
        // Properties
        mockFetch.mockResolvedValueOnce(json([{ id: 'p1', name: 'Riverwood' }]));

        const user = userEvent.setup();
        render(<SecurityPortal />);

        await user.type(screen.getByPlaceholderText('Enter security access code'), 'code');
        await user.click(screen.getByText('Access Portal'));

        await screen.findByText('File Incident Report');

        // Fill form
        await user.selectOptions(screen.getByRole('combobox'), 'p1');
        await user.type(screen.getByPlaceholderText('Brief description'), 'Broken window');

        // Submit
        mockFetch.mockResolvedValueOnce(json({ success: true }));
        await user.click(screen.getByText('Submit Incident Report'));

        expect(await screen.findByText('Incident Reported')).toBeInTheDocument();
        expect(screen.getByText('File Another Report')).toBeInTheDocument();
    });

    it('can file another report after submission', async () => {
        // Auth + Properties + Submit
        mockFetch.mockResolvedValueOnce(json({ success: true, token: 'tok123' }));
        mockFetch.mockResolvedValueOnce(json([{ id: 'p1', name: 'Riverwood' }]));

        const user = userEvent.setup();
        render(<SecurityPortal />);

        await user.type(screen.getByPlaceholderText('Enter security access code'), 'code');
        await user.click(screen.getByText('Access Portal'));
        await screen.findByText('File Incident Report');

        await user.selectOptions(screen.getByRole('combobox'), 'p1');
        await user.type(screen.getByPlaceholderText('Brief description'), 'Test');

        mockFetch.mockResolvedValueOnce(json({ success: true }));
        await user.click(screen.getByText('Submit Incident Report'));

        await screen.findByText('Incident Reported');
        await user.click(screen.getByText('File Another Report'));

        expect(await screen.findByText('File Incident Report')).toBeInTheDocument();
    });
});
