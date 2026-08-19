/**
 * sidebarGroupsStore — which sidebar widget groups are expanded.
 *
 * Lifted out of Sidebar.tsx (plan 047 §3) so non-sidebar callers — the
 * FirstRunCard role pick and the AI-tier unlock — can set expansion without
 * importing the whole Sidebar module. Sidebar.tsx re-exports it, so
 * `import { sidebarGroupsStore } from '../components/Sidebar/Sidebar'` still
 * works. Key + default arrangement unchanged (Ilya 2026-06-11; e2e seed set).
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

export const SIDEBAR_GROUPS_KEY = 'qualia_sidebar_groups';

export const sidebarGroupsStore = createLocalStorageStore<Set<string>>(
    () => {
        try {
            const saved = localStorage.getItem(SIDEBAR_GROUPS_KEY);
            if (saved) return new Set(JSON.parse(saved));
        } catch { /* ignore */ }
        // Default arrangement (Ilya 2026-06-11): the daily-driver groups open
        // out of the box — matches the canonical e2e seed set, so fresh
        // browsers see the same sidebar the tests (and Ilya) see.
        return new Set<string>(['Property Management', 'AI Tools', 'Filing Cabinet']);
    },
    new Set<string>(),
);

/**
 * Plan 047 progressive disclosure — set the expanded groups from OUTSIDE the
 * sidebar (FirstRunCard role pick, AI-tier unlock). Same persist path as the
 * in-component setter; `updater` receives the current set.
 */
export function setSidebarGroups(updater: (prev: Set<string>) => Set<string>): void {
    const next = updater(sidebarGroupsStore.getSnapshot());
    sidebarGroupsStore.set(next, () => { try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(Array.from(next))); } catch { /* sandboxed */ } });
}
