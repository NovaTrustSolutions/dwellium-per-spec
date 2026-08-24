/**
 * Design Studio widget (plan 053 — Penpot to 100%).
 *
 * Embeddable-URL decision: penpot.app (the cloud) sends X-Frame-Options
 * SAMEORIGIN (re-verified 2026-08-23) → launcher; a VITE_PENPOT_URL self-host
 * (tools/penpot/ Caddy strips the header) → in-window iframe behind the
 * PhotoVault reachability pattern. Templates tab serves Andy's brand-kit SVGs
 * from public/design-templates/. Files tab talks to the /api/design proxy —
 * 503 → the exact PENPOT_ACCESS_TOKEN setup step, never a crash. No env gate:
 * the Tools hub row is `ready` as soon as the widget is registered.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PenpotStudio, { PENPOT_DEFAULT_URL, isEmbeddablePenpotUrl, penpotUrl } from '../components/PenpotStudio/PenpotStudio';
import { PENPOT_TEMPLATES } from '../components/PenpotStudio/penpotTemplates';
import type { DesignApi } from '../components/PenpotStudio/designApi';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { TOOLS, resolveToolStatus } from '../data/toolsHub';

afterEach(() => vi.unstubAllGlobals());

/** Injectable /api/design client stub (never hits the network). */
function apiStub(overrides: Partial<DesignApi> = {}): DesignApi {
    return {
        listDesignProjects: vi.fn(async () => ({ kind: 'needs-setup' as const })),
        listDesignFiles: vi.fn(async () => ({ kind: 'ok' as const, data: [] })),
        exportDesignFile: vi.fn(async () => ({ kind: 'ok' as const, data: new Blob(['x']) })),
        ...overrides,
    };
}

describe('penpotUrl + isEmbeddablePenpotUrl (the launcher/iframe decision)', () => {
    it('defaults to the free cloud and lets VITE_PENPOT_URL re-point it (trailing slash trimmed)', () => {
        expect(penpotUrl({})).toBe(PENPOT_DEFAULT_URL);
        expect(PENPOT_DEFAULT_URL).toBe('https://design.penpot.app');
        expect(penpotUrl({ VITE_PENPOT_URL: ' https://design.dwellium.com/ ' })).toBe('https://design.dwellium.com');
    });

    it('cloud URLs are NOT embeddable (X-Frame-Options SAMEORIGIN); self-hosts are; garbage is not', () => {
        expect(isEmbeddablePenpotUrl('https://design.penpot.app')).toBe(false);
        expect(isEmbeddablePenpotUrl('https://penpot.app')).toBe(false);
        expect(isEmbeddablePenpotUrl('https://early.penpot.app')).toBe(false);
        expect(isEmbeddablePenpotUrl('https://design.dwellium.com')).toBe(true);
        expect(isEmbeddablePenpotUrl('http://office-mac.tailnet.ts.net:9001')).toBe(true);
        expect(isEmbeddablePenpotUrl('not a url')).toBe(false);
    });
});

describe('registration + Tools hub status', () => {
    it('is registered as "penpot-studio" and its Tools-hub row is ready with no env', () => {
        expect(WIDGET_REGISTRY['penpot-studio']).toBeDefined();
        expect(WIDGET_REGISTRY['penpot-studio'].label).toBe('Design Studio');
        const tool = TOOLS.find(t => t.id === 'design-studio')!;
        expect(tool.envVar).toBeUndefined(); // launcher needs no setup
        expect(resolveToolStatus(tool, id => !!WIDGET_REGISTRY[id], {})).toBe('ready');
    });
});

describe('Studio tab — cloud URL → launcher', () => {
    it('renders the launcher card with the one-line why and Open Penpot ↗; no iframe', () => {
        render(<PenpotStudio env={{}} api={apiStub()} />);
        expect(screen.getByText(/listing flyers/)).toBeInTheDocument();
        expect(screen.getByText(/cloud blocks embedding/)).toBeInTheDocument();
        expect(screen.getByText(/X-Frame-Options: SAMEORIGIN/)).toBeInTheDocument();
        const link = screen.getByRole('link', { name: /Open Penpot/ });
        expect(link).toHaveAttribute('href', PENPOT_DEFAULT_URL);
        expect(link).toHaveAttribute('target', '_blank');
        expect(document.querySelector('iframe')).toBeNull(); // launcher-only for the cloud, by design
    });
});

describe('Studio tab — self-host URL → in-window iframe (reachability pattern)', () => {
    it('reachable self-host → the editor renders in an iframe', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({}) as Response));
        render(<PenpotStudio env={{ VITE_PENPOT_URL: 'https://design.dwellium.com/' }} api={apiStub()} />);
        await waitFor(() => expect(screen.getByTitle('Design Studio')).toBeInTheDocument());
        expect(screen.getByTitle('Design Studio')).toHaveAttribute('src', 'https://design.dwellium.com');
    });

    it('unreachable self-host → honest card with Re-check (never a blank iframe); Re-check recovers', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
        render(<PenpotStudio env={{ VITE_PENPOT_URL: 'https://design.dwellium.com' }} api={apiStub()} />);
        await waitFor(() => expect(screen.getByText('Design Studio isn’t reachable')).toBeInTheDocument());
        expect(screen.getByText(/tools\/penpot\/README\.md/)).toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
        vi.stubGlobal('fetch', vi.fn(async () => ({}) as Response));
        fireEvent.click(screen.getByRole('button', { name: 'Re-check' }));
        await waitFor(() => expect(screen.getByTitle('Design Studio')).toBeInTheDocument());
    });
});

describe('Templates tab — Andy brand kit', () => {
    it('renders all five templates with previews, download hrefs and the Penpot import steps', () => {
        render(<PenpotStudio env={{}} api={apiStub()} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Templates' }));
        expect(PENPOT_TEMPLATES).toHaveLength(5);
        for (const t of PENPOT_TEMPLATES) {
            expect(t.file).toMatch(/^\/design-templates\/[a-z-]+\.svg$/);
            expect(screen.getByAltText(`${t.name} template preview`)).toHaveAttribute('src', t.file);
        }
        // one download link per template, each with the download attribute
        const downloads = screen.getAllByRole('link', { name: /Download SVG/ });
        expect(downloads).toHaveLength(5);
        expect(downloads.map(a => a.getAttribute('href')).sort()).toEqual(PENPOT_TEMPLATES.map(t => t.file).slice().sort());
        for (const a of downloads) expect(a).toHaveAttribute('download');
        // import steps (Penpot imports SVG natively — drag onto the canvas)
        expect(screen.getByText('Import into Penpot')).toBeInTheDocument();
        expect(screen.getByText(/Drag the downloaded \.svg onto the canvas/)).toBeInTheDocument();
        // Andy's fixture properties are example text, marked as such (intro + import step)
        expect(screen.getAllByText(/example — replace/).length).toBeGreaterThan(0);
    });
});

describe('Files tab — /api/design proxy states', () => {
    it('backend 503 → needs-setup card naming the exact human step (access token + env)', async () => {
        render(<PenpotStudio env={{}} api={apiStub()} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
        await waitFor(() => expect(screen.getByText('Connect the Penpot API')).toBeInTheDocument());
        expect(screen.getByText(/Access tokens → Generate new token/)).toBeInTheDocument();
        expect(screen.getByText('PENPOT_ACCESS_TOKEN')).toBeInTheDocument();
    });

    it('backend unreachable → error card; Retry recovers into the project list', async () => {
        const api = apiStub({
            listDesignProjects: vi.fn()
                .mockResolvedValueOnce({ kind: 'error', message: 'Backend unreachable' })
                .mockResolvedValue({ kind: 'ok', data: [{ id: 'p1', name: 'Marketing', teamId: 't1', teamName: 'Dwellium' }] }),
        });
        render(<PenpotStudio env={{}} api={api} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
        await waitFor(() => expect(screen.getByText('Couldn’t reach the backend')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.getByText('Marketing')).toBeInTheDocument());
        expect(screen.getByText('Dwellium')).toBeInTheDocument();
    });

    it('project list → click project loads its files → Export .penpot calls the proxy and reports the download', async () => {
        const api = apiStub({
            listDesignProjects: vi.fn(async () => ({
                kind: 'ok' as const,
                data: [{ id: 'p1', name: 'Marketing', teamId: 't1', teamName: 'Dwellium' }],
            })),
            listDesignFiles: vi.fn(async () => ({
                kind: 'ok' as const,
                data: [{ id: 'f1', name: 'August flyer', modifiedAt: '2026-08-20T00:00:00Z' }],
            })),
        });
        render(<PenpotStudio env={{}} api={api} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
        await waitFor(() => expect(screen.getByText('Marketing')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Marketing/ }));
        await waitFor(() => expect(screen.getByText('August flyer')).toBeInTheDocument());
        expect(api.listDesignFiles).toHaveBeenCalledWith('p1');
        fireEvent.click(screen.getByRole('button', { name: /Export \.penpot/ }));
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Downloaded “August flyer\.penpot”/));
        expect(api.exportDesignFile).toHaveBeenCalledWith('f1');
    });

    it('empty project list → honest empty state with Refresh', async () => {
        const api = apiStub({ listDesignProjects: vi.fn(async () => ({ kind: 'ok' as const, data: [] })) });
        render(<PenpotStudio env={{}} api={api} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
        await waitFor(() => expect(screen.getByText('No projects yet')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });
});
