import { describe, expect, it } from 'vitest';
import { truncateLabel } from './truncateLabel';

describe('truncateLabel', () => {
    it('leaves short labels alone', () => {
        expect(truncateLabel('Maple Court')).toBe('Maple Court');
        expect(truncateLabel('Exactly eighteen!!')).toBe('Exactly eighteen!!');
    });
    it('truncates to max chars including the ellipsis', () => {
        const out = truncateLabel('Riverside Gardens Apartments Phase II');
        expect(out).toBe('Riverside Gardens…');
        expect(out.length).toBeLessThanOrEqual(18);
    });
    it('honours a custom max and non-string input', () => {
        expect(truncateLabel('abcdefgh', 5)).toBe('abcd…');
        expect(truncateLabel(null)).toBe('');
        expect(truncateLabel(12345)).toBe('12345');
    });
});
