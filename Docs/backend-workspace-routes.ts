/**
 * Workspace Routes — metadata layer for the Workspace widget (Domaine → Project → Thread).
 *
 * ⚠️ CONTRACT ONLY — this file documents the route surface the Workspace widget expects.
 *    It lives in the sibling backend repo `ai-dashboard369-file-manager`, NOT in
 *    `qualia-shell/`. The `feat/workspace-widget` branch ships the client + this contract;
 *    backend install is a separate, Ilya-gated step (matches the file-explorer + scribe
 *    precedent). Sister file: `Docs/backend-file-explorer-routes.ts`.
 *
 * Design lock (Cycle 2 plan §10, autonomous-run defaults D1–D3 adopted Cycle 3):
 *   D1  REUSE the existing 3-tier file-explorer backend. Workspace derives the
 *       Domaine/Project/Thread STRUCTURE from `GET /api/file-explorer/tree` (already
 *       implemented). Folder CRUD (create/rename/move/delete a domaine/project/thread)
 *       reuses the EXISTING file-explorer routes — this file adds NO folder CRUD.
 *   D2  Domaine/Thread METADATA lives in dot-prefixed sidecar JSON on the same fs:
 *         <userRoot>/<domain>/.domaine.json          → DomaineMeta
 *         <userRoot>/<domain>/<project>/<thread>/.thread.json → ThreadMeta
 *       Dot-prefix => the file-explorer `walkTree` (skips `.`-prefixed entries) does NOT
 *       surface these as stray files. No new DB table.
 *   D3  Workspace shares the file-explorer `/tree` endpoint (one source of truth for the
 *       per-user tree). The project→domaine mapping is IMPLICIT in the path (a project
 *       folder is physically nested under its domain folder) — no separate map endpoint.
 *
 * Disk layout (shared with file-explorer; per Ilya 2026-05-28 design lock):
 *   ~/.dwellium/files/<userId>/<domain>/<project>/<thread>/...
 *
 * Endpoints (metadata only — folder structure comes from /api/file-explorer/*):
 *   GET  /api/workspace/domaines                 → list DomaineMeta for every depth-1 folder
 *                                                   (folder name + merged .domaine.json sidecar)
 *   PUT  /api/workspace/domaine    { path, color?, description?, position? }
 *                                                → upsert <domain>/.domaine.json sidecar
 *   GET  /api/workspace/thread-meta?path=<rel>   → read <…thread>/.thread.json (defaults if absent)
 *   PUT  /api/workspace/thread-meta { path, ...ThreadMeta } → upsert <…thread>/.thread.json sidecar
 *
 * NOT in this contract (use the file-explorer routes instead):
 *   - create domaine/project/thread folder  → POST /api/file-explorer/mkdir { path, tier }
 *   - rename                                 → POST /api/file-explorer/rename { fromPath, toName }
 *   - move                                   → POST /api/file-explorer/move   { fromPath, toPath, copy? }
 *   - delete                                 → DELETE /api/file-explorer/entry { path }
 *   - full tree                              → GET  /api/file-explorer/tree
 *
 * Installation:
 *   cd ~/dwellium-backend/ai-dashboard369-file-manager
 *   # drop this file at src/routes/workspaceRoutes.ts
 *   # then patch src/app.ts:
 *   #   import workspaceRoutes from './routes/workspaceRoutes';
 *   #   app.use('/api/workspace', workspaceRoutes);
 *   # restart backend (launchctl kickstart -k gui/$(id -u)/com.dwellium.backend)
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { authenticate } from '../services/authMiddleware';

const router = Router();

const DOMAINE_SIDECAR = '.domaine.json';
const THREAD_SIDECAR = '.thread.json';

// Default domaine accent palette, indexed by position (Holocron domaineFs parity).
const DEFAULT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

function getUserRoot(userId: string): string {
    return path.join(os.homedir(), '.dwellium', 'files', userId);
}

// ── Shared path guards (identical contract to fileExplorerRoutes) ─────────

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

// ── Metadata shapes (mirror Holocron domaineFs / projectFs sidecars) ──────

interface DomaineMeta {
    /** Folder name — the canonical id of the domaine (rename via file-explorer). */
    name: string;
    /** Relative path from user root (depth-1 folder name). */
    path: string;
    description: string;
    color: string;
    position: number;
}

interface ThreadMeta {
    name: string;
    projectName: string;
    createdAt: string;
    lastModified: string;
    status: 'active' | 'complete';
    stage: string | null;
    continuedFrom: string | null;
    inheritedContext: string | null;
    honchoSessionId: string | null;
    compressionCount: number;
    dumpCount: number;
    reportCount: number;
    lastDreamQuery: string | null;
    intakePromptShown: boolean;
}

async function readJsonSidecar<T>(file: string): Promise<Partial<T> | null> {
    try {
        const raw = await fs.readFile(file, 'utf-8');
        return JSON.parse(raw) as Partial<T>;
    } catch {
        return null; // missing or unparseable → caller supplies defaults
    }
}

async function writeJsonSidecar(file: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ── GET /domaines ─ list domaine metadata for every depth-1 folder ────────

router.get('/domaines', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const root = getUserRoot(userId);
        await fs.mkdir(root, { recursive: true });
        let dirents;
        try { dirents = await fs.readdir(root, { withFileTypes: true }); } catch { dirents = []; }
        const domainDirs = dirents
            .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
            .map((d) => d.name)
            .sort((a, b) => a.localeCompare(b));

        const domaines: DomaineMeta[] = [];
        for (let i = 0; i < domainDirs.length; i++) {
            const name = domainDirs[i];
            const sidecar = await readJsonSidecar<DomaineMeta>(path.join(root, name, DOMAINE_SIDECAR));
            domaines.push({
                name,
                path: name,
                description: sidecar?.description ?? '',
                color: sidecar?.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                position: typeof sidecar?.position === 'number' ? sidecar.position : i,
            });
        }
        domaines.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
        res.json({ success: true, data: domaines });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── PUT /domaine ─ upsert a domaine sidecar (color/description/position) ──

router.put('/domaine', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { path: rel, color, description, position } = req.body;
        const root = getUserRoot(userId);
        const r = resolveAndGuard(root, rel);
        if ('error' in r) return res.status(400).json({ success: false, error: r.error });
        // Must be a depth-1 existing directory.
        let stat;
        try { stat = await fs.stat(r.resolved); }
        catch { return res.status(404).json({ success: false, error: 'Domaine not found' }); }
        if (!stat.isDirectory()) return res.status(400).json({ success: false, error: 'Not a directory' });

        const file = path.join(r.resolved, DOMAINE_SIDECAR);
        const existing = (await readJsonSidecar<DomaineMeta>(file)) ?? {};
        const merged: Partial<DomaineMeta> = {
            ...existing,
            ...(typeof color === 'string' ? { color } : {}),
            ...(typeof description === 'string' ? { description } : {}),
            ...(typeof position === 'number' ? { position } : {}),
        };
        await writeJsonSidecar(file, merged);
        res.json({ success: true, path: rel, data: merged });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /thread-meta ─ read a thread sidecar (defaults if absent) ─────────

router.get('/thread-meta', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const rel = (req.query.path as string) || '';
        const root = getUserRoot(userId);
        const r = resolveAndGuard(root, rel);
        if ('error' in r) return res.status(400).json({ success: false, error: r.error });
        let stat;
        try { stat = await fs.stat(r.resolved); }
        catch { return res.status(404).json({ success: false, error: 'Thread not found' }); }
        if (!stat.isDirectory()) return res.status(400).json({ success: false, error: 'Not a directory' });

        const sidecar = await readJsonSidecar<ThreadMeta>(path.join(r.resolved, THREAD_SIDECAR));
        const segments = rel.split(path.sep).filter(Boolean);
        const meta: ThreadMeta = {
            name: segments[segments.length - 1] ?? '',
            projectName: segments[segments.length - 2] ?? '',
            createdAt: sidecar?.createdAt ?? stat.birthtime.toISOString(),
            lastModified: sidecar?.lastModified ?? stat.mtime.toISOString(),
            status: sidecar?.status === 'complete' ? 'complete' : 'active',
            stage: sidecar?.stage ?? null,
            continuedFrom: sidecar?.continuedFrom ?? null,
            inheritedContext: sidecar?.inheritedContext ?? null,
            honchoSessionId: sidecar?.honchoSessionId ?? null,
            compressionCount: sidecar?.compressionCount ?? 0,
            dumpCount: sidecar?.dumpCount ?? 0,
            reportCount: sidecar?.reportCount ?? 0,
            lastDreamQuery: sidecar?.lastDreamQuery ?? null,
            intakePromptShown: sidecar?.intakePromptShown ?? false,
        };
        res.json({ success: true, path: rel, data: meta });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── PUT /thread-meta ─ upsert a thread sidecar ────────────────────────────

router.put('/thread-meta', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { path: rel, ...patch } = req.body;
        const root = getUserRoot(userId);
        const r = resolveAndGuard(root, rel);
        if ('error' in r) return res.status(400).json({ success: false, error: r.error });
        let stat;
        try { stat = await fs.stat(r.resolved); }
        catch { return res.status(404).json({ success: false, error: 'Thread not found' }); }
        if (!stat.isDirectory()) return res.status(400).json({ success: false, error: 'Not a directory' });

        const file = path.join(r.resolved, THREAD_SIDECAR);
        const existing = (await readJsonSidecar<ThreadMeta>(file)) ?? {};
        // Whitelist writable fields — never accept `name`/`projectName` (derived from path).
        const WRITABLE: (keyof ThreadMeta)[] = [
            'status', 'stage', 'continuedFrom', 'inheritedContext', 'honchoSessionId',
            'compressionCount', 'dumpCount', 'reportCount', 'lastDreamQuery', 'intakePromptShown',
        ];
        const merged: Record<string, unknown> = { ...existing };
        for (const k of WRITABLE) {
            if (k in patch) merged[k] = patch[k];
        }
        merged.lastModified = stat.mtime.toISOString();
        await writeJsonSidecar(file, merged);
        res.json({ success: true, path: rel, data: merged });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
