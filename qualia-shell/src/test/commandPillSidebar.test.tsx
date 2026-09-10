import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SpacesSwitcher from '../components/Sidebar/SpacesSwitcher';
import CommandPill from '../components/Shell/CommandPill';
import { DEFAULT_SPACES, persistSpaces } from '../lib/spacesStore';

/**
 * The "Search or ask… ⌘K" trigger used to be a position:fixed pill at the top
 * centre of the shell, floating over window title bars and the cockpit header.
 * It now rides the right end of the sidebar's SPACES row (SpacesSwitcher
 * `trailing`), as an icon-only button in the icon rail.
 */
describe('⌘K trigger in the sidebar SPACES row', () => {
    beforeEach(() => { localStorage.clear(); persistSpaces(DEFAULT_SPACES); });
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    it('renders the pill inside the SPACES label row, after the label, and still opens the palette', () => {
        const spy = vi.spyOn(window, 'dispatchEvent');
        render(<SpacesSwitcher trailing={<CommandPill />} />);
        const label = document.querySelector('.spaces-switcher__label')!;
        expect(label.textContent).toMatch(/^SPACES/);
        const btn = screen.getByRole('button', { name: 'Search or ask anything (⌘K)' });
        expect(label.contains(btn)).toBe(true);
        expect(btn.closest('.spaces-switcher__trailing')).not.toBeNull();
        expect(btn.textContent).toBe('Search⌘K');
        expect(screen.getByRole('button', { name: 'Keyboard shortcuts (?)' })).toBeInTheDocument();
        // the Space buttons keep their list semantics, now on the row that holds them
        expect(document.querySelector('.spaces-switcher__row')?.getAttribute('role')).toBe('list');
        expect(screen.getAllByRole('listitem').length).toBe(DEFAULT_SPACES.length);
        fireEvent.click(btn);
        expect(spy.mock.calls.some(([e]) => (e as Event).type === 'dwellium:open-palette')).toBe(true);
    });

    it('stays available with no Spaces at all, and as an icon-only button in the rail', () => {
        persistSpaces([]);
        const { unmount } = render(<SpacesSwitcher trailing={<CommandPill />} />);
        expect(screen.getByRole('button', { name: 'Search or ask anything (⌘K)' })).toBeInTheDocument();
        expect(document.querySelector('.spaces-switcher__label')?.textContent).not.toMatch(/SPACES/);
        unmount();
        render(<SpacesSwitcher compact trailing={<CommandPill compact />} />);
        const btn = screen.getByRole('button', { name: 'Search or ask anything (⌘K)' });
        expect(btn.textContent).toBe('');
        expect(btn.closest('.spaces-switcher__trailing--compact')).not.toBeNull();
        expect(screen.queryByRole('button', { name: 'Keyboard shortcuts (?)' })).toBeNull();
    });

    it('nothing floats over the desktop any more', () => {
        const root = resolve(process.cwd(), 'src/components');
        expect(readFileSync(resolve(root, 'Shell/AdminShell.tsx'), 'utf8')).not.toMatch(/CommandPill/);
        expect(readFileSync(resolve(root, 'Shell/CommandPill.css'), 'utf8')).not.toMatch(/position:\s*fixed/);
        expect(readFileSync(resolve(root, 'Sidebar/Sidebar.tsx'), 'utf8')).toMatch(/<SpacesSwitcher compact=\{iconOnly\} trailing=\{<CommandPill compact=\{iconOnly\} \/>\} \/>/);
    });
});
