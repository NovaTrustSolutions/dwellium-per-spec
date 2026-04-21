/**
 * emailRouter.ts — C-1 Background Engine (Phase 3-H §3 Table 1 R2)
 *
 * Headless email-routing engine. Replaces the Inbox-Zero *widget* as the
 * primary routing path per the ratified C-1 "Background Engine" decision
 * (Option C). The Inbox Zero component is retained but marked deprecated
 * in widgetRegistry.ts so no UI is removed until the migration window
 * closes (see Gap_Analysis_vs_3H.md §3).
 *
 * Red-team mitigation (RT-05, Phase3F §Table5):
 *   - 95% confidence gate: routing decisions below threshold are forwarded
 *     to the HumanReviewQueue rather than auto-applied.
 *   - Every decision records an auditTrail entry with classifier version,
 *     confidence, rule ID (if matched), and timestamp.
 *
 * The existing RulesManager (src/components/InboxZero/RulesManager.tsx)
 * already defines the RoutingRule schema this engine consumes — no
 * duplication. Rules are fetched from the same `/api/v1/inbox/rules`
 * endpoint.
 *
 * Scope for tonight: pure TypeScript module with no React. Classifier is
 * a deterministic rule matcher; an LLM classifier plugin point is exposed
 * via `registerClassifier()` so the C-1 follow-up session can wire in
 * Moonshine / HydraAI without touching the core.
 */

export type RoutingField = 'subject' | 'sender' | 'body' | 'any';

export interface RoutingRule {
    id: string;
    name: string;
    field: RoutingField;
    pattern: string;
    targetProjectId: string;
    urgency: 'high' | 'medium' | 'low';
    priority: number;
    enabled: boolean;
}

export interface EmailPayload {
    id: string;
    subject: string;
    sender: string;
    body: string;
    receivedAt: string;
}

export interface RoutingDecision {
    emailId: string;
    targetProjectId: string;
    urgency: 'high' | 'medium' | 'low';
    confidence: number;              // 0..1
    matchedRuleId: string | null;
    classifierVersion: string;
    auditTrail: AuditEntry[];
    decidedAt: string;
    requiresHumanReview: boolean;
}

export interface AuditEntry {
    at: string;
    kind: 'rule-match' | 'classifier' | 'threshold-gate' | 'human-review-enqueued';
    detail: Record<string, unknown>;
}

export interface Classifier {
    version: string;
    classify(email: EmailPayload, rules: RoutingRule[]):
        Promise<{ targetProjectId: string; urgency: 'high' | 'medium' | 'low'; confidence: number; matchedRuleId: string | null; }>;
}

// --- Default deterministic classifier (pattern match on enabled rules) -----

const defaultClassifier: Classifier = {
    version: 'rule-match@1.0.0',
    async classify(email, rules) {
        const active = rules.filter(r => r.enabled).sort((a, b) => b.priority - a.priority);
        for (const r of active) {
            const haystack =
                r.field === 'subject' ? email.subject :
                r.field === 'sender'  ? email.sender  :
                r.field === 'body'    ? email.body    :
                `${email.subject}\n${email.sender}\n${email.body}`;
            try {
                const re = new RegExp(r.pattern, 'i');
                if (re.test(haystack)) {
                    // Deterministic rule match = high confidence. We cap at 0.98
                    // so that `requiresHumanReview` can still be triggered by
                    // an override policy if downstream wants to.
                    return {
                        targetProjectId: r.targetProjectId,
                        urgency: r.urgency,
                        confidence: 0.98,
                        matchedRuleId: r.id,
                    };
                }
            } catch {
                // Invalid regex in rule — skip, don't crash the engine.
            }
        }
        return {
            targetProjectId: 'unrouted',
            urgency: 'low',
            confidence: 0.0,
            matchedRuleId: null,
        };
    },
};

// --- Plugin registry -------------------------------------------------------

let activeClassifier: Classifier = defaultClassifier;

export function registerClassifier(c: Classifier) {
    activeClassifier = c;
}

export function getActiveClassifier(): Classifier {
    return activeClassifier;
}

// --- Human-review queue (in-memory; swap for durable store in prod) --------

const humanReviewQueue: RoutingDecision[] = [];

export function enqueueForReview(d: RoutingDecision) {
    humanReviewQueue.push(d);
}

export function getReviewQueue(): ReadonlyArray<RoutingDecision> {
    return humanReviewQueue;
}

export function clearReviewQueueForTests() {
    humanReviewQueue.length = 0;
}

// --- Config ----------------------------------------------------------------

export interface RouterConfig {
    /** RT-05: below this, decision is forwarded to HumanReviewQueue. */
    confidenceThreshold: number;
    /** Source of truth for rules. Default pulls from Inbox Zero endpoint. */
    fetchRules: () => Promise<RoutingRule[]>;
}

const DEFAULT_CONFIG: RouterConfig = {
    confidenceThreshold: 0.95,
    fetchRules: async () => {
        const res = await fetch('/api/v1/inbox/rules');
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : (data.rules ?? []);
    },
};

let config: RouterConfig = { ...DEFAULT_CONFIG };

export function configureRouter(partial: Partial<RouterConfig>) {
    config = { ...config, ...partial };
}

// --- Public routing API ----------------------------------------------------

export async function routeEmail(email: EmailPayload): Promise<RoutingDecision> {
    const rules = await config.fetchRules();
    const classifier = getActiveClassifier();
    const audit: AuditEntry[] = [];

    const { targetProjectId, urgency, confidence, matchedRuleId } = await classifier.classify(email, rules);

    audit.push({
        at: new Date().toISOString(),
        kind: matchedRuleId ? 'rule-match' : 'classifier',
        detail: { classifierVersion: classifier.version, targetProjectId, urgency, confidence, matchedRuleId },
    });

    const requiresHumanReview = confidence < config.confidenceThreshold;

    audit.push({
        at: new Date().toISOString(),
        kind: 'threshold-gate',
        detail: { threshold: config.confidenceThreshold, passed: !requiresHumanReview },
    });

    const decision: RoutingDecision = {
        emailId: email.id,
        targetProjectId,
        urgency,
        confidence,
        matchedRuleId,
        classifierVersion: classifier.version,
        auditTrail: audit,
        decidedAt: new Date().toISOString(),
        requiresHumanReview,
    };

    if (requiresHumanReview) {
        audit.push({
            at: new Date().toISOString(),
            kind: 'human-review-enqueued',
            detail: { reason: 'confidence_below_threshold' },
        });
        enqueueForReview(decision);
    }

    return decision;
}

// --- Batch helper ----------------------------------------------------------

export async function routeBatch(emails: EmailPayload[]): Promise<RoutingDecision[]> {
    const out: RoutingDecision[] = [];
    for (const e of emails) out.push(await routeEmail(e));
    return out;
}

// --- Feature flag ----------------------------------------------------------

/**
 * The background engine is dark-launched. Set via runtime config or env.
 * When `false`, the Inbox Zero widget remains the active routing path.
 */
export function isBackgroundEngineEnabled(): boolean {
    if (typeof window !== 'undefined') {
        const w = window as unknown as { __DWELLIUM_C1_ENABLED__?: boolean };
        if (typeof w.__DWELLIUM_C1_ENABLED__ === 'boolean') return w.__DWELLIUM_C1_ENABLED__;
    }
    return false;
}
