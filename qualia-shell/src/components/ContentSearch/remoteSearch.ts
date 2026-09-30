/**
 * remoteSearch — backend-backed notes + semantic file search for ContentSearch
 * (spec §2.5 Phase 3). Mirrors the ⌘K CommandPalette request shape exactly
 * (CommandPalette.tsx:736-800, :565-584) so both surfaces hit the same
 * endpoints the same way: plain `fetch`, no auth header — `installApiAuthFetch`
 * (src/lib/installApiAuthFetch.ts) patches `window.fetch` globally for any
 * same-origin OR API_BASE-origin `/api/*` URL, absolute or relative, so this
 * file doesn't need to think about auth at all.
 */
import { API_BASE } from '../../config';
import type { SearchHit } from './searchEngine';

const API_ROOT = API_BASE.replace(/\/+$/, '');
const FILES_API = `${API_ROOT}/api/files`;

export interface RemoteSearchResult {
    hits: SearchHit[];
    failed: boolean;
}

interface RawNote {
    id?: unknown;
    title?: unknown;
    content?: unknown;
}

interface RawSemanticRow {
    fileId?: unknown;
    text?: unknown;
    similarity?: unknown;
}

function snippetOf(body: string): string {
    const collapsed = body.replace(/\s+/g, ' ').trim();
    return collapsed.length > 140 ? `${collapsed.slice(0, 140)}…` : collapsed;
}

/** GET ${FILES_API}?limit=500 → Map fileId → name. Never throws (empty map on failure).
 *  ponytail: 500 ceiling — chunks from files past it show as "Document"; page if libraries grow. */
export async function fetchFileNames(signal?: AbortSignal): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    try {
        const res = await fetch(`${FILES_API}?limit=500`, { signal });
        if (!res.ok) return names;
        const json = await res.json();
        if (!json?.success || !Array.isArray(json.data)) return names;
        for (const row of json.data as Array<Record<string, unknown>>) {
            const id = typeof row.id === 'string' ? row.id : null;
            const name = typeof row.name === 'string' ? row.name : null;
            if (id && name) names.set(id, name);
        }
    } catch {
        /* offline / non-JSON → empty map */
    }
    return names;
}

function parseNoteHits(raw: unknown): SearchHit[] {
    if (!Array.isArray(raw)) return [];
    const hits: SearchHit[] = [];
    for (const row of raw as RawNote[]) {
        const id = row?.id;
        if (id == null) continue;
        const title = typeof row.title === 'string' && row.title ? row.title : 'Untitled note';
        const body = typeof row.content === 'string' ? row.content : '';
        hits.push({
            id: `note-${id}`,
            type: 'note',
            title,
            body,
            widget: 'notepad',
            ref: String(id),
            score: 0,
            snippet: snippetOf(body),
        });
    }
    return hits;
}

/** Dedupe semantic rows by fileId, keeping the highest similarity, sorted desc. */
function parseSemanticHits(raw: unknown, names: Map<string, string>): SearchHit[] {
    if (!Array.isArray(raw)) return [];
    const best = new Map<string, { text: string; similarity: number }>();
    for (const row of raw as RawSemanticRow[]) {
        const fileId = typeof row?.fileId === 'string' ? row.fileId : null;
        if (!fileId) continue;
        const similarity = typeof row.similarity === 'number' ? row.similarity : 0;
        const text = typeof row.text === 'string' ? row.text : '';
        const existing = best.get(fileId);
        if (!existing || similarity > existing.similarity) {
            best.set(fileId, { text, similarity });
        }
    }
    return [...best.entries()]
        .sort((a, b) => b[1].similarity - a[1].similarity)
        .map(([fileId, { text }]) => ({
            id: `chunk-${fileId}`,
            type: 'file' as const,
            title: names.get(fileId) ?? 'Document',
            body: text,
            widget: 'file-explorer',
            score: 0,
            snippet: snippetOf(text),
        }));
}

export async function searchRemote(
    query: string,
    names: Map<string, string>,
    signal?: AbortSignal,
): Promise<RemoteSearchResult> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { hits: [], failed: false };

    // Semantic search embeds the query server-side — only from 3 chars, like ⌘K (CommandPalette.tsx:758).
    const semantic = trimmed.length >= 3;
    const settled = await Promise.allSettled([
        fetch(`${FILES_API}/notes?q=${encodeURIComponent(trimmed)}&limit=12`, { signal }),
        semantic
            ? fetch(`${FILES_API}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: trimmed, topK: 8 }),
                signal,
            })
            : Promise.resolve(null),
    ]);

    if (signal?.aborted) return { hits: [], failed: false };

    const [notesRes, semanticRes] = settled;
    let failed = false;
    let noteHits: SearchHit[] = [];
    let semanticHits: SearchHit[] = [];

    if (notesRes.status === 'fulfilled') {
        try {
            const json = await notesRes.value.json();
            if (notesRes.value.ok && json?.success) {
                noteHits = parseNoteHits(json.data);
            } else {
                failed = true;
            }
        } catch {
            failed = true;
        }
    } else {
        failed = true;
    }

    if (semanticRes.status === 'fulfilled' && semanticRes.value === null) {
        // skipped (query < 3 chars)
    } else if (semanticRes.status === 'fulfilled' && semanticRes.value) {
        try {
            const json = await semanticRes.value.json();
            if (semanticRes.value.ok && json?.success) {
                semanticHits = parseSemanticHits(json.data, names);
            } else {
                failed = true;
            }
        } catch {
            failed = true;
        }
    } else {
        failed = true;
    }

    if (signal?.aborted) return { hits: [], failed: false };

    return { hits: [...noteHits, ...semanticHits], failed };
}
