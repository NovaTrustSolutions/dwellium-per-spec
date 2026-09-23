import { StrictMode, useState } from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AvatarDossier from '../components/AgentLab/AvatarDossier';
import type { PersonaAvatar, PersonaDossier } from '../lib/agents/personas';
import type { PersonaStats } from '../lib/agents/hermesStatus';

/**
 * P1 (container-query grid collapse) is NOT covered here — jsdom does not lay
 * out CSS, so `@container` thresholds can't be asserted from a unit test. It
 * is proven by the screenshot harness instead (see the wave's verification
 * notes).
 */

function stubMatchMedia(reduce: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query: string) => ({
            matches: reduce && query.includes('prefers-reduced-motion'),
            media: query,
            addEventListener: () => { },
            removeEventListener: () => { },
            addListener: () => { },
            removeListener: () => { },
            onchange: null,
            dispatchEvent: () => false,
        }),
    });
}

function makeDossier(overrides: Partial<PersonaDossier> = {}): PersonaDossier {
    return {
        subjectId: 'TEST-01',
        scanMode: 'Wireframe',
        clearance: 'Visual',
        title: 'Test Persona',
        description: 'A persona used for dossier tests.',
        identity: [{ label: 'Alias', value: 'Test' }],
        traits: [],
        tags: [],
        metrics: [],
        readout: [],
        channels: [{ label: 'Focus', pct: 60 }],
        notes: [{ title: 'Note A', body: 'Body text' }],
        hidden: [],
        ...overrides,
    };
}

/** Wraps AvatarDossier with real state so onChange round-trips like the app does. */
function Wrapper({ initialDossier, stats }: { initialDossier: PersonaDossier; stats?: PersonaStats }) {
    const [dossier, setDossier] = useState(initialDossier);
    const [avatar, setAvatar] = useState<PersonaAvatar>({ kind: 'wireframe' });
    const [neuralVideo, setNeuralVideo] = useState('/assets/neural/neural-1.mp4');
    return (
        <AvatarDossier
            dossier={dossier}
            onChange={setDossier}
            avatar={avatar}
            onAvatarChange={setAvatar}
            neuralVideo={neuralVideo}
            onNeuralVideoChange={setNeuralVideo}
            stats={stats}
        />
    );
}

beforeEach(() => {
    stubMatchMedia(false);
    // jsdom has no real media pipeline — stub play/pause so the mount effect
    // and the toggle button don't throw "not implemented".
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
    cleanup();
});

describe('AvatarDossier — Activity block (P2)', () => {
    it('shows "Not available" for a null success rate and avg task time, and "Never" for no last run', () => {
        const stats: PersonaStats = { runs: 3, successRate: null, avgTaskMs: null, lastRunAt: null };
        render(<StrictMode><Wrapper initialDossier={makeDossier()} stats={stats} /></StrictMode>);

        expect(screen.getAllByText('Not available')).toHaveLength(2);
        expect(screen.getByText('Never')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('formats a known rate as a rounded percent', () => {
        const stats: PersonaStats = { runs: 8, successRate: 0.75, avgTaskMs: 4200, lastRunAt: Date.now() };
        render(<StrictMode><Wrapper initialDossier={makeDossier()} stats={stats} /></StrictMode>);

        expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('renders no Activity block when stats is not provided', () => {
        render(<StrictMode><Wrapper initialDossier={makeDossier()} /></StrictMode>);
        expect(screen.queryByText('Activity')).not.toBeInTheDocument();
    });
});

describe('AvatarDossier — accessibility (P4)', () => {
    it('gives the channel percent input an accessible name from its label', () => {
        render(<StrictMode><Wrapper initialDossier={makeDossier()} /></StrictMode>);
        expect(screen.getByLabelText(/strength \(percent\)/i)).toBeInTheDocument();
    });

    it('gives every remove button a name that says what it removes', () => {
        render(<StrictMode><Wrapper initialDossier={makeDossier()} /></StrictMode>);
        const removeButtons = screen.getAllByRole('button', { name: /^Remove /i });
        const names = removeButtons.map(b => b.getAttribute('aria-label'));
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain('Remove field "Alias"');
        expect(names).toContain('Remove channel "Focus"');
        expect(names).toContain('Remove note "Note A"');
    });

    it('falls back to a generic remove name when the row has no label', () => {
        const dossier = makeDossier({ identity: [{ label: '', value: 'x' }] });
        render(<StrictMode><Wrapper initialDossier={dossier} /></StrictMode>);
        expect(screen.getByRole('button', { name: 'Remove field' })).toBeInTheDocument();
    });

    it('moves focus to the list\'s Add button after a row is removed', async () => {
        render(<StrictMode><Wrapper initialDossier={makeDossier()} /></StrictMode>);
        const removeBtn = screen.getByRole('button', { name: 'Remove field "Alias"' });
        removeBtn.focus();
        fireEvent.click(removeBtn);

        const addBtn = screen.getByRole('button', { name: '+ Field' });
        await waitFor(() => expect(document.activeElement).toBe(addBtn));
    });

    it('moves focus to the restore button after a field is hidden', async () => {
        render(<StrictMode><Wrapper initialDossier={makeDossier()} /></StrictMode>);
        const hideBtn = screen.getByRole('button', { name: 'Hide title' });
        hideBtn.focus();
        fireEvent.click(hideBtn);

        await waitFor(() => {
            const restoreBtn = document.querySelector('[data-restore="title"]');
            expect(document.activeElement).toBe(restoreBtn);
        });
    });

    it('the neural-loop pause toggle flips aria-pressed and calls pause()', () => {
        render(<StrictMode><Wrapper initialDossier={makeDossier()} /></StrictMode>);
        const toggle = screen.getByRole('button', { name: 'Pause neural loop' });
        expect(toggle).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(toggle);

        expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Play neural loop' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('does not autoplay the neural loop when prefers-reduced-motion is set', () => {
        stubMatchMedia(true);
        render(<StrictMode><Wrapper initialDossier={makeDossier()} /></StrictMode>);
        expect(screen.getByRole('button', { name: 'Play neural loop' })).toHaveAttribute('aria-pressed', 'true');
    });
});
