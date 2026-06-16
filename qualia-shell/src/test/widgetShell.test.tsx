/**
 * WidgetShell + WidgetErrorBoundary + widgetEnhancementsStore — the Widget
 * Enhancement Layer (assessment sweep 2026-06-12, C3 + C4). All 48 widgets
 * inherit this through Window.tsx's content slot.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WidgetShell, { enhancementClasses } from '../components/Window/WidgetShell';
import WidgetErrorBoundary from '../components/Window/WidgetErrorBoundary';
import {
    widgetEnhancementsStore,
    DEFAULT_ENHANCEMENT_FLAGS,
} from '../lib/widgetEnhancementsStore';

function Boom(): never {
    throw new Error('kaboom');
}

describe('widgetEnhancementsStore', () => {
    beforeEach(() => widgetEnhancementsStore.reset());

    it('defaults: safe (behavior-changing flags OFF, everything else ON)', () => {
        const f = widgetEnhancementsStore.getSnapshot();
        expect(f.escapeToClose).toBe(false);
        expect(f.autoFocusOnOpen).toBe(false);
        expect(f.errorBoundary).toBe(true);
        expect(f.uiFocusRings).toBe(true);
        expect(f).toEqual(DEFAULT_ENHANCEMENT_FLAGS);
    });

    it('set + reset round-trips one flag', () => {
        widgetEnhancementsStore.set('errorBoundary', false);
        expect(widgetEnhancementsStore.getSnapshot().errorBoundary).toBe(false);
        widgetEnhancementsStore.reset();
        expect(widgetEnhancementsStore.getSnapshot().errorBoundary).toBe(true);
    });
});

describe('WidgetErrorBoundary', () => {
    beforeEach(() => {
        widgetEnhancementsStore.reset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('catches a widget crash and shows a retry card (desktop survives)', () => {
        render(
            <WidgetErrorBoundary widgetLabel="Test Widget" enabled surfaceErrors>
                <Boom />
            </WidgetErrorBoundary>,
        );
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.getByText(/Test Widget hit an error/)).toBeTruthy();
        expect(screen.getByText(/kaboom/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    });

    it('passes children through untouched when disabled (reversibility)', () => {
        render(
            <WidgetErrorBoundary widgetLabel="X" enabled={false} surfaceErrors>
                <div>healthy content</div>
            </WidgetErrorBoundary>,
        );
        expect(screen.getByText('healthy content')).toBeTruthy();
    });

    it('hides the error detail line when surfaceErrors is off', () => {
        render(
            <WidgetErrorBoundary widgetLabel="X" enabled surfaceErrors={false}>
                <Boom />
            </WidgetErrorBoundary>,
        );
        expect(screen.queryByText(/kaboom/)).toBeNull();
    });
});

describe('WidgetShell', () => {
    beforeEach(() => widgetEnhancementsStore.reset());

    it('ZERO-DOM contract: renders the widget with NO wrapper element', () => {
        // The widget root must remain the DIRECT child of whatever hosts
        // WidgetShell — 23 `.window__content > X` selectors in global.css +
        // the `:has(>)` flex contracts in Window.css depend on it. The
        // original wrapper div collapsed every widget root to 0 height.
        const { container } = render(
            <WidgetShell widgetId="test" widgetLabel="Test">
                <div className="fake-widget-root">hello widget</div>
            </WidgetShell>,
        );
        expect(screen.getByText('hello widget')).toBeTruthy();
        // Direct child of the render container — nothing in between.
        expect(container.firstElementChild?.className).toBe('fake-widget-root');
        expect(container.querySelector('.widget-shell')).toBeNull();
        expect(container.querySelector('.widget-error__ok')).toBeNull();
    });

    it('enhancementClasses applies UI-layer classes by default and drops them when flags turn off (reversible)', () => {
        const on = enhancementClasses(widgetEnhancementsStore.getSnapshot());
        expect(on).toContain('we-focus-rings');
        expect(on).toContain('we-scrollbars');

        widgetEnhancementsStore.set('uiFocusRings', false);
        const off = enhancementClasses(widgetEnhancementsStore.getSnapshot());
        expect(off).not.toContain('we-focus-rings');
        expect(off).toContain('we-scrollbars');
    });

    it('escape-to-close fires only when enabled + focused', () => {
        const onClose = vi.fn();
        // default OFF → no close
        const { rerender } = render(
            <WidgetShell widgetId="t" widgetLabel="T" isFocused onRequestClose={onClose}>
                <div>x</div>
            </WidgetShell>,
        );
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();

        widgetEnhancementsStore.set('escapeToClose', true);
        rerender(
            <WidgetShell widgetId="t" widgetLabel="T" isFocused onRequestClose={onClose}>
                <div>x</div>
            </WidgetShell>,
        );
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
