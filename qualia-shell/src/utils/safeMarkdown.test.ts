/**
 * safeMarkdown.test — XSS allowlist regression guard.
 *
 * Locks in the security contract from plan 010:
 *  - `onclick` (and every `on*` event handler) is stripped by sanitizeHtml.
 *  - `style` is no longer allowlisted.
 *  - The code-block copy button carries an inert `data-copy` attribute and no
 *    inline handler.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHtml, renderSafeMarkdown } from './safeMarkdown';

describe('sanitizeHtml — event-handler stripping', () => {
    it('strips onclick from a button', () => {
        const out = sanitizeHtml('<button onclick="alert(1)">x</button>');
        expect(out).not.toContain('onclick');
        expect(out).not.toContain('alert(1)');
    });

    it('strips onerror from an img', () => {
        const out = sanitizeHtml('<img src=x onerror="alert(1)">');
        expect(out).not.toContain('onerror');
        expect(out).not.toContain('alert(1)');
    });

    it('strips the inline style attribute', () => {
        const out = sanitizeHtml('<div style="position:fixed">y</div>');
        expect(out).not.toContain('style');
    });
});

describe('renderSafeMarkdown — code-block copy button', () => {
    it('renders a copy button with a data-copy payload and no inline handler', () => {
        const out = renderSafeMarkdown('```js\nconsole.log(1)\n```');
        expect(out).toContain('class="code-copy-btn"');
        expect(out).toContain('data-copy=');
        expect(out).not.toContain('onclick');
    });

    it('keeps the fenced code content inside the rendered block', () => {
        const out = renderSafeMarkdown('```js\nconst x = 42;\n```');
        expect(out).toContain('const x = 42;');
        expect(out).not.toContain('onclick');
    });
});
