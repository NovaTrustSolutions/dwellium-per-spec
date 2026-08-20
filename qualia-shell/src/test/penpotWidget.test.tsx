/**
 * Design Studio widget (plan 047 phase 2 — Penpot launcher).
 *
 * Launcher-only: design.penpot.app sends X-Frame-Options SAMEORIGIN (verified
 * 2026-08-20), so the widget is a card with "Open Penpot ↗" — free-cloud
 * default, VITE_PENPOT_URL override for the phase-3 self-host. No env gate:
 * the Tools hub row is `ready` as soon as the widget is registered.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PenpotStudio, { PENPOT_DEFAULT_URL, penpotUrl } from '../components/PenpotStudio/PenpotStudio';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { TOOLS, resolveToolStatus } from '../data/toolsHub';

describe('penpotUrl', () => {
    it('defaults to the free cloud and lets VITE_PENPOT_URL re-point it', () => {
        expect(penpotUrl({})).toBe(PENPOT_DEFAULT_URL);
        expect(PENPOT_DEFAULT_URL).toBe('https://design.penpot.app');
        expect(penpotUrl({ VITE_PENPOT_URL: ' https://design.dwellium.com ' })).toBe('https://design.dwellium.com');
    });
});

describe('PenpotStudio widget', () => {
    it('is registered as "penpot-studio" and its Tools-hub row is ready with no env', () => {
        expect(WIDGET_REGISTRY['penpot-studio']).toBeDefined();
        expect(WIDGET_REGISTRY['penpot-studio'].label).toBe('Design Studio');
        const tool = TOOLS.find(t => t.id === 'design-studio')!;
        expect(tool.envVar).toBeUndefined(); // launcher needs no setup
        expect(resolveToolStatus(tool, id => !!WIDGET_REGISTRY[id], {})).toBe('ready');
    });

    it('renders the launcher card: flyer/notice blurb + Open Penpot ↗ at the default cloud URL', () => {
        render(<PenpotStudio env={{}} />);
        expect(screen.getByText(/listing flyers/)).toBeInTheDocument();
        expect(screen.getByText(/cloud blocks embedding/)).toBeInTheDocument();
        const link = screen.getByRole('link', { name: /Open Penpot/ });
        expect(link).toHaveAttribute('href', PENPOT_DEFAULT_URL);
        expect(link).toHaveAttribute('target', '_blank');
        expect(document.querySelector('iframe')).toBeNull(); // launcher-only by design
    });

    it('VITE_PENPOT_URL re-points the launcher (phase-3 self-host)', () => {
        render(<PenpotStudio env={{ VITE_PENPOT_URL: 'https://design.dwellium.com' }} />);
        expect(screen.getByRole('link', { name: /Open Penpot/ })).toHaveAttribute('href', 'https://design.dwellium.com');
    });
});
