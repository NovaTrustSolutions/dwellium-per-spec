/**
 * docxConvert — Word (.docx) import & export for Scribe (suitenumerique/docs
 * imports/exports .docx). Import uses `mammoth` (docx → HTML) piped through
 * Scribe's existing `htmlToMarkdown`; export uses the `docx` library to build a
 * real Word document from the Markdown.
 *
 * The conversion functions are environment-agnostic enough to unit-test in node
 * (round-trip: build a .docx, read it back, assert the text survived).
 */
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { htmlToMarkdown } from './htmlToMarkdown';

/** Import: a .docx (ArrayBuffer in the browser, Buffer in node) → Markdown. */
export async function docxToMarkdown(input: ArrayBuffer | Uint8Array): Promise<string> {
    const arg =
        input instanceof ArrayBuffer
            ? { arrayBuffer: input }
            : { buffer: input as unknown as Buffer };
    const result = await mammoth.convertToHtml(arg as Parameters<typeof mammoth.convertToHtml>[0]);
    return htmlToMarkdown(result.value).trim();
}

/** Map one Markdown line to a docx Paragraph (headings, bullets, quotes, plain). */
function mdLineToParagraph(line: string): Paragraph {
    if (line.startsWith('### ')) return new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 });
    if (line.startsWith('## ')) return new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 });
    if (line.startsWith('# ')) return new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 });
    if (/^[-*]\s+/.test(line)) return new Paragraph({ text: line.replace(/^[-*]\s+/, ''), bullet: { level: 0 } });
    if (/^\d+\.\s+/.test(line)) return new Paragraph({ text: line.replace(/^\d+\.\s+/, ''), bullet: { level: 0 } });
    if (line.startsWith('> ')) return new Paragraph({ children: [new TextRun({ text: line.slice(2), italics: true })] });
    return new Paragraph({ children: [new TextRun(line)] });
}

/** Build a docx `Document` from a title + Markdown. Pure (no I/O) → testable. */
export function buildDocx(title: string, markdown: string): Document {
    const paragraphs: Paragraph[] = [
        new Paragraph({ text: (title || 'Untitled').trim(), heading: HeadingLevel.TITLE }),
        ...((markdown || '').replace(/\r\n/g, '\n').split('\n').map(mdLineToParagraph)),
    ];
    return new Document({ sections: [{ children: paragraphs }] });
}

/** Export bytes (Uint8Array) — usable in node (tests) and the browser. */
export async function markdownToDocxBytes(title: string, markdown: string): Promise<Uint8Array> {
    const doc = buildDocx(title, markdown);
    // Packer.toBuffer works in node; toBlob in the browser. Prefer blob in browser.
    if (typeof window !== 'undefined' && typeof (Packer as any).toBlob === 'function') {
        const blob = await Packer.toBlob(doc);
        return new Uint8Array(await blob.arrayBuffer());
    }
    const buf = await Packer.toBuffer(doc);
    return new Uint8Array(buf);
}

/** Browser-only: download a .docx built from the given Markdown. Guarded for SSR/tests. */
export async function downloadDocx(filename: string, title: string, markdown: string): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const bytes = await markdownToDocxBytes(title, markdown);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
