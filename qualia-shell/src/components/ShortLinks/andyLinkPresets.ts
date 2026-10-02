/**
 * andyLinkPresets — Andy's Georgia-multifamily defaults for Links & QR (plan 053).
 *
 * EDIT HERE: this file is the single source for the widget's property list,
 * per-property tags, seeded unit rosters and the four one-click link presets.
 * No hardcoded UUIDs — everything keys on tag names, which the backend creates
 * at Dub on first use (POST /links with tagNames auto-creates missing tags).
 *
 * Link destinations are NOT stored here and nothing points at the Dwellium app
 * itself any more: the user enters each property's destination URLs in the
 * widget (external pages, set up later) and they live in widget memory
 * (plan 077 Q1). A preset or door sheet stays disabled until its URL is set.
 *
 * Unit rosters are seeded from the Strata/AppFolio-derived labels that exist
 * in this repo today (fixtures/appfolioDerived + LeasingModule guest cards) —
 * paste the full roster into the door-sheet textarea (or extend the arrays
 * below) when printing a whole building.
 */

export interface AndyProperty {
    id: string;
    name: string;
    /** Dub tag name applied to every link minted for this property. */
    tag: string;
    /** Seed unit labels for the QR door sheet (editable in the UI). */
    units: string[];
}

export const ANDY_PROPERTIES: AndyProperty[] = [
    {
        id: 'woodland-parc',
        name: 'Woodland Parc Townhomes',
        tag: 'woodland-parc',
        // Strata-derived: guest cards reference unit 2794-5 (LeasingModule.tsx).
        units: ['2794-5'],
    },
    {
        id: 'riverwood-club',
        name: 'Riverwood Club Apartments',
        tag: 'riverwood-club',
        // Strata-derived: occupancy B03 + compliance D14/H12 + guest card H15.
        units: ['B03', 'D14', 'H12', 'H15'],
    },
];

export type PresetId = 'resident-portal' | 'maintenance' | 'rent-payment' | 'current-notice';

export interface AndyLinkPreset {
    id: PresetId;
    label: string;
    /** Appended to the property tag to build the short-link key, e.g. woodland-parc-portal. */
    keySuffix: string;
    /** Kind tag applied alongside the property tag. */
    kindTag: string;
}

export const ANDY_LINK_PRESETS: AndyLinkPreset[] = [
    { id: 'resident-portal', label: 'Resident portal', keySuffix: 'portal', kindTag: 'resident-portal' },
    { id: 'maintenance', label: 'Maintenance request', keySuffix: 'maint', kindTag: 'maintenance' },
    { id: 'rent-payment', label: 'Rent payment', keySuffix: 'rent', kindTag: 'rent-payment' },
    { id: 'current-notice', label: 'Current notice', keySuffix: 'notice', kindTag: 'notice' },
];

/** Per-property destination URLs the user enters once; empty until they do. */
export type PropertyDestinations = Partial<Record<PresetId, string>>;
/** Keyed by AndyProperty.id. */
export type DestinationsMemory = Record<string, PropertyDestinations>;

export const HTTP_URL_RE = /^https?:\/\/\S+$/i;

/** Trimmed destination for a preset on a property, or null when unset/invalid. */
export function presetUrl(destinations: DestinationsMemory | undefined, propertyId: string, presetId: PresetId): string | null {
    const url = destinations?.[propertyId]?.[presetId]?.trim();
    return url && HTTP_URL_RE.test(url) ? url : null;
}

/** Short-link key for a preset on a property, e.g. "riverwood-club-rent". */
export function presetKey(property: AndyProperty, preset: AndyLinkPreset): string {
    return `${property.tag}-${preset.keySuffix}`;
}

/** Sanitize an arbitrary unit label into a Dub key segment. */
export function unitKey(propertyTag: string, unit: string): string {
    return `${propertyTag}-${unit}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
