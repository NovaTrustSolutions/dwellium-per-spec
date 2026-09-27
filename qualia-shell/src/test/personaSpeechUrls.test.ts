/**
 * The voice persona must never read a URL (or markdown link syntax) aloud:
 *  - its speech cleaner is the shared one Stella uses (links → their text, no doubled periods),
 *  - bare URLs / www. / <autolinks> are spoken as their host in every voice (speech only; titles and code keep them),
 *  - a markdown link is never mistaken for a [cue] (which used to delete the link text and leave the URL),
 *  - the streaming sentence splitter never cuts a link in half (the second half no longer looked like a link).
 */
import { describe, it, expect } from 'vitest';
import { stripForSpeech, parseAssistantReply, drainSentences, toTranscriptText } from '../components/PersonaStudio/personaEngine';
import { toSpeechText, toPlainText } from '../lib/markdownText';
import { stripMarkdownForSpeech } from '../lib/ttsVoices';

const HERMES_ANSWER = 'Hermes finished: TAVILY-LIVE: Georgia requires 60 days written notice.\nSources:\n[Georgia lease law](https://example.org/ga-lease)';
const noUrl = (s: string) => {
    expect(s).not.toMatch(/https?:|www\.|\]\(|\[|\.\.|:\./);
};
const ms = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };

describe('persona speech — URLs and link syntax are never read aloud', () => {
    it("Hermes's web-search answer: the source is read as its title, with no doubled periods", () => {
        const s = stripForSpeech(HERMES_ANSWER);
        noUrl(s);
        expect(s).toBe('Hermes finished: TAVILY-LIVE: Georgia requires 60 days written notice. Sources: Georgia lease law');
    });

    it('is the same cleaner Stella uses (one set of rules for every voice)', () => {
        for (const t of [HERMES_ANSWER, '**Bold** and `code` and *stars*', '- first item\n- second item\n• third', '## Heading\nText here']) {
            expect(stripForSpeech(t)).toBe(stripMarkdownForSpeech(t));
        }
    });

    it('keeps what the old cleaner did: markers, bullets, headings', () => {
        expect(stripForSpeech('**Bold** and `code` and *stars*')).toBe('Bold and code and stars');
        expect(stripForSpeech('- first item\n- second item\n• third')).toBe('first item. second item. third');
        expect(stripForSpeech('## Heading\nText here')).toBe('Heading. Text here');
    });
});

describe('shared speech text — bare URLs are spoken as their host', () => {
    it.each([
        ['See https://example.org/ga-lease for details.', 'See example.org for details.'],
        ['(see https://x.org/a)', '(see x.org)'],
        ['Sources: <https://example.org/a> and www.example.com/b', 'Sources: example.org and example.com'],
        ['Read https://en.wikipedia.org/wiki/Foo_(bar).', 'Read en.wikipedia.org.'],
        ['Go to http://localhost:3000/app now', 'Go to localhost:3000 now'],                 // the port is information
        ['Open http://[::1]:8080/x now', 'Open [::1]:8080 now'],
        ['Log in at https://user:secret@x.org/a today', 'Log in at x.org today'],             // never read credentials
        ['https://www.reuters.com/x?y=1#z, then', 'reuters.com, then'],
    ])('%s', (input, spoken) => {
        expect(toSpeechText(input)).toBe(spoken);
        expect(stripMarkdownForSpeech(input)).toBe(spoken);
    });

    it.each([
        ['请看https://example.org/a。然后继续', '请看example.org。然后继续'],
        ['See https://x.org/a—or not', 'See x.org—or not'],
        ['Link: «https://x.org/a» ok', 'Link: «x.org» ok'],
        ['Wait https://x.org/a… really', 'Wait x.org… really'],
        ['见https://例え.jp/パス。', '见例え.jpパス。'],                 // a non-ASCII path can't be told from glued text: kept as text
        ['本地服务在http://localhost:3000运行。', '本地服务在localhost:3000运行。'],
        ['サーバーはhttp://localhost:8080で動いています。', 'サーバーはlocalhost:8080で動いています。'],
        ['Open http://[::1]:8080で確認', 'Open [::1]:8080で確認'],
        ['https://x.org:see this', 'x.org:see this'],
        ['https://x.org[see note] ok', 'x.org[see note] ok'],
        ['see https://x.org> now', 'see x.org> now'],
    ])('text glued after a URL is never swallowed: %s', (input, spoken) => {
        expect(toSpeechText(input)).toBe(spoken);
    });

    it('a URL inside __strong__ emphasis is read as its host too', () => {
        expect(toSpeechText('__https://x.org/ga-lease__')).toBe('x.org');
        expect(toSpeechText('See __www.x.org/a__ now')).toBe('See x.org now');
    });

    it('a link whose text is its own URL is read as the host', () => {
        expect(toSpeechText('[https://x.org/a](https://x.org/a)')).toBe('x.org');
    });

    it('code keeps its URL verbatim; titles (toPlainText) keep bare URLs', () => {
        expect(toSpeechText('Run `curl https://x.org/a` first')).toBe('Run curl https://x.org/a first');
        expect(toPlainText('See https://x.org/a')).toBe('See https://x.org/a');
    });

    it('is linear on adversarial input (100 KB)', () => {
        const n = 100_000;
        expect(ms(() => toSpeechText('https://'.repeat(n / 8)))).toBeLessThan(500);
        expect(ms(() => toSpeechText('www.'.repeat(n / 4)))).toBeLessThan(500);
        expect(ms(() => toSpeechText(`<https://x.org/${'a'.repeat(n)}`))).toBeLessThan(500);
        expect(ms(() => toSpeechText(`https://x.org/${')'.repeat(n)}a`))).toBeLessThan(500);
        expect(ms(() => toSpeechText(`see https://x.org/${'.'.repeat(n)}`))).toBeLessThan(500);
        expect(ms(() => toSpeechText(`https://x.org/${')'.repeat(n)}`))).toBeLessThan(500);          // peeled entirely
        expect(ms(() => toSpeechText(`https://x.org/${'])'.repeat(n / 2)}`))).toBeLessThan(500);
        expect(ms(() => toSpeechText(`https://${'a@'.repeat(n / 2)}x.org`))).toBeLessThan(500);
        expect(ms(() => toSpeechText(`https://[${':'.repeat(n)}`))).toBeLessThan(500);
        const big = 200_000;                                        // 200 KB: a quadratic regex takes seconds here
        for (const unit of ['www.a!', 'www.!', 'www.x.com,', 'https://a!', '<https://a', 'www.a:', '<www.']) {
            expect(ms(() => toSpeechText(unit.repeat(big / unit.length)))).toBeLessThan(500);
        }
    });
});

describe('persona cues — a markdown link is not a [cue]', () => {
    it('a link keeps its text for speech (it used to become a cue, leaving the URL to be spoken)', () => {
        const r = parseAssistantReply("Read [Dr. Smith's page](https://x.org/smith) now.");
        expect(r.cues).toEqual([]);
        expect(stripForSpeech(r.speech)).toBe("Read Dr. Smith's page now.");
    });

    it('images and [[1]] citations are not cues either', () => {
        expect(parseAssistantReply('Image ![a chart](https://x.org/c.png) done.').cues).toEqual([]);
        const cite = parseAssistantReply('Rates rose [[1]](https://x.org/r) today.');
        expect(cite.cues).toEqual([]);
        noUrl(stripForSpeech(cite.speech).replace('[1]', ''));
    });

    it('a relative link is a link too, and a cue glued after "!" is still a cue', () => {
        const rel = parseAssistantReply('See [the notes](notes.md) first.');
        expect(rel.cues).toEqual([]);
        expect(stripForSpeech(rel.speech)).toBe('See the notes first.');
        const bang = parseAssistantReply('That is amazing![laughs] Really.');
        expect(bang.cues).toEqual(['laughs']);
        expect(bang.speech).not.toContain('laughs');
    });

    it('control: a real cue is still extracted', () => {
        const r = parseAssistantReply('Hi [smiles] there!');
        expect(r.cues).toEqual(['smiles']);
        expect(r.speech).toBe('Hi there!');
    });
});

describe('persona streaming — a sentence split never cuts a link in half', () => {
    it('does not split at ". " or ": " inside the link text or its destination', () => {
        const { sentences, rest } = drainSentences('Read [Section 5.2: Notice. Rules](https://x.org/a "T. Two") now. Next');
        expect(sentences).toEqual(['Read [Section 5.2: Notice. Rules](https://x.org/a "T. Two") now.']);
        expect(rest).toBe('Next');
        expect(stripForSpeech(sentences[0])).toBe('Read Section 5.2: Notice. Rules now.');
    });

    it('a link that arrives over several stream chunks is still one sentence', () => {
        let buf = ''; const out: string[] = [];
        for (const chunk of ['Read [Section 5', '.2: Notice](https://x', '.org/a) now. Ne']) {
            const r = drainSentences(buf + chunk); out.push(...r.sentences); buf = r.rest;
        }
        expect(out).toEqual(['Read [Section 5.2: Notice](https://x.org/a) now.']);
    });

    it('control: ordinary sentences and a cue still split as before', () => {
        expect(drainSentences('One. Two! [smiles] Three? Four').sentences).toEqual(['One.', 'Two!', '[smiles] Three?']);
    });

    it('brackets nested inside the link text keep it one unit', () => {
        const { sentences } = drainSentences('Read [the [2024] rules. All of them](https://x.org/a) ok. Next');
        expect(sentences).toEqual(['Read [the [2024] rules. All of them](https://x.org/a) ok.']);
    });

    it('a stray "[" gives up after 200 characters, so a long one-line reply still speaks as it streams', () => {
        const long = `Stray [${'word '.repeat(50)}end. Next. `;
        expect(drainSentences(long).sentences).toEqual([`Stray [${'word '.repeat(50)}end.`, 'Next.']);
    });

    it('a real link with a long destination and a titled ". " is never split, however long', () => {
        const url = `https://ru.wikipedia.org/wiki/${'%D0%90'.repeat(50)}`;
        const { sentences } = drainSentences(`Read [the article](${url} "Arenda. Wikipedia") now. Next`);
        expect(sentences).toEqual([`Read [the article](${url} "Arenda. Wikipedia") now.`]);
    });

    it('a sentence end inside a link title (after a space) does not split it', () => {
        const { sentences } = drainSentences('Read [the article](https://x.org/a "A title. More words") now. Next');
        expect(sentences).toEqual(['Read [the article](https://x.org/a "A title. More words") now.']);
    });

    it('a stray "[" long before a real link does not make the real link split', () => {
        const text = `Use arr[0 and ${'word '.repeat(45)}then see [Section 5.2: Notice](https://x.org/a) now. Next`;
        expect(drainSentences(text).sentences).toEqual([text.slice(0, text.indexOf(' Next'))]);
    });

    it('a link whose URL has an unbalanced "(" stops holding at the first space, so later sentences still stream', () => {
        let buf = ''; const out: string[] = [];
        const text = 'Broken [link](https://x.org/a_(b). It says yes. Then more. And more. Final';
        for (let k = 0; k < text.length; k += 7) {
            const r = drainSentences(buf + text.slice(k, k + 7)); out.push(...r.sentences); buf = r.rest;
        }
        expect(out).toEqual(['Broken [link](https://x.org/a_(b). It says yes.', 'Then more.', 'And more.']);
        expect(buf).toBe('Final');
    });

    it('a stray "[" only holds the split until the line ends', () => {
        expect(drainSentences('Use array[0. Then more.\nNext line. ').sentences).toEqual(['Use array[0. Then more.', 'Next line.']);
    });

    it('is linear on adversarial input (100 KB, a stray "[" before many sentence ends)', () => {
        expect(ms(() => drainSentences(`[${'a. '.repeat(33_000)}`))).toBeLessThan(500);
        expect(ms(() => drainSentences(`[a](${'b. '.repeat(33_000)}`))).toBeLessThan(500);
    });
});

describe('persona speech — symbols that carry meaning are kept', () => {
    it.each([
        ['C# and F# are languages', 'C# and F# are languages'],
        ['Ranked #1 in 2024', 'Ranked #1 in 2024'],
        ['if 5 > 3 then', 'if 5 > 3 then'],
        ['Tag #urgent | col > x', 'Tag urgent col x'],                         // Stella's rule: hashtags, pipes, stray > go
        ['Make sure your balance stays > 0 before the 1st.', 'Make sure your balance stays > 0 before the 1st.'],
        ['Credit score >= 650 is needed.', 'Credit score >= 650 is needed.'],
        ['If x > 5, then', 'If x > 5, then'],
        ['CPU > 90% for an hour', 'CPU > 90% for an hour'],
        ['It must be > $1,500.', 'It must be > $1,500.'],
        ['x > -5 holds', 'x > -5 holds'],
        ['temp > −5°C', 'temp > −5°C'],
        ['Step 1 -> 2', 'Step 1 - 2'],                                           // an arrow is not a comparison
        ['Your score went 650 -> 700.', 'Your score went 650 - 700.'],
        ['x => 5', 'x = 5'],
        ['a >> 2', 'a 2'],
    ])('%s', (input, spoken) => {
        expect(stripForSpeech(input)).toBe(spoken);
        expect(stripMarkdownForSpeech(input)).toBe(spoken);
    });
});

describe('persona transcript — a tool answer is shown with its lines and links, without markdown markers', () => {
    it('drops heading / bold / italic / code markers, keeps line breaks, bullets and the source link', () => {
        expect(toTranscriptText('## Result\n**Bold** and *soft* and `code`\n- item\nSee [a](https://x.org/a)'))
            .toBe('Result\nBold and soft and code\n- item\nSee [a](https://x.org/a)');
    });

    it('nested emphasis and arithmetic', () => {
        expect(toTranscriptText('**a *b* c** and *a **b** c*')).toBe('a b c and a b c');
        expect(toTranscriptText('2 * 3 * 4 = 24')).toBe('2 * 3 * 4 = 24');
        expect(toTranscriptText('**Note: see *this***')).toBe('Note: see this');
        expect(toTranscriptText('***a* b**')).toBe('a b');
        expect(toTranscriptText('**bold *italic* and more *italic***')).toBe('bold italic and more italic');
        expect(toTranscriptText('***both***')).toBe('both');
    });

    it('fenced code is shown verbatim (no marker stripping inside it)', () => {
        const code = '```py\n# keep this comment\ndef f(**kwargs): return g(**kwargs)\n```';
        expect(toTranscriptText(`## Code\n${code}\n*done*`)).toBe(`Code\n${code}\ndone`);
    });

    it('is linear on adversarial input (100 KB)', () => {
        const n = 100_000;
        for (const t of ['**a'.repeat(n / 3), '*'.repeat(n), '`'.repeat(n), `**${'a'.repeat(n)}`, '#'.repeat(n)]) {
            expect(ms(() => toTranscriptText(t))).toBeLessThan(500);
        }
    });
});
