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

interface LogSegment { text: string; speaker: string; start?: number }
interface LogEntry { id: string; title: string; segments: LogSegment[]; createdAt: number; wordCount?: number }

export interface TranscriptHit {
    id: string;
    title: string;
    /** The matching segment (or opening segment) — palette snippet. */
    snippet: string;
    /** Set when the match was a SPEAKER NAME (ranks above text matches). */
    speakerMatch?: string;
    createdAt: number;
}

function readLog(raw?: string | null): LogEntry[] {
    let source = raw;
    if (source === undefined) {
        try { source = localStorage.getItem(TRANSCRIPTION_LOG_KEY); } catch { return []; }
    }
    if (!source) return [];
    try {
        const parsed = JSON.parse(source);
        return Array.isArray(parsed)
            ? parsed.filter((e: any): e is LogEntry => e && typeof e.id === 'string' && Array.isArray(e.segments))
            : [];
    } catch {
        return [];
    }
}

/** Top-K transcriptions matching `query` by speaker name, title, or text. */
export function searchTranscriptions(query: string, k = 5, raw?: string | null): TranscriptHit[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: Array<TranscriptHit & { rank: number }> = [];
    for (const entry of readLog(raw)) {
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
