/**
 * pdfExport — export a Scribe document to PDF (suitenumerique/docs exports to
 * PDF). Uses `pdf-lib` (already a dependency — no new install), so it produces
 * a real downloadable .pdf with no backend.
 *
 * Scope: renders the Markdown as cleanly-wrapped monospaced-ish text with the
 * title at the top. It is a faithful *text* export, not a styled HTML render
 * (that would need the GPL BlockNote XL packages Docs itself gates behind a
 * flag). `markdownToPdfBytes` is async-pure (no DOM) → unit-testable.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PAGE_W = 595.28;   // A4 pt
const PAGE_H = 841.89;
const MARGIN = 56;
const FONT_SIZE = 11;
const LINE_H = 15;
const TITLE_SIZE = 18;

/** pdf-lib StandardFonts use WinAnsi; drop codepoints it can't encode. */
function toWinAnsi(s: string): string {
    let out = '';
    for (const ch of s) {
        const code = ch.codePointAt(0) ?? 0;
        out += code <= 0xff ? ch : '?';
    }
    return out;
}

/** Greedy word-wrap a single logical line to a max pixel width. */
function wrapLine(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
    if (text === '') return [''];
    const words = text.split(/(\s+)/); // keep whitespace tokens
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
        const candidate = cur + w;
        if (font.widthOfTextAtSize(candidate, size) > maxWidth && cur !== '') {
            lines.push(cur.replace(/\s+$/, ''));
            cur = w.replace(/^\s+/, '');
        } else {
            cur = candidate;
        }
    }
    if (cur.trim() !== '' || lines.length === 0) lines.push(cur);
    return lines;
}

/** Build a PDF (as bytes) from a title + Markdown source. */
export async function markdownToPdfBytes(title: string, markdown: string): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const usableWidth = PAGE_W - MARGIN * 2;

    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const newPageIfNeeded = () => {
        if (y < MARGIN + LINE_H) {
            page = pdf.addPage([PAGE_W, PAGE_H]);
            y = PAGE_H - MARGIN;
        }
    };

    // Title
    const safeTitle = toWinAnsi((title || 'Untitled').trim());
    page.drawText(safeTitle, { x: MARGIN, y: y - TITLE_SIZE, size: TITLE_SIZE, font: bold });
    y -= TITLE_SIZE + LINE_H;

    // Body — one logical line per source line, word-wrapped.
    const sourceLines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
    for (const raw of sourceLines) {
        const wrapped = wrapLine(toWinAnsi(raw), font, FONT_SIZE, usableWidth);
        for (const ln of wrapped) {
            newPageIfNeeded();
            page.drawText(ln, { x: MARGIN, y: y - FONT_SIZE, size: FONT_SIZE, font });
            y -= LINE_H;
        }
    }

    return pdf.save();
}

/** Browser-only: trigger a download of the given PDF bytes. Guarded for SSR/tests. */
export function downloadPdf(filename: string, bytes: Uint8Array): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
