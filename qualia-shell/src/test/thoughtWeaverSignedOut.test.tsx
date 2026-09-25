/**
 * Plan 067 — Thought Weaver is tied to the signed-in account: with no user it
 * offers no capture at all, and nothing is written to the shared
 * `_anonymous` bucket that every visitor of this browser would see.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThoughtWeaver from '../components/ThoughtWeaver/ThoughtWeaver';
import { UserContext } from '../context/UserContext';

describe('ThoughtWeaver signed out', () => {
    afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

    it('shows a sign-in prompt, no capture box, and touches no storage or network', () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        localStorage.setItem('thought-weaver:captures:_anonymous', JSON.stringify([{ id: 'old', text: 'earlier anonymous thought', filed_to: 'ideas', confidence: 1, destination_name: null, source: 'local', createdAt: '2026-01-01T00:00:00.000Z' }]));

        render(<UserContext.Provider value={{ user: null } as unknown as React.ContextType<typeof UserContext>}><ThoughtWeaver /></UserContext.Provider>);

        expect(screen.getByText(/Sign in to use Thought Weaver/)).toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/Drop a thought/i)).toBeNull();
        expect(screen.queryByText('earlier anonymous thought')).toBeNull(); // not shown to whoever is here
        expect(fetchSpy).not.toHaveBeenCalled();
        // left untouched — never deleted, never reassigned
        expect(JSON.parse(localStorage.getItem('thought-weaver:captures:_anonymous')!)[0].text).toBe('earlier anonymous thought');
    });

    it('renders the workspace for a signed-in user', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
        render(<UserContext.Provider value={{ user: { id: 'u-signed-in' } } as unknown as React.ContextType<typeof UserContext>}><ThoughtWeaver /></UserContext.Provider>);
        expect(await screen.findByPlaceholderText(/Drop a thought/i)).toBeInTheDocument();
    });
});
