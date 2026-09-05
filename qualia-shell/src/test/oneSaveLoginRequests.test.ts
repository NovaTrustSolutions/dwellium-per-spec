/**
 * Login request storm — swarm C item 3.
 *
 * Repro (pre-fix): 46+ One Save stores each did `hydrate()` (GET) then
 * `migrate()` (a second GET + maybe a PUT) at login — ~100-150 backend
 * requests per login, tripping the backend's 300/min limiter.
 *
 * Fix under test (oneSaveStore.ts `oneSaveSync.bootstrap`):
 *   (a) one bulk `oneSaveClient.listAll()` fans out to every registered
 *       store instead of one GET per store;
 *   (b) `migrate()` reuses hydrate()'s answer instead of re-GETting the
 *       same object.
 *
 * This test imports every real store module the app can register (side
 * effect: each module's top-level `withSync`/`withSyncStatic` call adds
 * itself to the shared registry — see oneSaveStore.ts's registry array),
 * runs the real login bootstrap against a mocked client, and asserts the
 * total GET+PUT+listAll call count stays at or below MAX_LOGIN_REQUESTS.
 * Anyone re-running this file gets the same import list and the same
 * mocked responses, so the count is deterministic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DwelliumObject } from '../lib/oneSaveClient';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        history: vi.fn(),
        listAll: vi.fn(),
    },
}));

import { oneSaveClient } from '../lib/oneSaveClient';
import { oneSaveSync, MAX_LOGIN_REQUESTS } from '../lib/oneSaveStore';

// Every module that defines a One Save store (`= withSync(` / `= withSyncStatic(`
// at the time of writing — side-effect imports only, so registration happens on
// import regardless of which name each module exports its store under).
import '../context/LayoutContext';
import '../context/WindowContext';
import '../context/HierarchyContext';
import '../context/ThemeContext';
import '../utils/gridLockStore';
import '../components/Foundry/foundryStore';
import '../components/Workspace/activeThreadStore';
import '../components/Workspace/workspaceUiStore';
import '../components/AstraDashboard/dashboardLayoutStore';
import '../components/HonchoHermesPanel/agentWikiStore';
import '../components/Synthesis/synthesisStore';
import '../components/Wiki/wikiStore';
import '../components/HonchoHermesPanel/hermesLearningStore';
import '../components/HonchoHermesPanel/honchoMemoryStore';
import '../components/TaskBoard/taskBoardStore';
import '../components/FileExplorer/fileExplorerStore';
import '../components/TranscriptionHub/speakerLibraryStore';
import '../components/Hive/copawStore';
import '../components/RemoteSupport/remoteMachinesStore';
import '../components/Scribe/scribeLayoutStore';
import '../components/Scribe/priorityStore';
import '../components/Scribe/dumpStore';
import '../components/Scribe/scribeThemeStore';
import '../components/Scribe/idocs/idocsStore';
import '../components/StellaAgent/honchoDreamStore';
import '../components/ThoughtWeaver/reportStore';
import '../components/ThoughtWeaver/todoStore';
import '../components/ThoughtWeaver/thoughtWeaverStore';
import '../lib/llmUsageStore';
import '../lib/goalsStore';
import '../lib/agentContextStore';
import '../lib/dictationHotkeyStore';
import '../lib/whiteboardStore';
import '../lib/workspacesStore';
import '../lib/tagsStore';
import '../lib/costKpiStore';
import '../lib/morningBriefStore';
import '../lib/subscriptionsStore';
import '../lib/halocronKnowledgeGraphStore';
import '../lib/araDailyGlance';
import '../lib/artifactStore';
import '../lib/stellaPrefsStore';
import '../lib/firstRunStore';
import '../lib/recentActivityStore';
import '../lib/halocronOsStore';
import '../lib/sessionRestoreStore';
import '../lib/walkthroughStore';
import '../lib/uiEditStore';
import '../lib/onboardingStore';
import '../lib/fluidOsStore';
import '../lib/hiddenWidgetsStore';
import '../lib/araPrefsStore';
import '../lib/avatarProfilesStore';
import '../lib/tabGroupStore';
import '../lib/demoWorkspaceStore';
import '../lib/tagStore';
import '../lib/widgetMemory';
import '../lib/activityLogStore';
import '../lib/spacesStore';
import '../lib/agents/agentTeamsStore';
import '../lib/agents/personaWorkStore';
import '../lib/advisoryBoard/store';
import '../lib/researchLlm/researchLogStore';
import '../lib/researchLlm/researchKeysStore';

const USER = 'user-login-storm';
const NOW = '2026-09-05T00:00:00.000Z';

function dummyObject(id: string): DwelliumObject {
    return { id, type: 'x', ownerId: USER, schema: 1, createdAt: NOW, updatedAt: NOW, deletedAt: null, payload: {} };
}

describe('login request storm (swarm C item 3)', () => {
    beforeEach(async () => {
        vi.mocked(oneSaveClient.get).mockReset().mockResolvedValue(null);
        vi.mocked(oneSaveClient.put).mockReset().mockResolvedValue(undefined as never);
        vi.mocked(oneSaveClient.listAll).mockReset();
        await oneSaveSync.bootstrap(null); // clear owners between tests, no-network (userId null)
    });

    it('imported every store module (sanity check the repro premise)', () => {
        // Guards this test's own premise: if a future refactor drops the import
        // list above to near-zero, the assertion below would pass trivially.
        // 69 at time of writing (see oneSaveLoginRequests measurement in the swarm report).
        expect(oneSaveSync.registeredCount).toBeGreaterThanOrEqual(40);
    });

    it(`fires at most ${MAX_LOGIN_REQUESTS} GET+PUT+listAll requests for a returning user (steady state)`, async () => {
        // Steady-state login: the bulk list reports EVERY store already durable
        // except the last 3 (simulates a few stores that have never migrated
        // yet) — exercises both halves of the fix in one login: (a) the bulk
        // GET replaces N per-store GETs, and (b) only the genuinely-missing
        // stores get a migrate() PUT (no redundant per-store GET either way).
        vi.mocked(oneSaveClient.listAll).mockImplementation(async () => {
            const ids = oneSaveSync.registeredObjectIds();
            return ids.slice(0, -3).map(dummyObject);
        });

        await oneSaveSync.bootstrap(USER);

        const totalRequests =
            vi.mocked(oneSaveClient.get).mock.calls.length +
            vi.mocked(oneSaveClient.put).mock.calls.length +
            vi.mocked(oneSaveClient.listAll).mock.calls.length;

        expect(vi.mocked(oneSaveClient.listAll)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(oneSaveClient.get)).not.toHaveBeenCalled(); // bulk covered every store — no fallback GETs
        expect(vi.mocked(oneSaveClient.put)).toHaveBeenCalledTimes(3); // exactly the 3 not in the bulk result
        expect(totalRequests).toBeLessThanOrEqual(MAX_LOGIN_REQUESTS);
    });

    it('falls back to per-store GETs (no crash) when the bulk call is unavailable', async () => {
        vi.mocked(oneSaveClient.listAll).mockResolvedValue(null);

        await expect(oneSaveSync.bootstrap(USER)).resolves.toBeUndefined();

        expect(vi.mocked(oneSaveClient.listAll)).toHaveBeenCalledTimes(1);
        // Fallback path still runs — every store hydrates individually.
        expect(vi.mocked(oneSaveClient.get).mock.calls.length).toBe(oneSaveSync.registeredCount);
    });
});
