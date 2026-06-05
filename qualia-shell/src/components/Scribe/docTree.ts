/**
 * docTree — derive a subpage/folder hierarchy from Scribe's flat file list.
 * suitenumerique/docs organizes knowledge with subpages & hierarchy; Scribe's
 * filepaths already encode that structure ("folder/sub/file.md"), so we build
 * a tree from the paths — no data-model change or backend needed.
 *
 * Pure & deterministic → unit-testable.
 */

export interface DocTreeNode {
    name: string;            // segment label (folder or file name)
    path: string;            // full path up to and including this node
    isFile: boolean;
    children: DocTreeNode[];
}

/** Build a nested tree from `/`-separated file paths. Folders sort before files; both alphabetical. */
export function buildDocTree(filepaths: string[]): DocTreeNode[] {
    const root: DocTreeNode = { name: '', path: '', isFile: false, children: [] };

    for (const raw of filepaths) {
        const clean = (raw ?? '').replace(/^\/+/, '').trim();
        if (!clean) continue;
        const segments = clean.split('/').filter(Boolean);
        let node = root;
        let acc = '';
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            acc = acc ? `${acc}/${seg}` : seg;
            const isLeaf = i === segments.length - 1;
            let child = node.children.find(c => c.name === seg && c.isFile === isLeaf);
            if (!child) {
                child = { name: seg, path: acc, isFile: isLeaf, children: [] };
                node.children.push(child);
            }
            node = child;
        }
    }

    const sortRec = (nodes: DocTreeNode[]): DocTreeNode[] => {
        nodes.sort((a, b) => {
            if (a.isFile !== b.isFile) return a.isFile ? 1 : -1; // folders first
            return a.name.localeCompare(b.name);
        });
        for (const n of nodes) sortRec(n.children);
        return nodes;
    };
    return sortRec(root.children);
}

/** Flatten a tree to visible rows honoring a set of expanded folder paths (for rendering). */
export function flattenTree(nodes: DocTreeNode[], expanded: Set<string>, depth = 0): Array<{ node: DocTreeNode; depth: number }> {
    const rows: Array<{ node: DocTreeNode; depth: number }> = [];
    for (const node of nodes) {
        rows.push({ node, depth });
        if (!node.isFile && expanded.has(node.path)) {
            rows.push(...flattenTree(node.children, expanded, depth + 1));
        }
    }
    return rows;
}
