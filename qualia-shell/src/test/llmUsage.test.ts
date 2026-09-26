/**
 * llmUsageStore — plan 068 v2 AI-spend ledger (per-device sub-ledgers,
 * clearedAt tombstone, measured usage, anchored pricing). Each test here
 * breaks the corresponding piece of production logic when read against the
 * comment above it — mutation-check discipline per the plan.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
    llmUsageStore,
    llmUsageUserIdHolder,
    recordLlmUsage,
    lastNDays,
    calendarDaysBack,
    todayRollup,
    planAdvice,
    estimateCost,
    clearLlmUsage,
    resetLlmUsage,
    useLlmUsage,
    normalize,
    merge,
    isRawV1Shape,
    droppedUserSwitchCount,
    _resetDeviceIdForTests,
    type StoredLedgerV2,
    type DeviceLedger,
    type UsageEntry,
} from '../lib/llmUsageStore';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

function setDevice(id: string): void {
    _resetDeviceIdForTests();
    try { localStorage.setItem('llmusage-device', id); } catch { /* */ }
}

beforeEach(() => {
    llmUsageUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    resetLlmUsage();
    llmUsageStore.reset();
    setDevice('device-a');
});

describe('recordLlmUsage — estimate path', () => {
    it('appends an entry and rolls up the day', () => {
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-4-6', promptChars: 4000, responseChars: 2000, userId: 'test-user' });
        recordLlmUsage({ provider: 'openai', model: 'gpt-4o-mini', promptChars: 400, responseChars: 100, userId: 'test-user' });
        const ledger = llmUsageStore.getSnapshot();
        expect(ledger.devices['device-a'].entries).toHaveLength(2);
        const today = todayRollup();
        expect(today.calls).toBe(2);
        expect(today.estIn).toBe(1000 + 100);
        expect(today.estOut).toBe(500 + 25);
        expect(today.estCost).toBeGreaterThan(0);
        expect(today.byProvider.anthropic?.calls).toBe(1);
        expect(today.byProvider.openai?.calls).toBe(1);
        expect(today.measuredCalls).toBe(0);
    });

    it('never throws — even with a broken localStorage', () => {
        expect(() => recordLlmUsage({ provider: 'local', model: 'llama', promptChars: 10, responseChars: 10, userId: 'test-user' })).not.toThrow();
    });

    it('unknown model → estCost null and counted as unpriced, not a guessed default (defect B1)', () => {
        recordLlmUsage({ provider: 'openai', model: 'totally-unheard-of-model', promptChars: 400, responseChars: 400, userId: 'test-user' });
        const day = todayRollup();
        expect(day.unpriced).toBe(1);
        expect(day.estCost).toBe(0); // the unpriced call contributes nothing to the priced total
        const entry = llmUsageStore.getSnapshot().devices['device-a'].entries[0];
        expect(entry.estCost).toBeNull();
        expect(entry.measured).toBe(false);
    });

    it('userId mismatch drops the entry and bumps droppedUserSwitchCount (defect C4)', () => {
        const before = droppedUserSwitchCount;
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-4-6', promptChars: 100, responseChars: 100, userId: 'someone-else' });
        expect(llmUsageStore.getSnapshot().devices['device-a']).toBeUndefined();
        expect(droppedUserSwitchCount).toBe(before + 1);
    });

    it('userId: null is accepted when the holder is null (anonymous ledger)', () => {
        llmUsageUserIdHolder.current = null;
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-4-6', promptChars: 100, responseChars: 100, userId: null });
        expect(llmUsageStore.getSnapshot().devices['device-a'].entries).toHaveLength(1);
    });
});

describe('recordLlmUsage — measured path (real provider usage)', () => {
    it('prices from provider tokens, not chars/4, and models cache reads/writes (defect A4/B3)', () => {
        recordLlmUsage({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6', // 3 / 15 per MTok
            promptChars: 999999, // must be ignored — usage is present
            responseChars: 999999,
            usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 },
            userId: 'test-user',
        });
        const entry = llmUsageStore.getSnapshot().devices['device-a'].entries[0];
        expect(entry.measured).toBe(true);
        expect(entry.estIn).toBe(3_000_000); // input + cacheRead + cacheWrite tokens
        expect(entry.estOut).toBe(1_000_000);
        // 1M*3 (input) + 1M*0.3 (cacheRead 0.1x) + 1M*3.75 (cacheWrite 1.25x) + 1M*15 (output)
        expect(entry.estCost).toBeCloseTo(3 + 0.3 + 3.75 + 15, 6);
    });

    it('the reasoning-budget retry\'s extra billed call is recorded as its own entry (defect A5) — caller responsibility, ledger just never drops a call it is given', () => {
        recordLlmUsage({ provider: 'anthropic', model: 'claude-haiku-4-5', promptChars: 100, responseChars: 100, source: 'retry-1', userId: 'test-user' });
        recordLlmUsage({ provider: 'anthropic', model: 'claude-haiku-4-5', promptChars: 100, responseChars: 100, source: 'retry-2', userId: 'test-user' });
        expect(todayRollup().calls).toBe(2);
    });

    it('extraCostUsd (web-search/image fee) adds to cost when the model is priced', () => {
        recordLlmUsage({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            promptChars: 0,
            responseChars: 0,
            usage: { inputTokens: 0, outputTokens: 0 },
            extraCostUsd: 0.01,
            userId: 'test-user',
        });
        expect(llmUsageStore.getSnapshot().devices['device-a'].entries[0].estCost).toBeCloseTo(0.01, 6);
    });

    it('extraCostUsd does NOT rescue an unpriced model — fees cannot price an unknown token rate', () => {
        recordLlmUsage({
            provider: 'openai',
            model: 'nobody-knows-this-one',
            promptChars: 0,
            responseChars: 0,
            usage: { inputTokens: 100, outputTokens: 100 },
            extraCostUsd: 0.01,
            userId: 'test-user',
        });
        const entry = llmUsageStore.getSnapshot().devices['device-a'].entries[0];
        expect(entry.estCost).toBeNull();
        expect(todayRollup().unpriced).toBe(1);
    });
});

describe('cross-tab (defect C3)', () => {
    it('recordLlmUsage re-reads localStorage fresh, so a foreign entry written by another tab survives', () => {
        recordLlmUsage({ provider: 'anthropic', model: 'claude-haiku-4-5', promptChars: 40, responseChars: 40, userId: 'test-user' });
        // Simulate another tab writing a v2 ledger with a DIFFERENT device's entry directly to localStorage,
        // bypassing this tab's in-memory cache entirely.
        const key = 'llmusage:test-user';
        const onDisk: StoredLedgerV2 = JSON.parse(localStorage.getItem(key)!);
        const foreignEntry: UsageEntry = { ts: Date.now(), provider: 'openai', model: 'gpt-4o', estIn: 10, estOut: 10, estCost: 0.001, measured: false, source: 'other-tab' };
        onDisk.devices['device-b'] = { entries: [foreignEntry], days: {} };
        localStorage.setItem(key, JSON.stringify(onDisk));

        recordLlmUsage({ provider: 'anthropic', model: 'claude-haiku-4-5', promptChars: 40, responseChars: 40, userId: 'test-user' });

        const final: StoredLedgerV2 = JSON.parse(localStorage.getItem(key)!);
        expect(final.devices['device-b'].entries).toHaveLength(1);
        expect(final.devices['device-b'].entries[0].source).toBe('other-tab');
        expect(final.devices['device-a'].entries).toHaveLength(2);
    });
});

describe('v1 → v2 migration (normalize)', () => {
    it('keeps every entry, filed under the reserved legacy device', () => {
        const v1Entries = Array.from({ length: 50 }, (_, i) => ({ ts: i + 1, provider: 'anthropic', model: 'claude-haiku-4-5', estIn: 10, estOut: 10, estCost: 0.001 }));
        const v1 = { entries: v1Entries, days: {} };
        const v2 = normalize(v1);
        expect(v2.v).toBe(2);
        expect(v2.devices.legacy.entries).toHaveLength(50);
        // upgraded fields default sanely
        expect(v2.devices.legacy.entries[0].measured).toBe(false);
    });

    it('a v1 ledger at the 1,000-entry ceiling migrates intact (capped, not truncated further)', () => {
        const v1Entries = Array.from({ length: 1000 }, (_, i) => ({ ts: i + 1, provider: 'anthropic', model: 'claude-haiku-4-5', estIn: 1, estOut: 1, estCost: 0.0001 }));
        const v2 = normalize({ entries: v1Entries, days: {} });
        expect(v2.devices.legacy.entries).toHaveLength(1000);
    });

    it('an already-v2 payload passes through unchanged in shape', () => {
        const v2in: StoredLedgerV2 = { v: 2, clearedAt: 5, devices: { x: { entries: [], days: {} } } };
        expect(normalize(v2in)).toEqual(v2in);
    });

    it('garbage input normalizes to an empty v2 ledger, never throws', () => {
        expect(normalize(null)).toEqual({ v: 2, clearedAt: 0, devices: {} });
        expect(normalize('not an object')).toEqual({ v: 2, clearedAt: 0, devices: {} });
        expect(normalize({ garbage: true })).toEqual({ v: 2, clearedAt: 0, devices: {} });
    });

    it('isRawV1Shape distinguishes a raw v1 payload from a v2 one', () => {
        expect(isRawV1Shape({ entries: [], days: {} })).toBe(true);
        expect(isRawV1Shape({ v: 2, devices: {} })).toBe(false);
        expect(isRawV1Shape(null)).toBe(false);
    });
});

function dev(entries: UsageEntry[]): DeviceLedger {
    return { entries, days: {} };
}

function e(ts: number, source = 'x'): UsageEntry {
    return { ts, provider: 'anthropic', model: 'claude-haiku-4-5', estIn: 1, estOut: 1, estCost: 0.0001, measured: false, source };
}

describe('merge — device-set additivity + legacy tombstone', () => {
    beforeEach(() => setDevice('A'));

    it('is commutative on disjoint device sets: {A}+{B} devices end up the same either direction', () => {
        const local: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: { A: dev([e(1)]) } };
        const remote: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: { B: dev([e(2)]) } };
        const merged = merge(local, remote);
        expect(Object.keys(merged.devices).sort()).toEqual(['A', 'B']);
        expect(merged.devices.A.entries).toHaveLength(1);
        expect(merged.devices.B.entries).toHaveLength(1);
    });

    it('local wins for THIS device — a remote copy of this device\'s sub-ledger never overrides local edits', () => {
        const local: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: { A: dev([e(1), e(2)]) } };
        const remote: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: { A: dev([e(1)]) } }; // stale remote copy of A
        const merged = merge(local, remote);
        expect(merged.devices.A.entries).toHaveLength(2);
    });

    it('clear tombstone: device A clears at T; device B recorded before AND after T while offline — after merge only B\'s post-T entries survive and B\'s days are rebuilt', () => {
        // Real-world-scale timestamps: pruneDays() drops any day older than 400
        // days from Date.now(), and tiny epoch-relative numbers (e.g. 500/1500)
        // parse as 1970 dates that get pruned away, masking the tombstone itself.
        const T = Date.now();
        const local: StoredLedgerV2 = { v: 2, clearedAt: T, devices: { A: dev([]) } }; // A already cleared locally
        const remote: StoredLedgerV2 = {
            v: 2,
            clearedAt: 0, // B hasn't heard about the clear yet
            devices: { B: dev([e(T - 500, 'before'), e(T + 500, 'after')]) },
        };
        const merged = merge(local, remote);
        expect(merged.clearedAt).toBe(T);
        expect(merged.devices.B.entries.map(x => x.source)).toEqual(['after']);
        // days rebuilt from the survivor only
        expect(Object.values(merged.devices.B.days).reduce((s, d) => s + d.calls, 0)).toBe(1);
    });

    describe('legacy sub-ledger (pre-v2 data)', () => {
        it('picks the side with newer content when BOTH are already-migrated v2 legacy ledgers (tie → remote)', () => {
            const local: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: { legacy: dev([e(100)]) } };
            const remote: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: { legacy: dev([e(200)]) } };
            expect(merge(local, remote).devices.legacy.entries[0].ts).toBe(200);

            const tieLocal: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: { legacy: dev([e(100, 'local')]) } };
            const tieRemote: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: { legacy: dev([e(100, 'remote')]) } };
            expect(merge(tieLocal, tieRemote).devices.legacy.entries[0].source).toBe('remote');
        });

        it('stale-tab protection: local v2 {legacy:H, A:x} + remote RAW v1 {entries:[H+1]} → legacy stays H (documented small loss of the stale tab\'s write)', () => {
            const local: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: { legacy: dev([e(100, 'H')]), A: dev([e(1, 'x')]) } };
            const remoteRawV1 = { entries: [{ ts: 200, provider: 'anthropic', model: 'claude-haiku-4-5', estIn: 1, estOut: 1, estCost: 0.0001, source: 'H+1' }], days: {} };
            const merged = merge(local, remoteRawV1 as unknown as StoredLedgerV2);
            expect(merged.devices.legacy.entries).toHaveLength(1);
            expect(merged.devices.legacy.entries[0].source).toBe('H');
        });

        it('fresh device, local empty + remote RAW v1 {entries:[H]} → legacy = H', () => {
            const local: StoredLedgerV2 = { v: 2, clearedAt: 0, devices: {} };
            const remoteRawV1 = { entries: [{ ts: 100, provider: 'anthropic', model: 'claude-haiku-4-5', estIn: 1, estOut: 1, estCost: 0.0001, source: 'H' }], days: {} };
            const merged = merge(local, remoteRawV1 as unknown as StoredLedgerV2);
            expect(merged.devices.legacy.entries[0].source).toBe('H');
        });
    });
});

describe('calendarDaysBack — DST (defect C6)', () => {
    it('spring-forward: 2026-03-09T00:30 local includes 2026-03-08, not a fixed-24h skip', () => {
        // America/New_York DST began 2026-03-08 02:00 -> 03:00. A fixed-86.4M-ms
        // subtraction from 2026-03-09T00:30 would land mid-day 03-07, skipping 03-08.
        const probe = new Date(2026, 2, 9, 0, 30).getTime(); // local time, whatever TZ the runner uses
        const days = calendarDaysBack(probe, 3);
        const d = new Date(probe);
        const expectedYesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate() - 1).padStart(2, '0')}`;
        expect(days[days.length - 2]).toBe(expectedYesterday);
        expect(days).toHaveLength(3);
        expect(days[days.length - 1]).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    });
});

describe('read helpers', () => {
    it('lastNDays returns N zero-filled rollups, today last', () => {
        recordLlmUsage({ provider: 'gemini', model: 'gemini-2.5-flash', promptChars: 100, responseChars: 100, userId: 'test-user' });
        const days = lastNDays(7);
        expect(days).toHaveLength(7);
        expect(days[6].calls).toBe(1);
        expect(days[0].calls).toBe(0);
    });

    it('planAdvice speaks to empty and active weeks', () => {
        expect(planAdvice()).toContain('No LLM usage');
        recordLlmUsage({ provider: 'anthropic', model: 'claude-opus-5', promptChars: 400_000, responseChars: 200_000, userId: 'test-user' });
        expect(planAdvice()).toMatch(/\$\d/);
    });

    it('clear is a tombstone, not an empty overwrite: cleared entries are gone and clearedAt advances', () => {
        const t0 = Date.now();
        vi.setSystemTime(t0);
        recordLlmUsage({ provider: 'openai', model: 'gpt-4o', promptChars: 100, responseChars: 100, userId: 'test-user' });
        const before = llmUsageStore.getSnapshot().clearedAt;
        vi.setSystemTime(t0 + 10); // strictly after the recorded entry's ts
        clearLlmUsage();
        vi.useRealTimers();
        expect(llmUsageStore.getSnapshot().devices['device-a'].entries).toHaveLength(0);
        expect(llmUsageStore.getSnapshot().clearedAt).toBeGreaterThan(before);
        expect(todayRollup().calls).toBe(0);
    });

    it('clear also drops rollup days that outlived their entries (v1 kept days forever, entries capped)', () => {
        // legacy sub-ledger with a rollup but NO entries — a v1 ledger past the 1,000-entry cap.
        const oldDate = calendarDaysBack(Date.now(), 3)[0];
        const v1 = { entries: [], days: { [oldDate]: { date: oldDate, calls: 5, estIn: 1, estOut: 1, estCost: 2, byProvider: {} } } };
        localStorage.setItem('llmusage:test-user', JSON.stringify(v1));
        llmUsageStore.reset();
        expect(todayRollup().calls).toBe(0);
        expect(lastNDays(3)[0].calls).toBe(5);
        clearLlmUsage();
        expect(lastNDays(3)[0].calls).toBe(0);
    });

    it('cache reads: Anthropic defaults to 0.1× input, other providers without a listed cache price pay full input', () => {
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-4-6', promptChars: 0, responseChars: 0, userId: 'test-user',
            usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 } });
        recordLlmUsage({ provider: 'openai', model: 'gpt-4o', promptChars: 0, responseChars: 0, userId: 'test-user',
            usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 } });
        const [a, o] = llmUsageStore.getSnapshot().devices['device-a'].entries;
        expect(a.estCost).toBeCloseTo(0.3);  // $3/MTok × 0.1
        expect(o.estCost).toBeCloseTo(2.5);  // $2.5/MTok, no discount assumed
    });

    it('estimateCost delegates to priceFor and returns null for an unknown model (back-compat)', () => {
        expect(estimateCost('claude-sonnet-4-6', 1000, 1000, 'anthropic')).toBeGreaterThan(0);
        expect(estimateCost('anything', 1000, 1000, 'local')).toBe(0);
        expect(estimateCost('no-such-model', 1000, 1000, 'openai')).toBeNull();
    });

    it('useLlmUsage does not re-render (same object) when nothing changed, and picks up new entries when something did', () => {
        recordLlmUsage({ provider: 'anthropic', model: 'claude-haiku-4-5', promptChars: 10, responseChars: 10, userId: 'test-user' });
        const { result, rerender } = renderHook(() => useLlmUsage());
        const first = result.current;
        expect(first.entries).toHaveLength(1);
        rerender();
        expect(result.current).toBe(first); // referentially stable — no store write happened

        recordLlmUsage({ provider: 'anthropic', model: 'claude-haiku-4-5', promptChars: 10, responseChars: 10, userId: 'test-user' });
        rerender();
        expect(result.current).not.toBe(first);
        expect(result.current.entries).toHaveLength(2);
    });
});
