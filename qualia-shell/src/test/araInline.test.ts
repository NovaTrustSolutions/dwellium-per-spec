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

describe('links glued to CJK (and other space-less scripts) are read as their text', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    it('Chinese, Japanese (incl. ー), Korean, Thai: speech and titles drop the URL', () => {
        const cases: [string, string][] = [
            ['请参阅[官方文档](https://docs.example.com)了解更多', '请参阅官方文档了解更多'],
            ['詳細は[ドキュメント](https://example.jp)をご覧ください', '詳細はドキュメントをご覧ください'],
            ['データー[リンク](https://x.jp)です', 'データーリンクです'],
            ['자세한 내용은[문서](https://example.kr)를 참조하세요', '자세한 내용은문서를 참조하세요'],
            ['ภาษาไทย[เอกสาร](https://x.th)', 'ภาษาไทยเอกสาร'],
            ['见图![图表](chart.png)。', '见图图表。'],
            ['来源[[1]](https://x.cn/a)。', '来源[1]。'],
        ];
        for (const [md, want] of cases) {
            expect(toPlainText(md)).toBe(want);
            expect(toSpeechText(md)).toBe(want);
        }
    });
    it('non-URL destinations glued to space-less scripts (these depend on the script list)', () => {
        const cases: [string, string][] = [
            ['ภาษาไทย[เอกสาร](เอกสาร.pdf)', 'ภาษาไทยเอกสาร'],
            ['见[租约](租约 (1).pdf)', '见租约'],
            ['ＰＤＦ[ファイル](ファイル.pdf)を', 'ＰＤＦファイルを'],
            ['注音ㄅㄆㄇ[連結](連結.html)', '注音ㄅㄆㄇ連結'],
            ['བོད[link](a.html)', 'བོདlink'],
        ];
        for (const [md, want] of cases) expect(toPlainText(md)).toBe(want);
    });
    it('a link with a URL destination glued to a Latin word or a number inside CJK text', () => {
        const cases: [string, string][] = [
            ['请参阅Python[官方文档](https://docs.python.org/3/)', '请参阅Python官方文档'],
            ['详见2024[年度报告](https://x.cn/r.pdf)', '详见2024年度报告'],
            ['iPhone[설정](https://x.kr)에서', 'iPhone설정에서'],
            ['①[公式サイト](https://x.jp)で申し込む', '①公式サイトで申し込む'],
        ];
        for (const [md, want] of cases) { expect(toPlainText(md)).toBe(want); expect(toSpeechText(md)).toBe(want); }
        expect(toPlainText('Call funcs[[1]](x) in R; fetch[i](event)')).toBe('Call funcs[[1]](x) in R; fetch[i](event)');
    });
    it('an underscore-emphasised link glued to CJK text', () => {
        const out = toSpeechText('请看_[文档](文档.pdf)_');
        expect(out).not.toMatch(/\]\(|\.pdf/);
        expect(toPlainText('snake_[i](x) and obj.__dict__[k](a)')).toBe('snake_[i](x) and obj.__dict__[k](a)');
    });
    it('the wider rules stay linear', () => {
        for (const md of ['a[b](https://'.repeat(30000), 'Python[a](http://x'.repeat(20000), '文' + '_'.repeat(100000) + '[a](b)', '文__[文](文'.repeat(30000), 'ｱ[a]('.repeat(40000)])
            expect((() => { const t0 = performance.now(); toPlainText(md); return performance.now() - t0; })()).toBeLessThan(500);
    });
    it('a glued citation number never merges into the number before it; glued Latin words get a space', () => {
        const cases: [string, string][] = [
            ['It grew in 2023[2](https://example.com/report) and again in 2024.', 'It grew in 2023[2] and again in 2024.'],
            ['EV sales hit 14 million in 2023[1](https://www.iea.org/x)[2](https://www.bloomberg.com/ev).', 'EV sales hit 14 million in 2023[1][2].'],
            ['Smith 2020[12](https://doi.org/10.1000/182)', 'Smith 2020[12]'],
            ['The population is 8.1 billion[1](https://www.un.org/pop)', 'The population is 8.1 billion[1]'],
            ['中国人口约为14亿[1](https://www.stats.gov.cn/)。', '中国人口约为14亿[1]。'],
            ['Revenue in 2023.[1](https://a.com)', 'Revenue in 2023.[1]'],
            ['see the docs[here](https://example.com) and Node.js[docs](https://nodejs.org)', 'see the docs here and Node.js docs'],
            ['as shown [1](https://a.com).', 'as shown 1.'],
        ];
        for (const [md, want] of cases) { expect(toPlainText(md)).toBe(want); expect(toSpeechText(md)).toBe(want); }
    });
    it('emphasis, marks, % and quotes around a glued link do not merge words or numbers', () => {
        const nfdCafe = 'cafe' + String.fromCharCode(0x301);
        const cases: [string, string][] = [
            ['published in _Nature_[3](https://nature.com/a).', 'published in Nature[3].'],
            ['grew in **2023**[2](https://a.com) and ~~2022~~[1](https://b.com)', 'grew in 2023[2] and 2022[1]'],
            ['grew 12%[1](https://a.com), "quoted"[2](https://b.com)', 'grew 12%[1], "quoted"[2]'],
            ['see the docs[*here*](https://x.com)', 'see the docs here'],
            ['भारत में[1](https://x.com)', 'भारत में[1]'],
            ['अधिक जानकारी[यहाँ](https://x.com) देखें', 'अधिक जानकारी यहाँ देखें'],
            [nfdCafe + '[menu](https://a.com)', nfdCafe + ' menu'],
            ['see [docs](https://a.com)[here](https://b.com)', 'see docs here'],
            ['[文档](https://a.cn)[这里](https://b.cn)', '文档这里'],
        ];
        for (const [md, want] of cases) { expect(toPlainText(md)).toBe(want); expect(toSpeechText(md)).toBe(want); }
    });
    it('citations in any script\'s digits, after commas, CJK punctuation, units or currency keep their brackets', () => {
        const cases: [string, string][] = [
            ['２０２３[１](https://a.jp)', '２０２３[１]'],
            ['人口约为１４亿[１](https://x.cn)。', '人口约为１４亿[１]。'],
            ['๒๕๖๖[๑](https://x.th)', '๒๕๖๖[๑]'],
            ['٢٠٢٣[١](https://x.eg)', '٢٠٢٣[١]'],
            ['Sales rose in 2023,[2](https://a.com) up.', 'Sales rose in 2023,[2] up.'],
            ['这是事实。[1](https://x.cn)', '这是事实。[1]'],
            ['增长了５％[1](https://x.cn)', '增长了５％[1]'],
            ['costs 5€[1](https://a.com) each; it rose 1.5°[2](https://b.com)', 'costs 5€[1] each; it rose 1.5°[2]'],
        ];
        for (const [md, want] of cases) { expect(toPlainText(md)).toBe(want); expect(toSpeechText(md)).toBe(want); }
    });
    it('a quote that opens a quotation is not "glued": a quoted year or title keeps its plain text', () => {
        expect(toPlainText('Orwell\'s "[1984](https://en.wikipedia.org/wiki/Nineteen_Eighty-Four)" is a novel.')).toBe('Orwell\'s "1984" is a novel.');
        expect(toPlainText("the film '[1917](https://imdb.com/t)' won")).toBe("the film '1917' won");
        expect(toPlainText('German »[1984](https://x.de)«')).toBe('German »1984«');
        expect(toPlainText('"quoted"[here](https://x.com)')).toBe('"quoted" here');
    });
    it('round five: elision, currency before a number, quotes around emphasis, German quotes, citation chains, speed', () => {
        const cases: [string, string][] = [
            ["Consultez l'[article](https://fr.wikipedia.org/wiki/X) pour plus", "Consultez l'article pour plus"],
            ["Tim O'[Reilly](https://en.wikipedia.org/wiki/Tim) and j’[ai](https://x.fr) vu", "Tim O'Reilly and j’ai vu"],
            ['The plan costs $[20](https://example.com/pricing) or €[5](https://x.eu) a month', 'The plan costs $20 or €5 a month'],
            ['as reported in "*Nature*"[3](https://nature.com) and "`x`"[4](https://a.com)', 'as reported in "Nature"[3] and "x"[4]'],
            ['„Nature“[3](https://nature.com), »Die Zeit«[4](https://zeit.de)', '„Nature“[3], »Die Zeit«[4]'],
            ['这是事实，[1](https://x.cn) Is it true?[2](https://a.com)', '这是事实，[1] Is it true?[2]'],
            ['Studies agree [1](https://a.org)[2](https://b.org)[3](https://c.org).', 'Studies agree [1][2][3].'],
        ];
        for (const [md, want] of cases) expect(toPlainText(md)).toBe(want);
        for (const md of ['[a' + '*'.repeat(60000) + 'b](y)', 'x[a' + '_'.repeat(60000) + 'b](https://x.com)'])
            expect((() => { const t0 = performance.now(); toPlainText(md); return performance.now() - t0; })()).toBeLessThan(500);
    });
    it('round six: CJK opening quotes, amounts written "20 €", comma-separated citation chains', () => {
        const nbsp = String.fromCharCode(0xa0);
        const cases: [string, string][] = [
            ['点击“[Settings](https://example.com/settings)”按钮', '点击“Settings”按钮'],
            ['我读了“[1984](https://zh.wikipedia.org/wiki/1984)”这本书', '我读了“1984”这本书'],
            ['これは“[AI](https://x.jp)”です', 'これは“AI”です'],
            ['他说“你好”[1](https://x.cn)', '他说“你好”[1]'],
            ['Le prix est de 20 €[1](https://source.fr) par mois.', 'Le prix est de 20 €[1] par mois.'],
            ['Der Preis: 20' + nbsp + '€[1](https://quelle.de).', 'Der Preis: 20' + nbsp + '€[1].'],
            ['In 2023 $[20](https://x.com) bought lunch', 'In 2023 $20 bought lunch'],
            ['Episodes [1](https://a.com),[2](https://b.com);[3](https://c.com)', 'Episodes [1],[2];[3]'],
            ['„Nature“[3](https://nature.com)', '„Nature“[3]'],
        ];
        for (const [md, want] of cases) expect(toPlainText(md)).toBe(want);
    });
    it('round seven: straight quotes wrapping a link after CJK, **20**€, wider citation chains, ›…‹', () => {
        const cases: [string, string][] = [
            ['点击"[Settings](https://example.com/settings)"按钮', '点击"Settings"按钮'],
            ['被称为"[996](https://zh.wikipedia.org/wiki/996)"工作制', '被称为"996"工作制'],
            ["称为'[996](https://x.cn)'工作制", "称为'996'工作制"],
            ['He said,"[1984](https://x.com)" then', 'He said,"1984" then'],
            ['他说"你好"[1](https://x.cn)', '他说"你好"[1]'],
            ['Il coûte **20**€[1](https://x.fr) par mois.', 'Il coûte 20€[1] par mois.'],
            ['Refs [1](https://a.com),[**2**](https://b.com)', 'Refs [1],[2]'],
            ['Refs [1](https://a.com)[[2]](https://b.com)', 'Refs [1][2]'],
            ['Refs [1](https://a.com)、[2](https://b.com)', 'Refs [1]、[2]'],
            ['›Die Zeit‹[hier](https://x.de) lesen, ›Die Zeit‹[4](https://x.de)', '›Die Zeit‹ hier lesen, ›Die Zeit‹[4]'],
        ];
        for (const [md, want] of cases) expect(toPlainText(md)).toBe(want);
    });
    it('round eight: straight double quotes decided by parity on the line; bold amounts before €/₽', () => {
        const cases: [string, string][] = [
            ['打开"**[Settings](https://example.com)**"页面', '打开"Settings"页面'],
            ['被称为"**[996](https://x.cn)**"工作制', '被称为"996"工作制'],
            ['他说"[Python](https://python.org)很好用"', '他说"Python很好用"'],
            ['点击"[File](https://x.com) > Open"菜单', '点击"File > Open"菜单'],
            ['Ratings: "good"[1](https://a.com)"bad"[2](https://b.com)', 'Ratings: "good"[1]"bad"[2]'],
            ['分为"高"[1](https://a.cn)"中"[2](https://b.cn)"低"[3](https://c.cn)三档', '分为"高"[1]"中"[2]"低"[3]三档'],
            ["称为'**[996](https://x.cn)**'工作制", "称为'996'工作制"],
            ['Le prix est de **20** €[1](https://source.fr) par mois.', 'Le prix est de 20 €[1] par mois.'],
            ['Цена **500** ₽[1](https://x.ru)', 'Цена 500 ₽[1]'],
            ['Costs $[20](https://x.com) today', 'Costs $20 today'],
        ];
        for (const [md, want] of cases) { expect(toPlainText(md)).toBe(want); expect(toSpeechText(md)).toBe(want); }
    });
    it('the quote counter stays linear on one long line', () => {
        const md = ('"a"[1](https://a.com) "' + '[b](https://b.com)" ').repeat(8000);
        const t0 = performance.now(); toPlainText(md); expect(performance.now() - t0).toBeLessThan(500);
    });
    it('round nine: quotations that wrap across lines, a " after a space never closes, link URLs/titles are not counted', () => {
        const cases: [string, string][] = [
            ['> "Stay hungry,\n> stay foolish."[1](https://x.com)', '"Stay hungry,\nstay foolish."[1]'],
            ['He said "this is\na claim"[source](https://a.com) today', 'He said "this is\na claim" source today'],
            ['他说"这是一个\n很长的句子"[1](https://x.cn)', '他说"这是一个\n很长的句子"[1]'],
            ['The report says "prices rose\nsharply" and "[2023](https://x.com) was a record"', 'The report says "prices rose\nsharply" and "2023 was a record"'],
            ['He said "this spans\ntwo lines" and "[Python](https://python.org) rocks"', 'He said "this spans\ntwo lines" and "Python rocks"'],
            ['See [guide](https://x.com "a \\" b") and "good"[1](https://y.com)', 'See guide and "good"[1]'],
            ['An unclosed "quote\n\nNew paragraph "good"[1](https://y.com)', 'An unclosed "quote\n\nNew paragraph "good"[1]'],
        ];
        for (const [md, want] of cases) expect(toPlainText(md)).toBe(want);
    });
    it('round ten: a closing quote after 。？！…%; or a nested quote still closes (numbers never merge)', () => {
        const cases: [string, string][] = [
            ['他表示："我们将继续努力。"[1](https://x.cn)', '他表示："我们将继续努力。"[1]'],
            ['他问："真的吗？"[1](https://x.cn)', '他问："真的吗？"[1]'],
            ['他说："我们会赢。"[1](https://x.cn)2024年的数据显示', '他说："我们会赢。"[1]2024年的数据显示'],
            ['He said, "We will keep going…"[1](https://x.com)', 'He said, "We will keep going…"[1]'],
            ['Adoption reached "over 50%"[1](https://x.com).', 'Adoption reached "over 50%"[1].'],
            ['"Wait…"[source](https://a.com) and more', '"Wait…" source and more'],
            ['他表示：“我们将继续努力。”[1](https://x.cn)', '他表示：“我们将继续努力。”[1]'],
            ['He said "[1984](https://x.com)" then', 'He said "1984" then'],
        ];
        for (const [md, want] of cases) { expect(toPlainText(md)).toBe(want); expect(toSpeechText(md)).toBe(want); }
    });
    it('confirmation pass: an opening “ ‘ after ： ， — : is still opening', () => {
        const cases: [string, string][] = [
            ['我读了：“[1984](https://zh.wikipedia.org/wiki/1984)”这本书', '我读了：“1984”这本书'],
            ['他说：“[Python](https://python.org)”很好用', '他说：“Python”很好用'],
            ['然后，“[GitHub](https://github.com)”上线了', '然后，“GitHub”上线了'],
            ['他说：‘[Python](https://python.org)’很好用', '他说：‘Python’很好用'],
            ['The answer—“[42](https://x.com)”—is famous.', 'The answer—“42”—is famous.'],
            ['Options:“[Settings](https://x.com)” and more', 'Options:“Settings” and more'],
        ];
        for (const [md, want] of cases) { expect(toPlainText(md)).toBe(want); expect(toSpeechText(md)).toBe(want); }
    });
    it('Latin-script code glued to a word is still not a link', () => {
        expect(toPlainText('call handlers[i](event) and obj.__dict__[k](a)')).toBe('call handlers[i](event) and obj.__dict__[k](a)');
    });
    it('stays linear', () => {
        for (const md of ['文[a]('.repeat(40000), '文[文](文'.repeat(30000), 'ー![a]('.repeat(30000)])
            expect(time(() => toPlainText(md))).toBeLessThan(500);
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
