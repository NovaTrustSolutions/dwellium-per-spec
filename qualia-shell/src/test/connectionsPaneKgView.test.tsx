/**
 * Plan 072 Phase 1 — ConnectionsPanel's "Knowledge graph (graphify)" row must
 * switch the widget to the "My knowledge" view before opening it (the row
 * reports the user's own graph status, so it should land there, not on the
 * "Code repos" tab).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { openWindow, setKgView } = vi.hoisted(() => ({ openWindow: vi.fn(), setKgView: vi.fn() }));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { active: null } } }),
}));
vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({ openWindow }),
}));
vi.mock('../lib/halocronKnowledgeGraphStore', () => ({ setKgView }));
vi.mock('../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../context/UserContext')>();
    return { ...actual, getAuthHeaders: () => ({}) };
});

// Imported after the mocks above so the component picks up the mocked deps.
import ConnectionsPanel from '../components/Connections/ConnectionsPanel';

describe('ConnectionsPanel — opening the knowledge graph row', () => {
    beforeEach(() => {
        openWindow.mockClear();
        setKgView.mockClear();
        global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ success: false }) }) as unknown as typeof fetch;
    });

    it('sets the view to "knowledge" before opening the widget', async () => {
        render(<ConnectionsPanel />);
        const row = await screen.findByText('Knowledge graph (graphify)');
        const openBtn = row.closest('li')?.querySelector('.connpane__open');
        expect(openBtn).toBeTruthy();
        fireEvent.click(openBtn as Element);
        expect(setKgView).toHaveBeenCalledWith('knowledge');
        expect(openWindow).toHaveBeenCalledWith('knowledge-graph', 'knowledge-graph', 'settings');
        // setKgView must run before the widget opens.
        const kgOrder = setKgView.mock.invocationCallOrder[0];
        const openOrder = openWindow.mock.invocationCallOrder[0];
        expect(kgOrder).toBeLessThan(openOrder);
    });

    it('does not touch the view for unrelated rows', async () => {
        render(<ConnectionsPanel />);
        const row = await screen.findByText('Dwellium backend');
        const openBtn = row.closest('li')?.querySelector('.connpane__open');
        fireEvent.click(openBtn as Element);
        expect(setKgView).not.toHaveBeenCalled();
        expect(openWindow).toHaveBeenCalledWith('system-health', 'system-health', 'settings');
    });
});
