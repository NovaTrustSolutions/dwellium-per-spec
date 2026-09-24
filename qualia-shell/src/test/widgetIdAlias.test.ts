/**
 * Plan 066 phase 3 — retire the 'inbox-zero' registry alias.
 *
 * 'inbox-zero' was a second WIDGET_REGISTRY entry for the same 'inbox'
 * widget, kept only so old saved layouts/sessions kept opening. It is now
 * gone from the registry; resolveWidgetId maps the retired id to the live
 * one at every read site instead (sessionRestoreStore, WindowContext, the
 * Shell lookup sites — covered by their own tests).
 */
import { describe, it, expect } from 'vitest';
import { WIDGET_REGISTRY, resolveWidgetId } from '../registry/widgetRegistry';

describe('resolveWidgetId', () => {
    it('maps the retired inbox-zero id to the live inbox id', () => {
        expect(resolveWidgetId('inbox-zero')).toBe('inbox');
    });

    it('is the identity for a live id (no-op)', () => {
        expect(resolveWidgetId('tasks')).toBe('tasks');
    });

    it('is the identity for an unknown id (never throws, never invents one)', () => {
        expect(resolveWidgetId('some-widget-that-never-existed')).toBe('some-widget-that-never-existed');
    });

    it('never returns an Object.prototype member for an id that shadows one', () => {
        expect(resolveWidgetId('constructor')).toBe('constructor');
        expect(resolveWidgetId('toString')).toBe('toString');
    });

    it('inbox-zero is gone from the registry; its resolved id is present', () => {
        expect(WIDGET_REGISTRY['inbox-zero']).toBeUndefined();
        expect(WIDGET_REGISTRY[resolveWidgetId('inbox-zero')]).toBeDefined();
    });
});
