import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { integrationsUserIdHolder } from '../utils/integrationsStore';
import { saveWorkspaces, workspacesStore, type Workspace } from '../lib/workspacesStore';

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
        name: 'Drag Space',
        appIds: ['alpha', 'beta'],
        split: 2,
        layout: 'custom',
        frames: {},
        notes: '',
        updatedAt: 1,
        ...partial,
    }]);
}

function openWorkspace() {
    render(<HalocronWorkspaces />);
    fireEvent.click(screen.getByText('“Drag Space”'));
}

function dragTab(label: string, x: number, y: number) {
    const tab = screen.getByRole('button', { name: `${label} tab` });
    fireEvent.pointerDown(tab, { clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: x, clientY: y, pointerId: 1 });
}

describe('Holocron workspaces tab gestures', () => {
    it('creates new workspaces in free-move mode by default', () => {
        vi.spyOn(window, 'prompt').mockReturnValue('Zen Space');
        render(<HalocronWorkspaces />);

        fireEvent.click(screen.getByRole('button', { name: /New workspace/ }));

        expect(workspacesStore.getSnapshot()[0]).toMatchObject({ name: 'Zen Space', layout: 'custom' });
        expect(screen.getByTestId('workspace-free-canvas')).toBeInTheDocument();
    });

    it('drags a workspace tab to the center to enter split screen', () => {
        seedWorkspace();
        openWorkspace();

        dragTab('Alpha', 500, 320);

        expect(workspacesStore.getSnapshot()[0]).toMatchObject({ layout: 'grid', split: 2, activeAppId: 'alpha' });
    });

    it('drags a workspace tab out to create a classic window and remove it from the workspace', () => {
        seedWorkspace();
        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        openWorkspace();

        dragTab('Beta', -40, -40);

        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'dwellium:open-widget' }));
        const event = dispatchSpy.mock.calls.map(([arg]) => arg).find((arg) => arg instanceof CustomEvent && arg.type === 'dwellium:open-widget') as CustomEvent | undefined;
        expect(event?.detail).toMatchObject({ widgetId: 'beta', label: 'Beta' });
        expect(workspacesStore.getSnapshot()[0].appIds).toEqual(['alpha']);
    });

    it('double-clicks a workspace tab to expand that widget full screen inside the workspace', () => {
        seedWorkspace();
        openWorkspace();

        fireEvent.doubleClick(screen.getByRole('button', { name: 'Alpha tab' }));

        expect(screen.getByTestId('workspace-pane-alpha')).toHaveClass('ws-pane--expanded');
    });
});
