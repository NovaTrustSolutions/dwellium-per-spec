/**
 * openDocContext — 2026-06-12 (Ilya): "I need ARA to be able to view the
 * Markdown file that I have open so I don't have to copy and paste it...
 * I should be able to say 'Ara, review the Markdown file open and look for
 * inconsistencies or whatever I want her to find.'"
 *
 * Bridges Scribe's open document into ARA chat:
 *   - getActiveScribeDoc(): snapshot of the file focused in Scribe (zustand
 *     getState() read — no subscription, no render coupling; empty when
 *     Scribe has nothing open).
 *   - detectsOpenDocRequest(): does the utterance ask about the open file?
 *     Order-agnostic triple test (action verb + file word + open/current
 *     word) so "review the markdown file open", "check the open doc", and
 *     "summarize this file in scribe" all hit.
 *   - buildOpenDocPrompt(): user's instruction + fenced document content,
 *     truncated for context-window safety.
 *
 * scribeStore's import graph is light (zustand + config + UserContext) —
 * pulling it into ARA's chunk does NOT drag CodeMirror along.
 */
import { useScribeStore } from '../components/Scribe/scribeStore';

export interface OpenDocSnapshot {
    filepath: string;
    title: string;
    content: string;
    dirty: boolean;
}

/** The document currently focused in Scribe, or null when none is open. */
export function getActiveScribeDoc(): OpenDocSnapshot | null {
    try {
        const s = useScribeStore.getState();
        if (!s.activeFilepath) return null;
        const f = s.openFiles.find((x) => x.filepath === s.activeFilepath);
        if (!f) return null;
        return {
            filepath: f.filepath,
            title: f.filepath.split('/').pop() || f.filepath,
            content: f.content ?? '',
            dirty: f.dirty,
        };
    } catch {
        return null; // SSR / store unavailable
    }
}

const ACTION_VERB = /\b(?:review|read|look|check|analy[sz]e|summari[sz]e|proofread|edit|critique|scan|inspect|go (?:over|through)|find|fix|improve|rewrite|explain|what(?:'s| is) (?:in|wrong))\b/i;
const FILE_WORD = /\b(?:markdown|md|file|doc(?:ument)?|note|page)\b/i;
const OPEN_WORD = /\b(?:open(?:ed)?|current(?:ly)?|active|this|i have (?:open|up)|on (?:my )?screen|in scribe|scribe)\b/i;

/** True when the utterance asks ARA to work with the open document. */
export function detectsOpenDocRequest(text: string): boolean {
    return ACTION_VERB.test(text) && FILE_WORD.test(text) && OPEN_WORD.test(text);
}

/** Max document characters injected into the prompt (~6k tokens). */
export const OPEN_DOC_MAX_CHARS = 24_000;

/** Compose the user's instruction + the document for the LLM. */
export function buildOpenDocPrompt(userText: string, doc: OpenDocSnapshot, maxChars = OPEN_DOC_MAX_CHARS): string {
    let body = doc.content;
    let note = '';
    if (body.length > maxChars) {
        body = body.slice(0, maxChars);
        note = `\n\n[Document truncated: first ${maxChars.toLocaleString()} of ${doc.content.length.toLocaleString()} characters shown.]`;
    }
    return `${userText}\n\n--- OPEN DOCUMENT: ${doc.title} (${doc.filepath}) ---\n${body}${note}\n--- END DOCUMENT ---`;
}

/** Honest reply when the user asks about the open file but nothing is open. */
export const NO_OPEN_DOC_MESSAGE =
    'I don’t see a Markdown file open in Scribe right now — open the file there and ask me again, and I’ll read it directly.';
