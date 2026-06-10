/**
 * orchestrator — the Agent Lab run engine.
 *
 * A team takes on a goal like this:
 *   1. DECOMPOSE — the orchestrator splits the goal into a task list per member.
 *   2. EXECUTE   — each specialist completes its task list (with Hermes few-shot
 *                  from its own past successes injected as context).
 *   3. VERIFY    — each output is checked against the SOURCES the user provided;
 *                  unsupported claims are flagged.
 *   4. MERGE     — the orchestrator merges the verified outputs into one
 *                  final deliverable.
 *
 * The LLM and the Hermes learning hooks are INJECTED (OrchestratorDeps) so the
 * whole engine is unit-testable with a mock invoker and no network. The widget
 * wires `invoke` to `callLlm` and `recall` / `record` to Hermes.
 */
import type { TaskType } from '../../components/HonchoHermesPanel/hermesLearningStore';
import { AgentTeam, Persona, findPersona, disciplineToTaskType, ORCHESTRATOR_ID } from './personas';

export interface LlmReq {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: 'text' | 'json';
}

export interface RecordInput {
    prompt: string;
    taskType: TaskType;
    outcome: 'success' | 'fail';
    summary?: string;
    toolsUsed?: string[];
}

export interface OrchestratorDeps {
    /** Returns the model's text, or null when no LLM is available / it errored. */
    invoke: (req: LlmReq) => Promise<string | null>;
    /** Few-shot context from Hermes (past successes for this discipline). */
    recall?: (prompt: string, taskType: TaskType) => string;
    /** Record a run into Hermes so the agent improves over time. */
    record?: (input: RecordInput) => void;
}

export type RunPhase = 'decompose' | 'execute' | 'verify' | 'merge' | 'done' | 'error';

export interface RunEvent {
    phase: RunPhase;
    personaId?: string;
    message: string;
}

export interface PersonaOutput {
    personaId: string;
    personaName: string;
    tasks: string[];
    output: string;
    verified: string;
    /** false when verification found unsupported claims (or the run failed). */
    supported: boolean;
}

export interface TeamRunResult {
    assignments: Array<{ personaId: string; tasks: string[] }>;
    outputs: PersonaOutput[];
    final: string;
    error?: string;
}

/** Pull JSON out of a model response that may be fenced or chatty. */
export function extractJson<T>(text: string | null): T | null {
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : text;
    const start = body.search(/[[{]/);
    if (start < 0) return null;
    // Walk to the matching closing bracket to tolerate trailing prose.
    const open = body[start];
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    for (let i = start; i < body.length; i++) {
        if (body[i] === open) depth++;
        else if (body[i] === close) { depth--; if (depth === 0) {
            try { return JSON.parse(body.slice(start, i + 1)) as T; } catch { return null; }
        } }
    }
    return null;
}

function roster(team: AgentTeam, personas: Persona[]): string {
    return team.memberIds
        .map(id => findPersona(personas, id))
        .filter((p): p is Persona => !!p)
        .map(p => `- ${p.id} — ${p.name} (${p.discipline}): ${p.tagline}`)
        .join('\n');
}

/** STEP 1 — orchestrator decomposes the goal into a task list per member. */
async function decompose(
    goal: string, sources: string, team: AgentTeam, personas: Persona[], deps: OrchestratorDeps,
): Promise<Array<{ personaId: string; tasks: string[] }>> {
    const orchestrator = findPersona(personas, team.orchestratorId) ?? findPersona(personas, ORCHESTRATOR_ID);
    const res = await deps.invoke({
        systemPrompt: orchestrator?.systemPrompt,
        responseFormat: 'json',
        temperature: 0.2,
        prompt:
            `GOAL:\n${goal}\n\n` +
            (sources ? `SOURCES (the team may only rely on these):\n${sources}\n\n` : '') +
            `TEAM MEMBERS:\n${roster(team, personas)}\n\n` +
            `Assign each member a short, specific task list toward the GOAL. ` +
            `Respond with ONLY a JSON array: [{"personaId":"<id>","tasks":["...","..."]}].`,
    });
    const parsed = extractJson<Array<{ personaId: string; tasks: string[] }>>(res);
    if (Array.isArray(parsed) && parsed.length > 0) {
        // keep only real members; coerce tasks to string[]
        return parsed
            .filter(a => team.memberIds.includes(a.personaId))
            .map(a => ({ personaId: a.personaId, tasks: Array.isArray(a.tasks) ? a.tasks.map(String) : [] }));
    }
    // Fallback: give every member the whole goal.
    return team.memberIds.map(personaId => ({ personaId, tasks: [goal] }));
}

/** STEP 2 — a specialist completes its task list, learning from past successes. */
async function execute(
    goal: string, sources: string, persona: Persona, tasks: string[], deps: OrchestratorDeps,
): Promise<{ output: string; ok: boolean }> {
    const taskType = disciplineToTaskType[persona.discipline];
    const fewShot = deps.recall?.(goal, taskType) ?? '';
    const out = await deps.invoke({
        systemPrompt: persona.systemPrompt,
        temperature: 0.4,
        prompt:
            (fewShot ? `What worked on similar past tasks:\n${fewShot}\n\n` : '') +
            `OVERALL GOAL:\n${goal}\n\n` +
            (sources ? `SOURCES (rely only on these for facts):\n${sources}\n\n` : '') +
            `YOUR TASKS:\n${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n` +
            `Complete your tasks and produce your contribution.`,
    });
    const ok = !!out && out.trim().length > 0;
    deps.record?.({
        prompt: `[${persona.discipline}] ${goal}`,
        taskType,
        outcome: ok ? 'success' : 'fail',
        summary: ok ? out!.slice(0, 200) : undefined,
        toolsUsed: [persona.id],
    });
    return { output: ok ? out! : '(no response — is an LLM key configured in Settings → API Keys?)', ok };
}

/** STEP 3 — verify a contribution against the provided sources. */
async function verify(
    output: string, sources: string, deps: OrchestratorDeps,
): Promise<{ verified: string; supported: boolean }> {
    if (!sources.trim()) return { verified: output, supported: true }; // nothing to verify against
    const res = await deps.invoke({
        responseFormat: 'json',
        temperature: 0,
        systemPrompt: 'You are a fact-checker. You verify a draft strictly against the provided sources.',
        prompt:
            `SOURCES:\n${sources}\n\n` +
            `DRAFT:\n${output}\n\n` +
            `Check every factual claim against the SOURCES. Respond with ONLY JSON: ` +
            `{"supported": true|false, "verified": "<the draft with any unsupported claim explicitly flagged as [UNVERIFIED]>"}.`,
    });
    const parsed = extractJson<{ supported?: boolean; verified?: string }>(res);
    if (parsed && typeof parsed.verified === 'string') {
        return { verified: parsed.verified, supported: parsed.supported !== false };
    }
    return { verified: output, supported: true };
}

/** STEP 4 — orchestrator merges verified contributions into the final product. */
async function merge(
    goal: string, outputs: PersonaOutput[], team: AgentTeam, personas: Persona[], deps: OrchestratorDeps,
): Promise<string> {
    const orchestrator = findPersona(personas, team.orchestratorId) ?? findPersona(personas, ORCHESTRATOR_ID);
    const body = outputs.map(o => `### ${o.personaName}${o.supported ? '' : ' (contains UNVERIFIED claims)'}\n${o.verified}`).join('\n\n');
    const res = await deps.invoke({
        systemPrompt: orchestrator?.systemPrompt,
        temperature: 0.3,
        prompt:
            `GOAL:\n${goal}\n\n` +
            `VERIFIED CONTRIBUTIONS FROM YOUR TEAM:\n${body}\n\n` +
            `Merge these into one coherent, final deliverable for the GOAL. Resolve overlaps, ` +
            `keep any [UNVERIFIED] flags, and lead with the answer.`,
    });
    return res && res.trim() ? res : outputs.map(o => o.verified).join('\n\n');
}

/** Run a whole team against a goal. */
export async function runTeam(params: {
    goal: string;
    sources?: string;
    team: AgentTeam;
    personas: Persona[];
    deps: OrchestratorDeps;
    onEvent?: (e: RunEvent) => void;
}): Promise<TeamRunResult> {
    const { goal, team, personas, deps } = params;
    const sources = params.sources ?? '';
    const emit = params.onEvent ?? (() => {});

    if (!goal.trim()) return { assignments: [], outputs: [], final: '', error: 'Give the team a goal first.' };

    emit({ phase: 'decompose', message: 'Orchestrator is planning the work…' });
    const assignments = await decompose(goal, sources, team, personas, deps);

    const outputs: PersonaOutput[] = [];
    for (const a of assignments) {
        const persona = findPersona(personas, a.personaId);
        if (!persona) continue;
        emit({ phase: 'execute', personaId: persona.id, message: `${persona.name} is working…` });
        const { output } = await execute(goal, sources, persona, a.tasks, deps);
        emit({ phase: 'verify', personaId: persona.id, message: `Verifying ${persona.name}'s output…` });
        const { verified, supported } = await verify(output, sources, deps);
        outputs.push({ personaId: persona.id, personaName: persona.name, tasks: a.tasks, output, verified, supported });
    }

    emit({ phase: 'merge', message: 'Orchestrator is merging the final product…' });
    const final = await merge(goal, outputs, team, personas, deps);

    emit({ phase: 'done', message: 'Done.' });
    return { assignments, outputs, final };
}

/** Run a single persona (no orchestration) — used for solo persona runs. */
export async function runPersona(params: {
    goal: string;
    sources?: string;
    persona: Persona;
    deps: OrchestratorDeps;
}): Promise<PersonaOutput> {
    const { goal, persona, deps } = params;
    const sources = params.sources ?? '';
    const { output } = await execute(goal, sources, persona, [goal], deps);
    const { verified, supported } = await verify(output, sources, deps);
    return { personaId: persona.id, personaName: persona.name, tasks: [goal], output, verified, supported };
}
