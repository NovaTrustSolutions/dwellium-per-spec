/**
 * AraMeetingPanel — render + interaction smoke suite (2026-06-15).
 *
 * Covers ARA's Meeting Notetaker widget: it renders, the mode toggle switches
 * between Visible and Background, the meeting-URL input appears only in Visible
 * mode, and the first-use consent acknowledgment gates Start until accepted —
 * after which the recording/consent indicator is what the user would see once a
 * session goes live.
 *
 * The panel uses useUser().authFetch, so unlike the ApiKeysWidget suite it
 * renders inside a real <UserProvider> (no logged-in user needed — nothing is
 * fetched until Start). Background mode is unavailable in jsdom (no
 * window.electronAPI), so the desktop-app note is asserted. The integrations
 * store holder + localStorage are reset between tests per the
 * createLocalStorageStore `.reset()` convention.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import AraMeetingPanel from '../components/AraMeeting/AraMeetingPanel';
import { UserProvider, tokenStore } from '../context/UserContext';
import { integrationsStore, integrationsUserIdHolder } from '../utils/integrationsStore';

const wrap = (node: ReactNode) => render(<UserProvider>{node}</UserProvider>);

beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
    integrationsUserIdHolder.current = null;
    integrationsStore.reset();
    tokenStore.reset();
    // No window.electronAPI in jsdom → background mode stays unavailable.
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    // Stub fetch so an accidental network call can't reach out in CI. Nothing
    // should fetch on a fresh render (Start hasn't been pressed).
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:3000'))));
    cleanup();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('AraMeetingPanel renders', () => {
    it('shows the widget header and the listen-only framing', () => {
        wrap(<AraMeetingPanel />);
        expect(screen.getByRole('heading', { name: /Meeting Notetaker/i })).toBeTruthy();
        // Default copy framing: listen-only note-taker + coaching.
        expect(screen.getByText(/takes the notes, and coaches you/i)).toBeTruthy();
    });

    it('shows the first-use consent acknowledgment before anything else', () => {
        wrap(<AraMeetingPanel />);
        expect(screen.getByRole('region', { name: /recording consent notice/i })).toBeTruthy();
        // Recording other participants may require their consent.
        expect(screen.getByText(/may require/i)).toBeTruthy();
        // Start is gated until the notice is accepted.
        const startBtn = screen.getByRole('button', { name: /Start meeting assist/i }) as HTMLButtonElement;
        expect(startBtn.disabled).toBe(true);
    });
});

describe('AraMeetingPanel mode toggle', () => {
    it('defaults to Visible and shows the meeting-link input', () => {
        wrap(<AraMeetingPanel />);
        const visible = screen.getByRole('radio', { name: /Visible note-taker/i });
        expect(visible.getAttribute('aria-checked')).toBe('true');
        // Visible mode → a meeting-URL field is present.
        expect(screen.getByLabelText(/Meeting link/i)).toBeTruthy();
    });

    it('without the desktop bridge, Background is disabled, stays unselected, and shows the desktop-app note', () => {
        wrap(<AraMeetingPanel />);
        const background = screen.getByRole('radio', { name: /Background \(private\)/i }) as HTMLButtonElement;
        // Web build (no window.electronAPI) → Background cannot be selected.
        expect(background.disabled).toBe(true);
        fireEvent.click(background); // disabled → no-op
        expect(background.getAttribute('aria-checked')).toBe('false'); // mode stays Visible
        // The note explains why Background is unavailable in a web build.
        expect(screen.getByText(/requires the Dwellium desktop app/i)).toBeTruthy();
        // Mode stays Visible → the meeting-URL field remains.
        expect(screen.getByLabelText(/Meeting link/i)).toBeTruthy();
    });

    it('Background mode option is disabled without the desktop bridge', () => {
        wrap(<AraMeetingPanel />);
        const background = screen.getByRole('radio', { name: /Background \(private\)/i }) as HTMLButtonElement;
        expect(background.disabled).toBe(true);
    });
});

describe('AraMeetingPanel consent gate', () => {
    it('accepting the notice enables Start (Visible mode, with a URL)', () => {
        wrap(<AraMeetingPanel />);
        // Tick the acknowledgment, then click "Got it".
        fireEvent.click(screen.getByRole('checkbox', { name: /participant consent/i }));
        fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
        // Notice is gone now.
        expect(screen.queryByRole('region', { name: /recording consent notice/i })).toBeNull();
        // Provide a meeting URL → Start becomes enabled.
        fireEvent.change(screen.getByLabelText(/Meeting link/i), {
            target: { value: 'https://zoom.us/j/123456789' },
        });
        const startBtn = screen.getByRole('button', { name: /Start meeting assist/i }) as HTMLButtonElement;
        expect(startBtn.disabled).toBe(false);
    });
});
