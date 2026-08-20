/**
 * localAccounts — roster defaults + the Architect's editable credential overlay.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    LOCAL_ACCOUNTS,
    accountOverridesStore,
    getEffectiveAccounts,
    setAccountPassword,
    setAccountEnabled,
    isPasswordSet,
    checkLocalPassword,
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

/**
 * Plan 014 guard — the roster must NEVER ship committed secrets again.
 * Tests patterns, not literals: no secret value appears in this file.
 */
describe('plan 014 guard — no committed secrets in the roster', () => {
    // Vitest cwd is qualia-shell/ (import.meta.url is not file: under jsdom).
    const source = readFileSync(
        resolve(process.cwd(), 'src/components/Auth/localAccounts.ts'),
        'utf8',
    );

    it('no base account ships a non-empty password (runtime-set only)', () => {
        for (const a of LOCAL_ACCOUNTS) {
            expect({ name: a.name, password: a.password }).toEqual({ name: a.name, password: '' });
        }
    });

    it('source contains no non-empty `password:` literal', () => {
        // Case-sensitive on purpose: `backendPassword:` (dev backend seed,
        // tracked separately by the rotation TODO) is not this field.
        expect(source).not.toMatch(/password:\s*'[^']+'/);
        expect(source).not.toMatch(/password:\s*"[^"]+"/);
    });

    it('source contains no personal email (PII)', () => {
        expect(source).not.toMatch(/iklipinitser|@gmail\./i);
    });
});

describe('checkLocalPassword (plan 014 DEV bootstrap)', () => {
    it('blank account: hard-blocked in production, waived in DEV builds', () => {
        const lisa = eff(lisaId);
        expect(checkLocalPassword(lisa, 'anything', false)).toBe('not-set');
        expect(checkLocalPassword(lisa, 'anything', true)).toBe('ok');
    });

    it('a runtime-set password is enforced in BOTH modes', () => {
        setAccountPassword(lisaId, 'Runtime-Set-1!');
        const lisa = eff(lisaId);
        expect(checkLocalPassword(lisa, 'Runtime-Set-1!', false)).toBe('ok');
        expect(checkLocalPassword(lisa, 'Runtime-Set-1!', true)).toBe('ok');
        expect(checkLocalPassword(lisa, 'wrong', false)).toBe('mismatch');
        expect(checkLocalPassword(lisa, 'wrong', true)).toBe('mismatch');
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
