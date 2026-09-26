/**
 * Inline markdown for one ARA line that is ALREADY HTML-escaped: **bold**, *italic*, _italic_, `code`.
 * Code spans are swapped for placeholders first, so nothing inside them is formatted (but italics can
 * still wrap them). `_` only opens/closes italics at a word boundary, and an underscore INSIDE a word may
 * sit within italics (CommonMark's rules) — so generate_content_free_tier_requests stays literal and
 * _the user_id column_ is italic. Letters, combining marks and digits all count as "word".
 */
import { OPEN, CLOSE, TOKEN, UNDERSCORE_EM, CODE_SPAN, spanText } from '../../lib/markdownText';

export { splitFences, toPlainText, toSpeechText, speechPauses, chunkForTts, type MdBlock } from '../../lib/markdownText';

export function formatInline(escaped: string): string {
    const codes: string[] = [];
    const withTokens = escaped.replace(CODE_SPAN, (_m, _run, code: string) => `${OPEN}${codes.push(spanText(code)) - 1}${CLOSE}`);
    return withTokens
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
        .replace(UNDERSCORE_EM, '<em>$1</em>')
        .replace(TOKEN, (m, i: string) => (codes[Number(i)] === undefined ? m : `<code>${codes[Number(i)]}</code>`));
}
