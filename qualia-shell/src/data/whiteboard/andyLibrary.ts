/**
 * andyLibrary — plan 053 #4: the Dwellium property-management shape library.
 *
 * Andy runs Georgia multifamily properties (Woodland Parc Townhomes, Riverwood
 * Club Apartments — see StrataDashboard/modules/LeasingModule.tsx fixtures), so
 * the whiteboard ships stamps for his daily work: unit footprints for floor
 * plans, appliance/fixture stamps, damage/maintenance markers for work-order
 * markup, Before/After comparison zones and property label stamps.
 *
 * Shipped as data-in-code: `ANDY_LIBRARY_SPECS` is pure JSON-ish (unit-testable
 * without the Excalidraw runtime); `buildAndyLibrary()` converts the skeletons
 * into real elements via the package's `convertToExcalidrawElements`. Only the
 * lazy Whiteboard chunk imports this module — keep it out of Strata/App code so
 * the Excalidraw bundle stays lazy.
 *
 * The widget seeds these on a user's FIRST open (doc.libraryItems undefined)
 * and re-adds them any time via the "Dwellium shapes" toolbar button.
 */
import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';
import type { LibraryItems } from '@excalidraw/excalidraw/types';

/** Palette: neutral walls, blue fixtures, red damage, amber electrical. */
const WALL = '#868e96';
const FIXTURE = '#1971c2';
const DAMAGE = '#e03131';
const DAMAGE_BG = '#ffc9c9';
const MOLD = '#2f9e44';
const ELECTRIC = '#f08c00';
const LABEL_INK = '#343a40';

type Skeleton = Record<string, unknown>;

export interface AndyLibrarySpec {
    /** Stable LibraryItem id (`dwellium-…`). */
    id: string;
    name: string;
    elements: Skeleton[];
}

const rect = (o: Skeleton): Skeleton => ({ type: 'rectangle', strokeColor: WALL, ...o });
const label = (text: string, fontSize = 12): Skeleton => ({ text, fontSize });

export const ANDY_LIBRARY_SPECS: readonly AndyLibrarySpec[] = [
    /* ── Unit footprints (floor-plan starters) ─────────────────────────── */
    {
        id: 'dwellium-unit-studio',
        name: 'Unit — Studio',
        elements: [
            rect({ x: 0, y: 0, width: 220, height: 160, label: label('STUDIO', 16) }),
            rect({ x: 160, y: 0, width: 60, height: 52, label: label('BATH', 10) }),
            rect({ x: 0, y: 140, width: 80, height: 20, label: label('KIT', 9) }),
        ],
    },
    {
        id: 'dwellium-unit-1br',
        name: 'Unit — 1 BR / 1 BA',
        elements: [
            rect({ x: 0, y: 0, width: 260, height: 180, label: label('1 BED / 1 BATH', 14) }),
            rect({ x: 160, y: 0, width: 100, height: 95, label: label('BED', 11) }),
            rect({ x: 160, y: 95, width: 55, height: 50, label: label('BATH', 9) }),
        ],
    },
    {
        id: 'dwellium-unit-2br',
        name: 'Unit — 2 BR / 2 BA',
        elements: [
            rect({ x: 0, y: 0, width: 320, height: 210, label: label('2 BED / 2 BATH', 14) }),
            rect({ x: 0, y: 0, width: 105, height: 95, label: label('BED 1', 11) }),
            rect({ x: 215, y: 0, width: 105, height: 95, label: label('BED 2', 11) }),
            rect({ x: 0, y: 95, width: 55, height: 50, label: label('BATH 1', 8) }),
            rect({ x: 265, y: 95, width: 55, height: 50, label: label('BATH 2', 8) }),
        ],
    },
    {
        id: 'dwellium-unit-townhome',
        name: 'Unit — Townhome (2 levels)',
        elements: [
            rect({ x: 0, y: 0, width: 240, height: 150, label: label('MAIN LEVEL', 13) }),
            rect({ x: 0, y: 170, width: 240, height: 150, label: label('UPPER LEVEL', 13) }),
            rect({ x: 240, y: 60, width: 90, height: 90, label: label('GARAGE', 10) }),
        ],
    },
    /* ── Appliance / fixture stamps ────────────────────────────────────── */
    {
        id: 'dwellium-fixture-fridge',
        name: 'Fridge',
        elements: [rect({ x: 0, y: 0, width: 44, height: 40, strokeColor: FIXTURE, label: label('Fridge', 9) })],
    },
    {
        id: 'dwellium-fixture-stove',
        name: 'Stove / Range',
        elements: [rect({ x: 0, y: 0, width: 44, height: 40, strokeColor: FIXTURE, label: label('Stove', 9) })],
    },
    {
        id: 'dwellium-fixture-washer-dryer',
        name: 'Washer / Dryer',
        elements: [
            rect({ x: 0, y: 0, width: 40, height: 40, strokeColor: FIXTURE, label: label('W', 12) }),
            rect({ x: 44, y: 0, width: 40, height: 40, strokeColor: FIXTURE, label: label('D', 12) }),
        ],
    },
    {
        id: 'dwellium-fixture-water-heater',
        name: 'Water heater',
        elements: [{ type: 'ellipse', x: 0, y: 0, width: 44, height: 44, strokeColor: FIXTURE, label: label('WH', 11) }],
    },
    {
        id: 'dwellium-fixture-hvac',
        name: 'HVAC unit',
        elements: [rect({ x: 0, y: 0, width: 56, height: 40, strokeColor: FIXTURE, label: label('HVAC', 10) })],
    },
    {
        id: 'dwellium-fixture-toilet',
        name: 'Toilet',
        elements: [{ type: 'ellipse', x: 0, y: 0, width: 34, height: 40, strokeColor: FIXTURE, label: label('WC', 10) }],
    },
    {
        id: 'dwellium-fixture-sink',
        name: 'Sink',
        elements: [{ type: 'ellipse', x: 0, y: 0, width: 40, height: 30, strokeColor: FIXTURE, label: label('Sink', 8) }],
    },
    {
        id: 'dwellium-fixture-bathtub',
        name: 'Bathtub',
        elements: [rect({ x: 0, y: 0, width: 80, height: 36, strokeColor: FIXTURE, roundness: { type: 3 }, label: label('Tub', 9) })],
    },
    /* ── Damage / maintenance stamps (work-order markup) ───────────────── */
    {
        id: 'dwellium-damage-leak',
        name: 'Damage — Leak',
        elements: [{
            type: 'ellipse', x: 0, y: 0, width: 70, height: 44, strokeColor: DAMAGE,
            backgroundColor: DAMAGE_BG, fillStyle: 'solid', label: label('LEAK', 11),
        }],
    },
    {
        id: 'dwellium-damage-crack',
        name: 'Damage — Crack',
        elements: [
            { type: 'line', x: 0, y: 18, strokeColor: DAMAGE, strokeWidth: 2, points: [[0, 0], [16, -14], [30, 8], [46, -10], [60, 4], [76, -12]] },
            { type: 'text', x: 18, y: 26, text: 'CRACK', fontSize: 11, strokeColor: DAMAGE },
        ],
    },
    {
        id: 'dwellium-damage-mold',
        name: 'Damage — Mold',
        elements: [
            { type: 'ellipse', x: 0, y: 6, width: 34, height: 28, strokeColor: MOLD, backgroundColor: '#d3f9d8', fillStyle: 'solid' },
            { type: 'ellipse', x: 22, y: 0, width: 30, height: 26, strokeColor: MOLD, backgroundColor: '#d3f9d8', fillStyle: 'solid' },
            { type: 'ellipse', x: 14, y: 16, width: 28, height: 24, strokeColor: MOLD, backgroundColor: '#d3f9d8', fillStyle: 'solid' },
            { type: 'text', x: 4, y: 44, text: 'MOLD', fontSize: 11, strokeColor: MOLD },
        ],
    },
    {
        id: 'dwellium-damage-pest',
        name: 'Damage — Pest',
        elements: [{
            type: 'diamond', x: 0, y: 0, width: 64, height: 52, strokeColor: DAMAGE,
            backgroundColor: DAMAGE_BG, fillStyle: 'solid', label: label('PEST', 10),
        }],
    },
    {
        id: 'dwellium-damage-electrical',
        name: 'Damage — Electrical',
        elements: [
            { type: 'line', x: 8, y: 0, strokeColor: ELECTRIC, strokeWidth: 2, points: [[0, 0], [-8, 16], [4, 16], [-6, 34]] },
            { type: 'text', x: 16, y: 10, text: 'ELECTRICAL', fontSize: 11, strokeColor: ELECTRIC },
        ],
    },
    /* ── Before / After comparison zones (dashed, photo-markup ready) ──── */
    {
        id: 'dwellium-frame-before',
        name: 'Before frame',
        elements: [rect({ x: 0, y: 0, width: 300, height: 220, strokeStyle: 'dashed', strokeColor: LABEL_INK, label: { text: 'BEFORE', fontSize: 16, verticalAlign: 'top' } })],
    },
    {
        id: 'dwellium-frame-after',
        name: 'After frame',
        elements: [rect({ x: 0, y: 0, width: 300, height: 220, strokeStyle: 'dashed', strokeColor: LABEL_INK, label: { text: 'AFTER', fontSize: 16, verticalAlign: 'top' } })],
    },
    /* ── Property / unit label stamps ──────────────────────────────────── */
    {
        id: 'dwellium-label-woodland-parc',
        name: 'Woodland Parc Townhomes',
        elements: [{ type: 'text', x: 0, y: 0, text: 'Woodland Parc Townhomes', fontSize: 20, strokeColor: LABEL_INK }],
    },
    {
        id: 'dwellium-label-riverwood-club',
        name: 'Riverwood Club Apartments',
        elements: [{ type: 'text', x: 0, y: 0, text: 'Riverwood Club Apartments', fontSize: 20, strokeColor: LABEL_INK }],
    },
    {
        id: 'dwellium-label-unit',
        name: 'Unit label',
        elements: [{ type: 'text', x: 0, y: 0, text: 'Unit ___', fontSize: 16, strokeColor: LABEL_INK }],
    },
    {
        id: 'dwellium-label-work-order',
        name: 'Work order header',
        elements: [rect({ x: 0, y: 0, width: 260, height: 44, strokeColor: LABEL_INK, label: label('WO #____ · Unit ____ · Date ____', 12) })],
    },
];

/** Fixed create timestamp keeps re-seeding idempotent across sessions. */
const CREATED = 1755907200000; // 2026-08-23T00:00:00Z

/** Convert the pure specs into real Excalidraw LibraryItems. */
export function buildAndyLibrary(): LibraryItems {
    return ANDY_LIBRARY_SPECS.map((spec) => ({
        id: spec.id,
        status: 'published' as const,
        name: spec.name,
        created: CREATED,
        elements: convertToExcalidrawElements(spec.elements as unknown as ExcalidrawElementSkeleton[]),
    }));
}
