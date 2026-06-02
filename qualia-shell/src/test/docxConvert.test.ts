import { describe, it, expect } from 'vitest';
import { buildDocx, markdownToDocxBytes, docxToMarkdown } from '../components/Scribe/docxConvert';

describe('Scribe ← Docs parity: .docx export + import', () => {
    it('buildDocx constructs a document without throwing', () => {
        expect(() => buildDocx('My Title', '# Heading\n\n- a\n- b\n\nBody.')).not.toThrow();
    });

    it('export produces a real .docx (zip — "PK" magic bytes)', async () => {
        const bytes = await markdownToDocxBytes('My Title', '# Heading\n\nSome body text.');
        expect(bytes.length).toBeGreaterThan(100);
        expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // "PK" → zip/OOXML
    });

    it('round-trips: markdown → .docx → markdown preserves the text', async () => {
        const bytes = await markdownToDocxBytes('Doc', '# Title\n\nHello world from docx.\n\n- item one\n- item two');
        const md = await docxToMarkdown(Buffer.from(bytes));
        expect(md).toContain('Hello world from docx');
        expect(md.toLowerCase()).toContain('item one');
    });
});
