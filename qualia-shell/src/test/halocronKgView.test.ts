/**
 * Plan 072 Phase 0 — the Knowledge Graph widget's `view` ('knowledge' = the user's
 * own graphify graph, 'repos' = code-repo tabs) and the optional graph provenance
 * fields. Old payloads (written before `view` existed) must still load.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
    halocronKnowledgeGraphStore,
    setKgActiveProject,
    setKgView,
    upsertKgProject,
} from '../lib/halocronKnowledgeGraphStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';

const USER = 'user-kg-view';
const KEY = `dwellium:kg:${USER}`;

describe('halocronKnowledgeGraphStore view (plan 072)', () => {
    beforeEach(() => {
        localStorage.clear();
        setPerUserIdentity(USER);
        halocronKnowledgeGraphStore.reset();
    });

    it('defaults to the user\'s own graph', () => {
        expect(halocronKnowledgeGraphStore.getSnapshot().view).toBe('knowledge');
    });

    it('an old payload without `view` loads as knowledge and keeps its data', () => {
        localStorage.setItem(KEY, JSON.stringify({ extras: [], activeId: 'codex', graphs: {} }));
        const snap = halocronKnowledgeGraphStore.getSnapshot();
        expect(snap.view).toBe('knowledge');
        expect(snap.activeId).toBe('codex');
    });

    it('an unknown view value falls back to knowledge', () => {
        localStorage.setItem(KEY, JSON.stringify({ extras: [], activeId: 'hermes', graphs: {}, view: 'bogus' }));
        expect(halocronKnowledgeGraphStore.getSnapshot().view).toBe('knowledge');
    });

    it('setKgView persists, and other writers keep it', () => {
        setKgView('repos');
        expect(halocronKnowledgeGraphStore.getSnapshot().view).toBe('repos');
        expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').view).toBe('repos');
        setKgActiveProject('codex');
        upsertKgProject({ id: 'gh-x', name: 'X', lang: 'TS', files: 3, clusters: 1, blurb: '' });
        expect(halocronKnowledgeGraphStore.getSnapshot().view).toBe('repos');
    });

    it('keeps source/totalFiles on stored graphs', () => {
        const graph = {
            files: 120, edges: 0, clusters: 1, tokens: 0, usdPerSession: 0, importantFiles: [],
            nodes: [], links: [], builtAt: '2026-09-28T00:00:00Z', source: 'github-tree' as const, totalFiles: 4000,
        };
        upsertKgProject({ id: 'gh-y', name: 'Y', lang: 'TS', files: 4000, clusters: 1, blurb: '' }, graph);
        const stored = halocronKnowledgeGraphStore.getSnapshot().graphs['gh-y'];
        expect(stored.source).toBe('github-tree');
        expect(stored.totalFiles).toBe(4000);
    });
});
