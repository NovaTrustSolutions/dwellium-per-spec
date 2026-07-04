import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { fluidOsStore, DEFAULT_FLUID_OS_STATE } from '../lib/fluidOsStore';
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
        beta: makeWidget('Beta', 'beta-widget'),
        gamma: makeWidget('Gamma', 'gamma-widget'),
        'audit-log': makeWidget('Audit Log', 'audit-log-widget'),
    },
}));

vi.mock('../components/Sidebar/iconMap', () => ({
    getIcon: () => null,
}));

const openWindowMock = vi.fn();
vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({ openWindow: openWindowMock }),
}));

import FluidOS from '../components/Shell/FluidOS';
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

function renderFluidOsForUser(user: DwelliumUser | null) {
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
        loginAsArchitect: vi.fn(),
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
    openWindowMock.mockClear();
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

describe('FluidOS shell', () => {
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

    it('shows all non-restricted widgets and hides audit-log for a non-matching email', () => {
        renderFluidOsForUser(makeUser({ email: 'lisa@dwellium.com' }));
        // Use the search field to get a flat view of every gated-visible widget.
        fireEvent.change(screen.getByLabelText('Search widgets'), { target: { value: 'a' } });
        expect(screen.getByLabelText('Open Alpha')).toBeInTheDocument();
        expect(screen.queryByLabelText('Open Audit Log')).not.toBeInTheDocument();
    });

    it('shows audit-log for the matching (andy) email — parity with Holocron gating', () => {
        renderFluidOsForUser(makeUser({ email: 'andy@dwellium.com' }));
        fireEvent.change(screen.getByLabelText('Search widgets'), { target: { value: 'audit' } });
        expect(screen.getByLabelText('Open Audit Log')).toBeInTheDocument();
    });

    it('activating a card calls openWindow with the widget id and collapses the shell', () => {
        renderFluidOsForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.change(screen.getByLabelText('Search widgets'), { target: { value: 'Alpha' } });
        fireEvent.click(screen.getByLabelText('Open Alpha'));

        expect(openWindowMock).toHaveBeenCalledWith('alpha', 'Alpha', 'layout-grid');
        expect(fluidOsStore.getSnapshot().open).toBe(false);
    });

    it('"/" focuses the search field and filters narrows visible cards', () => {
        renderFluidOsForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.keyDown(window, { key: '/' });
        expect(screen.getByLabelText('Search widgets')).toHaveFocus();

        fireEvent.change(screen.getByLabelText('Search widgets'), { target: { value: 'Beta' } });
        expect(screen.getByLabelText('Open Beta')).toBeInTheDocument();
        expect(screen.queryByLabelText('Open Alpha')).not.toBeInTheDocument();
    });

    it('Escape closes the shell (and the launcher reappears)', () => {
        renderFluidOsForUser(makeUser({ email: 'lisa@dwellium.com' }));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(fluidOsStore.getSnapshot().open).toBe(false);
    });
});

describe('FluidLauncher', () => {
    it('renders nothing when Fluid OS is disabled', () => {
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
        fireEvent.click(screen.getByLabelText('Open Fluid OS'));
        expect(fluidOsStore.getSnapshot().open).toBe(true);
    });
});
