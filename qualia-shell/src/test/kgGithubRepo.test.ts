/**
 * Plan 072 A5/A7 — a GitHub repo graph must say what it is: a structure-only map
 * (source 'github-tree') of N code files, and whether GitHub truncated the tree.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphGithubRepo } from '../components/Shell/HalocronKnowledgeGraph';

function stubGithub(files: number, truncated: boolean) {
    const tree = Array.from({ length: files }, (_, i) => ({ type: 'blob', path: `src/f${i}.ts`, size: 100 + i }));
    tree.push({ type: 'blob', path: 'README.md', size: 50 });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (url.includes('/git/trees/') ? { tree, truncated } : { default_branch: 'main', language: 'TypeScript' }),
    })));
}

describe('graphGithubRepo provenance', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('marks the graph structure-only and counts every code file before the 120 cap', async () => {
        stubGithub(300, false);
        const { project, gdata } = await graphGithubRepo('https://github.com/acme/widgets');
        expect(gdata.source).toBe('github-tree');
        expect(gdata.totalFiles).toBe(300);          // code files, README excluded
        expect(gdata.nodes.length).toBe(120);
        expect(project.blurb).not.toMatch(/only part/);
    });

    it('says so when GitHub truncated the file list', async () => {
        stubGithub(5, true);
        const { project } = await graphGithubRepo('acme/widgets');
        expect(project.blurb).toMatch(/GitHub listed only part of this repo/);
    });
});
