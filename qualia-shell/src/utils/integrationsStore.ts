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
import { encryptBundle, decryptBundle, bundleHasPlaintextSecret, bundleHasCiphertext } from './integrationsCrypto';

/**
 * Holder updated by UserProvider during render BEFORE useSyncExternalStore reads.
 *
 * ⚠️ SHARED IDENTITY: many other stores alias this exact object
 * (llmUsageUserIdHolder / goalsUserIdHolder / morningBriefUserIdHolder /
 * agentContextUserIdHolder / artifactsUserIdHolder / activationUserIdHolder /
 * costKpiUserIdHolder = integrationsUserIdHolder) and their components write
 * the RAW `user.id` into it during render. Its value MUST therefore stay the
 * raw `user.id` — writing anything else here makes two components alternate
 * the value within one render pass, which invalidates dynamic-key store
 * caches on every getSnapshot and infinite-loops React (error #185; shipped
 * once at dbcfe00, rolled back — see FUCKUPS.md).
 */
export const integrationsUserIdHolder: { current: string | null } = { current: null };

/**
 * PRIVATE holder for the INTEGRATIONS VAULT ONLY (Task C, decoupled after the
 * dbcfe00 #185 incident). Carries the STABLE per-person id from
 * `stableIntegrationsOwnerId` (email-based). Written only by useIntegrations /
 * useAIAvailability (render) and unlockIntegrations (login effect) — never by
 * the alias-riding stores, so its value can never alternate mid-render.
 */
export const integrationsOwnerIdHolder: { current: string | null } = { current: null };

/**
 * Stable per-PERSON identifier for the integrations vault (Task C, 2026-07-02).
 *
 * `user.id` is NOT stable for the same human across login paths: backend
 * `login()` uses the server id, the static fallback uses the `data/users.json`
 * id, Google uses the backend id, and local/Architect logins mint their own —
 * so keys saved under one path landed in a vault the next login couldn't see
 * (different `integrations:<id>` namespace AND a different derived AES key).
 *
 * The vault is therefore keyed by the user's normalized email whenever one
 * exists (`email:<trimmed-lowercase>`), which is identical across every login
 * path for the same person. Accounts without an email fall back to `user.id`.
 * ALL holder assignment sites and save calls must use this resolver.
 */
export function stableIntegrationsOwnerId(
    user: { id: string; email?: string | null } | null | undefined,
): string | null {
    if (!user) return null;
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    return email ? `email:${email}` : user.id;
}

/** Resolve the localStorage key for the currently-active person (or null fallback). */
function resolveKey(): string {
    const uid = integrationsOwnerIdHolder.current;
    return uid ? `integrations:${uid}` : 'integrations:_anonymous';
}

function remoteObjectId(userId: string): string {
    return `integrations_${userId}`;
}

/** A bundle "has a secret" if any secret field holds ciphertext OR plaintext. */
function bundleHasAnySecret(bundle: IntegrationsBundle): boolean {
    return bundleHasCiphertext(bundle) || bundleHasPlaintextSecret(bundle);
}

/**
 * On login, decide whether the One Save REMOTE bundle should replace the LOCAL
 * at-rest copy. Guards against the two ways a flapping/again-reachable backend
 * could silently wipe good local keys:
 *   - a TOMBSTONED remote (keys cleared on another device) — every other One
 *     Save store already checks `deletedAt == null`; integrations did not.
 *   - a SECRET-LESS remote overwriting a local copy that still holds keys
 *     (mirrors the save-path anti-clobber guard).
 * Remote wins only when it actually carries a secret (the cross-device source of
 * truth); an empty remote is adopted solely when local is empty too.
 */
export function shouldAdoptRemoteBundle(args: {
    remoteDeleted: boolean;
    remoteHasSecret: boolean;
    localHasSecret: boolean;
}): boolean {
    if (args.remoteDeleted) return false;
    if (args.remoteHasSecret) return true;
    return !args.localHasSecret;
}

/** Persist only the encrypted bundle through One Save. */
async function syncEncryptedBundle(bundle: IntegrationsBundle, userId: string | null): Promise<void> {
    if (!userId || bundleHasPlaintextSecret(bundle)) return;
    // Encryption is async. If the user switches accounts while a save is still
    // pending, do not send the old user's encrypted bundle under the new
    // session token.
    if (integrationsOwnerIdHolder.current !== userId) return;
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
 * Migrate keys stranded under LEGACY vault namespaces into the stable one
 * (Task C). Legacy vaults were keyed — and their ciphertext encrypted — by the
 * unstable `user.id` of whichever login path wrote them; the namespace suffix
 * IS the id the bundle was encrypted with, so each candidate is decrypted with
 * its own suffix and re-encrypted under the stable id. Conservative on purpose:
 * runs only when the stable vault holds no secret yet, only consults the ids
 * KNOWN to belong to this person (`legacyIds`, i.e. the current session's
 * `user.id`) plus `_anonymous`, and never deletes the legacy copy (a failed
 * migration must not lose the only remaining copy of a key).
 */
async function migrateStrandedVaults(stableId: string, legacyIds: string[]): Promise<void> {
    let stableRaw: string | null = null;
    try { stableRaw = localStorage.getItem(`integrations:${stableId}`); } catch { return; }
    if (stableRaw && bundleHasAnySecret(deserialize(stableRaw))) return; // stable vault already has keys
    const candidates = [...legacyIds.filter((id) => id && id !== stableId), '_anonymous'];
    for (const legacy of candidates) {
        let raw: string | null = null;
        try { raw = localStorage.getItem(`integrations:${legacy}`); } catch { continue; }
        if (!raw) continue;
        const parsed = deserialize(raw);
        if (!bundleHasAnySecret(parsed)) continue;
        try {
            const decrypted = await decryptBundle(parsed, legacy === '_anonymous' ? null : legacy);
            // decryptBundle resolves wrong-key fields to '' — only adopt if a
            // real secret survived decryption (never migrate garbage).
            if (!bundleHasPlaintextSecret(decrypted)) continue;
            const reEncrypted = await encryptBundle(decrypted, stableId);
            localStorage.setItem(`integrations:${stableId}`, JSON.stringify(reEncrypted));
            return; // first successful migration wins
        } catch { /* try the next candidate */ }
    }
}

/**
 * Decrypt the active user's at-rest bundle into the in-memory snapshot. Call on
 * login (UserProvider bootstrap). Idempotent + safe: legacy plaintext fields
 * pass through unchanged (transparent migration), and a wrong-key/tampered
 * value resolves to '' rather than leaking ciphertext to a provider.
 *
 * `userId` should be the STABLE person id from `stableIntegrationsOwnerId`.
 * `legacyIds` (optional) are additional ids known to belong to the same person
 * (e.g. the raw session `user.id`) whose stranded vaults get migrated in.
 */
export async function unlockIntegrations(userId: string | null, legacyIds: string[] = []): Promise<void> {
    if (typeof window === 'undefined') return;
    integrationsOwnerIdHolder.current = userId; // ensure resolveKey() targets this person (private vault holder)
    if (userId) {
        try { await migrateStrandedVaults(userId, legacyIds); } catch { /* migration is best-effort */ }
    }
    let raw: string | null = null;
    try { raw = localStorage.getItem(resolveKey()); } catch { return; }
    let hydratedFromRemote = false;
    if (userId) {
        try {
            const { oneSaveClient } = await import('../lib/oneSaveClient');
            const remote = await oneSaveClient.get<IntegrationsBundle>(remoteObjectId(userId));
            if (remote?.payload) {
                // Anti-clobber: a flapped backend or a clear on another device
                // must never wipe good local keys. Adopt the remote only when it
                // is live (not tombstoned) and either carries a secret or local
                // is empty too.
                const localHasSecret = raw ? bundleHasAnySecret(deserialize(raw)) : false;
                const remoteHasSecret = bundleHasAnySecret(remote.payload as IntegrationsBundle);
                if (shouldAdoptRemoteBundle({
                    remoteDeleted: remote.deletedAt != null,
                    remoteHasSecret,
                    localHasSecret,
                })) {
                    raw = JSON.stringify(remote.payload);
                    localStorage.setItem(resolveKey(), raw);
                    hydratedFromRemote = true;
                }
            }
        } catch { /* One Save disabled/offline — keep local encrypted copy */ }
    }
    // Remote LEGACY migration (Task C follow-up): keys synced from another
    // device before the stable-id change live at `integrations_<old user.id>`
    // remotely and are encrypted with a key derived from that legacy id.
    // When the stable vault (local + remote) is still secret-less, adopt the
    // first legacy remote copy that decrypts, re-encrypted under the stable
    // id. hydratedFromRemote stays false so the normal backfill pushes the
    // re-encrypted copy to the STABLE remote object afterwards.
    if (userId && (!raw || !bundleHasAnySecret(deserialize(raw)))) {
        for (const legacy of legacyIds.filter((id) => id && id !== userId)) {
            try {
                const { oneSaveClient } = await import('../lib/oneSaveClient');
                const remote = await oneSaveClient.get<IntegrationsBundle>(remoteObjectId(legacy));
                const payload = remote?.payload as IntegrationsBundle | undefined;
                if (!payload || remote?.deletedAt != null || !bundleHasAnySecret(payload)) continue;
                const decrypted = await decryptBundle(payload, legacy);
                if (!bundleHasPlaintextSecret(decrypted)) continue; // wrong key → don't adopt garbage
                const reEncrypted = await encryptBundle(decrypted, userId);
                raw = JSON.stringify(reEncrypted);
                localStorage.setItem(resolveKey(), raw);
                break;
            } catch { /* try the next legacy id */ }
        }
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
    const userId = integrationsOwnerIdHolder.current;
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
