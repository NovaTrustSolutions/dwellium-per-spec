/**
 * Cycle 5 — workspaceStore.loadDomaines() async thunk.
 *
 * The store imports fetchDomaines from workspaceApi; we vi.mock that module so the
 * thunk is deterministic (no real HTTP). Covers the happy path (domaines populated,
 * loading cleared), the error path (error message captured, loading cleared, list
 * left empty), and that an error from a prior load is cleared on a fresh load.
 *
 * Pure async assertions — no React render, no fake timers (Phase-7 Finding (B)).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DomaineMeta } from '../components/Workspace/workspaceApi';

const fetchDomainesMock = vi.fn();
vi.mock('../components/Workspace/workspaceApi', () => ({
    fetchDomaines: () => fetchDomainesMock(),
}));

import { useWorkspaceStore } from '../components/Workspace/workspaceStore';

const SAMPLE: DomaineMeta[] = [
    { name: 'Legal', path: 'Legal', description: 'Contracts', color: '#6366f1', position: 0 },
    { name: 'Finance', path: 'Finance', description: '', color: '#8b5cf6', position: 1 },
];

beforeEach(() => {
    fetchDomainesMock.mockReset();
    useWorkspaceStore.getState().reset();
});

describe('Cycle 5 — workspaceStore.loadDomaines()', () => {
    it('happy path: populates domaines and clears loading', async () => {
        fetchDomainesMock.mockResolvedValueOnce(SAMPLE);
        await useWorkspaceStore.getState().loadDomaines();
        const s = useWorkspaceStore.getState();
        expect(s.domaines).toHaveLength(2);
        expect(s.domaines[0].name).toBe('Legal');
        expect(s.loading).toBe(false);
        expect(s.error).toBeNull();
    });

    it('error path: captures the message, clears loading, leaves list empty', async () => {
        fetchDomainesMock.mockRejectedValueOnce(new Error('HTTP 503'));
        await useWorkspaceStore.getState().loadDomaines();
        const s = useWorkspaceStore.getState();
        expect(s.error).toBe('HTTP 503');
        expect(s.loading).toBe(false);
        expect(s.domaines).toEqual([]);
    });

    it('clears a stale error on a subsequent successful load', async () => {
        fetchDomainesMock.mockRejectedValueOnce(new Error('boom'));
        await useWorkspaceStore.getState().loadDomaines();
        expect(useWorkspaceStore.getState().error).toBe('boom');

        fetchDomainesMock.mockResolvedValueOnce(SAMPLE);
        await useWorkspaceStore.getState().loadDomaines();
        const s = useWorkspaceStore.getState();
        expect(s.error).toBeNull();
        expect(s.domaines).toHaveLength(2);
    });

    it('falls back to a generic message for a non-Error rejection', async () => {
        fetchDomainesMock.mockRejectedValueOnce('weird');
        await useWorkspaceStore.getState().loadDomaines();
        expect(useWorkspaceStore.getState().error).toBe('Failed to load domaines');
    });
});
