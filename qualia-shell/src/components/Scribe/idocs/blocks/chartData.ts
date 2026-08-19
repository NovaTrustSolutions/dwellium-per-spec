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

export function parseCsv(text: string): string[][] {
    const src = text.replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
    // ponytail: delimiter sniff on the first line only — comma unless it has none and a tab/semicolon.
    const delim = firstLine.includes(',') ? ',' : firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
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
