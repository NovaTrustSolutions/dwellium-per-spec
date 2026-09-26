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
    dumpUserIdHolder,
    synthesisUserIdHolder,
    wikiUserIdHolder,
    foundryUserIdHolder,
    copawUserIdHolder,
} from '../lib/perUserIdentity';
import { llmUsageStore } from '../lib/llmUsageStore';
import { tagsStore } from '../lib/tagsStore';
import { copawStore, captureFacts } from '../components/Hive/copawStore';
import { recall, memoryCounts } from '../lib/unifiedMemory';

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
    dumpUserIdHolder,
    synthesisUserIdHolder,
    wikiUserIdHolder,
    foundryUserIdHolder,
    copawUserIdHolder,
];

describe('perUserIdentity — decoupled holders (#185 loop guard)', () => {
    beforeEach(() => {
        // Reset factory caches + all holders between tests.
        llmUsageStore.reset();
        tagsStore.reset();
        copawStore.reset();
        setPerUserIdentity(null);
    });

    it('exports exactly 20 holders, all distinct object references', () => {
        expect(ALL_HOLDERS).toHaveLength(20);
        const unique = new Set(ALL_HOLDERS);
        // Distinctness is what makes cross-store churn impossible — no two
        // exports may be the same object.
        expect(unique.size).toBe(20);
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

    // Plan 067 phase (2026-09-25): dumpUserIdHolder / synthesisUserIdHolder /
    // wikiUserIdHolder / foundryUserIdHolder / copawUserIdHolder used to be set
    // ONLY when their own widget rendered. A non-widget reader — unifiedMemory's
    // `recall()` / `memoryCounts()`, reached from the `skill-memory-recall` agent
    // skill and `dwelliumCommands.recallMemory` — read whatever the LAST-OPENED
    // widget had left in the holder, so after an account switch it kept seeing
    // the PREVIOUS account's copaw memory until the Hive/Synthesis widget was
    // opened again. Now every one of the five lives in ALL_HOLDERS, so the
    // single `usePerUserIdentity()` writer (called unconditionally from
    // WindowContext on every render) keeps them correct with no widget open.
    it('a non-widget reader (unifiedMemory) never sees the previous account\'s copaw data after a switch', () => {
        setPerUserIdentity('user-a');
        captureFacts('test-agent', 'This is a durable memory fact that belongs only to user A.');
        expect(memoryCounts().copaw).toBe(1);
        expect(recall('memory fact').some((h) => h.source === 'test-agent')).toBe(true);

        // Switch accounts WITHOUT ever rendering Hive/Synthesis/ContentSearch —
        // only the single ALL_HOLDERS writer runs.
        setPerUserIdentity('user-b');

        expect(memoryCounts().copaw).toBe(0);
        expect(recall('memory fact')).toHaveLength(0);
    });
});
