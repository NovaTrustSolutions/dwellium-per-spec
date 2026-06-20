import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyIntegrations, type IntegrationsBundle } from '../types/integrations';
import {
    integrationsStore,
    integrationsUserIdHolder,
    saveIntegrationsSecure,
    unlockIntegrations,
} from '../utils/integrationsStore';
import { isEncrypted } from '../utils/integrationsCrypto';
import { oneSaveClient } from '../lib/oneSaveClient';

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

function seededBundle(): IntegrationsBundle {
    const bundle = emptyIntegrations();
    bundle.llm.active = 'openai';
    bundle.llm.openai = {
        apiKey: 'sk-oai-cross-device',
        model: 'gpt-4o-mini',
        enabled: true,
    };
    bundle.llm.anthropic = {
        apiKey: 'sk-ant-cross-device',
        model: 'claude-haiku-4-5-20251001',
        enabled: true,
    };
    return bundle;
}

describe('integrationsStore account-scoped key sync', () => {
    beforeEach(() => {
        integrationsUserIdHolder.current = null;
        integrationsStore.reset();
        vi.mocked(oneSaveClient.get).mockReset();
        vi.mocked(oneSaveClient.put).mockReset();
        vi.mocked(oneSaveClient.remove).mockReset();
    });

    it('saves LLM keys as encrypted One Save payload and hydrates them on a fresh device login', async () => {
        integrationsUserIdHolder.current = USER;
        await saveIntegrationsSecure(seededBundle(), USER);

        expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
        const put = vi.mocked(oneSaveClient.put).mock.calls[0][0] as { payload: IntegrationsBundle };
        const remotePayload = put.payload;

        expect(put).toMatchObject({
            id: `integrations_${USER}`,
            type: 'integrations',
            ownerId: USER,
        });
        expect(isEncrypted(remotePayload.llm.openai?.apiKey)).toBe(true);
        expect(isEncrypted(remotePayload.llm.anthropic?.apiKey)).toBe(true);
        expect(JSON.stringify(remotePayload)).not.toContain('sk-oai-cross-device');
        expect(JSON.stringify(remotePayload)).not.toContain('sk-ant-cross-device');

        localStorage.clear();
        integrationsStore.reset();
        integrationsUserIdHolder.current = USER;
        vi.mocked(oneSaveClient.get).mockResolvedValueOnce({
            id: `integrations_${USER}`,
            type: 'integrations',
            ownerId: USER,
            schema: 1,
            createdAt: '2026-06-19T00:00:00.000Z',
            updatedAt: '2026-06-19T00:00:00.000Z',
            deletedAt: null,
            payload: remotePayload,
        });

        await unlockIntegrations(USER);

        const hydrated = integrationsStore.getSnapshot();
        expect(hydrated.llm.active).toBe('openai');
        expect(hydrated.llm.openai?.apiKey).toBe('sk-oai-cross-device');
        expect(hydrated.llm.anthropic?.apiKey).toBe('sk-ant-cross-device');

        const cached = localStorage.getItem(`integrations:${USER}`) ?? '';
        expect(cached).toContain('enc:v1:');
        expect(cached).not.toContain('sk-oai-cross-device');
        expect(cached).not.toContain('sk-ant-cross-device');
    });

    it('drops the remote write if the active account changes while encryption is pending', async () => {
        integrationsUserIdHolder.current = USER;
        const pendingSave = saveIntegrationsSecure(seededBundle(), USER);

        integrationsUserIdHolder.current = 'user-lisa-id';
        await pendingSave;

        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });
});
