/**
 * Onboarding walkthrough (spotlight tour) — store, overlay, suppression,
 * replay entry points.
 *
 * Grounded in the product rules: auto-start on a user's FIRST login only
 * (per-user store, Andy≠Lisa), Classic layout only (Holocron/Fluid defer),
 * Skip/Finish/Esc all mark done, missing targets degrade to a centered card
 * (never a broken cutout), FirstRunCard + SystemHealthBanner hide while the
 * tour runs and come back after, replayable from the ? sheet and ⌘K.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

const USER = vi.hoisted(() => ({ id: 'u-walk', name: 'Andy', email: 'andy@example.com', role: 'management' }));
vi.mock('../context/UserContext', async () => {
    const React = await import('react');
    return { UserContext: React.createContext({ user: USER }) };
});

// FirstRunCard live-signal deps (same shape as FirstRunCard.test.tsx).
vi.mock('../components/StrataDashboard/useStrataQueries', () => ({
    useProperties: () => ({ data: [] as Array<{ id: string }> }),
}));
vi.mock('../components/ARAConsole/araHermes', () => ({ araChatRuns: () => [] }));

// SystemHealthBanner deps: a summary with connections down, inside a shell context.
vi.mock('../hooks/useSystemHealth', () => ({
    useSystemHealth: () => ({ summary: { ok: 1, degraded: 0, down: 2, total: 3, allReady: false }, checking: false, results: [], recheck: vi.fn() }),
}));
vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({ windows: [], openWindow: vi.fn(), closeWindow: vi.fn() }),
}));

import WalkthroughOverlay, { WALKTHROUGH_STEPS, NON_CLASSIC_NOTE } from '../components/Shell/WalkthroughOverlay';
import ShortcutSheet from '../components/Shell/ShortcutSheet';
import FirstRunCard from '../components/Shell/FirstRunCard';
import SystemHealthBanner from '../components/SystemHealth/SystemHealthBanner';
import {
    walkthroughStore, walkthroughUserIdHolder, walkthroughActiveStore,
    markWalkthroughDone, resetWalkthrough, shouldAutoStartWalkthrough,
    replayWalkthrough, WALKTHROUGH_REPLAY_EVENT,
} from '../lib/walkthroughStore';
import { firstRunStore, firstRunUserIdHolder, resetFirstRun, FIRST_RUN_DISMISSED_SESSION_KEY } from '../lib/firstRunStore';
import { halocronOsStore } from '../lib/halocronOsStore';
import { fluidOsStore } from '../lib/fluidOsStore';
import { parseCommand } from '../lib/dwelliumCommands';
import { integrationsStore } from '../utils/integrationsStore';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeEach(() => {
    localStorage.clear();
    sessionStorage.removeItem(FIRST_RUN_DISMISSED_SESSION_KEY);
    walkthroughUserIdHolder.current = USER.id;
    firstRunUserIdHolder.current = USER.id;
    resetWalkthrough();
    walkthroughStore.reset();
    walkthroughActiveStore.reset();
    resetFirstRun();
    firstRunStore.reset();
    integrationsStore.reset();
    halocronOsStore.reset();
    fluidOsStore.reset();
});

describe('walkthroughStore — per-user first-login flag', () => {
    it('round-trips done per user: Andy ≠ Lisa', () => {
        walkthroughUserIdHolder.current = 'andy';
        expect(walkthroughStore.getSnapshot().done).toBe(false);
        markWalkthroughDone();
        expect(walkthroughStore.getSnapshot().done).toBe(true);

        walkthroughUserIdHolder.current = 'lisa';
        expect(walkthroughStore.getSnapshot().done).toBe(false); // fresh user → fresh tour

        walkthroughUserIdHolder.current = 'andy';
        expect(walkthroughStore.getSnapshot().done).toBe(true); // Andy stays done
    });

    it('shouldAutoStartWalkthrough: fresh user yes, returning user no', () => {
        expect(shouldAutoStartWalkthrough({ done: false })).toBe(true);
        expect(shouldAutoStartWalkthrough({ done: true })).toBe(false);
    });
});

describe('WalkthroughOverlay — auto-start + navigation', () => {
    it('auto-starts for a fresh user on Classic with the welcome copy', async () => {
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAttribute('aria-label', 'Walkthrough — Welcome to Dwellium');
        expect(screen.getByText(/Dwellium is your whole desk\. Close it anytime — everything saves/)).toBeInTheDocument();
        expect(screen.getByText('1 of 7')).toBeInTheDocument();
    });

    it('does NOT auto-start for a returning user (no toast collision with welcome-back)', async () => {
        markWalkthroughDone();
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        await act(() => sleep(30));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('defers on a non-Classic layout, then starts once Classic is active again', async () => {
        act(() => fluidOsStore.setEnabled(true));
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        await act(() => sleep(30));
        expect(screen.queryByRole('dialog')).toBeNull();

        act(() => fluidOsStore.setEnabled(false));
        await screen.findByRole('dialog');
        expect(walkthroughStore.getSnapshot().done).toBe(false);
    });

    it('Next/Back walk the seven steps with the exact titles', async () => {
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        await screen.findByRole('dialog');
        const titles = WALKTHROUGH_STEPS.map(s => s.title);
        for (let i = 1; i < titles.length; i++) {
            fireEvent.click(screen.getByRole('button', { name: 'Next' })); // the last step's button reads Finish; we stop before clicking it
            expect(screen.queryByRole('dialog')).not.toBeNull();
            expect(screen.getByText(titles[i])).toBeInTheDocument();
            expect(screen.getByText(`${i + 1} of 7`)).toBeInTheDocument();
        }
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByText(titles[titles.length - 2])).toBeInTheDocument();
        // No Back button on step 1.
        while (screen.queryByRole('button', { name: 'Back' })) {
            fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        }
        expect(screen.getByText('Welcome to Dwellium')).toBeInTheDocument();
    });

    it('finishing the last step closes the tour and persists done', async () => {
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        await screen.findByRole('dialog');
        for (let i = 0; i < WALKTHROUGH_STEPS.length - 1; i++) {
            fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        }
        expect(screen.getByText('Your first win')).toBeInTheDocument();
        expect(screen.getByText(/Press \? anytime for shortcuts and to replay this tour/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(walkthroughStore.getSnapshot().done).toBe(true);
    });

    it('Skip marks done — the tour never auto-starts again', async () => {
        const { unmount } = render(<WalkthroughOverlay autoStartDelayMs={0} />);
        await screen.findByRole('dialog');
        fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(walkthroughStore.getSnapshot().done).toBe(true);
        unmount();
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        await act(() => sleep(30));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('Esc skips (dismisses the tour, marks done — never a window)', async () => {
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        await screen.findByRole('dialog');
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(walkthroughStore.getSnapshot().done).toBe(true);
    });

    it('missing target degrades to a centered card (never a broken cutout)', async () => {
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        await screen.findByRole('dialog');
        fireEvent.click(screen.getByRole('button', { name: 'Next' })); // step 2 targets [data-tour="sidebar"] — absent here
        expect(screen.getByText('Everything lives here')).toBeInTheDocument();
        expect(document.querySelector('.walkthrough-card--centered')).not.toBeNull();
    });

    it('replay works on a non-Classic layout, centered, with the honesty note in step 1', async () => {
        markWalkthroughDone();
        act(() => halocronOsStore.setEnabled(true));
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        act(() => replayWalkthrough());
        await screen.findByRole('dialog');
        expect(screen.getByText(new RegExp(NON_CLASSIC_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
        expect(document.querySelector('.walkthrough-card--centered')).not.toBeNull();
    });

    it('a11y: dialog role, focus lands in the card, all buttons labeled', async () => {
        render(<WalkthroughOverlay autoStartDelayMs={0} />);
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
        for (const btn of screen.getAllByRole('button')) {
            expect(btn.textContent?.trim()).toBeTruthy();
        }
    });
});

describe('suppression — FirstRunCard + SystemHealthBanner hide while the tour runs', () => {
    it('SystemHealthBanner hides while active and returns after', () => {
        const { container } = render(<SystemHealthBanner />);
        expect(container.querySelector('.sysh-banner')).not.toBeNull();
        act(() => walkthroughActiveStore.set({ active: true, spotlightFirstWin: false }));
        expect(container.querySelector('.sysh-banner')).toBeNull();
        act(() => walkthroughActiveStore.set({ active: false, spotlightFirstWin: false }));
        expect(container.querySelector('.sysh-banner')).not.toBeNull();
    });

    it('FirstRunCard hides while active, EXCEPT on the finish step it is the spotlight target', () => {
        const { container } = render(<FirstRunCard />);
        expect(screen.getByText('Get to your first win')).toBeInTheDocument();
        act(() => walkthroughActiveStore.set({ active: true, spotlightFirstWin: false }));
        expect(screen.queryByText('Get to your first win')).toBeNull();
        act(() => walkthroughActiveStore.set({ active: true, spotlightFirstWin: true }));
        expect(screen.getByText('Get to your first win')).toBeInTheDocument();
        expect(container.querySelector('[data-tour="first-win"]')).not.toBeNull();
        act(() => walkthroughActiveStore.set({ active: false, spotlightFirstWin: false }));
        expect(screen.getByText('Get to your first win')).toBeInTheDocument();
    });
});

describe('replay entry points', () => {
    it('⌘K parses "walkthrough" / "tour" / "replay the walkthrough" to the replay command', () => {
        for (const input of ['walkthrough', 'tour', 'replay the walkthrough', 'take the tour']) {
            const cmd = parseCommand(input);
            expect(cmd?.label).toBe('Replay the walkthrough');
        }
        let fired = 0;
        const onReplay = () => { fired += 1; };
        window.addEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
        parseCommand('walkthrough')!.run();
        window.removeEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
        expect(fired).toBe(1);
    });

    it('the ? sheet has a "Replay walkthrough" row next to "Replay first-run" that fires the event and closes', () => {
        render(<ShortcutSheet />);
        act(() => { window.dispatchEvent(new CustomEvent('dwellium:open-shortcuts')); });
        expect(screen.getByRole('button', { name: 'Replay first-run' })).toBeInTheDocument();
        let fired = 0;
        const onReplay = () => { fired += 1; };
        window.addEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
        fireEvent.click(screen.getByRole('button', { name: 'Replay walkthrough' }));
        window.removeEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
        expect(fired).toBe(1);
        expect(screen.queryByRole('dialog')).toBeNull(); // sheet closed
    });
});
