import { describe, it, expect } from 'vitest';
import { resumeIntentOnMinimize, activeKeyOnOpen } from '../components/Shell/HalocronOS';

// Bringing the Holocron OS shell back up must land on the HOME launcher — it
// must NOT auto-dive into the last hosted screen. The ONE exception: if the
// shell was minimized while a screen was active ("closed the window while
// working with that screen"), reopening resumes that screen. These two pure
// helpers encode that rule; the component wires them to the minimize button and
// the closed→open transition.
describe('HalocronOS — open lands on home unless minimized mid-work', () => {
    it('records resume intent only when a screen was active at minimize', () => {
        expect(resumeIntentOnMinimize('w:alpha')).toBe(true);
        expect(resumeIntentOnMinimize('web:chatgpt')).toBe(true);
        expect(resumeIntentOnMinimize(null)).toBe(false); // minimized from home → no resume
    });

    it('keeps the retained screen on open ONLY when resume was intended', () => {
        expect(activeKeyOnOpen('w:alpha', true)).toBe('w:alpha'); // resume mid-work
        expect(activeKeyOnOpen('w:alpha', false)).toBeNull();      // fresh open → home
    });

    it('a fresh open with no retained screen always stays on home', () => {
        expect(activeKeyOnOpen(null, true)).toBeNull();
        expect(activeKeyOnOpen(null, false)).toBeNull();
    });

    it('round-trip: working resumes the screen, idle stays on home', () => {
        // minimized while working with a screen → reopen resumes exactly that screen
        const working = resumeIntentOnMinimize('w:alpha');
        expect(activeKeyOnOpen('w:alpha', working)).toBe('w:alpha');
        // minimized from the home launcher → reopen stays home even if a tab lingers
        const idle = resumeIntentOnMinimize(null);
        expect(activeKeyOnOpen('w:alpha', idle)).toBeNull();
    });
});
