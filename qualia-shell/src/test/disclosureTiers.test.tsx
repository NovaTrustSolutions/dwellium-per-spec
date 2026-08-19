/**
 * Plan 047 §2/§3 — progressive disclosure in the sidebar + role starter sets.
 *   - labs-tier widgets never render in the groups (gallery shows Open + "labs").
 *   - long groups preview 6 + "Show N more" → all → "Show less" (local, not persisted).
 *   - pickRole(owner) expands only Property Management; pickRole(staff) collapses all.
 *   - first ARA reply (FirstRunCard) unlocks AI ONCE: toast + "AI Tools" expands.
 *   - getStartupStack / STARTER_SETS per role.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { defaultDockItems } from '../data/hierarchy';

vi.mock('../config', () => ({ API_BASE: '' }));
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), history: vi.fn() },
}));

const openWindow = vi.fn();
vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({
        dockItems: defaultDockItems, windows: [], openWindow, closeWindow: vi.fn(), focusWindow: vi.fn(), restoreWindow: vi.fn(),
        moveDockItem: vi.fn(), saveLayout: vi.fn(), savedLayouts: [], saveNamedLayout: vi.fn(), loadNamedLayout: vi.fn(), deleteNamedLayout: vi.fn(),
    }),
}));
vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({ hierarchy: [], addItem: vi.fn(), getBreadcrumb: () => [], expandAll: vi.fn(), collapseAll: vi.fn() }),
}));
const USER = vi.hoisted(() => ({ id: 'u-tiers', name: 'Zed', email: 'zed@example.com', role: 'management' }));
vi.mock('../context/UserContext', async () => {
    const React = await import('react');
    return {
        UserContext: React.createContext({ user: USER }),
        useUser: () => ({ user: USER, logout: vi.fn(), hasMinRole: () => true }),
    };
});
vi.mock('../context/PermissionsContext', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('../components/Sidebar/SpacesSwitcher', () => ({ default: () => null }));
// FirstRunCard live signals
const live = vi.hoisted(() => ({ araRuns: [] as Array<{ id: string }> }));
vi.mock('../components/StrataDashboard/useStrataQueries', () => ({ useProperties: () => ({ data: [] }) }));
vi.mock('../components/ARAConsole/araHermes', () => ({ araChatRuns: () => live.araRuns }));

import Sidebar, { iconOnlyStore, sidebarGroupsStore } from '../components/Sidebar/Sidebar';
import { setSidebarGroups } from '../components/Sidebar/sidebarGroupsStore';
import FirstRunCard, { pickRole } from '../components/Shell/FirstRunCard';
import { onboardingStore, resetOnboarding, tierOf } from '../lib/onboardingStore';
import { hiddenWidgetsStore } from '../lib/hiddenWidgetsStore';
import { resetFirstRun, firstRunStore } from '../lib/firstRunStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { getStartupStack, STARTER_SETS, PINNED_WIDGETS } from '../components/Shell/defaultStack';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';

beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity(USER.id);
    openWindow.mockReset();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    localStorage.setItem('qualia_sidebar_icon_only', 'false');
    iconOnlyStore.reset();
    sidebarGroupsStore.reset();
    hiddenWidgetsStore.reset();
    onboardingStore.reset(); resetOnboarding();
    firstRunStore.reset(); resetFirstRun();
    live.araRuns = [];
});

describe('starter sets', () => {
    it('owner = pinned five, staff = Strata + Task Board + Inbox Zero', () => {
        expect(STARTER_SETS.owner).toEqual(PINNED_WIDGETS);
        expect(STARTER_SETS.staff.map(p => p.component)).toEqual(['strata-dashboard', 'inbox', 'task-board']);
    });
    it('startup stack: owner ARA+Strata, staff Strata+Task Board, null → owner default', () => {
        expect([...getStartupStack('owner')]).toEqual(['ara-console', 'strata-dashboard']);
        expect([...getStartupStack('staff')]).toEqual(['strata-dashboard', 'task-board']);
        expect([...getStartupStack(null)]).toEqual(['ara-console', 'strata-dashboard']);
    });
});

describe('labs tier is hidden from the sidebar', () => {
    it('every labs-tier widget is absent from the groups even when un-hidden; gallery offers Open', () => {
        // Un-hide Terminal (the only labs widget in the dock) so only the tier filter keeps it out.
        localStorage.setItem('dwellium-terminal-hidden-v1', '1');
        localStorage.setItem('dwellium-agents-folded-v1', '1');
        render(<Sidebar />);
        // expand everything + show-more so any leak would be visible
        act(() => setSidebarGroups(() => new Set(['Property Management', 'AI Tools', 'Filing Cabinet'])));
        screen.getAllByText(/Show \d+ more/).forEach(b => fireEvent.click(b));
        for (const item of defaultDockItems.filter(d => tierOf(d.component) === 'labs')) {
            expect(document.querySelector(`.sidebar__widget-group-children [title^="${item.label} —"]`)).toBeNull();
        }
        fireEvent.click(screen.getByTitle('Add or remove widgets'));
        expect(screen.getByText('Terminal · labs')).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
        expect(openWindow).toHaveBeenCalledWith('terminal', 'Terminal', 'terminal');
    });
    it('registry: every labs widget is either not in the dock or one-shot hidden (structural invariant)', () => {
        const dock = new Set(defaultDockItems.map(d => d.component));
        for (const w of Object.values(WIDGET_REGISTRY)) {
            if (tierOf(w.id) !== 'labs') continue;
            if (dock.has(w.id)) expect(w.id, `${w.id} is labs AND in the dock — only terminal is allowed (hideTerminalOnce)`).toBe('terminal');
        }
    });
});

describe('Show more', () => {
    it('AI Tools previews 6 + "Show N more"; click reveals all + "Show less"; Property Management (≤6) has no row', () => {
        render(<Sidebar />);
        act(() => setSidebarGroups(() => new Set(['Property Management', 'AI Tools', 'Filing Cabinet'])));
        const aiItems = defaultDockItems.filter(d => d.group === 'AI Tools' && !['ara-console'].includes(d.component) && !hiddenWidgetsStore.getSnapshot().includes(d.component) && tierOf(d.component) !== 'labs');
        const more = screen.getByText(`Show ${aiItems.length - 6} more`);
        // Before: only 6 AI Tools children (+ the more row)
        expect(document.querySelectorAll('.sidebar__widget-group-children')[1].querySelectorAll('.sidebar-widget:not(.sidebar-widget--more)')).toHaveLength(6);
        fireEvent.click(more);
        expect(document.querySelectorAll('.sidebar__widget-group-children')[1].querySelectorAll('.sidebar-widget:not(.sidebar-widget--more)')).toHaveLength(aiItems.length);
        expect(screen.getByText('Show less')).toBeInTheDocument();
        // Property Management has 5 non-pinned items → no row
        const pm = document.querySelectorAll('.sidebar__widget-group-children')[0];
        expect(pm.querySelector('.sidebar-widget--more')).toBeNull();
        // Not persisted
        expect(localStorage.getItem('dwellium-sidebar-showall')).toBeNull();
    });
});

describe('role pick → default expansion', () => {
    it('owner expands only Property Management; staff collapses all; role persisted', () => {
        pickRole('owner');
        expect([...sidebarGroupsStore.getSnapshot()]).toEqual(['Property Management']);
        expect(onboardingStore.getSnapshot().role).toBe('owner');
        pickRole('staff');
        expect(sidebarGroupsStore.getSnapshot().size).toBe(0);
        expect(onboardingStore.getSnapshot().role).toBe('staff');
    });
    it('FirstRunCard shows the step-0 chooser with the derived role marked; picking hides it', () => {
        render(<FirstRunCard />);
        const owner = screen.getByRole('button', { name: /I run the properties/ });
        expect(owner.className).toContain('is-suggested');
        expect(screen.getByRole('button', { name: /I help manage them/ }).className).not.toContain('is-suggested');
        fireEvent.click(owner);
        expect(screen.queryByText('First — how do you use Dwellium?')).toBeNull();
        expect(onboardingStore.getSnapshot().role).toBe('owner');
    });
});

describe('AI tier unlock on first ARA reply', () => {
    it('role picked + ARA reply → unlock once, "AI Tools" expands, toast fires; a second reply is a no-op', () => {
        pickRole('owner');
        const toasts: string[] = [];
        const onToast = (e: Event) => toasts.push(String((e as CustomEvent).detail));
        window.addEventListener('qualia-toast', onToast);
        live.araRuns = [{ id: 'r1' }];
        const { rerender } = render(<FirstRunCard />);
        expect(onboardingStore.getSnapshot().unlockedTiers).toEqual(['ai']);
        expect(sidebarGroupsStore.getSnapshot().has('AI Tools')).toBe(true);
        expect(toasts.filter(t => t.startsWith('AI Tools unlocked'))).toHaveLength(1);
        live.araRuns = [{ id: 'r1' }, { id: 'r2' }];
        rerender(<FirstRunCard />);
        expect(toasts.filter(t => t.startsWith('AI Tools unlocked'))).toHaveLength(1);
        window.removeEventListener('qualia-toast', onToast);
    });
    it('legacy account (no role): flag set silently, no expansion, no toast', () => {
        act(() => setSidebarGroups(() => new Set()));
        const toasts: string[] = [];
        const onToast = (e: Event) => toasts.push(String((e as CustomEvent).detail));
        window.addEventListener('qualia-toast', onToast);
        live.araRuns = [{ id: 'r1' }];
        render(<FirstRunCard />);
        expect(onboardingStore.getSnapshot().unlockedTiers).toEqual(['ai']);
        expect(sidebarGroupsStore.getSnapshot().has('AI Tools')).toBe(false);
        expect(toasts).toHaveLength(0);
        window.removeEventListener('qualia-toast', onToast);
    });
});
