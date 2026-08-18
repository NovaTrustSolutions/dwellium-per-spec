/**
 * AraIntroVideo — 045-D1c: the intro plays once per user/device, gated on
 * araPrefsStore.introSeen (not the old per-session marker).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AraIntroVideo, { ARA_INTRO_PLAYED_KEY } from '../components/ARAConsole/AraIntroVideo';
import { araPrefsStore } from '../lib/araPrefsStore';

describe('AraIntroVideo', () => {
    let play: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        araPrefsStore.reset();
        localStorage.clear();
        sessionStorage.clear();
        // jsdom has no media playback; pretend autoplay succeeds so the intro stays up.
        play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
        vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('renders on first open and marks introSeen when skipped', () => {
        render(<AraIntroVideo />);
        expect(screen.getByRole('dialog', { name: 'ARA intro' })).toBeInTheDocument();
        expect(play).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /skip/i }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(araPrefsStore.getSnapshot().introSeen).toBe(true);
    });

    it('does not render once introSeen is set (fresh login does not replay it)', () => {
        araPrefsStore.set('introSeen', true);
        render(<AraIntroVideo />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(play).not.toHaveBeenCalled();
    });

    it('migrates the old per-session marker into introSeen', () => {
        sessionStorage.setItem(ARA_INTRO_PLAYED_KEY, 'true');
        render(<AraIntroVideo />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(araPrefsStore.getSnapshot().introSeen).toBe(true);
    });
});
