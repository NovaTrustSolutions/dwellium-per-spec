/**
 * File Explorer Routes — 3-tier filesystem walker for the new FileExplorer widget.
 *
 * Disk layout (per Ilya 2026-05-28 design lock):
 *   ~/.dwellium/files/<userId>/<domain>/<project>/<thread>/...
 *
 * Tier inference by depth (relative to user root):
 *   depth 1 = domain
 *   depth 2 = project
 *   depth 3 = thread
 *   depth 4+ = folder
 *   leaf file (regardless of depth) = file
 *
 * Endpoints:
 *   GET    /api/file-explorer/tree              → recursive walk, full 3-tier shape
 *   POST   /api/file-explorer/mkdir             { path, tier }  → create folder at given tier
 *   POST   /api/file-explorer/rename            { fromPath, toName }  → rename a folder/file
 *   POST   /api/file-explorer/move              { fromPath, toPath, copy? }  → move or copy
 *   DELETE /api/file-explorer/entry             { path }  → delete folder (recursive) or file
 *
 * Installation:
 *   cd ~/dwellium-backend/ai-dashboard369-file-manager
 *   # drop this file at src/routes/fileExplorerRoutes.ts
 *   # then patch src/app.ts:
 *   #   import fileExplorerRoutes from './routes/fileExplorerRoutes';
 *   #   app.use('/api/file-explorer', fileExplorerRoutes);
 *   # restart backend (launchctl kickstart -k gui/$(id -u)/com.dwellium.backend)
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { authenticate } from '../services/authMiddleware';

const router = Router();

function getUserRoot(userId: string): string {
    return path.join(os.homedir(), '.dwellium', 'files', userId);
}

function tierForDepth(depth: number, isFile: boolean): 'domain' | 'project' | 'thread' | 'folder' | 'file' {
    if (isFile) return 'file';
    if (depth === 1) return 'domain';
    if (depth === 2) return 'project';
    if (depth === 3) return 'thread';
    return 'folder';
}

interface TreeEntry {
    name: string;
    path: string;
    tier: 'domain' | 'project' | 'thread' | 'folder' | 'file';
    children?: TreeEntry[];
    size?: number;
    modified?: string;
}

async function walkTree(rootDir: string, current: string, depth: number): Promise<TreeEntry[]> {
    let dirents;
    try { dirents = await fs.readdir(current, { withFileTypes: true }); } catch { return []; }
    const out: TreeEntry[] = [];
    for (const d of dirents) {
        if (d.name.startsWith('.')) continue; // skip hidden
        const abs = path.join(current, d.name);
        const rel = path.relative(rootDir, abs);
        const isDir = d.isDirectory();
        const entry: TreeEntry = {
            name: d.name,
            path: rel,
            tier: tierForDepth(depth, !isDir),
        };
        if (isDir) {
            entry.children = await walkTree(rootDir, abs, depth + 1);
        } else {
            try {
                const stat = await fs.stat(abs);
                entry.size = stat.size;
                entry.modified = stat.mtime.toISOString();
            } catch { /* ignore stat errors */ }
        }
        out.push(entry);
    }
    // Sort: folders/tiers first, then alphabetical within each group
    out.sort((a, b) => {
        const aFile = a.tier === 'file';
        const bFile = b.tier === 'file';
        if (aFile !== bFile) return aFile ? 1 : -1;
        return a.name.localeCompare(b.name);
    });
    return out;
}

function validateRelPath(rel: string): string | null {
    if (!rel || typeof rel !== 'string') return 'path is required';
    if (rel.includes('..')) return 'path traversal not allowed';
    if (path.isAbsolute(rel)) return 'absolute paths not allowed';
    return null;
}

function resolveAndGuard(root: string, rel: string): { resolved: string } | { error: string } {
    const err = validateRelPath(rel);
    if (err) return { error: err };
    const resolved = path.resolve(root, rel);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        return { error: 'path traversal not allowed' };
    }
    return { resolved };
}

// ── GET /tree ─────────────────────────────────────────────────────────

router.get('/tree', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const root = getUserRoot(userId);
        await fs.mkdir(root, { recursive: true });
        const tree = await walkTree(root, root, 1);
        res.json({ success: true, data: tree });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /mkdir ───────────────────────────────────────────────────────

router.post('/mkdir', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { path: rel } = req.body;
        const root = getUserRoot(userId);
        const r = resolveAndGuard(root, rel);
        if ('error' in r) return res.status(400).json({ success: false, error: r.error });
        await fs.mkdir(r.resolved, { recursive: true });
        res.json({ success: true, path: rel });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /touch ─ create an empty file (or no-op if it exists) ────────

router.post('/touch', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { path: rel, content } = req.body;
        const root = getUserRoot(userId);
        const r = resolveAndGuard(root, rel);
        if ('error' in r) return res.status(400).json({ success: false, error: r.error });
        await fs.mkdir(path.dirname(r.resolved), { recursive: true });
        // Create only if missing — never overwrite
        try { await fs.access(r.resolved); }
        catch { await fs.writeFile(r.resolved, typeof content === 'string' ? content : '', 'utf-8'); }
        res.json({ success: true, path: rel });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /rename ──────────────────────────────────────────────────────

router.post('/rename', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { fromPath, toName } = req.body;
        if (!toName || typeof toName !== 'string' || toName.includes('/') || toName.includes('\\') || toName.includes('..')) {
            return res.status(400).json({ success: false, error: 'invalid toName' });
        }
        const root = getUserRoot(userId);
        const r = resolveAndGuard(root, fromPath);
        if ('error' in r) return res.status(400).json({ success: false, error: r.error });
        const toRel = path.join(path.dirname(fromPath), toName);
        const r2 = resolveAndGuard(root, toRel);
        if ('error' in r2) return res.status(400).json({ success: false, error: r2.error });
        await fs.rename(r.resolved, r2.resolved);
        res.json({ success: true, fromPath, toPath: toRel });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /move ────────────────────────────────────────────────────────

router.post('/move', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { fromPath, toPath, copy } = req.body;
        const root = getUserRoot(userId);
        const r1 = resolveAndGuard(root, fromPath);
        if ('error' in r1) return res.status(400).json({ success: false, error: r1.error });
        const r2 = resolveAndGuard(root, toPath);
        if ('error' in r2) return res.status(400).json({ success: false, error: r2.error });
        await fs.mkdir(path.dirname(r2.resolved), { recursive: true });
        if (copy) {
            await fs.cp(r1.resolved, r2.resolved, { recursive: true });
        } else {
            await fs.rename(r1.resolved, r2.resolved);
        }
        res.json({ success: true, fromPath, toPath });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /entry ─────────────────────────────────────────────────────

router.delete('/entry', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { path: rel } = req.body;
        const root = getUserRoot(userId);
        const r = resolveAndGuard(root, rel);
        if ('error' in r) return res.status(400).json({ success: false, error: r.error });
        await fs.rm(r.resolved, { recursive: true, force: true });
        res.json({ success: true, path: rel });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
