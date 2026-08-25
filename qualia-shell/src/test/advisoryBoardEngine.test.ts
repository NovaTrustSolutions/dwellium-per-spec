/**
 * 5 Persona Advisory Board — engine suite: lens definitions vs SKILL.md,
 * CRIT prompt builders, the markdown parser (well-formed / malformed /
 * per-lens), the per-user store, and the demo fixture's shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

import {
    GUARDRAILS, INTERVIEW_QUESTIONS, LENSES, LENS_BY_ID, MAX_INTERVIEW_QUESTIONS,
    NON_AFFILIATION_DISCLAIMER,
} from '../lib/advisoryBoard/lenses';
import {
    BOARD_SYSTEM_PROMPT, OUTPUT_FORMAT, STARTER_PROMPT,
    buildBoardPrompt, buildInterviewPrompt, buildLensPrompt,
} from '../lib/advisoryBoard/prompts';
import { parseBoard, parseInterviewQuestions, parseLensView } from '../lib/advisoryBoard/parse';
import {
    advisoryBoardStore, removeSession, resetAdvisoryBoard, saveSession, SESSION_LIMIT,
} from '../lib/advisoryBoard/store';
import { advisoryBoardUserIdHolder } from '../lib/perUserIdentity';
import { DEMO_BOARD } from '../lib/advisoryBoard/demo';
import type { AdvisoryBoardSession } from '../lib/advisoryBoard/types';

const CANONICAL_NAMES = [
    'Product Clarity Lens',
    'Risk and Capital Lens',
    'Scale and Systems Lens',
    'Offer Strength Lens',
    'Future Self Lens',
];

const WELL_FORMED = `### Decision

Hold renewals at 3% this cycle.

### Context Read

Stage: execution. Occupancy is the binding constraint.

### 5 Lens Views

Product Clarity Lens:

- View: One number is easy to explain.
- Blind spot: Simple can be simply wrong.
- Recommendation: Use at most three tiers.

Risk and Capital Lens:

- View: The downside is asymmetric.
- Blind spot: 91% acceptance was measured at 3%, not 6%.
- Recommendation: Size for a ten-point acceptance drop.

Scale and Systems Lens:

- View: Turn capacity is the real bottleneck.
- Blind spot: One cycle is not enough data for a model.
- Recommendation: Sequence renewals against crew capacity.

Offer Strength Lens:

- View: The offer is a price with nothing attached.
- Blind spot: Concessions give the increase back.
- Recommendation: Trade term length for the increase.

Future Self Lens:

- View: Reputation compounds longer than a point of rent.
- Blind spot: Under-pricing is avoidance too.
- Recommendation: Take the increase and pair it with something visible.

### Disagreement

Offer Strength wants the bold number; Risk and Capital wants the survivable one.

### Future Self Check

The regret is running a cycle with no instrumentation.

### Final Decision Brief

- Decision: Two renewal tiers.
- Why: Captures upside where it is safe.
- Risk: Turns could stack into summer.
- Next action: Tag every lease expiring in 120 days this week.
- Do not do: Do not send a flat increase to the whole community.
`;

describe('advisory board — lens definitions match SKILL.md', () => {
    it('defines exactly the five canonical lenses', () => {
        expect(LENSES).toHaveLength(5);
        expect(LENSES.map((l) => l.name)).toEqual(CANONICAL_NAMES);
    });

    it('carries focus, key question and boundaries for every lens', () => {
        for (const lens of LENSES) {
            expect(lens.focus.length).toBeGreaterThan(10);
            expect(lens.keyQuestion.endsWith('?')).toBe(true);
            expect(lens.boundaries.length).toBeGreaterThanOrEqual(4);
            expect(LENS_BY_ID[lens.id]).toBe(lens);
        }
    });

    it('states the "interpretive lens, not a simulation" boundary on each named lens', () => {
        for (const lens of LENSES.filter((l) => l.id !== 'future-self')) {
            expect(lens.boundaries[0]).toContain('interpretive lens inspired by publicly documented');
            expect(lens.boundaries[0]).toContain('not as a simulation of');
        }
        expect(LENS_BY_ID['future-self'].boundaries[0]).toContain("the user's own future self");
    });

    it('keeps the interview question list and the ≤3 cap from SKILL.md', () => {
        expect(MAX_INTERVIEW_QUESTIONS).toBe(3);
        expect(INTERVIEW_QUESTIONS).toContain('What decision are you actually trying to make?');
        expect(INTERVIEW_QUESTIONS).toContain('What happens if you do nothing?');
    });

    it('ships the non-affiliation disclaimer text', () => {
        expect(NON_AFFILIATION_DISCLAIMER).toContain('Not affiliated with');
        expect(NON_AFFILIATION_DISCLAIMER).toContain('interpretive reasoning frameworks');
    });
});

describe('advisory board — prompt builders', () => {
    it('the system prompt carries CRIT and the guardrails verbatim', () => {
        expect(BOARD_SYSTEM_PROMPT).toContain('CRIT = Context, Role, Interview, Task.');
        for (const g of GUARDRAILS) expect(BOARD_SYSTEM_PROMPT).toContain(g);
        expect(BOARD_SYSTEM_PROMPT).toContain('does not impersonate real people');
    });

    it('the interview prompt asks for questions only, capped at three', () => {
        const p = buildInterviewPrompt('Raise rents 6% or hold at 3%?');
        expect(p).toContain('Raise rents 6% or hold at 3%?');
        expect(p).toContain('up to 3 focused interview questions');
        expect(p).toContain('Output ONLY the questions');
    });

    it('the board prompt carries all five lenses, forced disagreement and the output format', () => {
        const p = buildBoardPrompt({
            topic: 'Hold or raise renewals?',
            questions: ['What constraint cannot be ignored?'],
            answers: ['A two-person turn crew.'],
            skipped: false,
        });
        for (const name of CANONICAL_NAMES) expect(p).toContain(name);
        for (const lens of LENSES) {
            expect(p).toContain(lens.keyQuestion);
            expect(p).toContain(lens.focus);
        }
        expect(p).toContain('FORCE DISAGREEMENT');
        expect(p).toContain(OUTPUT_FORMAT);
        expect(p).toContain('A two-person turn crew.');
    });

    it('the output format keeps SKILL.md section order', () => {
        const order = ['### Decision', '### Context Read', '### 5 Lens Views', '### Disagreement', '### Future Self Check', '### Final Decision Brief'];
        let at = -1;
        for (const heading of order) {
            const next = OUTPUT_FORMAT.indexOf(heading);
            expect(next).toBeGreaterThan(at);
            at = next;
        }
        for (const field of ['- Decision:', '- Why:', '- Risk:', '- Next action:', '- Do not do:']) {
            expect(OUTPUT_FORMAT).toContain(field);
        }
    });

    it('a skipped interview forces stated assumptions', () => {
        const p = buildBoardPrompt({ topic: 'x', questions: [], answers: [], skipped: true });
        expect(p).toContain('SKIPPED the interview');
        expect(p).toContain('State your assumptions explicitly');
    });

    it('builds a single-lens prompt with that lens only', () => {
        const p = buildLensPrompt('risk', 'Hold or raise renewals?');
        expect(p).toContain('Risk and Capital Lens');
        expect(p).toContain(LENS_BY_ID.risk.keyQuestion);
        expect(p).not.toContain('Offer Strength Lens');
    });

    it('offers a copyable starter prompt', () => {
        expect(STARTER_PROMPT).toContain('Use the 5 Persona Advisory Board.');
        expect(STARTER_PROMPT).toContain('interview me first using CRIT');
    });
});

describe('advisory board — parser', () => {
    it('parses a well-formed board into every section', () => {
        const r = parseBoard(WELL_FORMED);
        expect(r.unparsed).toBe(false);
        expect(r.decision).toBe('Hold renewals at 3% this cycle.');
        expect(r.contextRead).toContain('Occupancy is the binding constraint');
        expect(r.views).toHaveLength(5);
        expect(r.views.map((v) => v.lensId)).toEqual(['clarity', 'risk', 'scale', 'offer', 'future-self']);
        expect(r.views[1].blindSpot).toContain('91% acceptance was measured at 3%');
        expect(r.disagreement).toContain('Offer Strength wants the bold number');
        expect(r.futureSelfCheck).toContain('no instrumentation');
        expect(r.brief).toEqual({
            decision: 'Two renewal tiers.',
            why: 'Captures upside where it is safe.',
            risk: 'Turns could stack into summer.',
            nextAction: 'Tag every lease expiring in 120 days this week.',
            doNotDo: 'Do not send a flat increase to the whole community.',
        });
    });

    it('falls back to raw markdown on a malformed board instead of erroring', () => {
        const junk = 'The board thinks you should probably just wait and see how it goes.';
        const r = parseBoard(junk);
        expect(r.unparsed).toBe(true);
        expect(r.raw).toBe(junk);
        expect(r.views).toEqual([]);
    });

    it('never throws on empty or garbage input', () => {
        expect(() => parseBoard('')).not.toThrow();
        expect(parseBoard('').unparsed).toBe(true);
        expect(parseBoard('### Decision\n\n### 5 Lens Views\n').unparsed).toBe(true);
    });

    it('parses one lens block on its own', () => {
        const v = parseLensView('- View: Sharp.\n- Blind spot: Vague.\n- Recommendation: Name the outcome.', 'clarity');
        expect(v).toEqual({ lensId: 'clarity', view: 'Sharp.', blindSpot: 'Vague.', recommendation: 'Name the outcome.' });
        expect(parseLensView('nothing useful here', 'clarity')).toBeNull();
    });

    it('recognises lens blocks headed by the display shorthand', () => {
        const md = WELL_FORMED.replace('Product Clarity Lens:', 'Jobs · Clarity');
        expect(parseBoard(md).views.map((v) => v.lensId)).toContain('clarity');
    });

    it('parses the interview step, capped at three questions', () => {
        const qs = parseInterviewQuestions('1. What is the decision?\n2. What evidence exists?\n3. What is the constraint?\n4. Extra?');
        expect(qs).toEqual(['What is the decision?', 'What evidence exists?', 'What is the constraint?']);
        expect(parseInterviewQuestions('no questions here')).toEqual([]);
    });
});

describe('advisory board — per-user store', () => {
    const makeSession = (id: string, topic: string): AdvisoryBoardSession => ({
        id, topic, questions: [], answers: [], skipped: true, result: null, lensNotes: {}, updatedAt: 1,
    });

    beforeEach(() => {
        localStorage.clear();
        advisoryBoardUserIdHolder.current = null;
        resetAdvisoryBoard();
    });

    it('persists a session to the signed-in user namespace', () => {
        advisoryBoardUserIdHolder.current = 'andy';
        saveSession(makeSession('s1', 'Renewals'));
        expect(advisoryBoardStore.getSnapshot().map((s) => s.id)).toEqual(['s1']);
        expect(localStorage.getItem('advisory-board:andy')).toContain('Renewals');
    });

    it('isolates one user from another', () => {
        advisoryBoardUserIdHolder.current = 'andy';
        saveSession(makeSession('s1', 'Renewals'));
        advisoryBoardUserIdHolder.current = 'lisa';
        expect(advisoryBoardStore.getSnapshot()).toEqual([]);
        saveSession(makeSession('s2', 'Vendors'));
        expect(advisoryBoardStore.getSnapshot().map((s) => s.id)).toEqual(['s2']);
        advisoryBoardUserIdHolder.current = 'andy';
        expect(advisoryBoardStore.getSnapshot().map((s) => s.id)).toEqual(['s1']);
    });

    it('replaces by id, keeps newest first, caps the list, and removes on request', () => {
        advisoryBoardUserIdHolder.current = 'andy';
        saveSession(makeSession('s1', 'One'));
        saveSession(makeSession('s2', 'Two'));
        saveSession(makeSession('s1', 'One revised'));
        expect(advisoryBoardStore.getSnapshot().map((s) => s.id)).toEqual(['s1', 's2']);
        expect(advisoryBoardStore.getSnapshot()[0].topic).toBe('One revised');

        for (let i = 0; i < SESSION_LIMIT + 5; i++) saveSession(makeSession(`x${i}`, `T${i}`));
        expect(advisoryBoardStore.getSnapshot()).toHaveLength(SESSION_LIMIT);

        const first = advisoryBoardStore.getSnapshot()[0].id;
        removeSession(first);
        expect(advisoryBoardStore.getSnapshot().map((s) => s.id)).not.toContain(first);
    });

    it('survives corrupt localStorage', () => {
        advisoryBoardUserIdHolder.current = 'andy';
        localStorage.setItem('advisory-board:andy', '{not json');
        resetAdvisoryBoard();
        expect(advisoryBoardStore.getSnapshot()).toEqual([]);
    });
});

describe('advisory board — demo fixture', () => {
    it('is a complete worked example with five distinct lens views', () => {
        const r = DEMO_BOARD.result!;
        expect(r).toBeTruthy();
        expect(r.unparsed).toBe(false);
        expect(r.views).toHaveLength(5);
        expect(new Set(r.views.map((v) => v.lensId)).size).toBe(5);
        for (const v of r.views) {
            expect(v.view.length).toBeGreaterThan(40);
            expect(v.blindSpot.length).toBeGreaterThan(40);
            expect(v.recommendation.length).toBeGreaterThan(40);
        }
    });

    it('has a non-empty brief in every field and a real Future Self check', () => {
        const r = DEMO_BOARD.result!;
        for (const value of Object.values(r.brief)) expect(value.trim().length).toBeGreaterThan(20);
        expect(r.decision.trim().length).toBeGreaterThan(20);
        expect(r.contextRead.trim().length).toBeGreaterThan(80);
        expect(r.disagreement.trim().length).toBeGreaterThan(80);
        expect(r.futureSelfCheck.trim().length).toBeGreaterThan(80);
    });

    it('answered the interview rather than skipping it', () => {
        expect(DEMO_BOARD.skipped).toBe(false);
        expect(DEMO_BOARD.questions).toHaveLength(3);
        expect(DEMO_BOARD.answers.filter((a) => a.trim())).toHaveLength(3);
    });
});
