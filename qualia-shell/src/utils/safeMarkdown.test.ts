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
import { toSpeechText, OPEN, CLOSE } from '../lib/markdownText';

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

describe('renderSafeMarkdown — shared fence and code-span rules (Stella, Hydra, Antigravity, …)', () => {
    const parse = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
    const blocks = (md: string) => [...parse(renderSafeMarkdown(md)).querySelectorAll('.code-block pre code')].map(c => c.textContent);

    it('shows a code block exactly where speech says "code block" (one scanner for screen and speech)', () => {
        const cases = [
            'Intro:\n```js\nx()\n```\nDone.',                                               // plain fence
            '````md\n```js\nx\n```\n````\nAfter.',                                          // 4-backtick fence around a 3-backtick one
            'Run this: ```bash\nnpm install\n```\nThen reload.',                            // opened mid-line: not a fence
            'Example:\n```js\nconst x = 1;\n``` and that prints 1.',                        // text after the closing fence: not a fence
            'You wrote:\n> ```bash\n> npm install\n> ```\nThat should work.',               // quoted
            '```\nstill streaming',                                                         // unclosed
            '- step:\n    ```bash\n    npm i\n    ```\n- next',                             // 4-space fence under a bullet
            'Here:\n```python\ndef f():\n    """Doc.\n    ```\n    f()\n    ```\n    """\n```\nEnd.', // indented ``` inside the code
        ];
        for (const md of cases) {
            const shown = blocks(md).length;
            const spoken = (toSpeechText(md).match(/code block/g) ?? []).length;
            expect({ md, shown }).toEqual({ md, shown: spoken });
        }
    });

    it('never runs markdown inside a code block (# comment is not a heading, - x is not a list)', () => {
        const out = renderSafeMarkdown('```python\n# comment\n- item\n**x** and *y*\n```');
        expect(blocks('```python\n# comment\n- item\n**x** and *y*\n```')).toEqual(['# comment\n- item\n**x** and *y*']);
        expect(out).not.toMatch(/<h\d|<li|<strong|<em/);
    });

    it('the Copy button copies the real code, not HTML entities', () => {
        const btn = parse(renderSafeMarkdown('```js\nif (a < b && c > d) x();\n```')).querySelector('.code-copy-btn') as HTMLElement;
        expect(decodeURIComponent(btn.dataset.copy ?? '')).toBe('if (a < b && c > d) x();');
    });

    it('keeps the first line\'s indentation and shows <, & as text', () => {
        expect(blocks('```\n    indented\nnext <b>&\n```')).toEqual(['    indented\nnext <b>&']);
    });

    it('labels any info string (c++, not only \\w+) and escapes it', () => {
        const d = parse(renderSafeMarkdown('```c++\nint x;\n```'));
        expect(d.querySelector('.code-lang')?.textContent).toBe('c++');
        expect(blocks('```c++\nint x;\n```')).toEqual(['int x;']);
    });

    it('never formats inside inline code; ``double`` spans work', () => {
        const d = parse(renderSafeMarkdown('use `a**b**c` and ``x `y` z`` now'));
        expect([...d.querySelectorAll('code.inline-code')].map(c => c.innerHTML)).toEqual(['a**b**c', 'x `y` z']);
    });

    it('still escapes raw HTML and strips handlers everywhere', () => {
        const d = parse(renderSafeMarkdown('<img src=x onerror=alert(1)> `<b onclick=x>` \n```\n<script>alert(1)</script>\n```\n**<i onmouseover=x>hi</i>**'));
        expect(d.querySelectorAll('img, script, i, b').length).toBe(0);
        expect([...d.querySelectorAll('*')].flatMap(el => [...el.attributes].map(a => a.name)).filter(n => n.startsWith('on'))).toEqual([]);
        expect(blocks('```\n<script>alert(1)</script>\n```')).toEqual(['<script>alert(1)</script>']);
    });
});

describe('renderSafeMarkdown — review fixes', () => {
    const parse = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
    it('a fence the scanner rejects stays as plain lines, not one squashed inline span', () => {
        for (const md of ['Run this: ```bash\nnpm install\nnpm run build\n```\nThen reload.', 'Try this:\n```python\nimport os\nprint(os.getcwd())```\nThat prints the cwd.']) {
            const out = renderSafeMarkdown(md);
            expect(parse(out).querySelectorAll('code.inline-code').length).toBe(0);
            expect(out).toMatch(/npm install<br>npm run build|import os<br>print\(os\.getcwd\(\)\)/);
        }
    });
    it('a stray backtick does not swallow the heading and list lines after it', () => {
        const d = parse(renderSafeMarkdown('The backtick (`) key.\n## Setup\nRun `npm i`.'));
        expect(d.querySelector('h4')?.textContent).toBe('Setup');
        expect([...d.querySelectorAll('code.inline-code')].map(c => c.textContent)).toEqual(['npm i']);
    });
    it('a lone surrogate (an emoji cut in half) in a code block does not throw', () => {
        const md = '~~~\nemoji ' + String.fromCharCode(0xd83d) + ' cut\n~~~';
        const btn = parse(renderSafeMarkdown(md)).querySelector('.code-copy-btn') as HTMLElement;
        expect(decodeURIComponent(btn.dataset.copy ?? '')).toBe('emoji ' + String.fromCharCode(0xfffd) + ' cut');
    });
    it('blank lines just inside the fence are not shown or copied; indentation is kept', () => {
        const d = parse(renderSafeMarkdown('```python\n\n    x = 1\n\n```'));
        expect(d.querySelector('pre code')?.textContent).toBe('    x = 1');
        expect(decodeURIComponent((d.querySelector('.code-copy-btn') as HTMLElement).dataset.copy ?? '')).toBe('    x = 1');
    });
});

describe('renderSafeMarkdown — second review', () => {
    const parse = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
    it('a long run of blank lines inside a code block stays fast', () => {
        const t0 = performance.now();
        renderSafeMarkdown('```\na' + '\n'.repeat(40000) + 'b\n```');
        expect(performance.now() - t0).toBeLessThan(1500);
    });
    it('a code block of only blank lines shows and copies nothing', () => {
        const d = parse(renderSafeMarkdown('```\n  \n  \n```'));
        expect(d.querySelector('pre code')?.textContent).toBe('');
        expect((d.querySelector('.code-copy-btn') as HTMLElement).dataset.copy).toBe('');
    });
    it('placeholder characters in the text never pull in another code span', () => {
        const d = parse(renderSafeMarkdown(OPEN + '0' + CLOSE + ' means "run".\nThen type `rm -rf build`.'));
        expect([...d.querySelectorAll('code.inline-code')].map(c => c.textContent)).toEqual(['rm -rf build']);
    });
});

describe('renderSafeMarkdown — third review', () => {
    it('private-use characters inside a code block are copied as they are', () => {
        const code = 'icon ' + OPEN + CLOSE + ' here';
        const d = document.createElement('div'); d.innerHTML = renderSafeMarkdown('```\n' + code + '\n```');
        expect(decodeURIComponent((d.querySelector('.code-copy-btn') as HTMLElement).dataset.copy ?? '')).toBe(code);
    });
});

describe('renderSafeMarkdown — fourth review', () => {
    it('keeps a real private-use glyph inside inline code', () => {
        const g = String.fromCharCode(0xe000);
        const d = document.createElement('div'); d.innerHTML = renderSafeMarkdown('Glyph `' + g + '` here');
        expect(d.querySelector('code.inline-code')?.textContent).toBe(g);
    });
});
