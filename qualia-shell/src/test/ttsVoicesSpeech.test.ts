/**
 * stripMarkdownForSpeech (lib/ttsVoices.ts) used to delete every underscore, so user_id_map was
 * read as one word ("useridmap"). Underscores inside words now become spaces.
 */
import { describe, it, expect } from 'vitest';
import { stripMarkdownForSpeech } from '../lib/ttsVoices';

describe('stripMarkdownForSpeech', () => {
    it('reads identifiers as separate words and still drops markdown markers', () => {
        expect(stripMarkdownForSpeech('Check **user_id_map** and _the docs_ now')).toBe('Check user id map and the docs now');
        expect(stripMarkdownForSpeech('```js\nx()\n```\nthen `on_demand`')).toBe('code block. then on demand');
        expect(stripMarkdownForSpeech('1_000_000 rows')).toBe('1000000 rows'); // a number stays one number
    });

    it('uses the same fence rules as ARA (Stella speaks through this)', () => {
        expect(stripMarkdownForSpeech('```npm install``` fails')).toBe('npm install fails');
        expect(stripMarkdownForSpeech('````md\n```js\nx\n```\n````\nAfter.')).toBe('code block. After.');
        expect(stripMarkdownForSpeech('Type ``` to start a fence.\nThen write code.\n```js\nx\n```\nDone.'))
            .toBe('Type to start a fence. Then write code. code block. Done.');
    });

    it('only thousands groups are joined; dates in identifiers stay separate numbers', () => {
        expect(stripMarkdownForSpeech('snapshot_2024_09_24 and 1_000_000')).toBe('snapshot 2024 09 24 and 1000000');
    });

    it('a line break is a pause, so list items and headings do not run together', () => {
        expect(stripMarkdownForSpeech('**Summary:**\n- Item one\n- Item two\n\n**Next steps:**\n1. Do A\n2. Do B'))
            .toBe('Summary: Item one. Item two. Next steps: Do A. Do B');
    });

    it('still drops # > | anywhere, as Stella always did', () => {
        expect(stripMarkdownForSpeech('Tag #urgent | col > x')).toBe('Tag urgent col x');
    });
});
