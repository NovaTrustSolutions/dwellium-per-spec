/**
 * AppFlowy widget (plan 047 phase 3 / plan 053 — AppFlowy Workspace).
 *
 * Hosting facts under test (curl-verified 2026-08-23): the hosted web client
 * https://appflowy.com/app sends no X-Frame-Options → embeds; the marketing
 * root https://appflowy.com sends X-Frame-Options: SAMEORIGIN → launcher only.
 *
 * Env unset → "Connect AppFlowy" card (free plan + self-host paths, opens the
 * Tools hub); env set + non-embeddable target → "Open AppFlowy ↗" launcher;
 * env set + embeddable + ping ok → iframe; ping fails → retry card — never a
 * blank iframe (gate G2). Plus: registry entry, Tools-hub row flip, guide §6.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AppFlowy, { APPFLOWY_HOSTED_APP, appflowyEmbeddable } from '../components/AppFlowy/AppFlowy';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { TOOLS, resolveToolStatus } from '../data/toolsHub';
import { GETTING_STARTED_MD } from '../content/guides/gettingStarted';

const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));

beforeEach(() => {
    opened.length = 0;
    window.addEventListener('dwellium:open-widget', onOpen);
});
afterEach(() => {
    window.removeEventListener('dwellium:open-widget', onOpen);
    vi.unstubAllGlobals();
});

describe('appflowyEmbeddable', () => {
    it('hosted web client /app embeds; the marketing root and appflowy.io do not; self-hosts do; garbage does not', () => {
        expect(appflowyEmbeddable(APPFLOWY_HOSTED_APP)).toBe(true);
        expect(appflowyEmbeddable('https://appflowy.com/app/some-workspace')).toBe(true);
        expect(appflowyEmbeddable('https://www.appflowy.com/app')).toBe(true);
        expect(appflowyEmbeddable('https://appflowy.com')).toBe(false); // X-Frame-Options: SAMEORIGIN
        expect(appflowyEmbeddable('https://appflowy.io/pricing')).toBe(false);
        expect(appflowyEmbeddable('https://flowy.dwellium.com')).toBe(true); // self-host: nginx sets frame-ancestors
        expect(appflowyEmbeddable('not a url')).toBe(false);
    });
});

describe('registry + Tools hub row', () => {
    it('is registered as "appflowy"; the row is needs-setup without env and flips to ready with VITE_APPFLOWY_URL (no code change)', () => {
        expect(WIDGET_REGISTRY['appflowy']).toBeDefined();
        expect(WIDGET_REGISTRY['appflowy'].label).toBe('AppFlowy Workspace');
        const tool = TOOLS.find(t => t.id === 'appflowy')!;
        expect(tool.envVar).toBe('VITE_APPFLOWY_URL');
        expect(resolveToolStatus(tool, id => !!WIDGET_REGISTRY[id], {})).toBe('needs-setup');
        expect(resolveToolStatus(tool, id => !!WIDGET_REGISTRY[id], { VITE_APPFLOWY_URL: APPFLOWY_HOSTED_APP })).toBe('ready');
    });
    it('guide §6 lists AppFlowy as a set-up row, not coming soon', () => {
        expect(GETTING_STARTED_MD).not.toMatch(/Coming soon[^\n]*AppFlowy/);
        expect(GETTING_STARTED_MD).toMatch(/AppFlowy Workspace[^\n]*VITE_APPFLOWY_URL/);
    });
});

describe('AppFlowy widget', () => {
    it('no VITE_APPFLOWY_URL → "Connect AppFlowy" card with both hosted and self-host paths; button opens the Tools hub', () => {
        render(<AppFlowy env={{}} />);
        expect(screen.getByText('Connect AppFlowy')).toBeInTheDocument();
        expect(screen.getByText(/free\s+plan gives 1 collaborative workspace/)).toBeInTheDocument();
        expect(screen.getByText(/tools\/appflowy\/README\.md/)).toBeInTheDocument();
        expect(screen.getByText(new RegExp(`VITE_APPFLOWY_URL=${APPFLOWY_HOSTED_APP}`))).toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Open Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
    });

    it('env points at a frame-refusing address → launcher card with "Open AppFlowy ↗", no iframe', () => {
        render(<AppFlowy env={{ VITE_APPFLOWY_URL: 'https://appflowy.com' }} />);
        expect(screen.getByText('AppFlowy opens in a new tab')).toBeInTheDocument();
        const link = screen.getByRole('link', { name: /Open AppFlowy/ });
        expect(link).toHaveAttribute('href', 'https://appflowy.com');
        expect(link).toHaveAttribute('target', '_blank');
        expect(document.querySelector('iframe')).toBeNull();
    });

    it('env set + embeddable + reachable → iframe of AppFlowy Web (trailing slash trimmed) with Open ↗ in the toolbar', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({}) as Response));
        render(<AppFlowy env={{ VITE_APPFLOWY_URL: 'https://flowy.dwellium.com/' }} />);
        await waitFor(() => expect(screen.getByTitle('AppFlowy Workspace')).toBeInTheDocument());
        expect(screen.getByTitle('AppFlowy Workspace')).toHaveAttribute('src', 'https://flowy.dwellium.com');
        expect(screen.getByRole('link', { name: /Open/ })).toHaveAttribute('href', 'https://flowy.dwellium.com');
        expect(screen.queryByText('AppFlowy isn’t reachable')).toBeNull();
    });

    it('env set + ping fails → retry card, no blank iframe; Re-check recovers', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<AppFlowy env={{ VITE_APPFLOWY_URL: 'https://flowy.dwellium.com' }} />);
        await waitFor(() => expect(screen.getByText('AppFlowy isn’t reachable')).toBeInTheDocument());
        expect(screen.getByText(/tools\/appflowy\/README\.md/)).toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
        // The self-host comes back → Re-check restores the embed.
        vi.stubGlobal('fetch', vi.fn(async () => ({}) as Response));
        fireEvent.click(screen.getByRole('button', { name: 'Re-check' }));
        await waitFor(() => expect(screen.getByTitle('AppFlowy Workspace')).toBeInTheDocument());
    });
});
