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
vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({
        windows: [],
        openWindow: openWindowMock,
        focusWindow: focusWindowMock,
        restoreWindow: restoreWindowMock,
    }),
}));

import FluidOS, { cockpitPrefsStore } from '../components/Shell/FluidOS';
import FluidLauncher from '../components/Shell/FluidLauncher';

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

    it('widget-row click calls openWindow with the widget id and collapses the shell', () => {
        renderCockpitForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.click(screen.getByLabelText('Open Alpha'));
        expect(openWindowMock).toHaveBeenCalledWith('alpha', 'Alpha', 'layout-grid');
        expect(fluidOsStore.getSnapshot().open).toBe(false);
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
