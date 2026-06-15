/**
 * agentTeamsStore — personas + teams CRUD, built-in protection, and the
 * defaults-merge (user customs persist; built-ins always present).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    agentTeamsStore,
    agentLabUserIdHolder,
    upsertPersona,
    deletePersona,
    upsertTeam,
    deleteTeam,
    newPersonaId,
    newTeamId,
} from '../lib/agents/agentTeamsStore';
import { DEFAULT_PERSONAS, DEFAULT_TEAMS, HERMES_PERSONA_IDS, defaultDossier, type Persona, type AgentTeam } from '../lib/agents/personas';

beforeEach(() => {
    agentLabUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
});

describe('agentTeamsStore', () => {
    it('seeds the built-in personas + teams', () => {
        const s = agentTeamsStore.getSnapshot();
        expect(s.personas.length).toBeGreaterThanOrEqual(DEFAULT_PERSONAS.length);
        expect(s.teams.length).toBeGreaterThanOrEqual(DEFAULT_TEAMS.length);
        expect(s.personas.find(p => p.id === 'researcher')).toBeTruthy();
        expect(s.teams.find(t => t.id === 'research-squad')).toBeTruthy();
        expect(HERMES_PERSONA_IDS.every(id => s.personas.some(p => p.id === id))).toBe(true);
        expect(new Set(HERMES_PERSONA_IDS.map(id => s.personas.find(p => p.id === id)?.preferredModel?.provider)).size).toBe(5);
    });

    it('adds a custom persona and keeps built-ins', () => {
        const p: Persona = { id: newPersonaId(), name: 'Pentester', discipline: 'engineering', icon: 'bot', color: '#f00', tagline: 'breaks things', systemPrompt: 'You probe for weaknesses.' };
        upsertPersona(p);
        const s = agentTeamsStore.getSnapshot();
        expect(s.personas.find(x => x.id === p.id)?.name).toBe('Pentester');
        expect(s.personas.find(x => x.id === 'researcher')).toBeTruthy();
    });

    it('protects built-in personas from deletion but deletes customs', () => {
        deletePersona('researcher');
        expect(agentTeamsStore.getSnapshot().personas.find(p => p.id === 'researcher')).toBeTruthy();
        const p: Persona = { id: newPersonaId(), name: 'Temp', discipline: 'general', icon: 'bot', color: '#0f0', tagline: 't', systemPrompt: 'x' };
        upsertPersona(p);
        deletePersona(p.id);
        expect(agentTeamsStore.getSnapshot().personas.find(x => x.id === p.id)).toBeFalsy();
    });

    it('creates a team and drops a deleted member from it', () => {
        const p: Persona = { id: newPersonaId(), name: 'Aux', discipline: 'data', icon: 'bot', color: '#00f', tagline: 't', systemPrompt: 'x' };
        upsertPersona(p);
        const t: AgentTeam = { id: newTeamId(), name: 'My Team', icon: 'users', memberIds: ['researcher', p.id], orchestratorId: 'orchestrator' };
        upsertTeam(t);
        expect(agentTeamsStore.getSnapshot().teams.find(x => x.id === t.id)?.memberIds).toContain(p.id);
        deletePersona(p.id);
        expect(agentTeamsStore.getSnapshot().teams.find(x => x.id === t.id)?.memberIds).not.toContain(p.id);
    });

    it('protects built-in teams from deletion', () => {
        deleteTeam('research-squad');
        expect(agentTeamsStore.getSnapshot().teams.find(t => t.id === 'research-squad')).toBeTruthy();
    });

    it('persists customs across a cache reset (re-read from storage)', () => {
        const p: Persona = { id: newPersonaId(), name: 'Persistent', discipline: 'comms', icon: 'bot', color: '#abc', tagline: 't', systemPrompt: 'x' };
        upsertPersona(p);
        (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
        expect(agentTeamsStore.getSnapshot().personas.find(x => x.id === p.id)?.name).toBe('Persistent');
    });

    it('merges new built-ins even when One Save hydrates an older payload directly', () => {
        agentTeamsStore.set({ personas: [], teams: [] }, () => {});
        const snapshot = agentTeamsStore.getSnapshot();
        expect(HERMES_PERSONA_IDS.every(id => snapshot.personas.some(p => p.id === id))).toBe(true);
        expect(snapshot.teams.some(t => t.id === 'research-squad')).toBe(true);
    });

    it('defaultDossier seeds every editable section', () => {
        const d = defaultDossier(DEFAULT_PERSONAS[1]);
        expect(d.identity.length).toBeGreaterThanOrEqual(5);
        expect(d.traits.length).toBeGreaterThan(0);
        expect(d.tags.length).toBe(4);
        expect(d.metrics.length).toBe(3);
        expect(d.channels.length).toBe(3);
        expect(d.notes.length).toBe(2);
    });

    it('persists an edited persona dossier across a cache reset (built-in override)', () => {
        const base = DEFAULT_PERSONAS.find(p => p.id === 'researcher')!;
        const dossier = defaultDossier(base);
        dossier.identity[0].value = 'Edited Alias';
        dossier.channels[0].pct = 42;
        dossier.notes[0].body = 'Custom operator note';
        upsertPersona({ ...base, dossier });
        (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
        const stored = agentTeamsStore.getSnapshot().personas.find(p => p.id === 'researcher');
        expect(stored?.dossier?.identity[0].value).toBe('Edited Alias');
        expect(stored?.dossier?.channels[0].pct).toBe(42);
        expect(stored?.dossier?.notes[0].body).toBe('Custom operator note');
    });
});
