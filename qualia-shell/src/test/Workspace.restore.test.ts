/**
 * Cycle 10 — per-user persistence polish: pickRestoreDomaine().
 *
 * The Workspace widget persists the last-opened domaine path per-user (workspaceUiStore)
 * and restores it on first mount (decision C10-D1). pickRestoreDomaine() is the pure core
 * of that restore: given the freshly-loaded domaine list and the persisted path, it returns
 * the path to re-open — but ONLY when the domaine still exists, so a stale path (the domaine
 * was renamed/deleted while the widget was closed) safely falls back to the index.
 *
 * Pure synchronous assertions — no React render, no fake timers (Phase-7 Finding (B)).
 */
import { describe, it, expect } from 'vitest';
import { pickRestoreDomaine } from '../components/Workspace/Workspace';
import type { DomaineMeta } from '../components/Workspace/workspaceApi';

const domaine = (name: string): DomaineMeta => ({
    name,
    path: name,
    description: '',
    color: '',
    position: 0,
});

describe('pickRestoreDomaine', () => {
    const domaines = [domaine('finance'), domaine('legal'), domaine('ops')];

    it('returns null when no path was persisted', () => {
        expect(pickRestoreDomaine(domaines, null)).toBeNull();
    });

    it('returns the persisted path when the domaine still exists', () => {
        expect(pickRestoreDomaine(domaines, 'legal')).toBe('legal');
    });

    it('falls back to null when the persisted domaine no longer exists (stale)', () => {
        expect(pickRestoreDomaine(domaines, 'archived')).toBeNull();
    });

    it('returns null against an empty domaine list', () => {
        expect(pickRestoreDomaine([], 'legal')).toBeNull();
    });
});
