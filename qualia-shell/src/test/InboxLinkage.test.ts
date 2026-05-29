/**
 * Cycle 7 — Inbox Zero cross-widget linkage (LINKAGE gaps I2 + I3).
 *
 * Unit-tests the pure helpers in `inboxLinkage.ts` with injected side effects / direct
 * input, so no live inbox backend or rendered SmartActions widget is needed (mirrors
 * ARAConsole.linkage.test.ts + StellaLinkage.test.ts + Workspace.scribe.test.ts). Covers:
 *   getDraftHandoffs (draft → targets, empty/whitespace-safe, immutability, LIVE ids)
 *   openWidgetHandoff (injected dep + default `dwellium:open-widget` bus)
 */
import { describe, it, expect, vi } from 'vitest';
import {
    getDraftHandoffs,
    openWidgetHandoff,
    DRAFT_HANDOFF_TARGETS,
    type OpenWidgetDeps,
} from '../components/InboxZero/inboxLinkage';

describe('inboxLinkage — getDraftHandoffs', () => {
    it('returns the assistant/editor targets for a generated draft', () => {
        const out = getDraftHandoffs({ subject: 'Re: lease', body: 'Hello, thanks for...' });
        expect(out.map((h) => h.widgetId)).toEqual(['scribe', 'ara-console', 'stella-agent']);
    });

    it('targets LIVE (non-deprecated) registry ids only', () => {
        const ids = DRAFT_HANDOFF_TARGETS.map((t) => t.widgetId);
        // verified against widgetRegistry.ts: scribe (265), ara-console (157), stella-agent (166)
        expect(ids).toEqual(['scribe', 'ara-console', 'stella-agent']);
        expect(ids).not.toContain('inbox-zero');
    });

    it('yields no handoffs when there is no usable draft body', () => {
        expect(getDraftHandoffs(null)).toEqual([]);
        expect(getDraftHandoffs(undefined)).toEqual([]);
        expect(getDraftHandoffs({ subject: 'no body' })).toEqual([]);
        expect(getDraftHandoffs({ body: '' })).toEqual([]);
        expect(getDraftHandoffs({ body: '   ' })).toEqual([]);
    });

    it('returns fresh copies so callers cannot mutate the shared catalog', () => {
        const out = getDraftHandoffs({ body: 'x' });
        out[0].label = 'mutated';
        expect(DRAFT_HANDOFF_TARGETS[0].label).toBe('Edit in Scribe');
    });
});

describe('inboxLinkage — openWidgetHandoff', () => {
    it('calls an injected openWidget with id/label/icon', () => {
        const openWidget = vi.fn();
        const deps: OpenWidgetDeps = { openWidget };
        openWidgetHandoff({ widgetId: 'scribe', label: 'Edit in Scribe', icon: 'pen-tool' }, deps);
        expect(openWidget).toHaveBeenCalledTimes(1);
        expect(openWidget).toHaveBeenCalledWith('scribe', 'Edit in Scribe', 'pen-tool');
    });

    it('defaults to firing the dwellium:open-widget intent bus', () => {
        const handler = vi.fn();
        window.addEventListener('dwellium:open-widget', handler);
        try {
            openWidgetHandoff({ widgetId: 'ara-console', label: 'Refine with ARA', icon: 'brain-circuit' });
            expect(handler).toHaveBeenCalledTimes(1);
            const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
            expect(detail).toEqual({ widgetId: 'ara-console', label: 'Refine with ARA', icon: 'brain-circuit' });
        } finally {
            window.removeEventListener('dwellium:open-widget', handler);
        }
    });
});
