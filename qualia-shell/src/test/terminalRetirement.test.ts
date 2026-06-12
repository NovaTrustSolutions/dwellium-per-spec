/**
 * Terminal retirement — 2026-06-12 (Ilya): "disable the Terminal and all its
 * tabs for now... make terminal a hidden feature."
 *
 * Hidden surfaces: sidebar launcher (hiddenWidgetsStore), ⌘K widget rows
 * (CommandPalette filters the same store), Build space (default + saved-copy
 * migration). Deliberate doors kept: dwelliumCommands "open terminal" alias
 * + the sidebar "+ Add widget" gallery unhide.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { hiddenWidgetsStore, hideTerminalOnce, unhideWidget } from '../lib/hiddenWidgetsStore';
import { DEFAULT_SPACES, spacesStore } from '../lib/spacesStore';
import { parseCommand } from '../lib/dwelliumCommands';

beforeEach(() => {
    try { localStorage.clear(); } catch { /* */ }
    hiddenWidgetsStore.reset();
    spacesStore.reset();
});

describe('hideTerminalOnce', () => {
    it('adds terminal to the hidden list and is one-shot', () => {
        hideTerminalOnce();
        expect(hiddenWidgetsStore.getSnapshot()).toContain('terminal');
        // User deliberately un-hides → the one-shot flag must NOT re-hide.
        unhideWidget('terminal');
        hideTerminalOnce();
        expect(hiddenWidgetsStore.getSnapshot()).not.toContain('terminal');
    });
});

describe('Build space', () => {
    it('default Build space no longer ships terminal', () => {
        const build = DEFAULT_SPACES.find(s => s.id === 'build');
        expect(build?.widgets).not.toContain('terminal');
        expect(build?.widgets).toContain('automation-hub');
    });

    it('saved BUILTIN spaces are migrated; user-created spaces untouched', () => {
        localStorage.setItem('dwellium-spaces', JSON.stringify([
            { id: 'build', name: 'Build', icon: 'wrench', widgets: ['terminal', 'automation-hub'], builtin: true },
            { id: 'mine', name: 'My Hacking', icon: 'zap', widgets: ['terminal', 'notepad'] },
        ]));
        spacesStore.reset(); // silent cache reset → next read goes through deserialize
        const spaces = spacesStore.getSnapshot();
        const build = spaces.find(s => s.id === 'build');
        const mine = spaces.find(s => s.id === 'mine');
        expect(build?.widgets).not.toContain('terminal');
        expect(mine?.widgets).toContain('terminal');
    });
});

describe('the hidden door stays open', () => {
    it('"open terminal" still parses as a direct command (ARA/⌘K command tier)', () => {
        const cmd = parseCommand('open terminal');
        expect(cmd).not.toBeNull();
        expect(cmd!.label.toLowerCase()).toContain('terminal');
    });
});
