/**
 * Inline markdown for one ARA line that is ALREADY HTML-escaped: **bold**, *italic*, _italic_, `code`.
 * Code spans are swapped for placeholders first, so nothing inside them is formatted (but italics can
 * still wrap them). `_` only opens/closes italics at a word boundary, and an underscore INSIDE a word may
 * sit within italics (CommonMark's rules) — so generate_content_free_tier_requests stays literal and
 * _the user_id column_ is italic. Letters, combining marks and digits all count as "word".
 */
const OPEN = '\uE000'; // private-use: never a letter, mark or digit, so it can't disturb the word checks
const CLOSE = '\uE001';
const TOKEN = /\uE000(\d+)\uE001/g;
const UNDERSCORE_EM = /(?<![\p{L}\p{M}\p{N}_])_((?:[^_]|(?<=[\p{L}\p{M}\p{N}])_(?=[\p{L}\p{M}\p{N}]))+?)_(?![\p{L}\p{M}\p{N}_])/gu;
/** A code span: a backtick run (never starting inside a longer run) … the same-length run (CommonMark). */
const CODE_SPAN = /(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;
/** Code-span text: line breaks become spaces; one space is trimmed from each end when both ends have one. */
function spanText(code: string): string {
    const t = code.replace(/\n/g, ' ');
    return /^ [\s\S]*[^ ][\s\S]* $/.test(t) ? t.slice(1, -1) : t;
}

export function formatInline(escaped: string): string {
    const codes: string[] = [];
    const withTokens = escaped.replace(CODE_SPAN, (_m, _run, code: string) => `${OPEN}${codes.push(spanText(code)) - 1}${CLOSE}`);
    return withTokens
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
        .replace(UNDERSCORE_EM, '<em>$1</em>')
        .replace(TOKEN, (m, i: string) => (codes[Number(i)] === undefined ? m : `<code>${codes[Number(i)]}</code>`));
}

export type MdBlock = { kind: 'text' | 'code'; lines: string[]; start: number };

/**
 * Split markdown into text and fenced-code blocks (``` or ~~~, CommonMark-style): a fence opens on a
 * line holding only the fence and an optional info string (no backticks — "```x``` y" is inline code),
 * closes on a line with at least as many of the same character, and its own indent is removed from the
 * code lines. A fence with no closing line stays text, so a reply still streaming in (or a stray fence
 * inside a list item) never swallows the rest of the message.
 */
export function splitFences(md: string): MdBlock[] {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const out: MdBlock[] = [];
    let text: string[] = [];
    let textStart = 0;
    const flush = () => { if (text.length) out.push({ kind: 'text', lines: text, start: textStart }); text = []; };
    for (let i = 0; i < lines.length; i++) {
        const open = lines[i].match(/^([ \t]{0,3})(`{3,}|~{3,})([^`]*)$/);
        const close = open && new RegExp(`^[ \\t]{0,3}${open[2][0]}{${open[2].length},}[ \\t]*$`);
        const end = close ? lines.findIndex((l, k) => k > i && close.test(l)) : -1;
        if (!open || end === -1) {
            if (!text.length) textStart = i;
            text.push(lines[i]);
            continue;
        }
        flush();
        const indent = new RegExp(`^[ \\t]{0,${open[1].length}}`);
        out.push({ kind: 'code', lines: lines.slice(i + 1, end).map(l => l.replace(indent, '')), start: i });
        i = end;
    }
    flush();
    return out;
}

const WORD = /[\p{L}\p{N}]/u;
const IN_WORD_UNDERSCORE = /(?<=[\p{L}\p{M}\p{N}])_(?=[\p{L}\p{M}\p{N}])/gu;
const DIGIT_SEPARATOR = /(?<=\p{N})_(?=\p{N})/gu;

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
        .replace(lineMarkers, '')
        .replace(CODE_SPAN, (_m, _run, c: string) => keep(spanText(c)))                            // `code`, ``code``
        .replace(/`+/g, '')                                                                         // stray backticks (e.g. an unclosed fence)
        .replace(/(?<![\p{L}\p{N}_\]])!\[([^\]]*)\]\([^)]*\)/gu, '$1')                             // ![alt](src)
        .replace(/(?<![\p{L}\p{N}_\]])\[([^\]]+)\]\([^)]+\)/gu, '$1')                              // [text](href) — not handlers[i](event)
        .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
        .replace(UNDERSCORE_EM, '$1')
        .replace(/~~([\s\S]+?)~~/g, '$1');
    if (speech) {
        // Outside code only: a * _ ~ touching a letter is a leftover marker; "5 * 3", "~5", "~/" stay.
        text = text.replace(DIGIT_SEPARATOR, '').replace(IN_WORD_UNDERSCORE, ' ')
            .replace(/[*_~]+(?=\p{L})|(?<=\p{L})[*_~]+/gu, '');
    }
    // Restore code; pad with a space only where it would otherwise glue two words together.
    text = text.replace(TOKEN, (m, i: string, off: number, all: string) => {
        const code = codes[Number(i)];
        if (code === undefined) return m;
        const before = off > 0 && WORD.test(all[off - 1]) ? ' ' : '';
        const after = WORD.test(all[off + m.length] ?? '') ? ' ' : '';
        return `${before}${code}${after}`;
    });
    return speech ? text.replace(DIGIT_SEPARATOR, '').replace(IN_WORD_UNDERSCORE, ' ') : text;
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
