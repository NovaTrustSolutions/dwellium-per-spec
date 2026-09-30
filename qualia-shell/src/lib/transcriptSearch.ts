/**
 * transcriptSearch — Speaker-Library 2026-06-12 (Ilya): make saved audio
 * transcriptions searchable from ⌘K, INCLUDING by speaker name — "search a
 * person's name and get the conversations they spoke in."
 *
 * Reads the same localStorage log TranscriptionHub maintains
 * ('dwellium-transcription-log'); pure over an injectable raw string so it
 * unit-tests with no DOM.
 */

const TRANSCRIPTION_LOG_KEY = 'dwellium-transcription-log';

export interface TranscriptLogSegment { text: string; speaker: string; start?: number }
export interface TranscriptLogEntry { id: string; title: string; segments: TranscriptLogSegment[]; createdAt: number; wordCount?: number }

/** Coerce an arbitrary segment into a safe shape, or drop it if unusable. */
function sanitizeSegment(s: unknown): TranscriptLogSegment | null {
    if (!s || typeof s !== 'object') return null;
    const { text, speaker, start } = s as Record<string, unknown>;
    if (typeof text !== 'string') return null;
    return {
        text,
        speaker: typeof speaker === 'string' ? speaker : '',
        ...(typeof start === 'number' ? { start } : {}),
    };
}

export interface TranscriptHit {
    id: string;
    title: string;
    /** The matching segment (or opening segment) — palette snippet. */
    snippet: string;
    /** Set when the match was a SPEAKER NAME (ranks above text matches). */
    speakerMatch?: string;
    createdAt: number;
}

export function readTranscriptLog(raw?: string | null): TranscriptLogEntry[] {
    let source = raw;
    if (source === undefined) {
        try { source = localStorage.getItem(TRANSCRIPTION_LOG_KEY); } catch { return []; }
    }
    if (!source) return [];
    try {
        const parsed = JSON.parse(source);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((e: any): e is TranscriptLogEntry => e && typeof e.id === 'string' && Array.isArray(e.segments))
            .map((e: TranscriptLogEntry) => ({
                ...e,
                title: typeof e.title === 'string' ? e.title : '',
                segments: e.segments.map(sanitizeSegment).filter((s): s is TranscriptLogSegment => s !== null),
            }));
    } catch {
        return [];
    }
}

/** Top-K transcriptions matching `query` by speaker name, title, or text. */
export function searchTranscriptions(query: string, k = 5, raw?: string | null): TranscriptHit[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: Array<TranscriptHit & { rank: number }> = [];
    for (const entry of readTranscriptLog(raw)) {
        const speakerSeg = entry.segments.find(s => (s.speaker || '').toLowerCase().includes(q));
        const textSeg = entry.segments.find(s => (s.text || '').toLowerCase().includes(q));
        const titleHit = (entry.title || '').toLowerCase().includes(q);
        if (!speakerSeg && !textSeg && !titleHit) continue;
        const snippetSeg = textSeg ?? speakerSeg ?? entry.segments[0];
        hits.push({
            id: entry.id,
            title: entry.title || 'Untitled recording',
            snippet: (snippetSeg?.text || '').slice(0, 90),
            speakerMatch: speakerSeg?.speaker,
            createdAt: entry.createdAt || 0,
            // Speaker-name matches first, then title, then text; newest first.
            rank: (speakerSeg ? 2 : 0) + (titleHit ? 1 : 0),
        });
    }
    return hits
        .sort((a, b) => b.rank - a.rank || b.createdAt - a.createdAt)
        .slice(0, k)
        .map(({ rank: _r, ...hit }) => hit);
}
