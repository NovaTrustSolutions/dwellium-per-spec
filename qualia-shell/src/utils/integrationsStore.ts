/**
 * integrationsStore — per-user integrations persistence.
 *
 * Uses createLocalStorageStore dynamic-key signature (Phase-8+ Task 8.10
 * Option β; sister-shape to the 14 factory-produced stores in this codebase
 * per CLAUDE.md). The storage key resolves per-render from a module-level
 * userIdHolder, so Andy and Lisa get separate namespaces:
 *   integrations:user-andy-id  → Andy's keys
 *   integrations:user-lisa-id  → Lisa's keys
 *
 * When the active user changes (login or logout), update userIdHolder.current
 * BEFORE the React render that should see the new namespace. The store
 * invalidates its cache automatically when the resolver returns a different
 * key vs the cached key.
 *
 * Safety: useSyncExternalStore pattern; SSR-safe via getServerSnapshot
 * returning emptyIntegrations(). No render-path localStorage reads.
 */

import { createLocalStorageStore } from './createLocalStorageStore';
import { emptyIntegrations, IntegrationsBundle } from '../types/integrations';
import { encryptBundle, decryptBundle, bundleHasPlaintextSecret } from './integrationsCrypto';

/** Holder updated by UserProvider during render BEFORE useSyncExternalStore reads. */
export const integrationsUserIdHolder: { current: string | null } = { current: null };

/** Resolve the localStorage key for the currently-active user (or null fallback). */
function resolveKey(): string {
    const uid = integrationsUserIdHolder.current;
    return uid ? `integrations:${uid}` : 'integrations:_anonymous';
}

function remoteObjectId(userId: string): string {
    return `integrations_${userId}`;
}

/** Persist only the encrypted bundle through One Save. */
async function syncEncryptedBundle(bundle: IntegrationsBundle, userId: string | null): Promise<void> {
    if (!userId || bundleHasPlaintextSecret(bundle)) return;
    const { oneSaveClient } = await import('../lib/oneSaveClient');
    await oneSaveClient.put({
        id: remoteObjectId(userId),
        type: 'integrations',
        ownerId: userId,
        payload: bundle,
    });
}

function deserialize(raw: string | null): IntegrationsBundle {
    if (!raw) return emptyIntegrations();
    try {
        const parsed = JSON.parse(raw);
        // Defensive: ensure required top-level shape exists. If a stored bundle
        // is missing fields (older schema), merge with empty defaults.
        const empty = emptyIntegrations();
        return {
            llm: { ...empty.llm, ...(parsed.llm || {}) },
            google: { ...empty.google, ...(parsed.google || {}) },
            supabase: parsed.supabase,
            postgres: parsed.postgres,
            // Recall.ai meeting-bot key — preserve across reload (the secret is
            // encrypted at rest like the LLM keys; integrationsCrypto handles it).
            recall: parsed.recall,
            search: parsed.search ? { ...empty.search, ...parsed.search } : empty.search,
            storage: parsed.storage,
            tests: { ...empty.tests, ...(parsed.tests || {}) },
        };
    } catch {
        return emptyIntegrations();
    }
}

/**
 * Per-user integrations store. Dynamic-key shape: each user has their own
 * localStorage entry; the store re-reads when integrationsUserIdHolder.current
 * changes.
 */
export const integrationsStore = createLocalStorageStore<IntegrationsBundle>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: emptyIntegrations(),
});

/**
 * Anti-clobber guard (2026-06-14): NEVER let an all-empty bundle overwrite an
 * at-rest bundle that still holds a secret. A failed decrypt (crypto hiccup /
 * userId mismatch / WebCrypto unavailable) leaves the in-memory bundle empty;
 * without this guard a later save persists empty OVER the real key → silent,
 * permanent key loss. If the incoming bundle has no secret but storage does,
 * we refuse the write (keeping the saved key safe).
 */
function wouldClobberStoredSecret(incoming: IntegrationsBundle): boolean {
    try {
        if (bundleHasPlaintextSecret(incoming)) return false; // incoming has a real secret — fine to write
        const raw = localStorage.getItem(resolveKey());
        if (!raw) return false;
        // Ciphertext (enc:v1:) or a plaintext secret at rest → don't clobber.
        return raw.includes('enc:v1:') || bundleHasPlaintextSecret(deserialize(raw));
    } catch {
        return false;
    }
}

/** Persist an updated bundle to the active user's localStorage namespace. */
export function saveIntegrations(bundle: IntegrationsBundle): void {
    if (typeof window === 'undefined') return;
    if (wouldClobberStoredSecret(bundle)) { setMemoryOnly(bundle); return; }
    integrationsStore.set(bundle, () => {
        try {
            localStorage.setItem(resolveKey(), JSON.stringify(bundle));
        } catch {
            // localStorage full / sandboxed — fail silently; in-memory cache still up to date.
        }
    });
}

/**
 * Publish a bundle to the in-memory snapshot WITHOUT persisting. Consumers read
 * the snapshot via useSyncExternalStore, so this makes plaintext secrets
 * available to them while localStorage keeps only ciphertext.
 */
function setMemoryOnly(bundle: IntegrationsBundle): void {
    integrationsStore.set(bundle, () => { /* no write-through */ });
}

// Monotonic guard so out-of-order async encryptions never clobber a newer save
// (the UI calls saveIntegrationsSecure on every keystroke).
let persistSeq = 0;

/**
 * Persist a bundle with its secret fields ENCRYPTED at rest. The in-memory
 * snapshot stays PLAINTEXT — every consumer (llmClient, Stella, ARA, Supabase,
 * Postgres, …) keeps reading the bundle exactly as before. Only localStorage
 * holds `enc:v1:` ciphertext. Falls back to a plaintext write if WebCrypto is
 * unavailable (never loses the user's keys).
 */
export async function saveIntegrationsSecure(bundle: IntegrationsBundle, userId: string | null): Promise<void> {
    if (typeof window === 'undefined') return;
    // Make the new plaintext visible to consumers immediately (synchronous).
    setMemoryOnly(bundle);
    // Anti-clobber: refuse to PERSIST an all-empty bundle over a stored key
    // (the decrypt-failed → auto-save-empty data-loss path). Intentional full
    // clears go through clearIntegrations() / the Reset button instead.
    if (wouldClobberStoredSecret(bundle)) return;
    const seq = ++persistSeq;
    const key = resolveKey();
    let encrypted: IntegrationsBundle;
    try {
        encrypted = await encryptBundle(bundle, userId);
        if (seq !== persistSeq) return; // a newer save superseded this one
        localStorage.setItem(key, JSON.stringify(encrypted));
    } catch {
        try { localStorage.setItem(key, JSON.stringify(bundle)); } catch { /* storage full / sandboxed */ }
        return;
    }
    try { await syncEncryptedBundle(encrypted, userId); } catch { /* local encrypted copy remains authoritative offline */ }
}

/**
 * Decrypt the active user's at-rest bundle into the in-memory snapshot. Call on
 * login (UserProvider bootstrap). Idempotent + safe: legacy plaintext fields
 * pass through unchanged (transparent migration), and a wrong-key/tampered
 * value resolves to '' rather than leaking ciphertext to a provider.
 */
export async function unlockIntegrations(userId: string | null): Promise<void> {
    if (typeof window === 'undefined') return;
    integrationsUserIdHolder.current = userId; // ensure resolveKey() targets this user
    let raw: string | null = null;
    try { raw = localStorage.getItem(resolveKey()); } catch { return; }
    let hydratedFromRemote = false;
    if (userId) {
        try {
            const { oneSaveClient } = await import('../lib/oneSaveClient');
            const remote = await oneSaveClient.get<IntegrationsBundle>(remoteObjectId(userId));
            if (remote?.payload) {
                raw = JSON.stringify(remote.payload);
                localStorage.setItem(resolveKey(), raw);
                hydratedFromRemote = true;
            }
        } catch { /* One Save disabled/offline — keep local encrypted copy */ }
    }
    if (!raw) return;
    const parsed = deserialize(raw);
    try {
        const decrypted = await decryptBundle(parsed, userId);
        setMemoryOnly(decrypted);
        // Proactive migration: if the at-rest copy still holds legacy plaintext
        // secrets, re-persist them encrypted now (don't wait for a manual save).
        if (bundleHasPlaintextSecret(parsed)) {
            const encrypted = await encryptBundle(decrypted, userId);
            try { localStorage.setItem(resolveKey(), JSON.stringify(encrypted)); } catch { /* sandboxed */ }
            await syncEncryptedBundle(encrypted, userId);
        } else if (!hydratedFromRemote) {
            // First One Save migration: backfill the already-encrypted local copy.
            await syncEncryptedBundle(parsed, userId);
        }
    } catch {
        /* leave snapshot as-is */
    }
}

/**
 * Force-persist a bundle whose secret-bearing field(s) have just been CLEARED.
 *
 * `saveIntegrationsSecure` deliberately REFUSES to persist a bundle that no
 * longer carries a plaintext secret while one still sits at-rest (the
 * decrypt-failed → auto-save-empty anti-clobber guard). That guard is exactly
 * wrong for an INTENTIONAL single-provider Remove: when the user removes the
 * only key, the next bundle is legitimately secret-free and MUST overwrite the
 * stored ciphertext, otherwise the encrypted key lingers on disk and One Save.
 *
 * This helper writes through the anti-clobber guard for that intentional case:
 * it re-encrypts the REMAINING secrets (so other providers' keys stay
 * ciphertext at rest) and persists locally + to One Save. The in-memory
 * snapshot is updated synchronously first so consumers see the removal at once.
 * Encryption itself is never weakened — a cleared field is simply absent.
 */
export async function saveIntegrationsForceRemoval(
    bundle: IntegrationsBundle,
    userId: string | null,
): Promise<void> {
    if (typeof window === 'undefined') return;
    // Make the cleared bundle visible to consumers immediately (synchronous).
    setMemoryOnly(bundle);
    const seq = ++persistSeq;
    const key = resolveKey();
    let encrypted: IntegrationsBundle;
    try {
        encrypted = await encryptBundle(bundle, userId);
        if (seq !== persistSeq) return; // a newer save superseded this one
        localStorage.setItem(key, JSON.stringify(encrypted));
    } catch {
        try { localStorage.setItem(key, JSON.stringify(bundle)); } catch { /* storage full / sandboxed */ }
        return;
    }
    try { await syncEncryptedBundle(encrypted, userId); } catch { /* local encrypted copy remains authoritative offline */ }
}

/** Clear active user's integrations (e.g., manual reset from UI). */
export function clearIntegrations(): void {
    if (typeof window === 'undefined') return;
    const userId = integrationsUserIdHolder.current;
    integrationsStore.set(emptyIntegrations(), () => {
        try {
            localStorage.removeItem(resolveKey());
        } catch {
            /* sandboxed */
        }
    });
    if (userId) {
        void import('../lib/oneSaveClient').then(({ oneSaveClient }) => oneSaveClient.remove(remoteObjectId(userId)));
    }
}
