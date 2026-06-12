/**
 * defaultStack — default startup workspace predicate (Ilya 2026-06-11) +
 * sidebar default-groups arrangement.
 */
import { describe, it, expect } from 'vitest';
import {
    shouldOpenDefaultStack,
    DEFAULT_STACK_DONE,
    DEFAULT_STARTUP_STACK,
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
    it('the stack is the sidebar PINNED five, in order', () => {
        expect([...DEFAULT_STARTUP_STACK]).toEqual([
            'ara-console', 'strata-dashboard', 'scribe', 'inbox', 'task-board',
        ]);
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
