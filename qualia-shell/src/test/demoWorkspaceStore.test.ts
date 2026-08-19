/**
 * demoWorkspaceStore — plan 046 D1: per-user runtime flag that routes
 * Strata + Astra through the static data layer. Default OFF; persists under
 * `dwellium-demo-workspace`; `.reset()` restores.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { demoWorkspaceStore, isDemoWorkspace, setDemoWorkspace } from '../lib/demoWorkspaceStore';

beforeEach(() => {
    demoWorkspaceStore.reset();
    localStorage.clear();
});

describe('demoWorkspaceStore', () => {
    it('defaults to OFF', () => {
        expect(isDemoWorkspace()).toBe(false);
        expect(demoWorkspaceStore.getServerSnapshot()).toBe(false);
    });

    it('setDemoWorkspace(true) persists "true" under dwellium-demo-workspace', () => {
        setDemoWorkspace(true);
        expect(isDemoWorkspace()).toBe(true);
        expect(localStorage.getItem('dwellium-demo-workspace')).toBe('true');
        setDemoWorkspace(false);
        expect(isDemoWorkspace()).toBe(false);
        expect(localStorage.getItem('dwellium-demo-workspace')).toBe('false');
    });

    it('reset() re-reads storage', () => {
        localStorage.setItem('dwellium-demo-workspace', 'true');
        demoWorkspaceStore.reset();
        expect(isDemoWorkspace()).toBe(true);
    });

    it('notifies subscribers on change', () => {
        let n = 0;
        const off = demoWorkspaceStore.subscribe(() => { n++; });
        setDemoWorkspace(true);
        off();
        expect(n).toBe(1);
    });
});
