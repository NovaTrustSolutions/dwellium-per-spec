import { describe, it, expect, beforeEach } from 'vitest';
import { spacesStore, DEFAULT_SPACES, saveCurrentAsSpace } from '../lib/spacesStore';

beforeEach(() => {
    spacesStore.reset();
    localStorage.clear();
});

describe('spacesStore (Way 2)', () => {
    it('defaults to the 5 proposal Spaces in order', () => {
        expect(spacesStore.getSnapshot().map(s => s.id)).toEqual(['write', 'manage', 'research', 'comms', 'build']);
    });

    it('default Spaces map to real registry component ids', () => {
        const write = DEFAULT_SPACES.find(s => s.id === 'write')!;
        expect(write.widgets).toContain('scribe');
        const manage = DEFAULT_SPACES.find(s => s.id === 'manage')!;
        expect(manage.widgets).toContain('strata-dashboard');
    });

    it('getServerSnapshot returns the defaults (SSR-safe)', () => {
        expect(spacesStore.getServerSnapshot().length).toBe(5);
    });

    it('saveCurrentAsSpace appends a user Space (deduped widgets)', () => {
        saveCurrentAsSpace('Morning', ['scribe', 'inbox', 'scribe']);
        const morning = spacesStore.getSnapshot().find(s => s.name === 'Morning');
        expect(morning).toBeTruthy();
        expect(morning!.widgets).toEqual(['scribe', 'inbox']);
        expect(spacesStore.getSnapshot().length).toBe(6);
    });
});
