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
