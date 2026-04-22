/**
 * blastGate.ts — C-9 B.L.A.S.T. creation gate (Phase 3-H §3 Table 1 R3)
 *
 * RT-09 mitigation (Phase3F §Table5): intercept card CREATION — not after-
 * the-fact review — to enforce the B.L.A.S.T. schema before a card can
 * enter any board. B.L.A.S.T. = Benefit · Labor · Assignee · Scope · Time.
 *
 * Why a service and not a React hook: gates must also run from background
 * jobs (email router auto-creating cards, AI card-suggest flow in
 * cardSuggest.ts). React components consume `validateBlast()` via a thin
 * wrapper; background callers use it directly.
 *
 * Dark-launch: `isBlastGateEnabled()` returns false by default. TrelloBoard
 * reads the flag and short-circuits when disabled so behavior is identical
 * to pre-C-9 until the gate is turned on via QA.
 */

export interface BlastFields {
    /** B — Benefit: why this work matters. */
    benefit: string;
    /** L — Labor: who does the work (role or person). */
    labor: string;
    /** A — Assignee: accountable owner (must be a real user id or handle). */
    assignee: string;
    /** S — Scope: boundary of the work; what is / isn't in. */
    scope: string;
    /** T — Time: due date or explicit time-bound commitment. */
    time: string;
}

export interface CardDraft {
    title: string;
    description?: string;
    blast?: Partial<BlastFields>;
    [extra: string]: unknown;
}

export interface ValidationIssue {
    field: keyof BlastFields | 'title';
    severity: 'error' | 'warning';
    message: string;
}

export interface ValidationResult {
    ok: boolean;
    issues: ValidationIssue[];
    normalized?: CardDraft & { blast: BlastFields };
}

// --- Validation rules ------------------------------------------------------

const MIN_LEN: Record<keyof BlastFields, number> = {
    benefit: 10,
    labor: 2,
    assignee: 2,
    scope: 10,
    time: 4,
};

function isNonEmpty(s: string | undefined): s is string {
    return typeof s === 'string' && s.trim().length > 0;
}

export function validateBlast(draft: CardDraft): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!isNonEmpty(draft.title)) {
        issues.push({ field: 'title', severity: 'error', message: 'Card title is required.' });
    }

    const b = draft.blast ?? {};
    (Object.keys(MIN_LEN) as (keyof BlastFields)[]).forEach(k => {
        const v = b[k];
        if (!isNonEmpty(v)) {
            issues.push({ field: k, severity: 'error', message: `${labelFor(k)} is required.` });
        } else if (v.trim().length < MIN_LEN[k]) {
            issues.push({
                field: k,
                severity: 'warning',
                message: `${labelFor(k)} is very short (${v.trim().length} chars). Consider adding detail.`,
            });
        }
    });

    const errorCount = issues.filter(i => i.severity === 'error').length;
    if (errorCount > 0) {
        return { ok: false, issues };
    }

    const normalized: CardDraft & { blast: BlastFields } = {
        ...draft,
        blast: {
            benefit: b.benefit!.trim(),
            labor: b.labor!.trim(),
            assignee: b.assignee!.trim(),
            scope: b.scope!.trim(),
            time: b.time!.trim(),
        },
    };
    return { ok: true, issues, normalized };
}

function labelFor(k: keyof BlastFields): string {
    return {
        benefit: 'Benefit',
        labor: 'Labor',
        assignee: 'Assignee',
        scope: 'Scope',
        time: 'Time',
    }[k];
}

// --- Gate enforcement ------------------------------------------------------

export class BlastGateError extends Error {
    issues: ValidationIssue[];
    constructor(issues: ValidationIssue[]) {
        super(`B.L.A.S.T. gate rejected card: ${issues.filter(i => i.severity === 'error').map(i => i.field).join(', ')}`);
        this.name = 'BlastGateError';
        this.issues = issues;
    }
}

/**
 * Call this at the card-creation boundary. Throws BlastGateError if the
 * draft would create an under-specified card. The thrown error contains
 * `issues` that the UI should render next to the offending fields.
 */
export function enforceBlastGate(draft: CardDraft): CardDraft & { blast: BlastFields } {
    const result = validateBlast(draft);
    if (!result.ok || !result.normalized) {
        throw new BlastGateError(result.issues);
    }
    return result.normalized;
}

// --- Feature flag ----------------------------------------------------------

export function isBlastGateEnabled(): boolean {
    if (typeof window !== 'undefined') {
        const w = window as unknown as { __DWELLIUM_C9_BLAST_ENABLED__?: boolean };
        if (typeof w.__DWELLIUM_C9_BLAST_ENABLED__ === 'boolean') return w.__DWELLIUM_C9_BLAST_ENABLED__;
    }
    return false;
}
