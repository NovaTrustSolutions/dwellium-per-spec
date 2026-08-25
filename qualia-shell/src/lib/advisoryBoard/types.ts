/**
 * advisoryBoard/types — the parsed shape of one board run.
 *
 * Section order mirrors SKILL.md §"Output Format" exactly:
 *   Decision → Context Read → 5 Lens Views → Disagreement →
 *   Future Self Check → Final Decision Brief.
 */
import type { LensId } from './lenses';

export interface LensView {
    lensId: LensId;
    view: string;
    blindSpot: string;
    recommendation: string;
}

export interface DecisionBrief {
    decision: string;
    why: string;
    risk: string;
    nextAction: string;
    doNotDo: string;
}

export interface BoardResult {
    decision: string;
    contextRead: string;
    views: LensView[];
    disagreement: string;
    futureSelfCheck: string;
    brief: DecisionBrief;
    /** The model's raw markdown — always kept so the UI can fall back to it. */
    raw: string;
    /** True when the markdown could not be parsed into sections. */
    unparsed: boolean;
}

export interface AdvisoryBoardSession {
    id: string;
    /** The decision the user typed. */
    topic: string;
    /** The interview questions the board asked (≤3). */
    questions: string[];
    /** Answers, index-aligned with `questions`. Empty string = skipped. */
    answers: string[];
    /** True when the user explicitly skipped the interview. */
    skipped: boolean;
    result: BoardResult | null;
    /** Single-lens follow-ups, keyed by lens id. Raw markdown. */
    lensNotes: Partial<Record<LensId, string>>;
    updatedAt: number;
}
