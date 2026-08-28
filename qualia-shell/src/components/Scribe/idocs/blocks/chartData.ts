/**
 * chartData — Wave 2 chart data sync: CSV parsing + fetch from a raw CSV URL
 * or a Google Sheet (published or link-shared). Pure; `fetchFn` injectable.
 *
 *   parseCsv(text)          → string[][]   (RFC 4180-ish: quotes, "" escapes, CRLF, newlines in quotes; , ; \t)
 *   chartDataFromCsv(text)  → {label,value}[] (first text column = label, first numeric column = value; header row skipped)
 *   sheetsCsvUrl(url)       → export?format=csv URL for docs.google.com/spreadsheets/d/<id>/… (pub?output=csv kept)
 *   fetchChartData(url, fetchFn?) → chartDataFromCsv(await fetch(sheetsCsvUrl(url)))
 */

export interface ChartPoint { label: string; value: number }

/** Occurrences of `d` in `line`, ignoring anything inside double quotes. */
function countDelims(line: string, d: string): number {
    let n = 0, quoted = false;
    for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === d && !quoted) n++;
    }
    return n;
}

/**
 * Sample up to the first 10 non-empty lines and pick the delimiter
 * (comma / tab / semicolon) whose per-line count is most consistently ≥ 1
 * (mode frequency across the sample); ties — including "no delimiter at
 * all" — go to comma. Quote-aware, so a semicolon CSV with commas inside
 * quoted values sniffs as semicolon, and a TSV whose first line happens to
 * contain a comma sniffs as tab.
 */
function sniffDelimiter(src: string): string {
    const lines = src.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 10);
    let best = ',';
    let bestScore = 0;
    for (const d of [',', '\t', ';']) {
        const freq = new Map<number, number>();
        for (const line of lines) {
            const c = countDelims(line, d);
            if (c >= 1) freq.set(c, (freq.get(c) ?? 0) + 1);
        }
        let score = 0;
        freq.forEach((n) => { if (n > score) score = n; });
        if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
}

export function parseCsv(text: string): string[][] {
    const src = text.replace(/^﻿/, '');
    const delim = sniffDelimiter(src);
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
            } else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === delim) { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

/** "1,234.5", "$12", "45%" → number; anything else NaN. */
function toNum(s: string | undefined): number {
    const t = (s ?? '').trim().replace(/^[$€£¥]/, '').replace(/%$/, '').replace(/,/g, '');
    if (!t || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(t)) return NaN;
    return Number(t);
}

export function chartDataFromCsv(text: string): ChartPoint[] {
    const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
    if (!rows.length) return [];
    const cols = Math.max(...rows.map((r) => r.length));
    const isNum = (s: string | undefined) => Number.isFinite(toNum(s));
    const sample = rows.length > 1 ? rows.slice(1) : rows;
    const numScore = (c: number) => sample.filter((r) => isNum(r[c])).length / sample.length;
    const numericCols: number[] = [], textCols: number[] = [];
    for (let c = 0; c < cols; c++) (numScore(c) > 0.5 ? numericCols : textCols).push(c);
    // First text column = label, first numeric column = value. All-numeric sheets
    // (e.g. Year,Sales) use the first numeric column as the label instead.
    let labelCol = textCols[0] ?? -1;
    let valueCol = numericCols[0] ?? -1;
    if (labelCol < 0 && numericCols.length >= 2) { labelCol = numericCols[0]; valueCol = numericCols[1]; }
    if (valueCol < 0) return [];
    const header = rows.length > 1 && !isNum(rows[0][valueCol]);
    return (header ? rows.slice(1) : rows)
        .filter((r) => isNum(r[valueCol]))
        .map((r, i) => ({ label: labelCol >= 0 ? (r[labelCol] ?? '').trim() : String(i + 1), value: toNum(r[valueCol]) }));
}

/** Google Sheets share/edit URL → CSV export URL. Non-Sheets URLs pass through untouched. */
export function sheetsCsvUrl(url: string): string {
    const u = url.trim();
    if (!/^https?:\/\/docs\.google\.com\/spreadsheets\//i.test(u)) return u;
    // Published sheet ("File → Share → Publish to web"): /d/e/<pubid>/pub?output=csv or /pubhtml — keep, coerce to csv.
    if (/\/spreadsheets\/d\/e\//i.test(u)) {
        if (/[?&]output=csv/i.test(u)) return u;
        return u.replace(/\/pub(html)?(\?[^#]*)?(#.*)?$/i, (_m, _h, q: string | undefined) => `/pub?${(q ? q.slice(1) + '&' : '')}output=csv`);
    }
    const id = /\/spreadsheets\/d\/([^/?#]+)/i.exec(u)?.[1];
    if (!id) return u;
    const gid = /[?#&]gid=(\d+)/i.exec(u)?.[1];
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

export async function fetchChartData(url: string, fetchFn: typeof fetch = fetch): Promise<ChartPoint[]> {
    const target = sheetsCsvUrl(url);
    if (!/^https?:\/\//i.test(target)) throw new Error('Data source must be an http(s) URL');
    const res = await fetchFn(target);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = chartDataFromCsv(await res.text());
    if (!data.length) throw new Error('No numeric column found in the CSV');
    return data;
}
