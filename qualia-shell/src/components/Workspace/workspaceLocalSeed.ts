/**
 * Local-first fallback workspace for the Workspace widget (Cycle 9).
 *
 * The Workspace widget is a pure METADATA + STRUCTURE view over two backend routes:
 *   - `GET /api/workspace/domaines`     (domaine sidecars)
 *   - `GET /api/file-explorer/tree`     (folder structure → Domaine/Project/Thread tiers)
 * When neither route is reachable (no backend / 404 / network down) the index view
 * previously dead-ended at "Failed to load domaines — HTTP 404" with nothing to drill
 * into — the entire Domaine→Project→Thread drill-down was structurally unreachable
 * offline (renders-but-dead).
 *
 * This module supplies a small, self-consistent in-memory workspace so the drill-down
 * is reachable + demonstrable offline. It is READ-ONLY: structure/metadata mutations
 * still require the backend (and surface the usual mutation error offline). The seed
 * is intentionally tiny and clearly sample data — `useLocalWorkspace()` flips an
 * `offline` flag so the UI shows an honest "local sample workspace" banner.
 *
 * Consistency contract (so the pure selectors derive correctly):
 *   - `SEED_DOMAINES[i].path` === a top-level `SEED_TREE` node `path` (tier 'domain').
 *   - Each domain node's project children carry tier 'project' with path
 *     `${domain}/${project}`; each project's thread children carry tier 'thread' with
 *     path `${domain}/${project}/${thread}`; threads may hold tier 'file' leaves.
 * `projectsForDomaine` / `threadsForProject` read straight off this shape.
 */
import type { DomaineMeta } from './workspaceApi';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';

/** Three sample domaines spanning the property-management problem space. */
export const SEED_DOMAINES: DomaineMeta[] = [
    {
        name: 'Property Operations',
        path: 'Property Operations',
        description: 'Day-to-day building, turnover, and tenant operations.',
        color: '#6366f1',
        position: 0,
    },
    {
        name: 'Legal & Compliance',
        path: 'Legal & Compliance',
        description: 'Leases, disputes, and Georgia statute tracking.',
        color: '#10b981',
        position: 1,
    },
    {
        name: 'Finance',
        path: 'Finance',
        description: 'Budgets, NOI, and owner distributions.',
        color: '#f59e0b',
        position: 2,
    },
];

/** Build a thread node with a couple of file leaves (drives the file-count badge). */
function thread(domain: string, project: string, name: string, files: string[]): FileEntry {
    const path = `${domain}/${project}/${name}`;
    return {
        name,
        path,
        tier: 'thread',
        children: files.map((f) => ({ name: f, path: `${path}/${f}`, tier: 'file' as const })),
    };
}

/** File-explorer tree mirroring SEED_DOMAINES — domain → project → thread → file. */
export const SEED_TREE: FileEntry[] = [
    {
        name: 'Property Operations',
        path: 'Property Operations',
        tier: 'domain',
        children: [
            {
                name: 'Maple Court Turnover',
                path: 'Property Operations/Maple Court Turnover',
                tier: 'project',
                children: [
                    thread('Property Operations', 'Maple Court Turnover', 'Unit 4B make-ready', ['punch-list.md', 'photos.md']),
                    thread('Property Operations', 'Maple Court Turnover', 'Vendor scheduling', ['quotes.md']),
                ],
            },
            {
                name: 'Preventive Maintenance',
                path: 'Property Operations/Preventive Maintenance',
                tier: 'project',
                children: [
                    thread('Property Operations', 'Preventive Maintenance', 'HVAC spring inspection', ['checklist.md']),
                ],
            },
        ],
    },
    {
        name: 'Legal & Compliance',
        path: 'Legal & Compliance',
        tier: 'domain',
        children: [
            {
                name: 'Security Deposit Disputes',
                path: 'Legal & Compliance/Security Deposit Disputes',
                tier: 'project',
                children: [
                    thread('Legal & Compliance', 'Security Deposit Disputes', 'Unit 12 — deposit return', ['notice.md', 'timeline.md']),
                    thread('Legal & Compliance', 'Security Deposit Disputes', 'Statute research — O.C.G.A. § 44-7', ['summary.md']),
                ],
            },
            {
                name: 'Lease Renewals 2026',
                path: 'Legal & Compliance/Lease Renewals 2026',
                tier: 'project',
                children: [
                    thread('Legal & Compliance', 'Lease Renewals 2026', 'Standard terms review', ['redlines.md']),
                ],
            },
        ],
    },
    {
        name: 'Finance',
        path: 'Finance',
        tier: 'domain',
        children: [
            {
                name: 'Q2 Budget',
                path: 'Finance/Q2 Budget',
                tier: 'project',
                children: [
                    thread('Finance', 'Q2 Budget', 'Operating expense forecast', ['model.md']),
                    thread('Finance', 'Q2 Budget', 'Owner distribution plan', ['plan.md']),
                ],
            },
        ],
    },
];
