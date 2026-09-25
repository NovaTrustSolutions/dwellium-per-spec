/**
 * Plan 067: the "already imported" id set must UNION on hydrate — an unsaved
 * local set (dirty) must never hide ids another device recorded, or a capture
 * deleted there would be re-imported here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { oneSaveClient } from '../lib/oneSaveClient';
import { twImportedStore, twImportedUserIdHolder, markImported } from '../components/ThoughtWeaver/twImportedStore';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        putBatch: vi.fn().mockResolvedValue('unsupported'),
    },
}));

describe('twImportedStore hydrate', () => {
    beforeEach(() => { localStorage.clear(); });

    it('unions remote ids into an unsaved local set instead of letting local win', async () => {
        twImportedUserIdHolder.current = 'u-merge';
        markImported(['local-1'], '2026-09-25T00:00:00.000Z'); // unsaved → dirty marker set
        vi.mocked(oneSaveClient.get).mockResolvedValue({
            id: 'thought-weaver-imported_u-merge', type: 'thought-weaver-imported', ownerId: 'u-merge', schema: 1,
            createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z', deletedAt: null,
            payload: { 'deleted-on-other-device': '2026-09-24T00:00:00.000Z' },
        });
        await twImportedStore.hydrate();
        expect(Object.keys(twImportedStore.getSnapshot()).sort()).toEqual(['deleted-on-other-device', 'local-1']);
    });
});
