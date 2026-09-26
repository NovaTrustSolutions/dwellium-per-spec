/**
 * Owner-race guard coverage for the integrations VAULT (encrypted API keys).
 * The vault resolves its key from its private `integrationsOwnerIdHolder` (stable
 * email-based id) at write time, so work that starts as A, awaits, then writes
 * must drop — never land A's plaintext in B's memory snapshot or A's
 * ciphertext/remote payload under B's (or `_anonymous`) storage key.
 * All key strings here are obvious fakes.
 */
import { createElement } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import {
    integrationsStore,
    integrationsOwnerIdHolder,
    saveIntegrationsSecure,
    saveIntegrationsForceRemoval,
    unlockIntegrations,
    stableIntegrationsOwnerId,
} from '../utils/integrationsStore';
import { encryptBundle } from '../utils/integrationsCrypto';
import { emptyIntegrations, type IntegrationsBundle } from '../types/integrations';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { oneSaveClient } from '../lib/oneSaveClient';
import { listGoogleAccounts, type GoogleAccountsResult } from '../lib/googleAccounts';
import { UserContext } from '../context/UserContext';
import GoogleAccountsSection from '../components/ControlPanel/GoogleAccountsSection';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));
vi.mock('../lib/googleAccounts', () => ({
    listGoogleAccounts: vi.fn(),
    failureNote: vi.fn(() => ''),
    startGoogleAuth: vi.fn(),
    disconnectGoogleAccount: vi.fn(),
    setGoogleAccountEnabled: vi.fn(),
    openAuthPopup: vi.fn(),
}));

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

const USER_A = { id: 'user-a', email: 'a@owner.test' };
const USER_B = { id: 'user-b', email: 'b@owner.test' };
const A = stableIntegrationsOwnerId(USER_A)!;
const B = stableIntegrationsOwnerId(USER_B)!;
const KEY_A = `integrations:${A}`;
const KEY_B = `integrations:${B}`;
const REMOTE_A = 'integrations_email_a_owner.test'; // remoteObjectId(A)
const REMOTE_A_LEGACY = 'integrations_user-a'; // remoteObjectId(USER_A.id)
const FAKE_A = 'sk-fake-owner-a';
const FAKE_B = 'sk-fake-owner-b';

function bundleWith(apiKey: string): IntegrationsBundle {
    const b = emptyIntegrations();
    b.llm.anthropic = { apiKey, model: 'claude-haiku-4-5-20251001', enabled: true };
    return b;
}
const snapshotText = () => JSON.stringify(integrationsStore.getSnapshot());

/** What the logout → login renders do: every per-user holder AND the vault holder move to B. */
function switchToB() {
    setPerUserIdentity(null); integrationsOwnerIdHolder.current = null;
    setPerUserIdentity(USER_B.id); integrationsOwnerIdHolder.current = B;
}

/** Seed B's at-rest vault, then leave A signed in with A's keys decrypted in memory. */
async function seedBothVaults() {
    integrationsOwnerIdHolder.current = B;
    await saveIntegrationsSecure(bundleWith(FAKE_B), B);
    integrationsOwnerIdHolder.current = A;
    setPerUserIdentity(USER_A.id);
    await saveIntegrationsSecure(bundleWith(FAKE_A), A);
    vi.mocked(oneSaveClient.put).mockClear();
}

beforeEach(() => {
    localStorage.clear();
    integrationsOwnerIdHolder.current = null;
    integrationsStore.reset();
    vi.mocked(oneSaveClient.get).mockReset().mockResolvedValue(null);
    vi.mocked(oneSaveClient.put).mockReset().mockResolvedValue(null);
    vi.mocked(listGoogleAccounts).mockReset();
});
afterEach(() => {
    cleanup();
    setPerUserIdentity(null);
    integrationsOwnerIdHolder.current = null;
});

describe('owner-race guard — saveIntegrationsSecure / saveIntegrationsForceRemoval', () => {
    it('saveIntegrationsSecure: caller awaited across A → B, then saved as A → dropped (no memory, local, or remote write)', async () => {
        await seedBothVaults();
        const aBefore = localStorage.getItem(KEY_A);
        const bBefore = localStorage.getItem(KEY_B);
        const d = deferred<void>();
        const caller = (async () => { await d.promise; await saveIntegrationsSecure(bundleWith(FAKE_A), A); })();
        switchToB();
        integrationsStore.reset(); // B's render re-reads B's namespace
        d.resolve(); await caller;
        expect(snapshotText()).not.toContain(FAKE_A);
        expect(localStorage.getItem(KEY_B)).toBe(bBefore);
        expect(localStorage.getItem(KEY_A)).toBe(aBefore);
        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });

    it('saveIntegrationsSecure: caller saved as A after logout → nothing lands in _anonymous', async () => {
        await seedBothVaults();
        const d = deferred<void>();
        const caller = (async () => { await d.promise; await saveIntegrationsSecure(bundleWith(FAKE_A), A); })();
        setPerUserIdentity(null); integrationsOwnerIdHolder.current = null;
        integrationsStore.reset();
        d.resolve(); await caller;
        expect(snapshotText()).not.toContain(FAKE_A);
        expect(localStorage.getItem('integrations:_anonymous')).toBeNull();
    });

    it('saveIntegrationsForceRemoval: stale A removal after switch → B\'s vault untouched', async () => {
        await seedBothVaults();
        const bBefore = localStorage.getItem(KEY_B);
        const d = deferred<void>();
        const caller = (async () => { await d.promise; await saveIntegrationsForceRemoval(emptyIntegrations(), A); })();
        switchToB();
        integrationsStore.reset();
        d.resolve(); await caller;
        expect(localStorage.getItem(KEY_B)).toBe(bBefore);
        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });

    it('control: no switch → saveIntegrationsSecure writes memory + A\'s encrypted vault + remote', async () => {
        integrationsOwnerIdHolder.current = A;
        await saveIntegrationsSecure(bundleWith(FAKE_A), A);
        expect(integrationsStore.getSnapshot().llm.anthropic?.apiKey).toBe(FAKE_A);
        expect(localStorage.getItem(KEY_A)).toContain('enc:v1:');
        expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
    });
});

describe('owner-race guard — GoogleAccountsSection refresh (stale useIntegrations.update)', () => {
    const accountsResult: GoogleAccountsResult = {
        available: true,
        accounts: [{ id: 'g-a', email: 'a-mail@owner.test', scopes: ['gmail'], enabled: true }],
    };
    const renderAs = (user: typeof USER_A | null) =>
        createElement(UserContext.Provider, { value: { user } as never }, createElement(GoogleAccountsSection));

    it('account switches while listGoogleAccounts is in flight → A\'s bundle never reaches B\'s memory or vault; busy clears', async () => {
        await seedBothVaults();
        const bBefore = localStorage.getItem(KEY_B);
        const d = deferred<GoogleAccountsResult>();
        vi.mocked(listGoogleAccounts).mockReturnValue(d.promise);
        const view = render(renderAs(USER_A));
        view.rerender(renderAs(null));
        view.rerender(renderAs(USER_B));
        d.resolve(accountsResult);
        await waitFor(() => expect(screen.getByText('+ Connect a Google account')).toBeTruthy());
        await new Promise(r => setTimeout(r, 50)); // let any async encrypt/write settle
        expect(integrationsOwnerIdHolder.current).toBe(B);
        expect(snapshotText()).not.toContain(FAKE_A);
        expect(localStorage.getItem(KEY_B)).toBe(bBefore);
        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });

    it('control: no switch → the refreshed accounts are saved into A\'s vault', async () => {
        await seedBothVaults();
        const aBefore = localStorage.getItem(KEY_A);
        vi.mocked(listGoogleAccounts).mockResolvedValue(accountsResult);
        render(renderAs(USER_A));
        await waitFor(() => expect(integrationsStore.getSnapshot().google.accounts).toEqual(accountsResult.accounts));
        await waitFor(() => expect(localStorage.getItem(KEY_A)).not.toBe(aBefore));
        expect(localStorage.getItem(KEY_A)).toContain('a-mail@owner.test');
        expect(integrationsStore.getSnapshot().llm.anthropic?.apiKey).toBe(FAKE_A);
    });
});

describe('owner-race guard — unlockIntegrations (login effect, UserContext.tsx:571)', () => {
    it('remote GET in flight when B signs in → A\'s payload never lands in B\'s vault or snapshot', async () => {
        await seedBothVaults();
        integrationsStore.reset();
        const bBefore = localStorage.getItem(KEY_B);
        const remoteA = deferred<unknown>();
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) =>
            (id === REMOTE_A ? remoteA.promise : null) as never);
        const runA = unlockIntegrations(A, [USER_A.id]);
        await vi.waitFor(() => expect(oneSaveClient.get).toHaveBeenCalledWith(REMOTE_A));
        switchToB();
        await unlockIntegrations(B, [USER_B.id]); // B's own login effect completes first
        remoteA.resolve({ payload: await encryptBundle(bundleWith(FAKE_A), A), deletedAt: null });
        await runA;
        expect(localStorage.getItem(KEY_B)).toBe(bBefore);
        expect(snapshotText()).not.toContain(FAKE_A);
        expect(integrationsStore.getSnapshot().llm.anthropic?.apiKey).toBe(FAKE_B);
        expect(localStorage.getItem('integrations:_anonymous')).toBeNull();
    });

    it('logout while A\'s unlock is in flight → A\'s decrypted keys never reach the _anonymous snapshot', async () => {
        await seedBothVaults();
        integrationsStore.reset();
        const remoteA = deferred<null>();
        vi.mocked(oneSaveClient.get).mockReturnValue(remoteA.promise as never);
        const runA = unlockIntegrations(A, [USER_A.id]);
        await vi.waitFor(() => expect(oneSaveClient.get).toHaveBeenCalledWith(REMOTE_A));
        setPerUserIdentity(null); integrationsOwnerIdHolder.current = null;
        remoteA.resolve(null);
        await runA;
        expect(snapshotText()).not.toContain(FAKE_A);
        expect(localStorage.getItem('integrations:_anonymous')).toBeNull();
    });

    it('switch right after unlock(A) starts → B\'s legacy-plaintext vault is not re-encrypted under A\'s id', async () => {
        const bPlain = JSON.stringify(bundleWith(FAKE_B));
        localStorage.setItem(KEY_B, bPlain);
        setPerUserIdentity(USER_A.id);
        const runA = unlockIntegrations(A, [USER_A.id]);
        switchToB(); // sync: lands before unlock's first await resumes
        await runA;
        expect(localStorage.getItem(KEY_B)).toBe(bPlain);
        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });

    it('remote LEGACY fetch in flight when B signs in → A\'s migrated ciphertext never lands in B\'s vault', async () => {
        integrationsOwnerIdHolder.current = B;
        await saveIntegrationsSecure(bundleWith(FAKE_B), B);
        integrationsStore.reset();
        const bBefore = localStorage.getItem(KEY_B);
        const legacy = deferred<unknown>();
        vi.mocked(oneSaveClient.get).mockImplementation(async (id: string) =>
            (id === REMOTE_A_LEGACY ? legacy.promise : null) as never);
        setPerUserIdentity(USER_A.id);
        const runA = unlockIntegrations(A, [USER_A.id]);
        await vi.waitFor(() => expect(oneSaveClient.get).toHaveBeenCalledWith(REMOTE_A_LEGACY));
        switchToB();
        legacy.resolve({ payload: await encryptBundle(bundleWith(FAKE_A), USER_A.id), deletedAt: null });
        await runA;
        expect(localStorage.getItem(KEY_B)).toBe(bBefore);
        expect(snapshotText()).not.toContain(FAKE_A);
    });

    it('switch during the plaintext→ciphertext re-encrypt → A\'s ciphertext is not written under B\'s key', async () => {
        localStorage.setItem(KEY_A, JSON.stringify(bundleWith(FAKE_A))); // legacy plaintext at rest
        const bPlain = JSON.stringify(bundleWith(FAKE_B));
        localStorage.setItem(KEY_B, bPlain);
        setPerUserIdentity(USER_A.id);
        // setMemoryOnly notifies listeners synchronously; switch right there, i.e. during encryptBundle.
        const unsub = integrationsStore.subscribe(() => { unsub(); switchToB(); });
        await unlockIntegrations(A, [USER_A.id]);
        expect(localStorage.getItem(KEY_B)).toBe(bPlain);
        expect(oneSaveClient.put).not.toHaveBeenCalled();
    });

    it('control: normal sign-in exactly as the UserContext effect calls it → keys decrypt into memory', async () => {
        integrationsOwnerIdHolder.current = A;
        await saveIntegrationsSecure(bundleWith(FAKE_A), A);
        integrationsStore.reset();
        integrationsOwnerIdHolder.current = A; // useIntegrations render sets it before the effect runs
        await unlockIntegrations(stableIntegrationsOwnerId(USER_A), [USER_A.id]);
        expect(integrationsStore.getSnapshot().llm.anthropic?.apiKey).toBe(FAKE_A);
    });

    it('control: legacy plaintext vault with no switch → re-encrypted under A and pushed', async () => {
        localStorage.setItem(KEY_A, JSON.stringify(bundleWith(FAKE_A)));
        await unlockIntegrations(A, [USER_A.id]);
        expect(integrationsStore.getSnapshot().llm.anthropic?.apiKey).toBe(FAKE_A);
        const atRest = localStorage.getItem(KEY_A) ?? '';
        expect(atRest).toContain('enc:v1:');
        expect(atRest).not.toContain(FAKE_A);
        expect(oneSaveClient.put).toHaveBeenCalledTimes(1);
    });
});
