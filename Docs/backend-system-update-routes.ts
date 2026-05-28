/**
 * System Update Routes — git-pull + rebuild + restart from Settings UI.
 *
 * Endpoints:
 *   GET  /status              — current branch, current SHA, ahead/behind main, dirty?, last fetch
 *   POST /check                — runs `git fetch origin` and returns fresh ahead/behind
 *   POST /apply                — runs Scripts/rebuild-frontend.sh after `git pull`; backgrounded
 *   GET  /apply/log            — tails the current update log
 *
 * Tied to the repo root at /Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/
 * (env REPO_ROOT overrides). Uses child_process.spawn — no node-pty needed.
 *
 * Installation:
 *   cp this file to ~/dwellium-backend/.../src/routes/systemUpdateRoutes.ts
 *   patch src/app.ts:
 *     import systemUpdateRoutes from './routes/systemUpdateRoutes';
 *     app.use('/api/system', systemUpdateRoutes);
 *   restart backend.
 */
import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { existsSync, promises as fsp } from 'fs';
import path from 'path';
import os from 'os';
import { authenticate } from '../services/authMiddleware';

const REPO_ROOT = process.env.REPO_ROOT || '/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec';
const UPDATE_LOG = '/tmp/dwellium-system-update.log';
const PROGRESS_FILE = '/tmp/dwellium-system-update.status.json';

interface UpdateStatus {
    state: 'idle' | 'fetching' | 'pulling' | 'installing' | 'building' | 'restarting' | 'done' | 'error';
    message: string;
    startedAt: string | null;
    finishedAt: string | null;
    exitCode: number | null;
}

async function readStatus(): Promise<UpdateStatus> {
    try {
        const raw = await fsp.readFile(PROGRESS_FILE, 'utf8');
        return JSON.parse(raw);
    } catch {
        return { state: 'idle', message: 'No update has been run yet.', startedAt: null, finishedAt: null, exitCode: null };
    }
}

async function writeStatus(s: Partial<UpdateStatus>): Promise<void> {
    const current = await readStatus();
    const next = { ...current, ...s };
    await fsp.writeFile(PROGRESS_FILE, JSON.stringify(next, null, 2));
}

function runGit(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const proc = spawn('/usr/bin/git', args, { cwd, env: { ...process.env } });
        let stdout = ''; let stderr = '';
        proc.stdout.on('data', (c) => { stdout += c.toString(); });
        proc.stderr.on('data', (c) => { stderr += c.toString(); });
        proc.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
        proc.on('error', () => resolve({ code: -1, stdout, stderr: 'spawn-error' }));
    });
}

const router = Router();

router.get('/status', authenticate, async (_req: Request, res: Response) => {
    if (!existsSync(REPO_ROOT)) {
        return res.status(404).json({ success: false, error: `Repo root not found: ${REPO_ROOT}` });
    }
    const [shaR, branchR, statusR, behindR, aheadR] = await Promise.all([
        runGit(['rev-parse', 'HEAD'], REPO_ROOT),
        runGit(['rev-parse', '--abbrev-ref', 'HEAD'], REPO_ROOT),
        runGit(['status', '--porcelain'], REPO_ROOT),
        runGit(['rev-list', '--count', 'HEAD..origin/main'], REPO_ROOT),
        runGit(['rev-list', '--count', 'origin/main..HEAD'], REPO_ROOT),
    ]);
    const lastShaR = await runGit(['log', '-1', '--pretty=format:%h|%s|%ar'], REPO_ROOT);
    const [hash, subject, age] = (lastShaR.stdout || '').split('|');
    const progress = await readStatus();
    res.json({
        success: true,
        repoRoot: REPO_ROOT,
        branch: branchR.stdout.trim(),
        sha: shaR.stdout.trim().slice(0, 12),
        lastCommit: { hash, subject: subject || '', age: age || '' },
        dirty: statusR.stdout.trim().length > 0,
        behind: Number(behindR.stdout.trim()) || 0,
        ahead: Number(aheadR.stdout.trim()) || 0,
        progress,
    });
});

router.post('/check', authenticate, async (_req: Request, res: Response) => {
    const fetchR = await runGit(['fetch', 'origin', 'main'], REPO_ROOT);
    if (fetchR.code !== 0) {
        return res.status(500).json({ success: false, error: `git fetch failed: ${fetchR.stderr.trim()}` });
    }
    const behindR = await runGit(['rev-list', '--count', 'HEAD..origin/main'], REPO_ROOT);
    const aheadR = await runGit(['rev-list', '--count', 'origin/main..HEAD'], REPO_ROOT);
    const logR = await runGit(['log', '--oneline', '-10', 'HEAD..origin/main'], REPO_ROOT);
    res.json({
        success: true,
        behind: Number(behindR.stdout.trim()) || 0,
        ahead: Number(aheadR.stdout.trim()) || 0,
        incomingCommits: (logR.stdout || '').split('\n').filter(Boolean),
    });
});

router.post('/apply', authenticate, async (_req: Request, res: Response) => {
    const progress = await readStatus();
    if (progress.state !== 'idle' && progress.state !== 'done' && progress.state !== 'error') {
        return res.status(409).json({ success: false, error: `Update already in progress (state: ${progress.state})` });
    }

    // Spawn the update script in the background so the HTTP response returns immediately.
    // The script writes to PROGRESS_FILE so the UI can poll.
    const scriptPath = path.join(REPO_ROOT, 'Scripts', 'system-update.sh');
    if (!existsSync(scriptPath)) {
        return res.status(404).json({ success: false, error: `Update script not found: ${scriptPath}` });
    }

    // Fire-and-forget — script handles its own progress reporting.
    await writeStatus({
        state: 'fetching',
        message: 'Update starting…',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        exitCode: null,
    });

    const child = spawn('/bin/bash', [scriptPath], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: os.homedir(), PROGRESS_FILE, UPDATE_LOG },
        detached: true,
        stdio: 'ignore',
    });
    child.unref();

    res.json({ success: true, message: 'Update started', progressFile: PROGRESS_FILE, logFile: UPDATE_LOG });
});

router.get('/apply/log', authenticate, async (_req: Request, res: Response) => {
    try {
        const log = await fsp.readFile(UPDATE_LOG, 'utf8');
        // Cap to last ~16 KB so the UI doesn't choke
        const tail = log.length > 16384 ? log.slice(-16384) : log;
        const progress = await readStatus();
        res.json({ success: true, log: tail, progress });
    } catch {
        res.json({ success: true, log: '', progress: await readStatus() });
    }
});

export default router;
