/**
 * Plan 066 §4h — CommandPalette's inbox scoring no longer reads `item.body`
 * (the list endpoint stopped carrying it); it scores on subject/sender/snippet
 * instead. This proves a snippet-only match still surfaces the row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { defaultDockItems } from '../data/hierarchy';

vi.mock('../config', () => ({ API_BASE: '' }));
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(null),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

const openWindow = vi.fn();
vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({
        dockItems: defaultDockItems,
        windows: [],
        openWindow,
        focusWindow: vi.fn(),
        restoreWindow: vi.fn(),
    }),
}));

import CommandPalette from '../components/CommandPalette/CommandPalette';
import { recentActivityStore } from '../lib/recentActivityStore';
import { resetWidgetMemory } from '../lib/widgetMemory';
import { setPerUserIdentity } from '../lib/perUserIdentity';

// The item's subject and sender carry no overlap with the search term below —
// only `snippet` does. `body` is intentionally absent: the list endpoint (post
// plan 066 §4h) no longer returns it.
const INBOX_ITEM = {
    id: 'msg-77',
    subject: 'Property inspection scheduled',
    sender: 'inspector@example.com',
    snippet: 'Please arrange the dehumidifier before the crawlspace visit.',
    signalClass: 'noise',
    urgency: 'low',
    status: 'pending',
};

function mockFetch() {
    return vi.fn((url: unknown) => {
        if (typeof url === 'string' && url.includes('/api/inbox?limit=80')) {
            return Promise.resolve({
                ok: true,
                json: async () => ({ success: true, data: [INBOX_ITEM] }),
            } as Response);
        }
        return Promise.reject(new Error('offline'));
    });
}

beforeEach(() => {
    globalThis.fetch = mockFetch();
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    recentActivityStore.reset();
    resetWidgetMemory();
    setPerUserIdentity(null);
    openWindow.mockClear();
});

describe('CommandPalette — inbox scoring (plan 066 §4h)', () => {
    it('returns an inbox item matched by its snippet, not its subject or sender', async () => {
        render(<CommandPalette />);
        await act(async () => {
            fireEvent.keyDown(window, { key: 'k', metaKey: true });
        });

        const input = document.querySelector('.command-palette__input')!;
        fireEvent.change(input, { target: { value: 'dehumidifier' } });

        await waitFor(() => {
            const titles = Array.from(document.querySelectorAll('.command-palette__section-title'))
                .map(t => t.textContent);
            expect(titles).toContain('Inbox Messages');
        });

        const inboxSection = Array.from(document.querySelectorAll('.command-palette__section'))
            .find(sec => sec.querySelector('.command-palette__section-title')?.textContent === 'Inbox Messages')!;
        expect(inboxSection.textContent).toContain('Property inspection scheduled');
    });

    it('does not return the item for a term that appears in neither subject, sender, nor snippet', async () => {
        render(<CommandPalette />);
        await act(async () => {
            fireEvent.keyDown(window, { key: 'k', metaKey: true });
        });

        const input = document.querySelector('.command-palette__input')!;
        // Wait for the inbox fetch to land before proving the miss (otherwise an
        // empty-inbox false negative would pass for the wrong reason).
        fireEvent.change(input, { target: { value: 'dehumidifier' } });
        await waitFor(() => {
            const titles = Array.from(document.querySelectorAll('.command-palette__section-title')).map(t => t.textContent);
            expect(titles).toContain('Inbox Messages');
        });

        fireEvent.change(input, { target: { value: 'submarine' } });
        await waitFor(() => {
            const titles = Array.from(document.querySelectorAll('.command-palette__section-title')).map(t => t.textContent);
            expect(titles).not.toContain('Inbox Messages');
        });
    });
});
