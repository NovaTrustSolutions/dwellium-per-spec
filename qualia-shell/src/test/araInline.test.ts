/**
 * ARA's inline markdown (bold / italics / code) — applied to one already-HTML-escaped line.
 * Underscores only mark italics at word boundaries (CommonMark's rule), so identifiers like
 * generate_content_free_tier_requests stay literal; code spans are never formatted inside.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatInline } from '../components/ARAConsole/araInline';

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
