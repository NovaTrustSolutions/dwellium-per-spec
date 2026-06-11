/**
 * integrationsCrypto.test — at-rest encryption round-trips, legacy plaintext
 * passthrough (transparent migration), per-user key isolation, and bundle-level
 * encrypt/decrypt of only the secret fields.
 */
import { describe, it, expect } from 'vitest';
import {
    encryptString,
    decryptString,
    isEncrypted,
    encryptBundle,
    decryptBundle,
    bundleHasCiphertext,
    bundleHasPlaintextSecret,
} from '../utils/integrationsCrypto';
import { emptyIntegrations, type IntegrationsBundle } from '../types/integrations';

const USER = 'user-andy-id';

describe('integrationsCrypto — single value', () => {
    it('encrypts to an enc:v1 token that is not the plaintext, then decrypts back', async () => {
        const plain = 'sk-ant-super-secret-key-1234567890';
        const token = await encryptString(plain, USER);
        expect(token).not.toBe(plain);
        expect(token.startsWith('enc:v1:')).toBe(true);
        expect(isEncrypted(token)).toBe(true);
        expect(token).not.toContain('super-secret'); // no plaintext leaks into the token
        const back = await decryptString(token, USER);
        expect(back).toBe(plain);
    });

    it('leaves empty values empty (nothing to encrypt)', async () => {
        expect(await encryptString('', USER)).toBe('');
        expect(await encryptString(undefined, USER)).toBe('');
    });

    it('passes legacy plaintext through decryption unchanged (transparent migration)', async () => {
        const legacy = 'sk-or-legacy-plaintext-key';
        expect(isEncrypted(legacy)).toBe(false);
        expect(await decryptString(legacy, USER)).toBe(legacy);
    });

    it('is idempotent — re-encrypting an already-encrypted value is a no-op', async () => {
        const token = await encryptString('AIzaSecretGeminiKey', USER);
        const again = await encryptString(token, USER);
        expect(again).toBe(token);
    });

    it('cannot be decrypted with a different user id (per-user key isolation)', async () => {
        const token = await encryptString('eyJ-supabase-service-key', USER);
        const wrong = await decryptString(token, 'user-lisa-id');
        expect(wrong).not.toBe('eyJ-supabase-service-key');
        expect(wrong).toBe(''); // failed decrypt returns '' rather than leaking ciphertext
    });
});

describe('integrationsCrypto — bundle', () => {
    function seeded(): IntegrationsBundle {
        const b = emptyIntegrations();
        b.llm.active = 'anthropic';
        b.llm.anthropic = { apiKey: 'sk-ant-aaa', model: 'claude-haiku-4-5-20251001', enabled: true };
        b.llm.openai = { apiKey: 'sk-oai-bbb', model: 'gpt-4o-mini', enabled: false };
        b.supabase = { url: 'https://x.supabase.co', anonKey: 'eyJ-anon', serviceKey: 'eyJ-service', enabled: true };
        b.postgres = { connectionString: 'postgres://u:p@host:5432/db', enabled: true };
        return b;
    }

    it('encrypts every secret field but leaves non-secret fields intact', async () => {
        const plain = seeded();
        const enc = await encryptBundle(plain, USER);

        // secrets are now ciphertext
        expect(isEncrypted(enc.llm.anthropic!.apiKey)).toBe(true);
        expect(isEncrypted(enc.llm.openai!.apiKey)).toBe(true);
        expect(isEncrypted(enc.supabase!.anonKey)).toBe(true);
        expect(isEncrypted(enc.supabase!.serviceKey)).toBe(true);
        expect(isEncrypted(enc.postgres!.connectionString)).toBe(true);
        expect(bundleHasCiphertext(enc)).toBe(true);

        // non-secret fields untouched
        expect(enc.llm.active).toBe('anthropic');
        expect(enc.llm.anthropic!.model).toBe('claude-haiku-4-5-20251001');
        expect(enc.llm.anthropic!.enabled).toBe(true);
        expect(enc.supabase!.url).toBe('https://x.supabase.co');

        // input bundle was not mutated
        expect(isEncrypted(plain.llm.anthropic!.apiKey)).toBe(false);
    });

    it('round-trips a bundle back to the original plaintext secrets', async () => {
        const plain = seeded();
        const enc = await encryptBundle(plain, USER);
        const dec = await decryptBundle(enc, USER);
        expect(dec.llm.anthropic!.apiKey).toBe('sk-ant-aaa');
        expect(dec.llm.openai!.apiKey).toBe('sk-oai-bbb');
        expect(dec.supabase!.anonKey).toBe('eyJ-anon');
        expect(dec.supabase!.serviceKey).toBe('eyJ-service');
        expect(dec.postgres!.connectionString).toBe('postgres://u:p@host:5432/db');
        expect(bundleHasCiphertext(dec)).toBe(false);
    });

    it('handles an empty bundle without throwing', async () => {
        const enc = await encryptBundle(emptyIntegrations(), USER);
        expect(bundleHasCiphertext(enc)).toBe(false);
        const dec = await decryptBundle(enc, USER);
        expect(dec.llm.active).toBe(null);
    });

    it('detects legacy plaintext for proactive migration, and clears it once encrypted', async () => {
        const plain = seeded();
        expect(bundleHasPlaintextSecret(plain)).toBe(true);   // legacy install → migrate
        const enc = await encryptBundle(plain, USER);
        expect(bundleHasPlaintextSecret(enc)).toBe(false);    // nothing left to migrate
        expect(bundleHasPlaintextSecret(emptyIntegrations())).toBe(false);
    });
});
