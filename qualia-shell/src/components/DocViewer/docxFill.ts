/**
 * docxFill — `.docx` placeholder support for the Template Generator: extract
 * `{{key}}` placeholders from a Word document, fill them, and render a
 * sanitized HTML preview.
 *
 * No new dependency: `jszip` (lazy-loaded, pattern from
 * `Scribe/idocs/idocsPptxImport.ts`) walks the OOXML zip directly with native
 * `DOMParser`/`XMLSerializer`; `mammoth` (already used by `Scribe/docxConvert.ts`)
 * renders the preview HTML, sanitized through the app's central DOMPurify gate.
 *
 * Word frequently splits one `{{key}}` across multiple `<w:t>` runs (its
 * autocorrect/spellcheck boundary tracking). Per paragraph, this module joins
 * all `<w:t>` text, matches placeholders against the joined string, and — only
 * when a substitution actually changes the text — writes the filled text into
 * the paragraph's first `<w:t>` (marked `xml:space="preserve"`) and empties
 * the rest. A paragraph with no placeholder, or one whose only placeholders
 * have no value yet, is never touched, so it round-trips unchanged.
 * // ponytail: a placeholder paragraph takes its first run's formatting; a
 * // per-run merge would be needed if bold/italic differs across one
 * // placeholder's split runs.
 */
import type JSZipType from 'jszip';
import { formatValue, inferType, PLACEHOLDER_SOURCE, type VarType } from './templateEngine';
import { sanitizeHtml } from '../../utils/safeMarkdown';

const WORDML_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

type Zip = JSZipType;

async function loadZip(file: Blob): Promise<Zip> {
    const { default: JSZip } = await import('jszip');
    let zip: Zip;
    try {
        zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch {
        throw new Error('Not a .docx file');
    }
    if (!zip.file('word/document.xml')) throw new Error('Not a .docx file');
    return zip;
}

/** `word/document.xml`, then every header/footer part, in a stable order. */
function partPaths(zip: Zip): string[] {
    const names = Object.keys(zip.files);
    const headers = names.filter((n) => /^word\/header\d*\.xml$/.test(n)).sort();
    const footers = names.filter((n) => /^word\/footer\d*\.xml$/.test(n)).sort();
    return ['word/document.xml', ...headers, ...footers].filter((p) => !!zip.file(p));
}

function paragraphs(doc: Document): Element[] {
    return Array.from(doc.getElementsByTagNameNS(WORDML_NS, 'p'));
}

/** This paragraph's OWN runs — a text box nests whole paragraphs inside one. */
function runTextNodes(p: Element): Element[] {
    return Array.from(p.getElementsByTagNameNS(WORDML_NS, 't')).filter((t) => {
        let n: Node | null = t.parentNode;
        while (n && !((n as Element).localName === 'p' && (n as Element).namespaceURI === WORDML_NS)) n = n.parentNode;
        return n === p;
    });
}

export async function extractDocxKeys(file: Blob): Promise<string[]> {
    const zip = await loadZip(file);
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const path of partPaths(zip)) {
        const xml = await zip.file(path)!.async('string');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        for (const p of paragraphs(doc)) {
            const text = runTextNodes(p).map((t) => t.textContent ?? '').join('');
            const re = new RegExp(PLACEHOLDER_SOURCE, 'g');
            let match: RegExpExecArray | null;
            while ((match = re.exec(text)) !== null) {
                const key = match[1];
                if (!seen.has(key)) {
                    seen.add(key);
                    keys.push(key);
                }
            }
        }
    }
    return keys;
}

export async function fillDocx(
    file: Blob,
    values: Record<string, string>,
    types: Record<string, VarType>
): Promise<Blob> {
    const zip = await loadZip(file);
    for (const path of partPaths(zip)) {
        const xml = await zip.file(path)!.async('string');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        let changed = false;
        for (const p of paragraphs(doc)) {
            const runTexts = runTextNodes(p);
            if (runTexts.length === 0) continue;
            const joined = runTexts.map((t) => t.textContent ?? '').join('');
            // Function replacer (never a replacement *string*) so values
            // containing `$&`, `$'`, `$$` are inserted literally.
            const filled = joined.replace(new RegExp(PLACEHOLDER_SOURCE, 'g'), (match, key: string) => {
                const raw = values[key];
                if (!raw) return match; // missing/empty → leave {{key}} in place
                return formatValue(raw, types[key] ?? inferType(key));
            });
            if (filled === joined) continue; // no placeholder, or nothing to fill — leave untouched
            const [first, ...rest] = runTexts;
            // Assigned via textContent, so the XML serializer escapes it.
            first.textContent = filled;
            first.setAttributeNS(XML_NS, 'xml:space', 'preserve');
            for (const t of rest) t.textContent = '';
            changed = true;
        }
        if (changed) {
            // XMLSerializer drops the XML declaration; put the original back.
            const declaration = /^<\?xml[^>]*\?>\s*/.exec(xml)?.[0] ?? '';
            zip.file(path, declaration + new XMLSerializer().serializeToString(doc));
        }
    }
    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
}

/**
 * docx → sanitized HTML preview. `Scribe/docxConvert.ts` only exposes a
 * docx→Markdown path (mammoth's HTML piped through `htmlToMarkdown`), so it
 * doesn't fit here — this calls `mammoth.convertToHtml` directly, matching
 * `docxConvert.ts`'s own browser-mode calling convention (`{ arrayBuffer }`),
 * and sanitizes the result through the app's central DOMPurify gate before
 * returning it (see `src/utils/safeMarkdown.ts`).
 */
export async function docxToHtml(file: Blob): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const { default: mammoth } = await import('mammoth'); // lazy: keeps mammoth out of the widget chunk
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return sanitizeHtml(result.value);
}
