/**
 * advisoryBoard/parse — model markdown → typed BoardResult.
 *
 * Resilience contract: parsing NEVER throws and never yields an error state.
 * When the markdown doesn't carry the Output Format sections, the result comes
 * back with `unparsed: true` and the full `raw` text, and the UI renders the
 * raw markdown instead of an error. Partial parses are kept — a board that has
 * everything but the Disagreement section is still worth rendering.
 */
import { LENSES, type LensId } from './lenses';
import type { BoardResult, DecisionBrief, LensView } from './types';

/** Strip markdown heading marks / bold / trailing colon from a line. */
const clean = (s: string) => s.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').trim();

/**
 * The six Output Format section names. Used to recognise a bold-only
 * "heading" (`**Decision**`) — models emit those as often as `### Decision` —
 * WITHOUT mistaking a bolded lens name inside the lens body for a section.
 */
const SECTION_NAMES = /^(decision|context read|5 lens views|lens views|disagreement|future self check|final decision brief)$/i;

/** Split markdown into `heading → body` pairs on ATX (or known bold) headings. */
function sections(md: string): { heading: string; body: string }[] {
    const out: { heading: string; body: string }[] = [];
    let current: { heading: string; body: string[] } | null = null;
    for (const line of md.split(/\r?\n/)) {
        const bold = /^\*\*([^*]+)\*\*:?\s*$/.exec(line.trim());
        const isHeading = /^#{1,6}\s+\S/.test(line)
            || (bold !== null && SECTION_NAMES.test(bold[1].replace(/:$/, '').trim()));
        if (isHeading) {
            if (current) out.push({ heading: current.heading, body: current.body.join('\n').trim() });
            current = { heading: clean(line).replace(/:$/, ''), body: [] };
        } else if (current) {
            current.body.push(line);
        }
    }
    if (current) out.push({ heading: current.heading, body: current.body.join('\n').trim() });
    return out;
}

const find = (secs: { heading: string; body: string }[], re: RegExp) =>
    secs.find((s) => re.test(s.heading))?.body ?? '';

/** Value of a `- Label: value` bullet (multi-line until the next bullet). */
function bulletValue(body: string, label: string): string {
    const lines = body.split(/\r?\n/);
    const head = new RegExp(`^\\s*[-*]?\\s*\\**${label}\\**\\s*:\\s*(.*)$`, 'i');
    for (let i = 0; i < lines.length; i++) {
        const m = head.exec(lines[i]);
        if (!m) continue;
        const parts = [m[1].trim()];
        for (let j = i + 1; j < lines.length; j++) {
            if (/^\s*[-*]\s/.test(lines[j]) || /^#{1,6}\s/.test(lines[j])) break;
            if (lines[j].trim()) parts.push(lines[j].trim());
        }
        return parts.join(' ').trim();
    }
    return '';
}

/** Parse one lens block (`View:` / `Blind spot:` / `Recommendation:`). */
export function parseLensView(block: string, lensId: LensId): LensView | null {
    const view = bulletValue(block, 'View');
    const blindSpot = bulletValue(block, 'Blind spot');
    const recommendation = bulletValue(block, 'Recommendation');
    if (!view && !blindSpot && !recommendation) return null;
    return { lensId, view, blindSpot, recommendation };
}

/**
 * Slice the "5 Lens Views" body into per-lens blocks. Lenses are located by
 * their canonical name OR their display shorthand ("Product Clarity Lens" /
 * "Jobs"), since models echo either.
 */
function sliceLensBlocks(body: string): Partial<Record<LensId, string>> {
    const lines = body.split(/\r?\n/);
    const marks: { lensId: LensId; line: number }[] = [];
    lines.forEach((line, i) => {
        const t = clean(line).toLowerCase();
        if (!t || /^[-*]\s/.test(line.trim())) return;
        for (const l of LENSES) {
            if (marks.some((m) => m.lensId === l.id)) continue;
            if (t.includes(l.name.toLowerCase()) || t.includes(l.shorthand.toLowerCase())) {
                marks.push({ lensId: l.id, line: i });
                break;
            }
        }
    });
    marks.sort((a, b) => a.line - b.line);
    const out: Partial<Record<LensId, string>> = {};
    marks.forEach((m, idx) => {
        const end = idx + 1 < marks.length ? marks[idx + 1].line : lines.length;
        out[m.lensId] = lines.slice(m.line + 1, end).join('\n').trim();
    });
    return out;
}

const EMPTY_BRIEF: DecisionBrief = { decision: '', why: '', risk: '', nextAction: '', doNotDo: '' };

/** Parse a full board response. Never throws. */
export function parseBoard(raw: string): BoardResult {
    const text = (raw ?? '').trim();
    const fallback: BoardResult = {
        decision: '', contextRead: '', views: [], disagreement: '', futureSelfCheck: '',
        brief: EMPTY_BRIEF, raw: text, unparsed: true,
    };
    if (!text) return fallback;

    let secs: { heading: string; body: string }[];
    try {
        secs = sections(text);
    } catch {
        return fallback;
    }

    const decision = find(secs, /^decision$/i);
    const contextRead = find(secs, /context\s*read/i);
    const lensBody = find(secs, /lens\s*views?/i);
    const disagreement = find(secs, /disagreement/i);
    const futureSelfCheck = find(secs, /future\s*self\s*check/i);
    const briefBody = find(secs, /final\s*decision\s*brief|decision\s*brief/i);

    const blocks = sliceLensBlocks(lensBody);
    const views = LENSES
        .map((l) => (blocks[l.id] ? parseLensView(blocks[l.id]!, l.id) : null))
        .filter((v): v is LensView => v !== null);

    const brief: DecisionBrief = {
        decision: bulletValue(briefBody, 'Decision'),
        why: bulletValue(briefBody, 'Why'),
        risk: bulletValue(briefBody, 'Risk'),
        nextAction: bulletValue(briefBody, 'Next action'),
        doNotDo: bulletValue(briefBody, 'Do not do'),
    };

    // "Parsed" means we recovered real structure: at least the decision line
    // (or brief) AND at least one lens view. Anything less → show the raw text.
    const unparsed = views.length === 0 || !(decision || brief.decision);
    return { decision, contextRead, views, disagreement, futureSelfCheck, brief, raw: text, unparsed };
}

/** Parse the interview step: up to `max` question lines. Never throws. */
export function parseInterviewQuestions(raw: string, max = 3): string[] {
    return (raw ?? '')
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
        .filter((l) => l.length > 0 && l.includes('?'))
        .slice(0, max);
}
