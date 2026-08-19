/**
 * useMorningBriefSync — plan 046 B2: on tab focus/visibility, re-hydrate the
 * 'morning-brief' One Save object when today's brief is missing (bounded —
 * never re-fetch once it is here), and notify on a new unseen brief.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const get = vi.fn();
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: (...a: unknown[]) => get(...a), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn(), history: vi.fn() },
}));
const notifyNewBrief = vi.fn();
vi.mock('../lib/briefNotifier', () => ({ notifyNewBrief: (...a: unknown[]) => notifyNewBrief(...a) }));

import { useMorningBriefSync } from '../hooks/useMorningBriefSync';
import { morningBriefUserIdHolder, resetMorningBriefs, todaysBrief, upsertBrief } from '../lib/morningBriefStore';
import { dayKey } from '../lib/dailySynthesis';

const serverBrief = { date: dayKey(), insights: [], suggestions: [], dataLines: ['Goals: x 50%'], createdAt: 'now', seen: false, source: 'server' };
const remote = (payload: unknown) => ({ id: 'morning-brief_u-sync', type: 'morning-brief', ownerId: 'u-sync', schema: 1, createdAt: '', updatedAt: '', deletedAt: null, payload });

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
    localStorage.clear();
    get.mockReset(); notifyNewBrief.mockReset();
    morningBriefUserIdHolder.current = 'u-sync';
    resetMorningBriefs();
});

describe('useMorningBriefSync', () => {
    it('focus → hydrates today\'s server brief once, notifies, then stops calling', async () => {
        get.mockResolvedValue(remote([serverBrief]));
        renderHook(() => useMorningBriefSync());
        expect(todaysBrief()).toBeNull();
        act(() => { window.dispatchEvent(new Event('focus')); });
        await flush();
        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith('morning-brief_u-sync');
        expect(todaysBrief()?.dataLines).toEqual(['Goals: x 50%']);
        expect(notifyNewBrief).toHaveBeenCalledTimes(1);
        // Guard: today's brief is present → no second fetch, no second notification.
        act(() => { window.dispatchEvent(new Event('focus')); });
        await flush();
        expect(get).toHaveBeenCalledTimes(1);
        expect(notifyNewBrief).toHaveBeenCalledTimes(1);
    });

    it('visibilitychange (visible) triggers the same sync; nothing for today remote → no notify', async () => {
        get.mockResolvedValue(remote([{ ...serverBrief, date: '2001-01-01' }]));
        renderHook(() => useMorningBriefSync());
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        await flush();
        expect(get).toHaveBeenCalledTimes(1);
        expect(todaysBrief()).toBeNull();
        expect(notifyNewBrief).not.toHaveBeenCalled();
    });

    it('never clobbers a brief the client already has for today', async () => {
        upsertBrief({ date: dayKey(), insights: [], suggestions: [], dataLines: ['client'] });
        renderHook(() => useMorningBriefSync());
        act(() => { window.dispatchEvent(new Event('focus')); });
        await flush();
        expect(get).not.toHaveBeenCalled();
        expect(todaysBrief()?.dataLines).toEqual(['client']);
    });

    it('unmount removes the listeners', async () => {
        get.mockResolvedValue(remote([serverBrief]));
        const { unmount } = renderHook(() => useMorningBriefSync());
        unmount();
        act(() => { window.dispatchEvent(new Event('focus')); });
        await flush();
        expect(get).not.toHaveBeenCalled();
    });
});
