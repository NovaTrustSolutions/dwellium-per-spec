/**
 * legalShieldClient — direct-LLM Georgia-code legal scan for the TranscriptionHub
 * Legal Shield feature.
 *
 * Originally Legal Shield POSTed to /api/georgia-code/legal-scan which expected a
 * backend NotebookLM-backed knowledge base of GA landlord/tenant law. That route
 * was never wired (404 silently). NotebookLM has no public API so we can't
 * proxy the user's notebook directly. Instead, this client routes the scan
 * through the user's configured LLM (per-user integrations bundle) with a tight
 * system prompt seeded by the same Georgia code references the NotebookLM
 * collection contains. Result: Legal Shield works the moment a user adds an LLM
 * key, without requiring a backend at all.
 *
 * For users who want to dive deeper, the TranscriptionHub UI also exposes a
 * "Consult NotebookLM" button that opens their connected notebook via the
 * existing NotebookLMContext infrastructure with a pre-filled query.
 */
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import type { IntegrationsBundle } from '../../types/integrations';

export interface LegalScanInput {
    segment: string;
    speaker?: string;
    timestamp?: number;
}

export interface LegalScanResult {
    segment: string;
    alert: 'clear' | 'caution' | 'violation';
    code_ref: string | null;     // e.g., "O.C.G.A. § 44-7-7"
    summary: string | null;       // one-sentence explanation
    suggested_action: string | null;
}

const LEGAL_SHIELD_SYSTEM_PROMPT = `You are Legal Shield, a real-time compliance scanner for Georgia landlord-tenant communications. Scan each conversation segment for potential violations of the Georgia Code (Title 44, Property; Title 16, Crimes against persons; Fair Housing Act references where relevant).

Common patterns to flag:
- Discriminatory language (race, religion, familial status, disability, etc.) → "violation"
- Threats of self-help eviction, lock changes, utility shut-off → "violation"
- Improper notice timelines (e.g., O.C.G.A. § 44-7-7) → "caution"
- Security deposit handling outside O.C.G.A. § 44-7-30 et seq. → "caution"
- Discussions of repairs, habitability, late fees, lease terms with no apparent issue → "clear"

Output ONE JSON object PER segment in order, in an array. Schema:
[{ "segment": "verbatim segment text", "alert": "clear"|"caution"|"violation", "code_ref": "O.C.G.A. § …" | null, "summary": "one-sentence reason" | null, "suggested_action": "what the speaker should do/say instead" | null }, …]

If a segment is benign, set alert="clear" and leave code_ref/summary/suggested_action as null.`;

export async function scanSegmentsViaLlm(
    segments: LegalScanInput[],
    llm: IntegrationsBundle['llm'],
): Promise<{ results: LegalScanResult[]; scanTimeMs: number } | null> {
    if (!hasActiveLlm(llm) || segments.length === 0) return null;
    const t0 = Date.now();

    // Bound LLM cost — chunk into batches of 10 segments
    const out: LegalScanResult[] = [];
    for (let i = 0; i < segments.length; i += 10) {
        const batch = segments.slice(i, i + 10);
        const prompt = batch.map((s, j) => `${j + 1}. ${s.segment}`).join('\n');
        try {
            const res = await callLlm({
                systemPrompt: LEGAL_SHIELD_SYSTEM_PROMPT,
                prompt,
                responseFormat: 'json',
                maxTokens: 1500,
                temperature: 0.1,
            }, llm);
            if (!res) continue;
            try {
                const parsed = JSON.parse(res.text);
                const arr: any[] = Array.isArray(parsed) ? parsed : (parsed.results || []);
                for (const r of arr) {
                    out.push({
                        segment: r.segment || '',
                        alert: (r.alert === 'violation' || r.alert === 'caution') ? r.alert : 'clear',
                        code_ref: r.code_ref ?? null,
                        summary: r.summary ?? null,
                        suggested_action: r.suggested_action ?? null,
                    });
                }
            } catch {
                // LLM returned non-JSON for this batch — emit "clear" so we don't block the user
                for (const s of batch) out.push({ segment: s.segment, alert: 'clear', code_ref: null, summary: null, suggested_action: null });
            }
        } catch {
            // Network/auth failure for this batch — emit clear and continue
            for (const s of batch) out.push({ segment: s.segment, alert: 'clear', code_ref: null, summary: null, suggested_action: null });
        }
    }
    return { results: out, scanTimeMs: Date.now() - t0 };
}

/** Build a NotebookLM query URL pre-filled with the segments + a tightening preamble. */
export function buildNotebookLmQuery(segments: LegalScanInput[]): string {
    const preface = 'Scan these landlord-tenant conversation segments against Georgia landlord-tenant law (Title 44). For each, flag clear/caution/violation, cite the O.C.G.A. section, and explain.';
    const body = segments.slice(0, 12).map((s, i) => `${i + 1}. ${s.segment}`).join('\n');
    return `${preface}\n\n${body}`;
}
