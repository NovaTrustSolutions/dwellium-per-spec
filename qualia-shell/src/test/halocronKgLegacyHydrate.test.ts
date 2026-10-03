/**
 * Plan 072 P2 review — when the adopting account already has a remote One Save
 * record, hydrate() replaces the adopted legacy tabs (remote wins — unchanged
 * behaviour). The device-wide legacy copy must survive, so nothing is lost for good.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DwelliumObject } from '../lib/oneSaveClient';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn(), listAll: vi.fn() },
}));

import { oneSaveClient } from '../lib/oneSaveClient';
import { oneSaveSync } from '../lib/oneSaveStore';
import { halocronKnowledgeGraphStore } from '../lib/halocronKnowledgeGraphStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';

const legacyProject = { id: 'gh-owner-private', name: 'Private', lang: 'TS', files: 9, clusters: 1, blurb: 'A' };

describe('KG legacy adoption vs One Save hydrate', () => {
    beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); halocronKnowledgeGraphStore.reset(); });

    it('an existing remote record wins, and the device-wide legacy copy is still there', async () => {
        localStorage.setItem('dwellium:kg-projects', JSON.stringify([legacyProject]));
        localStorage.setItem('dwellium:kg-active-project', legacyProject.id);
        setPerUserIdentity('user-a');
        expect(halocronKnowledgeGraphStore.getSnapshot().extras.map((p) => p.id)).toEqual([legacyProject.id]);

        const remote = { id: 'halocron-knowledge-graph_user-a', payload: { extras: [], activeId: 'hermes', graphs: {}, view: 'repos' }, deletedAt: null } as unknown as DwelliumObject<unknown>;
        vi.mocked(oneSaveClient.listAll).mockResolvedValue([remote]);
        vi.mocked(oneSaveClient.get).mockResolvedValue(remote);
        await oneSaveSync.bootstrap('user-a');

        expect(halocronKnowledgeGraphStore.getSnapshot().extras).toEqual([]);            // remote won (as before 072)
        expect(localStorage.getItem('dwellium:kg-projects')).toContain(legacyProject.id); // recoverable
    });
});
