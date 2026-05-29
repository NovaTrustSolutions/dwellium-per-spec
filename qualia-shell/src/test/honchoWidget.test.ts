/**
 * Cycle 6 — Honcho standalone widget registration integrity (Scribe-ingestion arc).
 *
 * Honcho is promoted out of Stella's inline `honcho` tab into its own registered widget
 * that renders the SHARED HonchoHermesPanel. This is a ZERO-Stella-touch promotion — Stella
 * keeps its own inline honcho/hermes code, so both surfaces coexist.
 *
 * These tests assert the wiring (registry entry + auto-derived component map + pinned dock
 * entry in AI Tools) WITHOUT rendering the panel — HonchoHermesPanel needs UserProvider +
 * a live backend, which a registration-integrity check doesn't require (mirrors the linkage
 * test style: StellaLinkage / ARAConsole.linkage). Cycle 8 layers always-on/abilities;
 * Cycle 7 layers the markdown arrange/filter view.
 */
import { describe, it, expect } from 'vitest';
import {
    WIDGET_REGISTRY,
    WINDOW_COMPONENTS,
    getWidgetMeta,
    getWidgetsByCategory,
} from '../registry/widgetRegistry';
import { defaultDockItems } from '../data/hierarchy';

describe('Honcho standalone widget — registry', () => {
    it('registers a `honcho` widget with AI-category metadata', () => {
        const meta = getWidgetMeta('honcho');
        expect(meta).toBeDefined();
        expect(meta!.id).toBe('honcho');
        expect(meta!.label).toBe('Honcho');
        expect(meta!.icon).toBe('brain-circuit');
        expect(meta!.category).toBe('ai');
    });

    it('exposes a lazy component (auto-derived into WINDOW_COMPONENTS)', () => {
        // lazyWithReload wraps React.lazy → object with a $$typeof lazy marker.
        expect(WIDGET_REGISTRY.honcho.component).toBeTypeOf('object');
        expect(WINDOW_COMPONENTS.honcho).toBe(WIDGET_REGISTRY.honcho.component);
    });

    it('is listed among the AI-category widgets', () => {
        const ids = getWidgetsByCategory('ai').map((w) => w.id);
        expect(ids).toContain('honcho');
    });

    it('does NOT collide with or replace the protected Stella widget', () => {
        // Zero-Stella-touch promotion: stella-agent stays registered + distinct.
        expect(getWidgetMeta('stella-agent')).toBeDefined();
        expect(WIDGET_REGISTRY.honcho.component).not.toBe(WIDGET_REGISTRY['stella-agent'].component);
    });
});

describe('Honcho standalone widget — dock', () => {
    it('adds a pinned `dock-honcho` entry in the AI Tools group pointing at the `honcho` widget', () => {
        const dock = defaultDockItems.find((d) => d.id === 'dock-honcho');
        expect(dock).toBeDefined();
        expect(dock!.component).toBe('honcho');
        expect(dock!.group).toBe('AI Tools');
        expect(dock!.pinned).toBe(true);
        expect(dock!.label).toBe('Honcho');
    });

    it('the dock-honcho component id resolves to the registered honcho widget', () => {
        const dock = defaultDockItems.find((d) => d.id === 'dock-honcho')!;
        expect(WIDGET_REGISTRY[dock.component]).toBe(WIDGET_REGISTRY.honcho);
    });
});
