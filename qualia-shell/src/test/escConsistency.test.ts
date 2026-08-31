/**
 * Plan 055 phase 5 — Esc consistency.
 *
 * Esc dismisses transient chrome (⌘K, sheets, menus, the Cockpit) and NEVER
 * closes a window. The old Desktop handler closed the topmost window on any
 * stray Esc — sister suite to noUnsavedPrompts.test.ts, greps the source so
 * the behavior can't quietly come back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Esc consistency (055-p5)', () => {
    const desktop = readFileSync(join(SRC, 'components/Shell/Desktop.tsx'), 'utf8');

    it('Desktop no longer closes the top window on Escape', () => {
        // The old handler paired an Escape check with closeWindow(topMost.id).
        expect(desktop).not.toMatch(/Escape[\s\S]{0,600}closeWindow\(topMost/);
    });

    it('Desktop Escape dismisses the transient chrome instead', () => {
        const esc = desktop.match(/handleEsc[\s\S]{0,700}/)?.[0] ?? '';
        expect(esc).toContain('setContextMenu(null)');
        expect(esc).toContain('setIsLayoutMenuOpen(false)');
        expect(esc).toContain('setIsGroupPanelOpen(false)');
    });

    it('⌘W (not Esc) remains the close-window shortcut in AdminShell', () => {
        const shell = readFileSync(join(SRC, 'components/Shell/AdminShell.tsx'), 'utf8');
        expect(shell).toMatch(/e\.key === 'w'[\s\S]{0,300}closeWindow/);
    });

    it('the Cockpit keeps its Escape-to-leave behavior', () => {
        const fos = readFileSync(join(SRC, 'components/Shell/FluidOS.tsx'), 'utf8');
        expect(fos).toMatch(/Escape[\s\S]{0,400}setOpen\(false\)/);
    });
});
