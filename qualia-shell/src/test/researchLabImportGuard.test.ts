/**
 * Research Lab DATA FIREWALL — the enforcement.
 *
 * The Research Lab sends user-typed text to 31 FREE third-party LLM providers
 * that may train on it. "These providers can never receive financial or
 * customer/tenant data" must be a property of the codebase, not a promise —
 * so this suite statically walks the import graph of src/lib/researchLlm/**
 * and src/components/ResearchLab/** (whiteboardBridge.test.tsx sister shape,
 * scaled from one file to a recursive walk) and FAILS if any transitive
 * import reaches an app-data module.
 *
 * Denylist: strataApi*, StrataDashboard/**, araChat*, libraryApi/notebooklm,
 * hierarchy, integrationsStore, plus Gmail/calendar/task stores by the same
 * mechanism (they all live behind those modules). `oneSaveClient` is allowed
 * ONLY via lib/oneSaveStore, which only the two research stores may import.
 *
 * Trusted-transit exception (pinned, not ignored): lib/perUserIdentity.ts
 * (identity holders — every per-user store shares it) and lib/oneSaveStore.ts
 * (One Save sync plumbing) are not recursed into, but their OWN import
 * surfaces are pinned exactly below, so smuggling a data import through them
 * still fails here.
 *
 * Direction guard: nothing outside the research modules may import the
 * research stores or anything in researchLlm/ (the lazy component import in
 * widgetRegistry.ts is the single allowed reference to ResearchLab).
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(process.cwd(), 'src');
const RESEARCH_DIRS = [
    resolve(SRC, 'lib/researchLlm'),
    resolve(SRC, 'components/ResearchLab'),
];

const DENYLIST: { pattern: RegExp; label: string }[] = [
    { pattern: /strataApi/i, label: 'strataApi (property/customer backend)' },
    { pattern: /StrataDashboard\//, label: 'StrataDashboard (incl. fixtures)' },
    { pattern: /araChat/i, label: 'ARA chat engine/context' },
    { pattern: /libraryApi|notebooklm/i, label: 'Library / NotebookLM clients' },
    { pattern: /\bhierarchy\b|\/hierarchy/, label: 'hierarchy (dock/content tree)' },
    { pattern: /integrationsStore/, label: 'integrationsStore (main LLM keys)' },
    { pattern: /googleAccounts|gmail/i, label: 'Gmail/google-account stores' },
];

/** Files whose imports are NOT recursed into — pinned exactly in tests below. */
const TRUSTED_TRANSIT = new Set([
    resolve(SRC, 'lib/perUserIdentity.ts'),
    resolve(SRC, 'lib/oneSaveStore.ts'),
]);

const RESEARCH_STORES = [
    resolve(SRC, 'lib/researchLlm/researchKeysStore.ts'),
    resolve(SRC, 'lib/researchLlm/researchLogStore.ts'),
];

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir)
        .map(f => join(dir, f))
        .flatMap(p => (statSync(p).isDirectory() ? listSourceFiles(p) : [p]))
        .filter(p => /\.(ts|tsx)$/.test(p));
}

/** Every import/export-from/dynamic-import specifier in a file. */
function specifiersOf(file: string): string[] {
    const src = readFileSync(file, 'utf8');
    const out: string[] = [];
    const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;
    for (let m = re.exec(src); m; m = re.exec(src)) out.push(m[1] ?? m[2] ?? m[3]);
    return out.filter(s => !s.endsWith('.css'));
}

function resolveSpecifier(fromFile: string, spec: string): string | null {
    if (!spec.startsWith('.')) return null; // package import — never app data
    const base = resolve(dirname(fromFile), spec);
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
        if (existsSync(cand) && statSync(cand).isFile()) return cand;
    }
    return null;
}

/** BFS the import graph from the research roots; returns visited files + edges. */
function walkResearchGraph(): { visited: Set<string>; edges: Array<{ from: string; spec: string; to: string | null }> } {
    const roots = RESEARCH_DIRS.flatMap(listSourceFiles);
    const visited = new Set<string>();
    const edges: Array<{ from: string; spec: string; to: string | null }> = [];
    const queue = [...roots];
    while (queue.length) {
        const file = queue.pop()!;
        if (visited.has(file)) continue;
        visited.add(file);
        if (TRUSTED_TRANSIT.has(file)) continue; // pinned separately below
        for (const spec of specifiersOf(file)) {
            const to = resolveSpecifier(file, spec);
            edges.push({ from: file, spec, to });
            if (to && !visited.has(to)) queue.push(to);
        }
    }
    return { visited, edges };
}

describe('Research Lab import firewall (structural isolation)', () => {
    const { visited, edges } = walkResearchGraph();

    it('walks a non-trivial graph (sanity: the walker actually sees the modules)', () => {
        const rel = [...visited].map(f => relative(SRC, f));
        expect(rel).toEqual(expect.arrayContaining([
            'components/ResearchLab/ResearchLab.tsx',
            'lib/researchLlm/client.ts',
            'lib/researchLlm/guard.ts',
            'lib/researchLlm/researchKeysStore.ts',
            'lib/researchLlm/researchLogStore.ts',
            'data/researchProviders.ts',
        ]));
    });

    it('NO transitive import reaches a denylisted app-data module', () => {
        const violations: string[] = [];
        for (const { from, spec, to } of edges) {
            const targets = [spec, to ? relative(SRC, to) : ''];
            for (const { pattern, label } of DENYLIST) {
                if (targets.some(t => t && pattern.test(t))) {
                    violations.push(`${relative(SRC, from)} → "${spec}" (${label})`);
                }
            }
        }
        expect(violations, `DATA FIREWALL BREACH:\n${violations.join('\n')}`).toEqual([]);
    });

    it('oneSaveClient is reachable ONLY via the two research stores → oneSaveStore', () => {
        for (const { from, spec } of edges) {
            expect(spec.includes('oneSaveClient'), `${relative(SRC, from)} imports oneSaveClient directly`).toBe(false);
            if (spec.includes('oneSaveStore')) {
                expect(RESEARCH_STORES, `${relative(SRC, from)} imports oneSaveStore — only the two research stores may`).toContain(from);
            }
        }
    });

    it('trusted transit: perUserIdentity.ts import surface is pinned', () => {
        const specs = specifiersOf(resolve(SRC, 'lib/perUserIdentity.ts')).sort();
        expect(specs).toEqual(['../context/UserContext', 'react']);
    });

    it('trusted transit: oneSaveStore.ts import surface is pinned', () => {
        const specs = specifiersOf(resolve(SRC, 'lib/oneSaveStore.ts')).sort();
        expect(specs).toEqual(['../utils/createLocalStorageStore', './backendStatusStore', './oneSaveClient']);
    });

    it('direction guard: nothing outside the research modules imports the research stores or researchLlm', () => {
        const offenders: string[] = [];
        const scan = (dir: string): void => {
            for (const entry of readdirSync(dir)) {
                const p = join(dir, entry);
                if (statSync(p).isDirectory()) {
                    if (p === resolve(SRC, 'test') || RESEARCH_DIRS.includes(p)) continue;
                    scan(p);
                } else if (/\.(ts|tsx)$/.test(p)) {
                    // Import specifiers only — comments may legitimately NAME the firewall.
                    if (specifiersOf(p).some(s => /researchLlm|researchKeysStore|researchLogStore/.test(s))) {
                        offenders.push(relative(SRC, p));
                    }
                }
            }
        };
        scan(SRC);
        // The lazy component import in widgetRegistry.ts references
        // components/ResearchLab/ResearchLab (allowed); the stores/lib are not
        // referenced anywhere outside the research modules.
        expect(offenders).toEqual([]);
    });
});
