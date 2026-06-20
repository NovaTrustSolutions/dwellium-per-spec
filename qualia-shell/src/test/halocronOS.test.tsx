import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { halocronOsStore } from '../lib/halocronOsStore';
import { UserContext, type DwelliumUser } from '../context/UserContext';

function makeWidget(label: string, className: string) {
    return function MockWidget() {
        return <div className={className}>{label} content</div>;
    };
}

vi.mock('../registry/widgetRegistry', () => {
    const AlphaWidget = makeWidget('Alpha', 'alpha-widget');
    const BetaWidget = makeWidget('Beta', 'beta-widget');
    const GammaWidget = makeWidget('Gamma', 'gamma-widget');
    const DeltaWidget = makeWidget('Delta', 'delta-widget');
    return {
        WIDGET_REGISTRY: {
            alpha: { id: 'alpha', label: 'Alpha', icon: 'layout-grid', category: 'core' },
            beta: { id: 'beta', label: 'Beta', icon: 'layout-grid', category: 'core' },
            gamma: { id: 'gamma', label: 'Gamma', icon: 'layout-grid', category: 'core' },
            delta: { id: 'delta', label: 'Delta', icon: 'layout-grid', category: 'core' },
        },
        WINDOW_COMPONENTS: {
            alpha: AlphaWidget,
            beta: BetaWidget,
            gamma: GammaWidget,
            delta: DeltaWidget,
        },
    };
});

vi.mock('../components/Sidebar/iconMap', () => ({
    getIcon: () => null,
}));

vi.mock('../components/Shell/HalocronKnowledgeGraph', () => ({
    default: () => <div>Knowledge graph</div>,
    KG_AGENTS: [],
}));

vi.mock('../components/Shell/HalocronWorkspaces', () => ({
    default: () => <div>Workspaces panel</div>,
}));

vi.mock('../components/CloudBrowser/CloudBrowser', () => ({
    default: ({ initialUrl }: { initialUrl?: string }) => (
        <div data-testid="halocron-cloud-browser" data-initial-url={initialUrl}>
            Cloud Browser
        </div>
    ),
}));

vi.mock('../components/CognitiveHarness/CognitiveHarness', () => ({
    default: () => <div>Cognitive harness</div>,
}));

vi.mock('../lib/llmUsageStore', () => ({
    useLlmUsage: () => [],
    lastNDays: () => [],
}));

vi.mock('../lib/subscriptionsStore', () => ({
    useSubscriptions: () => [],
    monthlyTotal: () => 0,
    saveSubscriptions: vi.fn(),
    subscriptionsStore: { set: vi.fn() },
}));

vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: {} } }),
}));

import HalocronOS from '../components/Shell/HalocronOS';

beforeEach(() => {
    localStorage.clear();
    halocronOsStore.reset();
});

function openHalocron() {
    halocronOsStore.setEnabled(true);
    render(<HalocronOS />);
}

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

function renderHalocronForUser(user: DwelliumUser) {
    halocronOsStore.setEnabled(true);
    render(
        <UserContext.Provider value={{
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
        }}>
            <HalocronOS />
        </UserContext.Provider>
    );
}

function openArchiveApp(label: string) {
    fireEvent.click(screen.getByRole('button', { name: 'Apps' }));
    fireEvent.click(screen.getByRole('button', { name: `Open ${label}` }));
}

describe('Holocron OS smart tab shell', () => {
    it('exposes compact chrome, focus canvas, split-view, pin, and essential tab controls', () => {
        openHalocron();
        openArchiveApp('Alpha');

        expect(screen.getByLabelText('Compact chrome')).toBeInTheDocument();
        expect(screen.getByLabelText('Focus canvas')).toBeInTheDocument();
        expect(screen.getByLabelText('Single view')).toBeInTheDocument();
        expect(screen.getByLabelText('Two-up split')).toBeInTheDocument();
        expect(screen.getByLabelText('Three-up split')).toBeInTheDocument();
        expect(screen.getByLabelText('Four-up split')).toBeInTheDocument();
        expect(screen.getByLabelText('Pin Alpha')).toBeInTheDocument();
        expect(screen.getByLabelText('Mark Alpha essential')).toBeInTheDocument();
    });

    it('renders multi-pane split views with an independent scroll host for every visible widget', () => {
        openHalocron();
        openArchiveApp('Alpha');
        openArchiveApp('Beta');

        fireEvent.click(screen.getByLabelText('Two-up split'));

        const stage = screen.getByTestId('halocron-stage');
        expect(stage).toHaveAttribute('data-split', 'two');
        const panes = screen.getAllByTestId('halocron-widget-scroll');
        expect(panes).toHaveLength(2);
        expect(panes.map((pane) => pane.getAttribute('data-widget-id')).sort()).toEqual(['alpha', 'beta']);
        const betaPane = panes.find((pane) => pane.getAttribute('data-widget-id') === 'beta');
        const alphaPane = panes.find((pane) => pane.getAttribute('data-widget-id') === 'alpha');
        expect(betaPane?.parentElement).toHaveStyle({ order: '0' });
        expect(alphaPane?.parentElement).toHaveStyle({ order: '1' });
    });

    it('focus canvas removes the header band from hosted tabs to recover vertical space', () => {
        openHalocron();
        openArchiveApp('Alpha');

        fireEvent.click(screen.getByLabelText('Focus canvas'));

        expect(screen.getByTestId('halocron-stage-wrap')).toHaveClass('hos-stage-wrap--focus');
        expect(screen.queryByTestId('halocron-hosted-header')).not.toBeInTheDocument();
    });

    it('greets the active account instead of a hardcoded owner name', () => {
        renderHalocronForUser(makeUser({ id: 'andy', email: 'andy@dwellium.com', name: 'Andy' }));

        expect(screen.getByText(/Good (morning|afternoon|evening), Andy\./)).toBeInTheDocument();
    });

    it('falls back from email to a friendly first name for account greetings', () => {
        renderHalocronForUser(makeUser({ id: 'lisa', email: 'lisa@dwellium.com', name: '' }));

        expect(screen.getByText(/Good (morning|afternoon|evening), Lisa\./)).toBeInTheDocument();
    });

    it('renders hosted web tabs through Cloud Browser instead of a blocked embed launch card', () => {
        openHalocron();

        const chatgptCard = screen.getByText('ChatGPT').closest('.hos-launch__card');
        expect(chatgptCard).toBeTruthy();
        fireEvent.click(within(chatgptCard as HTMLElement).getByRole('button', { name: 'Open' }));

        expect(screen.getByTestId('halocron-cloud-browser')).toHaveAttribute('data-initial-url', 'https://chatgpt.com');
        expect(screen.queryByText(/blocks in-browser embedding/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/desktop app embeds/i)).not.toBeInTheDocument();
    });
});
