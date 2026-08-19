/** mottoFor — plan 046 F2 role-keyed sidebar motto. */
import { describe, expect, it } from 'vitest';
import { mottoFor, DEFAULT_MOTTO } from '../components/Sidebar/mottoFor';

describe('mottoFor', () => {
    it('every real role returns a non-empty, role-specific string', () => {
        const roles = ['tenant', 'agent', 'maintenance', 'advisor', 'management', 'corporate', 'god'];
        for (const r of roles) {
            const m = mottoFor(r);
            expect(m.length).toBeGreaterThan(0);
            expect(m).not.toBe(DEFAULT_MOTTO);
        }
        expect(new Set(roles.map(mottoFor)).size).toBe(roles.length);
    });
    it('unknown / missing role → default', () => {
        expect(mottoFor('wizard')).toBe(DEFAULT_MOTTO);
        expect(mottoFor(null)).toBe(DEFAULT_MOTTO);
        expect(mottoFor(undefined)).toBe(DEFAULT_MOTTO);
    });
});
