/**
 * Ingest Routes — always-on folder watcher + server-side non-html conversion
 * for the Scribe ingestion pipeline.
 *
 * WHY THIS EXISTS / SCOPE BOUNDARY
 * ────────────────────────────────
 * The browser CAN, today (in-app, no backend):
 *   - pick a source folder + a backup-destination folder (File System Access API),
 *   - enumerate the source folder, convert browser-convertible files
 *     (html/txt → markdown via htmlToMarkdown; .md passthrough),
 *   - write the produced .md files into the backup destination, and
 *   - keep a per-user converted-file index in localStorage (ingestionStore.ts).
 * That whole path ships on this branch (Scribe Cycles 4-5) and does NOT need
 * this contract.
 *
 * The browser CANNOT do two things, which is exactly what these routes cover:
 *   1. ALWAYS-ON WATCHING. A browser tab cannot run a persistent background
 *      watcher on a real OS folder. A backend daemon (or the planned Electron
 *      main process) watches registered folders and converts on change.
 *   2. NON-HTML CONVERSION. pdf/docx/xlsx/pptx/rtf/odt → markdown requires
 *      real binary parsing (LibreOffice / pandoc / a PDF text extractor). The
 *      browser path queues these files and labels them "needs backend
 *      conversion"; this contract is where that conversion happens server-side.
 *
 * STATUS: OUT OF SCOPE FOR THE `feat/scribe-ingestion-honcho` BRANCH.
 * Implemented by the sibling backend (`ai-dashboard369-file-manager`) or the
 * planned Electron build. The frontend client (qualia-shell/src/components/
 * Scribe/ingestion/ingestionApi.ts) is already shipped against this exact shape
 * and degrades gracefully (typed throw) until these routes exist.
 *
 * CONTRACT (must match ingestionApi.ts byte-for-byte on shape):
 *   POST   /api/ingest/watch        { sourcePath, destPath, label? }
 *                                      → { success, data: WatchedFolder }
 *   GET    /api/ingest/status        → { success, data: IngestStatus }
 *   POST   /api/ingest/convert      { sourcePath, destPath }
 *                                      → { success, data: BackendConvertedFile }
 *   GET    /api/ingest/converted     → { success, data: BackendConvertedFile[] }
 *
 * REUSE NOTE: the actual pdf/docx→md conversion should delegate to the existing
 * LibreOffice-headless path documented in `Docs/backend-docs-convert-routes.ts`
 * (`soffice --headless --convert-to`). Do NOT re-implement binary conversion
 * here — convert to a text/html intermediate via soffice, then run the SAME
 * htmlToMarkdown logic the frontend uses (or a server port of it) to land .md.
 *
 * Installation:
 *   cd ~/dwellium-backend/ai-dashboard369-file-manager
 *   # drop this file at src/routes/ingestRoutes.ts
 *   # then patch src/app.ts:
 *   #   import ingestRoutes from './routes/ingestRoutes';
 *   #   app.use('/api/ingest', ingestRoutes);
 *   # the watcher needs a filesystem-watch lib — `chokidar` is the reference
 *   #   choice (npm i chokidar); register/unregister persists to a small JSON
 *   #   ledger under ~/.dwellium/ingest/<userId>/watches.json.
 *   # restart backend (launchctl kickstart -k gui/$(id -u)/com.dwellium.backend)
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
// import chokidar from 'chokidar';            // watcher lib (npm i chokidar)
import { authenticate } from '../services/authMiddleware';

const router = Router();

// ── Shared types (mirror qualia-shell/.../ingestion/ingestionApi.ts) ──────

interface WatchedFolder {
    /** Server-assigned id for the registration. */
    id: string;
    /** Absolute path on the machine running the backend/Electron process. */
    sourcePath: string;
    /** Absolute path where converted .md files are written. */
    destPath: string;
    /** Optional human label. */
    label?: string;
    /** ISO timestamp the folder was registered. */
    registeredAt: string;
}

interface IngestStatus {
    /** Folders currently under watch. */
    watching: WatchedFolder[];
    /** ISO timestamp of the last conversion pass, or null if none yet. */
    lastRunAt: string | null;
    /** Number of files awaiting server-side conversion. */
    queueDepth: number;
}

interface BackendConvertedFile {
    sourcePath: string;
    destPath: string;
    /** Detected source format, e.g. "pdf" | "docx" | "rtf". */
    format: string;
    /** Byte size of the produced markdown. */
    bytes: number;
    convertedAt: string;
}

// ── Per-user ledger (registrations persist across restarts) ───────────────

function getUserIngestRoot(userId: string): string {
    return path.join(os.homedir(), '.dwellium', 'ingest', userId);
}

function ledgerPath(userId: string): string {
    return path.join(getUserIngestRoot(userId), 'watches.json');
}

interface Ledger {
    watching: WatchedFolder[];
    lastRunAt: string | null;
    /** Queue of source files detected but not yet converted. */
    queue: { sourcePath: string; destPath: string }[];
}

async function readLedger(userId: string): Promise<Ledger> {
    try {
        const raw = await fs.readFile(ledgerPath(userId), 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            watching: Array.isArray(parsed.watching) ? parsed.watching : [],
            lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : null,
            queue: Array.isArray(parsed.queue) ? parsed.queue : [],
        };
    } catch {
        return { watching: [], lastRunAt: null, queue: [] };
    }
}

async function writeLedger(userId: string, ledger: Ledger): Promise<void> {
    await fs.mkdir(getUserIngestRoot(userId), { recursive: true });
    await fs.writeFile(ledgerPath(userId), JSON.stringify(ledger, null, 2), 'utf-8');
}

/**
 * Guard: absolute paths are allowed here (unlike file-explorer's relative-only
 * model) because watched folders live anywhere on the host. Reject the obvious
 * footguns and confine writes to user-approved roots in a real implementation
 * (e.g. require the user to have granted the path via an OS picker first).
 */
function validatePath(p: unknown, field: string): string | null {
    if (!p || typeof p !== 'string') return `${field} is required`;
    if (p.includes('\0')) return `${field} contains a null byte`;
    return null;
}

/**
 * Format → boolean: can the SERVER convert this (browser cannot)?
 * The frontend already handles html/txt/md. The server adds the binary set.
 */
const SERVER_CONVERTIBLE = new Set(['pdf', 'docx', 'doc', 'xlsx', 'pptx', 'rtf', 'odt']);

// ── POST /watch ─ register a source→dest folder pair with the daemon ──────

router.post('/watch', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { sourcePath, destPath, label } = req.body;
        for (const [v, f] of [[sourcePath, 'sourcePath'], [destPath, 'destPath']] as const) {
            const err = validatePath(v, f);
            if (err) return res.status(400).json({ success: false, error: err });
        }
        const ledger = await readLedger(userId);
        // Idempotent on (sourcePath, destPath) — re-registering returns the existing row.
        let existing = ledger.watching.find((w) => w.sourcePath === sourcePath && w.destPath === destPath);
        if (!existing) {
            existing = {
                // Deterministic-enough id; a real impl can use crypto.randomUUID().
                id: `watch_${ledger.watching.length + 1}_${Buffer.from(sourcePath).toString('base64url').slice(0, 8)}`,
                sourcePath,
                destPath,
                label: typeof label === 'string' ? label : undefined,
                registeredAt: new Date().toISOString(),
            };
            ledger.watching.push(existing);
            await writeLedger(userId, ledger);
            // chokidar.watch(sourcePath, { ignoreInitial: false }).on('add'|'change', enqueue);
        }
        res.json({ success: true, data: existing as WatchedFolder });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /status ─ current watcher state ───────────────────────────────────

router.get('/status', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const ledger = await readLedger(userId);
        const status: IngestStatus = {
            watching: ledger.watching,
            lastRunAt: ledger.lastRunAt,
            queueDepth: ledger.queue.length,
        };
        res.json({ success: true, data: status });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /convert ─ server-side convert one non-html file → markdown ──────

router.post('/convert', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        const { sourcePath, destPath } = req.body;
        for (const [v, f] of [[sourcePath, 'sourcePath'], [destPath, 'destPath']] as const) {
            const err = validatePath(v, f);
            if (err) return res.status(400).json({ success: false, error: err });
        }
        const format = path.extname(sourcePath).replace('.', '').toLowerCase();
        if (!SERVER_CONVERTIBLE.has(format)) {
            return res.status(400).json({
                success: false,
                error: `format "${format}" is not a server-side conversion target (html/txt/md are handled in-browser)`,
            });
        }
        // REUSE: delegate the binary→text/html step to the soffice path in
        // backend-docs-convert-routes.ts, then run htmlToMarkdown (server port).
        //   const html = await sofficeConvert(sourcePath, 'html');
        //   const md = htmlToMarkdown(html);
        //   await fs.mkdir(path.dirname(destPath), { recursive: true });
        //   await fs.writeFile(destPath, md, 'utf-8');
        //   const bytes = Buffer.byteLength(md, 'utf-8');
        // Below is the response SHAPE the frontend expects once that lands:
        const converted: BackendConvertedFile = {
            sourcePath,
            destPath,
            format,
            bytes: 0, // = Buffer.byteLength(md, 'utf-8')
            convertedAt: new Date().toISOString(),
        };
        // Pop from queue + stamp lastRunAt in the real impl.
        return res.status(501).json({
            success: false,
            error: 'Server-side conversion not implemented yet — see backend-docs-convert-routes.ts for the soffice path to reuse.',
            // data: converted,  // ← uncomment when implemented
        });
        // res.json({ success: true, data: converted });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /converted ─ list files the backend has converted ─────────────────

router.get('/converted', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
        // A real impl reads a converted-files ledger (or stats destPath dir).
        const converted: BackendConvertedFile[] = [];
        res.json({ success: true, data: converted });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
