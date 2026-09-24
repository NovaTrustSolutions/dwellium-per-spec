/**
 * ARA's inline markdown (bold / italics / code) — applied to one already-HTML-escaped line.
 * Underscores only mark italics at word boundaries (CommonMark's rule), so identifiers like
 * generate_content_free_tier_requests stay literal; code spans are never formatted inside.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatInline, toPlainText, toSpeechText, splitFences } from '../components/ARAConsole/araInline';

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
        const src = readFileSync(resolve(process.cwd(), 'src/components/ARAConsole/araInline.ts'), 'utf8'); // same pattern as araConsoleCss.test.ts
        expect(/[\uE000-\uF8FF]/.test(src)).toBe(false);
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
