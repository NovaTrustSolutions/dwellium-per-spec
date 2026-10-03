/**
 * Plan 077 phase 4 support modules: linkProperties + doorSheetLink.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const q = vi.hoisted(() => ({
    props: { data: undefined as unknown, isLoading: false, isError: false },
    units: { data: undefined as unknown },
    unitsArg: [] as Array<string | undefined>,
}));
vi.mock('../components/StrataDashboard/useStrataQueries', () => ({
    useProperties: () => q.props,
    useUnits: (id?: string) => { q.unitsArg.push(id); return q.units; },
}));

import { propertyTag, useLinkProperties } from '../components/ShortLinks/linkProperties';
import { ANDY_PROPERTIES } from '../components/ShortLinks/andyLinkPresets';
import { DOOR_SHEET_EVENT, openDoorSheet, parseDoorSheetRequest, takeDoorSheetRequest } from '../components/ShortLinks/doorSheetLink';
import { takePendingDeepLink } from '../lib/pendingDeepLink';

beforeEach(() => {
    q.props = { data: undefined, isLoading: false, isError: false };
    q.units = { data: undefined };
    q.unitsArg = [];
    takePendingDeepLink('short-links');
});
afterEach(() => vi.restoreAllMocks());

describe('propertyTag', () => {
    it('lowercases and collapses punctuation/spaces', () => {
        expect(propertyTag('Woodland Parc Townhomes')).toBe('woodland-parc-townhomes');
        expect(propertyTag("  St. Mary's -- Court!! ")).toBe('st-mary-s-court');
    });
    it('drops non-ascii letters', () => {
        expect(propertyTag('Café Éclair 12')).toBe('caf-clair-12');
    });
    it("is 'property' when nothing is left", () => {
        for (const s of ['', '   ', '!!!', '日本語']) expect(propertyTag(s)).toBe('property');
    });
    it('caps at 40 chars with no trailing dash', () => {
        const t = propertyTag('a'.repeat(39) + ' bbbbbbbb');
        expect(t.length).toBeLessThanOrEqual(40);
        expect(t.endsWith('-')).toBe(false);
        expect(propertyTag('x'.repeat(80))).toBe('x'.repeat(40));
    });
});

describe('useLinkProperties', () => {
    it('uses Strata properties with tags and de-duplicates colliding tags', () => {
        q.props = { data: [
            { id: 'p1', name: 'Oak Park' }, { id: 'p2', name: 'Oak  Park!' }, { id: 'p3', name: 'oak-park' }, { id: 'p4', name: 'Elm' },
        ], isLoading: false, isError: false };
        const { result } = renderHook(() => useLinkProperties());
        expect(result.current.source).toBe('strata');
        expect(result.current.loading).toBe(false);
        const tags = result.current.properties.map(p => p.tag);
        expect(tags[3]).toBe('elm');
        expect(new Set(tags).size).toBe(4); // all distinct
        expect(tags.slice(0, 3).every(t => /^oak-park-[0-9a-f]{6}$/.test(t))).toBe(true); // every colliding one carries an id suffix, never a bare -2
        expect(result.current.properties[0]).toMatchObject({ id: 'p1', name: 'Oak Park', units: [] });
    });
    it('tags never collide with another property\'s real name and do not depend on list order', () => {
        const rows = [{ id: 'a', name: 'Oak Park' }, { id: 'b', name: 'Oak Park' }, { id: 'c', name: 'Oak Park 2' }];
        q.props = { data: rows, isLoading: false, isError: false };
        const first = renderHook(() => useLinkProperties()).result.current.properties.map(p => [p.id, p.tag]);
        q.props = { data: [...rows].reverse(), isLoading: false, isError: false };
        const second = renderHook(() => useLinkProperties()).result.current.properties.map(p => [p.id, p.tag]);
        expect(new Set(first.map(x => x[1])).size).toBe(3);
        expect(first.find(x => x[0] === 'c')![1]).toBe('oak-park-2'); // the real "Oak Park 2" keeps its own tag
        expect(Object.fromEntries(second)).toEqual(Object.fromEntries(first)); // same tags whatever the order
    });
    it('leaves out archived/inactive properties and blank names', () => {
        q.props = { data: [{ id: 'x', name: 'Live' }, { id: 'y', name: 'Old', status: 'archived' }, { id: 'z', name: 'Dark', status: 'inactive' }, { id: 'w', name: '   ' }], isLoading: false, isError: false };
        const { result } = renderHook(() => useLinkProperties());
        expect(result.current.properties.map(p => p.id)).toEqual(['x']);
    });
    it('is the fallback list and loading while the query loads', () => {
        q.props = { data: undefined, isLoading: true, isError: false };
        const { result } = renderHook(() => useLinkProperties());
        expect(result.current).toMatchObject({ source: 'fallback', loading: true, properties: ANDY_PROPERTIES });
    });
    it('falls back on error and on empty data', () => {
        q.props = { data: undefined, isLoading: false, isError: true };
        expect(renderHook(() => useLinkProperties()).result.current).toMatchObject({ source: 'fallback', loading: false, properties: ANDY_PROPERTIES });
        q.props = { data: [], isLoading: false, isError: false };
        expect(renderHook(() => useLinkProperties()).result.current).toMatchObject({ source: 'fallback', loading: false });
    });
    it('does not throw on undefined or non-array hook results', () => {
        q.props = { data: { nope: 1 }, isLoading: false, isError: false };
        q.units = undefined as never;
        expect(() => renderHook(() => useLinkProperties('p1'))).not.toThrow();
    });
    it('does not flip back to loading once Strata answered (refetch)', () => {
        q.props = { data: [{ id: 'p1', name: 'Oak' }], isLoading: false, isError: false };
        const { result, rerender } = renderHook(() => useLinkProperties());
        q.props = { data: [{ id: 'p1', name: 'Oak' }], isLoading: true, isError: false };
        rerender();
        expect(result.current).toMatchObject({ source: 'strata', loading: false });
    });
    it('unitsFor returns naturally sorted Strata unit numbers for the selected id', () => {
        q.props = { data: [{ id: 'p1', name: 'Oak' }, { id: 'p2', name: 'Elm' }], isLoading: false, isError: false };
        q.units = { data: [{ unitNumber: 'A10' }, { unitNumber: 'B03' }, { unitNumber: 'A2' }, { unitNumber: '' }, { unitNumber: '101' }] };
        const { result } = renderHook(() => useLinkProperties('p1'));
        expect(result.current.unitsFor('p1')).toEqual(['A2', 'B03', 'A10', '101']);
        expect(result.current.unitsFor('p2')).toEqual([]);
        expect(q.unitsArg[q.unitsArg.length - 1]).toBe('p1');
    });
    it('unitsFor serves fallback units and never queries Strata units in fallback mode', () => {
        const { result } = renderHook(() => useLinkProperties(ANDY_PROPERTIES[0].id));
        expect(result.current.unitsFor(ANDY_PROPERTIES[0].id)).toEqual(ANDY_PROPERTIES[0].units);
        expect(result.current.unitsFor('nope')).toEqual([]);
        expect(q.unitsArg.every(a => a === undefined)).toBe(true);
    });
});

describe('doorSheetLink', () => {
    const req = { propertyId: 'p1', propertyName: 'Oak Park', units: ['A2', 'B3'] };
    it('openDoorSheet sets the pending slot, dispatches the event and opens the widget', () => {
        const seen: Array<{ name: string; detail: unknown }> = [];
        const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((e: Event) => {
            seen.push({ name: e.type, detail: (e as CustomEvent).detail }); return true;
        });
        openDoorSheet(req);
        spy.mockRestore();
        expect(seen.find(s => s.name === DOOR_SHEET_EVENT)?.detail).toEqual(req);
        const open = seen.find(s => s.name === 'dwellium:open-widget');
        expect((open?.detail as { widgetId: string }).widgetId).toBe('short-links');
        expect(takeDoorSheetRequest()).toEqual(req);
    });
    it('takeDoorSheetRequest is one-shot', () => {
        openDoorSheet({ propertyId: 'p1', propertyName: 'Oak Park' });
        expect(takeDoorSheetRequest()).toEqual({ propertyId: 'p1', propertyName: 'Oak Park' });
        expect(takeDoorSheetRequest()).toBeNull();
    });
    it('returns null with nothing pending', () => { expect(takeDoorSheetRequest()).toBeNull(); });
    it('malformed pending JSON, missing fields or empty units → null', async () => {
        const { setPendingDeepLink } = await import('../lib/pendingDeepLink');
        for (const bad of ['{not json', '{}', '[]', 'null', '{"propertyId":"p","propertyName":""}',
            '{"propertyId":"p","propertyName":"n","units":["a",""]}', '{"propertyId":"p","propertyName":"n","units":"a"}']) {
            setPendingDeepLink('short-links', bad);
            expect(takeDoorSheetRequest(), bad).toBeNull();
        }
    });
    it('parseDoorSheetRequest validates event details', () => {
        expect(parseDoorSheetRequest(req)).toEqual(req);
        expect(parseDoorSheetRequest({ propertyId: 'p', propertyName: 'n', extra: 1 })).toEqual({ propertyId: 'p', propertyName: 'n' });
        for (const bad of [undefined, null, 'x', 3, { propertyId: 1, propertyName: 'n' }, { propertyId: 'p' }, { propertyId: 'p', propertyName: 'n', units: [''] }, { propertyId: 'p', propertyName: 'n', units: [1] }]) {
            expect(parseDoorSheetRequest(bad)).toBeNull();
        }
    });
});

describe('doorSheetLink — units: [] means the whole roster', () => {
    it('drops an empty units array instead of pinning an empty roster', () => {
        expect(parseDoorSheetRequest({ propertyId: 'p', propertyName: 'P', units: [] })).toEqual({ propertyId: 'p', propertyName: 'P' });
    });
});
