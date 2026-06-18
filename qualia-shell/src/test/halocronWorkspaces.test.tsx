import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
        expect(ws().splitKeys).toEqual(['beta']);
    });

    it('adds a tab to the split, tiling two panes with a draggable divider', () => {
        seedWorkspace();
        openWorkspace();

        fireEvent.click(screen.getByRole('button', { name: 'Add Beta to split' }));

        expect(screen.getByTestId('workspace-pane-alpha')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-pane-beta')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-divider-1')).toBeInTheDocument();
        expect(ws().splitKeys).toEqual(['alpha', 'beta']);
        expect(ws().splitSizes).toEqual([50, 50]);
    });

    it('dragging a divider resizes the panes and persists the new sizes', () => {
        seedWorkspace();
        openWorkspace();
        fireEvent.click(screen.getByRole('button', { name: 'Add Beta to split' }));

        const divider = screen.getByTestId('workspace-divider-1');
        fireEvent.pointerDown(divider, { clientX: 100, pointerId: 1 });
        fireEvent.pointerMove(window, { clientX: 300, pointerId: 1 });
        fireEvent.pointerUp(window, { clientX: 300, pointerId: 1 });

        const sizes = ws().splitSizes ?? [];
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
});
