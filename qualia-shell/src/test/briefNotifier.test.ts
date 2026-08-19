/**
 * briefNotifier — plan 046 B3: real Web Notification, gated by the Activation
 * Center toggles + permission; never throws where Notification is missing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn(), history: vi.fn() },
}));

import { canNotify, notifyNewBrief, requestBriefNotificationPermission } from '../lib/briefNotifier';
import { activationStore, saveActivation, emptyActivation, resetActivation } from '../lib/activationStore';
import { morningBriefUserIdHolder, resetMorningBriefs, upsertBrief, todaysBrief, consumePendingBrief } from '../lib/morningBriefStore';
import { dayKey } from '../lib/dailySynthesis';

const ctor = vi.fn();
const requestPermission = vi.fn().mockResolvedValue('granted');
const created: Array<{ onclick: (() => void) | null }> = [];

function stubNotification(permission: 'granted' | 'denied' | 'default') {
    class FakeNotification {
        static permission = permission;
        static requestPermission = requestPermission;
        onclick: (() => void) | null = null;
        constructor(title: string, opts?: NotificationOptions) { ctor(title, opts); created.push(this); }
    }
    vi.stubGlobal('Notification', FakeNotification);
}

const brief = { date: dayKey(), insights: [{ title: 'Stalled goal', text: 't' }], suggestions: [], dataLines: ['Goals: x 50%'] };

function toggles(enabled: boolean, morningBrief: boolean) {
    saveActivation({ ...emptyActivation(), notifications: { enabled, morningBrief } });
}

beforeEach(() => {
    localStorage.clear();
    ctor.mockClear(); requestPermission.mockClear(); created.length = 0;
    vi.unstubAllGlobals();
    activationStore.reset(); resetActivation();
    morningBriefUserIdHolder.current = 'u-notify';
    resetMorningBriefs();
});

describe('canNotify / notifyNewBrief', () => {
    it('toggles off → constructs nothing even when granted', () => {
        stubNotification('granted');
        toggles(false, false);
        expect(canNotify()).toBe(false);
        notifyNewBrief({ ...brief, createdAt: 'x', seen: false });
        expect(ctor).not.toHaveBeenCalled();
    });

    it('both toggles on + granted → constructed with a same-day tag and the first insight as body', () => {
        stubNotification('granted');
        toggles(true, true);
        expect(canNotify()).toBe(true);
        notifyNewBrief({ ...brief, createdAt: 'x', seen: false });
        expect(ctor).toHaveBeenCalledWith('Your morning brief is ready', { body: 'Stalled goal', tag: `dwellium-brief-${brief.date}` });
    });

    it('permission denied → nothing', () => {
        stubNotification('denied');
        toggles(true, true);
        expect(canNotify()).toBe(false);
        notifyNewBrief({ ...brief, createdAt: 'x', seen: false });
        expect(ctor).not.toHaveBeenCalled();
    });

    it('Notification undefined → no throw, no request', () => {
        vi.stubGlobal('Notification', undefined);
        toggles(true, true);
        expect(canNotify()).toBe(false);
        expect(() => notifyNewBrief({ ...brief, createdAt: 'x', seen: false })).not.toThrow();
        expect(() => requestBriefNotificationPermission()).not.toThrow();
    });

    it('click → brief handed to ARA and marked seen', () => {
        stubNotification('granted');
        toggles(true, true);
        const stored = upsertBrief(brief);
        notifyNewBrief(stored);
        created[0].onclick!();
        expect(consumePendingBrief()?.date).toBe(brief.date);
        expect(todaysBrief()?.seen).toBe(true);
    });
});

describe('requestBriefNotificationPermission', () => {
    it('asks the platform once when supported', () => {
        stubNotification('default');
        requestBriefNotificationPermission();
        expect(requestPermission).toHaveBeenCalledTimes(1);
    });
});
