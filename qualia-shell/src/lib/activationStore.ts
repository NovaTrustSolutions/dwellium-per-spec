/**
 * activationStore — the "create everything, activate any time" surface
 * (assessment sweep 2026-06-12, per Ilya: "if something requires a setup key
 * or login, create everything inside the app that you could activate at any
 * time"). Covers the assessment's blocked-on-credentials capabilities:
 *
 *   upgrade #1  appfolioSync       — live property-data feed (key + base URL)
 *   weakness #1 authMode           — flip AUTH_ENABLED on (off by default)
 *   upgrade #3  cloudReplication    — replicate One Save via Supabase (URL+key)
 *   upgrade #5  autoUpdater         — electron-updater feed URL
 *   upgrade #8  notifications        — morning brief desktop notifications
 *   upgrade #4  pwa                  — phone-companion install (no key; flag)
 *
 * Every capability persists its config now and exposes an `isReady()`
 * predicate; the actual network/IPC client stays a stub that returns an
 * honest "configured but the backend half isn't wired yet" message until the
 * matching backend route / preload bridge exists. Turning a capability on
 * NEVER changes default behavior — `enabled` defaults false everywhere.
 *
 * Per-user, dynamic-key factory store (sister to integrationsStore); secrets
 * route through secretsAdapter so they upgrade to the OS keychain for free.
 */

import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { integrationsUserIdHolder } from '../utils/integrationsStore';

export interface AppfolioSyncConfig {
    enabled: boolean;
    baseUrl: string;       // e.g. https://yourco.appfolio.com/api/v2
    clientId: string;
    clientSecret: string;  // routed through secretsAdapter on save
}

export interface AuthModeConfig {
    /** Flip the sidecar's AUTH_ENABLED. OFF = current single-trusted-Mac mode. */
    enabled: boolean;
    /** Route provider LLM calls through the backend instead of browser-direct. */
    proxyLlmThroughBackend: boolean;
}

export interface CloudReplicationConfig {
    enabled: boolean;
    supabaseUrl: string;
    supabaseAnonKey: string;
}

export interface AutoUpdaterConfig {
    enabled: boolean;
    feedUrl: string;       // GitHub Releases feed for electron-updater
}

export interface NotificationsConfig {
    enabled: boolean;
    morningBrief: boolean;
}

export interface PwaConfig {
    enabled: boolean;      // serve the phone-companion manifest + SW shell
}

export interface ActivationConfig {
    appfolioSync: AppfolioSyncConfig;
    authMode: AuthModeConfig;
    cloudReplication: CloudReplicationConfig;
    autoUpdater: AutoUpdaterConfig;
    notifications: NotificationsConfig;
    pwa: PwaConfig;
}

export function emptyActivation(): ActivationConfig {
    return {
        appfolioSync: { enabled: false, baseUrl: '', clientId: '', clientSecret: '' },
        authMode: { enabled: false, proxyLlmThroughBackend: false },
        cloudReplication: { enabled: false, supabaseUrl: '', supabaseAnonKey: '' },
        autoUpdater: { enabled: false, feedUrl: '' },
        notifications: { enabled: false, morningBrief: false },
        pwa: { enabled: false },
    };
}

export const activationUserIdHolder = integrationsUserIdHolder; // shared identity

function resolveKey(): string {
    const uid = activationUserIdHolder.current;
    return uid ? `activation:${uid}` : 'activation:_anonymous';
}

function deserialize(raw: string | null): ActivationConfig {
    if (!raw) return emptyActivation();
    try {
        const p = JSON.parse(raw) as Partial<ActivationConfig>;
        const e = emptyActivation();
        return {
            appfolioSync: { ...e.appfolioSync, ...(p.appfolioSync || {}) },
            authMode: { ...e.authMode, ...(p.authMode || {}) },
            cloudReplication: { ...e.cloudReplication, ...(p.cloudReplication || {}) },
            autoUpdater: { ...e.autoUpdater, ...(p.autoUpdater || {}) },
            notifications: { ...e.notifications, ...(p.notifications || {}) },
            pwa: { ...e.pwa, ...(p.pwa || {}) },
        };
    } catch {
        return emptyActivation();
    }
}

export const activationStore = createLocalStorageStore<ActivationConfig>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: emptyActivation(),
});

export function saveActivation(next: ActivationConfig): void {
    activationStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Standing convention: factory-store reset escape hatch. */
export function resetActivation(): void {
    activationStore.set(emptyActivation(), () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

/* ── Readiness predicates: "is this capability configured enough to run?" ── */

export function appfolioReady(c: ActivationConfig): boolean {
    const a = c.appfolioSync;
    return a.enabled && !!a.baseUrl && !!a.clientId && !!a.clientSecret;
}
export function cloudReplicationReady(c: ActivationConfig): boolean {
    const r = c.cloudReplication;
    return r.enabled && !!r.supabaseUrl && !!r.supabaseAnonKey;
}
export function autoUpdaterReady(c: ActivationConfig): boolean {
    return c.autoUpdater.enabled && !!c.autoUpdater.feedUrl;
}

export type CapabilityKey =
    | 'appfolioSync' | 'authMode' | 'cloudReplication'
    | 'autoUpdater' | 'notifications' | 'pwa';

export interface CapabilityStatus {
    key: CapabilityKey;
    label: string;
    /** 'off' | 'configured' | 'ready' | 'blocked' (needs a backend half). */
    state: 'off' | 'configured' | 'ready' | 'blocked';
    detail: string;
}

/**
 * Status for the Activation Center UI. "blocked" = the frontend config is
 * complete but the backend route / Electron bridge that finishes activation
 * isn't shipped yet (honest — matches the assessment's "frontend-ready,
 * backend pending" pattern).
 */
export function capabilityStatuses(c: ActivationConfig): CapabilityStatus[] {
    return [
        {
            key: 'appfolioSync',
            label: 'Live AppFolio sync',
            state: appfolioReady(c) ? 'blocked' : c.appfolioSync.enabled ? 'configured' : 'off',
            detail: appfolioReady(c)
                ? 'Configured — needs the backend /api/appfolio/sync route to go live.'
                : 'Add base URL + client credentials to replace seed data with live feeds.',
        },
        {
            key: 'authMode',
            label: 'Authentication on',
            state: c.authMode.enabled ? 'blocked' : 'off',
            detail: c.authMode.enabled
                ? 'Requested — set AUTH_ENABLED=true in the sidecar to enforce it.'
                : 'Off (single trusted Mac). Turn on before distributing beyond one machine.',
        },
        {
            key: 'cloudReplication',
            label: 'Cloud replication (One Save)',
            state: cloudReplicationReady(c) ? 'blocked' : c.cloudReplication.enabled ? 'configured' : 'off',
            detail: cloudReplicationReady(c)
                ? 'Configured — needs the backend replication worker to push objects/ to Supabase.'
                : 'Add Supabase URL + anon key for multi-Mac continuity.',
        },
        {
            key: 'autoUpdater',
            label: 'Auto-updater (packaged app)',
            state: autoUpdaterReady(c) ? 'blocked' : c.autoUpdater.enabled ? 'configured' : 'off',
            detail: autoUpdaterReady(c)
                ? 'Configured — needs electron-updater wired in the packaged build.'
                : 'Add a GitHub Releases feed URL to close the DMG update loop.',
        },
        {
            key: 'notifications',
            label: 'Desktop notifications',
            state: c.notifications.enabled ? 'ready' : 'off',
            detail: c.notifications.enabled
                ? 'On — morning brief can surface via the Notification API (asks permission once).'
                : 'Off. Turn on to get the morning brief as a desktop notification.',
        },
        {
            key: 'pwa',
            label: 'Phone companion (PWA)',
            state: c.pwa.enabled ? 'ready' : 'off',
            detail: c.pwa.enabled
                ? 'On — manifest + service worker shell served for install-to-home-screen.'
                : 'Off. Turn on to install the capture/brief/ARA screens on a phone.',
        },
    ];
}
