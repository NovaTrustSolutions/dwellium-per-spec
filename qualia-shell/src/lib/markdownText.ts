/**
 * Markdown → structure / plain text, shared by ARA's chat renderer, note titles and speech, and by the
 * text-to-speech used across widgets (lib/ttsVoices.ts). One scanner, so every surface agrees about the
 * same text. Pure: no DOM, no React.
 */
export const OPEN = '\uE000'; // private-use: never a letter, mark or digit, so it can't disturb the word checks
export const CLOSE = '\uE001';
export const TOKEN = /\uE000(\d+)\uE001/g;
export const UNDERSCORE_EM = /(?<![\p{L}\p{M}\p{N}_])_((?:[^_]|(?<=[\p{L}\p{M}\p{N}])_(?=[\p{L}\p{M}\p{N}]))+?)_(?![\p{L}\p{M}\p{N}_])/gu;
/** A code span: a backtick run (never starting inside a longer run) … the same-length run (CommonMark). */
export const CODE_SPAN = /(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;
/** Code-span text: line breaks become spaces; one space is trimmed from each end when both ends have one. */
export function spanText(code: string): string {
    const t = code.replace(/\n/g, ' ');
    return /^ [\s\S]*[^ ][\s\S]* $/.test(t) ? t.slice(1, -1) : t;
}

export type MdBlock = { kind: 'text' | 'code'; lines: string[]; start: number };
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
    const out: MdBlock[] = [];
    let text: string[] = [];
    let textStart = 0;
    const flush = () => { if (text.length) out.push({ kind: 'text', lines: text, start: textStart }); text = []; };
    for (let i = 0; i < lines.length; i++) {
        // any indent: LLMs nest fences under list items with 4+ spaces (plain indented text never becomes code)
        const open = lines[i].match(/^([ \t]*)(`{3,}|~{3,})([^`]*)$/);
        const close = open && new RegExp(`^([ \\t]*)${open[2][0]}{${open[2].length},}[ \\t]*$`);
        const end = close ? lines.findIndex((l, k) => {
            const m = k > i && l.match(close);
            return !!m && Math.abs(width(m[1]) - width(open[1])) <= 3;
        }) : -1;
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
        text = joinGroups(text).replace(IN_WORD_UNDERSCORE, ' ')
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
