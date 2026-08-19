/**
 * firstRunStore — plan 046 F1 pure helpers + per-user namespacing.
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
    deriveSteps,
    shouldShowFirstRun,
    firstRunStore,
    firstRunUserIdHolder,
    markDone,
    setNeverShow,
    resetFirstRun,
    type FirstRunState,
} from '../lib/firstRunStore';

const empty: FirstRunState = { neverShow: false, done: [] };

describe('deriveSteps', () => {
    it('counts live signals', () => {
        const r = deriveSteps({ hasLlm: true, hasData: false, araReplied: true }, empty);
        expect(r.done).toBe(2);
        expect(r.total).toBe(3);
        expect(r.steps.map(s => s.done)).toEqual([true, false, true]);
    });
    it('sticky done survives a later live=false', () => {
        const r = deriveSteps({ hasLlm: false, hasData: false, araReplied: false }, { neverShow: false, done: ['key'] });
        expect(r.steps[0].done).toBe(true);
        expect(r.done).toBe(1);
    });
});

describe('shouldShowFirstRun', () => {
    it('false on neverShow', () => {
        expect(shouldShowFirstRun({ neverShow: true, done: [] }, false)).toBe(false);
    });
    it('false on 3 of 3', () => {
        expect(shouldShowFirstRun({ neverShow: false, done: ['key', 'data', 'ara'] }, false)).toBe(false);
    });
    it('false when dismissed this session', () => {
        expect(shouldShowFirstRun(empty, true)).toBe(false);
    });
    it('true otherwise', () => {
        expect(shouldShowFirstRun(empty, false)).toBe(true);
        expect(shouldShowFirstRun({ neverShow: false, done: ['key'] }, false)).toBe(true);
    });
});

describe('firstRunStore — per-user key', () => {
    beforeEach(() => {
        firstRunUserIdHolder.current = null;
        resetFirstRun();
        firstRunStore.reset();
    });

    it('namespaces by firstRunUserIdHolder; markDone is idempotent; setNeverShow sticks', () => {
        firstRunUserIdHolder.current = 'u1';
        firstRunStore.reset();
        markDone('key');
        markDone('key');
        expect(firstRunStore.getSnapshot().done).toEqual(['key']);
        expect(localStorage.getItem('firstrun:u1')).toContain('"key"');

        firstRunUserIdHolder.current = 'u2';
        firstRunStore.reset();
        expect(firstRunStore.getSnapshot().done).toEqual([]);
        setNeverShow();
        expect(firstRunStore.getSnapshot().neverShow).toBe(true);
        expect(JSON.parse(localStorage.getItem('firstrun:u2') ?? '{}').neverShow).toBe(true);
        // u1 untouched.
        expect(JSON.parse(localStorage.getItem('firstrun:u1') ?? '{}').neverShow).toBe(false);
    });
});
