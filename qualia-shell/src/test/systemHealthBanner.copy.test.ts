/**
 * Plan 045 B2 — System Health toast copy.
 * "N connection(s) need(s) setup — open System Health" (drops the old
 * "before everything's operational" tail; keeps pluralisation).
 */
import { describe, it, expect } from 'vitest';
import { needSetupCopy } from '../components/SystemHealth/SystemHealthBanner';

describe('SystemHealthBanner.needSetupCopy', () => {
    it('singular', () => {
        expect(needSetupCopy(1)).toBe('1 connection needs setup — open System Health');
    });
    it('plural', () => {
        expect(needSetupCopy(3)).toBe('3 connections need setup — open System Health');
    });
    it('never mentions the old copy', () => {
        expect(needSetupCopy(2)).not.toMatch(/attention|operational/);
    });
});
