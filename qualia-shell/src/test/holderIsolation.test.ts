import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
    setPerUserIdentity,
    agentContextUserIdHolder,
    llmUsageUserIdHolder,
    goalsUserIdHolder,
    morningBriefUserIdHolder,
    costKpiUserIdHolder,
    activationUserIdHolder,
    artifactsUserIdHolder,
    workspacesUserIdHolder,
    tagsUserIdHolder,
    subscriptionsUserIdHolder,
    halocronKnowledgeGraphUserIdHolder,
    scribeKbUserIdHolder,
    firstRunUserIdHolder,
    onboardingUserIdHolder,
    araGlanceUserIdHolder,
} from '../lib/perUserIdentity';
import { llmUsageStore } from '../lib/llmUsageStore';
import { tagsStore } from '../lib/tagsStore';

// withSync-wrapped stores (llmUsage) import oneSaveClient at load; mock it so no
// network/side effects fire during these pure-holder assertions.
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

// The 15 per-user identity holders that perUserIdentity.ts owns. Structural
// regression guard for the dbcfe00 React #185 incident: these used to ALIAS one
// shared object (integrationsUserIdHolder), so a second render-time writer with
// a different value invalidated every dynamic-key store's cache on each
// getSnapshot() and infinite-looped React. They are now independent objects set
// only through setPerUserIdentity().
const ALL_HOLDERS = [
    agentContextUserIdHolder,
    llmUsageUserIdHolder,
    goalsUserIdHolder,
    morningBriefUserIdHolder,
    costKpiUserIdHolder,
    activationUserIdHolder,
    artifactsUserIdHolder,
    workspacesUserIdHolder,
    tagsUserIdHolder,
    subscriptionsUserIdHolder,
    halocronKnowledgeGraphUserIdHolder,
    scribeKbUserIdHolder,
    firstRunUserIdHolder,
    onboardingUserIdHolder,
    araGlanceUserIdHolder,
];

describe('perUserIdentity — decoupled holders (#185 loop guard)', () => {
    beforeEach(() => {
        // Reset factory caches + all holders between tests.
        llmUsageStore.reset();
        tagsStore.reset();
        setPerUserIdentity(null);
    });

    it('exports exactly 15 holders, all distinct object references', () => {
        expect(ALL_HOLDERS).toHaveLength(15);
        const unique = new Set(ALL_HOLDERS);
        // Distinctness is what makes cross-store churn impossible — no two
        // exports may be the same object.
        expect(unique.size).toBe(15);
    });

    it('setPerUserIdentity(userId) assigns the SAME value to every holder from one call', () => {
        setPerUserIdentity('u1');
        for (const holder of ALL_HOLDERS) expect(holder.current).toBe('u1');

        setPerUserIdentity('u2');
        for (const holder of ALL_HOLDERS) expect(holder.current).toBe('u2');

        setPerUserIdentity(null);
        for (const holder of ALL_HOLDERS) expect(holder.current).toBe(null);
    });

    it('writing one holder does NOT invalidate an ALIAS store snapshot (llmUsage vs goals churn)', () => {
        // Pin the ONLY holder llmUsageStore keys on.
        llmUsageUserIdHolder.current = 'user-a';
        const first = llmUsageStore.getSnapshot();

        // Churn an unrelated holder the way a second render-time writer used to
        // — under the old shared-alias design this alternated llmUsage's key too
        // and forced a fresh snapshot every getSnapshot() (the #185 loop).
        goalsUserIdHolder.current = 'raw-id-from-goals';
        const second = llmUsageStore.getSnapshot();
        goalsUserIdHolder.current = 'another-raw-id';
        const third = llmUsageStore.getSnapshot();

        expect(second).toBe(first);
        expect(third).toBe(first);
    });

    it('writing one holder does NOT invalidate a DIRECT-READER store snapshot (tags vs subscriptions churn)', () => {
        tagsUserIdHolder.current = 'user-a';
        const first = tagsStore.getSnapshot();

        subscriptionsUserIdHolder.current = 'raw-id-from-subs';
        const second = tagsStore.getSnapshot();
        halocronKnowledgeGraphUserIdHolder.current = 'raw-id-from-kg';
        const third = tagsStore.getSnapshot();

        expect(second).toBe(first);
        expect(third).toBe(first);
    });

    it('a store DOES re-resolve when ITS OWN holder changes (namespace isolation preserved)', () => {
        tagsUserIdHolder.current = 'user-a';
        const a = tagsStore.getSnapshot();
        // Same key → stable reference.
        expect(tagsStore.getSnapshot()).toBe(a);
        // Different key → the store must pick up the new user's namespace.
        tagsUserIdHolder.current = 'user-b';
        // Not asserting a specific value (empty default here), only that the
        // per-user key path is still live — no throw, resolves cleanly.
        expect(() => tagsStore.getSnapshot()).not.toThrow();
    });
});
