/**
 * penpotTemplates — Andy's brand-kit starter templates (plan 053).
 *
 * The SVGs live in `public/design-templates/` (served statically); Penpot
 * imports SVG natively, so "import" = drag the downloaded file onto a Penpot
 * canvas. All property names / rents / contacts inside the SVGs are example
 * text explicitly marked "example — replace" (Woodland Parc Townhomes /
 * Riverwood Club Apartments are the plan-047 fixture properties).
 */

export interface PenpotTemplate {
    id: string;
    name: string;
    /** Static path under public/ — also the download href. */
    file: string;
    /** Human page size note. */
    size: string;
    /** What Andy uses it for. */
    use: string;
}

export const PENPOT_TEMPLATES: ReadonlyArray<PenpotTemplate> = [
    {
        id: 'property-flyer',
        name: 'Property flyer',
        file: '/design-templates/property-flyer.svg',
        size: 'US Letter · screen or print',
        use: 'Listing flyer with a photo slot, rent block and amenities — dark Dwellium header, lime rent chip.',
    },
    {
        id: 'late-rent-notice',
        name: 'Late-rent notice',
        file: '/design-templates/late-rent-notice.svg',
        size: 'US Letter · print-friendly light',
        use: 'Past-due rent courtesy reminder with an amounts table. Neutral Georgia placeholder wording — have counsel review before sending.',
    },
    {
        id: 'inspection-notice',
        name: 'Inspection notice',
        file: '/design-templates/inspection-notice.svg',
        size: 'US Letter · print-friendly light',
        use: 'Notice of scheduled entry/inspection keyed to the lease notice clause, with purpose checkboxes and a vendor line.',
    },
    {
        id: 'move-in-checklist',
        name: 'Move-in checklist',
        file: '/design-templates/move-in-checklist.svg',
        size: 'US Letter · print-friendly light',
        use: 'Room-by-room move-in condition list, shaped for the Georgia security-deposit move-in list (O.C.G.A. §44-7-33).',
    },
    {
        id: 'owner-report-cover',
        name: 'Owner report cover',
        file: '/design-templates/owner-report-cover.svg',
        size: 'US Letter · dark Dwellium look',
        use: 'Monthly owner-report cover page with period, prepared-for and a contents chip list.',
    },
];

/** Shared import steps rendered on the Templates tab (Penpot imports SVG directly). */
export const PENPOT_IMPORT_STEPS: ReadonlyArray<string> = [
    'Download the template below.',
    'In Penpot (Studio tab), create or open a file in the Dwellium team.',
    'Drag the downloaded .svg onto the canvas — Penpot imports SVG natively as editable vectors.',
    'Replace every text marked “example — replace” with the real property details, then save it to the Dwellium Brand library for reuse.',
];
