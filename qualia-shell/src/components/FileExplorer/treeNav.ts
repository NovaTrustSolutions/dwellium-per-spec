import type { FileEntry } from './FileExplorerCell';

export interface Row {
    path: string;
    isFolder: boolean;
    expanded: boolean;
    /** Path of the parent folder; null for root-level rows. */
    parent: string | null;
}

export interface NavResult {
    focus?: string;
    toggle?: string;
    open?: string;
}

/** Flatten the tree depth-first; children are listed only under expanded folders. */
export function visibleRows(entries: FileEntry[], expanded: Record<string, boolean>): Row[] {
    const out: Row[] = [];
    const walk = (list: FileEntry[], parent: string | null) => {
        for (const e of list) {
            const isFolder = e.tier !== 'file';
            const open = isFolder && !!expanded[e.path];
            out.push({ path: e.path, isFolder, expanded: open, parent });
            if (open && e.children) walk(e.children, e.path);
        }
    };
    walk(entries, null);
    return out;
}

/**
 * Keyboard model for the visible rows, per the WAI-ARIA Authoring Practices
 * "Tree View" pattern (https://www.w3.org/WAI/ARIA/apg/patterns/treeview/):
 *  Down/Up: next/previous row (no wrap). Right: closed folder expands, open folder
 *  moves to its first child, file does nothing. Left: open folder collapses,
 *  otherwise move to parent. Home/End: first/last row. Enter: activate
 *  (file opens, folder toggles). Anything else, or no possible move: null.
 */
export function navKey(rows: Row[], currentPath: string, key: string): NavResult | null {
    if (rows.length === 0) return null;
    const i = rows.findIndex((r) => r.path === currentPath);
    const cur = i >= 0 ? rows[i] : undefined;
    const go = (r: Row | undefined): NavResult | null => (r ? { focus: r.path } : null);
    switch (key) {
        case 'Home': return go(rows[0]);
        case 'End': return go(rows[rows.length - 1]);
        case 'ArrowDown': return go(cur ? rows[i + 1] : rows[0]);
        case 'ArrowUp': return cur ? go(rows[i - 1]) : null;
        default: break;
    }
    if (!cur) return null;
    if (key === 'ArrowRight') {
        if (!cur.isFolder) return null;
        if (!cur.expanded) return { toggle: cur.path };
        return go(rows.find((r) => r.parent === cur.path));
    }
    if (key === 'ArrowLeft') {
        if (cur.isFolder && cur.expanded) return { toggle: cur.path };
        return cur.parent === null ? null : { focus: cur.parent };
    }
    if (key === 'Enter') return cur.isFolder ? { toggle: cur.path } : { open: cur.path };
    return null;
}
