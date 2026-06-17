import { describe, it, expect } from 'vitest';
import { Wrench } from 'lucide-react';
import {
    STELLA_TOOL_CATALOG,
    CATEGORY_ORDER,
    filterTools,
    groupByCategory,
    toolCount,
    type StellaTool,
} from '../components/StellaAgent/stellaToolCatalog';

describe('stellaToolCatalog — catalog integrity', () => {
    it('has a broad, non-trivial library with unique ids', () => {
        expect(STELLA_TOOL_CATALOG.length).toBeGreaterThanOrEqual(12);
        const ids = STELLA_TOOL_CATALOG.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(toolCount()).toBe(STELLA_TOOL_CATALOG.length);
    });

    it('every tool has a well-formed action targeting an existing mechanism', () => {
        for (const tool of STELLA_TOOL_CATALOG) {
            expect(tool.name.trim()).not.toBe('');
            expect(tool.description.trim()).not.toBe('');
            expect(tool.keywords.length).toBeGreaterThan(0);
            const a = tool.action;
            if (a.kind === 'open-widget') expect(a.widgetId).toBeTruthy();
            else if (a.kind === 'chat-command') expect(a.command).toBeTruthy();
            else if (a.kind === 'info') expect(a.tab).toBeTruthy();
            else throw new Error(`unknown action kind for ${tool.id}`);
        }
    });

    it('open-widget tools target only LIVE registry ids', () => {
        const live = new Set([
            'inbox', 'ara-console', 'honcho', 'thought-weaver',
            'transcription', 'file-manager', 'doc-viewer', 'scribe',
        ]);
        for (const tool of STELLA_TOOL_CATALOG) {
            if (tool.action.kind === 'open-widget') {
                expect(live.has(tool.action.widgetId!)).toBe(true);
            }
        }
    });

    it('every tool category is in CATEGORY_ORDER (no orphan sections)', () => {
        for (const tool of STELLA_TOOL_CATALOG) {
            expect(CATEGORY_ORDER).toContain(tool.category);
        }
    });

    it('surfaces the first-class Hermes-spawn + TW/Honcho/ARA handoff tools', () => {
        const ids = new Set(STELLA_TOOL_CATALOG.map((t) => t.id));
        expect(ids.has('spawn-hermes')).toBe(true);
        expect(ids.has('capture-thought')).toBe(true);   // ThoughtWeaver handoff
        expect(ids.has('honcho-memory')).toBe(true);     // Honcho handoff
        expect(ids.has('ara-console')).toBe(true);       // ARA handoff
        const hermes = STELLA_TOOL_CATALOG.find((t) => t.id === 'spawn-hermes')!;
        expect(hermes.action.kind).toBe('chat-command');
        expect(hermes.action.command).toBe('/hermes ');
    });
});

describe('filterTools', () => {
    it('returns the full catalog (copy) for empty/whitespace query', () => {
        const all = filterTools('');
        expect(all.length).toBe(STELLA_TOOL_CATALOG.length);
        expect(all).not.toBe(STELLA_TOOL_CATALOG); // mutable copy, not the frozen source
        expect(filterTools('   ').length).toBe(STELLA_TOOL_CATALOG.length);
        expect(filterTools(null).length).toBe(STELLA_TOOL_CATALOG.length);
    });

    it('matches name + keywords case-insensitively', () => {
        const r = filterTools('HERMES');
        expect(r.some((t) => t.id === 'spawn-hermes')).toBe(true);
        expect(filterTools('statute').some((t) => t.id === 'transcription-statute')).toBe(true);
        expect(filterTools('email').some((t) => t.id === 'inbox-zero')).toBe(true);
    });

    it('AND-matches every whitespace token', () => {
        // "memory" matches both honcho-memory and stella-memory-explorer;
        // adding "honcho" narrows to the honcho one only.
        const broad = filterTools('memory');
        expect(broad.length).toBeGreaterThanOrEqual(2);
        const narrow = filterTools('memory honcho');
        expect(narrow.every((t) => t.id === 'honcho-memory')).toBe(true);
        expect(narrow.length).toBe(1);
    });

    it('returns [] when no tool matches', () => {
        expect(filterTools('zzz-no-such-tool')).toEqual([]);
    });
});

describe('groupByCategory', () => {
    it('orders sections by CATEGORY_ORDER and omits empty categories', () => {
        const groups = groupByCategory();
        const cats = groups.map((g) => g.category);
        // every emitted category is known + appears in canonical order
        const orderedKnown = CATEGORY_ORDER.filter((c) => cats.includes(c));
        expect(cats).toEqual(orderedKnown);
        // total tools preserved
        const total = groups.reduce((n, g) => n + g.tools.length, 0);
        expect(total).toBe(STELLA_TOOL_CATALOG.length);
    });

    it('only emits sections that have matches after filtering', () => {
        const groups = groupByCategory(filterTools('hermes'));
        expect(groups.length).toBeGreaterThanOrEqual(1);
        for (const g of groups) expect(g.tools.length).toBeGreaterThan(0);
        // hermes-only filter should not surface a Communication section
        expect(groups.some((g) => g.category === 'Communication')).toBe(false);
    });

    it('appends an unknown category after the ordered ones', () => {
        const custom: StellaTool[] = [
            { id: 'x', name: 'X', category: 'Zeta', description: 'd', icon: Wrench, keywords: ['x'], action: { kind: 'info', tab: 'mcp' } },
            { id: 'y', name: 'Y', category: 'Agents & Automation', description: 'd', icon: Wrench, keywords: ['y'], action: { kind: 'info', tab: 'mcp' } },
        ];
        const groups = groupByCategory(custom);
        expect(groups.map((g) => g.category)).toEqual(['Agents & Automation', 'Zeta']);
    });
});
