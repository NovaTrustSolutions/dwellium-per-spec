import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from '../lib/oneSaveStore';
import { oneSaveClient } from '../lib/oneSaveClient';
import { mergeWikiMaps, sanitizeWikiMap } from '../components/Wiki/wikiStore';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        putBatch: vi.fn().mockResolvedValue('unsupported'),
    },
}));

describe('oneSaveStore hydrate: account switch while the GET is in flight', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(oneSaveClient.get).mockReset();
    });

    it('never writes account A\'s remote payload into account B\'s storage', async () => {
        const holder: { current: string | null } = { current: 'account-a' };
        const resolveKey = () => `race-wiki:${holder.current ?? '_anonymous'}`;

        const base = createLocalStorageStore<Record<string, string>>({
            key: resolveKey,
            deserializer: (raw) => (raw ? JSON.parse(raw) : {}),
            defaultValue: {},
        });

        const store = withSync(base, {
            objectType: 'race-wiki',
            holder,
            resolveKey,
            merge: (l, r) => ({ ...r, ...l }), // newer-wins-ish, mirrors mergeWikiMaps shape
        });

        // Account B already has its own local data before the switch.
        holder.current = 'account-b';
        localStorage.setItem(resolveKey(), JSON.stringify({ bPage: 'account-b-secret' }));
        base.reset();
        holder.current = 'account-a';

        // Simulate a slow GET for account A that resolves AFTER the account switches.
        let resolveGet!: (v: unknown) => void;
        vi.mocked(oneSaveClient.get).mockReturnValue(new Promise((res) => { resolveGet = res; }));

        const hydratePromise = store.hydrate(); // captures objectId() for account-a NOW

        // Account switch happens while the GET is in flight (e.g. fast logout/login).
        holder.current = 'account-b';

        // The in-flight GET for account-a finally resolves.
        resolveGet({
            id: 'race-wiki_account-a',
            type: 'race-wiki',
            ownerId: 'account-a',
            schema: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            deletedAt: null,
            payload: { aPage: 'account-a-secret' },
        });
        await hydratePromise;

        const bStoredRaw = localStorage.getItem(resolveKey()); // resolveKey() now reads account-b's key
        const bStored = bStoredRaw ? JSON.parse(bStoredRaw) : {};

        // Found by the wave-3 adversarial review: before the owner guard, A's payload was merged into B's key.
        expect(bStored).not.toHaveProperty('aPage');
        expect(bStored).toEqual({ bPage: 'account-b-secret' });
    });
});

describe('mergeWikiMaps + sanitize edge cases', () => {
    it('tie-break on invalid/empty compiledAt favors b (documented), even though both are garbage', () => {
        const a = sanitizeWikiMap({ x: { path: 'p', name: 'n', compiledAt: 'not-a-date' } });
        const b = sanitizeWikiMap({ x: { path: 'p', name: 'n2', compiledAt: '' } });
        const merged = mergeWikiMaps(a, b);
        expect(merged.p.name).toBe('n2'); // b wins the 0==0 tie
    });
});
