/**
 * onboardingStore — plan 047 §1/§7: role, seen tips (idempotent), tier unlock
 * (set semantics), done predicate, per-user namespacing, metrics to the
 * activity log.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

import {
    onboardingStore, onboardingUserIdHolder, setOnboardingRole, markTipSeen, unmarkTipSeen, unlockTier,
    resetOnboarding, isOnboardingDone, maybeStampDone, tierOf, deriveOnboardingRole,
} from '../lib/onboardingStore';
import { activityLogStore, activityUserIdHolder, resetActivityLog } from '../lib/activityLogStore';
import { markDone, resetFirstRun, firstRunStore, firstRunUserIdHolder } from '../lib/firstRunStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';

const entries = () => activityLogStore.getSnapshot().filter(e => e.widgetId === 'onboarding');

beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity('u-ob');
    onboardingStore.reset(); resetOnboarding();
    resetActivityLog(); activityLogStore.reset();
    firstRunStore.reset(); resetFirstRun();
    resetActivityLog(); // the two resets above logged 'replay' — start clean
});

describe('role', () => {
    it('sets once, logs onboarding:role, and is idempotent', () => {
        setOnboardingRole('owner');
        setOnboardingRole('owner');
        expect(onboardingStore.getSnapshot().role).toBe('owner');
        expect(entries().filter(e => e.action === 'onboarding:role')).toHaveLength(1);
    });
    it('deriveOnboardingRole: management/corporate/god → owner; agent/maintenance/advisor → staff', () => {
        for (const r of ['management', 'corporate', 'god']) expect(deriveOnboardingRole(r)).toBe('owner');
        for (const r of ['agent', 'maintenance', 'advisor', undefined, null]) expect(deriveOnboardingRole(r)).toBe('staff');
    });
});

describe('markTipSeen', () => {
    it('is idempotent: one entry, one log line', () => {
        markTipSeen('scribe');
        markTipSeen('scribe', 'timeout');
        expect(onboardingStore.getSnapshot().seenTips).toEqual(['scribe']);
        const logs = entries().filter(e => e.action === 'onboarding:tip-seen');
        expect(logs).toHaveLength(1);
        expect(logs[0].details).toEqual({ widgetId: 'scribe', dismissed: 'button' });
    });
    it('unmarkTipSeen re-arms', () => {
        markTipSeen('scribe');
        unmarkTipSeen('scribe');
        expect(onboardingStore.getSnapshot().seenTips).toEqual([]);
    });
});

describe('unlockTier', () => {
    it('set semantics: true the first time, false after; one log', () => {
        expect(unlockTier('ai')).toBe(true);
        expect(unlockTier('ai')).toBe(false);
        expect(onboardingStore.getSnapshot().unlockedTiers).toEqual(['ai']);
        expect(entries().filter(e => e.action === 'onboarding:unlock')).toHaveLength(1);
    });
});

describe('done predicate', () => {
    const fr = (done: Array<'key' | 'data' | 'ara'>) => ({ neverShow: false, done });
    it('false without a role, false until 3/3 + starter tips seen', () => {
        expect(isOnboardingDone({ role: null, seenTips: [], unlockedTiers: [] }, fr(['key', 'data', 'ara']))).toBe(false);
        expect(isOnboardingDone({ role: 'staff', seenTips: ['strata-dashboard', 'task-board', 'inbox'], unlockedTiers: [] }, fr(['key', 'data']))).toBe(false);
        expect(isOnboardingDone({ role: 'staff', seenTips: ['strata-dashboard', 'task-board'], unlockedTiers: [] }, fr(['key', 'data', 'ara']))).toBe(false);
    });
    it('staff = Strata + Task Board + Inbox Zero; owner = the pinned five', () => {
        expect(isOnboardingDone({ role: 'staff', seenTips: ['strata-dashboard', 'task-board', 'inbox'], unlockedTiers: [] }, fr(['key', 'data', 'ara']))).toBe(true);
        expect(isOnboardingDone({ role: 'owner', seenTips: ['strata-dashboard', 'task-board', 'inbox'], unlockedTiers: [] }, fr(['key', 'data', 'ara']))).toBe(false);
        expect(isOnboardingDone({ role: 'owner', seenTips: ['ara-console', 'strata-dashboard', 'scribe', 'inbox', 'task-board'], unlockedTiers: [] }, fr(['key', 'data', 'ara']))).toBe(true);
    });
    it('maybeStampDone stamps once and logs onboarding:done', () => {
        setOnboardingRole('staff');
        ['strata-dashboard', 'task-board', 'inbox'].forEach(id => markTipSeen(id));
        markDone('key'); markDone('data');
        maybeStampDone(firstRunStore.getSnapshot());
        expect(onboardingStore.getSnapshot().doneAt).toBeUndefined();
        markDone('ara');
        maybeStampDone(firstRunStore.getSnapshot());
        const at = onboardingStore.getSnapshot().doneAt;
        expect(typeof at).toBe('number');
        maybeStampDone(firstRunStore.getSnapshot());
        expect(onboardingStore.getSnapshot().doneAt).toBe(at);
        expect(entries().filter(e => e.action === 'onboarding:done')).toHaveLength(1);
        // first-win metric logged once per step with msSinceLoad
        const wins = entries().filter(e => e.action === 'onboarding:first-win');
        expect(wins.map(w => w.details?.step).sort()).toEqual(['ara', 'data', 'key']);
        expect(typeof wins[0].details?.msSinceLoad).toBe('number');
    });
});

describe('per-user namespacing + persistence', () => {
    it('writes under onboarding:<uid> and another user starts empty', () => {
        setOnboardingRole('owner');
        expect(localStorage.getItem('onboarding:u-ob')).toContain('"role":"owner"');
        setPerUserIdentity('u-other');
        expect(onboardingStore.getSnapshot().role).toBeNull();
        setPerUserIdentity('u-ob');
        expect(onboardingStore.getSnapshot().role).toBe('owner');
        expect(onboardingUserIdHolder.current).toBe('u-ob');
        expect(activityUserIdHolder.current).toBe('u-ob');
        expect(firstRunUserIdHolder.current).toBe('u-ob');
    });
    it('resetOnboarding clears everything and logs onboarding:replay', () => {
        setOnboardingRole('owner'); markTipSeen('scribe'); unlockTier('ai');
        resetOnboarding();
        expect(onboardingStore.getSnapshot()).toEqual({ role: null, seenTips: [], unlockedTiers: [], doneAt: undefined });
        expect(entries().some(e => e.action === 'onboarding:replay')).toBe(true);
    });
});

describe('tierOf', () => {
    it('pinned → core; explicit labs; restricted → labs; else by category', () => {
        expect(tierOf('ara-console')).toBe('core');
        expect(tierOf('strata-dashboard')).toBe('core');
        expect(tierOf('terminal')).toBe('labs');
        expect(tierOf('georgia-code')).toBe('labs');
        expect(tierOf('audit-log')).toBe('labs');
        // plan 046 D4: Labs membership reconciled onto the 047 tier system.
        expect(tierOf('inbox-zero')).toBe('labs');
        expect(tierOf('time-travel')).toBe('labs');
        expect(tierOf('holocron-library')).toBe('labs');
        expect(tierOf('autonomous-runs')).toBe('labs');
        expect(tierOf('file-explorer')).not.toBe('labs');
        expect(tierOf('astra-dashboard')).toBe('daily');
        expect(tierOf('agent-lab')).toBe('ai');
        expect(tierOf('notepad')).toBe('tools');
        expect(tierOf('tools-hub')).toBe('tools');
        expect(tierOf('nope')).toBe('tools');
    });
});
