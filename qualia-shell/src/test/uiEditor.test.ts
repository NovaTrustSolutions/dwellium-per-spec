/**
 * Natural-language UI editor — 2026-06-12 (Ilya): "change the header color
 * to yellow" / "move the text container from left corner to right corner".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parseUiEdit, pickedElementHolder, resolveTarget } from '../lib/uiEditParser';
import {
    uiEditStore,
    uiEditsUserIdHolder,
    addUiEdit,
    toggleUiEdit,
    removeUiEdit,
    undoLastUiEdit,
    clearUiEdits,
    resetUiEdits,
    buildCssText,
    sanitizeCss,
    isSafeDeclaration,
} from '../lib/uiEditStore';

beforeEach(() => {
    uiEditsUserIdHolder.current = 'test-user';
    pickedElementHolder.current = null;
    try { localStorage.clear(); } catch { /* */ }
    resetUiEdits();
});

describe('parseUiEdit — Ilya\'s exact phrasings', () => {
    it('"change the header color to yellow" → titlebar background', () => {
        const op = parseUiEdit('change the header color to yellow');
        expect(op).toMatchObject({
            selector: '.window__titlebar',
            css: { 'background-color': '#facc15' },
        });
    });

    it('"move the text container from left corner to right corner" → margin-auto right', () => {
        const op = parseUiEdit('move the text container from left corner to right corner');
        expect(op).toMatchObject({
            selector: '.window-app',
            css: { 'margin-left': 'auto', 'margin-right': '0' },
        });
    });
});

describe('parseUiEdit — vocabulary breadth', () => {
    it('text color vs background color', () => {
        expect(parseUiEdit('make the sidebar text color red')?.css).toEqual({ color: '#ef4444' });
        expect(parseUiEdit('turn the dock purple')?.css).toEqual({ 'background-color': '#a855f7' });
    });

    it('hex colors pass through', () => {
        expect(parseUiEdit('set the desktop color to #112233')?.css).toEqual({ 'background-color': '#112233' });
    });

    it('hide / show / bigger / rounded', () => {
        expect(parseUiEdit('hide the dock')?.css).toEqual({ display: 'none' });
        expect(parseUiEdit('show the dock')?.css).toEqual({ display: 'revert' });
        expect(parseUiEdit('bigger text in the sidebar')?.css).toEqual({ 'font-size': '1.15em' });
        expect(parseUiEdit('round the corners of the windows')?.css).toEqual({ 'border-radius': '12px' });
    });

    it('picked element wins when no named target is in the utterance', () => {
        pickedElementHolder.current = { selector: '.some-button', label: 'button.some-button' };
        const op = parseUiEdit('make it yellow');
        expect(op?.selector).toBe('.some-button');
    });

    it('no target + nothing picked → null (never guesses)', () => {
        expect(parseUiEdit('make the flibbertigibbet yellow')).toBeNull();
        expect(resolveTarget('nothing here')).toBeNull();
    });
});

describe('sanitization boundary', () => {
    it('blocks non-whitelisted properties and dangerous values', () => {
        expect(isSafeDeclaration('behavior', 'url(evil)')).toBe(false);
        expect(isSafeDeclaration('background', 'url(http://evil)')).toBe(false);
        expect(isSafeDeclaration('color', 'red; } body { display:none')).toBe(false);
        expect(sanitizeCss({ position: 'fixed', color: 'red' })).toEqual({ color: 'red' });
        expect(sanitizeCss({ position: 'fixed' })).toBeNull();
    });
});

describe('uiEditStore lifecycle', () => {
    it('add → css text → toggle off → undo → clear', () => {
        const e1 = addUiEdit({ selector: '.window__titlebar', label: 'Headers', css: { 'background-color': '#facc15' }, instruction: 'header yellow' });
        expect(e1).not.toBeNull();
        expect(buildCssText(uiEditStore.getSnapshot())).toContain('.window__titlebar {');
        expect(buildCssText(uiEditStore.getSnapshot())).toContain('background-color: #facc15 !important;');

        toggleUiEdit(e1!.id);
        expect(buildCssText(uiEditStore.getSnapshot())).toBe('');

        const e2 = addUiEdit({ selector: '.sidebar', label: 'Sidebar', css: { color: 'red' }, instruction: 'sidebar red' });
        expect(undoLastUiEdit()?.id).toBe(e2!.id);
        expect(uiEditStore.getSnapshot()).toHaveLength(1);

        removeUiEdit(e1!.id);
        expect(uiEditStore.getSnapshot()).toHaveLength(0);

        addUiEdit({ selector: '.dock', label: 'Dock', css: { opacity: '0.6' }, instruction: 'dock translucent' });
        clearUiEdits();
        expect(uiEditStore.getSnapshot()).toHaveLength(0);
    });

    it('rejects edits where nothing safe survives', () => {
        expect(addUiEdit({ selector: '.x', label: 'x', css: { position: 'fixed' }, instruction: 'evil' })).toBeNull();
    });
});
