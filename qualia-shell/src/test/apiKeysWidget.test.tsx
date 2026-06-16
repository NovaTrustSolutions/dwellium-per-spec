/**
 * ApiKeysWidget — render + registration smoke suite (2026-06-15).
 *
 * Covers the new per-user "API Keys" widget that sits directly below Inbox
 * Zero. Like the ThoughtWeaver offline suite, this renders the REAL widget
 * with NO UserProvider — useIntegrations() degrades gracefully to the
 * `_anonymous` namespace by reading UserContext directly — so no auth/fetch
 * scaffolding is required. The store holder + localStorage are reset between
 * tests per the createLocalStorageStore `.reset()` convention.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ApiKeysWidget from '../components/ApiKeysWidget/ApiKeysWidget';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { integrationsStore, integrationsUserIdHolder } from '../utils/integrationsStore';

beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
    integrationsUserIdHolder.current = null;
    integrationsStore.reset();
    // Defensive: the panel's Test buttons are gated behind `enabled`, so no
    // fetch fires on a fresh render, but stub it so any accidental call can't
    // hit the network in CI.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:3000'))));
    cleanup();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('ApiKeysWidget renders the reusable API-keys panel', () => {
    it('shows the widget header and the active-LLM picker', () => {
        render(<ApiKeysWidget />);
        // Widget's own header.
        expect(screen.getByRole('heading', { name: /API Keys/i })).toBeTruthy();
        // The panel it mounts surfaces the Active-LLM picker label.
        expect(screen.getByText(/Active LLM Provider/i)).toBeTruthy();
    });

    it('renders all five provider cards', () => {
        const { container } = render(<ApiKeysWidget />);
        // Provider names ALSO appear as <option>s in the Active-LLM <select>, so
        // a bare getByText('Anthropic') matches two nodes and throws. Scope
        // strictly to the provider-card titles.
        const titles = Array.from(
            container.querySelectorAll('.cp-integration-card__title'),
        ).map((el) => (el.textContent ?? '').trim());
        expect(titles).toContain('Anthropic');
        expect(titles).toContain('OpenAI');
        expect(titles.some((t) => /Gemini/i.test(t))).toBe(true);
        expect(titles.some((t) => /Local/i.test(t))).toBe(true);
        expect(titles.some((t) => /Custom/i.test(t))).toBe(true);
    });
});

describe('ApiKeysWidget is registered', () => {
    it('is present in WIDGET_REGISTRY under id "api-keys"', () => {
        const reg = WIDGET_REGISTRY['api-keys'];
        expect(reg).toBeTruthy();
        expect(reg.id).toBe('api-keys');
        expect(reg.label).toBe('API Keys');
        // Lazy exotic component so Desktop/Sidebar/CommandPalette can mount it.
        expect(reg.component).toBeTruthy();
        expect(typeof reg.component).toBe('object');
    });
});
