import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
    shouldAdoptRemoteBundle,
    stableIntegrationsOwnerId,
    integrationsStore,
    integrationsOwnerIdHolder,
    integrationsUserIdHolder,
    saveIntegrationsSecure,
    unlockIntegrations,
} from '../utils/integrationsStore';
import { emptyIntegrations, type IntegrationsBundle } from '../types/integrations';
import { encryptBundle } from '../utils/integrationsCrypto';
import { oneSaveClient } from '../lib/oneSaveClient';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

// On login, unlockIntegrations pulls the One Save remote copy of the user's API
// keys. It must NEVER let a flapped/again-reachable backend silently wipe good
// local keys — i.e. it must not adopt a tombstoned or secret-less remote over a
// local copy that still holds keys. This is the same deletedAt + anti-clobber
// discipline every other One Save store already uses.
describe('shouldAdoptRemoteBundle — login hydrate anti-clobber', () => {
    it('keeps local keys when the remote was cleared elsewhere (tombstoned)', () => {
        expect(shouldAdoptRemoteBundle({ remoteDeleted: true, remoteHasSecret: true, localHasSecret: true })).toBe(false);
        expect(shouldAdoptRemoteBundle({ remoteDeleted: true, remoteHasSecret: false, localHasSecret: true })).toBe(false);
    });

    it('adopts the remote when it actually carries a secret (cross-device source of truth)', () => {
        expect(shouldAdoptRemoteBundle({ remoteDeleted: false, remoteHasSecret: true, localHasSecret: false })).toBe(true);
        expect(shouldAdoptRemoteBundle({ remoteDeleted: false, remoteHasSecret: true, localHasSecret: true })).toBe(true);
    });

    it('NEVER lets a secret-less remote clobber local keys (the flapped-backend loss path)', () => {
        expect(shouldAdoptRemoteBundle({ remoteDeleted: false, remoteHasSecret: false, localHasSecret: true })).toBe(false);
    });

    it('adopts an empty remote only when local is empty too (harmless)', () => {
        expect(shouldAdoptRemoteBundle({ remoteDeleted: false, remoteHasSecret: false, localHasSecret: false })).toBe(true);
    });
});

// Task C (2026-07-02): the vault must be keyed by a STABLE per-person id.
// user.id is NOT stable for the same human across login paths (backend id vs
// data/users.json id vs local/Architect ids) — keys saved under one login were
// invisible (and undecryptable) under the next. The vault is now keyed by
// normalized email whenever one exists, with migration for stranded legacy
// namespaces.
describe('stableIntegrationsOwnerId — one vault per person', () => {
    it('maps the SAME email to the SAME owner id regardless of user.id / login path', () => {
        expect(stableIntegrationsOwnerId({ id: 'backend-uuid-1', email: 'Andy@Dwellium.com ' }))
            .toBe('email:andy@dwellium.com');
        expect(stableIntegrationsOwnerId({ id: 'users-json-id-7', email: 'andy@dwellium.com' }))
            .toBe('email:andy@dwellium.com');
    });

    it('falls back to user.id when there is no email, and null when logged out', () => {
        expect(stableIntegrationsOwnerId({ id: 'architect-9a921527', email: '' })).toBe('architect-9a921527');
        expect(stableIntegrationsOwnerId({ id: 'x', email: null })).toBe('x');
        expect(stableIntegrationsOwnerId(null)).toBeNull();
    });
});

describe('Task C regression — keys survive user.id drift across login paths', () => {
    const PERSON = stableIntegrationsOwnerId({ id: 'backend-uuid-1', email: 'andy@dwellium.com' })!;

    function bundleWithKey(): IntegrationsBundle {
        const b = emptyIntegrations();
        b.llm.anthropic = { apiKey: 'sk-ant-task-c-survives', model: 'claude-haiku-4-5-20251001', enabled: true };
        return b;
    }

    beforeEach(() => {
        localStorage.clear();
        integrationsOwnerIdHolder.current = null;
        integrationsStore.reset();
        vi.mocked(oneSaveClient.get).mockReset().mockResolvedValue(null);
    });

    it('a key saved under one login path is readable after "reload" as the same person with a DIFFERENT user.id', async () => {
        // Session 1: backend up → user.id = backend-uuid-1. Vault key = stable person id.
        integrationsOwnerIdHolder.current = PERSON;
        await saveIntegrationsSecure(bundleWithKey(), PERSON);
        expect(localStorage.getItem(`integrations:${PERSON}`)).toContain('enc:v1:');

        // Session 2: backend down → SAME email but user.id = users-json-id-7.
        // stableIntegrationsOwnerId resolves the SAME vault, so the key is there.
        integrationsStore.reset();
        integrationsOwnerIdHolder.current = null;
        const session2Owner = stableIntegrationsOwnerId({ id: 'users-json-id-7', email: 'andy@dwellium.com' })!;
        expect(session2Owner).toBe(PERSON);
        await unlockIntegrations(session2Owner, ['users-json-id-7']);

        expect(integrationsStore.getSnapshot().llm.anthropic?.apiKey).toBe('sk-ant-task-c-survives');
    });

    it('migrates keys STRANDED under a legacy user.id namespace into the stable vault', async () => {
        // Legacy install: keys were saved under the raw user.id namespace and
        // encrypted with a key derived from that id.
        const LEGACY = 'backend-uuid-1';
        integrationsOwnerIdHolder.current = LEGACY;
        await saveIntegrationsSecure(bundleWithKey(), LEGACY);
        expect(localStorage.getItem(`integrations:${LEGACY}`)).toContain('enc:v1:');
        expect(localStorage.getItem(`integrations:${PERSON}`)).toBeNull();

        // First login after the fix: unlock under the stable id, passing the
        // session user.id as a legacy id → stranded keys migrate in.
        integrationsStore.reset();
        integrationsOwnerIdHolder.current = null;
        await unlockIntegrations(PERSON, [LEGACY]);

        expect(integrationsStore.getSnapshot().llm.anthropic?.apiKey).toBe('sk-ant-task-c-survives');
        const migrated = localStorage.getItem(`integrations:${PERSON}`) ?? '';
        expect(migrated).toContain('enc:v1:');
        expect(migrated).not.toContain('sk-ant-task-c-survives'); // re-encrypted, not plaintext
        // The legacy copy is left in place on purpose (never delete the only backup).
        expect(localStorage.getItem(`integrations:${LEGACY}`)).toContain('enc:v1:');
    });

    it('does NOT adopt another person\'s vault (no legacy id match → no migration)', async () => {
        const OTHER = 'someone-else-id';
        integrationsOwnerIdHolder.current = OTHER;
        await saveIntegrationsSecure(bundleWithKey(), OTHER);

        integrationsStore.reset();
        integrationsOwnerIdHolder.current = null;
        await unlockIntegrations(PERSON, ['backend-uuid-1']); // OTHER not in legacy ids

        expect(integrationsStore.getSnapshot().llm.anthropic?.apiKey ?? '').toBe('');
        expect(localStorage.getItem(`integrations:${PERSON}`)).toBeNull();
    });

    it('adopts a REMOTE legacy vault (synced from another device pre-fix) into the stable vault', async () => {
        const LEGACY = 'backend-uuid-1';
        const legacyEncrypted = await encryptBundle(bundleWithKey(), LEGACY);
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) => (
            id === `integrations_${LEGACY}`
                ? {
                    id, type: 'integrations', ownerId: LEGACY, schema: 1,
                    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
                    deletedAt: null, payload: legacyEncrypted,
                }
                : null
        ));

        await unlockIntegrations(PERSON, [LEGACY]);

        expect(integrationsStore.getSnapshot().llm.anthropic?.apiKey).toBe('sk-ant-task-c-survives');
        const migrated = localStorage.getItem(`integrations:${PERSON}`) ?? '';
        expect(migrated).toContain('enc:v1:');
        expect(migrated).not.toContain('sk-ant-task-c-survives');
    });

    // Regression guard for the dbcfe00 React #185 incident: 7+ other stores
    // alias integrationsUserIdHolder and write RAW user.id into it during
    // render. The vault key must ride its own PRIVATE holder, so shared-holder
    // churn must NOT invalidate the vault snapshot (same reference returned) —
    // otherwise useSyncExternalStore sees a new snapshot every check and
    // infinite-loops React.
    it('vault snapshot is immune to shared-alias-holder churn (#185 loop guard)', () => {
        integrationsOwnerIdHolder.current = PERSON;
        const first = integrationsStore.getSnapshot();
        integrationsUserIdHolder.current = 'raw-user-id-from-alias-store';
        const second = integrationsStore.getSnapshot();
        integrationsUserIdHolder.current = 'another-raw-id';
        const third = integrationsStore.getSnapshot();
        expect(second).toBe(first);
        expect(third).toBe(first);
    });
});

// --- Regression: One Save object id must satisfy the backend validator -------
// Bug (2026-08-05): stableIntegrationsOwnerId returns `email:<addr>`; the ':'
// and '@' failed /^[A-Za-z0-9_.-]{1,128}$/ so every remote save 400'd silently
// and Gmail/Calendar state never persisted.
describe('remote object id is backend-legal', () => {
    const BACKEND_ID = /^[A-Za-z0-9_.-]{1,128}$/;
    // Mirrors remoteObjectId() in integrationsStore.ts
    const remoteId = (uid: string) =>
        `integrations_${uid.replace(/[^A-Za-z0-9_.-]/g, '_')}`.slice(0, 128);

    it('sanitizes an email-scoped owner id', () => {
        const uid = stableIntegrationsOwnerId({ id: 'backend-uuid-1', email: 'andy@dwellium.com' })!;
        expect(uid).toBe('email:andy@dwellium.com');          // source unchanged
        expect(BACKEND_ID.test(uid)).toBe(false);              // and it is illegal
        expect(remoteId(uid)).toBe('integrations_email_andy_dwellium.com');
        expect(BACKEND_ID.test(remoteId(uid))).toBe(true);
    });

    it('leaves an already-legal uuid owner id intact', () => {
        const uid = stableIntegrationsOwnerId({ id: 'bb0d822e-4cb9-4199-a8ee-b5f93226107f', email: '' })!;
        expect(remoteId(uid)).toBe('integrations_bb0d822e-4cb9-4199-a8ee-b5f93226107f');
        expect(BACKEND_ID.test(remoteId(uid))).toBe(true);
    });

    it('keeps distinct addresses distinct (. and - survive)', () => {
        const a = remoteId(stableIntegrationsOwnerId({ id: 'x', email: 'a.b@x.com' })!);
        const b = remoteId(stableIntegrationsOwnerId({ id: 'x', email: 'a-b@x.com' })!);
        expect(a).not.toBe(b);
    });

    it('never exceeds the 128-char backend limit', () => {
        const long = stableIntegrationsOwnerId({ id: 'x', email: `${'a'.repeat(200)}@x.com` })!;
        expect(remoteId(long).length).toBeLessThanOrEqual(128);
        expect(BACKEND_ID.test(remoteId(long))).toBe(true);
    });
});
