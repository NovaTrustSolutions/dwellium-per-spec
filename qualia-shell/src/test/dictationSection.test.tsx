/**
 * DictationSection — plan 047 FluidVoice setup card + plan 053 100% upgrades:
 * live detection states (no-cors honesty), one-click vocabulary send
 * (fire-and-recheck), per-app Dwellium prompt copy, and the built-in hotkey
 * configuration. navigator/fetch are stubbed — jsdom has neither clipboard
 * nor a FluidVoice on 127.0.0.1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DictationSection from '../components/ControlPanel/DictationSection';
import { FLUIDVOICE_VOCABULARY } from '../data/fluidVoiceVocabulary';
import { DWELLIUM_DICTATION_PROMPT } from '../data/dictationPrompt';
import { FLUIDVOICE_CUSTOM_WORDS_URL, FLUIDVOICE_HEALTH_URL } from '../lib/fluidVoiceLocalApi';
import { dictationHotkeyStore } from '../lib/dictationHotkeyStore';

beforeEach(() => {
    localStorage.clear();
    dictationHotkeyStore.reset();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const stubClipboard = (writeText: (t: string) => Promise<void>, platform = '') => {
    vi.stubGlobal('navigator', { platform, clipboard: { writeText } });
};

const stubMac = (fetchImpl: (url: string, init?: RequestInit) => Promise<unknown>) => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

describe('DictationSection', () => {
    it('renders the setup card: title, install command, seed command, any-field note', () => {
        render(<DictationSection />);
        expect(screen.getByRole('heading', { name: /Dictation \(FluidVoice\)/ })).toBeInTheDocument();
        expect(screen.getByText('brew install --cask fluidvoice')).toBeInTheDocument();
        expect(screen.getByText(/127\.0\.0\.1:47733\/v1\/dictionary\/custom-words/)).toBeInTheDocument();
        expect(screen.getByText(/types it into/)).toBeInTheDocument(); // works against any Dwellium field
    });

    it('non-Mac: shows the macOS-app pill, no probe, and points at the built-in hotkey', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        render(<DictationSection />);
        expect(screen.getByTestId('fluidvoice-status')).toHaveTextContent('macOS app');
        expect(fetchMock).not.toHaveBeenCalled(); // detection only pings on Macs
        expect(screen.getByText(/use the built-in hotkey dictation below/)).toBeInTheDocument();
    });

    it('Mac + local API answering: pill shows Running and the one-click send appears', async () => {
        const fetchMock = stubMac(() => Promise.resolve({}));
        render(<DictationSection />);
        await waitFor(() => expect(screen.getByTestId('fluidvoice-status')).toHaveTextContent('Running'));
        expect(fetchMock).toHaveBeenCalledWith(FLUIDVOICE_HEALTH_URL, expect.objectContaining({ mode: 'no-cors' }));
        expect(screen.getByRole('button', { name: /Send vocabulary to FluidVoice/ })).toBeInTheDocument();
        // install steps are replaced by seed actions
        expect(screen.queryByText('brew install --cask fluidvoice')).not.toBeInTheDocument();
    });

    it('Mac + nothing listening: pill shows Not detected, install steps stay, Re-check re-probes', async () => {
        const fetchMock = stubMac(() => Promise.reject(new TypeError('connection refused')));
        render(<DictationSection />);
        await waitFor(() => expect(screen.getByTestId('fluidvoice-status')).toHaveTextContent('Not detected'));
        expect(screen.getByText('brew install --cask fluidvoice')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Re-check/ }));
        await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    });

    it('Send vocabulary POSTs the append payload no-cors and states the opaque-response honesty', async () => {
        const fetchMock = stubMac(() => Promise.resolve({}));
        render(<DictationSection />);
        await waitFor(() => expect(screen.getByTestId('fluidvoice-status')).toHaveTextContent('Running'));
        fireEvent.click(screen.getByRole('button', { name: /Send vocabulary to FluidVoice/ }));
        await waitFor(() => expect(screen.getByText(/cannot read FluidVoice/)).toBeInTheDocument());
        const post = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST');
        expect(post?.[0]).toBe(FLUIDVOICE_CUSTOM_WORDS_URL);
        const body = JSON.parse((post?.[1] as RequestInit).body as string) as { mode: string; entries: unknown[] };
        expect(body.mode).toBe('append');
        expect(body.entries).toHaveLength(FLUIDVOICE_VOCABULARY.length);
        expect((post?.[1] as RequestInit).mode).toBe('no-cors');
    });

    it('Send vocabulary failure shows the honest unreachable message', async () => {
        stubMac((_url, init) => (init?.method === 'POST' ? Promise.reject(new TypeError('down')) : Promise.resolve({})));
        render(<DictationSection />);
        await waitFor(() => expect(screen.getByTestId('fluidvoice-status')).toHaveTextContent('Running'));
        fireEvent.click(screen.getByRole('button', { name: /Send vocabulary to FluidVoice/ }));
        await waitFor(() => expect(screen.getByText(/request failed to leave the browser/)).toBeInTheDocument());
    });

    it('Copy vocabulary writes the append-mode JSON payload to the clipboard', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);
        render(<DictationSection />);
        fireEvent.click(screen.getByRole('button', { name: /Copy vocabulary/ }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const payload = JSON.parse(writeText.mock.calls[0][0] as string) as { entries: unknown[]; mode: string };
        expect(payload.mode).toBe('append');
        expect(payload.entries).toHaveLength(FLUIDVOICE_VOCABULARY.length);
        expect(await screen.findByText(new RegExp(`Copied ${FLUIDVOICE_VOCABULARY.length} terms`))).toBeInTheDocument();
    });

    it('shows a fallback message when the clipboard is unavailable', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('denied'));
        stubClipboard(writeText);
        render(<DictationSection />);
        fireEvent.click(screen.getByRole('button', { name: /Copy vocabulary/ }));
        expect(await screen.findByText(/Clipboard unavailable/)).toBeInTheDocument();
    });

    it('renders the Dwellium per-app prompt with a working copy button', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);
        render(<DictationSection />);
        expect(screen.getByTestId('dwellium-prompt')).toHaveTextContent('Woodland Parc Townhomes');
        expect(screen.getByText(/assign different prompt sets to different apps/)).toBeInTheDocument(); // README citation
        fireEvent.click(screen.getByRole('button', { name: /Copy Dwellium prompt/ }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(DWELLIUM_DICTATION_PROMPT));
        expect(await screen.findByText(/Prompt copied/)).toBeInTheDocument();
    });

    it('built-in dictation: shows the ⌥D default, honest browser-support state, and rebinds the hotkey', () => {
        render(<DictationSection />);
        expect(screen.getByTestId('dictation-hotkey-label')).toHaveTextContent('⌥D');
        // jsdom has no SpeechRecognition — the card says so instead of pretending
        expect(screen.getByText(/not supported in this browser/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Change hotkey/ }));
        expect(screen.getByText(/Press the new hotkey/)).toBeInTheDocument();
        fireEvent.keyDown(window, { code: 'KeyK', ctrlKey: true });
        expect(screen.getByTestId('dictation-hotkey-label')).toHaveTextContent('⌃K');
        // persisted per user namespace (anonymous here — no UserContext in the test tree)
        expect(JSON.parse(localStorage.getItem('dictation-hotkey:_anonymous') ?? '{}')).toMatchObject({ code: 'KeyK', ctrlKey: true });
        // reset restores the default
        fireEvent.click(screen.getByRole('button', { name: /Reset to ⌥D/ }));
        expect(screen.getByTestId('dictation-hotkey-label')).toHaveTextContent('⌥D');
    });

    it('hotkey capture ignores modifier-only and unmodified presses, Esc cancels', () => {
        render(<DictationSection />);
        fireEvent.click(screen.getByRole('button', { name: /Change hotkey/ }));
        fireEvent.keyDown(window, { code: 'AltLeft', altKey: true }); // modifier only — still capturing
        fireEvent.keyDown(window, { code: 'KeyX' }); // no modifier — would hijack typing
        expect(screen.getByText(/Press the new hotkey/)).toBeInTheDocument();
        expect(screen.getByTestId('dictation-hotkey-label')).toHaveTextContent('⌥D');
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
        expect(screen.queryByText(/Press the new hotkey/)).not.toBeInTheDocument();
    });
});
