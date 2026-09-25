/**
 * ARA's inline markdown (bold / italics / code) — applied to one already-HTML-escaped line.
 * Underscores only mark italics at word boundaries (CommonMark's rule), so identifiers like
 * generate_content_free_tier_requests stay literal; code spans are never formatted inside.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatInline, toPlainText, toSpeechText, splitFences } from '../components/ARAConsole/araInline';
import { OPEN, CLOSE, spanText } from '../lib/markdownText';

describe('formatInline', () => {
    it('leaves underscores inside words alone', () => {
        expect(formatInline('generate_content_free_tier_requests')).toBe('generate_content_free_tier_requests');
        expect(formatInline('snake_case and SCREAMING_SNAKE_CASE')).toBe('snake_case and SCREAMING_SNAKE_CASE');
        expect(formatInline('__init__ and a_b_c')).toBe('__init__ and a_b_c');
        expect(formatInline('café_au_lait')).toBe('café_au_lait');
    });

    it('still italicises _text_ at word boundaries', () => {
        expect(formatInline('see _the docs_ now')).toBe('see <em>the docs</em> now');
        expect(formatInline('_start_ and (_wrapped_).')).toBe('<em>start</em> and (<em>wrapped</em>).');
        expect(formatInline('snake_case then _real_')).toBe('snake_case then <em>real</em>');
    });

    it('never formats inside code spans', () => {
        expect(formatInline('`org_01abc` on `on_demand`')).toBe('<code>org_01abc</code> on <code>on_demand</code>');
        expect(formatInline('`**not bold**` and **bold**')).toBe('<code>**not bold**</code> and <strong>bold</strong>');
        expect(formatInline('`a_b_` then _x_')).toBe('<code>a_b_</code> then <em>x</em>');
    });

    it('keeps bold and asterisk italics working as before', () => {
        expect(formatInline('**Researcher failed:** reason')).toBe('<strong>Researcher failed:</strong> reason');
        expect(formatInline('an *emphasised* word')).toBe('an <em>emphasised</em> word');
    });

    it('italics can span a code span, and *…* wraps text that contains underscores', () => {
        expect(formatInline('_see `x_y` here_')).toBe('<em>see <code>x_y</code> here</em>');
        expect(formatInline('*check user_id_map and `on_demand`*')).toBe('<em>check user_id_map and <code>on_demand</code></em>');
    });

    it('_…_ italics may contain in-word underscores (CommonMark), and combining marks count as letters', () => {
        expect(formatInline('see _the user_id column_ here')).toBe('see <em>the user_id column</em> here');
        expect(formatInline('_check user_id_map and `on_demand`_')).toBe('<em>check user_id_map and <code>on_demand</code></em>');
        expect(formatInline('सूची_नाम_ ok')).toBe('सूची_नाम_ ok');                      // Devanagari vowel signs are marks
        expect(formatInline('re\u0301sume\u0301_draft_ v2')).toBe('re\u0301sume\u0301_draft_ v2'); // decomposed accents
        expect(formatInline('generate_content_free_tier_requests')).toBe('generate_content_free_tier_requests');
    });

    it('the source uses escaped placeholder characters, never invisible raw ones', () => {
        for (const f of ['src/components/ARAConsole/araInline.ts', 'src/lib/markdownText.ts', 'src/utils/safeMarkdown.ts']) {
            const src = readFileSync(resolve(process.cwd(), f), 'utf8'); // same pattern as araConsoleCss.test.ts
            expect(/[\uE000-\uF8FF\uFDD0-\uFDEF]/.test(src), f).toBe(false);
        }
    });
});

describe('toPlainText (note titles) and toSpeechText (read aloud)', () => {
    it('removes markdown markers but keeps underscores inside words and hyphens', () => {
        expect(toPlainText('Fix **user_id_map** for the follow-up on 2026-09-24 in `on_demand`'))
            .toBe('Fix user_id_map for the follow-up on 2026-09-24 in on_demand');
        expect(toPlainText('## Heading\n- bullet _one_\n> quoted *two*')).toBe('Heading\nbullet one\nquoted two');
        expect(toPlainText('see `a*b*c` literally')).toBe('see a*b*c literally');
        expect(toPlainText('run:\n```bash\nls -la\n```\ndone')).toBe('run:\nls -la\ndone'); // titles keep the code
        expect(toSpeechText('run:\n```bash\nls -la\n```\ndone')).toBe('run:\ncode block\ndone'); // speech says "code block"
    });

    it('reads identifiers as words: underscores inside words become spaces', () => {
        expect(toSpeechText('Check user_id_map and _the docs_')).toBe('Check user id map and the docs');
        expect(toSpeechText('generate_content_free_tier_requests')).toBe('generate content free tier requests');
    });

    it('inline triple backticks are a code span, not a fence', () => {
        expect(toPlainText('```npm install``` fails with EACCES')).toBe('npm install fails with EACCES');
    });

    it('titles lose markers only: nested quotes, any-depth bullets, rules, bold across lines, ``double`` spans, links', () => {
        const flat = (x: string) => toPlainText(x).replace(/\s+/g, ' ').trim();
        expect(flat('>> nested quote\n    - nested four\n---\n**multi\nline bold** and ``double``'))
            .toBe('nested quote nested four multi line bold and double');
        expect(flat('Visit [the_docs](https://a.com/x_y) now ![chart](http://a/b.png)')).toBe('Visit the_docs now chart');
        expect(flat('Please review:\n```\nSELECT * FROM users\n```')).toBe('Please review: SELECT * FROM users');
    });

    it('speech never reads leftover markers, keeps numbers whole', () => {
        expect(toSpeechText('call _private_var first')).toBe('call private var first');
        expect(toSpeechText('1_000_000 rows')).toBe('1000000 rows');
        expect(toSpeechText('~~strike~~ and --- then').replace(/\s+/g, ' ')).toBe('strike and --- then');
        expect(toSpeechText('a\n---\nb')).toBe('a\n\nb'); // a separator line is not read aloud
    });
});

describe('second review pass', () => {
    const flat = (x: string) => toPlainText(x).replace(/\s+/g, ' ').trim();
    it('code spans never start inside a backtick run and never glue words together', () => {
        expect(flat('Use ``` to open a fence and `x` inline')).toBe('Use to open a fence and x inline');
        expect(flat('```\ncode\n```after')).toBe('code after');
        expect(flat('Use the ` key\nthen `foo` runs')).toBe('Use the key then foo runs');
        expect(flat('print(`hi`)')).toBe('print(hi)');
    });
    it('no raw backticks survive in titles, even from an unclosed fence', () => {
        expect(flat('Here is the script:\n```python\nimport os\nprint(`hi`)')).toBe('Here is the script: python import os print(hi)');
        expect(flat('text\n```')).toBe('text');
    });
    it('bracket calls are code, not links', () => {
        expect(flat('why does handlers[i](event) throw')).toBe('why does handlers[i](event) throw');
        expect(flat('see [the docs](https://a.com)')).toBe('see the docs');
    });
    it('nested line markers all go; ordered-list numbers stay in titles', () => {
        expect(flat('> - quoted bullet')).toBe('quoted bullet');
        expect(flat('- > c')).toBe('c');
        expect(flat('2024. was a year\n1) first item')).toBe('2024. was a year 1) first item');
    });
    it('speech keeps meaningful * and ~, drops marker-shaped ones, reads list numbers as before', () => {
        expect(toSpeechText('Run `SELECT * FROM users` now')).toBe('Run SELECT * FROM users now');
        expect(toSpeechText('5 * 3 = 15, about ~5 minutes, path ~/Downloads')).toBe('5 * 3 = 15, about ~5 minutes, path ~/Downloads');
        expect(toSpeechText('call _private_var and **bold')).toBe('call private var and bold');
        expect(toSpeechText('1. Install it')).toBe('Install it');
    });
    it('the chat renderer treats ```x``` as one code span (no stray backticks)', () => {
        expect(formatInline('```npm install``` fails')).toBe('<code>npm install</code> fails');
        expect(formatInline('``a `b` c``')).toBe('<code>a `b` c</code>');
    });
});

describe('third round', () => {
    it('only thousands groups are joined when speaking numbers', () => {
        expect(toSpeechText('snapshot_2024_09_24')).toBe('snapshot 2024 09 24');
        expect(toSpeechText('matrix_1_2')).toBe('matrix 1 2');
        expect(toSpeechText('1_000_000 rows and 12_345')).toBe('1000000 rows and 12345');
    });
    it('a fence indented 4+ spaces under a list item is still a fence', () => {
        const code = splitFences('- step:\n    ```bash\n    npm i\n    ```\n- next').filter(b => b.kind === 'code').map(b => b.lines.join('\n'));
        expect(code).toEqual(['npm i']);
    });
});

describe('third round, review fixes', () => {
    const code = (md: string) => splitFences(md).filter(b => b.kind === 'code').map(b => b.lines.join('\n'));
    it('an indented ``` inside the code (a docstring example) does not end the block', () => {
        const md = 'Here is the helper:\n```python\ndef add(a, b):\n    """Add two numbers.\n\n    Example:\n    ```\n    add(1, 2)\n    ```\n    """\n    return a + b\n```\nCall it from main.';
        expect(code(md)).toEqual(['def add(a, b):\n    """Add two numbers.\n\n    Example:\n    ```\n    add(1, 2)\n    ```\n    """\n    return a + b']);
        expect(toSpeechText(md)).toBe('Here is the helper:\ncode block\nCall it from main.');
    });
    it('a stray indented ``` in text does not pair with a later top-level fence', () => {
        const md = 'To start a fence, type three backticks:\n\n    ```\n\nThen write your code and close it:\n\n```js\nconsole.log(1)\n```\nThat is all.';
        expect(code(md)).toEqual(['console.log(1)']);
        expect(toSpeechText(md)).toContain('Then write your code and close it:');
    });
    it('an unclosed nested fence does not swallow the next list item', () => {
        expect(code('1. Install:\n    ```bash\n    npm i\n2. Configure:\n```js\nexport default {}\n```\nDone.')).toEqual(['export default {}']);
    });
    it('only a whole grouped number is joined; a trailing _001 in a name stays separate', () => {
        expect(toSpeechText('backup_2024_09_24_001.sql')).toBe('backup 2024 09 24 001.sql');
        expect(toSpeechText('model_v2_001')).toBe('model v2 001');
        expect(toSpeechText('$1_000.50 and 1_000_000 rows')).toBe('$1000.50 and 1000000 rows');
    });
});

describe('review of the renderer move: scanner speed and per-line code spans', () => {
    // The previous splitFences, verbatim: one forward search per opener (the reference for the fast version).
    const width = (s: string) => s.replace(/\t/g, '    ').length;
    function naive(md: string) {
        const lines = md.replace(/\r\n?/g, '\n').split('\n');
        const out: { kind: string; lines: string[]; start: number; info?: string }[] = [];
        let text: string[] = []; let textStart = 0;
        const flush = () => { if (text.length) out.push({ kind: 'text', lines: text, start: textStart }); text = []; };
        for (let i = 0; i < lines.length; i++) {
            const open = lines[i].match(/^([ \t]*)(`{3,}|~{3,})([^`]*)$/);
            const close = open && new RegExp(`^([ \\t]*)${open[2][0]}{${open[2].length},}[ \\t]*$`);
            const end = close ? lines.findIndex((l, k) => { const m = k > i && l.match(close); return !!m && Math.abs(width(m[1]) - width(open![1])) <= 3; }) : -1;
            if (!open || end === -1) { if (!text.length) textStart = i; text.push(lines[i]); continue; }
            flush();
            const indent = new RegExp(`^[ \\t]{0,${open[1].length}}`);
            out.push({ kind: 'code', lines: lines.slice(i + 1, end).map(l => l.replace(indent, '')), start: i, info: open[3].trim() });
            i = end;
        }
        flush();
        return out;
    }
    it('gives exactly the same blocks as the simple search on 600 random documents', () => {
        const pool = ['```', '````', '`````', '~~~', '~~~~', '```js', '```` md', '~~~ py', '  ```', '   ````', '    ```', '        ```', '\t```', ' \t~~~', 'text', 'a ``` b', '', '```x```', '- item', '    code'];
        let seed = 42; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
        let withCode = 0;
        for (let t = 0; t < 600; t++) {
            const md = Array.from({ length: 1 + rnd(14) }, () => pool[rnd(pool.length)]).join('\n');
            expect(splitFences(md)).toEqual(naive(md));
            if (naive(md).some(b => b.kind === 'code')) withCode++;
        }
        expect(withCode).toBeGreaterThan(150); // the sample really exercises fences
    });
    it('stays fast on thousands of unclosed fences (hostile or garbled text)', () => {
        const md = '```x\n'.repeat(50000);
        const t0 = performance.now();
        const blocks = splitFences(md);
        expect(performance.now() - t0).toBeLessThan(1500);
        expect(blocks.every(b => b.kind === 'text')).toBe(true);
    });
    it('code spans never cross a line in speech: a stray ` does not pair with a later span', () => {
        expect(toSpeechText('Press ` to open the console.\n```js\nx()\n```\nCall `__init__` or `*args`.'))
            .toContain('Call __init__ or *args.');
    });
});

describe('second review of the renderer move: no more freezes, placeholders are ours only', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    it('a long code span that starts with a space stays fast (spanText)', () => {
        expect(time(() => toSpeechText('value: ` ' + 'A'.repeat(80000) + '`'))).toBeLessThan(500);
        // CommonMark: one space is stripped from each end only when both ends have one and it isn't all spaces
        expect([' a ', '  ', ' a', 'a ', '  a  ', ' '].map(spanText)).toEqual(['a', '  ', ' a', 'a ', ' a ', ' ']);
        const old = (c: string) => { const t = c.replace(/\n/g, ' '); return /^ [\s\S]*[^ ][\s\S]* $/.test(t) ? t.slice(1, -1) : t; };
        let seed = 7; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
        for (let i = 0; i < 5000; i++) {
            const c = Array.from({ length: rnd(9) }, () => ' a\n\t'[rnd(4)]).join('');
            expect(spanText(c)).toBe(old(c));
        }
    });
    it('a long run of [ stays fast in speech and titles (link/image passes)', () => {
        expect(time(() => toSpeechText('['.repeat(80000)))).toBeLessThan(500);
        expect(time(() => toPlainText('!['.repeat(40000)))).toBeLessThan(500);
        expect(toPlainText('see [the docs](https://x.y) and ![logo](a.png)')).toBe('see the docs and logo');
    });
    it('placeholder characters in the text are not read back as code spans', () => {
        const fake = OPEN + '0' + CLOSE;
        expect(toSpeechText(fake + ' means run. Then type `rm -rf build`.')).not.toMatch(/rm -rf build[\s\S]*rm -rf build/);
    });
});

describe('third review of the renderer move: every pass stays linear', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    it('a long ~~~…~ line ending in a backtick does not freeze the fence scanner', () => {
        expect(time(() => splitFences('~'.repeat(100000) + '`'))).toBeLessThan(500);
        expect(time(() => splitFences('```\n' + '~'.repeat(100000) + '`\n```'))).toBeLessThan(500);
        expect(splitFences('~~~~ js\nx\n~~~~').map(b => b.info)).toEqual(['js']);
    });
    it('the faster opener and speech-sweep regexes match the old ones on random input', () => {
        const oldOpen = /^([ \t]*)(`{3,}|~{3,})([^`]*)$/, newOpen = /^([ \t]*)(`{3,}|~{3,}(?!~))([^`]*)$/;
        const oldSweep = /[*_~]+(?=\p{L})|(?<=\p{L})[*_~]+/gu, newSweep = /(?<![*_~])(?:[*_~]+(?=\p{L})|(?<=\p{L})[*_~]+)/gu;
        let seed = 11; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
        for (let i = 0; i < 20000; i++) {
            const line = Array.from({ length: rnd(12) }, () => ' \t`~ax'[rnd(6)]).join('');
            expect(newOpen.exec(line)).toEqual(oldOpen.exec(line));
            const t = Array.from({ length: rnd(12) }, () => '*_~a. '[rnd(6)]).join('');
            expect(t.replace(newSweep, '')).toBe(t.replace(oldSweep, ''));
        }
    });
    it('a long run of _ with no letter after it does not freeze speech', () => {
        expect(time(() => toSpeechText('1' + '_'.repeat(100000)))).toBeLessThan(500);
        expect(toSpeechText('the __init__ and *args are *key*')).toBe('the init and args are key');
    });
    it('links whose ) never comes stay fast and keep the text after them', () => {
        for (const md of ['[a]('.repeat(50000), '![a]('.repeat(40000), '[a](b\n'.repeat(33000), '[[a]]('.repeat(33000), '[[a]'.repeat(48000)])
            expect(time(() => toPlainText(md))).toBeLessThan(500);
        expect(toPlainText('[docs](https://x.y/z\n\nMore text here (and a note).')).toContain('More text here (and a note).');
    });
    it('link forms: titles, parentheses in the URL, citation brackets; code calls untouched', () => {
        expect(toPlainText('see [a](https://x.y "Title") and [Foo](https://en.wikipedia.org/wiki/Foo_(bar)) end')).toBe('see a and Foo end');
        expect(toSpeechText('Rates rose 3% [[1]](https://www.reuters.com/x) today.')).toBe('Rates rose 3% [1] today.');
        expect(toPlainText('call handlers[i](event) now')).toBe('call handlers[i](event) now');
    });
});

describe('fourth review: CommonMark link shapes, image alt brackets, real private-use glyphs', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    it('strips every CommonMark link destination/title shape (speech and titles)', () => {
        const cases: [string, string][] = [
            ["Read [the guide](https://x.com/guide 'Guide') first.", 'Read the guide first.'],
            ['Open [My Notes](<./My Notes.md>) now.', 'Open My Notes now.'],
            ['See ![chart](<my chart.png>) here.', 'See chart here.'],
            ['Read [the guide]( https://x.com/guide ) first.', 'Read the guide first.'],
            ['Read [the guide](https://x.com/guide "Guide" ) first.', 'Read the guide first.'],
            ['Read [the guide](https://x.com/guide "the \\"best\\" one") first.', 'Read the guide first.'],
            ['Read [the guide](https://x.com/a\\(b) first.', 'Read the guide first.'],
            ['Read [t](u (Title)) first.', 'Read t first.'],
            ['See ![Figure [1]](fig.png) here.', 'See Figure [1] here.'],
        ];
        for (const [md, want] of cases) {
            expect(toPlainText(md)).toBe(want);
            expect(toSpeechText(md)).toBe(want);
        }
        expect(toPlainText('call handlers[i](event) now')).toBe('call handlers[i](event) now');
        expect(toPlainText('[docs](https://x.y/z\nmore')).toBe('[docs](https://x.y/z\nmore');
    });
    it('the richer link pattern stays linear on adversarial input', () => {
        for (const md of ['[a](<'.repeat(40000), '[a]( '.repeat(40000), '[a](\\'.repeat(40000), "[a](b '".repeat(30000), '[a](b ('.repeat(30000), '[a](b "\\'.repeat(28000), '![[a]]('.repeat(28000)])
            expect(time(() => toSpeechText(md))).toBeLessThan(500);
    });
    it('a real private-use glyph (U+E000, e.g. an icon font) is kept on every surface, even in inline code', () => {
        const g = String.fromCharCode(0xe000);
        expect(toSpeechText('Glyph `' + g + '` here')).toBe('Glyph ' + g + ' here');
        expect(toPlainText('Glyph `' + g + '` here')).toBe('Glyph ' + g + ' here');
        expect(formatInline('Glyph `' + g + '` here')).toBe('Glyph <code>' + g + '</code> here');
    });
});

describe('fifth review: link destinations with spaces, and blank runs', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    it('a long run of blanks after "](" with no ")" stays fast', () => {
        expect(time(() => toSpeechText('[a](' + ' '.repeat(100000) + 'x'))).toBeLessThan(500);
        expect(time(() => toPlainText('![a](' + '\t'.repeat(100000) + 'x'))).toBeLessThan(500);
        expect(time(() => toPlainText('[a](' + 'b '.repeat(50000)))).toBeLessThan(500);
        expect(time(() => toPlainText('[a](b c'.repeat(30000)))).toBeLessThan(500);
    });
    it('links and images to file names with spaces are still read as their text', () => {
        expect(toSpeechText('Open [Q3 Report](Q3 Report.pdf) now. See ![Floor plan](images/floor plan.png).')).toBe('Open Q3 Report now. See Floor plan.');
        expect(toPlainText('[Lease Agreement](/files/Lease Agreement.pdf)')).toBe('Lease Agreement');
        expect(toPlainText('[a](https://x.com/?q=a b)')).toBe('a');
        expect(toPlainText('[a]( http://x.com ) [b](  ) [c](   "t")')).toBe('a [b](  ) c'); // a blank destination is not a link (Swift [Int]())
    });
});

describe('sixth review: link shapes speech should never read aloud', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    it('file names with spaces and parentheses, tel: numbers', () => {
        expect(toSpeechText('Signed copy: [Lease Agreement (signed).pdf](/files/Lease Agreement (signed).pdf) is ready.')).toBe('Signed copy: Lease Agreement (signed).pdf is ready.');
        expect(toSpeechText('See ![Screenshot](Screenshot 2024-05-01 at 10.00.00 (2).png) above.')).toBe('See Screenshot above.');
        expect(toPlainText('Reach them: [Call the landlord](tel:+1 (555) 123-4567).')).toBe('Reach them: Call the landlord.');
    });
    it('a citation glued to a word, an underscore-emphasised link, a badge link', () => {
        expect(toPlainText('Mercury[[1]](https://en.wikipedia.org/wiki/Mercury_(planet)) is the smallest planet.')).toBe('Mercury[1] is the smallest planet.');
        expect(toPlainText('_[Reuters](https://www.reuters.com/x)_ said so; _![logo](https://x.com/l.png)_')).toBe('Reuters said so; logo');
        expect(toPlainText('Build: [![](https://x.io/badge.svg)](https://ci.example.com/job/1) passing')).not.toMatch(/ci\.example|\]\(/);
        expect(toPlainText('snake_[i](x) and handlers[i](event)')).toBe('snake_[i](x) and handlers[i](event)');
    });
    it('the wider patterns stay linear', () => {
        for (const md of ['[a]((x)'.repeat(30000), '[a](' + '(x)'.repeat(60000), '[a](b (c'.repeat(30000), 'a[[1]]('.repeat(30000), '_[a](_'.repeat(35000), '[](['.repeat(50000)])
            expect(time(() => toPlainText(md))).toBeLessThan(500);
    });
});

describe('seventh review: bare code that looks like a link is left alone', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    it('C++ lambdas, Swift empty initialisers, dunder and R list calls are not links', () => {
        for (const code of ['sort(v.begin(), v.end(), [](int a, int b) { return a > b; });', 'let empty = [Int]() and let dict = [String: Any]()',
            'obj.__dict__[name](arg) calls it', 'Call funcs[[1]](x) in R', 'value = table[["fn"]](x)'])
            expect(toPlainText(code)).toBe(code);
    });
    it('real links still go: badge, glued citation, _emphasis_, two-level parens', () => {
        expect(toPlainText('Build: [![](https://x.io/badge.svg)](https://ci.example.com/job/1) passing')).toBe('Build:  passing');
        expect(toPlainText('Mercury[[1]](https://en.wikipedia.org/wiki/Mercury_(planet)) is small.')).toBe('Mercury[1] is small.');
        expect(toPlainText('_[the docs](https://x.io)_')).toBe('the docs');
        expect(toSpeechText('Text with [link](https://a.com/((x))) end')).toBe('Text with link end');
    });
    it('still linear', () => {
        for (const md of ['[a](x(y(z'.repeat(25000), '[a]((('.repeat(30000), '[[a]](http://'.repeat(14000), 'a' + '_'.repeat(100000) + '[x](y)',
            '[](int'.repeat(30000), '[![](x)]('.repeat(20000), '_[a](('.repeat(30000), '[a](' + ' '.repeat(100000) + ')x'])
            expect(time(() => toPlainText(md))).toBeLessThan(500);
    });
});

describe('eighth review: images with an empty source', () => {
    it('![alt]() placeholders are still read as their alt text; a blank link destination is still code', () => {
        expect(toPlainText('Screenshot placeholder: ![Screenshot]() goes here')).toBe('Screenshot placeholder: Screenshot goes here');
        expect(toSpeechText('Image: ![alt]( ).')).toBe('Image: alt.');
        expect(toPlainText('let empty = [Int]()')).toBe('let empty = [Int]()');
    });
});

describe('splitFences', () => {
    const code = (md: string) => splitFences(md).filter(b => b.kind === 'code').map(b => b.lines.join('\n'));
    it('closes only on a fence at least as long as the opener; ~~~ works too', () => {
        expect(code('````md\n```js\nx\n```\n````\nAfter.')).toEqual(['```js\nx\n```']);
        expect(code('~~~\nplain\n~~~')).toEqual(['plain']);
    });
    it('strips the fence\'s own indent from the code lines', () => {
        expect(code('1. Install:\n   ```bash\n   npm i\n   ```\n2. Run it.')).toEqual(['npm i']);
    });
    it('a fence with no closing line is left as text (no swallowing, no flicker while streaming)', () => {
        expect(code('- ```bash\n  npm i\n  ```\nDone.')).toEqual([]);
        expect(code('```\nstill streaming')).toEqual([]);
    });
    it('handles CRLF line endings', () => {
        expect(code('```\r\nx\r\n```\r\n')).toEqual(['x']);
    });
});
