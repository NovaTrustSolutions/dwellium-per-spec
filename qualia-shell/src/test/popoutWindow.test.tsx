/**
 * popoutWindow.test.tsx — tear-off tabs / pop-out windows.
 *
 * Covers the shared `openWidgetPopout` helper (registry validation, features
 * string from registry mins, unique window names, blocked-popup honesty) and
 * PopupShell hardening (document title from the registry label, honest
 * unknown-widget error state, chrome-free fill layout).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

function makeWidget(label: string, className: string) {
    return function MockWidget() {
        return <div className={className}>{label} content</div>;
    };
}

vi.mock('../registry/widgetRegistry', () => ({
    WIDGET_REGISTRY: {
        alpha: { id: 'alpha', label: 'Alpha', icon: 'layout-grid', minWidth: 720, minHeight: 460 },
        tiny: { id: 'tiny', label: 'Tiny', icon: 'layout-grid' },
    },
    WINDOW_COMPONENTS: {},
}));

vi.mock('../components/Shell/Desktop', () => ({
    WINDOW_COMPONENTS: {
        alpha: makeWidget('Alpha', 'alpha-widget'),
    },
}));

vi.mock('../context/LayoutContext', () => ({
    LayoutProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../context/HierarchyContext', () => ({
    HierarchyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../context/WindowContext', () => ({
    WindowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { openWidgetPopout, buildPopoutFeatures } from '../lib/popoutWindow';
import { PopupShell } from '../components/PopupShell/PopupShell';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('openWidgetPopout', () => {
    it('rejects ids that are not in the widget registry without opening anything', () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        expect(openWidgetPopout('nope')).toBe(false);
        expect(openSpy).not.toHaveBeenCalled();
    });

    it('opens /?popup=<id> with a features string honoring registry mins', () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        expect(openWidgetPopout('alpha')).toBe(true);
        expect(openSpy).toHaveBeenCalledTimes(1);
        const [url, name, features] = openSpy.mock.calls[0] as [string, string, string];
        expect(url).toBe('/?popup=alpha');
        expect(name).toMatch(/^dwellium-popout-alpha-/);
        const width = Number(/width=(\d+)/.exec(features)![1]);
        const height = Number(/height=(\d+)/.exec(features)![1]);
        expect(width).toBeGreaterThanOrEqual(720);
        expect(height).toBeGreaterThanOrEqual(460);
        expect(features).toContain('resizable=yes');
    });

    it('falls back to sane default sizes when the registry entry has no mins', () => {
        const features = buildPopoutFeatures('tiny');
        expect(Number(/width=(\d+)/.exec(features)![1])).toBeGreaterThanOrEqual(640);
        expect(Number(/height=(\d+)/.exec(features)![1])).toBeGreaterThanOrEqual(480);
    });

    it('stores popup titlebar metadata for PopupShell to read', () => {
        vi.spyOn(window, 'open').mockReturnValue({} as Window);
        openWidgetPopout('alpha', { title: 'My Alpha', icon: 'sparkles' });
        const meta = JSON.parse(localStorage.getItem('dwellium-popup-alpha')!);
        expect(meta.title).toBe('My Alpha');
        expect(meta.icon).toBe('sparkles');
    });

    it('uses a unique window name per call so the same widget can pop out twice', () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
        openWidgetPopout('alpha');
        openWidgetPopout('alpha');
        const [, name1] = openSpy.mock.calls[0];
        const [, name2] = openSpy.mock.calls[1];
        expect(name1).not.toBe(name2);
    });

    it('returns false honestly when the popup blocker refuses window.open', () => {
        vi.spyOn(window, 'open').mockReturnValue(null);
        expect(openWidgetPopout('alpha')).toBe(false);
    });
});

describe('PopupShell', () => {
    it('renders an honest error state for an unknown component id — not a blank screen', () => {
        render(<PopupShell component="does-not-exist" />);
        expect(screen.getByText(/Unknown widget/)).toBeInTheDocument();
        expect(screen.getByText('does-not-exist')).toBeInTheDocument();
    });

    it('renders the widget in a chrome-free fill layout with the registry label as document title', async () => {
        render(<PopupShell component="alpha" />);
        expect(await screen.findByText('Alpha content')).toBeInTheDocument();
        // Minimal popup chrome: standalone marker + labelled dock-back control.
        expect(screen.getByText('Standalone window')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Dock Back/i })).toBeInTheDocument();
        expect(document.title).toBe('Alpha — Qualia');
    });

    it('prefers the stored popout title over the registry label', async () => {
        localStorage.setItem('dwellium-popup-alpha', JSON.stringify({ title: 'Alpha (torn off)', icon: '' }));
        render(<PopupShell component="alpha" />);
        expect(await screen.findByText('Alpha content')).toBeInTheDocument();
        expect(document.title).toBe('Alpha (torn off) — Qualia');
    });
});
