import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Strata property photos: an uploaded photo wins; otherwise the backend's
 * Street View proxy. Every state is honest — no stock image, nothing at all
 * when the backend has no key (503, remembered for the session), a quiet
 * "No street photo" tile when Google has no imagery (404).
 */
const blobMock = vi.fn();
vi.mock('../components/StrataDashboard/strataApi', () => ({ strataGetBlob: (...a: unknown[]) => blobMock(...a) }));
import { PropertyPhoto, __resetPropertyPhotoCache } from '../components/StrataDashboard/modules/PropertyPhoto';

const prop = (over: Partial<{ id: string; name: string; metadata: Record<string, unknown> }> = {}) => ({ id: 'p1', name: 'Riverwood Club Apartments', address: '1 Riverwood Dr, Atlanta, GA', metadata: {}, ...over });
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('PropertyPhoto', () => {
    beforeEach(() => { __resetPropertyPhotoCache(); blobMock.mockReset(); vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }); });
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

    it('an uploaded office photo wins and needs no backend call', () => {
        render(<PropertyPhoto property={prop({ metadata: { photos: [{ id: 'a', name: 'front.png', dataUrl: TINY_PNG }] } })} variant="card" />);
        const img = screen.getByRole('img', { name: 'Riverwood Club Apartments — photo' }) as HTMLImageElement;
        expect(img.src).toBe(TINY_PNG);
        expect(blobMock).not.toHaveBeenCalled();
    });

    it('200 from the proxy → the street image with alt text; the hero carries Google\'s attribution', async () => {
        blobMock.mockResolvedValue({ status: 200, blob: new Blob(['x'], { type: 'image/jpeg' }), headers: new Headers({ 'X-Photo-Copyright': encodeURIComponent('© 2025 Google'), 'X-Photo-Date': '2025-04' }) });
        render(<PropertyPhoto property={prop()} variant="hero" />);
        const img = await screen.findByRole('img', { name: 'Riverwood Club Apartments — street view' });
        expect(img).toHaveAttribute('src', 'blob:fake');
        expect(screen.getByText(/Street View · 2025-04 · © 2025 Google/)).toBeInTheDocument();
        expect(blobMock).toHaveBeenCalledWith('/properties/p1/street-photo');
    });

    it('404 → an honest "No street photo" tile on cards, nothing on rows', async () => {
        blobMock.mockResolvedValue({ status: 404 });
        const { unmount } = render(<PropertyPhoto property={prop()} variant="card" />);
        await screen.findByText('No street photo');
        expect(screen.getByRole('img', { name: /no street photo available/ })).toBeInTheDocument();
        unmount();
        __resetPropertyPhotoCache(); blobMock.mockResolvedValue({ status: 404 });
        const { container } = render(<PropertyPhoto property={prop()} variant="row" />);
        await waitFor(() => expect(container.querySelector('[data-state="loading"]')).toBeNull());
        expect(container.innerHTML).toBe('');
    });

    it('503 (no key on the backend) → renders nothing, and the next card does not ask again', async () => {
        blobMock.mockResolvedValue({ status: 503 });
        const { container } = render(<PropertyPhoto property={prop()} variant="card" />);
        await waitFor(() => expect(container.innerHTML).toBe(''));
        expect(blobMock).toHaveBeenCalledTimes(1);
        const second = render(<PropertyPhoto property={prop({ id: 'p2', name: 'Woodstock Land' })} variant="card" />);
        expect(second.container.innerHTML).toBe('');
        expect(blobMock).toHaveBeenCalledTimes(1);
    });

    it('one request per property is shared between the card, row and hero', async () => {
        blobMock.mockResolvedValue({ status: 200, blob: new Blob(['x'], { type: 'image/jpeg' }), headers: new Headers() });
        render(<><PropertyPhoto property={prop()} variant="card" /><PropertyPhoto property={prop()} variant="row" /><PropertyPhoto property={prop()} variant="hero" /></>);
        await waitFor(() => expect(screen.getAllByRole('img', { name: /street view/ })).toHaveLength(3));
        expect(blobMock).toHaveBeenCalledTimes(1);
    });
});
