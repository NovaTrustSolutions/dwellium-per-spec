/**
 * fluidOs.test.tsx — tests for the plan-049 "Cockpit" FluidOS redesign.
 *
 * The swap-stream tests are gone with the swap stream. What's honestly
 * covered now: store normalization (unchanged contract), the 4-region cockpit
 * layout, the tier-grouped ALL-WIDGETS nav (restrictedToEmails filtering
 * parity with Holocron), widget-row click → openWindow + collapse, Escape
 * close (and its input-focus exception), the preview URL bar → iframe, the
 * background-tasks empty state, and the launcher droplet.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { fluidOsStore, DEFAULT_FLUID_OS_STATE } from '../lib/fluidOsStore';
import { personaWorkStore } from '../lib/agents/personaWorkStore';
import { UserContext, type DwelliumUser } from '../context/UserContext';

function makeWidget(label: string, className: string) {
    return function MockWidget() {
        return <div className={className}>{label} content</div>;
    };
}

vi.mock('../registry/widgetRegistry', () => ({
    WIDGET_REGISTRY: {
        alpha: { id: 'alpha', label: 'Alpha', icon: 'layout-grid', category: 'core' },
        beta: { id: 'beta', label: 'Beta', icon: 'layout-grid', category: 'core' },
        gamma: { id: 'gamma', label: 'Gamma', icon: 'layout-grid', category: 'ai' },
        'audit-log': { id: 'audit-log', label: 'Audit Log', icon: 'scroll-text', category: 'tools', restrictedToEmails: ['andy@dwellium.com'] },
    },
    WINDOW_COMPONENTS: {
        alpha: makeWidget('Alpha', 'alpha-widget'),
        'ara-console': makeWidget('ARA Console', 'ara-widget'),
        terminal: makeWidget('Terminal', 'terminal-widget'),
    },
}));

vi.mock('../components/Sidebar/iconMap', () => ({
    getIcon: () => null,
}));

const openWindowMock = vi.fn();
const focusWindowMock = vi.fn();
const restoreWindowMock = vi.fn();
// Mutable so tests can simulate a window opening while the cockpit is up.
let windowsState: Array<{ id: string; component: string; title: string; icon: string; minimized: boolean; zIndex: number }> = [];
vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({
        windows: windowsState,
        openWindow: openWindowMock,
        focusWindow: focusWindowMock,
        restoreWindow: restoreWindowMock,
    }),
}));

import FluidOS, { cockpitPrefsStore, isKnownFrameBlocked } from '../components/Shell/FluidOS';
import FluidLauncher from '../components/Shell/FluidLauncher';
import CommandPill from '../components/Shell/CommandPill';

function makeUser(partial: Partial<DwelliumUser>): DwelliumUser {
    return {
        id: partial.id ?? 'user-1',
        email: partial.email ?? 'user@example.com',
        name: partial.name ?? 'User',
        role: partial.role ?? 'god',
        assignedProperties: [],
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

function renderCockpitForUser(user: DwelliumUser | null) {
    fluidOsStore.setEnabled(true);
    const value = user ? {
        user,
        token: 'static-test-token',
        role: user.role,
        permissions: {},
        isAuthenticated: true,
        sessionExpired: false,
        isLoading: false,
        login: vi.fn(),
        loginWithGoogle: vi.fn(),
        loginLocal: vi.fn(),
        logout: vi.fn(),
        authFetch: vi.fn(),
        hasMinRole: vi.fn(() => true),
        hasPermission: vi.fn(() => true),
    } : null;
    return render(
        <UserContext.Provider value={value as any}>
            <FluidOS />
        </UserContext.Provider>
    );
}

beforeEach(() => {
    localStorage.clear();
    fluidOsStore.reset();
    cockpitPrefsStore.reset();
    personaWorkStore.reset();
    openWindowMock.mockClear();
    focusWindowMock.mockClear();
    restoreWindowMock.mockClear();
    windowsState = [];
    // The preview pane's reachability probe fires a real fetch — stub it so
    // tests never touch the network.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({} as Response)));
});

describe('fluidOsStore', () => {
    it('normalizes malformed/partial input to defaults', () => {
        localStorage.setItem('dwellium-fluid-os', JSON.stringify({ enabled: 'yes', open: 1 }));
        fluidOsStore.reset();
        expect(fluidOsStore.getSnapshot()).toEqual(DEFAULT_FLUID_OS_STATE);
    });

    it('setEnabled(true) also opens the shell; reset() restores defaults', () => {
        fluidOsStore.setEnabled(true);
        expect(fluidOsStore.getSnapshot()).toEqual({ enabled: true, open: true });
        fluidOsStore.reset();
        expect(fluidOsStore.getSnapshot()).toEqual(DEFAULT_FLUID_OS_STATE);
    });

    it('setOpen toggles independently of enabled', () => {
        fluidOsStore.setEnabled(true);
        fluidOsStore.setOpen(false);
        expect(fluidOsStore.getSnapshot()).toEqual({ enabled: true, open: false });
    });
});

describe('FluidOS cockpit', () => {
    it('renders null when disabled', () => {
        fluidOsStore.reset();
        const { container } = render(
            <UserContext.Provider value={null as any}>
                <FluidOS />
            </UserContext.Provider>
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders null when enabled but not open', () => {
        fluidOsStore.setEnabled(true);
        fluidOsStore.setOpen(false);
        const { container } = render(
            <UserContext.Provider value={null as any}>
                <FluidOS />
            </UserContext.Provider>
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders the four labeled panes (Navigation / Chat / Work / Preview)', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        expect(screen.getByRole('region', { name: 'Navigation' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Work' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Preview' })).toBeInTheDocument();
    });

    it('mounts the real ARA Console and Terminal registry components', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        expect(screen.getByText('ARA Console content')).toBeInTheDocument();
        expect(screen.getByText('Terminal content')).toBeInTheDocument();
    });

    it('nav lists every registry widget; audit-log hidden for a non-matching email', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        expect(screen.getByLabelText('Open Alpha')).toBeInTheDocument();
        expect(screen.getByLabelText('Open Beta')).toBeInTheDocument();
        expect(screen.getByLabelText('Open Gamma')).toBeInTheDocument();
        expect(screen.queryByLabelText('Open Audit Log')).not.toBeInTheDocument();
    });

    it('shows audit-log for the matching (andy) email — parity with Holocron gating', () => {
        renderCockpitForUser(makeUser({ email: 'andy@dwellium.com' }));
        expect(screen.getByLabelText('Open Audit Log')).toBeInTheDocument();
    });

    // 2026-08-22: rows open INSIDE the cockpit (center-pane tabs) — clicking a
    // widget must never throw the user back to the classic desktop.
    it('widget-row click opens the widget as a center-pane tab and keeps the cockpit open', () => {
        const { container } = renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument(); // ARA alone → no strip
        fireEvent.click(screen.getByLabelText('Open Alpha'));
        expect(openWindowMock).not.toHaveBeenCalled();
        expect(fluidOsStore.getSnapshot().open).toBe(true);
        expect(container.querySelector('.alpha-widget')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
        // ARA stays mounted (hidden) so chat state survives tab switches.
        expect(container.querySelector('.ara-widget')).toBeInTheDocument();
        expect((container.querySelector('.ara-widget')!.closest('.fos-chat__body') as HTMLElement).hidden).toBe(true);
        // Back to ARA, close Alpha → strip disappears.
        fireEvent.click(screen.getByRole('tab', { name: 'ARA' }));
        expect((container.querySelector('.ara-widget')!.closest('.fos-chat__body') as HTMLElement).hidden).toBe(false);
        fireEvent.click(screen.getByLabelText('Close Alpha'));
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('"Open in its own window" tears the active tab off into a browser popout and closes it', () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.click(screen.getByLabelText('Open Alpha'));

        const btn = screen.getByRole('button', { name: 'Open Alpha in its own window' });
        fireEvent.click(btn);

        expect(openSpy).toHaveBeenCalledTimes(1);
        expect(openSpy.mock.calls[0][0]).toBe('/?popup=alpha');
        expect(screen.queryByRole('tab', { name: 'Alpha' })).not.toBeInTheDocument();
        // The cockpit itself stays open — only the tab left.
        expect(fluidOsStore.getSnapshot().open).toBe(true);
        openSpy.mockRestore();
    });

    it('keeps the cockpit tab when the popup blocker refuses the popout', () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.click(screen.getByLabelText('Open Alpha'));

        fireEvent.click(screen.getByRole('button', { name: 'Open Alpha in its own window' }));

        expect(screen.getByRole('tab', { name: 'Alpha' })).toBeInTheDocument();
        openSpy.mockRestore();
    });

    it('"Open on desktop" is the explicit way out: openWindow + collapse', () => {
        openWindowMock.mockReturnValue('win-alpha');
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.click(screen.getByLabelText('Open Alpha'));
        fireEvent.click(screen.getByLabelText('Open Alpha on desktop'));
        expect(openWindowMock).toHaveBeenCalledWith('alpha', 'Alpha', 'layout-grid');
        expect(focusWindowMock).toHaveBeenCalledWith('win-alpha');
        expect(fluidOsStore.getSnapshot().open).toBe(false);
    });

    it('adopts a desktop window opened while the cockpit is up (⌘K path) as a tab', () => {
        const user = makeUser({ email: 'lisa@dwellium.com' });
        const { rerender, container } = renderCockpitForUser(user);
        windowsState = [{ id: 'w1', component: 'alpha', title: 'Alpha', icon: 'layout-grid', minimized: false, zIndex: 1 }];
        rerender(
            <UserContext.Provider value={{ user, isAuthenticated: true } as any}>
                <FluidOS />
            </UserContext.Provider>
        );
        expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
        expect(container.querySelector('.alpha-widget')).toBeInTheDocument();
        expect(fluidOsStore.getSnapshot().open).toBe(true);
    });

    it('nav actions (Settings) open in-cockpit too — no collapse', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.click(screen.getByLabelText('Open Settings'));
        expect(fluidOsStore.getSnapshot().open).toBe(true);
        expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('the Home pill collapses back to the classic desktop', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.click(screen.getByRole('button', { name: 'Home' }));
        expect(fluidOsStore.getSnapshot().open).toBe(false);
    });

    it('Escape closes the cockpit', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(fluidOsStore.getSnapshot().open).toBe(false);
    });

    it('Escape is ignored while an input has focus (URL bar)', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        const url = screen.getByLabelText('Preview URL');
        url.focus();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(fluidOsStore.getSnapshot().open).toBe(true);
    });

    it('URL bar Enter loads the URL into the preview iframe (https prefixed)', () => {
        const { container } = renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        const url = screen.getByLabelText('Preview URL');
        fireEvent.change(url, { target: { value: 'example.com' } });
        fireEvent.keyDown(url, { key: 'Enter' });
        const iframe = container.querySelector('iframe.fos-preview__frame');
        expect(iframe).not.toBeNull();
        expect(iframe!.getAttribute('src')).toBe('https://example.com');
    });

    it('empty preview shows the hint card with quick links (Argyle Holocron shortlist)', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        expect(screen.getByText('Open a server below, or enter a URL above')).toBeInTheDocument();
        expect(screen.getByLabelText('Preview Argyle Holocron')).toBeInTheDocument();
    });

    it('the preview chevron collapses the pane (and the rail expands it back)', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.click(screen.getByLabelText('Collapse preview'));
        expect(screen.queryByLabelText('Preview URL')).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Expand preview'));
        expect(screen.getByLabelText('Preview URL')).toBeInTheDocument();
    });

    it('background tasks pane shows the honest empty state when the queue is empty', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        expect(screen.getByText('No background tasks yet — Hermes runs will appear here.')).toBeInTheDocument();
    });
});

describe('work column row splitter (plan 054 phase 6)', () => {
    const SEP = 'Resize terminal and background tasks';
    /** jsdom rects are all-zero — give .fos-work a real geometry for drag math. */
    function mockWorkRect(container: HTMLElement, top = 0, height = 400) {
        const work = container.querySelector('.fos-work') as HTMLElement;
        work.getBoundingClientRect = () => ({
            top, height, bottom: top + height, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}),
        } as DOMRect);
    }

    it('renders as an accessible horizontal separator at the 55/45 default', () => {
        const { container } = renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        const sep = screen.getByRole('separator', { name: SEP });
        expect(sep).toHaveAttribute('aria-orientation', 'horizontal');
        expect(sep).toHaveAttribute('aria-valuenow', '55');
        expect(sep).toHaveAttribute('tabindex', '0');
        expect((container.querySelector('.fos-work__terminal') as HTMLElement).style.height).toBe('55%');
    });

    it('drag updates the ratio, resizes the terminal, and persists per user', () => {
        const user = makeUser({ id: 'user-1', email: 'lisa@dwellium.com' });
        const { container } = renderCockpitForUser(user);
        mockWorkRect(container);
        const sep = screen.getByRole('separator', { name: SEP });
        fireEvent.mouseDown(sep, { clientY: 220 });
        fireEvent.mouseMove(window, { clientY: 260 }); // 260/400 = 0.65
        fireEvent.mouseUp(window);
        expect(cockpitPrefsStore.getSnapshot().workSplit).toBe(0.65);
        expect((container.querySelector('.fos-work__terminal') as HTMLElement).style.height).toBe('65%');
        expect(localStorage.getItem('dwellium-cockpit:user-1')).toContain('"workSplit":0.65');
    });

    it('drag clamps to the 25% / 75% band', () => {
        const { container } = renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        mockWorkRect(container);
        const sep = screen.getByRole('separator', { name: SEP });
        fireEvent.mouseDown(sep, { clientY: 220 });
        fireEvent.mouseMove(window, { clientY: 20 }); // 0.05 → clamp 0.25
        expect(cockpitPrefsStore.getSnapshot().workSplit).toBe(0.25);
        fireEvent.mouseMove(window, { clientY: 390 }); // 0.975 → clamp 0.75
        fireEvent.mouseUp(window);
        expect(cockpitPrefsStore.getSnapshot().workSplit).toBe(0.75);
    });

    it('double-click resets to the 55/45 default', () => {
        const { container } = renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        mockWorkRect(container);
        const sep = screen.getByRole('separator', { name: SEP });
        fireEvent.mouseDown(sep, { clientY: 220 });
        fireEvent.mouseMove(window, { clientY: 120 });
        fireEvent.mouseUp(window);
        expect(cockpitPrefsStore.getSnapshot().workSplit).not.toBe(0.55);
        fireEvent.doubleClick(sep);
        expect(cockpitPrefsStore.getSnapshot().workSplit).toBe(0.55);
        expect(sep).toHaveAttribute('aria-valuenow', '55');
    });

    it('arrow keys nudge the split ±5% and clamp at the band edges', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        const sep = screen.getByRole('separator', { name: SEP });
        fireEvent.keyDown(sep, { key: 'ArrowUp' });
        expect(cockpitPrefsStore.getSnapshot().workSplit).toBe(0.5);
        expect(sep).toHaveAttribute('aria-valuenow', '50');
        fireEvent.keyDown(sep, { key: 'ArrowDown' });
        fireEvent.keyDown(sep, { key: 'ArrowDown' });
        expect(cockpitPrefsStore.getSnapshot().workSplit).toBe(0.6);
        for (let i = 0; i < 10; i++) fireEvent.keyDown(sep, { key: 'ArrowDown' });
        expect(cockpitPrefsStore.getSnapshot().workSplit).toBe(0.75); // clamped
        for (let i = 0; i < 20; i++) fireEvent.keyDown(sep, { key: 'ArrowUp' });
        expect(cockpitPrefsStore.getSnapshot().workSplit).toBe(0.25); // clamped
    });

    it('the ratio is isolated per user (Andy ≠ Lisa)', () => {
        const andy = makeUser({ id: 'andy-id', email: 'andy@dwellium.com' });
        const lisa = makeUser({ id: 'lisa-id', email: 'lisa@dwellium.com' });
        const first = renderCockpitForUser(andy);
        fireEvent.keyDown(screen.getByRole('separator', { name: SEP }), { key: 'ArrowUp' });
        expect(localStorage.getItem('dwellium-cockpit:andy-id')).toContain('"workSplit":0.5');
        first.unmount();
        const second = renderCockpitForUser(lisa);
        expect(screen.getByRole('separator', { name: SEP })).toHaveAttribute('aria-valuenow', '55'); // Lisa unaffected
        fireEvent.keyDown(screen.getByRole('separator', { name: SEP }), { key: 'ArrowDown' });
        expect(localStorage.getItem('dwellium-cockpit:lisa-id')).toContain('"workSplit":0.6');
        second.unmount();
        renderCockpitForUser(andy);
        expect(screen.getByRole('separator', { name: SEP })).toHaveAttribute('aria-valuenow', '50'); // Andy's survives
    });
});

describe('FluidLauncher', () => {
    it('renders nothing when the Cockpit layout is disabled', () => {
        fluidOsStore.reset();
        const { container } = render(<FluidLauncher />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing while the shell is open', () => {
        fluidOsStore.setEnabled(true);
        const { container } = render(<FluidLauncher />);
        expect(container).toBeEmptyDOMElement();
    });

    it('appears once the shell collapses, and reopens it on click', () => {
        fluidOsStore.setEnabled(true);
        fluidOsStore.setOpen(false);
        render(<FluidLauncher />);
        fireEvent.click(screen.getByLabelText('Open Cockpit'));
        expect(fluidOsStore.getSnapshot().open).toBe(true);
    });
});

describe('preview: sites that refuse framing (AppFolio etc.)', () => {
    it('isKnownFrameBlocked recognises AppFolio + Google hosts, not arbitrary URLs', () => {
        expect(isKnownFrameBlocked('https://zp.appfolio.com/dashboard')).toBe(true);
        expect(isKnownFrameBlocked('https://www.appfolio.com/')).toBe(true);
        expect(isKnownFrameBlocked('https://mail.google.com/')).toBe(true);
        expect(isKnownFrameBlocked('https://argyleholocron.netlify.app')).toBe(false);
        expect(isKnownFrameBlocked('not a url')).toBe(false);
    });

    it('shows the "doesn’t allow embedding → Open ↗" card instead of a blank iframe', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        const url = screen.getByLabelText('Preview URL');
        fireEvent.change(url, { target: { value: 'zp.appfolio.com' } });
        fireEvent.keyDown(url, { key: 'Enter' });
        expect(screen.getByText('zp.appfolio.com doesn’t allow embedding')).toBeInTheDocument();
        expect(screen.queryByTitle('Preview')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open ↗' })).toBeInTheDocument();
    });
});

describe('CommandPill × Cockpit', () => {
    it('the ⌘K pill is hidden while the cockpit is open (it overlapped the header) and back afterwards', () => {
        fluidOsStore.setEnabled(true);
        const { container, rerender } = render(<CommandPill />);
        expect(container.querySelector('.cmd-pill')).not.toBeInTheDocument();
        fluidOsStore.setOpen(false);
        rerender(<CommandPill />);
        expect(container.querySelector('.cmd-pill')).toBeInTheDocument();
    });
});
