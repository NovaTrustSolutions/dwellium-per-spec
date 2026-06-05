/**
 * localCategorizer — deterministic, offline thought classification.
 *
 * Why this exists: ThoughtWeaver's capture path used to depend entirely on a
 * remote LLM key or a backend route. When neither was available (the common
 * case in a deployed build with no `VITE_API_URL`, or a machine where the
 * backend isn't running) the only fallback filed every thought as
 * `needs_review` with confidence 0 — i.e. it kept the text but never did the
 * one thing the feature promises: sort the thought. To a user that reads as
 * "it doesn't do anything."
 *
 * This module gives ThoughtWeaver a real, dependency-free classifier that runs
 * in the browser with zero network. It will never be as nuanced as an LLM, but
 * it is honest, instant, and — critically — testable: same input always yields
 * the same bucket, so a unit test can actually fail if the logic regresses.
 *
 * Buckets match the rest of ThoughtWeaver:
 *   people | projects | ideas | admin | needs_review
 */

export type Bucket = 'people' | 'projects' | 'ideas' | 'admin' | 'needs_review';

export interface LocalCategoryResult {
    filed_to: Bucket;
    confidence: number;            // 0..1
    destination_name: string | null;
    /** Marker so callers/tests know this came from the offline heuristic. */
    source: 'local-heuristic';
}

// Words that start an actionable instruction ("Call the plumber", "Email Sam").
const ACTION_VERBS = new Set([
    'call', 'email', 'reach', 'send', 'reply', 'write', 'draft', 'review', 'check', 'schedule',
    'book', 'pay', 'order', 'buy', 'pick', 'finish', 'complete', 'submit', 'file', 'sign',
    'ask', 'remind', 'follow', 'plan', 'prepare', 'fix', 'update', 'create', 'add', 'remove',
    'delete', 'install', 'set', 'organize', 'clean', 'renew', 'cancel', 'confirm', 'book',
    'schedule', 'arrange', 'chase', 'invoice', 'refund', 'inspect', 'repair', 'replace',
]);

// Project / delivery vocabulary.
const PROJECT_WORDS = [
    'project', 'milestone', 'deliverable', 'roadmap', 'sprint', 'launch', 'ship', 'release',
    'backlog', 'blocker', 'kickoff', 'kick-off', 'scope', 'deploy', 'deployment', 'rollout',
    'spec', 'phase', 'epic', 'timeline', 'on track', 'behind schedule', 'ahead of schedule',
    'status update', 'deadline',
];

// Speculative / ideation cues.
const IDEA_PHRASES = [
    'what if', 'idea:', 'idea ', 'concept', 'brainstorm', 'maybe we could', 'could be',
    'imagine', 'what about', 'thinking about', 'wonder if', 'wondering if', 'proposal:',
    'we should explore', 'might be worth', 'feature idea', 'crazy idea',
];

// Social cues that indicate the thought is *about a person / interaction*.
const SOCIAL_PHRASES = [
    'met ', 'meet ', 'meeting with', 'spoke with', 'spoke to', 'talked to', 'talked with',
    'call with', 'lunch with', 'coffee with', 'dinner with', 'drinks with', 'caught up with',
    'intro to', 'introduced to', 'introduced me', 'chatted with', 'sync with', '1:1 with',
    'one on one', 'connected with', 'reached out to',
];

// Admin / task phrasing that can appear anywhere in the sentence.
const ADMIN_PHRASES = [
    'need to', 'needs to', 'have to', 'has to', 'must ', 'to-do', 'todo', "don't forget",
    'dont forget', 'remember to', 'follow up', 'follow-up', 'due ', 'by tomorrow', 'by eod',
    'by cob', 'by monday', 'by tuesday', 'by wednesday', 'by thursday', 'by friday',
    'by saturday', 'by sunday', 'by next week', 'asap', 'urgent',
];

// Capitalized tokens that are NOT personal names (sentence-initial common words,
// interrogatives, social-cue verbs, days/months, acronyms).
const CAP_STOPWORDS = new Set([
    'I', 'A', 'An', 'The', 'My', 'We', 'Our', 'It', 'This', 'That', 'They', 'He', 'She',
    'AI', 'TODO', 'EOD', 'COB', 'ASAP', 'OK', 'PM', 'AM', 'CEO', 'CTO', 'HR', 'IT', 'API',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December', 'Today', 'Tomorrow', 'Yesterday', 'Project',
    'Need', 'Call', 'Email', 'Send', 'Meet', 'Met', 'Idea', 'Buy', 'Pay', 'Fix', 'Ask',
    // interrogatives / modals (avoid treating "What if…" as a name)
    'What', 'Why', 'How', 'When', 'Where', 'Who', 'Maybe', 'Should', 'Could', 'Would',
    // social-cue verbs/nouns that commonly start a "people" thought
    'Meeting', 'Spoke', 'Talked', 'Lunch', 'Coffee', 'Dinner', 'Drinks', 'Breakfast',
    'Caught', 'Intro', 'Introduced', 'Chatted', 'Sync', 'Connected', 'Reached', 'One',
]);

function countPhraseHits(haystack: string, phrases: string[]): number {
    let n = 0;
    for (const p of phrases) if (haystack.includes(p)) n++;
    return n;
}

/**
 * Find a likely personal name: a capitalized token (optionally two in a row,
 * e.g. "Mark Chen") that isn't a sentence-initial common word, day, month, etc.
 */
function detectName(raw: string): string | null {
    const tokens = raw.split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
        const cleaned = tokens[i].replace(/[^A-Za-z'-]/g, '');
        if (!/^[A-Z][a-z]{1,}$/.test(cleaned)) continue;
        if (CAP_STOPWORDS.has(cleaned)) continue;
        // Found a candidate. Greedily attach a following capitalized surname.
        const next = (tokens[i + 1] || '').replace(/[^A-Za-z'-]/g, '');
        if (/^[A-Z][a-z]{1,}$/.test(next) && !CAP_STOPWORDS.has(next)) {
            return `${cleaned} ${next}`;
        }
        return cleaned;
    }
    return null;
}

/** Title-case a short label from the first meaningful words of the text. */
function summaryLabel(raw: string, maxWords = 5): string {
    const words = raw
        .replace(/[\n\r]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, maxWords);
    const label = words.join(' ').replace(/[.;,:]+$/, '').trim();
    if (!label) return 'Untitled thought';
    return label.length > 48 ? label.slice(0, 45) + '…' : label;
}

/**
 * Classify a raw thought into a bucket with a confidence and a short label.
 * Pure & deterministic: identical input always yields identical output.
 */
export function localCategorize(rawInput: string): LocalCategoryResult {
    const raw = (rawInput || '').trim();
    if (!raw) {
        return { filed_to: 'needs_review', confidence: 0, destination_name: null, source: 'local-heuristic' };
    }

    const lower = raw.toLowerCase();
    const firstWord = lower.split(/\s+/)[0].replace(/[^a-z]/g, '');
    const name = detectName(raw);

    const score: Record<Bucket, number> = {
        admin: 0, people: 0, projects: 0, ideas: 0, needs_review: 0,
    };

    // ── admin (tasks) ──
    if (ACTION_VERBS.has(firstWord)) score.admin += 3;
    score.admin += 2 * countPhraseHits(lower, ADMIN_PHRASES);
    // a trailing question mark with no idea cue is usually not a task; leave as-is.

    // ── people ──
    score.people += 3 * countPhraseHits(lower, SOCIAL_PHRASES);
    if (name) score.people += 2;

    // ── projects ──
    for (const w of PROJECT_WORDS) if (lower.includes(w)) score.projects += 2;
    if (/\bproject\b/.test(lower)) score.projects += 1; // extra weight for explicit "project"

    // ── ideas ──
    score.ideas += 3 * countPhraseHits(lower, IDEA_PHRASES);

    // Pick the winner. Tie-break order favors the most actionable read.
    const order: Bucket[] = ['admin', 'people', 'projects', 'ideas'];
    let best: Bucket = 'needs_review';
    let bestScore = 0;
    for (const b of order) {
        if (score[b] > bestScore) { bestScore = score[b]; best = b; }
    }

    if (bestScore <= 0) {
        // No signal at all — keep it, but be honest that it's unsorted.
        return {
            filed_to: 'needs_review',
            confidence: 0.3,
            destination_name: summaryLabel(raw),
            source: 'local-heuristic',
        };
    }

    const confidence = Math.min(0.92, 0.45 + 0.12 * bestScore);
    const destination_name =
        best === 'people' && name ? name : summaryLabel(raw);

    return { filed_to: best, confidence, destination_name, source: 'local-heuristic' };
}
