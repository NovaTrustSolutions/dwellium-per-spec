/**
 * Strata → Photo Vault bridge (plan 053).
 *
 * Maintenance work-order detail + Inspections share MaintenanceModule's
 * DetailPanel, whose "Photos" action calls `openPhotoVaultForUnit` — so the
 * bridge contract lives here: unit parsing from the "unit: 12B" tag
 * convention, preset emit + widget open, and the widget consuming a preset
 * emitted BEFORE it mounts (typedBus pending-slot) to land on the unit's
 * album with Upload preset to it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PhotoVault from '../components/PhotoVault/PhotoVault';
import { openPhotoVaultForUnit, photoVaultPresetBus, unitFromTags } from '../components/PhotoVault/photoVaultBridge';
import { resetThumbnailCache } from '../components/PhotoVault/photoVaultApi';

function jsonRes(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob(['x']) } as unknown as Response;
}

const ALBUMS = [
    { id: 'al-w12b', albumName: 'Woodland Parc Townhomes — 12B', assetCount: 1, albumThumbnailAssetId: null },
    { id: 'al-r7a', albumName: 'Riverwood Club Apartments — 7A', assetCount: 0, albumThumbnailAssetId: null },
];

function stubBackend() {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/photos/status')) return jsonRes({ success: true, data: { reachable: true } });
        if (url.match(/\/api\/photos\/albums\/[^/]+$/)) {
            return jsonRes({ success: true, data: { id: 'al-w12b', albumName: 'Woodland Parc Townhomes — 12B', assets: [{ id: 'as-1', originalFileName: 'stove.jpg' }] } });
        }
        if (url.includes('/api/photos/albums')) return jsonRes({ success: true, data: ALBUMS });
        return jsonRes({}, 404);
    }));
}

const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));

beforeEach(() => {
    opened.length = 0;
    photoVaultPresetBus.clear();
    resetThumbnailCache();
    window.addEventListener('dwellium:open-widget', onOpen);
});
afterEach(() => {
    window.removeEventListener('dwellium:open-widget', onOpen);
    vi.unstubAllGlobals();
});

describe('unitFromTags — the Strata "unit: 12B" tag convention', () => {
    it('parses the unit label and trims it', () => {
        expect(unitFromTags(['priority:high', 'Unit: 12B'])).toBe('12B');
        expect(unitFromTags(['unit:3C'])).toBe('3C');
        expect(unitFromTags(['unit: Bldg 2 : 7A'])).toBe('Bldg 2 : 7A');
    });
    it('returns undefined without a unit tag', () => {
        expect(unitFromTags([])).toBeUndefined();
        expect(unitFromTags(undefined)).toBeUndefined();
        expect(unitFromTags(['inspection'])).toBeUndefined();
    });
});

describe('openPhotoVaultForUnit', () => {
    it('emits the preset and opens the photo-vault widget', () => {
        openPhotoVaultForUnit({ property: 'Woodland Parc Townhomes', unit: '12B' });
        expect(opened).toEqual(['photo-vault']);
        expect(photoVaultPresetBus.peek()).toEqual({ tab: 'albums', property: 'Woodland Parc Townhomes', unit: '12B' });
    });

    it('drops the "—" placeholder property instead of presetting garbage', () => {
        openPhotoVaultForUnit({ property: '—', unit: undefined });
        expect(photoVaultPresetBus.peek()).toEqual({ tab: 'albums', property: undefined, unit: undefined });
    });
});

describe('PhotoVault consumes a bridge preset', () => {
    it('preset emitted before mount → widget lands on the unit’s album (Albums tab auto-open)', async () => {
        stubBackend();
        openPhotoVaultForUnit({ property: 'Woodland Parc Townhomes', unit: '12B' });
        render(<PhotoVault env={{}} />);
        await waitFor(() => expect(screen.getByRole('tab', { name: 'Albums', selected: true })).toBeInTheDocument());
        // auto-opened straight into the "Woodland Parc Townhomes — 12B" album
        await waitFor(() => expect(screen.getByText('Woodland Parc Townhomes — 12B')).toBeInTheDocument());
        await waitFor(() => expect(screen.getByText('stove.jpg')).toBeInTheDocument());
        // Upload form is preset to the same unit
        fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
        await waitFor(() => expect(screen.getByLabelText('Property')).toHaveValue('Woodland Parc Townhomes'));
        expect(screen.getByLabelText('Unit')).toHaveValue('12B');
    });

    it('preset for a unit with no album yet → honest hint pointing at Upload', async () => {
        stubBackend();
        openPhotoVaultForUnit({ property: 'Riverwood Club Apartments', unit: '99Z', tab: 'albums' });
        render(<PhotoVault env={{}} />);
        await waitFor(() => expect(document.querySelector('[data-state="preset-no-album"]')).not.toBeNull());
        expect(screen.getByText('Riverwood Club Apartments — 99Z')).toBeInTheDocument();
    });
});
