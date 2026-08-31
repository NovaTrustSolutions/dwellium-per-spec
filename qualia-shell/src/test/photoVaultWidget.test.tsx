/**
 * PhotoVault widget (plan 047 phase 2 — Immich on the always-on office Mac,
 * reachable only inside the Tailscale tailnet via VITE_IMMICH_URL).
 *
 * Env unset → "Connect Immich" needs-setup card (points at tools/immich/README.md,
 * button opens the Tools hub); env set + ping ok → iframe of the Immich web UI;
 * env set + ping fails (off-tailnet / Mac asleep) → "connect to Tailscale" card
 * with Open ↗ — never a blank iframe (gate G2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PhotoVault from '../components/PhotoVault/PhotoVault';
import { resetWidgetMemory } from '../lib/widgetMemory';

const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));

beforeEach(() => {
    resetWidgetMemory(); // plan 055 phase 2 — v2.72.1 standing convention
    opened.length = 0;
    window.addEventListener('dwellium:open-widget', onOpen);
});
afterEach(() => {
    window.removeEventListener('dwellium:open-widget', onOpen);
    vi.unstubAllGlobals();
});

describe('PhotoVault widget', () => {
    it('no VITE_IMMICH_URL → needs-setup card pointing at tools/immich/README.md; button opens the Tools hub', () => {
        render(<PhotoVault env={{}} />);
        expect(screen.getByText('Connect Immich')).toBeInTheDocument();
        expect(screen.getByText(/tools\/immich\/README\.md/)).toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Open Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
    });

    it('env set + Immich reachable → embeds the Immich web UI in an iframe (trailing slash trimmed)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({}) as Response));
        render(<PhotoVault env={{ VITE_IMMICH_URL: 'https://office-mac.tailnet.ts.net/' }} />);
        await waitFor(() => expect(screen.getByTitle('Photo Vault')).toBeInTheDocument());
        expect(screen.getByTitle('Photo Vault')).toHaveAttribute('src', 'https://office-mac.tailnet.ts.net');
        expect(screen.queryByText('Photo Vault isn’t reachable')).toBeNull();
    });

    it('env set + ping fails (off the tailnet) → "connect to Tailscale" card, no blank iframe; Re-check recovers', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<PhotoVault env={{ VITE_IMMICH_URL: 'https://office-mac.tailnet.ts.net' }} />);
        await waitFor(() => expect(screen.getByText('Photo Vault isn’t reachable')).toBeInTheDocument());
        expect(screen.getByText(/connect to Tailscale to view photos/)).toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
        // The Mac comes back (or the user joins the tailnet) → Re-check restores the embed.
        vi.stubGlobal('fetch', vi.fn(async () => ({}) as Response));
        fireEvent.click(screen.getByRole('button', { name: 'Re-check' }));
        await waitFor(() => expect(screen.getByTitle('Photo Vault')).toBeInTheDocument());
    });
});
