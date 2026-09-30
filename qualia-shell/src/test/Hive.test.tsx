/**
 * Hive — plan 071 Phase 2 (D2/D4/D5/D6/D8/D9). Renders the REAL widget with
 * no UserProvider (useIntegrations degrades to `_anonymous`, matching the
 * ApiKeysWidget test convention). WindowContext is mocked so `windows` /
 * `openWindow` are controllable per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { copawStore, copawUserIdHolder, type MemoryFact } from '../components/Hive/copawStore';
import { agentActivityStore, agentActivityUserIdHolder, recordAgentActivity, HIDDEN_SNIPPET } from '../lib/agentActivityStore';
import { llmUsageUserIdHolder, recordLlmUsage, resetLlmUsage, _resetDeviceIdForTests } from '../lib/llmUsageStore';

const openWindow = vi.fn((component: string) => component);
let mockWindows: Array<{ component: string; minimized?: boolean }> = [];

vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({
        windows: mockWindows,
        openWindow,
    }),
}));

import Hive from '../components/Hive/Hive';

function seedFacts(facts: Partial<MemoryFact>[]) {
    const now = new Date().toISOString();
    const full: MemoryFact[] = facts.map((f, i) => ({
        id: f.id ?? `f${i}`,
        text: f.text ?? `Fact number ${i}`,
        source: f.source ?? 'Synthesis Lab',
        createdAt: f.createdAt ?? now,
    }));
    copawStore.set(full, () => {
        try { localStorage.setItem('dwellium:copaw-memory:_anonymous', JSON.stringify(full)); } catch { /* */ }
    });
}

beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
    copawUserIdHolder.current = null;
    copawStore.reset();
    agentActivityUserIdHolder.current = null;
    agentActivityStore.reset();
    llmUsageUserIdHolder.current = null;
    _resetDeviceIdForTests();
    resetLlmUsage();
    mockWindows = [];
    openWindow.mockClear();
    cleanup();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('Hive agent grid', () => {
    it('renders all 7 agent cards', () => {
        render(<Hive />);
        expect(screen.getByText('ARA')).toBeTruthy();
        expect(screen.getByText('Stella')).toBeTruthy();
        expect(screen.getByText('Hydra')).toBeTruthy();
        expect(screen.getByText('Honcho')).toBeTruthy();
        expect(screen.getByText('Two Brains')).toBeTruthy();
        expect(screen.getByText('Synthesis Lab')).toBeTruthy();
        expect(screen.getByText('Builder Agents')).toBeTruthy();
    });

    it('header count only counts AGENTS windows, ignoring non-agent windows', () => {
        mockWindows = [{ component: 'scribe' }, { component: 'ara-console' }];
        render(<Hive />);
        expect(screen.getByText('1 open · 7 agents')).toBeTruthy();
    });

    it('a minimized agent window counts as closed', () => {
        mockWindows = [{ component: 'ara-console', minimized: true }];
        render(<Hive />);
        expect(screen.getByText('0 open · 7 agents')).toBeTruthy();
    });

    it('Run calls openWindow with the agent id, name, and empty icon', () => {
        render(<Hive />);
        fireEvent.click(screen.getAllByText('Run')[1]); // Stella card's Run button
        expect(openWindow).toHaveBeenCalledWith('stella-agent', 'Stella', '');
    });
});

describe('Hive CoPaw memory rail', () => {
    it('Clear with confirm=false leaves the store unchanged', () => {
        seedFacts([{ text: 'a persisted fact worth keeping around' }]);
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<Hive />);
        fireEvent.click(screen.getByLabelText('Clear CoPaw memory'));
        expect(copawStore.getSnapshot().length).toBe(1);
    });

    it('Clear with confirm=true empties the store', () => {
        seedFacts([{ text: 'a persisted fact worth keeping around' }]);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<Hive />);
        fireEvent.click(screen.getByLabelText('Clear CoPaw memory'));
        expect(copawStore.getSnapshot().length).toBe(0);
    });

    it('per-fact delete removes only that fact, no confirm needed', () => {
        seedFacts([
            { id: 'keep', text: 'keep this fact around please yes' },
            { id: 'drop', text: 'drop this other fact right now' },
        ]);
        const confirmSpy = vi.spyOn(window, 'confirm');
        render(<Hive />);
        fireEvent.click(screen.getByLabelText(/Delete fact 2: drop this other fact/));
        expect(confirmSpy).not.toHaveBeenCalled();
        const remaining = copawStore.getSnapshot();
        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe('keep');
    });

    it('flags a secret-looking fact so the user can delete it; clean facts are not flagged', () => {
        seedFacts([
            { id: 's', text: 'The vendor portal password is Summer2026 for every staff member.' },
            { id: 'c', text: 'Vendors must renew their insurance certificate every year.' },
        ]);
        render(<Hive />);
        expect(screen.getAllByText(/Looks like a secret or personal data/).length).toBe(1);
    });

    it('filter narrows the visible list by text or source', () => {
        seedFacts([
            { id: 'a', text: 'the quarterly report ships on friday', source: 'Synthesis Lab' },
            { id: 'b', text: 'unrelated fact about something else', source: 'Builder Agents' },
        ]);
        render(<Hive />);
        fireEvent.change(screen.getByLabelText('Filter CoPaw memory'), { target: { value: 'quarterly' } });
        expect(screen.getByText('the quarterly report ships on friday')).toBeTruthy();
        expect(screen.queryByText('unrelated fact about something else')).toBeNull();
    });
});

describe('Hive agent activity + usage (plan 071 phase 3 part C)', () => {
    it('shows "5 min ago" for a synthesis activity', () => {
        const fixedNow = new Date('2026-09-28T12:00:00.000Z').getTime();
        vi.setSystemTime(fixedNow);
        recordAgentActivity({ source: 'synthesis', ok: true, text: 'compounded the notes', userId: null, now: fixedNow - 5 * 60_000 });
        render(<Hive />);
        expect(screen.getByText('5 min ago')).toBeTruthy();
    });

    it('a failed hydra run shows an error badge with the message', () => {
        recordAgentActivity({ source: 'hydra', ok: false, error: 'timeout talking to provider', userId: null });
        render(<Hive />);
        expect(screen.getByText('error: timeout talking to provider')).toBeTruthy();
    });

    it('shows the hidden-snippet placeholder as-is for a secret-looking response', () => {
        recordAgentActivity({ source: 'stella', ok: true, text: 'the vendor portal password is Summer2026', userId: null });
        render(<Hive />);
        expect(screen.getByText(HIDDEN_SNIPPET)).toBeTruthy();
    });

    it('two-brains shows "Not an AI-model agent" instead of a run timestamp', () => {
        render(<Hive />);
        expect(screen.getByText('Not an AI-model agent')).toBeTruthy();
    });

    it('sums two synthesis entries into the 7-day card cost', () => {
        llmUsageUserIdHolder.current = null;
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-5', promptChars: 4_000_000, responseChars: 0, source: 'synthesis', userId: null });
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-5', promptChars: 4_000_000, responseChars: 0, source: 'synthesis', userId: null });
        render(<Hive />);
        // priceFor(claude-sonnet-5).inPerM is whatever llmPricing says; what matters here is
        // both calls landed on the SAME card, not the exact dollar figure (covered by llmUsage.test.ts).
        expect(screen.getByText(/7 d: 2 calls/)).toBeTruthy();
    });

    it('an untagged call is counted under "Other features", not on any agent card', () => {
        llmUsageUserIdHolder.current = null;
        recordLlmUsage({ provider: 'anthropic', model: 'claude-sonnet-5', promptChars: 400, responseChars: 100, userId: null }); // no `source` → 'other'
        render(<Hive />);
        expect(screen.getByText(/Other features:/)).toBeTruthy();
        // None of the 7 per-agent cards should have picked up this untagged call.
        expect(screen.queryByText(/7 d: 1 call\b/)).toBeNull();
    });

    // Mutation check: if `ara-console`'s sources were emptied (e.g. someone maps it to []
    // instead of ['ara', 'team-run']), this test must fail — proving the sources wiring
    // actually drives the "last run" lookup rather than a card always reading "No runs".
    it('mutation guard — an ara activity must be attributed to the ARA card', () => {
        recordAgentActivity({ source: 'ara', ok: true, userId: null });
        render(<Hive />);
        expect(screen.queryAllByText('No runs recorded yet').length).toBeGreaterThan(0); // other agents still idle
        expect(screen.queryAllByText('just now').length).toBe(1); // exactly the ARA card
    });
});

describe('Hive cost row — unknown model prices', () => {
    it('discloses calls with an unknown model price instead of showing them as free', () => {
        recordLlmUsage({ provider: 'custom', model: 'mystery-model-9', promptChars: 4000, responseChars: 1000, source: 'synthesis', userId: null });
        render(<Hive />);
        expect(screen.getByText(/1 call with an unknown model price \(not in totals\)/)).toBeTruthy();
        expect(screen.getByText(/7 d: 1 call ·/)).toBeTruthy();
    });
});

