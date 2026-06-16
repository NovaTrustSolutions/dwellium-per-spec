/**
 * Cycle 5 — Stella cross-widget linkage (LINKAGE gap S2). PROTECTED widget: additive
 * linkage only, no restyle.
 *
 * Unit-tests the pure helpers in `stellaLinkage.ts` with injected side effects / direct
 * input, so no live Stella backend or rendered widget is needed (mirrors
 * ARAConsole.linkage.test.ts + Workspace.scribe.test.ts). Covers:
 *   detectWidgetHandoffs (keyword → handoff, dedupe, cap, word-boundary, empty-safe)
 *   openWidgetHandoff (injected dep + default `dwellium:open-widget` bus)
 */
import { describe, it, expect, vi } from 'vitest';
import {
    detectWidgetHandoffs,
    openWidgetHandoff,
    STELLA_HANDOFF_CATALOG,
    MAX_HANDOFFS,
    type OpenWidgetDeps,
} from '../components/StellaAgent/stellaLinkage';

describe('stellaLinkage — detectWidgetHandoffs', () => {
    it('detects the inbox handoff from a Stella reply mentioning the inbox', () => {
        const out = detectWidgetHandoffs('You have 4 unread emails — check your Inbox.');
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({ widgetId: 'inbox', label: 'Inbox Zero', icon: 'mail-open' });
    });

    it('targets the LIVE `inbox` id, never the deprecated `inbox-zero`', () => {
        const ids = STELLA_HANDOFF_CATALOG.map((r) => r.widgetId);
        expect(ids).toContain('inbox');
        expect(ids).not.toContain('inbox-zero');
    });

    it('can hand off to its sibling assistant ARA (ara-console, not self)', () => {
        const ids = STELLA_HANDOFF_CATALOG.map((r) => r.widgetId);
        expect(ids).toContain('ara-console');
        expect(ids).not.toContain('stella-agent');
        const out = detectWidgetHandoffs('For deep account context, ask ARA.');
        expect(out.map((h) => h.widgetId)).toContain('ara-console');
    });

    it('detects multiple distinct widgets, in catalog order, capped at MAX_HANDOFFS', () => {
        const out = detectWidgetHandoffs('I drafted notes in Scribe about the file manager and your inbox.');
        expect(out.map((h) => h.widgetId)).toEqual(['inbox', 'file-manager', 'scribe']);
        expect(out.length).toBeLessThanOrEqual(MAX_HANDOFFS);
        expect(MAX_HANDOFFS).toBe(3);
    });

    it('dedupes repeated references to the same widget', () => {
        const out = detectWidgetHandoffs('Inbox, inbox, and more inbox — your unread email pile.');
        expect(out).toHaveLength(1);
        expect(out[0].widgetId).toBe('inbox');
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

describe('stellaLinkage — openWidgetHandoff', () => {
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
            openWidgetHandoff({ widgetId: 'ara-console', label: 'ARA', icon: 'bot' });
            expect(handler).toHaveBeenCalledTimes(1);
            const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
            expect(detail).toEqual({ widgetId: 'ara-console', label: 'ARA', icon: 'bot' });
        } finally {
            window.removeEventListener('dwellium:open-widget', handler);
        }
    });
});
