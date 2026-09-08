import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostOf, isKnownFrameBlocked } from '../lib/frameBlocked';

describe('frameBlocked', () => {
    it('knows app.crewai.com refuses to be framed (X-Frame-Options SAMEORIGIN, 2026-09-08)', () => {
        expect(isKnownFrameBlocked('https://app.crewai.com')).toBe(true);
        expect(isKnownFrameBlocked('https://app.crewai.com/crews/1')).toBe(true);
        // a self-hosted UI is not on the list
        expect(isKnownFrameBlocked('http://localhost:8501')).toBe(false);
        expect(isKnownFrameBlocked('not a url')).toBe(false);
    });

    it('hostOf never throws', () => {
        expect(hostOf('https://app.crewai.com/x')).toBe('app.crewai.com');
        expect(hostOf('garbage')).toBe('garbage');
    });
});

describe('Terminal tab toolbars', () => {
    it.each([
        ['src/components/Terminal/PaperclipPanel.css', '.pc-toolbar'],
        ['src/components/Terminal/CrewAIPanel.css', '.cr-toolbar'],
        ['src/components/Terminal/LangFlowPanel.css', '.lf-toolbar'],
    ])('%s %s wraps instead of overflowing a narrow pane', (file, selector) => {
        const css = readFileSync(resolve(process.cwd(), file), 'utf8');
        const rule = css.match(new RegExp(`\\${selector}\\s*\\{[^}]+\\}`))?.[0] ?? '';
        expect(rule).toMatch(/flex-wrap:\s*wrap/);
    });
});
