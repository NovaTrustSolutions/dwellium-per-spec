import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import HalocronKnowledgeGraph from '../components/Shell/HalocronKnowledgeGraph';
import { halocronKnowledgeGraphStore, setKgView, upsertKgProject, type KgGraphData } from '../lib/halocronKnowledgeGraphStore';
import { beforeEach } from 'vitest';

vi.mock('../hooks/useIntegrations', () => ({ useIntegrations: () => ({ integrations: { llm: {} } }) }));
vi.mock('../lib/llmClient', () => ({ callLlm: vi.fn() }));
vi.mock('../components/common/AgentEta', () => ({ default: ({ label }: { label: string }) => <div>{label}</div> }));
vi.mock('../components/KnowledgeGraph/GraphifyView', () => ({ default: () => <div data-testid="graphify-mock">graphify view</div> }));

class MockResizeObserver { observe = vi.fn(); disconnect = vi.fn(); }
// @ts-expect-error test shim
global.ResizeObserver = MockResizeObserver;

function fixtureGraphNoSource(): KgGraphData {
    // A graph saved by an OLDER build, before plan 072 phase 1 added `source`/
    // `totalFiles`. Real shape for anyone who added a GitHub repo before this ship.
    return {
        files: 4000,
        edges: 50,
        clusters: 3,
        tokens: 1000,
        usdPerSession: 0.01,
        importantFiles: [{ name: 'a.ts', score: 10, pct: 100 }],
        nodes: [
            { label: 'f0', cluster: 0, importance: 5, deg: 1 },
            { label: 'f1', cluster: 0, importance: 3, deg: 1 },
        ],
        links: [[0, 1]],
        builtAt: '2026-01-01T00:00:00.000Z',
        // no `source`, no `totalFiles` — exactly what upsertKgProject would have
        // stored for a GitHub repo added under the pre-072 build.
    } as KgGraphData;
}

describe('Knowledge Graph P1 review', () => {
    beforeEach(() => { localStorage.clear(); halocronKnowledgeGraphStore.reset(); });
    it('view tabs follow the WAI-ARIA pattern: roving tabindex + arrow keys', () => {
        render(<HalocronKnowledgeGraph />);
        const mine = screen.getByRole('tab', { name: 'My knowledge' });
        const repos = screen.getByRole('tab', { name: 'Code repos' });
        expect(mine.tabIndex).toBe(0);
        expect(repos.tabIndex).toBe(-1);
        expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(mine.id);
        mine.focus();
        act(() => { fireEvent.keyDown(mine, { key: 'ArrowRight' }); });
        expect(repos.getAttribute('aria-selected')).toBe('true');
        expect(document.activeElement).toBe(repos);
        act(() => { fireEvent.keyDown(repos, { key: 'ArrowRight' }); });
        expect(mine.getAttribute('aria-selected')).toBe('true');
    });

    it('a GitHub tab saved before `source` existed is still labelled structure-only', () => {
        upsertKgProject(
            { id: 'gh-acme-widgets', name: 'widgets', lang: 'TYPESCRIPT', files: 4000, clusters: 3, blurb: 'acme/widgets — graphed from the GitHub file tree.' },
            fixtureGraphNoSource(),
        );
        setKgView('repos');
        const { container } = render(<HalocronKnowledgeGraph />);

        const text = container.textContent ?? '';
        // What the honesty fix (A5/A7) is supposed to guarantee for a
        // github-tree graph — but this project's id clearly marks it as one
        // (graphGithubRepo always ids as `gh-${owner}-${repo}`), and the code
        // only checks `gdata.source === 'github-tree'`, not the id prefix.
        const claimsRealImports = text.includes('imports found by scanning');
        const claimsStructureOnly = text.includes("Structure only — links join files to their folder's largest file, not real imports.");

        expect(claimsRealImports).toBe(false);
        expect(claimsStructureOnly, 'pre-existing github-tree graph (no source field) should still be labeled structure-only, not "real imports"').toBe(true);
    });
});
