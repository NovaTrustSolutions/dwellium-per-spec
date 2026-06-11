/**
 * araSpawn — Phase-10 Task 10.2 (A1): spawn-command parsing + catalog
 * resolution + the dwelliumCommands integration that routes "spawn research
 * squad on X" to an ARA-hosted orchestrator run via `dwellium:ara-spawn`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    parseSpawn,
    resolveSpawnTarget,
    requestSpawn,
    consumePendingSpawn,
    ARA_SPAWN_EVENT,
    type SpawnRequest,
} from '../lib/agents/spawn';
import { agentTeamsStore, agentLabUserIdHolder, upsertTeam, newTeamId } from '../lib/agents/agentTeamsStore';
import { parseCommand } from '../lib/dwelliumCommands';

beforeEach(() => {
    agentLabUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
    consumePendingSpawn(); // drain the module-level pending slot between tests
});

describe('resolveSpawnTarget', () => {
    it('resolves built-in teams by name, id, and suffix-stripped name', () => {
        expect(resolveSpawnTarget('research squad')).toMatchObject({ kind: 'team', id: 'research-squad' });
        expect(resolveSpawnTarget('research-squad')).toMatchObject({ kind: 'team', id: 'research-squad' });
        expect(resolveSpawnTarget('the research team')).toMatchObject({ kind: 'team', id: 'research-squad' });
        expect(resolveSpawnTarget('Deal Desk')).toMatchObject({ kind: 'team', id: 'deal-desk' });
        expect(resolveSpawnTarget('build team')).toMatchObject({ kind: 'team', id: 'build-team' });
    });

    it('resolves built-in personas by name and id', () => {
        expect(resolveSpawnTarget('researcher')).toMatchObject({ kind: 'persona', id: 'researcher' });
        expect(resolveSpawnTarget('the data analyst')).toMatchObject({ kind: 'persona', id: 'data-analyst' });
        expect(resolveSpawnTarget('legal analyst')).toMatchObject({ kind: 'persona', id: 'legal-analyst' });
    });

    it('resolves user-created teams', () => {
        upsertTeam({ id: newTeamId(), name: 'Pricing Crew', icon: 'users', memberIds: ['researcher'], orchestratorId: 'orchestrator' });
        expect(resolveSpawnTarget('pricing crew')).toMatchObject({ kind: 'team', name: 'Pricing Crew' });
        expect(resolveSpawnTarget('pricing')).toMatchObject({ kind: 'team', name: 'Pricing Crew' });
    });

    it('returns null for unknown targets', () => {
        expect(resolveSpawnTarget('tests')).toBeNull();
        expect(resolveSpawnTarget('a new tab')).toBeNull();
        expect(resolveSpawnTarget('')).toBeNull();
    });
});

describe('parseSpawn', () => {
    it('parses "spawn <team> on <goal>"', () => {
        const r = parseSpawn('spawn research squad on competitive pricing in austin');
        expect(r).toMatchObject({ kind: 'team', id: 'research-squad', goal: 'competitive pricing in austin' });
    });

    it('parses "run a deal desk analysis of <goal>"', () => {
        const r = parseSpawn('run a deal desk analysis of the hilltop acquisition');
        expect(r).toMatchObject({ kind: 'team', id: 'deal-desk', goal: 'the hilltop acquisition' });
    });

    it('parses "solo <persona> on <goal>" (personas only)', () => {
        expect(parseSpawn('solo researcher on solar incentives')).toMatchObject({
            kind: 'persona', id: 'researcher', goal: 'solar incentives',
        });
        // solo is a solo-run verb — a team after "solo" does not spawn
        expect(parseSpawn('solo research squad on x')).toBeNull();
    });

    it('parses "have the <persona> look into <goal>"', () => {
        expect(parseSpawn('have the engineer look into the flaky tests')).toMatchObject({
            kind: 'persona', id: 'engineer', goal: 'the flaky tests',
        });
    });

    it('keeps goals containing "and" intact', () => {
        const r = parseSpawn('spawn build team on caching and bundle size');
        expect(r?.goal).toBe('caching and bundle size');
    });

    it('returns null when the target does not resolve (falls through to chat)', () => {
        expect(parseSpawn('run tests on the build')).toBeNull();
        expect(parseSpawn('spawn a new tab on the right')).toBeNull();
    });

    it('returns null without a goal (bare spawns stay with Agent Lab rule)', () => {
        expect(parseSpawn('spawn research squad')).toBeNull();
        expect(parseSpawn('spawn agents')).toBeNull();
    });
});

describe('parseCommand spawn integration', () => {
    it('routes spawn imperatives ahead of compound-split and widget-open', () => {
        const cmd = parseCommand('spawn research squad on rent comps and vacancy trends');
        expect(cmd?.label).toBe('Spawn Research Squad → rent comps and vacancy trends');
    });

    it('strips politeness before matching', () => {
        const cmd = parseCommand('Hey ARA, could you spawn the deal desk on the Maple St offer please?');
        expect(cmd?.label).toMatch(/^Spawn Deal Desk → /);
    });

    it('run() opens ARA and dispatches the spawn event with the request', () => {
        const events: Array<{ name: string; detail: unknown }> = [];
        const spy = (name: string) => (ev: Event) => events.push({ name, detail: (ev as CustomEvent).detail });
        const onOpen = spy('open');
        const onSpawn = spy('spawn');
        window.addEventListener('dwellium:open-widget', onOpen);
        window.addEventListener(ARA_SPAWN_EVENT, onSpawn);
        try {
            parseCommand('spawn research squad on midtown comps')?.run();
        } finally {
            window.removeEventListener('dwellium:open-widget', onOpen);
            window.removeEventListener(ARA_SPAWN_EVENT, onSpawn);
        }
        expect(events.find(e => e.name === 'open')?.detail).toMatchObject({ widgetId: 'ara-console' });
        expect(events.find(e => e.name === 'spawn')?.detail).toMatchObject({
            kind: 'team', id: 'research-squad', goal: 'midtown comps',
        });
    });

    it('bare "spawn agents" still opens the Agent Lab (pre-existing rule)', () => {
        expect(parseCommand('spawn agents')?.label).toBe('Open Agent Lab');
    });

    it('non-spawn commands are untouched (regression)', () => {
        expect(parseCommand('open strata')?.label.toLowerCase()).toContain('strata');
        expect(parseCommand('dark mode')?.label).toBe('Theme → dark');
    });
});

describe('pending-slot (⌘K → ARA mount race)', () => {
    it('requestSpawn stores the request for a late-mounting ARA, one-shot', () => {
        const req: SpawnRequest = { kind: 'team', id: 'research-squad', name: 'Research Squad', goal: 'x' };
        requestSpawn(req);
        expect(consumePendingSpawn()).toEqual(req);
        expect(consumePendingSpawn()).toBeNull();
    });

    it('requestSpawn also dispatches the live event', () => {
        const handler = vi.fn();
        window.addEventListener(ARA_SPAWN_EVENT, handler);
        try {
            requestSpawn({ kind: 'persona', id: 'researcher', name: 'Researcher', goal: 'y' });
        } finally {
            window.removeEventListener(ARA_SPAWN_EVENT, handler);
        }
        expect(handler).toHaveBeenCalledTimes(1);
    });
});
