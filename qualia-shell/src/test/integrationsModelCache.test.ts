/**
 * Task B persistence round-trip — the new non-secret model-cache fields
 * (`availableModels`, `modelsFetchedAt`) and the saved `model` selection must
 * survive the encrypted save → login-hydrate cycle unchanged, while the API key
 * is still encrypted at rest. This exercises the REAL store (same path the UI
 * uses) so a regression in deserialize/crypto is caught.
 */
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
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));

const USER = 'user-model-cache';

function bundleWithModelCache(): IntegrationsBundle {
    const b = emptyIntegrations();
    b.llm.active = 'anthropic';
    b.llm.anthropic = {
        apiKey: 'sk-ant-secret',
        model: 'claude-opus-4-8',
        enabled: true,
        availableModels: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
        modelsFetchedAt: 1_700_000_000_000,
    };
    return b;
}

describe('model-cache persistence round-trip', () => {
    beforeEach(() => {
        integrationsUserIdHolder.current = null;
        integrationsStore.reset();
        localStorage.clear();
        vi.mocked(oneSaveClient.get).mockReset();
        vi.mocked(oneSaveClient.put).mockReset();
    });

    it('keeps availableModels/modelsFetchedAt/model across encrypted save + hydrate; key stays encrypted', async () => {
        integrationsUserIdHolder.current = USER;
        await saveIntegrationsSecure(bundleWithModelCache(), USER);

        // The at-rest + One Save copy encrypts the key but leaves model-cache plain.
        const put = vi.mocked(oneSaveClient.put).mock.calls[0][0] as { payload: IntegrationsBundle };
        expect(isEncrypted(put.payload.llm.anthropic?.apiKey)).toBe(true);
        expect(put.payload.llm.anthropic?.availableModels).toEqual([
            'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
        ]);
        expect(put.payload.llm.anthropic?.modelsFetchedAt).toBe(1_700_000_000_000);

        // Fresh login: no remote → hydrate from the encrypted local copy.
        integrationsStore.reset();
        integrationsUserIdHolder.current = USER;
        vi.mocked(oneSaveClient.get).mockResolvedValueOnce(null as never);
        await unlockIntegrations(USER);

        const snap = integrationsStore.getSnapshot();
        expect(snap.llm.anthropic?.model).toBe('claude-opus-4-8');
        expect(snap.llm.anthropic?.apiKey).toBe('sk-ant-secret');          // decrypted back
        expect(snap.llm.anthropic?.availableModels).toEqual([
            'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
        ]);
        expect(snap.llm.anthropic?.modelsFetchedAt).toBe(1_700_000_000_000);
    });
});
