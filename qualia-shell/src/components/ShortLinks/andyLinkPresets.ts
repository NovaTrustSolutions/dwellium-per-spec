/**
 * andyLinkPresets — Andy's Georgia-multifamily defaults for Links & QR (plan 053).
 *
 * EDIT HERE: this file is the single source for the widget's property list,
 * per-property tags, seeded unit rosters and the four one-click link presets.
 * No hardcoded UUIDs — everything keys on tag names, which the backend creates
 * at Dub on first use (POST /links with tagNames auto-creates missing tags).
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

/** Base URL the presets point at — the running Dwellium deployment itself. */
const APP_BASE = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://argyleholocron.netlify.app';

export interface AndyLinkPreset {
    id: string;
    label: string;
    /** Destination URL — edit to point at AppFolio portal / bank pay page etc. */
    url: string;
    /** Appended to the property tag to build the short-link key, e.g. woodland-parc-portal. */
    keySuffix: string;
    /** Kind tag applied alongside the property tag. */
    kindTag: string;
}

export const ANDY_LINK_PRESETS: AndyLinkPreset[] = [
    { id: 'resident-portal', label: 'Resident portal', url: `${APP_BASE}/`, keySuffix: 'portal', kindTag: 'resident-portal' },
    { id: 'maintenance', label: 'Maintenance request', url: `${APP_BASE}/?request=maintenance`, keySuffix: 'maint', kindTag: 'maintenance' },
    { id: 'rent-payment', label: 'Rent payment', url: `${APP_BASE}/?pay=rent`, keySuffix: 'rent', kindTag: 'rent-payment' },
    { id: 'current-notice', label: 'Current notice', url: `${APP_BASE}/?notice=current`, keySuffix: 'notice', kindTag: 'notice' },
];

/** Default door-sheet destination pattern — {unit} is replaced per unit. */
export const DOOR_SHEET_DEFAULT_PATTERN = `${APP_BASE}/?request=maintenance&unit={unit}`;

/** Short-link key for a preset on a property, e.g. "riverwood-club-rent". */
export function presetKey(property: AndyProperty, preset: AndyLinkPreset): string {
    return `${property.tag}-${preset.keySuffix}`;
}

/** Sanitize an arbitrary unit label into a Dub key segment. */
export function unitKey(propertyTag: string, unit: string): string {
    return `${propertyTag}-${unit}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
