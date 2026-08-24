/**
 * fluidVoiceLocalApi — plan 053 target 1/2/5: opaque-response detection
 * honesty (resolve ≈ running, reject ≈ not detected), the one-click seed
 * POST, the macOS platform gate, and the Tools hub Dictation row's live
 * sub-status.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), history: vi.fn() },
}));

import {
    FLUIDVOICE_CUSTOM_WORDS_URL, FLUIDVOICE_HEALTH_URL,
    isMacLike, probeFluidVoice, sendVocabulary,
} from '../lib/fluidVoiceLocalApi';
import { FLUIDVOICE_VOCABULARY } from '../data/fluidVoiceVocabulary';
import ToolsHub from '../components/ToolsHub/ToolsHub';
import { onboardingStore, resetOnboarding } from '../lib/onboardingStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';

beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity('u-dictation');
    onboardingStore.reset();
    resetOnboarding();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('fluidVoiceLocalApi', () => {
    it('probe: a no-cors fetch that resolves means running', async () => {
        const fetchFn = vi.fn().mockResolvedValue({}); // opaque — body unreadable, resolution is the only signal
        await expect(probeFluidVoice(fetchFn)).resolves.toBe('running');
        expect(fetchFn).toHaveBeenCalledWith(FLUIDVOICE_HEALTH_URL, expect.objectContaining({ mode: 'no-cors' }));
    });

    it('probe: a network error means not detected', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new TypeError('ECONNREFUSED'));
        await expect(probeFluidVoice(fetchFn)).resolves.toBe('not-detected');
    });

    it('sendVocabulary POSTs the full append payload no-cors; resolve=sent, reject=unreachable', async () => {
        const ok = vi.fn().mockResolvedValue({});
        await expect(sendVocabulary(ok)).resolves.toBe('sent');
        const [url, init] = ok.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(FLUIDVOICE_CUSTOM_WORDS_URL);
        expect(init.method).toBe('POST');
        expect(init.mode).toBe('no-cors');
        const body = JSON.parse(init.body as string) as { mode: string; entries: unknown[] };
        expect(body.mode).toBe('append');
        expect(body.entries).toHaveLength(FLUIDVOICE_VOCABULARY.length);

        const down = vi.fn().mockRejectedValue(new TypeError('down'));
        await expect(sendVocabulary(down)).resolves.toBe('unreachable');
    });

    it('isMacLike gates on platform/userAgent', () => {
        expect(isMacLike({ platform: 'MacIntel' })).toBe(true);
        expect(isMacLike({ userAgent: 'Mozilla/5.0 (Macintosh; Mac OS X 15_0)' })).toBe(true);
        expect(isMacLike({ platform: 'Win32', userAgent: 'Windows NT' })).toBe(false);
        expect(isMacLike({})).toBe(false);
    });
});

describe('ToolsHub Dictation row live sub-status (plan 053 target 5)', () => {
    it('keeps companion Ready and adds "FluidVoice: Running" when the local API answers (macOS)', async () => {
        vi.stubGlobal('navigator', { platform: 'MacIntel' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}));
        render(<ToolsHub />);
        const row = document.querySelector('tr[data-tool="dictation"]')!;
        expect(row.getAttribute('data-status')).toBe('ready'); // companion semantics untouched
        await waitFor(() => expect(screen.getByText('FluidVoice: Running')).toBeInTheDocument());
    });

    it('shows "FluidVoice: Not detected" when nothing answers, and nothing on non-Macs', async () => {
        vi.stubGlobal('navigator', { platform: 'MacIntel' });
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('refused')));
        const { unmount } = render(<ToolsHub />);
        await waitFor(() => expect(screen.getByText('FluidVoice: Not detected')).toBeInTheDocument());
        unmount();

        vi.unstubAllGlobals();
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        render(<ToolsHub />);
        expect(fetchMock).not.toHaveBeenCalled(); // no probe off-Mac
        expect(screen.queryByText(/FluidVoice:/)).not.toBeInTheDocument();
    });
});
