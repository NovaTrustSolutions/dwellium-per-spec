import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('eye-contact correction static page', () => {
    const html = () => readFileSync(resolve(process.cwd(), 'public/__eye-contact/index.html'), 'utf8');

    it('ships a browser-native two-pane preview instead of a desktop-app blocker', () => {
        const page = html();

        expect(page).toContain('Raw camera');
        expect(page).toContain('Corrected output');
        expect(page).toContain('correctedCanvas');
        expect(page).toContain('navigator.mediaDevices.getUserMedia');
        expect(page).not.toMatch(/download a desktop app/i);
        expect(page).not.toMatch(/requires the Dwellium desktop app/i);
        expect(page).not.toMatch(/engine ships with the <b>Dwellium desktop app<\/b>/i);
    });
});
