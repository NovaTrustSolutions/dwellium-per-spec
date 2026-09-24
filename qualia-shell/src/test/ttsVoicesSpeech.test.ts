/**
 * stripMarkdownForSpeech (lib/ttsVoices.ts) used to delete every underscore, so user_id_map was
 * read as one word ("useridmap"). Underscores inside words now become spaces.
 */
import { describe, it, expect } from 'vitest';
import { stripMarkdownForSpeech } from '../lib/ttsVoices';

describe('stripMarkdownForSpeech', () => {
    it('reads identifiers as separate words and still drops markdown markers', () => {
        expect(stripMarkdownForSpeech('Check **user_id_map** and _the docs_ now')).toBe('Check user id map and the docs now');
        expect(stripMarkdownForSpeech('```js\nx()\n``` then `on_demand`')).toBe('code block then on demand');
        expect(stripMarkdownForSpeech('1_000_000 rows')).toBe('1000000 rows'); // a number stays one number
    });
});
