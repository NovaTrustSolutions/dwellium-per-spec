/**
 * Cycle 3 — ARAConsole cross-widget linkage (LINKAGE gaps A2 + A3).
 *
 * Unit-tests the pure helpers in `araLinkage.ts` with injected side effects / direct
 * input, so no live ARA backend or rendered widget is needed (mirrors
 * Workspace.scribe.test.ts). Covers:
 *   A2 — detectWidgetHandoffs (keyword → handoff, dedupe, cap, empty-safe)
 *      — openWidgetHandoff (injected dep + default `dwellium:open-widget` bus)
 *   A3 — composeAraPrompt (preface blockquote / bare text / empty → null)
 */
import { describe, it, expect, vi } from 'vitest';
import {
    detectWidgetHandoffs,
    openWidgetHandoff,
    composeAraPrompt,
    ARA_HANDOFF_CATALOG,
    MAX_HANDOFFS,
    type OpenWidgetDeps,
} from '../components/ARAConsole/araLinkage';

describe('araLinkage — A2 detectWidgetHandoffs', () => {
    it('detects the inbox handoff from an ARA reply mentioning the inbox', () => {
        const out = detectWidgetHandoffs('You have 4 unread emails — check your Inbox.');
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({ widgetId: 'inbox', label: 'Inbox Zero', icon: 'mail-open' });
    });

    it('targets the LIVE `inbox` id, never the deprecated `inbox-zero`', () => {
        const ids = ARA_HANDOFF_CATALOG.map((r) => r.widgetId);
        expect(ids).toContain('inbox');
        expect(ids).not.toContain('inbox-zero');
    });

    it('detects multiple distinct widgets, in catalog order', () => {
        const out = detectWidgetHandoffs('I drafted notes in Scribe about the file manager and your inbox.');
        expect(out.map((h) => h.widgetId)).toEqual(['inbox', 'file-manager', 'scribe']);
    });

    it('dedupes repeated references to the same widget', () => {
        const out = detectWidgetHandoffs('Inbox, inbox, and more inbox — your unread email pile.');
        expect(out).toHaveLength(1);
        expect(out[0].widgetId).toBe('inbox');
    });

    it('caps the number of handoffs at MAX_HANDOFFS', () => {
        const out = detectWidgetHandoffs('Inbox, file manager, doc viewer, scribe, and Stella all apply.');
        expect(out.length).toBe(MAX_HANDOFFS);
        expect(MAX_HANDOFFS).toBe(3);
    });

    it('uses word boundaries so substrings do not false-positive', () => {
        // "scribed" must NOT match the "scribe" keyword.
        expect(detectWidgetHandoffs('The clerk scribed the minutes.')).toEqual([]);
    });

    it('is empty-safe for null / whitespace input', () => {
        expect(detectWidgetHandoffs(null)).toEqual([]);
        expect(detectWidgetHandoffs(undefined)).toEqual([]);
        expect(detectWidgetHandoffs('   ')).toEqual([]);
    });
});

describe('araLinkage — A2 openWidgetHandoff', () => {
    it('calls an injected openWidget with id/label/icon', () => {
        const openWidget = vi.fn();
        const deps: OpenWidgetDeps = { openWidget };
        openWidgetHandoff({ widgetId: 'inbox', label: 'Inbox Zero', icon: 'mail-open' }, deps);
        expect(openWidget).toHaveBeenCalledTimes(1);
        expect(openWidget).toHaveBeenCalledWith('inbox', 'Inbox Zero', 'mail-open');
    });

    it('defaults to firing the dwellium:open-widget intent bus', () => {
        const handler = vi.fn();
        window.addEventListener('dwellium:open-widget', handler);
        try {
            openWidgetHandoff({ widgetId: 'file-manager', label: 'Files', icon: 'folder-open' });
            expect(handler).toHaveBeenCalledTimes(1);
            const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
            expect(detail).toEqual({ widgetId: 'file-manager', label: 'Files', icon: 'folder-open' });
        } finally {
            window.removeEventListener('dwellium:open-widget', handler);
        }
    });
});

describe('araLinkage — A3 composeAraPrompt', () => {
    it('blockquotes the selection under the preface (mirrors AraMiniPanel)', () => {
        const out = composeAraPrompt({ text: 'line one\nline two', preface: 'Please review:' });
        expect(out).toBe('Please review:\n\n> line one\n> line two');
    });

    it('returns bare text when there is no preface', () => {
        expect(composeAraPrompt({ text: 'just this' })).toBe('just this');
    });

    it('returns null for empty / missing text so the listener can no-op', () => {
        expect(composeAraPrompt({ text: '' })).toBeNull();
        expect(composeAraPrompt({ text: '   ', preface: 'x' })).toBeNull();
        expect(composeAraPrompt(null)).toBeNull();
        expect(composeAraPrompt(undefined)).toBeNull();
    });
});
