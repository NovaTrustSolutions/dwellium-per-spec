/**
 * CoPaw continuous-capture (spec §8.5) — extractor + per-user memory store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { copawStore, copawUserIdHolder, extractFacts, captureFacts, clearMemory, deleteFact, isSensitiveFact } from '../components/Hive/copawStore';

const NOW = new Date('2026-06-04T12:00:00.000Z');

beforeEach(() => {
    localStorage.clear();
    copawStore.reset();
    copawUserIdHolder.current = null;
});

describe('extractFacts', () => {
    it('keeps declarative sentences, drops questions + fragments + filler', () => {
        const text = 'Okay, here is the plan. The vendor must submit a certificate of insurance before any work order is approved. Why? Track COI expiry and send a reminder thirty days before it lapses. Hmm.';
        const facts = extractFacts(text);
        expect(facts.some((f) => f.includes('certificate of insurance'))).toBe(true);
        expect(facts.some((f) => f.endsWith('?'))).toBe(false);
        expect(facts.some((f) => /^okay/i.test(f))).toBe(false);
        expect(facts.every((f) => f.length >= 25)).toBe(true);
    });

    it('caps the number of facts', () => {
        const many = Array.from({ length: 20 }, (_, i) => `This is a sufficiently long declarative fact number ${i} about the system.`).join(' ');
        expect(extractFacts(many, 5).length).toBe(5);
    });

    it('strips code fences, tables, headings, and secrets/PII — keeps only the real sentence', () => {
        const text = '## Vendor Onboarding\nHere is the summary.\nThe shared vendor portal password is Summer2026! for all staff.\nTenant John Doe\'s SSN on file is 123-45-6789 per the lease packet.\n```js\nconst apiKey = "sk-live-abc123def456ghi789"; // used for the payment integration.\n```\n| Unit | Rent | Status of the lease renewal for this unit |\nThe maintenance backlog grew twelve percent last quarter across the portfolio.';
        const facts = extractFacts(text);
        expect(facts).toEqual(['The maintenance backlog grew twelve percent last quarter across the portfolio.']);
        for (const f of facts) {
            expect(f).not.toContain('```');
            expect(f).not.toContain('|');
            expect(f).not.toContain('#');
            expect(f).not.toContain('Summer2026');
            expect(f).not.toContain('123-45-6789');
            expect(f).not.toContain('sk-live');
        }
    });
});

describe('isSensitiveFact', () => {
    it.each([
        ['The vendor portal password is Summer2026!', true],
        ['api_key: sk-abcdefghijklmnopqrstuvwx', true],
        ['AWS key on file: AKIAABCDEFGHIJKLMNOP', true],
        ['-----BEGIN RSA PRIVATE KEY----- leaked in the log', true],
        ['auth token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.', true],
        ['github token ghp_abcdefghijklmnopqrstuvwxyz123456', true],
        ['slack webhook xoxb-1234-5678', true],
        ["Tenant's SSN is 123-45-6789 per the file.", true],
        ['Card on file: 4111 1111 1111 1111', true],
        ['Contact tenant at john.doe@example.com for renewal.', true],
        ['Call the office at (415) 555-0199 for the renewal.', true],
        ['The password reset flow sends an email to the tenant.', false],
        ['Token-based pricing depends on the model.', false],
        ['Rent increased by five hundred dollars in 2026.', false],
        ['The maintenance backlog grew twelve percent last quarter.', false],
    ])('%s -> %s', (text, expected) => {
        expect(isSensitiveFact(text)).toBe(expected);
    });
});

describe('extractFacts keeps meaning', () => {
    it('keeps a leading number and inline-code text, strips list markers', () => {
        const facts = extractFacts('30 days notice is required before any rent increase takes effect.\n1. Run `npm ci` before deploying the tenant portal build.\n> - Vendors must renew their insurance certificate every year.');
        expect(facts).toContain('30 days notice is required before any rent increase takes effect.');
        expect(facts).toContain('Run npm ci before deploying the tenant portal build.');
        expect(facts).toContain('Vendors must renew their insurance certificate every year.');
    });
});

describe('secret filter — reviewer bypasses (plan 071 W2)', () => {
    it.each([
        // Built at runtime so no Stripe-shaped literal is committed (GitHub push protection).
        `The stripe key is ${['sk', 'live', '51H8xJ2KZvKYlo2C0aBcDeFgHiJ'].join('_')} for payments.`,
        'The vendor portal login uses pw: hunter2 for every staff member.',
        'His social security number on file is 123.45.6789 in the lease packet.',
        'The password for the vendor portal is Summer2026! for all staff.',
        'The shared pass​word is Summer2026! for the vendor portal.',
        'Tenant SSN was attached to the application by mistake last week.',
        'Call the property manager at (404) 555-0134 before any site visit.',
    ])('flags %s', (t) => {
        expect(isSensitiveFact(t)).toBe(true);
    });

    it.each([
        'The parcel ID 123456789 was recorded by the county assessor last month.',
        'The secret to low vacancy is fast turnover between tenants.',
        'The secret is consistent follow-up with every tenant after move-in.',
        'The building sold for $1,250,000 on 2026-09-27 after a long listing.',
        'The password reset flow sends an email link to the tenant portal.',
    ])('keeps %s', (t) => {
        expect(isSensitiveFact(t)).toBe(false);
    });

    it('a secret soft-wrapped across lines is not captured', () => {
        const facts = extractFacts('The password\nis Summer2026 for the vendor portal used by the whole team today.\n\nVendors must renew their insurance certificate every single year.');
        expect(facts.some((f) => f.includes('Summer2026'))).toBe(false);
        expect(facts).toContain('Vendors must renew their insurance certificate every single year.');
    });

    it('soft-wrapped prose is captured as one sentence, not fragments', () => {
        expect(extractFacts('The maintenance backlog grew twelve percent\nlast quarter across the whole portfolio.')).toEqual(['The maintenance backlog grew twelve percent last quarter across the whole portfolio.']);
    });
});

describe('captureFacts', () => {
    it('persists extracted facts most-recent-first with source', () => {
        const fresh = captureFacts('Synthesis Lab', 'The maintenance backlog grew twelve percent last quarter across the portfolio.', null, NOW);
        expect(fresh.length).toBe(1);
        const snap = copawStore.getSnapshot();
        expect(snap[0].source).toBe('Synthesis Lab');
        expect(snap[0].text).toContain('maintenance backlog');
    });

    it('de-dupes against existing memory', () => {
        const t = 'Rent increases without notice are a leading driver of tenant churn here.';
        captureFacts('A', t, null, NOW);
        const second = captureFacts('B', t, null, NOW); // same fact text
        expect(second.length).toBe(0);
        expect(copawStore.getSnapshot().length).toBe(1);
    });

    it('drops the capture when userId differs from the current holder (D7)', () => {
        copawUserIdHolder.current = 'andy';
        const fresh = captureFacts('A', 'A fact captured for the wrong account should never be written.', 'lisa', NOW);
        expect(fresh).toEqual([]);
        expect(copawStore.getSnapshot()).toEqual([]);
    });

    it('writes when the passed userId matches the current holder', () => {
        copawUserIdHolder.current = 'andy';
        const fresh = captureFacts('A', 'A fact captured for the right account should be written normally.', 'andy', NOW);
        expect(fresh.length).toBe(1);
    });

    it('isolates memory per user and clears', () => {
        copawUserIdHolder.current = 'andy';
        captureFacts('A', 'Andy has a long enough declarative fact to be captured by CoPaw.', 'andy', NOW);
        expect(localStorage.getItem('dwellium:copaw-memory:andy')).toBeTruthy();
        copawUserIdHolder.current = 'lisa';
        copawStore.reset();
        expect(copawStore.getSnapshot()).toEqual([]);
        copawUserIdHolder.current = 'andy';
        copawStore.reset();
        expect(copawStore.getSnapshot().length).toBe(1);
        clearMemory();
        expect(copawStore.getSnapshot()).toEqual([]);
    });
});

describe('deleteFact', () => {
    it('removes only the targeted fact', () => {
        copawUserIdHolder.current = 'andy';
        captureFacts('A', 'The first declarative fact captured for this deletion test case.', 'andy', NOW);
        captureFacts('A', 'The second declarative fact captured for this deletion test case.', 'andy', NOW);
        const [keep, drop] = copawStore.getSnapshot();
        deleteFact(drop.id);
        const remaining = copawStore.getSnapshot();
        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe(keep.id);
    });
});
