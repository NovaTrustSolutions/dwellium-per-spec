/**
 * agentTeamsStore — per-user personas + teams for the Agent Lab.
 *
 * Dynamic-key per-user store (sister-shape to hermesLearningStore /
 * integrationsStore): each user gets their own personas + teams, loaded on
 * login. Built-in personas/teams are merged in on read so new built-ins (and
 * the folded-agent personas) appear, while user edits to a built-in id are
 * preserved. SSR-safe via getServerSnapshot.
 */
import { useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../../context/UserContext';
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../oneSaveStore';
import {
    Persona,
    AgentTeam,
    DEFAULT_PERSONAS,
    DEFAULT_TEAMS,
} from './personas';

export interface AgentLabState {
    personas: Persona[];
    teams: AgentTeam[];
}

export const agentLabUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = agentLabUserIdHolder.current;
    return uid ? `agentlab:${uid}` : 'agentlab:_anonymous';
}

/** Defaults first (keeping user edits to a built-in id), then user-created appended. */
function mergeById<T extends { id: string }>(defaults: T[], stored: T[]): T[] {
    const storedById = new Map(stored.map(s => [s.id, s]));
    const out: T[] = defaults.map(d => storedById.get(d.id) ?? d);
    const defaultIds = new Set(defaults.map(d => d.id));
    for (const s of stored) if (!defaultIds.has(s.id)) out.push(s);
    return out;
}

function emptyState(): AgentLabState {
    return { personas: DEFAULT_PERSONAS, teams: DEFAULT_TEAMS };
}

function deserialize(raw: string | null): AgentLabState {
    if (!raw) return emptyState();
    try {
        const parsed = JSON.parse(raw);
        const personas: Persona[] = Array.isArray(parsed?.personas) ? parsed.personas.filter(isPersona) : [];
        const teams: AgentTeam[] = Array.isArray(parsed?.teams) ? parsed.teams.filter(isTeam) : [];
        return {
            personas: mergeById(DEFAULT_PERSONAS, personas),
            teams: mergeById(DEFAULT_TEAMS, teams),
        };
    } catch {
        return emptyState();
    }
}

function isPersona(p: unknown): p is Persona {
    return !!p && typeof (p as Persona).id === 'string' && typeof (p as Persona).systemPrompt === 'string';
}
function isTeam(t: unknown): t is AgentTeam {
    return !!t && typeof (t as AgentTeam).id === 'string' && Array.isArray((t as AgentTeam).memberIds);
}

export const agentTeamsStore = withSync(
    createLocalStorageStore<AgentLabState>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: emptyState(),
    }),
    { objectType: 'agent-lab', holder: agentLabUserIdHolder, resolveKey },
);

function persist(next: AgentLabState): void {
    agentTeamsStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/* ─── Mutators ─── */

export function upsertPersona(persona: Persona): void {
    const cur = agentTeamsStore.getSnapshot();
    const idx = cur.personas.findIndex(p => p.id === persona.id);
    const personas = idx >= 0 ? cur.personas.map(p => (p.id === persona.id ? persona : p)) : [...cur.personas, persona];
    persist({ ...cur, personas });
}

/** Delete a user-created persona (built-ins are protected) + drop it from teams. */
export function deletePersona(id: string): void {
    const cur = agentTeamsStore.getSnapshot();
    const target = cur.personas.find(p => p.id === id);
    if (!target || target.builtin) return;
    persist({
        personas: cur.personas.filter(p => p.id !== id),
        teams: cur.teams.map(t => ({ ...t, memberIds: t.memberIds.filter(m => m !== id) })),
    });
}

export function upsertTeam(team: AgentTeam): void {
    const cur = agentTeamsStore.getSnapshot();
    const idx = cur.teams.findIndex(t => t.id === team.id);
    const teams = idx >= 0 ? cur.teams.map(t => (t.id === team.id ? team : t)) : [...cur.teams, team];
    persist({ ...cur, teams });
}

export function deleteTeam(id: string): void {
    const cur = agentTeamsStore.getSnapshot();
    const target = cur.teams.find(t => t.id === id);
    if (!target || target.builtin) return;
    persist({ ...cur, teams: cur.teams.filter(t => t.id !== id) });
}

export function newPersonaId(): string {
    return `persona-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
export function newTeamId(): string {
    return `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── Hook ─── */

export function useAgentLab() {
    const userCtx = useContext(UserContext);
    agentLabUserIdHolder.current = userCtx?.user?.id ?? null;
    const state = useSyncExternalStore(
        agentTeamsStore.subscribe,
        agentTeamsStore.getSnapshot,
        agentTeamsStore.getServerSnapshot,
    );
    return { ...state, upsertPersona, deletePersona, upsertTeam, deleteTeam };
}
