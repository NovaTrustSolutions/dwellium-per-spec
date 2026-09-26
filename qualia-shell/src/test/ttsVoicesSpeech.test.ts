/**
 * stripMarkdownForSpeech (lib/ttsVoices.ts) used to delete every underscore, so user_id_map was
 * read as one word ("useridmap"). Underscores inside words now become spaces.
 */
import { describe, it, expect } from 'vitest';
import { stripMarkdownForSpeech } from '../lib/ttsVoices';
import { chunkForTts, speechPauses, toSpeechText } from '../lib/markdownText';

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

    it('a line ending in CJK/fullwidth punctuation, or behind a closing quote, gets no extra period', () => {
        expect(stripMarkdownForSpeech('请参阅官方文档了解更多。\n详细内容请参考文档。')).toBe('请参阅官方文档了解更多。 详细内容请参考文档。');
        expect(stripMarkdownForSpeech('真的吗？\n是的！\n好，\n继续')).toBe('真的吗？ 是的！ 好， 继续');
        expect(stripMarkdownForSpeech('他说：「你好。」\n然后')).toBe('他说：「你好。」 然后');
        expect(stripMarkdownForSpeech('He said "hi."\nNext')).toBe('He said "hi." Next');
        expect(stripMarkdownForSpeech('第一行\n第二行')).toBe('第一行. 第二行');
    });

    it('the pause rule stays linear on long blank runs and many lines', () => {
        for (const t of [' '.repeat(100000) + 'x', 'a \n'.repeat(50000), '。」\n'.repeat(50000)]) {
            const t0 = performance.now(); stripMarkdownForSpeech(t); expect(performance.now() - t0).toBeLessThan(500);
        }
    });

    it('still drops # > | anywhere, as Stella always did', () => {
        expect(stripMarkdownForSpeech('Tag #urgent | col > x')).toBe('Tag urgent col x');
    });
});

describe('speech pauses and TTS chunks beyond ASCII and CJK', () => {
    it('a line ending in another script\'s punctuation, or inside „…“ »…« ＂…＂ quotes, gets no extra period', () => {
        expect(stripMarkdownForSpeech('नमस्ते।\nकैसे हो')).toBe('नमस्ते। कैसे हो');
        expect(stripMarkdownForSpeech('هل أنت بخير؟\nنعم')).toBe('هل أنت بخير؟ نعم');
        expect(stripMarkdownForSpeech('Er sagte „Hallo.“\nDann')).toBe('Er sagte „Hallo.“ Dann');
        expect(stripMarkdownForSpeech('Er sagte »Hallo.«\nDann')).toBe('Er sagte »Hallo.« Dann');
        expect(stripMarkdownForSpeech('He said ＂好。＂\n然后')).toBe('He said ＂好。＂ 然后');
        expect(stripMarkdownForSpeech('first line\nsecond')).toBe('first line. second'); // unchanged: no punctuation → a pause
    });

    it('chunkForTts: a CJK reply still gets its first sentence alone (fast first audio)', () => {
        const line = (i: number) => `这是第${i}行，我们在这里讨论一些非常重要的事情和相关的细节。`;
        const reply = Array.from({ length: 12 }, (_, i) => line(i + 1)).join(' ');
        const chunks = chunkForTts(reply);
        expect(chunks[0]).toBe(line(1));
        expect(chunks.length).toBeGreaterThan(2);
        expect(chunks.every(c => c.length <= 280 + line(12).length)).toBe(true);
    });

    it('chunkForTts (ARA pipeline): a list whose lines end in ; : , still sends its first line alone', () => {
        const ara = (t: string) => chunkForTts(speechPauses(toSpeechText(t)).trim());
        const en = ara('Here is what changed:\n- first item;\n- second item;\n- third item;');
        expect(en[0]).toBe('Here is what changed:');
        expect(en.length).toBeGreaterThan(1);
        const zh = ara('步骤如下：\n' + Array.from({ length: 40 }, (_, i) => `第${i + 1}步检查设置；`).join('\n'));
        expect(zh[0]).toBe('步骤如下：');
        expect(zh.length).toBeGreaterThan(2);
        expect(ara('Options:\n- a,\n- b')).toEqual(['Options:', 'a, b']);
    });

    it('chunkForTts keeps an emoji with its variation selector (no request that is only U+FE0F)', () => {
        expect(chunkForTts('That is amazing\u203C\uFE0F')).toEqual(['That is amazing\u203C\uFE0F']);
        expect(chunkForTts('Wow\u2049\uFE0F Next one.')).toEqual(['Wow\u2049\uFE0F', 'Next one.']);
        // A leading ‼️/⁉️ is unspeakable and dropped (as HEAD dropped a leading "!!"), never leaving a bare selector.
        const ara = (t: string) => chunkForTts(speechPauses(toSpeechText(t)).trim());
        for (const t of ['\u203C\uFE0F\nRent is due Friday. Please pay on time.', '\u203C\uFE0F Important: pay by Friday.\nThanks', '\u2049\uFE0F What happened?', '\u203C\uFE0F']) {
            for (const c of ara(t)) expect(c.startsWith('\uFE0F')).toBe(false);
        }
        expect(ara('\u203C\uFE0F\nRent is due Friday. Please pay on time.')[0]).toBe('Rent is due Friday.');
        expect(chunkForTts('\u203C\uFE0F')).toEqual(['\u203C\uFE0F']);
        expect(chunkForTts('I \u2764\uFE0F you. Bye.')).toEqual(['I \u2764\uFE0F you.', 'Bye.']); // a mid-sentence emoji never splits
    });

    it('chunkForTts stays linear on runs of marks and emoji', () => {
        for (const t of ['!'.repeat(50000), '\u203C\uFE0F'.repeat(20000), 'a\uFE0F'.repeat(30000), '. '.repeat(30000)]) {
            const t0 = performance.now(); chunkForTts(t); expect(performance.now() - t0).toBeLessThan(500);
        }
    });

    it('a line ending in an emoticon still gets its pause', () => {
        expect(stripMarkdownForSpeech('Thanks :)\nLet me know')).toBe('Thanks :). Let me know');
        expect(stripMarkdownForSpeech('See you ;)\nBye')).toBe('See you ;). Bye');
        expect(stripMarkdownForSpeech('(see above.)\nNext')).toBe('(see above.) Next'); // a real closing bracket is still looked past
    });

    it('chunkForTts: English is split as before', () => {
        expect(chunkForTts('Hi there. How are you? Fine!')).toEqual(['Hi there.', 'How are you? Fine!']);
        expect(chunkForTts('one sentence')).toEqual(['one sentence']);
        expect(chunkForTts('')).toEqual([]);
    });
});
