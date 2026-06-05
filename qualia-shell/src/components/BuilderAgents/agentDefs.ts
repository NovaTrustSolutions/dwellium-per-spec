/**
 * builderAgents — pure config + prompt composition for the three §8 builder
 * agents (Schema Producer §8.6, PRD synthesis §8.7, Gap analysis §8.8). Kept
 * dependency-free + pure so prompt assembly is unit-testable; the widget wraps
 * these with `callLlm`.
 */

export type AgentMode = 'schema' | 'prd' | 'gap';

export interface AgentField {
    key: string;
    label: string;
    placeholder: string;
    kind: 'text' | 'select';
    options?: string[];
    rows?: number;
}

export interface AgentDef {
    mode: AgentMode;
    label: string;
    blurb: string;
    fields: AgentField[];
    systemPrompt: string;
}

export const AGENTS: Record<AgentMode, AgentDef> = {
    schema: {
        mode: 'schema',
        label: 'Schema Producer',
        blurb: 'Describe a data structure → get a structured schema.',
        fields: [
            { key: 'description', label: 'Describe your data structure', placeholder: 'e.g. A maintenance work order with status, priority, assigned vendor, line items, and timestamps…', kind: 'text', rows: 5 },
            { key: 'format', label: 'Output format', placeholder: '', kind: 'select', options: ['JSON Schema', 'TypeScript interface', 'Zod schema'] },
        ],
        systemPrompt: 'You are a schema-producing agent. Given a plain-English description of a data structure, output a single, complete, valid schema in the requested format. Output only the schema inside one fenced code block — no prose before or after.',
    },
    prd: {
        mode: 'prd',
        label: 'PRD Synthesis',
        blurb: 'Paste source notes/documents → get structured requirements.',
        fields: [
            { key: 'sources', label: 'Source documents / notes (separate with a blank line or ---)', placeholder: 'Paste meeting notes, feature ideas, constraints, user feedback…', kind: 'text', rows: 8 },
        ],
        systemPrompt: 'You are a PRD synthesis agent. Given one or more source documents, synthesize a single structured Product Requirements Document in Markdown with these sections: Overview, Goals, Non-goals, Requirements (numbered, prioritized), Success metrics, Open questions. Ground every requirement in the sources; flag assumptions explicitly.',
    },
    gap: {
        mode: 'gap',
        label: 'Gap Analysis',
        blurb: 'Spec + implementation → what is missing.',
        fields: [
            { key: 'spec', label: 'Specification', placeholder: 'Paste the spec / intended behavior…', kind: 'text', rows: 6 },
            { key: 'implementation', label: 'Implementation (or summary of it)', placeholder: 'Paste the current implementation, file list, or description…', kind: 'text', rows: 6 },
        ],
        systemPrompt: 'You are a gap-analysis agent. Compare the SPECIFICATION against the IMPLEMENTATION and identify what is missing, incomplete, or divergent. Output Markdown grouped by severity (Blocking, Major, Minor), each item phrased as a concrete, actionable gap. End with a one-line readiness verdict.',
    },
};

export interface ComposedPrompt { systemPrompt: string; prompt: string; }

/** Compose the LLM request for an agent mode from its field values. Pure. */
export function composePrompt(mode: AgentMode, values: Record<string, string>): ComposedPrompt {
    const def = AGENTS[mode];
    if (mode === 'schema') {
        return {
            systemPrompt: def.systemPrompt,
            prompt: `Output format: ${values.format || 'JSON Schema'}\n\nData structure description:\n${(values.description || '').trim()}`,
        };
    }
    if (mode === 'prd') {
        return { systemPrompt: def.systemPrompt, prompt: `Source documents:\n\n${(values.sources || '').trim()}` };
    }
    // gap
    return {
        systemPrompt: def.systemPrompt,
        prompt: `=== SPECIFICATION ===\n${(values.spec || '').trim()}\n\n=== IMPLEMENTATION ===\n${(values.implementation || '').trim()}`,
    };
}

/** Whether the required fields for a mode are filled enough to run. */
export function canRun(mode: AgentMode, values: Record<string, string>): boolean {
    if (mode === 'schema') return !!(values.description || '').trim();
    if (mode === 'prd') return !!(values.sources || '').trim();
    return !!(values.spec || '').trim() && !!(values.implementation || '').trim();
}
