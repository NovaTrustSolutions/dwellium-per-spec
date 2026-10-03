/**
 * Task Board phase 1 (plan 079 section 7, "Outside the model"): two dead-link fixes.
 *  - Connections panel "Tags" memory row opens Tag File, not the Task Board.
 *  - Task Menu command-palette deep link leaves the Board tab so the List row can be highlighted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within, act, cleanup } from '@testing-library/react';

const openWindow = vi.fn();
vi.mock('../context/WindowContext', async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    useWindows: () => ({ openWindow }),
}));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { active: 'anthropic' } } }),
}));
// Keep the lazy Board child trivial (TaskMenu lazy-imports it).
vi.mock('../components/TaskBoard/TaskBoard', () => ({ default: () => <div data-testid="board-stub">board</div> }));

import ConnectionsPanel from '../components/Connections/ConnectionsPanel';
import TaskMenu from '../components/TaskMenu/TaskMenu';
import { agentContextStore } from '../lib/agentContextStore';
import { memoryStore } from '../components/HonchoHermesPanel/honchoMemoryStore';
import { dreamStore } from '../components/StellaAgent/honchoDreamStore';
import { hermesLearningStore } from '../components/HonchoHermesPanel/hermesLearningStore';
import { thoughtWeaverStore } from '../components/ThoughtWeaver/thoughtWeaverStore';
import { goalsStore } from '../lib/goalsStore';
import { artifactStore } from '../lib/artifactStore';
import { tagStore } from '../lib/tagStore';
import { morningBriefStore } from '../lib/morningBriefStore';

// Every createLocalStorageStore-backed store ConnectionsPanel reads: localStorage.clear() does not drop
// their cached snapshots, so reset each one (repo convention) to keep tests independent.
const PANEL_STORES = [agentContextStore, memoryStore, dreamStore, hermesLearningStore, thoughtWeaverStore, goalsStore, artifactStore, tagStore, morningBriefStore];

beforeEach(() => {
    openWindow.mockReset();
    try { localStorage.clear(); } catch { /* ignore */ }
    PANEL_STORES.forEach(store => store.reset());
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: [] }) })));
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('ConnectionsPanel memory rows', () => {
    it('the "Tags" row opens tag-file (not task-board)', async () => {
        render(<ConnectionsPanel />);
        const memory = screen.getByRole('region', { name: 'Memory stack' });
        const row = within(memory).getByText('Tags').closest('li') as HTMLElement;
        expect(row).not.toBeNull();
        row.querySelector('button')!.click();
        expect(openWindow).toHaveBeenCalledTimes(1);
        expect(openWindow.mock.calls[0][0]).toBe('tag-file');
        await waitFor(() => expect(fetch).toHaveBeenCalled());   // let the KG status effect settle inside act
    });
});

describe('TaskMenu deep link', () => {
    it('qualia-taskmenu-focus-task switches a remembered Board tab back to List', async () => {
        localStorage.setItem('dwellium:taskmenu-view', 'board');
        render(<TaskMenu />);

        const boardTab = () => screen.getByRole('tab', { name: /Board/ });
        const listTab = () => screen.getByRole('tab', { name: /List/ });
        await waitFor(() => expect(boardTab().getAttribute('aria-selected')).toBe('true'));

        act(() => {
            window.dispatchEvent(new CustomEvent('qualia-taskmenu-focus-task', { detail: { taskId: 'x' } }));
        });

        await waitFor(() => expect(listTab().getAttribute('aria-selected')).toBe('true'));
        expect(boardTab().getAttribute('aria-selected')).toBe('false');
        // review: the deep link must not overwrite the user's saved tab preference
        expect(localStorage.getItem('dwellium:taskmenu-view')).toBe('board');
    });
});
