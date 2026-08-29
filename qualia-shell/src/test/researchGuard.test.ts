/**
 * researchLlm/guard — outbound firewall block/warn matrix, including the repo
 * PII regex's known UUID false-positive (CLAUDE.md "PII" convention: the
 * card-shape regex /\b(?:\d[ -]*?){13,19}\b/ fires on 16-hex-digit UUID
 * prefixes; the guard strips UUID shapes first, and both directions are
 * pinned here).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { guardOutbound, resetGuardSession } from '../lib/researchLlm/guard';

beforeEach(() => resetGuardSession());

describe('blocks (never overridable, never silently stripped)', () => {
    it('card-number-shaped digits block, with a clear reason', () => {
        const v = guardOutbound('my card is 4111 1111 1111 1111 thanks');
        expect(v.kind).toBe('block');
        expect(v.kind === 'block' && v.reason).toMatch(/card-number/);
    });
    it('dashed card shapes block too', () => {
        expect(guardOutbound('4111-1111-1111-1111').kind).toBe('block');
    });
    it('a raw UUID does NOT block (the known false-positive is neutralized)', () => {
        expect(guardOutbound('debug id 12345678-1234-1234-1234-123456789012 please explain').kind).toBe('ok');
        expect(guardOutbound('id a1b2c3d8-0042-4042-8042-004242004242').kind).toBe('ok');
    });
    it('a card number NEXT TO a UUID still blocks', () => {
        expect(guardOutbound('id 12345678-1234-1234-1234-123456789012 card 4111111111111111').kind).toBe('block');
    });
    it('SSN shape blocks', () => {
        const v = guardOutbound('ssn 123-45-6789');
        expect(v.kind).toBe('block');
        expect(v.kind === 'block' && v.reason).toMatch(/SSN/);
    });
    it('a valid ABA routing number blocks; an invalid 9-digit run does not', () => {
        expect(guardOutbound('routing 011000015 acct').kind).toBe('block'); // valid ABA checksum
        expect(guardOutbound('order number 123456789').kind).toBe('ok'); // fails checksum
    });
    it('confirm never bypasses a block', () => {
        expect(guardOutbound('4111111111111111', { confirmed: true }).kind).toBe('block');
    });
});

describe('housing-vocabulary warning (once per session, confirmable)', () => {
    it('warns once on lease/tenant/resident/rent roll, then stays quiet for the session', () => {
        const first = guardOutbound('what does Georgia law say about tenant rights?');
        expect(first.kind).toBe('warn');
        expect(first.kind === 'warn' && first.reason).toMatch(/housing law is fine/);
        // Second hit in the same session: already warned → allowed through.
        expect(guardOutbound('and lease termination notice periods?').kind).toBe('ok');
    });
    it('an explicit confirm sends the first hit through', () => {
        expect(guardOutbound('summarize resident screening rules', { confirmed: true }).kind).toBe('ok');
    });
    it('"rent roll" (with the space) is covered', () => {
        expect(guardOutbound('what is a rent roll?').kind).toBe('warn');
    });
    it('plain research text passes clean', () => {
        expect(guardOutbound('compare these two models on chain-of-thought math').kind).toBe('ok');
    });
});
