import { beforeEach, describe, expect, it, vi } from 'vitest';
import { oneSaveClient, type DwelliumObject } from '../lib/oneSaveClient';
import { oneSaveSync } from '../lib/oneSaveStore';
import { halocronOsStore, type HalocronOsState } from '../lib/halocronOsStore';
import {
    DEFAULT_KG_PROJECTS,
    halocronKnowledgeGraphStore,
    type HalocronKnowledgeGraphState,
} from '../lib/halocronKnowledgeGraphStore';
import { integrationsUserIdHolder } from '../utils/integrationsStore';
import { saveWorkspaces, workspacesStore, type Workspace } from '../lib/workspacesStore';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        history: vi.fn(),
    },
}));

const USER = 'user-andy-id';

function object<T>(id: string, type: string, payload: T): DwelliumObject<T> {
    return {
        id,
        type,
        ownerId: USER,
        schema: 1,
        createdAt: '2026-06-19T00:00:00.000Z',
        updatedAt: '2026-06-19T00:00:00.000Z',
        deletedAt: null,
        payload,
    };
}

describe('account resume stores', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        localStorage.clear();
        integrationsUserIdHolder.current = null;
        await oneSaveSync.bootstrap(null);
        halocronOsStore.reset();
        halocronKnowledgeGraphStore.reset();
        workspacesStore.reset();
        vi.mocked(oneSaveClient.get).mockReset();
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.remove).mockReset();
        vi.mocked(oneSaveClient.history).mockReset();
        vi.mocked(oneSaveClient.get).mockResolvedValue(null);
    });

    it('hydrates Holocron OS settings, custom knowledge graphs, and workspaces on a fresh machine login', async () => {
        const osPayload: HalocronOsState = {
            enabled: true,
            open: true,
            compactChrome: true,
            focusCanvas: true,
            splitLayout: 'quad',
        };
        const graphPayload: HalocronKnowledgeGraphState = {
            extras: [{
                id: 'gh-dwellium-private',
                name: 'Dwellium Private',
                lang: 'TYPESCRIPT',
                files: 421,
                clusters: 7,
                blurb: 'NovaTrustSolutions/dwellium-per-spec — graphed from the GitHub file tree.',
            }],
            activeId: 'gh-dwellium-private',
            graphs: {
                'gh-dwellium-private': {
                    files: 421,
                    edges: 320,
                    clusters: 7,
                    tokens: 128000,
                    usdPerSession: 0.38,
                    importantFiles: [{ name: 'UserContext.tsx', score: 91, pct: 100 }],
                    nodes: [{ label: 'src/context/UserContext.tsx', cluster: 0, importance: 91, deg: 12 }],
                    links: [],
                    builtAt: '2026-06-19T00:00:00.000Z',
                },
            },
        };
        const workspacePayload: Workspace[] = [{
            id: 'ws-cross-device',
            name: 'Cross-device command center',
            appIds: ['knowledge-graph'],
            split: 2,
            layout: 'custom',
            frames: { 'knowledge-graph': { x: 8, y: 9, w: 50, h: 70 } },
            activeAppId: 'knowledge-graph',
            notes: 'Resume this from any machine.',
            updatedAt: 1,
            tabs: [{ key: 'knowledge-graph', kind: 'app', ref: 'knowledge-graph', title: 'Knowledge Graph' }],
            splitKeys: ['knowledge-graph'],
            splitSizes: [100],
        }];

        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => {
            if (id === `${'halocron-os'}_${USER}`) return object(id, 'halocron-os', osPayload);
            if (id === `${'halocron-knowledge-graph'}_${USER}`) return object(id, 'halocron-knowledge-graph', graphPayload);
            if (id === `${'workspaces'}_${USER}`) return object(id, 'workspaces', workspacePayload);
            return null;
        });

        await oneSaveSync.bootstrap(USER);

        expect(halocronOsStore.getSnapshot()).toEqual(osPayload);
        expect(halocronKnowledgeGraphStore.getSnapshot()).toMatchObject({
            activeId: 'gh-dwellium-private',
            extras: [{ name: 'Dwellium Private' }],
        });
        expect(halocronKnowledgeGraphStore.getSnapshot().graphs['gh-dwellium-private']?.files).toBe(421);
        expect(workspacesStore.getSnapshot()).toHaveLength(1);
        expect(workspacesStore.getSnapshot()[0]).toMatchObject({
            name: 'Cross-device command center',
            notes: 'Resume this from any machine.',
            tabs: [{ key: 'knowledge-graph', kind: 'app', ref: 'knowledge-graph', title: 'Knowledge Graph' }],
        });
        expect(localStorage.getItem('dwellium-halocron-os')).toContain('"splitLayout":"quad"');
        expect(localStorage.getItem(`dwellium:kg:${USER}`)).toContain('Dwellium Private');
        expect(localStorage.getItem(`workspaces:${USER}`)).toContain('Cross-device command center');
    });

    it('writes workspace composition to the authenticated account object instead of only localStorage', async () => {
        integrationsUserIdHolder.current = USER;
        saveWorkspaces([{
            id: 'ws-write-through',
            name: 'Persistent workspace',
            appIds: ['control-panel'],
            split: 1,
            layout: 'grid',
            frames: {},
            activeAppId: 'control-panel',
            notes: 'This should leave the machine.',
            updatedAt: 1,
        }]);

        await vi.advanceTimersByTimeAsync(800);

        const workspaceWrite = vi.mocked(oneSaveClient.put).mock.calls
            .map(([call]) => call)
            .find((call) => call.id === `workspaces_${USER}`);

        expect(workspaceWrite).toEqual(expect.objectContaining({
            id: `workspaces_${USER}`,
            type: 'workspaces',
            ownerId: USER,
        }));
        expect(JSON.stringify(workspaceWrite?.payload)).toContain('Persistent workspace');
    });

    it('keeps the shipped default knowledge graph projects while hydrating account extras', async () => {
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => {
            if (id === `${'halocron-knowledge-graph'}_${USER}`) {
                return object<HalocronKnowledgeGraphState>(id, 'halocron-knowledge-graph', {
                    extras: [{
                        id: 'gh-client-project',
                        name: 'Client Project',
                        lang: 'PYTHON',
                        files: 12,
                        clusters: 2,
                        blurb: 'client/project — graphed from the GitHub file tree.',
                    }],
                    activeId: 'gh-client-project',
                    graphs: {},
                });
            }
            return null;
        });

        await oneSaveSync.bootstrap(USER);

        const snapshot = halocronKnowledgeGraphStore.getSnapshot();
        expect(DEFAULT_KG_PROJECTS.some((project) => project.id === 'hermes')).toBe(true);
        expect(snapshot.extras).toHaveLength(1);
        expect(snapshot.extras[0].name).toBe('Client Project');
        expect(snapshot.activeId).toBe('gh-client-project');
    });
});
