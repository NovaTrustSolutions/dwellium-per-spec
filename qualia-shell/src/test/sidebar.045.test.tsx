/**
 * Sidebar — plan 045 Cluster A (sidebar truth & IA).
 *   A1: footer pill mirrors backendStatusStore ("Live" / "Offline").
 *   A2: PINNED five render once — not duplicated inside the widget groups.
 *   A3: clicking an already-open widget focuses it, never closes it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { defaultDockItems } from '../data/hierarchy';
import { backendStatusStore } from '../lib/backendStatusStore';

vi.mock('../config', () => ({ API_BASE: '' }));

const openWindow = vi.fn();
const closeWindow = vi.fn();
const focusWindow = vi.fn();
const restoreWindow = vi.fn();
let windows: Array<{ id: string; component: string; minimized: boolean }> = [];

vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({
        dockItems: defaultDockItems,
        windows,
        openWindow,
        closeWindow,
        focusWindow,
        restoreWindow,
        moveDockItem: vi.fn(),
        saveLayout: vi.fn(),
        savedLayouts: [],
        saveNamedLayout: vi.fn(),
        loadNamedLayout: vi.fn(),
        deleteNamedLayout: vi.fn(),
    }),
}));
vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({
        hierarchy: [],
        addItem: vi.fn(),
        getBreadcrumb: () => [],
        expandAll: vi.fn(),
        collapseAll: vi.fn(),
    }),
}));
const mockUser = vi.hoisted(() => ({ current: { id: 'u1', name: 'Ilya' } as { id: string; name: string; role?: string } }));
vi.mock('../context/UserContext', async () => {
    const React = await import('react');
    return {
        // 046-B4: Sidebar now reads useMorningBrief() → usePerUserIdentity() → useContext(UserContext).
        UserContext: React.createContext({ user: mockUser.current }),
        useUser: () => ({ user: mockUser.current, logout: vi.fn(), hasMinRole: () => true }),
    };
});
vi.mock('../context/PermissionsContext', () => ({
    usePermissions: () => ({ can: () => true }),
}));
vi.mock('../components/Sidebar/SpacesSwitcher', () => ({ default: () => null }));

import Sidebar, { iconOnlyStore, sidebarGroupsStore } from '../components/Sidebar/Sidebar';
import { mottoFor } from '../components/Sidebar/mottoFor';
import { morningBriefUserIdHolder, upsertBrief, markBriefSeen, resetMorningBriefs } from '../lib/morningBriefStore';
import { dayKey } from '../lib/dailySynthesis';

beforeEach(() => {
    windows = [];
    openWindow.mockReset(); closeWindow.mockReset(); focusWindow.mockReset(); restoreWindow.mockReset();
    backendStatusStore.reset();
    // Weather fetch in Sidebar must not hit the network.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    // Expanded rail (icon-only is the default) with the default groups open.
    localStorage.setItem('qualia_sidebar_icon_only', 'false');
    localStorage.removeItem('qualia_sidebar_groups');
    iconOnlyStore.reset();
    sidebarGroupsStore.reset();
});

describe('A1 — footer connectivity pill reads backendStatusStore', () => {
    it('shows Live when online and Offline when the store flips offline', () => {
        render(<Sidebar />);
        expect(screen.getByText('Live')).toBeInTheDocument();
        act(() => { backendStatusStore.markOffline('Failed to fetch'); });
        expect(screen.getByText('Offline')).toBeInTheDocument();
        expect(document.querySelector('.sidebar__status-dot--offline')).not.toBeNull();
        act(() => { backendStatusStore.markOnline(); });
        expect(screen.getByText('Live')).toBeInTheDocument();
    });
});

describe('A2 — pinned five are not duplicated in the groups', () => {
    it('renders Strata / Task Board exactly once, non-pinned Astra still in its group', () => {
        render(<Sidebar />);
        expect(document.querySelectorAll('.sidebar-widget--pinned')).toHaveLength(5);
        expect(screen.getAllByText('Strata')).toHaveLength(1);
        expect(screen.getAllByText('Task Board')).toHaveLength(1);
        expect(screen.getAllByText('Astra')).toHaveLength(1);
    });
});

describe('A3 — clicking an open widget focuses, never closes', () => {
    it('open + not minimized → focusWindow, not closeWindow', () => {
        windows = [{ id: 'w-strata', component: 'strata-dashboard', minimized: false }];
        render(<Sidebar />);
        fireEvent.click(screen.getByText('Strata'));
        expect(focusWindow).toHaveBeenCalledWith('w-strata');
        expect(closeWindow).not.toHaveBeenCalled();
        expect(openWindow).not.toHaveBeenCalled();
    });
    it('not open → openWindow', () => {
        render(<Sidebar />);
        fireEvent.click(screen.getByText('Strata'));
        expect(openWindow).toHaveBeenCalledWith('strata-dashboard', 'Strata', 'building-2');
        expect(closeWindow).not.toHaveBeenCalled();
    });
    it('minimized → restoreWindow', () => {
        windows = [{ id: 'w-min', component: 'strata-dashboard', minimized: true }];
        render(<Sidebar />);
        fireEvent.click(screen.getByText('Strata'));
        expect(restoreWindow).toHaveBeenCalledWith('w-min');
        expect(closeWindow).not.toHaveBeenCalled();
    });
});

describe('046-F2 — motto is role-driven, not a per-person map', () => {
    it('a non-roster user with role management sees mottoFor("management")', () => {
        mockUser.current = { id: 'u-zed', name: 'Zed', role: 'management' };
        try {
            render(<Sidebar />);
            expect(document.querySelector('.sidebar__greeting-msg')?.textContent).toBe(mottoFor('management'));
        } finally {
            mockUser.current = { id: 'u1', name: 'Ilya' };
        }
    });
});

describe('046-B4 — unread morning-brief badge on the ARA entry', () => {
    it('shows "1 unread brief" on the pinned ARA row and clears on markBriefSeen', () => {
        morningBriefUserIdHolder.current = 'u1';
        resetMorningBriefs();
        render(<Sidebar />);
        expect(screen.queryByLabelText('1 unread brief')).toBeNull();
        const date = dayKey();
        act(() => { upsertBrief({ date, insights: [], suggestions: [], dataLines: ['Goals: x 50%'] }); });
        const badge = screen.getByLabelText('1 unread brief');
        expect(badge.closest('.sidebar-widget--pinned')).not.toBeNull();
        act(() => { markBriefSeen(date); });
        expect(screen.queryByLabelText('1 unread brief')).toBeNull();
        resetMorningBriefs();
    });

    it('icon-rail mode: the badge sits on the ARA rail button', () => {
        morningBriefUserIdHolder.current = 'u1';
        resetMorningBriefs();
        upsertBrief({ date: dayKey(), insights: [], suggestions: [], dataLines: ['x'] });
        localStorage.setItem('qualia_sidebar_icon_only', 'true');
        iconOnlyStore.reset();
        render(<Sidebar />);
        const badge = screen.getByLabelText('1 unread brief');
        expect(badge.closest('.sidebar__icon-rail-btn')).not.toBeNull();
        resetMorningBriefs();
    });
});
