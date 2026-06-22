/**
 * Hermes autonomous task runner.
 *
 * The pure `runNextHermesTask` claims one durable persona task and completes or
 * fails it. `useHermesAutonomousRunner` mounts that engine once in AdminShell,
 * so queued work keeps moving while Dwellium remains open even when the Honcho
 * window is closed.
 */
import { useContext, useEffect, useRef } from 'react';
import { UserContext } from '../context/UserContext';
import { useIntegrations } from '../hooks/useIntegrations';
import { callLlm, applyModelPreference, hasActiveLlm } from '../lib/llmClient';
import {
    agentLabUserIdHolder,
    agentTeamsStore,
} from '../lib/agents/agentTeamsStore';
import {
    claimNextTask,
    completeTask,
    failTask,
    formatMemory,
    personaWorkUserIdHolder,
    recordRun as recordPersonaRun,
    recoverStaleTasks,
    type ClaimedPersonaTask,
} from '../lib/agents/personaWorkStore';
import {
    HERMES_PERSONA_IDS,
    findPersona,
    type Persona,
} from '../lib/agents/personas';
import {
    runPersona,
    type OrchestratorDeps,
    type PersonaOutput,
} from '../lib/agents/orchestrator';
import { AGENT_SKILLS, runSkillForInput } from '../lib/agents/skills';
import {
    formatFewShot,
    hermesLearningUserIdHolder,
    recordRun as recordHermesRun,
    relevantPastRuns,
} from '../components/HonchoHermesPanel/hermesLearningStore';
import {
    agentWikiUserIdHolder,
    buildWikiContext,
} from '../components/HonchoHermesPanel/agentWikiStore';

const FIRST_DELAY_MS = 3_000;
const CHECK_EVERY_MS = 30_000;
const STALE_AFTER_MS = 30 * 60 * 1000;

export interface RunNextHermesTaskDeps {
    personas: Persona[];
    orchestratorDeps: OrchestratorDeps;
    claim?: () => ClaimedPersonaTask | null;
    complete?: (personaId: string, taskId: string, result: string) => void;
    fail?: (personaId: string, taskId: string, error: string) => void;
    remember?: (personaId: string, summary: string, durationMs: number, outcome: 'success' | 'fail') => void;
    wikiContext?: () => string;
    personaMemory?: (personaId: string) => string;
    runPersonaFn?: typeof runPersona;
    now?: () => number;
}

export interface AutonomousTaskResult {
    personaId: string;
    taskId: string;
    outcome: 'success' | 'fail';
    result?: string;
    error?: string;
}

/** Claim and execute the next queued Hermes-persona task. Returns null when idle. */
export async function runNextHermesTask(deps: RunNextHermesTaskDeps): Promise<AutonomousTaskResult | null> {
    const claim = (deps.claim ?? (() => claimNextTask(HERMES_PERSONA_IDS)))();
    if (!claim) return null;

    const complete = deps.complete ?? completeTask;
    const fail = deps.fail ?? failTask;
    const remember = deps.remember ?? recordPersonaRun;
    const run = deps.runPersonaFn ?? runPersona;
    const now = deps.now ?? Date.now;
    const startedAt = now();
    const persona = findPersona(deps.personas, claim.personaId);

    if (!persona) {
        const error = `Persona ${claim.personaId} is unavailable.`;
        fail(claim.personaId, claim.task.id, error);
        return { personaId: claim.personaId, taskId: claim.task.id, outcome: 'fail', error };
    }

    const sharedMemory = deps.wikiContext?.() ?? buildWikiContext();
    const workingMemory = deps.personaMemory?.(persona.id) ?? formatMemory(persona.id);
    const augmented: Persona = {
        ...persona,
        systemPrompt:
            `${persona.systemPrompt}${workingMemory}\n\n` +
            `## Shared Hermes memory\n${sharedMemory}\n\n` +
            'You are running unattended. Finish the assigned task as far as the available tools and context allow. ' +
            'End with a concise completion report: result, evidence, blockers, and next action.',
    };

    try {
        const output: PersonaOutput = await run({
            goal: claim.task.title,
            persona: augmented,
            deps: deps.orchestratorDeps,
        });
        const result = output.verified.trim();
        const ok = !!output.output.trim() && !output.output.startsWith('(no response');
        const duration = Math.max(0, now() - startedAt);
        if (!ok) {
            const error = 'No usable response. Check the persona model/key assignment and retry.';
            fail(persona.id, claim.task.id, error);
            remember(persona.id, `Autonomous task failed: ${claim.task.title}`, duration, 'fail');
            return { personaId: persona.id, taskId: claim.task.id, outcome: 'fail', error };
        }
        complete(persona.id, claim.task.id, result.slice(0, 2_000));
        remember(persona.id, `Autonomous task: ${claim.task.title} -> ${result.slice(0, 180)}`, duration, 'success');
        return { personaId: persona.id, taskId: claim.task.id, outcome: 'success', result };
    } catch (err: any) {
        const error = err?.message || String(err);
        const duration = Math.max(0, now() - startedAt);
        fail(persona.id, claim.task.id, error);
        remember(persona.id, `Autonomous task failed: ${claim.task.title} -> ${error}`, duration, 'fail');
        return { personaId: persona.id, taskId: claim.task.id, outcome: 'fail', error };
    }
}

/** Mount once inside the signed-in shell. */
export function useHermesAutonomousRunner(): void {
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    const { integrations } = useIntegrations();
    const runningRef = useRef(false);

    useEffect(() => {
        if (!uid) return;

        agentLabUserIdHolder.current = uid;
        personaWorkUserIdHolder.current = uid;
        hermesLearningUserIdHolder.current = uid;
        agentWikiUserIdHolder.current = uid;
        recoverStaleTasks(HERMES_PERSONA_IDS, Date.now() - STALE_AFTER_MS);

        if (!hasActiveLlm(integrations.llm)) return;
        let cancelled = false;

        const orchestratorDeps: OrchestratorDeps = {
            invoke: async req => {
                const persona = req.personaId
                    ? agentTeamsStore.getSnapshot().personas.find(p => p.id === req.personaId)
                    : undefined;
                const response = await callLlm(req, applyModelPreference(integrations.llm, persona?.preferredModel));
                return response?.text ?? null;
            },
            recall: prompt => formatFewShot(relevantPastRuns(prompt, 3)),
            record: input => { recordHermesRun(input); },
            runSkill: async (input, skillIds) => {
                const catalog = AGENT_SKILLS.filter(skill => skillIds.includes(skill.id));
                // PROVENANCE GATE: autonomous-task skill input is orchestrator/model-
                // derived, not human-typed — origin 'model' so only the autonomous-safe
                // allowlist runs (code runner / widget-mutating / memory-write refused).
                const result = await runSkillForInput(input, {
                    llm: integrations.llm,
                    search: integrations.search,
                }, catalog, 'model');
                return result?.ok ? { name: result.skill.name, text: result.text } : null;
            },
        };

        const tick = async () => {
            if (cancelled || runningRef.current) return;
            runningRef.current = true;
            try {
                await runNextHermesTask({
                    personas: agentTeamsStore.getSnapshot().personas,
                    orchestratorDeps,
                });
            } finally {
                runningRef.current = false;
            }
        };

        const first = setTimeout(tick, FIRST_DELAY_MS);
        const interval = setInterval(tick, CHECK_EVERY_MS);
        return () => {
            cancelled = true;
            clearTimeout(first);
            clearInterval(interval);
        };
    }, [uid, integrations.llm, integrations.search]);
}
