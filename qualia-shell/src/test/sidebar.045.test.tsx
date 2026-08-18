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
vi.mock('../context/UserContext', () => ({
    useUser: () => ({ user: { id: 'u1', name: 'Ilya' }, logout: vi.fn(), hasMinRole: () => true }),
}));
vi.mock('../context/PermissionsContext', () => ({
    usePermissions: () => ({ can: () => true }),
}));
vi.mock('../components/Sidebar/SpacesSwitcher', () => ({ default: () => null }));

import Sidebar, { iconOnlyStore, sidebarGroupsStore } from '../components/Sidebar/Sidebar';

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
