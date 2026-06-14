/**
 * spawn — Phase-10 A1: parse "spawn <team/persona> on <goal>" requests and
 * resolve them against the Agent Lab catalog (built-in + user-created teams
 * and personas from `agentTeamsStore`). React-free, mirroring
 * dwelliumCommands: the parsed request travels over the `dwellium:ara-spawn`
 * window event, and ARAConsole hosts the orchestrator run inside its chat.
 *
 * A pending-slot backs the event so a spawn fired from ⌘K while ARA is still
 * mounting is not lost: `requestSpawn` stores + dispatches; ARA consumes the
 * slot on mount AND clears it when the live event arrives.
 */
import { agentTeamsStore } from './agentTeamsStore';
import { busChannel } from '../typedBus';

export const ARA_SPAWN_EVENT = 'dwellium:ara-spawn';

export interface SpawnRequest {
    kind: 'team' | 'persona';
    /** Catalog id ('research-squad', 'researcher', custom ids). */
    id: string;
    /** Display name ('Research Squad'). */
    name: string;
    goal: string;
}

export interface SpawnTarget {
    kind: 'team' | 'persona';
    id: string;
    name: string;
}

function norm(s: string): string {
    return s.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

const GROUP_SUFFIX = /\s+(?:squad|team|desk|crew|group)$/;

/** All spoken keys a catalog entry answers to (name, id, id-with-spaces, name-minus-suffix). */
function targetKeys(name: string, id: string): Set<string> {
    const n = norm(name);
    const keys = new Set([n, id, id.replace(/-/g, ' ')]);
    const stripped = n.replace(GROUP_SUFFIX, '');
    if (stripped) keys.add(stripped);
    return keys;
}

/**
 * Resolve a spoken target ("the research team", "deal desk", "researcher")
 * to a team or persona from the Agent Lab catalog. Teams win on conflict.
 */
export function resolveSpawnTarget(raw: string): SpawnTarget | null {
    const q0 = norm(raw).replace(/^(?:the|a|an|my|our)\s+/, '');
    if (!q0) return null;
    const qStripped = q0.replace(GROUP_SUFFIX, '');
    const { teams, personas } = agentTeamsStore.getSnapshot();
    for (const t of teams) {
        const keys = targetKeys(t.name, t.id);
        if (keys.has(q0) || keys.has(qStripped)) return { kind: 'team', id: t.id, name: t.name };
    }
    for (const p of personas) {
        const keys = targetKeys(p.name, p.id);
        if (keys.has(q0) || keys.has(qStripped)) return { kind: 'persona', id: p.id, name: p.name };
    }
    return null;
}

/**
 * Parse a spawn imperative. Input should already be politeness-stripped
 * (parseCommand does this). Returns null unless BOTH a goal is present and
 * the target resolves against the catalog — so "run tests on the build" or
 * "spawn a new tab" fall through to the other command rules / chat.
 * Goal-less spawns ("spawn agents") stay with the existing open-Agent-Lab rule.
 */
export function parseSpawn(input: string): SpawnRequest | null {
    const l = input.trim().toLowerCase().replace(/[?!.]+$/, '').trim();
    if (!l) return null;
    let m: RegExpMatchArray | null;

    // "spawn/assemble the research squad on <goal>"
    if ((m = l.match(/^(?:spawn|assemble)\s+(.+?)\s+(?:on|for|about|to|around|regarding)\s+(.+)$/))) {
        const target = resolveSpawnTarget(m[1]);
        if (target) return { ...target, goal: m[2].trim() };
    }
    // "run a deal desk analysis of <goal>" · "run the research squad on <goal>"
    if ((m = l.match(/^run\s+(.+?)(?:\s+(?:analysis|review|report|assessment|pass|run))?\s+(?:of|on|for|about|against)\s+(.+)$/))) {
        const target = resolveSpawnTarget(m[1]);
        if (target) return { ...target, goal: m[2].trim() };
    }
    // "solo researcher on <goal>" (personas only — solo is the solo-run verb)
    if ((m = l.match(/^solo\s+(.+?)\s+(?:on|for|about)\s+(.+)$/))) {
        const target = resolveSpawnTarget(m[1]);
        if (target?.kind === 'persona') return { ...target, goal: m[2].trim() };
    }
    // "have the researcher look into <goal>"
    if ((m = l.match(/^have\s+(.+?)\s+(?:work\s+on|look\s+into|handle|research|draft|analyze|analyse|write|investigate)\s+(.+)$/))) {
        const target = resolveSpawnTarget(m[1]);
        if (target) return { ...target, goal: m[2].trim() };
    }
    return null;
}

// ── typed-bus emit + one-shot consume (assessment sweep: replaces the
// hand-rolled pending-slot; same mount-race coverage via typedBus replay
// state, one shared mechanism. Signatures unchanged — call sites untouched.) ──
const spawnBus = busChannel<SpawnRequest>(ARA_SPAWN_EVENT);

/** Fire a spawn at ARA: typed-bus emit (last-value kept for mount pickup). */
export function requestSpawn(req: SpawnRequest): void {
    spawnBus.emit(req);
}

/** One-shot read of the pending spawn (ARA mount-time pickup). */
export function consumePendingSpawn(): SpawnRequest | null {
    return spawnBus.consume();
}
