/**
 * secretsAdapter — one place that decides WHERE a secret lives (assessment
 * sweep 2026-06-12, weakness #1 / upgrade #2). Today secrets sit in
 * localStorage (encrypted at rest, but the key derives from the user id —
 * decorative against a local attacker). The packaged Electron app can do far
 * better with the OS keychain via `safeStorage`.
 *
 * This adapter abstracts that choice so the rest of the app never hardcodes
 * localStorage for secrets again. It auto-detects an Electron bridge
 * (`window.dwellium.safeStorage`, exposed by a future preload script) and
 * uses it when present; otherwise it falls back to localStorage transparently.
 * NOTHING about today's behavior changes until that bridge exists — this is
 * pure scaffolding that "activates" the moment the preload ships.
 */

export type SecretBackend = 'keychain' | 'localStorage' | 'memory';

interface ElectronSafeStorageBridge {
    /** Encrypt + persist a secret under `key` in the OS keychain. */
    setSecret(key: string, value: string): Promise<void> | void;
    /** Read + decrypt a secret, or null if absent. */
    getSecret(key: string): Promise<string | null> | string | null;
    /** Remove a secret. */
    removeSecret(key: string): Promise<void> | void;
    /** True if the OS keychain is actually available on this machine. */
    isAvailable?(): boolean;
}

declare global {
    interface Window {
        dwellium?: {
            safeStorage?: ElectronSafeStorageBridge;
        };
    }
}

function bridge(): ElectronSafeStorageBridge | null {
    try {
        const b = window.dwellium?.safeStorage;
        if (b && (b.isAvailable ? b.isAvailable() : true)) return b;
    } catch { /* SSR / sandbox */ }
    return null;
}

/** Which backend secrets are currently stored in. */
export function secretBackend(): SecretBackend {
    if (bridge()) return 'keychain';
    try {
        // probe localStorage availability
        const k = '__dwellium_probe__';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        return 'localStorage';
    } catch {
        return 'memory';
    }
}

const memoryFallback = new Map<string, string>();

export async function setSecret(key: string, value: string): Promise<void> {
    const b = bridge();
    if (b) { await b.setSecret(key, value); return; }
    try { localStorage.setItem(key, value); }
    catch { memoryFallback.set(key, value); }
}

export async function getSecret(key: string): Promise<string | null> {
    const b = bridge();
    if (b) return (await b.getSecret(key)) ?? null;
    try { return localStorage.getItem(key); }
    catch { return memoryFallback.get(key) ?? null; }
}

export async function removeSecret(key: string): Promise<void> {
    const b = bridge();
    if (b) { await b.removeSecret(key); return; }
    try { localStorage.removeItem(key); }
    catch { memoryFallback.delete(key); }
}

/** Human-readable posture line for the security card. */
export function secretsPostureLabel(): string {
    switch (secretBackend()) {
        case 'keychain': return 'OS keychain (Electron safeStorage) — hardened';
        case 'localStorage': return 'Browser localStorage — fine for one trusted Mac';
        case 'memory': return 'In-memory only (storage unavailable) — not persisted';
    }
}
