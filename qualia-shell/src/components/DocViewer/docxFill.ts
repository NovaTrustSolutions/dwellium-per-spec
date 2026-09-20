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
 * the `<w:t>` text only to FIND placeholders, then edits run by run: a
 * placeholder inside one run is replaced in place; one split across runs puts
 * its value in the run where it starts and trims its fragments from the runs
 * it spans. Runs without a filled placeholder are never touched, so tabs,
 * breaks and formatting between two placeholders keep their place.
 * // ponytail: a value takes the formatting of the run its placeholder STARTS
 * // in; splitting the value across the original runs is not attempted.
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
            const runs = runTextNodes(p);
            if (runs.length === 0) continue;
            const texts = runs.map((t) => t.textContent ?? '');
            const joined = texts.join('');
            // Where each run's text starts inside the joined paragraph text.
            const starts: number[] = [];
            let offset = 0;
            for (const t of texts) { starts.push(offset); offset += t.length; }
            // Last run starting at or before `pos` — skips empty runs that share a start.
            const runAt = (pos: number): number => { let i = starts.length - 1; while (starts[i] > pos) i--; return i; };

            // Replace run by run, last match first so earlier offsets stay valid. A
            // placeholder inside one run is edited in place; one SPLIT across runs puts
            // its value where it starts and trims its fragments from the runs it spans.
            // Runs are never merged wholesale: a <w:tab/> or <w:br/> run sitting between
            // two placeholders (tab-aligned invoice lines) keeps its place between them.
            const next = [...texts];
            for (const m of [...joined.matchAll(new RegExp(PLACEHOLDER_SOURCE, 'g'))].reverse()) {
                const raw = values[m[1]];
                if (!raw) continue; // missing/empty → leave {{key}} in place
                const value = formatValue(raw, types[m[1]] ?? inferType(m[1]));
                const s = m.index;
                const e = s + m[0].length;
                const i = runAt(s);
                const j = runAt(e - 1);
                if (i === j) {
                    next[i] = next[i].slice(0, s - starts[i]) + value + next[i].slice(e - starts[i]);
                } else {
                    next[j] = next[j].slice(e - starts[j]);
                    for (let k = i + 1; k < j; k++) next[k] = '';
                    next[i] = next[i].slice(0, s - starts[i]) + value;
                }
            }
            next.forEach((text, idx) => {
                if (text === texts[idx]) return; // untouched runs round-trip unchanged
                runs[idx].textContent = text; // textContent → the serializer escapes it
                runs[idx].setAttributeNS(XML_NS, 'xml:space', 'preserve');
                changed = true;
            });
        }
        if (changed) {
            // jsdom's XMLSerializer drops the XML declaration, a browser's keeps it:
            // restore the original only when it is missing (two declarations are
            // malformed XML — Word and macOS textutil reject the whole file).
            const out = new XMLSerializer().serializeToString(doc);
            const declaration = /^<\?xml[^>]*\?>\s*/.exec(xml)?.[0] ?? '';
            zip.file(path, out.startsWith('<?xml') ? out : declaration + out);
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
