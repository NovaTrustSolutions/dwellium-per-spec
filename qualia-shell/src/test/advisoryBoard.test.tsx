/**
 * 5 Persona Advisory Board — UI suite: the Home diagram (personas, CRIT
 * hexagon + labels, disclaimer, keyboard/aria, reduced motion, click → lens),
 * the widget's demo mode and no-key state, and the registry/dock wiring.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

import AdvisoryBoardDiagram from '../components/AdvisoryBoard/AdvisoryBoardDiagram';
import AdvisoryBoard from '../components/AdvisoryBoard/AdvisoryBoard';
import { LENSES } from '../lib/advisoryBoard/lenses';
import { DEMO_BOARD } from '../lib/advisoryBoard/demo';
import { resetAdvisoryBoard } from '../lib/advisoryBoard/store';
import { advisoryLensBus } from '../lib/busChannels';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { defaultDockItems } from '../data/hierarchy';

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

beforeEach(() => {
    localStorage.clear();
    resetAdvisoryBoard();
    advisoryLensBus.clear();
    stubMatchMedia(false);
});

describe('advisory board diagram', () => {
    it('renders all five personas with shorthand, role and the canonical lens name', () => {
        render(<AdvisoryBoardDiagram onSelectLens={() => { }} />);
        for (const lens of LENSES) {
            const btn = screen.getByRole('button', { name: new RegExp(lens.name, 'i') });
            expect(btn).toBeInTheDocument();
            expect(within(btn).getByText(lens.shorthand)).toBeInTheDocument();
            expect(within(btn).getByText(lens.role)).toBeInTheDocument();
            expect(within(btn).getByText(lens.name)).toBeInTheDocument();
        }
        expect(screen.getAllByRole('button')).toHaveLength(5);
    });

    it('renders the title, subtitle and the CRIT hexagon with all four CRIT labels', () => {
        render(<AdvisoryBoardDiagram onSelectLens={() => { }} />);
        expect(screen.getByText('5 Persona Advisory Board')).toBeInTheDocument();
        expect(screen.getByText(/Interview first\. Stress-test with five strategic lenses\./)).toBeInTheDocument();
        const hex = screen.getByTestId('advisory-board-crit');
        expect(within(hex).getByText('CRIT')).toBeInTheDocument();
        for (const label of ['Context', 'Task', 'Role', 'Interview']) {
            expect(within(hex).getByText(label)).toBeInTheDocument();
        }
    });

    it('shows the non-affiliation disclaimer', () => {
        render(<AdvisoryBoardDiagram onSelectLens={() => { }} />);
        expect(screen.getByText(/Interpretive strategic lenses, not impersonations/)).toBeInTheDocument();
        expect(screen.getByText(/Not affiliated with, endorsed by, or connected to/)).toBeInTheDocument();
    });

    it('every persona is a real, focusable button with an aria-label naming the lens', () => {
        render(<AdvisoryBoardDiagram onSelectLens={() => { }} />);
        for (const lens of LENSES) {
            const btn = screen.getByRole('button', { name: new RegExp(lens.name, 'i') });
            expect(btn.tagName).toBe('BUTTON');
            expect(btn.getAttribute('type')).toBe('button');
            expect(btn.getAttribute('aria-label')).toContain(lens.name);
            btn.focus();
            expect(document.activeElement).toBe(btn);
        }
    });

    it('clicking a persona reports that lens', () => {
        const onSelectLens = vi.fn();
        render(<AdvisoryBoardDiagram onSelectLens={onSelectLens} />);
        fireEvent.click(screen.getByRole('button', { name: /Risk and Capital Lens/i }));
        expect(onSelectLens).toHaveBeenCalledWith('risk');
        fireEvent.click(screen.getByRole('button', { name: /Future Self Lens/i }));
        expect(onSelectLens).toHaveBeenLastCalledWith('future-self');
    });

    it('phases in by default and renders straight through under prefers-reduced-motion', () => {
        const { unmount } = render(<AdvisoryBoardDiagram onSelectLens={() => { }} />);
        expect(screen.getByTestId('advisory-board-diagram').getAttribute('data-motion')).toBe('on');
        unmount();

        stubMatchMedia(true);
        render(<AdvisoryBoardDiagram onSelectLens={() => { }} />);
        expect(screen.getByTestId('advisory-board-diagram').getAttribute('data-motion')).toBe('off');
        // Content is present regardless of motion.
        expect(screen.getAllByRole('button')).toHaveLength(5);
    });

    it('renders an optional action slot', () => {
        render(<AdvisoryBoardDiagram onSelectLens={() => { }} action={<button type="button">Open the Advisory Board →</button>} />);
        expect(screen.getByRole('button', { name: /Open the Advisory Board/ })).toBeInTheDocument();
    });
});

describe('advisory board widget', () => {
    it('opens in demo mode with the full output-format sections, clearly marked as an example', () => {
        render(<AdvisoryBoard />);
        expect(screen.getByText(/Example board — not your data/)).toBeInTheDocument();
        expect(screen.getByText(DEMO_BOARD.topic)).toBeInTheDocument();
        for (const heading of ['Decision', 'Context Read', '5 Lens Views', 'Disagreement', 'Future Self Check', 'Final Decision Brief']) {
            expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
        }
        expect(screen.getByRole('button', { name: /Run your own decision/ })).toBeInTheDocument();
    });

    it('renders all five lens views in canonical order with View / Blind spot / Recommendation', () => {
        const { container } = render(<AdvisoryBoard />);
        const blocks = Array.from(container.querySelectorAll('.ab__lens'));
        expect(blocks.map((b) => b.getAttribute('data-lens')))
            .toEqual(['clarity', 'risk', 'scale', 'offer', 'future-self']);
        for (const block of blocks) {
            expect(block.textContent).toContain('View:');
            expect(block.textContent).toContain('Blind spot:');
            expect(block.textContent).toContain('Recommendation:');
        }
    });

    it('shows the honest "add a key" degraded state when no LLM key is configured', () => {
        render(<AdvisoryBoard />);
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Open API Keys/ })).toBeInTheDocument();
    });

    it('shows the CRIT how-to block and a copyable starter prompt', () => {
        render(<AdvisoryBoard />);
        expect(screen.getByText(/How to use it — the CRIT loop in four steps/)).toBeInTheDocument();
        for (const step of ['Context', 'Role', 'Interview', 'Task']) {
            expect(screen.getAllByText(step).length).toBeGreaterThan(0);
        }
        expect(screen.getByRole('button', { name: /Copy starter prompt/ })).toBeInTheDocument();
    });

    it('shows the non-affiliation disclaimer in the panel', () => {
        render(<AdvisoryBoard />);
        expect(screen.getAllByText(/Not affiliated with, endorsed by, or connected to/).length).toBeGreaterThan(0);
    });

    it('focuses one lens when the Home diagram emits it', () => {
        advisoryLensBus.emit({ lensId: 'offer' });
        const { container } = render(<AdvisoryBoard />);
        expect(container.querySelector('.ab__lens.is-focused')?.getAttribute('data-lens')).toBe('offer');
    });

    it('surfaces an honest error rather than silence when a lens is asked with no key', () => {
        render(<AdvisoryBoard />);
        fireEvent.click(screen.getAllByRole('button', { name: /Ask just this lens/ })[0]);
        expect(screen.getByRole('alert').textContent).toMatch(/Add an AI key/);
    });
});

describe('advisory board wiring', () => {
    it('is registered as a widget so ⌘K can open it', () => {
        const entry = WIDGET_REGISTRY['advisory-board'];
        expect(entry).toBeTruthy();
        expect(entry.label).toBe('Advisory Board');
        expect(entry.category).toBe('ai');
    });

    it('has a dock row in the AI Tools group', () => {
        const dock = defaultDockItems.find((d) => d.component === 'advisory-board');
        expect(dock).toBeTruthy();
        expect(dock?.group).toBe('AI Tools');
    });
});
