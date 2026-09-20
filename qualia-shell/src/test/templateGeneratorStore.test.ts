/**
 * Unit tests for templateGeneratorStore — Cluster C of plan 063
 * (plans/063-template-generator-hardening.md).
 *
 * Store-only (no widget component exists yet — that's Cluster E), so
 * "unmount/remount" from the universalShellPersistence.test.tsx pattern this
 * follows is simulated the same way gridLockStore.test.ts does: reset() drops
 * the in-memory cache so the next getSnapshot() can only see what actually
 * reached localStorage.
 *
 * Cases: default state; set → reset → read returns the stored value;
 * two user ids do not see each other's templates; malformed JSON → default;
 * a malformed template entry is dropped without losing well-formed siblings;
 * dangling activeId repaired to the first template's id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// withSync registers into the shared One Save registry at import time and
// schedules a debounced write-through on every set() — mock the client so no
// real network call fires from these pure-store assertions (mirrors
// universalShellPersistence.test.tsx, this file's named pattern to follow).
vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: true,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));

import {
    TEMPLATE_GENERATOR_KEY,
    createDefaultState,
    setTemplateGeneratorState,
    templateGeneratorStore,
    type TemplateGeneratorState,
} from '../utils/templateGeneratorStore';
import { templateGeneratorUserIdHolder } from '../lib/perUserIdentity';

const ANON_KEY = `${TEMPLATE_GENERATOR_KEY}:_anonymous`;

describe('templateGeneratorStore', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
        templateGeneratorStore.reset(); // clear in-memory cache (standing convention)
        templateGeneratorUserIdHolder.current = null;
    });

    it('defaults to one "Property report" template with empty values/types', () => {
        const state = templateGeneratorStore.getSnapshot();
        expect(state.activeId).toBe('default');
        expect(state.templates).toHaveLength(1);
        expect(state.templates[0]).toMatchObject({ id: 'default', name: 'Property report', values: {}, types: {} });
        expect(state.templates[0].html).toContain('{{title}}');
    });

    it('getServerSnapshot is always the SSR default, regardless of stored state', () => {
        setTemplateGeneratorState({
            templates: [{ id: 'a', name: 'Custom', html: '<p/>', values: {}, types: {} }],
            activeId: 'a',
        });
        expect(templateGeneratorStore.getServerSnapshot()).toEqual(createDefaultState());
    });

    it('set → reset → read returns the stored value', () => {
        const next: TemplateGeneratorState = {
            templates: [{
                id: 'a',
                name: 'Lease notice',
                html: '<p>{{tenant_name}}</p>',
                values: { tenant_name: 'X' },
                types: { tenant_name: 'text' },
            }],
            activeId: 'a',
        };
        setTemplateGeneratorState(next);
        expect(localStorage.getItem(ANON_KEY)).toContain('Lease notice');

        templateGeneratorStore.reset(); // drop in-memory cache — read must come from localStorage alone
        expect(templateGeneratorStore.getSnapshot()).toEqual(next);
    });

    it("isolates one user's templates from another", () => {
        templateGeneratorUserIdHolder.current = 'u-andy';
        setTemplateGeneratorState({
            templates: [{ id: 'a', name: "Andy's template", html: '', values: {}, types: {} }],
            activeId: 'a',
        });
        expect(localStorage.getItem(`${TEMPLATE_GENERATOR_KEY}:u-andy`)).toContain("Andy's template");

        templateGeneratorUserIdHolder.current = 'u-lisa';
        expect(templateGeneratorStore.getSnapshot()).toEqual(createDefaultState());
    });

    it('malformed JSON falls back to the default state', () => {
        templateGeneratorUserIdHolder.current = 'u-andy';
        localStorage.setItem(`${TEMPLATE_GENERATOR_KEY}:u-andy`, '{not json');
        expect(templateGeneratorStore.getSnapshot()).toEqual(createDefaultState());
    });

    it('drops a malformed template entry but keeps its well-formed siblings', () => {
        templateGeneratorUserIdHolder.current = 'u-andy';
        localStorage.setItem(`${TEMPLATE_GENERATOR_KEY}:u-andy`, JSON.stringify({
            templates: [
                { id: 'ok', name: 'Fine', html: '<p/>', values: {}, types: {} },
                { id: 'bad-type', name: 'Bad', html: '<p/>', values: {}, types: { x: 'not-a-vartype' } },
                { name: 'Missing id', html: '<p/>', values: {}, types: {} },
            ],
            activeId: 'ok',
        }));
        const state = templateGeneratorStore.getSnapshot();
        expect(state.templates).toHaveLength(1);
        expect(state.templates[0].id).toBe('ok');
    });

    it('falls back to default when every template entry is malformed', () => {
        templateGeneratorUserIdHolder.current = 'u-andy';
        localStorage.setItem(`${TEMPLATE_GENERATOR_KEY}:u-andy`, JSON.stringify({
            templates: [{ id: 'bad' }],
            activeId: 'bad',
        }));
        expect(templateGeneratorStore.getSnapshot()).toEqual(createDefaultState());
    });

    it('repairs a dangling activeId to the first template id', () => {
        templateGeneratorUserIdHolder.current = 'u-andy';
        localStorage.setItem(`${TEMPLATE_GENERATOR_KEY}:u-andy`, JSON.stringify({
            templates: [{ id: 'first', name: 'First', html: '', values: {}, types: {} }],
            activeId: 'does-not-exist',
        }));
        expect(templateGeneratorStore.getSnapshot().activeId).toBe('first');
    });

    it('notifies subscribers on change and stops after unsubscribe', () => {
        let calls = 0;
        const unsub = templateGeneratorStore.subscribe(() => { calls++; });
        setTemplateGeneratorState(createDefaultState());
        expect(calls).toBe(1);
        unsub();
        setTemplateGeneratorState({ ...createDefaultState(), activeId: 'default' });
        expect(calls).toBe(1); // no further notifications after unsubscribe
    });
});
