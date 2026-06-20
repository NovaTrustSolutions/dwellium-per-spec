import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { integrationsUserIdHolder } from '../utils/integrationsStore';
import { saveWorkspaces, workspacesStore, wsTabs, type Workspace } from '../lib/workspacesStore';

function makeWidget(label: string) {
    return function MockWidget() {
        return <div>{label} widget</div>;
    };
}

vi.mock('../registry/widgetRegistry', () => ({
    WIDGET_REGISTRY: {
        alpha: { id: 'alpha', label: 'Alpha', icon: 'layout-grid', category: 'core' },
        beta: { id: 'beta', label: 'Beta', icon: 'layout-grid', category: 'core' },
    },
    WINDOW_COMPONENTS: {
        alpha: makeWidget('Alpha'),
        beta: makeWidget('Beta'),
    },
}));

vi.mock('../components/Sidebar/iconMap', () => ({
    getIcon: () => null,
}));

vi.mock('../components/CloudBrowser/CloudBrowser', () => ({
    default: ({ initialUrl }: { initialUrl?: string }) => (
        <div data-testid="workspace-cloud-browser" data-initial-url={initialUrl}>
            Cloud Browser
        </div>
    ),
}));

import HalocronWorkspaces from '../components/Shell/HalocronWorkspaces';

beforeEach(() => {
    localStorage.clear();
    integrationsUserIdHolder.current = null;
    workspacesStore.reset();
    vi.restoreAllMocks();
});

function seedWorkspace(partial: Partial<Workspace> = {}) {
    saveWorkspaces([{
        id: 'ws-test',
        name: 'Zen Space',
        appIds: ['alpha', 'beta'],
        split: 2,
        layout: 'grid',
        frames: {},
        notes: '',
        updatedAt: 1,
        ...partial,
    }]);
}

function openWorkspace() {
    render(<HalocronWorkspaces />);
    fireEvent.click(screen.getByText('“Zen Space”'));
}

const ws = () => workspacesStore.getSnapshot()[0];

// Canonical layout is the split-tree; flatten the root level to keys/sizes for assertions.
/* eslint-disable @typescript-eslint/no-explicit-any */
const layoutTree = () => (ws() as any).splitTree;
function rootKeys(): string[] {
    const t = layoutTree();
    if (!t) return [];
    return t.t === 'split' ? t.children.map((c: any) => (c.t === 'leaf' ? c.key : '(split)')) : [t.key];
}
function rootSizes(): number[] {
    const t = layoutTree();
    if (!t) return [];
    return t.t === 'split' ? t.sizes : [100];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('Holocron workspaces — Zen runner', () => {
    it('creates a new workspace (grid model) and opens it full screen', () => {
        vi.spyOn(window, 'prompt').mockReturnValue('Fresh Space');
        render(<HalocronWorkspaces />);

        fireEvent.click(screen.getByRole('button', { name: /New workspace/ }));

        expect(ws()).toMatchObject({ name: 'Fresh Space', layout: 'grid' });
        expect(ws().tabs).toEqual([]);
        // Fullscreen runner is portaled and present.
        expect(screen.getByTestId('workspace-fullscreen')).toBeInTheDocument();
    });

    it('opens an existing workspace full screen with a vertical tab per app', () => {
        seedWorkspace();
        openWorkspace();

        expect(screen.getByTestId('workspace-fullscreen')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Alpha tab' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Beta tab' })).toBeInTheDocument();
        // Single view by default → only the first tab is shown.
        expect(screen.getByTestId('workspace-pane-alpha')).toBeInTheDocument();
        expect(screen.queryByTestId('workspace-pane-beta')).not.toBeInTheDocument();
    });

    it('clicking a tab focuses it as the single active pane', () => {
        seedWorkspace();
        openWorkspace();

        fireEvent.click(screen.getByRole('tab', { name: 'Beta tab' }));

        expect(screen.getByTestId('workspace-pane-beta')).toBeInTheDocument();
        expect(screen.queryByTestId('workspace-pane-alpha')).not.toBeInTheDocument();
        expect(rootKeys()).toEqual(['beta']);
    });

    it('adds a tab to the split, tiling two panes with a draggable divider', () => {
        seedWorkspace();
        openWorkspace();

        fireEvent.click(screen.getByRole('button', { name: 'Add Beta to split' }));

        expect(screen.getByTestId('workspace-pane-alpha')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-pane-beta')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-divider-1')).toBeInTheDocument();
        expect(rootKeys()).toEqual(['alpha', 'beta']);
        expect(rootSizes()).toEqual([50, 50]);
    });

    it('dragging a divider resizes the panes and persists the new sizes', () => {
        seedWorkspace();
        openWorkspace();
        fireEvent.click(screen.getByRole('button', { name: 'Add Beta to split' }));

        const divider = screen.getByTestId('workspace-divider-1');
        fireEvent.pointerDown(divider, { clientX: 100, pointerId: 1 });
        fireEvent.pointerMove(window, { clientX: 300, pointerId: 1 });
        fireEvent.pointerUp(window, { clientX: 300, pointerId: 1 });

        const sizes = rootSizes();
        expect(sizes).toHaveLength(2);
        // Dragging the divider rightward grows the left pane past the right one.
        expect(sizes[0]).toBeGreaterThan(sizes[1]);
        expect(sizes).not.toEqual([50, 50]);
    });

    it('adds a web page as a tab from a URL prompt', () => {
        seedWorkspace();
        vi.spyOn(window, 'prompt').mockReturnValue('example.com');
        openWorkspace();

        fireEvent.click(screen.getByRole('button', { name: /New tab/ }));
        fireEvent.click(screen.getByRole('button', { name: /Web page/ }));

        const tabs = wsTabs(ws());
        expect(tabs.some((t) => t.kind === 'web' && t.ref === 'https://example.com')).toBe(true);
        expect(screen.getByRole('tab', { name: 'example.com tab' })).toBeInTheDocument();
    });

    it('renders workspace web tabs through Cloud Browser so Google-style pages are not iframed', () => {
        seedWorkspace();
        vi.spyOn(window, 'prompt').mockReturnValue('google.com');
        openWorkspace();

        fireEvent.click(screen.getByRole('button', { name: /New tab/ }));
        fireEvent.click(screen.getByRole('button', { name: /Web page/ }));

        const cloudBrowser = screen.getByTestId('workspace-cloud-browser');
        expect(cloudBrowser).toHaveAttribute('data-initial-url', 'https://google.com');
        expect(document.querySelector('.wsx-web')).not.toBeInTheDocument();
    });

    it('closes a tab and removes it from the workspace', () => {
        seedWorkspace();
        openWorkspace();

        fireEvent.click(screen.getByRole('button', { name: 'Close Beta' }));

        const tabs = wsTabs(ws());
        expect(tabs.map((t) => t.ref)).toEqual(['alpha']);
        expect(ws().appIds).toEqual(['alpha']);
        expect(screen.queryByRole('tab', { name: 'Beta tab' })).not.toBeInTheDocument();
    });

    it('exits full screen back to the workspace list', () => {
        seedWorkspace();
        openWorkspace();

        fireEvent.click(screen.getByRole('button', { name: 'Exit workspace' }));

        expect(screen.queryByTestId('workspace-fullscreen')).not.toBeInTheDocument();
        // Back on the list (the card is shown again).
        expect(screen.getByText('“Zen Space”')).toBeInTheDocument();
    });

    it('lays out three columns via the layout preset, with empty panes to fill', () => {
        seedWorkspace();
        openWorkspace();

        fireEvent.click(screen.getByRole('button', { name: '3 columns' }));

        expect(rootKeys()).toHaveLength(3);
        // first pane keeps existing content; the other two are empty slots awaiting content
        expect(screen.getByTestId('workspace-pane-alpha')).toBeInTheDocument();
        expect(screen.getAllByTestId('workspace-empty-pane')).toHaveLength(2);
        expect(screen.getByTestId('workspace-divider-1')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-divider-2')).toBeInTheDocument();
    });

    it('fills an empty pane with any widget', () => {
        seedWorkspace();
        openWorkspace();
        fireEvent.click(screen.getByRole('button', { name: '2 columns' }));

        const empty = screen.getByTestId('workspace-empty-pane');
        fireEvent.change(within(empty).getByRole('combobox'), { target: { value: 'beta' } });

        expect(screen.getByTestId('workspace-pane-beta')).toBeInTheDocument();
        expect(screen.queryByTestId('workspace-empty-pane')).not.toBeInTheDocument();
        expect(rootKeys()).toEqual(['alpha', 'beta']);
    });

    it('fills an empty pane with any website', () => {
        seedWorkspace();
        vi.spyOn(window, 'prompt').mockReturnValue('example.com');
        openWorkspace();
        fireEvent.click(screen.getByRole('button', { name: '2 columns' }));

        const empty = screen.getByTestId('workspace-empty-pane');
        fireEvent.click(within(empty).getByRole('button', { name: /Add a website/ }));

        const webTab = wsTabs(ws()).find((t) => t.kind === 'web');
        expect(webTab?.ref).toBe('https://example.com');
        expect(rootKeys()).toContain(webTab?.key);
    });

    it('splits a pane into rows (2D nesting)', () => {
        seedWorkspace();
        openWorkspace();

        fireEvent.click(screen.getByRole('button', { name: 'Split Alpha into rows' }));

        const t = layoutTree();
        expect(t?.t).toBe('split');
        expect(t?.dir).toBe('col');                 // 'col' = stacked rows
        expect(t?.children).toHaveLength(2);
        expect(screen.getByTestId('workspace-pane-alpha')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-empty-pane')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-divider-1')).toBeInTheDocument();
    });

    it('nests a row-split inside a column (true 2D tree)', () => {
        seedWorkspace();
        openWorkspace();
        fireEvent.click(screen.getByRole('button', { name: '2 columns' }));   // root row [alpha, slot]

        fireEvent.click(screen.getByRole('button', { name: 'Split Alpha into rows' }));

        const t = layoutTree();
        expect(t?.dir).toBe('row');                 // outer = columns
        expect(t?.children[0]?.t).toBe('split');    // first column is now a nested split
        expect(t?.children[0]?.dir).toBe('col');    // …of rows → 2D nesting
        expect(screen.getByTestId('workspace-divider-0-1')).toBeInTheDocument();
    });

    it('pops a pane out to detach it (app → Dwellium window event)', () => {
        seedWorkspace();
        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        openWorkspace();

        fireEvent.click(screen.getByRole('button', { name: 'Pop Alpha out to a window' }));

        const ev = dispatchSpy.mock.calls
            .map(([a]) => a)
            .find((a) => a instanceof CustomEvent && a.type === 'dwellium:open-widget') as CustomEvent | undefined;
        expect(ev?.detail).toMatchObject({ widgetId: 'alpha' });
        // detaching removes the tab from the workspace (it now lives in a window)
        expect(wsTabs(ws()).some((t) => t.ref === 'alpha')).toBe(false);
    });
});
