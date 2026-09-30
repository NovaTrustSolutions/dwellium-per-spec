/**
 * moveTargets — pure helpers for the File Explorer "Move to…" picker (spec §4.3:
 * Move-to-Thread). Flattens the tree into folder-like destinations (domain /
 * project / thread / folder), excluding the moving entry and its own subtree so
 * you can't move something into itself.
 */
import type { FileEntry } from './FileExplorerCell';

export interface MoveTarget {
    path: string;
    name: string;
    tier: string;
    depth: number;
}

/** All folder-like destinations for `movingPath`, depth-first, self + descendants excluded. */
export function collectMoveTargets(entries: FileEntry[], movingPath: string): MoveTarget[] {
    const out: MoveTarget[] = [];
    const walk = (list: FileEntry[], depth: number) => {
        for (const e of list) {
            if (e.path === movingPath || e.path.startsWith(movingPath + '/')) continue; // skip moving subtree
            if (e.tier !== 'file') out.push({ path: e.path, name: e.name, tier: e.tier, depth });
            if (e.children && e.children.length) walk(e.children, depth + 1);
        }
    };
    walk(entries, 0);
    return out;
}

/** Destination relative path when moving `movingName` into `destPath` ('' = root). */
export function destFor(destPath: string, movingName: string): string {
    return destPath ? `${destPath}/${movingName}` : movingName;
}

/** Current parent path of a path ('' if at root). Used to skip the no-op destination. */
export function parentOf(p: string): string {
    return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
}

/** Names already inside `folderPath` ('' = root). Used to refuse moves/uploads that would overwrite. */
export function childNames(entries: FileEntry[], folderPath: string): string[] {
    if (!folderPath) return entries.map((e) => e.name);
    for (const e of entries) {
        if (e.path === folderPath) return (e.children ?? []).map((c) => c.name);
        if (e.children && folderPath.startsWith(e.path + '/')) return childNames(e.children, folderPath);
    }
    return [];
}

/**
 * Plan 076 P1 — what a Delete on `clicked` acts on. The whole selection when the
 * clicked row is part of a multi-selection, else just the clicked row. Paths
 * inside an also-selected folder are dropped: trashing the folder takes them
 * with it, and trashing them first would split one delete across two trash stamps.
 */
export function deleteTargets(clicked: string, selectedPaths: string[]): string[] {
    const paths = selectedPaths.length > 1 && selectedPaths.includes(clicked) ? selectedPaths : [clicked];
    const unique = Array.from(new Set(paths));
    return unique.filter((p) => !unique.some((q) => q !== p && p.startsWith(q + '/')));
}

/**
 * Plan 076 P1 — one user-facing line for a batch where some items failed or were
 * skipped. Null when everything worked (say nothing). `failed` entries are
 * already formatted, e.g. `"a.md": already exists there`.
 */
export function batchSummary(verb: string, done: number, total: number, failed: string[]): string | null {
    if (failed.length === 0) return null;
    return `${verb} ${done} of ${total}. Not ${verb.toLowerCase()}:\n${failed.join('\n')}`;
}
