import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

/**
 * Settings → API Keys → "Anam Avatar Engine" used to show an "Enabled"
 * checkbox that nothing read (AnamConfig.enabled is informational; the avatar
 * harness uses Anam whenever a key is saved and an agent picked the Anam
 * provider). The card now states the real status and writes no flag.
 */
const FAKE_ANAM_KEY = 'test-anam-key-not-real';
const mockIntegrations = {
    integrations: { llm: { active: null }, google: {}, search: { active: null }, tests: {}, anam: { apiKey: '', enabled: false } } as any,
    update: vi.fn(), replace: vi.fn(), clear: vi.fn(), removeSecret: vi.fn(),
};
vi.mock('../hooks/useIntegrations', () => ({ useIntegrations: () => mockIntegrations }));
vi.mock('../lib/llmClient', () => ({ testProvider: vi.fn(), listModels: vi.fn(async () => []) }));

import ApiKeysPanel from '../components/ControlPanel/ApiKeysPanel';

const anamCard = () => screen.getByText('Anam Avatar Engine').closest('.cp-integration-card') as HTMLElement;

describe('Anam Avatar Engine card status', () => {
    afterEach(() => { cleanup(); mockIntegrations.integrations.anam = { apiKey: '', enabled: false }; mockIntegrations.update.mockClear(); });

    it('says "Not configured" without a key and shows no on/off checkbox', () => {
        render(<ApiKeysPanel />);
        const card = anamCard();
        expect(card.querySelector('[role="status"]')?.textContent).toBe('Not configured');
        expect(card.querySelector('input[type="checkbox"]')).toBeNull();
        expect(card.textContent).not.toMatch(/Enabled/);
        expect(card.textContent).toMatch(/Avatar setup → Provider → "Anam \(your key\)"/);
    });

    it('says "Active — key saved" once a key is in the vault, even with the legacy enabled:false flag', () => {
        mockIntegrations.integrations.anam = { apiKey: FAKE_ANAM_KEY, enabled: false };
        render(<ApiKeysPanel />);
        const status = anamCard().querySelector('[role="status"]')!;
        expect(status.textContent).toBe('Active — key saved');
        expect(status.getAttribute('aria-label')).toBe('Anam Avatar Engine: active, key saved');
    });
});
