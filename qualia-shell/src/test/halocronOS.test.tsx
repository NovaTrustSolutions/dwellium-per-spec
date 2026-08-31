import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
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
            'advisory-board': { id: 'advisory-board', label: 'Advisory Board', icon: 'scale', category: 'ai' },
        },
        WINDOW_COMPONENTS: {
            alpha: AlphaWidget,
            beta: BetaWidget,
            gamma: GammaWidget,
            delta: DeltaWidget,
            'advisory-board': makeWidget('Advisory Board', 'advisory-board-widget'),
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

// KG_AGENTS was hoisted to a data-only module (plan 008); HalocronOS imports the
// constant from here, so mock it to keep the agent rail empty as before.
vi.mock('../components/Shell/HalocronKnowledgeGraph.agents', () => ({
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
import { advisoryLensBus } from '../lib/busChannels';
import { installDockBackReceiver } from '../lib/popoutDock';

beforeEach(() => {
    localStorage.clear();
    halocronOsStore.reset();
    advisoryLensBus.clear();
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

    it('renders the 5 Persona Advisory Board diagram on Home and opens the widget on the clicked lens', async () => {
        openHalocron();

        // The diagram is React.lazy'd → await the Suspense boundary.
        expect(await screen.findByTestId('advisory-board-diagram')).toBeInTheDocument();
        expect(screen.getByTestId('advisory-board-crit')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Risk and Capital Lens/i }));

        expect(advisoryLensBus.peek()).toEqual({ lensId: 'risk' });
        expect(screen.getByText('Advisory Board content')).toBeInTheDocument();
    });

    it('renders hosted web tabs through Cloud Browser instead of a blocked embed launch card', async () => {
        openHalocron();

        const chatgptCard = screen.getByText('ChatGPT').closest('.hos-launch__card');
        expect(chatgptCard).toBeTruthy();
        fireEvent.click(within(chatgptCard as HTMLElement).getByRole('button', { name: 'Open' }));

        // CloudBrowser is React.lazy now (plan 008) → await the Suspense boundary.
        expect(await screen.findByTestId('halocron-cloud-browser')).toHaveAttribute('data-initial-url', 'https://chatgpt.com');
        expect(screen.queryByText(/blocks in-browser embedding/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/desktop app embeds/i)).not.toBeInTheDocument();
    });
});

describe('Holocron tab strip intuitive actions (055-p5)', () => {
    it('middle-click (auxclick button 1) closes the tab', () => {
        openHalocron();
        openArchiveApp('Alpha');
        const tab = screen.getByTestId('hos-tab-w:alpha');
        fireEvent(tab, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
        expect(screen.queryByTestId('hos-tab-w:alpha')).not.toBeInTheDocument();
    });

    it('right-button auxclick does NOT close the tab', () => {
        openHalocron();
        openArchiveApp('Alpha');
        fireEvent(screen.getByTestId('hos-tab-w:alpha'), new MouseEvent('auxclick', { bubbles: true, button: 2 }));
        expect(screen.getByTestId('hos-tab-w:alpha')).toBeInTheDocument();
    });

    it('tabs are keyboard-activatable (role=tab, Enter selects)', () => {
        openHalocron();
        openArchiveApp('Alpha');
        openArchiveApp('Beta');
        const tab = screen.getByTestId('hos-tab-w:alpha');
        expect(tab).toHaveAttribute('role', 'tab');
        expect(tab).toHaveAttribute('tabindex', '0');
        fireEvent.keyDown(tab, { key: 'Enter' });
        expect(tab).toHaveAttribute('aria-selected', 'true');
    });
});

describe('Holocron tear-off tabs (pop out into own browser window)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('drag ending OUTSIDE the tab strip detaches the tab into a popout and closes it', () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        openHalocron();
        openArchiveApp('Alpha');

        const tab = screen.getByTestId('hos-tab-w:alpha');
        expect(tab).toHaveAttribute('draggable', 'true');
        fireEvent.dragStart(tab);
        // jsdom rects are 0×0 → (500, 500) is outside the strip bounds.
        // (jsdom has no DragEvent ctor, so clientX must be assigned manually.)
        const end = createEvent.dragEnd(tab);
        Object.assign(end, { clientX: 500, clientY: 500 });
        fireEvent(tab, end);

        expect(openSpy).toHaveBeenCalledTimes(1);
        expect(openSpy.mock.calls[0][0]).toBe('/?popup=alpha');
        expect(screen.queryByTestId('hos-tab-w:alpha')).not.toBeInTheDocument();
    });

    it('drag ending INSIDE the strip does NOT pop out and keeps the tab', () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        openHalocron();
        openArchiveApp('Alpha');

        const tab = screen.getByTestId('hos-tab-w:alpha');
        fireEvent.dragStart(tab);
        // (0, 0) sits exactly on the 0×0 jsdom strip rect → inside.
        const end = createEvent.dragEnd(tab);
        Object.assign(end, { clientX: 0, clientY: 0 });
        fireEvent(tab, end);

        expect(openSpy).not.toHaveBeenCalled();
        expect(screen.getByTestId('hos-tab-w:alpha')).toBeInTheDocument();
    });

    it('marks the strip with a tearing class while a tab drag is in flight', () => {
        openHalocron();
        openArchiveApp('Alpha');

        const tab = screen.getByTestId('hos-tab-w:alpha');
        const strip = tab.parentElement as HTMLElement;
        fireEvent.dragStart(tab);
        expect(strip).toHaveClass('hos-tabs--tearing');
        const end = createEvent.dragEnd(tab);
        Object.assign(end, { clientX: 0, clientY: 0 });
        fireEvent(tab, end);
        expect(strip).not.toHaveClass('hos-tabs--tearing');
    });

    it('offers a keyboard-reachable "Open in its own window" button per widget tab', () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        openHalocron();
        openArchiveApp('Alpha');

        const btn = screen.getByRole('button', { name: 'Open Alpha in its own window' });
        fireEvent.click(btn);

        expect(openSpy).toHaveBeenCalledTimes(1);
        expect(openSpy.mock.calls[0][0]).toBe('/?popup=alpha');
        expect(screen.queryByTestId('hos-tab-w:alpha')).not.toBeInTheDocument();
    });

    it('keeps the tab when the popup blocker refuses the popout', () => {
        vi.spyOn(window, 'open').mockReturnValue(null);
        openHalocron();
        openArchiveApp('Alpha');

        fireEvent.click(screen.getByRole('button', { name: 'Open Alpha in its own window' }));

        expect(screen.getByTestId('hos-tab-w:alpha')).toBeInTheDocument();
    });

    it('dock-back from a popout lands as a Holocron tab with the shell OPEN — not a Classic window beneath', () => {
        openHalocron();
        act(() => { halocronOsStore.setOpen(false); }); // shell collapsed at dock time
        const uninstall = installDockBackReceiver();
        act(() => {
            window.dispatchEvent(new MessageEvent('message', {
                data: { type: 'qualia-dock-back', nonce: 'n1', component: 'beta', title: 'Beta', icon: '' },
                origin: window.location.origin,
            }));
        });
        uninstall();
        expect(halocronOsStore.getSnapshot().open).toBe(true);
        expect(screen.getByTestId('hos-tab-w:beta')).toBeInTheDocument();
        expect(screen.getByText('Beta content')).toBeInTheDocument();
    });
});
