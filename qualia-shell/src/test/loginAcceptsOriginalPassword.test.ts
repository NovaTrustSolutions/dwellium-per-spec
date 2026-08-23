/**
 * Sign-in must accept the roster's ORIGINAL password even when an override
 * (Control Panel → Accounts) is active — 2026-08-23: an override in the
 * browser's localStorage rejected Ilya's original password on production.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { LOCAL_ACCOUNTS, applyOverrides, getEffectiveAccounts, setAccountPassword, accountOverridesStore } from '../components/Auth/localAccounts';

beforeEach(() => { localStorage.clear(); accountOverridesStore.reset?.(); });

describe('applyOverrides', () => {
    it('keeps the original password reachable as basePassword when an override is set', () => {
        const andy = LOCAL_ACCOUNTS.find(a => a.email === 'andy@dwellium.com')!;
        const [eff] = applyOverrides([andy], { [andy.id]: { password: 'override-pw' } });
        expect(eff.password).toBe('override-pw');
        expect(eff.basePassword).toBe(andy.password);
    });
    it('setAccountPassword does not lose the original (effective roster carries both)', () => {
        const andy = LOCAL_ACCOUNTS.find(a => a.email === 'andy@dwellium.com')!;
        setAccountPassword(andy.id, 'new-one');
        const eff = getEffectiveAccounts().find(a => a.id === andy.id)!;
        expect(eff.password).toBe('new-one');
        expect(eff.basePassword).toBe(andy.password);
        // the sign-in predicate used by LoginScreen
        const matches = (typed: string) => typed === eff.password || (!!eff.basePassword && typed === eff.basePassword);
        expect(matches('new-one')).toBe(true);
        expect(matches(andy.password)).toBe(true);
        expect(matches('wrong')).toBe(false);
    });
});
