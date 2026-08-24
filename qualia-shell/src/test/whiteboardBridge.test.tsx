/**
 * Whiteboard ↔ Strata bridge (plan 053 #5) and the Andy shape library
 * (plan 053 #4).
 *
 * The bridge module is deliberately Excalidraw-free so Strata modules can
 * import it without pulling the canvas bundle — asserted below by reading the
 * source, because a lazy import graph regression is invisible at runtime.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));
// convertToExcalidrawElements is the only package call the library data needs.
vi.mock('@excalidraw/excalidraw', () => ({
    convertToExcalidrawElements: (skeletons: unknown[]) => skeletons,
}));

import { WhiteboardAction, openStrataBoard, strataBoardId } from '../components/Whiteboard/whiteboardBridge';
import { getWhiteboardDoc, resetWhiteboard, DEFAULT_BOARD_ID } from '../lib/whiteboardStore';
import { ANDY_LIBRARY_SPECS, buildAndyLibrary } from '../data/whiteboard/andyLibrary';
import { setPerUserIdentity } from '../lib/perUserIdentity';

const opened: Array<{ widgetId?: string }> = [];
const onOpen = (e: Event) => { opened.push((e as CustomEvent).detail); };

beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity('u-bridge');
    resetWhiteboard();
    opened.length = 0;
    window.addEventListener('dwellium:open-widget', onOpen);
});
afterEach(() => {
    window.removeEventListener('dwellium:open-widget', onOpen);
});

describe('strata bridge (plan 053 #5)', () => {
    it('board ids are namespaced per entity type', () => {
        expect(strataBoardId('maintenance', 'wo-1')).toBe('strata:maintenance:wo-1');
        expect(strataBoardId('property', 'prop-7')).toBe('strata:property:prop-7');
    });
    it('openStrataBoard creates the board, activates it and opens the widget', () => {
        openStrataBoard('maintenance', 'wo-1', 'Leaky faucet');
        const doc = getWhiteboardDoc();
        expect(doc.activeBoardId).toBe('strata:maintenance:wo-1');
        expect(doc.boards['strata:maintenance:wo-1'].title).toBe('WO: Leaky faucet');
        expect(opened).toEqual([{ widgetId: 'whiteboard', label: 'Whiteboard', icon: 'pen-tool' }]);
        // Default board still exists — default behaviour preserved.
        expect(doc.boards[DEFAULT_BOARD_ID]).toBeDefined();
    });
    it('a property board titles from the property name', () => {
        openStrataBoard('property', 'prop-7', 'Woodland Parc Townhomes');
        expect(getWhiteboardDoc().boards['strata:property:prop-7'].title).toBe('Property: Woodland Parc Townhomes');
    });
    it('WhiteboardAction renders one button that opens the entity board', () => {
        render(<WhiteboardAction kind="maintenance" id="wo-2" title="Broken window" />);
        fireEvent.click(screen.getByText('Whiteboard'));
        expect(getWhiteboardDoc().activeBoardId).toBe('strata:maintenance:wo-2');
        expect(opened).toHaveLength(1);
    });
    it('the bridge module never imports the Excalidraw package (keeps the canvas lazy)', () => {
        const src = readFileSync(resolve(process.cwd(), 'src/components/Whiteboard/whiteboardBridge.tsx'), 'utf8');
        const imports = src.split('\n').filter(l => /^\s*import\b/.test(l)).join('\n');
        expect(imports).not.toMatch(/@excalidraw\/excalidraw/);
        expect(imports).not.toMatch(/['"]\.\/Whiteboard['"]/);
        expect(imports).not.toMatch(/andyLibrary/);
        expect(imports).toMatch(/whiteboardStore/); // it DOES use the store
    });
});

describe('Andy shape library (plan 053 #4)', () => {
    it('ships the property-management set Andy needs, with unique ids', () => {
        const ids = ANDY_LIBRARY_SPECS.map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every(id => id.startsWith('dwellium-'))).toBe(true);
        // Unit footprints
        expect(ids).toEqual(expect.arrayContaining([
            'dwellium-unit-studio', 'dwellium-unit-1br', 'dwellium-unit-2br', 'dwellium-unit-townhome',
        ]));
        // Damage / maintenance stamps named by the plan
        expect(ids).toEqual(expect.arrayContaining([
            'dwellium-damage-leak', 'dwellium-damage-crack', 'dwellium-damage-mold',
            'dwellium-damage-pest', 'dwellium-damage-electrical',
        ]));
        // Before/After frames
        expect(ids).toEqual(expect.arrayContaining(['dwellium-frame-before', 'dwellium-frame-after']));
        // At least one appliance/fixture stamp family
        expect(ids.filter(id => id.startsWith('dwellium-fixture-')).length).toBeGreaterThanOrEqual(5);
    });
    it('carries Andy\'s Georgia property labels', () => {
        const texts = ANDY_LIBRARY_SPECS.flatMap(s => s.elements.map(e => (e as { text?: string }).text ?? ''));
        expect(texts).toContain('Woodland Parc Townhomes');
        expect(texts).toContain('Riverwood Club Apartments');
    });
    it('buildAndyLibrary returns well-formed LibraryItems with stable ids', () => {
        const items = buildAndyLibrary();
        expect(items).toHaveLength(ANDY_LIBRARY_SPECS.length);
        for (const item of items) {
            expect(item.status).toBe('published');
            expect(typeof item.name).toBe('string');
            expect(item.elements.length).toBeGreaterThan(0);
        }
        // Deterministic: two builds are identical (idempotent re-seed / re-add).
        expect(JSON.stringify(buildAndyLibrary())).toBe(JSON.stringify(items));
    });
    it('every spec element declares a type (valid skeleton input)', () => {
        for (const spec of ANDY_LIBRARY_SPECS) {
            for (const el of spec.elements) {
                expect(typeof (el as { type?: string }).type).toBe('string');
            }
        }
    });
});
