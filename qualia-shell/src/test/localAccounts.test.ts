/**
 * localAccounts — roster defaults + the Architect's editable credential overlay.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    LOCAL_ACCOUNTS,
    accountOverridesStore,
    getEffectiveAccounts,
    setAccountPassword,
    setAccountEnabled,
    isPasswordSet,
    resetAccountOverrides,
} from '../components/Auth/localAccounts';

const lisaId = LOCAL_ACCOUNTS.find(a => a.name === 'Lisa')!.id;
const eff = (id: string) => getEffectiveAccounts().find(a => a.id === id)!;

beforeEach(() => {
    try { localStorage.clear(); } catch { /* sandboxed */ }
    (accountOverridesStore as unknown as { reset?: () => void }).reset?.();
});

describe('localAccounts roster', () => {
    it('ships Lisa enabled but password-less; Archi is god', () => {
        const lisa = LOCAL_ACCOUNTS.find(a => a.name === 'Lisa')!;
        expect(lisa.enabled).toBe(true);
        expect(isPasswordSet(lisa)).toBe(false);
        expect(LOCAL_ACCOUNTS.find(a => a.name === 'Archi')!.role).toBe('god');
    });
});

describe('credential overrides (Architect actions)', () => {
    it('setAccountPassword makes the effective password usable', () => {
        expect(isPasswordSet(eff(lisaId))).toBe(false);
        setAccountPassword(lisaId, 'Secret-1!');
        expect(eff(lisaId).password).toBe('Secret-1!');
        expect(isPasswordSet(eff(lisaId))).toBe(true);
    });

    it('setAccountEnabled toggles the effective enabled flag', () => {
        setAccountEnabled(lisaId, false);
        expect(eff(lisaId).enabled).toBe(false);
        setAccountEnabled(lisaId, true);
        expect(eff(lisaId).enabled).toBe(true);
    });

    it('overrides never mutate the base roster', () => {
        setAccountPassword(lisaId, 'X-temp-1!');
        expect(LOCAL_ACCOUNTS.find(a => a.id === lisaId)!.password).toBe('');
    });

    it('reset clears overrides back to base', () => {
        setAccountPassword(lisaId, 'Y-temp-1!');
        resetAccountOverrides();
        expect(isPasswordSet(eff(lisaId))).toBe(false);
    });
});
