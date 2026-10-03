/**
 * linkProperties — the widget's property list: Strata when it has any, the
 * hardcoded Andy list otherwise (plan 077 phase 4). Units load lazily for the
 * one selected property.
 */
import { useCallback, useMemo } from 'react';
import { useProperties, useUnits } from '../StrataDashboard/useStrataQueries';
import { ANDY_PROPERTIES } from './andyLinkPresets';

export interface LinkProperty { id: string; name: string; tag: string; units: string[] }

/** Short-link tag/key segment for a property name. */
export function propertyTag(name: string): string {
    const t = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
    return t || 'property';
}

// Same ordering PropertiesModule's turn board uses: numeric part, then text.
const num = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0;
const naturalSort = (a: string, b: string) => num(a) - num(b) || a.localeCompare(b);

/** Six hex chars of the property id — a suffix that cannot collide with another property's NAME-derived tag. */
function idSuffix(id: string): string {
    let h = 5381; for (const ch of id) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
    return h.toString(16).padStart(8, '0').slice(-6); // low bits: short ids like 'p1'/'p2' differ only there
}
/**
 * Tags are short-link key namespaces (door keys `<tag>-unit-<n>`, presets `<tag>-<suffix>`), so two
 * properties must never share one and a property's tag must not move when the list is reordered:
 * a duplicate name gets an id-derived suffix (never a positional `-2`, which another property called
 * "Oak Park 2" would legitimately own). The id makes it order-independent by construction.
 */
function withUniqueTags(rows: Array<{ id: string; name: string }>): LinkProperty[] {
    const bases = new Map<string, number>();
    for (const p of rows) bases.set(propertyTag(p.name), (bases.get(propertyTag(p.name)) ?? 0) + 1);
    const taken = new Set<string>();
    return rows.map(p => {
        const base = propertyTag(p.name);
        let tag = base;
        if ((bases.get(base) ?? 0) > 1 || taken.has(tag)) {
            tag = `${base.slice(0, 33)}-${idSuffix(p.id)}`;
            for (let n = 2; taken.has(tag); n++) tag = `${base.slice(0, 31)}-${idSuffix(p.id)}-${n}`; // ponytail: a 24-bit hash collision between two same-named properties
        }
        taken.add(tag);
        return { id: p.id, name: p.name, tag, units: [] };
    });
}

export function useLinkProperties(selectedId?: string): {
    properties: LinkProperty[]; unitsFor: (id: string) => string[]; source: 'strata' | 'fallback'; loading: boolean;
} {
    const q = useProperties();
    // Archived / inactive properties get no door sheets; a blank name reads as unset (the picker needs text).
    const rows = Array.isArray(q?.data) ? q.data.filter(p => p && p.id && typeof p.name === 'string' && p.name.trim() && p.status !== 'archived' && p.status !== 'inactive') : [];
    const source = rows.length > 0 ? 'strata' : 'fallback';
    // Fallback ids are not Strata ids: never ask Strata for their units.
    const u = useUnits(source === 'strata' ? selectedId : undefined);
    const unitRows = u?.data;
    const properties = useMemo(() => (source === 'strata' ? withUniqueTags(rows) : ANDY_PROPERTIES),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [source, q?.data]);
    const unitsFor = useCallback((id: string): string[] => {
        if (source === 'strata' && id === selectedId && Array.isArray(unitRows)) {
            return unitRows.map(x => String(x?.unitNumber ?? '')).filter(Boolean).sort(naturalSort);
        }
        return ANDY_PROPERTIES.find(p => p.id === id)?.units ?? [];
    }, [source, selectedId, unitRows]);
    // ponytail: react-query's isLoading is first-fetch-only, so it cannot flip back once Strata answered.
    return { properties, unitsFor, source, loading: source === 'fallback' && !!q?.isLoading };
}
