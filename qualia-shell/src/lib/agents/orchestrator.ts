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
 *
 * D1/D2/D3/D10/P5 fix (2026-09): a provider error thrown by one member no
 * longer discards the run — each member is isolated in its own try/catch,
 * `ok`/`error` on PersonaOutput make a real failure distinguishable from a
 * real success (the old placeholder text was a truthy "(no response…)"
 * string), verification failing OPEN (defaulting to supported) is replaced
 * by an explicit `verifyStatus`, and a team with zero resolvable members (or
 * a decompose result naming only unknown personas) no longer silently runs
 * nobody / everybody without saying so.
 */
import type { TaskType } from '../../components/HonchoHermesPanel/hermesLearningStore';
import { AgentTeam, Persona, findPersona, disciplineToTaskType, ORCHESTRATOR_ID } from './personas';
import { captureOwner, ACCOUNT_CHANGED } from '../perUserIdentity';

export interface LlmReq {
    /** P12-2: the persona this call speaks AS — call sites may route it to the persona's preferred model. */
    personaId?: string;
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
    /** answered but had no Sources to be checked against (outcome is 'fail'). */
    unchecked?: boolean;
}

export interface OrchestratorDeps {
    /** Returns the model's text, or null when no LLM is available / it errored. */
    invoke: (req: LlmReq) => Promise<string | null>;
    /** Few-shot context from Hermes (past successes for this discipline). */
    recall?: (prompt: string, taskType: TaskType) => string;
    /** Record a run into Hermes so the agent improves over time. */
    /** Returns the stored record (its id lets a later 👍/👎 target this run). */
    record?: (input: RecordInput) => { id: string } | void;
    /**
     * P11-5: execute one of the persona's EQUIPPED skills against a task
     * ("a Researcher actually web-searches"). Returns null when no equipped
     * skill claims the task. Tool output feeds the member's prompt as
     * evidence — it doesn't replace the member's own contribution.
     */
    runSkill?: (input: string, skillIds: string[]) => Promise<{ name: string; text: string } | null>;
}

export type RunPhase = 'decompose' | 'execute' | 'verify' | 'merge' | 'done' | 'error';

export interface RunEvent {
    phase: RunPhase;
    personaId?: string;
    message: string;
}

/** Fired per team member so the UI can drop the subtask into that persona's task list. */
export interface MemberTaskEvent {
    phase: 'assigned' | 'start' | 'done';
    personaId: string;
    title: string;
    durationMs?: number;
    result?: string;
    ok?: boolean;
    /** set alongside `ok: false` on phase 'done'. */
    error?: string;
    /** on phase 'done': the answer passed a fact-check against the Sources. */
    supported?: boolean;
    /** on phase 'done': how the fact-check went (flagged vs. could not run). */
    verifyStatus?: VerifyStatus;
}

/** Outcome of STEP 3 (verify) for one member's output. */
export type VerifyStatus = 'passed' | 'flagged' | 'unavailable' | 'skipped';

export interface PersonaOutput {
    personaId: string;
    personaName: string;
    tasks: string[];
    output: string;
    verified: string;
    /** true ONLY when the member produced a real answer AND that answer passed
     *  a fact-check against the Sources. No Sources means nothing was checked,
     *  so it is not "supported" (verifyStatus 'skipped' — see workOutcome). */
    supported: boolean;
    /** the member produced a real (non-empty) model answer. */
    ok: boolean;
    /** set when !ok: the provider error message, or the no-response message. */
    error?: string;
    verifyStatus: VerifyStatus;
    /** id of the Hermes record this answer was logged under (when deps.record stores one). */
    recordId?: string;
}

export interface TeamRunResult {
    assignments: Array<{ personaId: string; tasks: string[] }>;
    outputs: PersonaOutput[];
    final: string;
    /** set iff the run produced no usable deliverable (then final === ''). */
    error?: string;
    outcome: 'success' | 'partial' | 'fail';
    /** human-readable, e.g. "Engineer: [anthropic] 429 rate limited". */
    warnings: string[];
    /** every member answered and nothing disputed it — it just had no Sources to be
     *  checked against. Not a success, but a user 👍 may promote it (rankPastRuns). */
    unchecked: boolean;
}

/** Why an answered-but-unsupported run is kept out of learning — honest about flagged vs. unchecked. */
export function notReusedReason(status?: VerifyStatus): string {
    if (status === 'skipped') return 'not fact-checked, no Sources (not reused)';
    return status === 'unavailable' ? 'fact-check unavailable (not reused)' : 'flagged by the fact-check (not reused)';
}

/** Only an answer checked against Sources and not disputed counts as supported. */
function isSupported(ok: boolean, status: VerifyStatus): boolean {
    return ok && status === 'passed';
}

/** How a run is logged in the persona's work log: 'unchecked' = answered, but there were no Sources to check it against. */
export function workOutcome(out: Pick<PersonaOutput, 'ok' | 'supported' | 'verifyStatus'>): 'success' | 'fail' | 'unchecked' {
    if (out.supported) return 'success';
    return out.ok && out.verifyStatus === 'skipped' ? 'unchecked' : 'fail';
}

/** Friendly message when the model returns no text at all (null/blank invoke). */
export const NO_RESPONSE_MESSAGE =
    'No response from the model. The active provider may not be configured (Settings → API Keys).';

/** A thrown LlmError already reads "[provider] ..."; any other Error/value falls back to its own text. */
export function describeLlmFailure(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    // An LlmError reads "[provider] <raw response body>", and provider bodies are
    // JSON ({"error":{"message":"…"}}) — show the provider's own message, not the JSON.
    const m = err.message.match(/^(\[[^\]]+\]) ([\s\S]*)$/);
    if (m) {
        try {
            const body = JSON.parse(m[2]) as { error?: { message?: unknown }; message?: unknown };
            const msg = body?.error?.message ?? body?.message;
            if (typeof msg === 'string' && msg.trim()) {
                const status = (err as { status?: number }).status;
                return `${m[1]}${status ? ` ${status}` : ''} ${msg.trim()}`;
            }
        } catch { /* not JSON — keep the text as it is */ }
    }
    return err.message;
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

/**
 * STEP 1 — orchestrator decomposes the goal into a task list per member.
 * A thrown planning error is NOT caught here — it propagates to runTeam.
 */
async function decompose(
    goal: string, sources: string, team: AgentTeam, personas: Persona[], deps: OrchestratorDeps,
    resolvableMembers: Persona[],
): Promise<Array<{ personaId: string; tasks: string[] }>> {
    const orchestrator = findPersona(personas, team.orchestratorId) ?? findPersona(personas, ORCHESTRATOR_ID);
    const res = await deps.invoke({
        personaId: orchestrator?.id,
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
    const parsed = extractJson<Array<{ personaId?: unknown; tasks?: unknown }>>(res);
    if (Array.isArray(parsed) && parsed.length > 0) {
        // D10 fix: normalise each entry to a real member — exact id, then
        // case-insensitive id, then case-insensitive NAME — dropping anything
        // that still doesn't resolve, and merging duplicates (concatenating
        // tasks) rather than overwriting. A model returning only unknown ids
        // used to filter to [] and run nobody; that now falls through to the
        // "every resolvable member gets the goal" fallback below.
        const byId = new Map<string, { personaId: string; tasks: string[] }>();
        for (const a of parsed) {
            const rawId = typeof a.personaId === 'string' ? a.personaId : '';
            const match =
                resolvableMembers.find(p => p.id === rawId) ??
                resolvableMembers.find(p => p.id.toLowerCase() === rawId.toLowerCase()) ??
                resolvableMembers.find(p => p.name.toLowerCase() === rawId.toLowerCase());
            if (!match) continue;
            const tasks = Array.isArray(a.tasks) ? a.tasks.map(String) : [];
            const existing = byId.get(match.id);
            if (existing) existing.tasks.push(...tasks);
            else byId.set(match.id, { personaId: match.id, tasks });
        }
        const normalised = Array.from(byId.values()).map(a => ({
            personaId: a.personaId,
            tasks: a.tasks.length > 0 ? a.tasks : [goal],
        }));
        if (normalised.length > 0) return normalised;
    }
    // Fallback: give every resolvable member the whole goal.
    return resolvableMembers.map(p => ({ personaId: p.id, tasks: [goal] }));
}

/** STEP 2 — a specialist completes its task list, learning from past successes. */
async function execute(
    goal: string, sources: string, persona: Persona, tasks: string[], deps: OrchestratorDeps,
): Promise<{ output: string; ok: boolean; error?: string }> {
    const taskType = disciplineToTaskType[persona.discipline];
    const fewShot = deps.recall?.(goal, taskType) ?? '';
    const stillOwner = captureOwner(); // owner-race guard (see runTeam)
    // P11-5: run equipped skills against the member's tasks first; outputs
    // become evidence in the prompt (capped to keep token use sane).
    let toolResults = '';
    if (deps.runSkill && persona.tools?.length) {
        for (const t of tasks.slice(0, 4)) {
            if (!stillOwner()) return { output: '', ok: false, error: ACCOUNT_CHANGED }; // no tool on the old user's keys
            try {
                const r = await deps.runSkill(t, persona.tools);
                if (r) toolResults += `\n[${r.name}] for "${t.slice(0, 60)}":\n${r.text.slice(0, 800)}\n`;
            } catch { /* tools are best-effort — the member still writes */ }
        }
    }
    if (!stillOwner()) return { output: '', ok: false, error: ACCOUNT_CHANGED };
    // A thrown provider error here is NOT caught — it propagates to the caller
    // (runTeam isolates it per-member; runPersona/runTeam callers have their
    // own catch).
    const out = await deps.invoke({
        personaId: persona.id,
        systemPrompt: persona.systemPrompt,
        temperature: 0.4,
        prompt:
            (fewShot ? `What worked on similar past tasks:\n${fewShot}\n\n` : '') +
            `OVERALL GOAL:\n${goal}\n\n` +
            (sources ? `SOURCES (rely only on these for facts):\n${sources}\n\n` : '') +
            (toolResults ? `TOOL RESULTS (live output from your equipped skills — use as evidence):\n${toolResults}\n` : '') +
            `YOUR TASKS:\n${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n` +
            `Complete your tasks and produce your contribution.`,
    });
    const ok = !!out && out.trim().length > 0;
    // Recording happens AFTER the fact-check (recordOutcome), so a flagged answer is never logged as a success.
    // D3 fix: the placeholder text stays (other callers display it) but is no
    // longer the only signal — `ok`/`error` tell a real failure apart from a
    // real success.
    return {
        output: ok ? out! : '(no response — is an LLM key configured in Settings → API Keys?)',
        ok,
        error: ok ? undefined : NO_RESPONSE_MESSAGE,
    };
}

/**
 * Record one member's run in Hermes once its fact-check is done. Only an answer
 * that passed the check against Sources counts as a success; a flagged or
 * unverifiable answer is logged as a fail, marked [unverified], and an answer
 * with no Sources as a fail marked `unchecked` — recall offers neither as a past
 * example (an unchecked one only after a user 👍).
 */
function recordOutcome(deps: OrchestratorDeps, persona: Persona, goal: string, ok: boolean, verifyStatus: VerifyStatus, verified: string): string | undefined {
    const supported = isSupported(ok, verifyStatus);
    const unchecked = ok && verifyStatus === 'skipped';
    const rec = deps.record?.({
        prompt: `[${persona.discipline}] ${goal}`,
        taskType: disciplineToTaskType[persona.discipline],
        outcome: supported ? 'success' : 'fail',
        summary: !ok ? undefined : (supported || unchecked ? verified : `[unverified] ${verified}`).slice(0, 200),
        toolsUsed: [persona.id],
        ...(unchecked ? { unchecked: true } : {}),
    });
    return rec ? rec.id : undefined;
}

/**
 * STEP 3 — verify a contribution against the provided sources.
 * D2 fix: verification failing OPEN (silently treating an error or an
 * unparseable check as supported) is replaced by an explicit `verifyStatus`
 * — callers derive `supported` from `ok && verifyStatus`, never from this
 * function assuming the best.
 */
async function verify(
    output: string, sources: string, deps: OrchestratorDeps,
): Promise<{ verified: string; verifyStatus: VerifyStatus }> {
    if (!sources.trim()) return { verified: output, verifyStatus: 'skipped' }; // nothing to verify against
    let res: string | null;
    try {
        res = await deps.invoke({
            responseFormat: 'json',
            temperature: 0,
            systemPrompt: 'You are a fact-checker. You verify a draft strictly against the provided sources.',
            prompt:
                `SOURCES:\n${sources}\n\n` +
                `DRAFT:\n${output}\n\n` +
                `Check every factual claim against the SOURCES. Respond with ONLY JSON: ` +
                `{"supported": true|false, "verified": "<the draft with any unsupported claim explicitly flagged as [UNVERIFIED]>"}.`,
        });
    } catch {
        return { verified: output, verifyStatus: 'unavailable' };
    }
    const parsed = extractJson<{ supported?: unknown; verified?: unknown }>(res);
    // Accept the parse ONLY when both fields are the right type — prose, a
    // missing field, or a non-boolean `supported` never counts as supported.
    if (parsed && typeof parsed.verified === 'string' && typeof parsed.supported === 'boolean') {
        return { verified: parsed.verified, verifyStatus: parsed.supported ? 'passed' : 'flagged' };
    }
    return { verified: output, verifyStatus: 'unavailable' };
}

/**
 * STEP 4 — orchestrator merges verified contributions into the final product.
 * Callers pass ONLY the ok outputs. `fellBack: true` means the model
 * returned nothing usable and the caller should warn the user.
 */
async function merge(
    goal: string, outputs: PersonaOutput[], team: AgentTeam, personas: Persona[], deps: OrchestratorDeps,
): Promise<{ text: string; fellBack: boolean }> {
    const orchestrator = findPersona(personas, team.orchestratorId) ?? findPersona(personas, ORCHESTRATOR_ID);
    // Only a contribution the fact-check disputed or could not check is marked; one with no
    // Sources was never checked, so it is not "unverified" — the merge must not hedge it.
    const body = outputs.map(o => `### ${o.personaName}${o.supported || o.verifyStatus === 'skipped' ? '' : ' (contains UNVERIFIED claims)'}\n${o.verified}`).join('\n\n');
    const res = await deps.invoke({
        personaId: orchestrator?.id,
        systemPrompt: orchestrator?.systemPrompt,
        temperature: 0.3,
        prompt:
            `GOAL:\n${goal}\n\n` +
            `VERIFIED CONTRIBUTIONS FROM YOUR TEAM:\n${body}\n\n` +
            `Merge these into one coherent, final deliverable for the GOAL. Resolve overlaps, ` +
            `keep any [UNVERIFIED] flags, and lead with the answer.`,
    });
    if (res && res.trim()) return { text: res, fellBack: false };
    return { text: outputs.map(o => o.verified).join('\n\n'), fellBack: true };
}

/** Run a whole team against a goal. Members run SEQUENTIALLY (parallelism is out of scope). */
export async function runTeam(params: {
    goal: string;
    sources?: string;
    team: AgentTeam;
    personas: Persona[];
    deps: OrchestratorDeps;
    onEvent?: (e: RunEvent) => void;
    onMemberTask?: (e: MemberTaskEvent) => void;
}): Promise<TeamRunResult> {
    const { goal, team, personas, deps } = params;
    const sources = params.sources ?? '';
    const emit = params.onEvent ?? (() => {});
    const onMemberTask = params.onMemberTask ?? (() => {});
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // Owner-race guard: an account switch mid-run stops the run — no later member runs on the old
    // user's key, and nothing (Hermes record, member-task event) lands in the new user's stores.
    const stillOwner = captureOwner();
    const stopped = (): TeamRunResult => ({ assignments: [], outputs: [], final: '', error: ACCOUNT_CHANGED, outcome: 'fail', warnings: [], unchecked: false });

    if (!goal.trim()) {
        return { assignments: [], outputs: [], final: '', error: 'Give the team a goal first.', outcome: 'fail', warnings: [], unchecked: false };
    }

    // P5 fix: a team whose members were all deleted from the catalog used to
    // still "run" (decompose + merge with an empty roster). Fail fast, with
    // no LLM call at all.
    const resolvableMembers = team.memberIds
        .map(id => findPersona(personas, id))
        .filter((p): p is Persona => !!p);
    if (resolvableMembers.length === 0) {
        return {
            assignments: [], outputs: [], final: '',
            error: 'This team has no members. Edit the team and add at least one persona.',
            outcome: 'fail', warnings: [], unchecked: false,
        };
    }

    emit({ phase: 'decompose', message: 'Orchestrator is planning the work…' });
    let assignments: Array<{ personaId: string; tasks: string[] }>;
    try {
        assignments = await decompose(goal, sources, team, personas, deps, resolvableMembers);
    } catch (e) {
        const error = `Planning failed: ${describeLlmFailure(e)}`;
        emit({ phase: 'error', message: error });
        return { assignments: [], outputs: [], final: '', error, outcome: 'fail', warnings: [], unchecked: false };
    }

    // D1 fix: each member is isolated in its own try/catch so one provider
    // error can't discard every other member's finished work.
    const outputs: PersonaOutput[] = [];
    const warnings: string[] = [];
    for (const a of assignments) {
        if (!stillOwner()) return stopped();
        const persona = findPersona(personas, a.personaId);
        if (!persona) continue;
        const title = a.tasks.join('; ') || goal;
        onMemberTask({ phase: 'assigned', personaId: persona.id, title });
        onMemberTask({ phase: 'start', personaId: persona.id, title });
        const t0 = now();
        emit({ phase: 'execute', personaId: persona.id, message: `${persona.name} is working…` });

        let output = '';
        let verified = '';
        let ok = false;
        let error: string | undefined;
        let verifyStatus: VerifyStatus = 'skipped';
        let executed = false;
        try {
            const ex = await execute(goal, sources, persona, a.tasks, deps);
            executed = true;
            output = ex.output;
            ok = ex.ok;
            error = ex.error;
            if (ok) {
                if (!stillOwner()) return stopped();
                emit({ phase: 'verify', personaId: persona.id, message: `Verifying ${persona.name}'s output…` });
                const v = await verify(output, sources, deps);
                verified = v.verified;
                verifyStatus = v.verifyStatus;
                if (verifyStatus === 'unavailable') warnings.push(`${persona.name}: verification unavailable`);
            } else {
                // A failed member skips verification entirely — nothing to check.
                verified = output;
            }
        } catch (e) {
            ok = false;
            error = describeLlmFailure(e);
            output = '';
            verified = '';
        }
        if (!stillOwner()) return stopped();
        if (!ok) {
            emit({ phase: 'error', personaId: persona.id, message: `${persona.name} failed: ${error}` });
            warnings.push(`${persona.name}: ${error}`);
        }
        const supported = isSupported(ok, verifyStatus);
        const recordId = executed ? recordOutcome(deps, persona, goal, ok, verifyStatus, verified) : undefined;
        onMemberTask({ phase: 'done', personaId: persona.id, title, durationMs: now() - t0, result: verified.slice(0, 400), ok, error, supported, verifyStatus });
        outputs.push({ personaId: persona.id, personaName: persona.name, tasks: a.tasks, output, verified, supported, ok, error, verifyStatus, recordId });
    }

    const okOutputs = outputs.filter(o => o.ok);
    if (okOutputs.length === 0) {
        const firstError = outputs[0]?.error ?? 'unknown error';
        const error = `No team member produced a result. ${firstError}`;
        emit({ phase: 'error', message: error });
        return { assignments, outputs, final: '', error, outcome: 'fail', warnings, unchecked: false };
    }

    emit({ phase: 'merge', message: 'Orchestrator is merging the final product…' });
    let final: string;
    let mergeOk = true;
    try {
        const m = await merge(goal, okOutputs, team, personas, deps);
        final = m.text;
        if (m.fellBack) {
            mergeOk = false;
            warnings.push('Merge step returned nothing; showing member outputs as-is.');
        }
    } catch (e) {
        mergeOk = false;
        final = okOutputs.map(o => o.verified).join('\n\n');
        warnings.push(`Merge step failed (${describeLlmFailure(e)}); showing member outputs as-is.`);
    }
    if (!stillOwner()) return stopped();

    // Success means every member answered AND passed its fact-check against the Sources —
    // a run with a flagged or unchecked member is partial, so it is never taught as a clean success.
    const allMembersSupported = outputs.every(o => o.supported);
    const delivered = mergeOk && !!final.trim();
    const outcome: TeamRunResult['outcome'] = allMembersSupported && delivered ? 'success' : 'partial';
    const unchecked = !allMembersSupported && delivered && outputs.every(o => o.ok && o.verifyStatus === 'skipped');

    emit({ phase: 'done', message: 'Done.' });
    return { assignments, outputs, final, outcome, warnings, unchecked };
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
    const stillOwner = captureOwner(); // owner-race guard (see runTeam)
    const stopped = (): PersonaOutput => ({
        personaId: persona.id, personaName: persona.name, tasks: [goal],
        output: '', verified: '', supported: false, ok: false, error: ACCOUNT_CHANGED, verifyStatus: 'skipped',
    });
    const ex = await execute(goal, sources, persona, [goal], deps);
    if (!stillOwner()) return stopped();
    let verified = ex.output;
    let verifyStatus: VerifyStatus = 'skipped';
    if (ex.ok) {
        const v = await verify(ex.output, sources, deps);
        verified = v.verified;
        verifyStatus = v.verifyStatus;
    }
    if (!stillOwner()) return stopped();
    const supported = isSupported(ex.ok, verifyStatus);
    const recordId = recordOutcome(deps, persona, goal, ex.ok, verifyStatus, verified);
    return {
        personaId: persona.id, personaName: persona.name, tasks: [goal],
        output: ex.output, verified, supported, ok: ex.ok, error: ex.error, verifyStatus, recordId,
    };
}
