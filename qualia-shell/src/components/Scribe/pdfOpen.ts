/**
 * pdfOpen — Scribe's ".pdf opened → convert to markdown" interception.
 *
 * Every Scribe path that opens a file by path funnels through
 * `scribeStore.openFile`, which delegates .pdf paths here (lazy import so
 * pdfjs stays out of the main chunk). Dropped PDF Files (real bytes) come in
 * via `openPdfBytesAsMarkdown` from the drop handler.
 *
 * Rules: the original PDF is NEVER mutated or deleted; the converted doc is
 * always the sibling `<name> (from PDF).md` (so an unrelated `<name>.md` is
 * never overwritten, and a second open of the same PDF finds + reuses the
 * conversion instead of converting again).
 */
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/UserContext';
import { openWidget } from '../../lib/dwelliumCommands';
import { useScribeStore } from './scribeStore';
import { pdfToMarkdown, MAX_PDF_BYTES } from './pdfToMarkdown';

/** Leading marker line — Scribe's doc header shows the "from PDF" banner off it. */
export const FROM_PDF_MARKER = '<!-- converted-from-pdf:';

/** Canonical converted-doc path for a PDF: "a/b.pdf" → "a/b (from PDF).md". */
export function convertedMdPath(pdfPath: string): string {
    return pdfPath.replace(/\.pdf$/i, '') + ' (from PDF).md';
}

/** The source PDF named by a converted doc's marker line, or null. */
export function pdfSourceFromContent(content: string): string | null {
    if (!content.startsWith(FROM_PDF_MARKER)) return null;
    const end = content.indexOf('-->');
    if (end === -1) return null;
    return content.slice(FROM_PDF_MARKER.length, end).trim() || null;
}

function toast(msg: string): void {
    try { window.dispatchEvent(new CustomEvent('qualia-toast', { detail: msg })); } catch { /* SSR */ }
}

/** JSON-transported binary string → bytes (latin1 reconstruction). */
export function bytesFromBinaryString(s: string): Uint8Array {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
}

/**
 * Convert PDF bytes → sibling markdown doc, open it, toast. If the converted
 * doc already exists it is opened directly (no duplicate conversion). Over
 * the size cap → honest toast + PDF Gear instead.
 */
export async function openPdfBytesAsMarkdown(pdfPath: string, bytes: Uint8Array): Promise<void> {
    const name = pdfPath.split('/').pop() || pdfPath;
    const store = useScribeStore.getState();
    const target = convertedMdPath(pdfPath);

    const files = await store.listFiles();
    if (files.some(f => f.filepath === target)) {
        await store.openFile(target);
        return;
    }

    if (bytes.byteLength > MAX_PDF_BYTES) {
        toast(`${name} is over 20 MB — too large to convert to markdown here. Open it in PDF Gear.`);
        openWidget('pdf-gear');
        return;
    }

    let body: string;
    let truncated = false;
    try {
        const result = await pdfToMarkdown(bytes);
        body = result.markdown;
        truncated = result.truncated;
    } catch {
        body = `> _Couldn't extract text from ${name} in Scribe — open the original in PDF Gear._\n`;
    }

    const content = `${FROM_PDF_MARKER} ${pdfPath} -->\n\n${body}`;
    await store.createFile(target, content); // creates AND opens the .md; the PDF is untouched
    toast(`Converted ${name} → markdown${truncated ? ` (first pages only)` : ''} · Open original in PDF Gear`);
}

/**
 * Open a .pdf filepath from the Scribe file store: reuse an existing
 * conversion, else fetch the stored bytes and convert. A backend/binary
 * failure still lands on an honest fallback doc — never garbage bytes.
 */
export async function openPdfFilepath(filepath: string): Promise<void> {
    const store = useScribeStore.getState();
    const target = convertedMdPath(filepath);
    const files = await store.listFiles();
    if (files.some(f => f.filepath === target)) {
        await store.openFile(target);
        return;
    }

    let bytes = new Uint8Array(0); // empty → pdfToMarkdown throws → honest fallback doc
    try {
        const res = await fetch(`${API_BASE}/api/scribe/files/${filepath}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success && typeof data.content === 'string') {
            bytes = bytesFromBinaryString(data.content);
        }
    } catch { /* offline — fallback doc below */ }
    await openPdfBytesAsMarkdown(filepath, bytes);
}
