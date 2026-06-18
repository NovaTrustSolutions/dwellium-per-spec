import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockAuthFetch = vi.fn();

vi.mock('../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../context/UserContext')>();
    return {
        ...actual,
        useUser: () => ({ authFetch: mockAuthFetch, isAuthenticated: true }),
    };
});

vi.mock('../config', () => ({
    API_BASE: 'http://localhost:3000',
}));

import CloudBrowser from '../components/CloudBrowser/CloudBrowser';

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => body,
    } as Response;
}

function cloudFrame(url = 'https://example.com/') {
    return {
        success: true,
        session: {
            id: 'cloud-1',
            url,
            title: 'Example',
            width: 1280,
            height: 800,
            createdAt: '2026-06-18T00:00:00.000Z',
            lastActiveAt: '2026-06-18T00:00:00.000Z',
        },
        frame: {
            mimeType: 'image/png',
            base64: 'ZmFrZS1wbmc=',
            width: 1280,
            height: 800,
        },
    };
}

describe('CloudBrowser', () => {
    beforeEach(() => {
        mockAuthFetch.mockReset();
        mockAuthFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            if (String(url).endsWith('/api/cloud-browser/sessions') && opts?.method === 'POST') {
                return jsonResponse(cloudFrame());
            }
            if (String(url).includes('/api/cloud-browser/sessions/cloud-1/click')) {
                return jsonResponse(cloudFrame());
            }
            if (String(url).includes('/api/cloud-browser/sessions/cloud-1/frame')) {
                return jsonResponse(cloudFrame());
            }
            return jsonResponse({ success: false, error: `Unhandled ${url}` }, 404);
        });
    });

    it('starts a hosted browser session and renders the returned viewport', async () => {
        render(<CloudBrowser />);
        const input = screen.getByLabelText(/URL/i);
        await userEvent.clear(input);
        await userEvent.type(input, 'https://example.com');
        await userEvent.click(screen.getByRole('button', { name: /Go/i }));

        await waitFor(() => {
            expect(screen.getByAltText(/Cloud Browser viewport/i)).toBeInTheDocument();
        });
        const src = screen.getByAltText(/Cloud Browser viewport/i).getAttribute('src');
        expect(src).toBe('data:image/png;base64,ZmFrZS1wbmc=');
        expect(screen.getByText('Example')).toBeInTheDocument();
    });

    it('sends scaled click coordinates to the active cloud session', async () => {
        render(<CloudBrowser />);
        await userEvent.click(screen.getByRole('button', { name: /Go/i }));
        const img = await screen.findByAltText(/Cloud Browser viewport/i);
        Object.defineProperty(img, 'getBoundingClientRect', {
            value: () => ({ left: 10, top: 20, width: 640, height: 400, right: 650, bottom: 420, x: 10, y: 20, toJSON: () => ({}) }),
        });

        fireEvent.click(img, { clientX: 330, clientY: 220 });

        await waitFor(() => {
            const clickCall = mockAuthFetch.mock.calls.find((call) => String(call[0]).includes('/click'));
            expect(clickCall).toBeTruthy();
            expect(JSON.parse(String(clickCall![1]?.body))).toEqual({ x: 640, y: 400 });
        });
    });
});
