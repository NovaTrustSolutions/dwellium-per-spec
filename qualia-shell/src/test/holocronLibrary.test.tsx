/**
 * HolocronLibrary — a11y + interaction suite (plan 074, Phase 1 + 3.2).
 *
 * Mirrors apiKeysWidget.test.tsx style: render the real component with no
 * providers (it's self-contained, no backend), assert roles/names, and drive
 * clicks through Testing Library rather than internal state.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HolocronLibrary from '../components/HolocronLibrary/HolocronLibrary';

afterEach(() => {
    cleanup();
});

describe('HolocronLibrary renders an accessible card grid', () => {
    it('renders 8 buttons, each unpressed, each inside a listitem', () => {
        const { container } = render(<HolocronLibrary />);
        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(8);
        buttons.forEach((b) => expect(b.getAttribute('aria-pressed')).toBe('false'));

        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(8);
        items.forEach((li) => expect(li.querySelector('button')).toBeTruthy());

        // Sanity: it's really a <ul>/<li> structure, not role-only.
        expect(container.querySelector('ul.holocron-lib__grid')).toBeTruthy();
    });

    it('names buttons from visible text (fig + name)', () => {
        render(<HolocronLibrary />);
        expect(screen.getByRole('button', { name: /fig\. I\b.*Lazarus/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /fig\. VIII\b.*Leviathan/ })).toBeTruthy();
    });

    it('heading is a level-2 "Halocron Index"', () => {
        render(<HolocronLibrary />);
        expect(screen.getByRole('heading', { level: 2, name: /Halocron Index/ })).toBeTruthy();
    });

    it('the live region exists before any click', () => {
        const { container } = render(<HolocronLibrary />);
        const aside = container.querySelector('aside[aria-live="polite"]');
        expect(aside).toBeTruthy();
        expect(aside?.childNodes.length).toBe(0);
    });

    it('clicking a card ignites it and fills the live region; clicking again clears it', async () => {
        const user = userEvent.setup();
        const { container } = render(<HolocronLibrary />);
        const aside = container.querySelector('aside[aria-live="polite"]') as HTMLElement;

        const lazarus = screen.getByRole('button', { name: /fig\. I\b.*Lazarus/ });
        await user.click(lazarus);
        expect(lazarus.getAttribute('aria-pressed')).toBe('true');
        expect(aside.textContent).toMatch(/Lazarus/);
        expect(aside.textContent).toMatch(/cruciform reliquary/);

        await user.click(lazarus);
        expect(lazarus.getAttribute('aria-pressed')).toBe('false');
        expect(aside.childNodes.length).toBe(0);
    });

    it('clicking a different card moves the pressed state (only one pressed at a time)', async () => {
        const user = userEvent.setup();
        render(<HolocronLibrary />);
        const lazarus = screen.getByRole('button', { name: /fig\. I\b.*Lazarus/ });
        const leviathan = screen.getByRole('button', { name: /fig\. VIII\b.*Leviathan/ });

        await user.click(lazarus);
        expect(lazarus.getAttribute('aria-pressed')).toBe('true');

        await user.click(leviathan);
        expect(leviathan.getAttribute('aria-pressed')).toBe('true');
        expect(lazarus.getAttribute('aria-pressed')).toBe('false');

        const pressed = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');
        expect(pressed).toHaveLength(1);
    });
});
