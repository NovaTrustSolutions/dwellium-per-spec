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
// Not glued to a word — handlers[i](event), snake_[i](x), obj.__dict__[k](a) are code — but _[link](url)_ is fine.
const LEAD = String.raw`(?<![\p{L}\p{N}\]])(?<![\p{L}\p{N}]_+)`;
// A badge [![alt](img)](url): the outer link goes first (its text is the image), then IMAGE takes the image.
const BADGE = new RegExp(LEAD + String.raw`\[(!\[${BRACKETED}*\]` + HREF_ANY + String.raw`)\]` + HREF, 'gu');
const IMAGE = new RegExp(LEAD + String.raw`!\[(${BRACKETED}*)\]` + HREF_ANY, 'gu');
// [text](url) with non-empty text (C++ lambdas [](int a) are code), or a citation glued to a word, Mercury[[1]](url),
// whose destination must be a URL (R's funcs[[1]](x) is code).
const URL_DEST = String.raw`\((?:https?:\/\/|www\.)[^()\s]*(?:\([^()\s]*\)[^()\s]*)*\)`;
const LINK = new RegExp(String.raw`${LEAD}\[(${BRACKETED}+)\]` + HREF + String.raw`|\[(\[[^[\]]*\])\]` + URL_DEST, 'gu');
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
        .replace(LINK, '$1$2')                                                                      // [text](href), [[1]](href) — not handlers[i](event)
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

/** Plain text for text-to-speech: code blocks become "code block", user_id_map is read "user id map",
 *  1_000_000 stays one number, leftover markers are never read aloud, "5 * 3" and "~5" are kept. */
export function toSpeechText(md: string): string {
    return plain(md, true);
}
