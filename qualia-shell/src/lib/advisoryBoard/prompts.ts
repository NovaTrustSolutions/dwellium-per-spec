/**
 * advisoryBoard/prompts — CRIT prompt builders.
 *
 * Every prompt carries (a) the CRIT workflow, (b) the SKILL.md guardrails
 * verbatim, and (c) the required Output Format. Interview-first is enforced
 * structurally: the widget cannot reach `buildBoardPrompt` without either
 * answering the interview or explicitly skipping it (which forces the model to
 * state assumptions, per SKILL.md §"Automatic Routing Rule").
 */
import { GUARDRAILS, INTERVIEW_QUESTIONS, LENSES, LENS_BY_ID, MAX_INTERVIEW_QUESTIONS, type LensDefinition, type LensId } from './lenses';

const CRIT_BLOCK = [
    'CRIT = Context, Role, Interview, Task.',
    '- Context: understand the decision before evaluating it.',
    '- Role: apply five clearly separated strategic perspectives.',
    '- Interview: ask targeted questions instead of making assumptions.',
    '- Task: synthesize the analysis into a practical recommendation.',
].join('\n');

const guardrailBlock = () => ['Guardrails (non-negotiable):', ...GUARDRAILS.map((g) => `- ${g}`)].join('\n');

const lensBlock = (l: LensDefinition) => [
    `### ${l.name}`,
    `Focus: ${l.focus}`,
    `Key question: ${l.keyQuestion}`,
    'Boundaries:',
    ...l.boundaries.map((b) => `- ${b}`),
].join('\n');

export const OUTPUT_FORMAT = [
    'Use EXACTLY this markdown structure and section order:',
    '',
    '### Decision',
    'One sentence.',
    '',
    '### Context Read',
    'Brief summary of the situation, facts, stage, and assumptions.',
    '',
    '### 5 Lens Views',
    'For each of the five lenses, in this order — Product Clarity Lens, Risk and Capital Lens, Scale and Systems Lens, Offer Strength Lens, Future Self Lens — write the lens name on its own line followed by exactly three bullets:',
    '- View:',
    '- Blind spot:',
    '- Recommendation:',
    '',
    '### Disagreement',
    'Where the lenses agree, where they disagree, and what each lens may be over-weighting.',
    '',
    '### Future Self Check',
    'The likely long-term alignment issue or regret risk.',
    '',
    '### Final Decision Brief',
    '- Decision:',
    '- Why:',
    '- Risk:',
    '- Next action:',
    '- Do not do:',
].join('\n');

export const BOARD_SYSTEM_PROMPT = [
    'You run the 5 Persona Advisory Board: a structured decision process that stress-tests one important decision through five interpretive strategic lenses.',
    'It is not celebrity roleplay and it does not impersonate real people.',
    '',
    CRIT_BLOCK,
    '',
    guardrailBlock(),
].join('\n');

/** Step 1 — interview first. Asks up to three focused questions, nothing else. */
export function buildInterviewPrompt(topic: string): string {
    return [
        `Decision the user wants to stress-test: ${topic.trim()}`,
        '',
        `Ask up to ${MAX_INTERVIEW_QUESTIONS} focused interview questions before running the board. Choose only the most important ones.`,
        'Draw from (or adapt) these:',
        ...INTERVIEW_QUESTIONS.map((q) => `- ${q}`),
        '',
        `Output ONLY the questions, one per line, numbered 1..${MAX_INTERVIEW_QUESTIONS}. No preamble, no analysis, no answers.`,
    ].join('\n');
}

/** Step 2 — the full board, after the interview is answered or skipped. */
export function buildBoardPrompt(opts: {
    topic: string;
    questions: string[];
    answers: string[];
    skipped: boolean;
}): string {
    const interview = opts.skipped
        ? 'The user SKIPPED the interview. State your assumptions explicitly in the Context Read before advising.'
        : ['Interview:', ...opts.questions.map((q, i) => `Q: ${q}\nA: ${(opts.answers[i] ?? '').trim() || '(not answered — state the assumption you make instead)'}`)].join('\n');

    return [
        `Decision: ${opts.topic.trim()}`,
        '',
        interview,
        '',
        'Run all five lenses against the same evidence:',
        '',
        LENSES.map(lensBlock).join('\n\n'),
        '',
        'Board process: frame the decision in one sentence; confirm the stage (idea exploration, validation, execution, scale, risk review, or long-term strategy); run each lens against the same evidence; FORCE DISAGREEMENT — at least one lens must challenge the preferred answer when a credible objection exists; run the Future Self check; produce one final decision brief.',
        '',
        OUTPUT_FORMAT,
    ].join('\n');
}

/** "Ask just this lens" — one lens, same guardrails, three bullets. */
export function buildLensPrompt(lensId: LensId, topic: string, context?: string): string {
    const l = LENS_BY_ID[lensId];
    return [
        `Decision: ${topic.trim()}`,
        context?.trim() ? `\nContext so far:\n${context.trim()}` : '',
        '',
        'Answer through ONE lens only:',
        '',
        lensBlock(l),
        '',
        `Reply as exactly three bullets under the heading "${l.name}":`,
        '- View:',
        '- Blind spot:',
        '- Recommendation:',
    ].filter(Boolean).join('\n');
}

/** Copyable starter prompt for the "How to use it" block (SKILL.md §Example Prompt). */
export const STARTER_PROMPT = [
    'Use the 5 Persona Advisory Board.',
    '',
    'Decision: [decision]',
    'Context: [context]',
    'Current plan: [plan]',
    'Evidence: [evidence]',
    'Constraints: [constraints]',
    'Time horizon: [time horizon]',
    '',
    'If context is missing, interview me first using CRIT. Then run the Product Clarity, Risk and Capital, Scale and Systems, Offer Strength, and Future Self lenses. Force disagreement, then give the final decision brief and next action.',
].join('\n');
