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

export function formatInline(escaped: string): string {
    const codes: string[] = [];
    const withTokens = escaped.replace(/`([^`]+)`/g, (_m, code: string) => `${OPEN}${codes.push(code) - 1}${CLOSE}`);
    return withTokens
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
        .replace(UNDERSCORE_EM, '<em>$1</em>')
        .replace(TOKEN, (m, i: string) => (codes[Number(i)] === undefined ? m : `<code>${codes[Number(i)]}</code>`));
}
