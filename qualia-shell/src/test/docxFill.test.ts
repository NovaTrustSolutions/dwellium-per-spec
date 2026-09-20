/**
 * docxFill — `.docx` placeholder extraction/fill + preview HTML.
 *
 * The fixture is built with `jszip` in-test (minimal `[Content_Types].xml` +
 * `word/document.xml` + `word/header1.xml`) rather than a checked-in binary,
 * so the exact XML shape under test — a placeholder split across three runs,
 * a header placeholder, an untouched paragraph, and a value containing `<&>`
 * — is visible right here.
 */
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';

const WORDML_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORDML_NS}"><w:body>
<w:p><w:r><w:t>{{cli</w:t></w:r><w:r><w:t>ent_na</w:t></w:r><w:r><w:t>me}}</w:t></w:r></w:p>
<w:p><w:r><w:t>Note: {{note}}</w:t></w:r></w:p>
<w:p><w:r><w:t>This paragraph is untouched.</w:t></w:r></w:p>
</w:body></w:document>`;

const HEADER_XML = `<w:hdr xmlns:w="${WORDML_NS}"><w:p><w:r><w:t>{{title}}</w:t></w:r></w:p></w:hdr>`;

async function buildFixtureDocx(): Promise<Blob> {
    const zip = new JSZip();
    zip.file(
        '[Content_Types].xml',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
    );
    zip.file('word/document.xml', DOCUMENT_XML);
    zip.file('word/header1.xml', HEADER_XML);
    return zip.generateAsync({ type: 'blob' });
}

describe('docxFill', () => {
    describe('extractDocxKeys', () => {
        it('finds a placeholder split across three <w:t> runs, plus header and body keys, in first-appearance order', async () => {
            const { extractDocxKeys } = await import('../components/DocViewer/docxFill');
            const keys = await extractDocxKeys(await buildFixtureDocx());
            expect(keys).toEqual(['client_name', 'note', 'title']);
        });

        it('rejects a file that is not a zip with "Not a .docx file"', async () => {
            const { extractDocxKeys } = await import('../components/DocViewer/docxFill');
            const notAZip = new Blob(['plain text, not a zip'], { type: 'text/plain' });
            await expect(extractDocxKeys(notAZip)).rejects.toThrow('Not a .docx file');
        });

        it('rejects a zip with no word/document.xml with "Not a .docx file"', async () => {
            const { extractDocxKeys } = await import('../components/DocViewer/docxFill');
            const zip = new JSZip();
            zip.file('readme.txt', 'hello');
            const blob = await zip.generateAsync({ type: 'blob' });
            await expect(extractDocxKeys(blob)).rejects.toThrow('Not a .docx file');
        });
    });

    describe('fillDocx', () => {
        it('fills the split placeholder, escapes a value containing <&>$& exactly once, leaves an unfilled header placeholder and an untouched paragraph byte-identical', async () => {
            const { fillDocx } = await import('../components/DocViewer/docxFill');
            const original = await buildFixtureDocx();

            const filledBlob = await fillDocx(
                original,
                { client_name: 'Jane Smith', note: '<&>$&' }, // title intentionally has no value
                {}
            );

            const zip = await JSZip.loadAsync(await filledBlob.arrayBuffer());
            const documentXml = await zip.file('word/document.xml')!.async('string');
            const headerXml = await zip.file('word/header1.xml')!.async('string');

            // Split placeholder filled into the paragraph's first run; other runs emptied.
            expect(documentXml).toContain('Jane Smith');
            expect(documentXml).not.toContain('{{client_name}}');
            expect(documentXml).toContain('xml:space="preserve"');

            // `<&>$&` comes out XML-escaped exactly once — `$&` is a literal
            // value here, not String.replace's "whole match" token, because
            // fillDocx uses a function replacer.
            const escapedNote = '&lt;&amp;&gt;$&amp;';
            const occurrences = documentXml.split(escapedNote).length - 1;
            expect(occurrences).toBe(1);

            // No value for `title` → the header placeholder is left in place.
            expect(headerXml).toContain('{{title}}');

            // The untouched paragraph's own XML is unchanged. (Whole-file
            // byte-identity isn't checked: XMLSerializer drops the XML
            // declaration that DOCUMENT_XML starts with, so the file as a
            // whole cannot be byte-identical — only this paragraph's own
            // markup is asserted unchanged, per the plan's escape hatch.)
            const untouchedParagraph = '<w:p><w:r><w:t>This paragraph is untouched.</w:t></w:r></w:p>';
            expect(DOCUMENT_XML).toContain(untouchedParagraph);
            expect(documentXml).toContain(untouchedParagraph);
        });

        it('touches nothing when no values are supplied (parts come back byte-identical)', async () => {
            const { fillDocx } = await import('../components/DocViewer/docxFill');
            const filledBlob = await fillDocx(await buildFixtureDocx(), {}, {});
            const zip = await JSZip.loadAsync(await filledBlob.arrayBuffer());
            const documentXml = await zip.file('word/document.xml')!.async('string');
            const headerXml = await zip.file('word/header1.xml')!.async('string');
            expect(documentXml).toBe(DOCUMENT_XML);
            expect(headerXml).toBe(HEADER_XML);
        });

        it('rejects a file that is not a .docx', async () => {
            const { fillDocx } = await import('../components/DocViewer/docxFill');
            const notAZip = new Blob(['plain text, not a zip'], { type: 'text/plain' });
            await expect(fillDocx(notAZip, {}, {})).rejects.toThrow('Not a .docx file');
        });
    });

    // Real mammoth cannot run here: mammoth's browser-mode `{ arrayBuffer }`
    // input is only wired through its `browser/unzip.js` shim, which is
    // selected via package.json's "browser" field — a mapping Vitest does not
    // apply (it resolves "main", i.e. the Node build, even under the jsdom
    // environment). Verified empirically: calling
    // `mammoth.convertToHtml({ arrayBuffer })` under this project's actual
    // vitest.config.ts throws "Could not find file in options". So this test
    // mocks `mammoth` and exercises docxFill's own wiring — passing the
    // arrayBuffer through and sanitizing the result — not mammoth's parser.
    describe('docxToHtml (mocked mammoth — real mammoth cannot run under vitest/jsdom, see note above)', () => {
        it('sanitizes mammoth output before returning it', async () => {
            vi.resetModules();
            vi.doMock('mammoth', () => ({
                default: {
                    convertToHtml: vi.fn(async () => ({
                        value: '<p>Hello</p><script>window.__pwned = 1;</script>',
                        messages: [],
                    })),
                },
            }));
            const { docxToHtml } = await import('../components/DocViewer/docxFill');
            const html = await docxToHtml(new Blob(['irrelevant'], { type: 'application/octet-stream' }));
            expect(html).toContain('Hello');
            expect(html).not.toContain('<script');
            expect(html).not.toContain('__pwned');
            vi.doUnmock('mammoth');
            vi.resetModules();
        });
    });
});
