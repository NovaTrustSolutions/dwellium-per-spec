/**
 * Markdown → structure / plain text, shared by ARA's chat renderer, note titles and speech, and by the
 * text-to-speech used across widgets (lib/ttsVoices.ts). One scanner, so every surface agrees about the
 * same text. Pure: no DOM, no React.
 */
// Unicode noncharacters: reserved for a program's internal use, so real text (even private-use icon glyphs)
// never contains them; never a letter, mark or digit, so they can't disturb the word checks.
export const OPEN = '\uFDD0';
export const CLOSE = '\uFDD1';
export const TOKEN = /\uFDD0(\d+)\uFDD1/g;
export const UNDERSCORE_EM = /(?<![\p{L}\p{M}\p{N}_])_((?:[^_]|(?<=[\p{L}\p{M}\p{N}])_(?=[\p{L}\p{M}\p{N}]))+?)_(?![\p{L}\p{M}\p{N}_])/gu;
/** A code span: a backtick run (never starting inside a longer run) … the same-length run (CommonMark). */
export const CODE_SPAN = /(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;
/** Code-span text: line breaks become spaces; one space is trimmed from each end when both ends have one. */
export function spanText(code: string): string {
    const t = code.replace(/\n/g, ' ');
    // character checks, not /^ [\s\S]*[^ ][\s\S]* $/ — that regex is quadratic on a long span starting with a space
    return t.length > 2 && t[0] === ' ' && t[t.length - 1] === ' ' && /[^ ]/.test(t) ? t.slice(1, -1) : t;
}

/** Code spans (`code`, ``code``) within one line, as ARA renders them: a stray ` or a broken fence stays
 *  literal on its own line instead of pulling the lines after it into one inline span. */
export function eachCodeSpan(text: string, span: (code: string) => string): string {
    return text.split('\n').map(l => l.replace(CODE_SPAN, (_m, _run, c: string) => span(spanText(c)))).join('\n');
}

export type MdBlock = { kind: 'text' | 'code'; lines: string[]; start: number; info?: string };
const width = (indent: string) => indent.replace(/\t/g, '    ').length;

/**
 * Split markdown into text and fenced-code blocks (``` or ~~~, CommonMark-style): a fence opens on a
 * line holding only the fence and an optional info string (no backticks — "```x``` y" is inline code),
 * closes on a line with at least as many of the same character indented within 3 spaces of the opener
 * (so an indented ``` inside the code doesn't end it, and a stray indented ``` in text doesn't pair with a
 * later top-level fence), and its own indent is removed from the code lines. A fence with no closing
 * line stays text, so a reply still streaming in never swallows the rest of the message.
 */
export function splitFences(md: string): MdBlock[] {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const closers = closingLines(lines);
    const out: MdBlock[] = [];
    let text: string[] = [];
    let textStart = 0;
    const flush = () => { if (text.length) out.push({ kind: 'text', lines: text, start: textStart }); text = []; };
    for (let i = 0; i < lines.length; i++) {
        const open = lines[i].match(OPENER);
        const end = open ? closers[i] : -1;
        if (!open || end === -1) {
            if (!text.length) textStart = i;
            // a placeholder character arriving in the text itself would be read back as some other code span
            text.push(lines[i].replace(SENTINELS, String.fromCharCode(0xfffd)));
            continue;
        }
        flush();
        const indent = new RegExp(`^[ \\t]{0,${open[1].length}}`);
        out.push({ kind: 'code', lines: lines.slice(i + 1, end).map(l => l.replace(indent, '')), start: i, info: open[3].trim() });
        i = end;
    }
    flush();
    return out;
}

const SENTINELS = new RegExp(`[${OPEN}${CLOSE}]`, 'g');
// any indent: LLMs nest fences under list items with 4+ spaces (plain indented text never becomes code)
const OPENER = /^([ \t]*)(`{3,}|~{3,}(?!~))([^`]*)$/; // (?!~): a long ~~~…~` line would otherwise backtrack quadratically
const CLOSER = /^([ \t]*)(`{3,}|~{3,})[ \t]*$/;

/**
 * For every opening-fence line, the first later line that closes it (same character, at least as long,
 * indent within 3), or -1. One backward sweep keeps, per (character, indent), a stack of closing lines with
 * shorter AND nearer ones on top, so each lookup is a binary search: a forward search per opener was
 * quadratic, and thousands of unclosed fences (hostile or garbled text) froze every renderer using this.
 */
function closingLines(lines: string[]): number[] {
    const next = new Array<number>(lines.length).fill(-1);
    const stacks = new Map<string, { k: number; len: number }[]>();
    for (let k = lines.length - 1; k >= 0; k--) {
        const open = lines[k].match(OPENER);
        if (open) {
            const w = width(open[1]), len = open[2].length;
            for (let d = -3; d <= 3; d++) {
                const s = stacks.get(open[2][0] + (w + d));
                if (!s) continue;
                let lo = 0, hi = s.length - 1, best = -1; // lengths fall toward the top; the last long-enough entry is the nearest
                while (lo <= hi) { const mid = (lo + hi) >> 1; if (s[mid].len >= len) { best = mid; lo = mid + 1; } else hi = mid - 1; }
                if (best >= 0 && (next[k] === -1 || s[best].k < next[k])) next[k] = s[best].k;
            }
        }
        const close = lines[k].match(CLOSER);
        if (close) {
            const key = close[2][0] + width(close[1]);
            const s = stacks.get(key) ?? [];
            while (s.length && s[s.length - 1].len <= close[2].length) s.pop(); // farther and no longer: never the answer
            s.push({ k, len: close[2].length });
            stacks.set(key, s);
        }
    }
    return next;
}

// Link destination + optional title, CommonMark shapes: <dest with spaces>, or a bare dest (no whitespace, \-escapes,
// one level of (…) for wiki URLs), then "title" / 'title' / (title), padding allowed; else, as a last resort, anything
// on the same line with up to two levels of (…) ([Q3 Report](Q3 Report.pdf), Lease (1).pdf — LLMs write those).
// A blank destination is not a link ([Int]() is Swift), but is an image. Bounded and single-line, so a
// "](" with no ")" can't scan to the end of the text from every opener (quadratic) or eat later paragraphs; the leading
// blank run is atomic ((?![ \t])) so it can't trade blanks with the title's and the trailing run (also quadratic).
const HREF_ANY = String.raw`\((?:[ \t]*(?![ \t])(?:<[^<>\n]*>|(?:[^()\s\\]|\\.)*(?:\((?:[^()\s\\]|\\.)*\)(?:[^()\s\\]|\\.)*)*)(?:[ \t]+(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\((?:[^()\\\n]|\\.)*\)))?[ \t]*|(?:[^()\n]|\((?:[^()\n]|\([^()\n]*\))*\))*)\)`;
const HREF = String.raw`(?!\([ \t]*\))` + HREF_ANY; // links only; ![alt]() placeholders still count as images
const BRACKETED = String.raw`(?:[^[\]]|\[[^[\]]*\])`; // one level of [] inside: [[1]](url) citations, ![Figure [1]](f.png)
// Not glued to a word — handlers[i](event), snake_[i](x), obj.__dict__[k](a) are code — but _[link](url)_ is fine,
// and so is a link glued to a script written without spaces between words (请参阅[文档](url), データー[…](…),
// ＰＤＦ[…](…)): Script_Extensions, so shared marks like ー and 々 count too, plus fullwidth letters and digits.
const SPACELESS = String.raw`[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}\p{scx=Tibetan}\p{scx=Yi}\p{scx=Javanese}\p{scx=Balinese}\p{scx=Tai_Tham}\p{scx=New_Tai_Lue}\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]`;
const LEAD = String.raw`(?:(?<![\p{L}\p{N}\]])|(?<=${SPACELESS}))(?<!(?!${SPACELESS})[\p{L}\p{N}]_+)`;
// A badge [![alt](img)](url): the outer link goes first (its text is the image), then IMAGE takes the image.
const BADGE = new RegExp(LEAD + String.raw`\[(!\[${BRACKETED}*\]` + HREF_ANY + String.raw`)\]` + HREF, 'gu');
const IMAGE = new RegExp(LEAD + String.raw`!\[(${BRACKETED}*)\]` + HREF_ANY, 'gu');
// [text](url) with non-empty text (C++ lambdas [](int a) are code); glued to anything — Mercury[[1]](url),
// 请参阅Python[文档](url), 2024[报告](url) — only when the destination is a URL (funcs[[1]](x), fetch[i](e) are code).
const URL_DEST = String.raw`\((?:https?:\/\/|www\.)[^()\s]*(?:\([^()\s]*\)[^()\s]*)*\)`;
const LINK = new RegExp(String.raw`${LEAD}\[(${BRACKETED}+)\]` + HREF + String.raw`|\[(${BRACKETED}+)\]` + URL_DEST, 'gu');
const SPACELESS_CHAR = new RegExp(SPACELESS, 'u');
/** A citation number follows these directly: a letter or digit (incl. a trailing combining mark — भारत में, NFD é),
 *  a closing bracket, . , ; : ? ! % ° ‰, currency after a number (5€[1]), or the CJK/fullwidth 。，、；：！？）］％」』】. */
const CITE_AFTER = /[\p{L}\p{M}\p{N}\p{Sc}\].),;:?!%°‰。，、；：！？）］％」』】]/u;
const QUOTE = /["'”’»“‘«›‹]/u;
const AMOUNT_BEFORE = /\p{Nd}[*_~]*[\u00A0\u202F]?$/u;        // 20 €: digits (maybe **bold**), then at most a no-break space
const AMOUNT_BEFORE_POSTFIX = /\p{Nd}[*_~]*[ \u00A0\u202F]?$/u; // € ₽ ₴ follow the amount, often after a plain space
/** A letter or digit of a script that puts spaces between words. */
const spaced = (c: string) => /[\p{L}\p{M}\p{N}]/u.test(c) && !SPACELESS_CHAR.test(c);
const lastCodePoint = (t: string) => [...t.replace(/[*_~]+$/, '')].pop() ?? ''; // looking through emphasis markers
/** A link's text, kept apart from what it was glued to:
 *  - a bare citation number keeps its brackets when glued (2023[2](url), **2023**[2], 2023,[2], "Nature"[3], 14亿[１],
 *    ๒๕๖๖[๑]) or followed by another citation ([1](a)[2](b) → "[1][2]") — never "20232";
 *  - a glued word from a spaced script gets a space (docs[here], [docs](a)[here](b), "quoted"[here] → "… here"),
 *    but not after an apostrophe (l'[article] → "l'article", O'[Reilly]);
 *  - a quote counts only when it closes something ("[1984](url)" stays "1984"); $[20] is an amount, not a citation. */
function linkText(m: string, text: string, off: number, all: string, inQuote: boolean): string {
    const head = all.slice(Math.max(0, off - 24), off).replace(/[*_~]+$/, '');
    const prev = lastCodePoint(head);
    const beforePrev = lastCodePoint(head.slice(0, head.length - prev.length));
    // A straight " closes when an even number of " come before the link on this line (inQuote is false): "good"[1] closes,
    // 点击"[Settings](…)" and 他说"[Python](…)很好用" open. “ ‘ « › ‹ close a German/Swiss quote („Nature“) but open one after
    // CJK (点击“[Settings](…)”), so they close only after a spaced script; a ' (also an apostrophe) that the same ' follows
    // right after the link (looking through emphasis) wraps it.
    // " ” ’ only ever close: after anything but whitespace, the text start or an opening bracket/quote (… 。 ？ % ' too).
    // “ ‘ « » › ‹ ' often open (他说：“[…](…)”, —“…”), so they close only after a letter, digit or . , ! ? ) ].
    const closes = beforePrev === CLOSE || (/["”’]/u.test(prev)
        ? beforePrev !== '' && !/[\s\p{Ps}\p{Pi}¿¡]/u.test(beforePrev)
        : /[\p{L}\p{M}\p{N}.,!?)\]]/u.test(beforePrev));
    const closingQuote = QUOTE.test(prev) && closes && (prev === '"' ? !inQuote
        : !(/[“‘«›‹]/u.test(prev) && SPACELESS_CHAR.test(beforePrev))
            && !(prev === "'" && all.slice(off + m.length, off + m.length + 8).replace(/^[*_~]+/, '')[0] === "'"));
    const bare = text.replace(/^[*_~]+|(?<![*_~])[*_~]+$/g, ''); // (?<!…): whole runs only — a long run is not quadratic
    if (/^\p{Nd}+$/u.test(bare)) {
        // a currency sign counts only after an amount: 5€[1], 20 €[1] (a no-break space, or a space before €) — not $[20]
        const amount = !/\p{Sc}/u.test(prev) || (/[€₽₴]/u.test(prev) ? AMOUNT_BEFORE_POSTFIX : AMOUNT_BEFORE).test(head.slice(0, head.length - prev.length).replace(/[*_~]+$/, ''));
        const glued = closingQuote || (CITE_AFTER.test(prev) && amount);
        return glued || /^[,;，、；]?\[\[?[*_~]*\p{Nd}+[*_~]*\]?\]\(/u.test(all.slice(off + m.length, off + m.length + 24)) ? `[${text}]` : text;
    }
    const gap = spaced(prev) || prev === ')' || prev === ']' || (closingQuote && !/['’]/u.test(prev));
    return gap && spaced([...bare][0] ?? '') ? ` ${text}` : text;
}
/** LINK replacer for one text. It counts straight " in the current paragraph as it goes (replace callbacks arrive in
 *  offset order), so linkText knows whether a " right before a link opens or closes a quotation — one pass, linear. A
 *  quotation may wrap across lines; a blank line ends it. A replaced link's URL and title are not counted (they vanish). */
function linkReplacer() {
    let at = 0, inQuote = false, lineHasText = false;
    const feed = (c: string) => {
        if (c === '\n') { if (!lineHasText) inQuote = false; lineHasText = false; }
        else { if (c === '"') inQuote = !inQuote; if (c !== ' ' && c !== '\t') lineHasText = true; }
    };
    return (m: string, a: string | undefined, b: string | undefined, off: number, all: string): string => {
        for (; at < off; at++) feed(all[at]);
        const text = a ?? b ?? '';
        const out = linkText(m, text, off, all, inQuote);
        for (const c of text) feed(c);
        at = off + m.length;
        return out;
    };
}
const WORD = /[\p{L}\p{N}]/u;
const IN_WORD_UNDERSCORE = /(?<=[\p{L}\p{M}\p{N}])_(?=[\p{L}\p{M}\p{N}])/gu;
/** A whole number with thousands separators: 1_000_000, 12_345 — not snapshot_2024_09_24 or v2_001. */
const GROUPED_NUMBER = /(?<![\p{L}\p{N}_])\p{N}{1,3}(?:_\p{N}{3})+(?![\p{N}_])/gu;
const joinGroups = (t: string) => t.replace(GROUPED_NUMBER, n => n.replace(/_/g, ''));

function plain(md: string, speech: boolean): string {
    const codes: string[] = [];
    const keep = (c: string) => `${OPEN}${codes.push(c) - 1}${CLOSE}`;
    const lineMarkers = speech
        ? /^[ \t]*(?:>[ \t]?|#{1,6}[ \t]+|[-*•+][ \t]+|\d+[.)][ \t]+)+/gm   // speech also drops "1." list numbers (as before)
        : /^[ \t]*(?:>[ \t]?|#{1,6}[ \t]+|[-*•+][ \t]+)+/gm;                // titles keep them ("2024. was a year")
    let text = splitFences(md)
        .map(b => (b.kind === 'code' ? (speech ? 'code block' : keep(b.lines.join('\n'))) : b.lines.join('\n')))
        .join('\n')
        .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '')                                    // --- *** ___ rules
        .replace(lineMarkers, '');
    text = eachCodeSpan(text, keep)                                                                 // `code`, ``code`` (per line)
        .replace(/`+/g, '')                                                                         // stray backticks (e.g. an unclosed fence)
        .replace(BADGE, '$1')                                                                       // [![alt](img)](url) → ![alt](img)
        .replace(IMAGE, '$1')                                                                       // ![alt](src)
        .replace(LINK, linkReplacer())                                                              // [text](href), [[1]](href) — not handlers[i](event)
        .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
        .replace(UNDERSCORE_EM, '$1')
        .replace(/~~([\s\S]+?)~~/g, '$1');
    if (speech) {
        // Outside code only: a * _ ~ touching a letter is a leftover marker; "5 * 3", "~5", "~/" stay.
        text = joinGroups(text).replace(IN_WORD_UNDERSCORE, ' ')
            .replace(/(?<![*_~])(?:[*_~]+(?=\p{L})|(?<=\p{L})[*_~]+)/gu, ''); // whole runs only (linear)
    }
    // Restore code; pad with a space only where it would otherwise glue two words together.
    text = text.replace(TOKEN, (m, i: string, off: number, all: string) => {
        const code = codes[Number(i)];
        if (code === undefined) return m;
        const before = off > 0 && WORD.test(all[off - 1]) ? ' ' : '';
        const after = WORD.test(all[off + m.length] ?? '') ? ' ' : '';
        return `${before}${code}${after}`;
    });
    return speech ? joinGroups(text).replace(IN_WORD_UNDERSCORE, ' ') : text;
}

/**
 * Markdown → plain text for titles and summaries: markers go (headings, quotes, bullets, rules, **, *,
 * _…_, backticks, link/image syntax); underscores inside words, hyphens, list numbers and code stay.
 */
export function toPlainText(md: string): string {
    return plain(md, false);
}

/** Sentence or clause punctuation in any script (Unicode Terminal_Punctuation: . ! ? : ; , 。！？，、 । ؟ ، …) plus the
 *  ellipsis: a line that already ends in one needs no added pause. */
const PAUSED = /[\p{Terminal_Punctuation}\u2026]$/u;
/** An ASCII wink/smile at a line end: its `:` / `;` is not punctuation, so the line still needs its pause. */
const EMOTICON_END = /[:;][)\]]$/;
/** Line breaks → pauses for text-to-speech (ARA and Stella share this): ". " unless the line already ends in punctuation,
 *  looking past closing brackets and any quotation mark ("hi." ⏎, 「你好。」⏎, „Hallo.“⏎, »Hallo.«⏎ → no doubled period).
 *  A punctuated line keeps ONE line break instead, so chunkForTts can still split there (a list whose lines end in
 *  `;` / `：` still sends its first line alone); callers that want one line collapse whitespace afterwards.
 *  The blank run is matched from its start ((?<![ \t])), so a long run of spaces is scanned once — linear. */
export function speechPauses(text: string): string {
    return text.replace(/(?<![ \t])[ \t]*\n\s*/g, (_m: string, off: number, all: string) => {
        const before = all.slice(Math.max(0, off - 12), off);
        if (EMOTICON_END.test(before)) return '. ';
        const tail = before.replace(/[\s\p{Pe}\p{Pf}\p{Quotation_Mark}]+$/u, '');
        return tail === '' || PAUSED.test(tail) ? '\n' : '. ';
    });
}

/** Sentence ends that split speech into TTS requests (Unicode Sentence_Terminal: . ! ? 。！？ । ؟ ‼, plus the ellipsis),
 *  and line breaks. U+FE0F stays with its mark and a sentence never starts on one, so ‼️ is never split into a request
 *  of just the selector (a LEADING ‼️ is dropped, as a leading "!!" always was). The start check is a lookahead, not
 *  optional leading marks, which would backtrack quadratically on a long run of "!". */
const SPEECH_SENTENCE = /(?!\uFE0F)[^\p{Sentence_Terminal}\u2026\n]+[\p{Sentence_Terminal}\u2026\uFE0F]*\s*/gu;
/**
 * Split a reply into TTS chunks: first sentence alone (fastest possible time-to-first-audio), remaining
 * sentences merged up to ~280 chars per request. One whole-reply request meant nothing played until the FULL
 * completion was synthesized and downloaded — the single biggest source of "talking to a machine" latency.
 */
export function chunkForTts(text: string): string[] {
    const sentences = text.match(SPEECH_SENTENCE)?.map(x => x.trim()).filter(Boolean) ?? [];
    if (sentences.length <= 1) return sentences.length ? sentences : (text ? [text] : []);
    const chunks: string[] = [sentences[0]];
    let cur = '';
    for (const sent of sentences.slice(1)) {
        if (cur && (cur.length + sent.length + 1) > 280) { chunks.push(cur); cur = ''; }
        cur = cur ? `${cur} ${sent}` : sent;
    }
    if (cur) chunks.push(cur);
    return chunks;
}

/** Plain text for text-to-speech: code blocks become "code block", user_id_map is read "user id map",
 *  1_000_000 stays one number, leftover markers are never read aloud, "5 * 3" and "~5" are kept. */
export function toSpeechText(md: string): string {
    return plain(md, true);
}
