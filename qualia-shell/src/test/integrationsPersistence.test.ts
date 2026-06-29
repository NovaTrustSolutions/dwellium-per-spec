import { describe, it, expect } from 'vitest';
import { shouldAdoptRemoteBundle } from '../utils/integrationsStore';

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
