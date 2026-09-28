/**
 * Plan 072 E2 — the pre-per-user device-wide KG keys are adopted by ONE signed-in
 * account at most; later new accounts on the same browser start from defaults
 * (previously every new account inherited them and One Save migrate() uploaded them).
 * Plus removeKgProject (Phase 2 contract).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
    DEFAULT_KG_PROJECTS,
    halocronKnowledgeGraphStore,
    removeKgProject,
    setKgActiveProject,
    upsertKgProject,
} from '../lib/halocronKnowledgeGraphStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';

const legacyProject = { id: 'gh-owner-private', name: 'Private', lang: 'TS', files: 9, clusters: 1, blurb: 'A' };

function seedLegacy() {
    localStorage.setItem('dwellium:kg-projects', JSON.stringify([legacyProject]));
    localStorage.setItem('dwellium:kg-active-project', legacyProject.id);
}

function loadAs(uid: string | null) {
    setPerUserIdentity(uid);
    halocronKnowledgeGraphStore.reset();
    return halocronKnowledgeGraphStore.getSnapshot();
}

describe('KG legacy-key adoption (E2)', () => {
    beforeEach(() => { localStorage.clear(); });

    it('the first signed-in account adopts the legacy tabs and keeps them; the device copy is never deleted', () => {
        seedLegacy();
        expect(loadAs('user-a').extras.map((p) => p.id)).toEqual([legacyProject.id]);
        expect(localStorage.getItem('dwellium:kg-projects')).not.toBeNull();
        expect(localStorage.getItem('dwellium:kg:user-a')).toContain(legacyProject.id);
        expect(loadAs('user-a').extras.map((p) => p.id)).toEqual([legacyProject.id]); // survives reload
    });

    it('a second new account on the same browser gets defaults, not A\'s tabs', () => {
        seedLegacy();
        loadAs('user-a');
        const b = loadAs('user-b');
        expect(b.extras).toEqual([]);
        expect(b.activeId).toBe(DEFAULT_KG_PROJECTS[0].id);
    });

    it('a corrupt legacy blob does not lock adoption out (flag set only after a good parse)', () => {
        localStorage.setItem('dwellium:kg-projects', '{not json');
        expect(loadAs('user-a').extras).toEqual([]);
        expect(localStorage.getItem('dwellium:kg-legacy-migrated')).toBeNull();
        seedLegacy();
        expect(loadAs('user-c').extras.map((p) => p.id)).toEqual([legacyProject.id]);
    });

    it('a signed-out read never claims (or deletes) the legacy tabs', () => {
        seedLegacy();
        expect(loadAs(null).extras).toEqual([]);
        expect(localStorage.getItem('dwellium:kg-projects')).not.toBeNull();
        expect(loadAs('user-a').extras.map((p) => p.id)).toEqual([legacyProject.id]);
    });
});

describe('removeKgProject', () => {
    beforeEach(() => { localStorage.clear(); loadAs('user-r'); });

    it('drops the tab and its graph, and moves off it when it was active', () => {
        const graph = { files: 1, edges: 0, clusters: 1, tokens: 0, usdPerSession: 0, importantFiles: [], nodes: [], links: [], builtAt: '2026-09-28T00:00:00Z' };
        upsertKgProject({ id: 'gh-x', name: 'X', lang: 'TS', files: 1, clusters: 1, blurb: '' }, graph);
        expect(halocronKnowledgeGraphStore.getSnapshot().activeId).toBe('gh-x');
        removeKgProject('gh-x');
        const s = halocronKnowledgeGraphStore.getSnapshot();
        expect(s.extras).toEqual([]);
        expect(s.graphs['gh-x']).toBeUndefined();
        expect(s.activeId).toBe(DEFAULT_KG_PROJECTS[0].id);
    });

    it('never removes a shipped default tab', () => {
        setKgActiveProject('codex');
        removeKgProject('codex');
        expect(halocronKnowledgeGraphStore.getSnapshot().activeId).toBe('codex');
    });
});
