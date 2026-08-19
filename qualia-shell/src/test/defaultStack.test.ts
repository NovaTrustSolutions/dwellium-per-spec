/**
 * defaultStack — default startup workspace predicate (Ilya 2026-06-11) +
 * sidebar default-groups arrangement.
 */
import { describe, it, expect } from 'vitest';
import {
    shouldOpenDefaultStack,
    defaultStackKey,
    readDefaultStackFlag,
    DEFAULT_STACK_KEY,
    DEFAULT_STACK_DONE,
    DEFAULT_STARTUP_STACK,
    PINNED_WIDGETS,
    STARTER_SETS,
    getStartupStack,
} from '../components/Shell/defaultStack';
import { sidebarGroupsStore } from '../components/Sidebar/Sidebar';

describe('shouldOpenDefaultStack', () => {
    it('fires on first launch with an empty canvas', () => {
        expect(shouldOpenDefaultStack(null, 0)).toBe(true);
    });
    it('never fires once the flag is set', () => {
        expect(shouldOpenDefaultStack(DEFAULT_STACK_DONE, 0)).toBe(false);
    });
    it('never stomps an existing layout (open windows present)', () => {
        expect(shouldOpenDefaultStack(null, 3)).toBe(false);
    });
    it('the sidebar PINNED five, in order (single source of truth)', () => {
        expect(PINNED_WIDGETS.map(p => p.component)).toEqual([
            'ara-console', 'strata-dashboard', 'scribe', 'inbox', 'task-board',
        ]);
    });
    it('the startup stack is two windows — ARA + Strata (plan 045 §B2)', () => {
        expect([...DEFAULT_STARTUP_STACK]).toEqual(['ara-console', 'strata-dashboard']);
        expect(DEFAULT_STARTUP_STACK).toHaveLength(2);
    });
    it('plan 047 §2 starter sets per role: owner = pinned five; staff = Strata + Task Board + Inbox Zero; stacks per role', () => {
        expect(STARTER_SETS.owner).toBe(PINNED_WIDGETS);
        expect(STARTER_SETS.staff.map(p => p.component).sort()).toEqual(['inbox', 'strata-dashboard', 'task-board']);
        expect([...getStartupStack('owner')]).toEqual([...DEFAULT_STARTUP_STACK]);
        expect([...getStartupStack('staff')]).toEqual(['strata-dashboard', 'task-board']);
        expect([...getStartupStack(null)]).toEqual([...DEFAULT_STARTUP_STACK]);
    });
});

describe('defaultStackKey — per-user flag (046-F1)', () => {
    it('namespaces by user id; null falls back to the legacy key', () => {
        expect(defaultStackKey('u1')).toBe('dwellium:default-stack:v1:u1');
        expect(defaultStackKey(null)).toBe(DEFAULT_STACK_KEY);
    });
    it('legacy per-browser done counts for EVERY user (read both, never migrate)', () => {
        const legacyOnly = (k: string) => (k === DEFAULT_STACK_KEY ? DEFAULT_STACK_DONE : null);
        expect(readDefaultStackFlag(legacyOnly, 'u1')).toBe(DEFAULT_STACK_DONE);
        expect(shouldOpenDefaultStack(readDefaultStackFlag(legacyOnly, 'u1'), 0)).toBe(false);
        const perUserOnly = (k: string) => (k === defaultStackKey('u1') ? DEFAULT_STACK_DONE : null);
        expect(readDefaultStackFlag(perUserOnly, 'u1')).toBe(DEFAULT_STACK_DONE);
        // Another user on the same browser, no legacy flag → fires for them.
        expect(readDefaultStackFlag(perUserOnly, 'u2')).toBeNull();
        expect(shouldOpenDefaultStack(readDefaultStackFlag(perUserOnly, 'u2'), 0)).toBe(true);
    });
});

describe('sidebar default groups (fresh browser)', () => {
    it('daily-driver groups are expanded out of the box', () => {
        try { localStorage.removeItem('qualia_sidebar_groups'); } catch { /* */ }
        (sidebarGroupsStore as unknown as { reset?: () => void }).reset?.();
        const groups = sidebarGroupsStore.getSnapshot();
        expect(groups.has('Property Management')).toBe(true);
        expect(groups.has('AI Tools')).toBe(true);
        expect(groups.has('Filing Cabinet')).toBe(true);
    });
});
