/**
 * Master drop handler for the Scribe CodeMirror editor.
 *
 * Single onDrop entry-point branches by MIME-type / payload shape:
 *   - application/x-dwellium-widget → Phase D (inter-widget drag)
 *   - text/uri-list                 → Phase C (URL → fetch + convert to markdown)
 *   - Files (image)                 → Phase B (upload + insert ![](path))
 *   - Files (text)                  → Phase B (read + insert content)
 *   - text/html                     → Phase A (HTML → markdown via htmlToMarkdown)
 *   - text/plain                    → Phase A (insert verbatim)
 *
 * Each branch resolves to a string + drop position, then inserts at the
 * drop point via view.dispatch. Long-running operations (fetch, upload)
 * insert a placeholder spinner that gets replaced when the promise settles.
 */
import { EditorView, ViewPlugin } from '@codemirror/view';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/UserContext';
import { htmlToMarkdown } from './htmlToMarkdown';

// Flip to true to debug DnD wiring (logs every drag/drop event in DevTools)
const DEBUG = true;

// Module-level proof-of-life — fires as soon as this file is imported.
if (DEBUG) console.log('[Scribe DnD] dropHandler.ts module loaded');

const DWELLIUM_WIDGET_MIME = 'application/x-dwellium-widget';
const DWELLIUM_PATH_MIME = 'application/x-dwellium-path';
const TEXT_FILE_EXTS = ['.md', '.markdown', '.txt', '.json', '.csv', '.tsv', '.yaml', '.yml', '.log', '.html'];
const IMAGE_FILE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'];
const MAX_TEXT_FILE_BYTES = 1024 * 1024; // 1 MB

function getDropPos(view: EditorView, e: DragEvent): number {
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    return pos ?? view.state.selection.main.head;
}

function insertAt(view: EditorView, pos: number, text: string): { from: number; to: number } {
    view.dispatch({
        changes: { from: pos, insert: text },
        selection: { anchor: pos + text.length },
        scrollIntoView: true,
    });
    return { from: pos, to: pos + text.length };
}

async function readTextFile(file: File): Promise<string> {
    if (file.size > MAX_TEXT_FILE_BYTES) {
        const ok = confirm(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. Insert anyway?`);
        if (!ok) return '';
    }
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

async function uploadImage(file: File): Promise<{ path: string; url: string } | null> {
    const fd = new FormData();
    fd.append('image', file);
    try {
        const res = await fetch(`${API_BASE}/api/scribe/images`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.success) return null;
        return { path: data.path, url: data.url };
    } catch {
        return null;
    }
}

async function fetchArticle(url: string): Promise<{ title: string; content: string; byline?: string } | null> {
    try {
        const res = await fetch(`${API_BASE}/api/scribe/fetch-article`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) return null;
        return { title: data.title, content: data.content, byline: data.byline };
    } catch {
        return null;
    }
}

function fileExt(name: string): string {
    const i = name.lastIndexOf('.');
    return i === -1 ? '' : name.slice(i).toLowerCase();
}

// ── Phase D: Dwellium widget reference inserter ──────────────────────────
interface DwelliumWidgetPayload {
    widgetId: string;
    widgetType: string;
    title?: string;
    state?: Record<string, unknown>;
}

function formatWidgetReference(payload: DwelliumWidgetPayload): string {
    const title = payload.title ?? payload.widgetType ?? 'widget';
    const lines = [`> **📎 ${title}** _(from Dwellium ${payload.widgetType})_`];
    if (payload.state) {
        for (const [k, v] of Object.entries(payload.state)) {
            const valStr = typeof v === 'string' ? v : JSON.stringify(v);
            if (valStr.length < 200) lines.push(`> - **${k}:** ${valStr}`);
        }
    }
    lines.push('');
    return lines.join('\n') + '\n';
}

// ── Main drop handler ───────────────────────────────────────────────────
async function handleDrop(view: EditorView, e: DragEvent): Promise<boolean> {
    if (!e.dataTransfer) return false;
    const dt = e.dataTransfer;
    const dropPos = getDropPos(view, e);

    // ── Phase D: Dwellium widget ─────────────────────────────────────
    const widgetRaw = dt.getData(DWELLIUM_WIDGET_MIME);
    if (widgetRaw) {
        try {
            const payload = JSON.parse(widgetRaw) as DwelliumWidgetPayload;
            insertAt(view, dropPos, formatWidgetReference(payload));
            return true;
        } catch {
            // malformed payload — fall through to other handlers
        }
    }

    // ── File Explorer path drop (Cycle 5) ────────────────────────────
    //   Source: FileExplorerCell.onDragStart sets application/x-dwellium-path
    //   = JSON {name, path, tier}. Files insert their content as markdown;
    //   folder/domain/project/thread tiers insert a reference link.
    const pathRaw = dt.getData(DWELLIUM_PATH_MIME);
    if (pathRaw) {
        try {
            const payload = JSON.parse(pathRaw) as { name: string; path: string; tier: string };
            if (payload.tier === 'file') {
                // Insert placeholder, fetch content, replace
                const placeholder = `\n[Loading ${payload.name}…]()\n`;
                const { from, to } = insertAt(view, dropPos, placeholder);
                try {
                    const res = await fetch(`${API_BASE}/api/file-explorer/read?path=${encodeURIComponent(payload.path)}`, {
                        headers: getAuthHeaders(),
                    });
                    const data = await res.json();
                    if (res.ok && data.success && typeof data.content === 'string') {
                        const ext = fileExt(payload.name);
                        const text = ext === '.md' || ext === '.markdown'
                            ? data.content
                            : `\`\`\`${ext.slice(1) || ''}\n${data.content}\n\`\`\`\n`;
                        view.dispatch({ changes: { from, to, insert: text } });
                    } else {
                        view.dispatch({ changes: { from, to, insert: `_(failed to read ${payload.name}: ${data.error ?? 'HTTP ' + res.status})_\n` } });
                    }
                } catch (e: any) {
                    view.dispatch({ changes: { from, to, insert: `_(failed to read ${payload.name}: ${e?.message ?? e})_\n` } });
                }
            } else {
                // Folder/tier: insert a markdown reference link
                const tierLabel = payload.tier.charAt(0).toUpperCase() + payload.tier.slice(1);
                insertAt(view, dropPos, `\n📁 **${payload.name}** _(${tierLabel} — ${payload.path})_\n`);
            }
            return true;
        } catch {
            // malformed payload — fall through
        }
    }

    // ── Phase B: Files (image + text) ────────────────────────────────
    if (dt.files && dt.files.length > 0) {
        const files = Array.from(dt.files);
        let pos = dropPos;
        for (const file of files) {
            const ext = fileExt(file.name);
            if (IMAGE_FILE_EXTS.includes(ext)) {
                // Insert placeholder, upload, replace with markdown image
                const placeholder = `![Uploading ${file.name}…]()\n`;
                const { from, to } = insertAt(view, pos, placeholder);
                const result = await uploadImage(file);
                if (result) {
                    const md = `![${file.name}](${result.url})\n`;
                    view.dispatch({ changes: { from, to, insert: md } });
                    pos = from + md.length;
                } else {
                    view.dispatch({ changes: { from, to, insert: `_(failed to upload ${file.name})_\n` } });
                }
            } else if (TEXT_FILE_EXTS.includes(ext)) {
                const text = await readTextFile(file);
                if (text) {
                    const formatted = ext === '.md' || ext === '.markdown' ? text : `\`\`\`${ext.slice(1)}\n${text}\n\`\`\`\n`;
                    const { to } = insertAt(view, pos, formatted);
                    pos = to;
                }
            } else {
                // Unknown extension — try reading as text, fall back to filename
                try {
                    const text = await readTextFile(file);
                    const { to } = insertAt(view, pos, text || `_(unsupported file: ${file.name})_\n`);
                    pos = to;
                } catch {
                    const { to } = insertAt(view, pos, `_(unsupported file: ${file.name})_\n`);
                    pos = to;
                }
            }
        }
        return true;
    }

    // ── Phase C: URL → fetch + convert to markdown ───────────────────
    const uriList = dt.getData('text/uri-list');
    if (uriList && uriList.startsWith('http')) {
        const url = uriList.split('\n').find((l) => l.startsWith('http'))?.trim();
        if (url) {
            const placeholder = `\n[Fetching ${url}…]()\n`;
            const { from, to } = insertAt(view, dropPos, placeholder);
            const article = await fetchArticle(url);
            if (article) {
                const header = `\n# ${article.title}\n`;
                const byline = article.byline ? `_${article.byline}_\n\n` : '\n';
                const source = `[Source](${url})\n\n`;
                const md = header + byline + source + article.content + '\n';
                view.dispatch({ changes: { from, to, insert: md } });
            } else {
                // Fallback: insert as link
                view.dispatch({ changes: { from, to, insert: `\n[${url}](${url})\n` } });
            }
            return true;
        }
    }

    // ── Phase A: HTML → markdown ─────────────────────────────────────
    const html = dt.getData('text/html');
    if (html) {
        const md = htmlToMarkdown(html);
        if (md) {
            insertAt(view, dropPos, md);
            return true;
        }
    }

    // ── Phase A: plain text fallback ─────────────────────────────────
    const text = dt.getData('text/plain');
    if (text) {
        insertAt(view, dropPos, text);
        return true;
    }

    return false;
}

/**
 * Returns the CodeMirror extension that wires our master drop handler.
 *
 * Uses EditorView.domEventHandlers (NOT addEventListener on view.dom) so the
 * handlers run as part of CodeMirror's own event pipeline — which means OUR
 * handler runs BEFORE CodeMirror's built-in drop behavior. Returning `true`
 * from a handler tells CM "we handled it" and skips the default. This is the
 * canonical CM6 pattern for overriding native DnD.
 *
 * Event ordering:
 *   1. dragenter on contentDOM → preventDefault → drop zone is "active"
 *   2. dragover on contentDOM  → preventDefault → cursor shows copy icon
 *   3. drop on contentDOM      → preventDefault + handleDrop branches by MIME
 */
export function scribeDropHandler() {
    if (DEBUG) console.log('[Scribe DnD] scribeDropHandler() factory called — extension being registered');
    return [
        // Tag contentDOM so Desktop's outer drop handler can detect Scribe and bail
        EditorView.contentAttributes.of({ 'data-dwellium-drop-zone': 'scribe' }),

        // PRIMARY DnD path: ViewPlugin attaches NATIVE listeners DIRECTLY on
        // the editor's outer DOM in CAPTURE phase. Capture phase fires BEFORE
        // any bubbling listener (React, parent components, CodeMirror's own
        // built-in drop), so we get first crack at every event. preventDefault
        // + stopPropagation in the handler ensures no upstream handler sees it.
        ViewPlugin.fromClass(
            class {
                view: EditorView;
                dragEnter: (e: DragEvent) => void;
                dragOver: (e: DragEvent) => void;
                drop: (e: DragEvent) => void;

                constructor(view: EditorView) {
                    this.view = view;
                    if (DEBUG) console.log('[Scribe DnD] ViewPlugin attached — listeners going on view.dom in capture phase');

                    this.dragEnter = (e: DragEvent) => {
                        if (!e.dataTransfer) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (DEBUG) console.log('[Scribe DnD] dragenter (capture)', {
                            types: Array.from(e.dataTransfer.types),
                            files: e.dataTransfer.files?.length ?? 0,
                        });
                    };
                    this.dragOver = (e: DragEvent) => {
                        if (!e.dataTransfer) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'copy';
                    };
                    this.drop = (e: DragEvent) => {
                        if (!e.dataTransfer) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (DEBUG) console.log('[Scribe DnD] DROP (capture)', {
                            types: Array.from(e.dataTransfer.types),
                            files: e.dataTransfer.files?.length ?? 0,
                        });
                        void handleDrop(view, e);
                    };

                    // Capture phase (true) — runs before any bubble listener
                    view.dom.addEventListener('dragenter', this.dragEnter, true);
                    view.dom.addEventListener('dragover', this.dragOver, true);
                    view.dom.addEventListener('drop', this.drop, true);
                }
                destroy() {
                    this.view.dom.removeEventListener('dragenter', this.dragEnter, true);
                    this.view.dom.removeEventListener('dragover', this.dragOver, true);
                    this.view.dom.removeEventListener('drop', this.drop, true);
                }
            },
        ),
    ];
}
