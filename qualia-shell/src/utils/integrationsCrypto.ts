/**
 * integrationsCrypto — at-rest encryption for the secret fields of a per-user
 * IntegrationsBundle (LLM API keys, Supabase keys, Postgres password /
 * connection string, Google OAuth tokens).
 *
 * WebCrypto AES-GCM (256-bit). The key is derived from the user's id via
 * PBKDF2-SHA-256 with a fixed app salt, so each user's secrets use a distinct
 * key and one user can't decrypt another user's localStorage entry.
 *
 * ── Threat model ──────────────────────────────────────────────────────────
 * This protects secrets AT REST in localStorage: they are no longer plaintext
 * to casual devtools inspection, disk / profile backups, sync snapshots, or
 * screen-shares. It is NOT a defence against an attacker who has BOTH the
 * running code bundle AND the localStorage contents — a deterministic derived
 * key can be re-derived from the same inputs. The frictionless upgrade for that
 * stronger model is a user passphrase that is never persisted; deliberately
 * left as a future option so everyday use needs no unlock prompt.
 *
 * ── Token format ──────────────────────────────────────────────────────────
 * `enc:v1:<base64url(iv)>:<base64url(ciphertext)>`. Anything NOT matching the
 * `enc:v1:` prefix is treated as legacy plaintext and passes through unchanged
 * — so existing plaintext installs keep working and become encrypted on the
 * next save (transparent migration).
 *
 * Async by necessity (WebCrypto SubtleCrypto is promise-based). Consumers never
 * touch this module: encryption happens at the persistence boundary and
 * decryption happens once on login (see integrationsStore.ts).
 */

import type { IntegrationsBundle } from '../types/integrations';

const PREFIX = 'enc:v1:';
const APP_SALT = 'dwellium-integrations-v1';
const PBKDF2_ITERATIONS = 100_000;

const textEnc = new TextEncoder();
const textDec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array {
    const norm = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
    const bin = atob(norm + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function getSubtle(): SubtleCrypto | null {
    try {
        const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
        return c && c.subtle ? c.subtle : null;
    } catch {
        return null;
    }
}

function randomIv(): Uint8Array {
    const iv = new Uint8Array(12);
    (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(iv);
    return iv;
}

// Derived keys are deterministic per user id; cache them so we don't re-run
// PBKDF2 on every field of every save.
const keyCache = new Map<string, CryptoKey>();

async function deriveKey(userId: string | null): Promise<CryptoKey | null> {
    const subtle = getSubtle();
    if (!subtle) return null;
    const id = userId || '_anonymous';
    const cached = keyCache.get(id);
    if (cached) return cached;
    const baseKey = await subtle.importKey(
        'raw',
        textEnc.encode(`${id}:${APP_SALT}`),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    const key = await subtle.deriveKey(
        { name: 'PBKDF2', salt: textEnc.encode(APP_SALT), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
    keyCache.set(id, key);
    return key;
}

/** True if the string is one of our `enc:v1:` ciphertext tokens. */
export function isEncrypted(s: string | null | undefined): boolean {
    return typeof s === 'string' && s.startsWith(PREFIX);
}

/**
 * Encrypt a single secret. Returns the value unchanged when it's empty or
 * already encrypted, or when WebCrypto is unavailable (best-effort: we never
 * lose the user's key — worst case it stays plaintext as it is today).
 */
export async function encryptString(plain: string | null | undefined, userId: string | null): Promise<string> {
    if (!plain) return plain ?? '';
    if (isEncrypted(plain)) return plain;
    const subtle = getSubtle();
    const key = await deriveKey(userId);
    if (!subtle || !key) return plain;
    try {
        const iv = randomIv();
        const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, textEnc.encode(plain));
        return `${PREFIX}${b64url(iv)}:${b64url(new Uint8Array(ct))}`;
    } catch {
        return plain;
    }
}

/**
 * Decrypt a single secret. Legacy plaintext (no `enc:v1:` prefix) passes
 * through unchanged. A decryption failure (wrong user / tampered) returns ''
 * rather than the raw ciphertext, so a bad value is never handed to a provider.
 */
export async function decryptString(token: string | null | undefined, userId: string | null): Promise<string> {
    if (!token) return token ?? '';
    if (!isEncrypted(token)) return token; // legacy plaintext passthrough
    const parts = token.slice(PREFIX.length).split(':');
    if (parts.length !== 2) return token;
    const subtle = getSubtle();
    const key = await deriveKey(userId);
    if (!subtle || !key) return token;
    try {
        const iv = unb64url(parts[0]);
        const ct = unb64url(parts[1]);
        const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
        return textDec.decode(pt);
    } catch {
        return '';
    }
}

type FieldTransform = (s: string | null | undefined, userId: string | null) => Promise<string>;

/**
 * Walk the known secret fields of a bundle, applying `xf` to each present
 * string. Returns a deep clone — the input is never mutated.
 */
async function transformBundle(
    bundle: IntegrationsBundle,
    userId: string | null,
    xf: FieldTransform,
): Promise<IntegrationsBundle> {
    const next: IntegrationsBundle =
        typeof structuredClone === 'function'
            ? structuredClone(bundle)
            : (JSON.parse(JSON.stringify(bundle)) as IntegrationsBundle);

    const llm = next.llm;
    if (llm) {
        if (llm.anthropic?.apiKey != null) llm.anthropic.apiKey = await xf(llm.anthropic.apiKey, userId);
        if (llm.openai?.apiKey != null) llm.openai.apiKey = await xf(llm.openai.apiKey, userId);
        if (llm.gemini?.apiKey != null) llm.gemini.apiKey = await xf(llm.gemini.apiKey, userId);
        if (llm.custom?.apiKey != null) llm.custom.apiKey = await xf(llm.custom.apiKey, userId);
    }
    if (next.recall?.apiKey != null) next.recall.apiKey = await xf(next.recall.apiKey, userId);
    if (next.supabase?.anonKey != null) next.supabase.anonKey = await xf(next.supabase.anonKey, userId);
    if (next.supabase?.serviceKey != null) next.supabase.serviceKey = await xf(next.supabase.serviceKey, userId);
    if (next.postgres?.connectionString != null) next.postgres.connectionString = await xf(next.postgres.connectionString, userId);
    if (next.postgres?.password != null) next.postgres.password = await xf(next.postgres.password, userId);
    if (next.google?.gmail?.accessToken != null) next.google.gmail.accessToken = await xf(next.google.gmail.accessToken, userId);
    if (next.google?.gmail?.refreshToken != null) next.google.gmail.refreshToken = await xf(next.google.gmail.refreshToken, userId);
    if (next.google?.calendar?.accessToken != null) next.google.calendar.accessToken = await xf(next.google.calendar.accessToken, userId);
    if (next.google?.calendar?.refreshToken != null) next.google.calendar.refreshToken = await xf(next.google.calendar.refreshToken, userId);
    return next;
}

/** Encrypt every secret field of a bundle for at-rest storage. */
export function encryptBundle(bundle: IntegrationsBundle, userId: string | null): Promise<IntegrationsBundle> {
    return transformBundle(bundle, userId, encryptString);
}

/** Decrypt every secret field of a bundle back to plaintext for in-memory use. */
export function decryptBundle(bundle: IntegrationsBundle, userId: string | null): Promise<IntegrationsBundle> {
    return transformBundle(bundle, userId, decryptString);
}

/** True if any secret field in the bundle is still an `enc:v1:` token. */
export function bundleHasCiphertext(bundle: IntegrationsBundle): boolean {
    const llm = bundle.llm;
    return Boolean(
        isEncrypted(llm?.anthropic?.apiKey) ||
        isEncrypted(llm?.openai?.apiKey) ||
        isEncrypted(llm?.gemini?.apiKey) ||
        isEncrypted(llm?.custom?.apiKey) ||
        isEncrypted(bundle.recall?.apiKey) ||
        isEncrypted(bundle.supabase?.anonKey) ||
        isEncrypted(bundle.supabase?.serviceKey) ||
        isEncrypted(bundle.postgres?.connectionString) ||
        isEncrypted(bundle.postgres?.password) ||
        isEncrypted(bundle.google?.gmail?.accessToken) ||
        isEncrypted(bundle.google?.calendar?.accessToken),
    );
}

/**
 * True if any secret field holds a non-empty PLAINTEXT value (a legacy install
 * written before at-rest encryption). Used to proactively re-encrypt existing
 * keys on first login rather than waiting for the next manual save.
 */
export function bundleHasPlaintextSecret(bundle: IntegrationsBundle): boolean {
    const plain = (s: string | null | undefined) => typeof s === 'string' && s.length > 0 && !isEncrypted(s);
    const llm = bundle.llm;
    return Boolean(
        plain(llm?.anthropic?.apiKey) ||
        plain(llm?.openai?.apiKey) ||
        plain(llm?.gemini?.apiKey) ||
        plain(llm?.custom?.apiKey) ||
        plain(bundle.recall?.apiKey) ||
        plain(bundle.supabase?.anonKey) ||
        plain(bundle.supabase?.serviceKey) ||
        plain(bundle.postgres?.connectionString) ||
        plain(bundle.postgres?.password) ||
        plain(bundle.google?.gmail?.accessToken) ||
        plain(bundle.google?.gmail?.refreshToken) ||
        plain(bundle.google?.calendar?.accessToken) ||
        plain(bundle.google?.calendar?.refreshToken),
    );
}
