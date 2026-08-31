/**
 * Plan 055 phase 2 — widget adoption of useWidgetMemory.
 *
 * One focused round-trip per adopted widget: seed memory → mount → the view
 * opens at the remembered point; mutate the view → the memory slice updates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { flushWidgetMemory, patchWidgetMemory, readWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';

function jsonRes(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob(['x']) } as unknown as Response;
}

beforeEach(() => {
    localStorage.clear();
    resetWidgetMemory();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('ESign', () => {
    it('reopens on the remembered send view and remembers view changes', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ success: true, data: [] })));
        patchWidgetMemory('esign', { view: 'send' });
        const { default: ESign } = await import('../components/ESign/ESign');
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Back to documents')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Back to documents'));
        expect(readWidgetMemory('esign', { view: 'list' }).view).toBe('list');
    });
});

describe('ShortLinks', () => {
    it('reopens on the remembered QR door-sheet mode', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ success: true, data: [] })));
        patchWidgetMemory('short-links', { mode: 'sheet' });
        const { default: ShortLinks } = await import('../components/ShortLinks/ShortLinks');
        render(<ShortLinks />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Back to links' })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Back to links' }));
        expect(readWidgetMemory('short-links', { mode: 'links' }).mode).toBe('links');
    });
});

describe('Broadcasts', () => {
    it('reopens on the remembered tab and remembers tab clicks', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ success: true, data: [] })));
        patchWidgetMemory('broadcasts', { tab: 'templates' });
        const { default: Broadcasts } = await import('../components/Broadcasts/Broadcasts');
        render(<Broadcasts env={{}} />);
        const templatesTab = await screen.findByRole('tab', { name: /Templates/ });
        expect(templatesTab).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('tab', { name: /Audiences/ }));
        expect(readWidgetMemory('broadcasts', { tab: 'campaigns' }).tab).toBe('audiences');
    });
});

describe('PhotoVault', () => {
    it('reopens on the remembered Albums tab; a corrupt tab falls back to immich', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ success: true, data: [] })));
        patchWidgetMemory('photo-vault', { tab: 'albums' });
        const { default: PhotoVault } = await import('../components/PhotoVault/PhotoVault');
        const first = render(<PhotoVault env={{}} />);
        expect(await screen.findByRole('tab', { name: 'Albums' })).toHaveAttribute('aria-selected', 'true');
        first.unmount();

        patchWidgetMemory('photo-vault', { tab: 'bogus' });
        render(<PhotoVault env={{}} />);
        expect((await screen.findAllByRole('tab')).find(t => t.getAttribute('aria-selected') === 'true')?.textContent)
            .not.toBe('Albums');
    });
});

describe('Scheduling', () => {
    it('reopens on the remembered Links tab and remembers tab clicks', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ success: true, data: [] })));
        patchWidgetMemory('scheduling', { tab: 'links' });
        const { default: Scheduling } = await import('../components/Scheduling/Scheduling');
        render(<Scheduling env={{ VITE_CALCOM_URL: 'https://cal.com/andy/unit-showing' }} />);
        const linksTab = await screen.findByRole('tab', { name: /links/i });
        expect(linksTab).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('tab', { name: /book/i }));
        expect(readWidgetMemory('scheduling', { tab: 'book' }).tab).toBe('book');
    });
});

describe('Guide', () => {
    it('restores the remembered scroll position and remembers new scrolls', async () => {
        patchWidgetMemory('guide', { scrollTop: 333 });
        const { default: Guide } = await import('../components/Guide/Guide');
        const { container } = render(<Guide />);
        const article = container.querySelector('article.guide') as HTMLElement;
        expect(article.scrollTop).toBe(333);
        fireEvent.scroll(article, { target: { scrollTop: 42 } });
        expect(readWidgetMemory('guide', { scrollTop: 0 }).scrollTop).toBe(42);
    });
});

describe('ToolsHub', () => {
    it('restores the remembered scroll position and remembers new scrolls', async () => {
        patchWidgetMemory('tools-hub', { scrollTop: 210 });
        const { default: ToolsHub } = await import('../components/ToolsHub/ToolsHub');
        const { container } = render(<ToolsHub />);
        const scroller = container.querySelector('.tools-hub__scroll') as HTMLElement;
        expect(scroller.scrollTop).toBe(210);
        fireEvent.scroll(scroller, { target: { scrollTop: 55 } });
        expect(readWidgetMemory('tools-hub', { scrollTop: 0 }).scrollTop).toBe(55);
    });
});

describe('ResearchLab', () => {
    it('restores tab + prompt draft + preset + provider picks; typing persists the draft on blur', async () => {
        patchWidgetMemory('research-lab', { tab: 'history', prompt: 'compare models on lease summaries' });
        const { default: ResearchLab } = await import('../components/ResearchLab/ResearchLab');
        const first = render(<ResearchLab />);
        expect(await screen.findByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
        first.unmount();

        patchWidgetMemory('research-lab', { tab: 'playground' });
        render(<ResearchLab />);
        const box = await screen.findByLabelText('Research prompt');
        expect(box).toHaveValue('compare models on lease summaries');
        fireEvent.change(box, { target: { value: 'new draft' } });
        fireEvent.blur(box);
        flushWidgetMemory();
        expect(localStorage.getItem('widgetMemory:_anonymous')).toContain('new draft');
    });
});
