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

function withUniqueTags(rows: Array<{ id: string; name: string }>): LinkProperty[] {
    const seen = new Map<string, number>();
    return rows.map(p => {
        const base = propertyTag(p.name);
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        return { id: p.id, name: p.name, tag: n === 1 ? base : `${base}-${n}`, units: [] };
    });
}

export function useLinkProperties(selectedId?: string): {
    properties: LinkProperty[]; unitsFor: (id: string) => string[]; source: 'strata' | 'fallback'; loading: boolean;
} {
    const q = useProperties();
    const rows = Array.isArray(q?.data) ? q.data.filter(p => p && p.id && typeof p.name === 'string') : [];
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
