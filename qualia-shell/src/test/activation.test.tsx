/**
 * activationStore + secretsAdapter + ActivationCenter — assessment sweep
 * 2026-06-12 (C5 + C6: "create everything you could activate at any time").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
    activationStore,
    activationUserIdHolder,
    saveActivation,
    resetActivation,
    emptyActivation,
    appfolioReady,
    cloudReplicationReady,
    capabilityStatuses,
} from '../lib/activationStore';
import { secretBackend, secretsPostureLabel } from '../lib/secretsAdapter';
import ActivationCenter from '../components/ControlPanel/ActivationCenter';

beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    activationUserIdHolder.current = null;
    resetActivation();
});

describe('activationStore', () => {
    it('defaults: nothing enabled (zero behavior change)', () => {
        const c = activationStore.getSnapshot();
        expect(c.appfolioSync.enabled).toBe(false);
        expect(c.authMode.enabled).toBe(false);
        expect(c.cloudReplication.enabled).toBe(false);
        expect(c).toEqual(emptyActivation());
    });

    it('persists + round-trips a capability config', () => {
        saveActivation({
            ...emptyActivation(),
            appfolioSync: { enabled: true, baseUrl: 'https://x/api/v2', clientId: 'id', clientSecret: 'sec' },
        });
        expect(appfolioReady(activationStore.getSnapshot())).toBe(true);
        resetActivation();
        expect(appfolioReady(activationStore.getSnapshot())).toBe(false);
    });

    it('readiness predicates require BOTH enabled and full config', () => {
        const half = { ...emptyActivation(), cloudReplication: { enabled: true, supabaseUrl: 'u', supabaseAnonKey: '' } };
        expect(cloudReplicationReady(half)).toBe(false); // missing key
        const full = { ...emptyActivation(), cloudReplication: { enabled: true, supabaseUrl: 'u', supabaseAnonKey: 'k' } };
        expect(cloudReplicationReady(full)).toBe(true);
    });

    it('a fully-configured capability reports "blocked" (backend half pending)', () => {
        const c = { ...emptyActivation(), appfolioSync: { enabled: true, baseUrl: 'u', clientId: 'i', clientSecret: 's' } };
        const s = capabilityStatuses(c).find((x) => x.key === 'appfolioSync')!;
        expect(s.state).toBe('blocked');
    });

    it('notifications/PWA report "ready" when enabled (no backend needed)', () => {
        const c = { ...emptyActivation(), pwa: { enabled: true } };
        expect(capabilityStatuses(c).find((x) => x.key === 'pwa')!.state).toBe('ready');
    });
});

describe('secretsAdapter', () => {
    it('reports a real backend + posture label', () => {
        const b = secretBackend();
        expect(['keychain', 'localStorage', 'memory']).toContain(b);
        expect(secretsPostureLabel().length).toBeGreaterThan(0);
    });
});

describe('ActivationCenter UI', () => {
    it('renders all six capability cards', () => {
        render(<ActivationCenter />);
        expect(screen.getByText('Live AppFolio sync')).toBeTruthy();
        expect(screen.getByText('Security mode')).toBeTruthy();
        expect(screen.getByText('Cloud replication of One Save')).toBeTruthy();
        expect(screen.getByText('Auto-updater')).toBeTruthy();
        expect(screen.getByText('Desktop notifications')).toBeTruthy();
        expect(screen.getByText('Phone companion (PWA)')).toBeTruthy();
    });

    it('typing a key persists it and flipping enable updates the chip', () => {
        render(<ActivationCenter />);
        const feedUrl = screen.getByPlaceholderText(/Release feed URL/);
        fireEvent.change(feedUrl, { target: { value: 'https://github.com/x/releases' } });
        // enable auto-update
        const enable = screen.getByLabelText('Enable auto-update');
        fireEvent.click(enable);
        expect(activationStore.getSnapshot().autoUpdater.feedUrl).toBe('https://github.com/x/releases');
        expect(activationStore.getSnapshot().autoUpdater.enabled).toBe(true);
    });
});
