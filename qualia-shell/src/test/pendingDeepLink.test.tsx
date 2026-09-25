/**
 * pendingDeepLink (plan 069 phase 3) — a Search/⌘K link to a note fired while
 * Notepad is closed must still land on the note once Notepad's chunk mounts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import Notepad from '../components/Notepad/Notepad';
import { setPendingDeepLink, peekPendingDeepLink, takePendingDeepLink } from '../lib/pendingDeepLink';

vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({ hierarchy: [] }),
}));

beforeEach(() => {
    takePendingDeepLink('notepad');
    const fetchMock = vi.fn(async (url: string) => {
        const body = String(url).includes('/notes/n5')
            ? { success: true, data: { id: 'n5', title: 'Deposit policy', content: 'body', updated_at: '', created_at: '' } }
            : { success: true, data: [] };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('pendingDeepLink', () => {
    it('take returns the id once, then nothing', () => {
        setPendingDeepLink('notepad', 'x1');
        expect(peekPendingDeepLink('notepad')).toBe('x1');
        expect(takePendingDeepLink('notepad')).toBe('x1');
        expect(takePendingDeepLink('notepad')).toBeUndefined();
    });

    it('a link older than the TTL is dropped, so a later unrelated mount does not jump to it', () => {
        vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
        setPendingDeepLink('notepad', 'old');
        vi.setSystemTime(new Date('2026-09-25T12:00:16Z'));
        expect(peekPendingDeepLink('notepad')).toBeUndefined();
        expect(takePendingDeepLink('notepad')).toBeUndefined();
        vi.useRealTimers();
    });

    it('Notepad mounting after the link was fired opens the pending note and clears the slot', async () => {
        setPendingDeepLink('notepad', 'n5');
        render(<Notepad />);
        await waitFor(() => {
            const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
            expect(urls.some((u) => u.includes('/notes/n5'))).toBe(true);
        });
        expect(peekPendingDeepLink('notepad')).toBeUndefined();
    });
});
