/**
 * DictationSection — plan 047 FluidVoice phase 1 Control Panel setup card:
 * renders install + seed instructions, and "Copy vocabulary" writes the
 * append-mode payload JSON to the clipboard (navigator.clipboard mocked —
 * jsdom has none).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DictationSection from '../components/ControlPanel/DictationSection';
import { FLUIDVOICE_VOCABULARY } from '../data/fluidVoiceVocabulary';

afterEach(() => {
    vi.unstubAllGlobals();
});

const stubClipboard = (writeText: (t: string) => Promise<void>) => {
    vi.stubGlobal('navigator', { ...window.navigator, clipboard: { writeText } });
};

describe('DictationSection', () => {
    it('renders the setup card: title, install command, seed command, any-field note', () => {
        render(<DictationSection />);
        expect(screen.getByRole('heading', { name: /Dictation \(FluidVoice\)/ })).toBeInTheDocument();
        expect(screen.getByText('brew install --cask fluidvoice')).toBeInTheDocument();
        expect(screen.getByText(/127\.0\.0\.1:47733\/v1\/dictionary\/custom-words/)).toBeInTheDocument();
        expect(screen.getByText(/types it into/)).toBeInTheDocument(); // works against any Dwellium field
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
});
