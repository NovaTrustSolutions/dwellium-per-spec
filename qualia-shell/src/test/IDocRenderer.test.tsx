/**
 * Interactive Docs — pure renderer (RTL). Real timers only.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import IDocRenderer from '../components/Scribe/idocs/IDocRenderer';
import { createEmptyDoc, type IDoc } from '../components/Scribe/idocs/idocTypes';

// recharts ResponsiveContainer needs ResizeObserver (absent in jsdom).
class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('ResizeObserver', MockResizeObserver); });
afterEach(cleanup);

function fixture(): IDoc {
    return createEmptyDoc({
        title: 'Render Me',
        theme: 'sunrise',
        cards: [
            { id: 'c1', title: 'Card One', layout: 'default', blocks: [
                { id: 'b1', type: 'heading', level: 1, text: 'Big Heading' },
                { id: 'b2', type: 'callout', tone: 'warning', md: 'Careful now' },
                { id: 'b3', type: 'accordion', items: [{ title: 'Open me', md: 'Hidden body' }] },
                { id: 'b4', type: 'quiz', question: 'Pick B', options: ['A', 'B'], answerIndex: 1, explanation: 'B is right' },
                { id: 'b5', type: 'tabs', items: [{ title: 'Tab 1', md: 'first tab' }, { title: 'Tab 2', md: 'second tab' }] },
                { id: 'b6', type: 'embed', url: 'https://youtu.be/vid1' },
                { id: 'b7', type: 'chart', kind: 'bar', data: [{ label: 'a', value: 1 }] },
                { id: 'b8', type: 'button', label: 'Bad', href: 'javascript:alert(1)', variant: 'primary' },
                { id: 'b9', type: 'toc' },
            ] },
            { id: 'c2', title: 'Card Two', layout: 'default', blocks: [{ id: 'b10', type: 'text', md: 'Second card body' }] },
        ],
    });
}

describe('IDocRenderer scroll mode', () => {
    it('renders headings, callout, accordion, quiz, tabs, embed, toc; blocks unsafe hrefs', () => {
        render(<IDocRenderer doc={fixture()} />);
        expect(screen.getByRole('heading', { level: 1, name: 'Big Heading' })).toBeInTheDocument();
        expect(screen.getByRole('note')).toHaveClass('scribe-idocs__callout--warning');
        expect(screen.getByText('Open me').closest('details')).not.toBeNull();
        expect(screen.getByText('Pick B')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'true');
        const iframe = document.querySelector('iframe')!;
        expect(iframe.getAttribute('src')).toBe('https://www.youtube.com/embed/vid1');
        expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
        expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
        expect(screen.getByRole('navigation', { name: 'Contents' })).toHaveTextContent('Card One');
        expect(screen.getByText('Second card body')).toBeInTheDocument();
        // theme vars applied inline
        expect(screen.getByTestId('idoc-scroll').getAttribute('style')).toContain('--idoc-accent: #ff6a3d');
    });

    it('quiz: clicking an option reveals result + explanation; try again resets', () => {
        render(<IDocRenderer doc={fixture()} />);
        fireEvent.click(screen.getByRole('button', { name: 'A' }));
        expect(screen.getByRole('status')).toHaveTextContent('Not quite.');
        expect(screen.getByRole('status')).toHaveTextContent('B is right');
        fireEvent.click(screen.getByText('Try again'));
        fireEvent.click(screen.getByRole('button', { name: 'B' }));
        expect(screen.getByRole('status')).toHaveTextContent('Correct!');
    });

    it('tabs switch panels', () => {
        render(<IDocRenderer doc={fixture()} />);
        expect(screen.getByText('first tab')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }));
        expect(screen.getByText('second tab')).toBeInTheDocument();
        expect(screen.queryByText('first tab')).toBeNull();
    });
});

describe('IDocRenderer present mode', () => {
    it('present-mode Escape does NOT reach bubble-phase window listeners (Desktop closes the top window on Esc)', () => {
        const desktopEsc = vi.fn();
        const bubble = (e: KeyboardEvent) => { if (e.key === 'Escape') desktopEsc(); };
        window.addEventListener('keydown', bubble); // like Desktop.tsx:925 — bubble phase, registered first
        const onExit = vi.fn();
        render(<IDocRenderer doc={fixture()} mode="present" onExit={onExit} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onExit).toHaveBeenCalledTimes(1);
        expect(desktopEsc).not.toHaveBeenCalled();
        window.removeEventListener('keydown', bubble);
    });

    it('shows one card, ArrowRight advances, ArrowLeft goes back, Escape exits, dots jump', () => {
        const onExit = vi.fn();
        const onVisible = vi.fn();
        render(<IDocRenderer doc={fixture()} mode="present" onExit={onExit} onCardVisible={onVisible} />);
        expect(screen.getByRole('heading', { name: 'Card One' })).toBeInTheDocument();
        expect(screen.queryByText('Second card body')).toBeNull();
        expect(onVisible).toHaveBeenLastCalledWith('c1');
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(screen.getByText('Second card body')).toBeInTheDocument();
        expect(screen.getByText('2 / 2')).toBeInTheDocument();
        expect(onVisible).toHaveBeenLastCalledWith('c2');
        fireEvent.keyDown(window, { key: 'ArrowRight' }); // clamps at end
        expect(screen.getByText('2 / 2')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        expect(screen.getByText('1 / 2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Card Two' }));
        expect(screen.getByText('2 / 2')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onExit).toHaveBeenCalledTimes(1);
    });
});
