/**
 * Plan 046 Cluster S2 — Discoverability.
 *   S2-6: ⌘K widget rows show the registry one-line description as subtitle.
 *   S2-8: CommandPill opens the palette via `dwellium:open-palette`;
 *         ShortcutSheet opens on `?` (not while typing), lists the live
 *         global shortcuts, closes on Escape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { defaultDockItems } from '../data/hierarchy';
import { getWidgetMeta } from '../registry/widgetRegistry';

vi.mock('../config', () => ({ API_BASE: '' }));

const openWindow = vi.fn();
const focusWindow = vi.fn();
const restoreWindow = vi.fn();
vi.mock('../context/WindowContext', () => ({
    useWindows: () => ({
        dockItems: defaultDockItems,
        windows: [],
        openWindow,
        focusWindow,
        restoreWindow,
    }),
}));

import CommandPalette from '../components/CommandPalette/CommandPalette';
import CommandPill from '../components/Shell/CommandPill';
import ShortcutSheet from '../components/Shell/ShortcutSheet';
import { onboardingStore, resetOnboarding } from '../lib/onboardingStore';

beforeEach(() => {
    // Palette fetches tasks/inbox/files on open — keep it offline.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    // jsdom has no scrollIntoView; the palette calls it on the active row.
    Element.prototype.scrollIntoView = vi.fn();
});

describe('S2-6 — ⌘K rows carry the registry description', () => {
    it('a widget row subtitle equals its registry description', async () => {
        render(<CommandPalette />);
        await act(async () => { fireEvent.keyDown(window, { key: 'k', metaKey: true }); });
        const rows = Array.from(document.querySelectorAll('.command-palette__result'));
        const widgetRows = rows.filter(r => r.querySelector('.command-palette__kind--widget'));
        expect(widgetRows.length).toBeGreaterThan(0);
        for (const row of widgetRows) {
            const component = row.querySelector('.command-palette__result-meta')?.textContent ?? '';
            const subtitle = row.querySelector('.command-palette__result-subtitle')?.textContent ?? '';
            const desc = getWidgetMeta(component)?.description;
            expect(desc, component).toBeTruthy();
            expect(subtitle, component).toBe(desc);
        }
    });

    it('the palette footer hints ⌘K and ?', async () => {
        render(<CommandPalette />);
        await act(async () => { fireEvent.keyDown(window, { key: 'k', metaKey: true }); });
        const footer = document.querySelector('.command-palette__footer');
        expect(footer?.textContent).toContain('⌘K');
        expect(footer?.textContent).toContain('Shortcuts');
    });
});

describe('S2-8a — CommandPill', () => {
    it('click dispatches dwellium:open-palette; "?" button dispatches dwellium:open-shortcuts', () => {
        const spy = vi.spyOn(window, 'dispatchEvent');
        render(<CommandPill />);
        fireEvent.click(screen.getByRole('button', { name: /search or ask anything/i }));
        expect(spy.mock.calls.some(([e]) => (e as Event).type === 'dwellium:open-palette')).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));
        expect(spy.mock.calls.some(([e]) => (e as Event).type === 'dwellium:open-shortcuts')).toBe(true);
        spy.mockRestore();
    });

    it('the pill opens the real palette end-to-end', async () => {
        render(<><CommandPalette /><CommandPill /></>);
        expect(document.querySelector('.command-palette__input, .command-palette input')).toBeNull();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /search or ask anything/i })); });
        expect(document.querySelector('.command-palette input')).not.toBeNull();
    });
});

describe('S2-8b — ShortcutSheet', () => {
    it('"?" opens the sheet listing the live shortcuts; Escape closes it', () => {
        render(<ShortcutSheet />);
        expect(screen.queryByRole('dialog', { name: /keyboard shortcuts/i })).toBeNull();
        fireEvent.keyDown(window, { key: '?' });
        const dlg = screen.getByRole('dialog', { name: /keyboard shortcuts/i });
        for (const k of ['⌘K', '⌘W', '⌘T', '⌘⇧2', 'Esc']) {
            expect(dlg.textContent, k).toContain(k);
        }
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: /keyboard shortcuts/i })).toBeNull();
    });

    it('"?" while typing in an input does NOT open the sheet', () => {
        render(<><input aria-label="composer" /><ShortcutSheet /></>);
        const input = screen.getByLabelText('composer');
        input.focus();
        fireEvent.keyDown(input, { key: '?' });
        expect(screen.queryByRole('dialog', { name: /keyboard shortcuts/i })).toBeNull();
    });

    it('a defaultPrevented "?" (e.g. IDocEditor capture-phase) is ignored', () => {
        render(<ShortcutSheet />);
        const ev = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true });
        ev.preventDefault();
        act(() => { window.dispatchEvent(ev); });
        expect(screen.queryByRole('dialog', { name: /keyboard shortcuts/i })).toBeNull();
    });

    it('opens on dwellium:open-shortcuts', () => {
        render(<ShortcutSheet />);
        act(() => { window.dispatchEvent(new CustomEvent('dwellium:open-shortcuts')); });
        expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    });

    it('"Your role" row lets an existing account pick a role (second door after the first-run card)', () => {
        resetOnboarding();
        render(<ShortcutSheet />);
        act(() => { window.dispatchEvent(new CustomEvent('dwellium:open-shortcuts')); });
        const group = screen.getByRole('group', { name: /your role/i });
        const staff = screen.getByRole('button', { name: /I help manage them/ });
        expect(staff).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(staff);
        expect(onboardingStore.getSnapshot().role).toBe('staff');
        expect(screen.getByRole('button', { name: /I help manage them/ })).toHaveAttribute('aria-pressed', 'true');
        expect(group).toBeInTheDocument();
    });
});
