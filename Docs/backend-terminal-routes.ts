/**
 * Terminal Routes — child-process backed shell sessions.
 *
 * NO PTY (deliberate). Uses Node's child_process.spawn with stdin/stdout
 * pipes. Trade-off: line-based interactive programs work (npm, git, ls,
 * grep, curl…), but full-screen TUIs (vim, less, top) won't render. That
 * matches the Terminal widget's polling I/O model anyway.
 *
 * Endpoints:
 *   GET  /capabilities                       — shell, cwd, tool availability
 *   POST /sessions                            — spawn a session, return id
 *   GET  /sessions                            — list active sessions for this user
 *   GET  /sessions/:id/output?cursor=N        — incremental output since cursor
 *   POST /sessions/:id/input  { input }       — write to stdin
 *   POST /sessions/:id/resize { cols, rows }  — best-effort env update
 *   DELETE /sessions/:id                      — kill the process
 *
 * Sessions are kept in-memory and tied to the backend process lifetime —
 * a backend restart drops everything, which is fine for a dev tool.
 *
 * Installation:
 *   cp this file to ~/dwellium-backend/.../src/routes/terminalRoutes.ts
 *   patch src/app.ts:
 *     import terminalRoutes from './routes/terminalRoutes';
 *     app.use('/api/terminal', terminalRoutes);
 *   restart backend (launchctl kickstart -k gui/$(id -u)/com.dwellium.backend)
 */
import { Router, Request, Response } from 'express';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';
import { authenticate } from '../services/authMiddleware';

interface Session {
    id: string;
    userId: string;
    shell: string;
    cwd: string;
    cols: number;
    rows: number;
    startedAt: string;
    lastActiveAt: string;
    closedAt: string | null;
    exitCode: number | null;
    proc: ChildProcessWithoutNullStreams | null;
    output: Buffer[];        // ring buffer slices
    outputBytes: number;
    cursor: number;          // global byte offset of the start of output[0]
    totalEmitted: number;    // global byte counter at the end of output
}

const MAX_OUTPUT_BYTES = 1_000_000; // 1 MB per session
const SESSIONS = new Map<string, Session>();

// Probe a binary's presence (only on session list — cheap enough)
async function which(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
        const probe = spawn('/usr/bin/which', [cmd]);
        probe.on('close', (code) => resolve(code === 0));
        probe.on('error', () => resolve(false));
    });
}

function pickShell(): string {
    // Prefer zsh (macOS default), fall back to bash, fall back to sh
    const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean) as string[];
    return candidates[0] || '/bin/sh';
}

function pushOutput(session: Session, chunk: Buffer): void {
    session.output.push(chunk);
    session.outputBytes += chunk.length;
    session.totalEmitted += chunk.length;
    // Trim from the front if we're over the cap
    while (session.outputBytes > MAX_OUTPUT_BYTES && session.output.length > 1) {
        const dropped = session.output.shift()!;
        session.outputBytes -= dropped.length;
        session.cursor += dropped.length;
    }
}

function getOutputFromCursor(session: Session, cursor: number): { text: string; nextCursor: number } {
    // If client cursor predates our buffer (data was trimmed), advance them to start
    const effective = Math.max(cursor, session.cursor);
    const localOffset = effective - session.cursor;
    const joined = Buffer.concat(session.output);
    const slice = joined.subarray(Math.min(localOffset, joined.length));
    return {
        text: slice.toString('utf8'),
        nextCursor: session.cursor + joined.length,
    };
}

const router = Router();

router.get('/capabilities', authenticate, async (req: Request, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ success: false, error: 'Not authenticated' });
    const shell = pickShell();
    const cwd = os.homedir();
    // Tools to check — common things developers expect
    const toolNames = ['git', 'node', 'npm', 'python3', 'curl', 'jq', 'ssh', 'rsync', 'docker'];
    const tools = await Promise.all(toolNames.map(async (name) => ({
        name,
        available: await which(name),
    })));
    res.json({ success: true, shell, cwd, tools });
});

router.post('/sessions', authenticate, (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    const shell = pickShell();
    const cwd = (req.body?.cwd && typeof req.body.cwd === 'string')
        ? path.resolve(req.body.cwd)
        : os.homedir();
    const cols = Number(req.body?.cols) || 100;
    const rows = Number(req.body?.rows) || 30;

    let proc: ChildProcessWithoutNullStreams;
    try {
        proc = spawn(shell, ['-i'], {
            cwd,
            env: { ...process.env, TERM: 'dumb', PS1: '$ ', LINES: String(rows), COLUMNS: String(cols) },
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: `Spawn failed: ${err.message}` });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const session: Session = {
        id, userId, shell, cwd, cols, rows,
        startedAt: now, lastActiveAt: now,
        closedAt: null, exitCode: null,
        proc, output: [], outputBytes: 0, cursor: 0, totalEmitted: 0,
    };

    proc.stdout.on('data', (chunk: Buffer) => {
        pushOutput(session, chunk);
        session.lastActiveAt = new Date().toISOString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
        pushOutput(session, chunk);
        session.lastActiveAt = new Date().toISOString();
    });
    proc.on('close', (code) => {
        session.closedAt = new Date().toISOString();
        session.exitCode = code;
        session.proc = null;
        pushOutput(session, Buffer.from(`\r\n[process exited with code ${code}]\r\n`));
    });
    proc.on('error', (err) => {
        pushOutput(session, Buffer.from(`\r\n[spawn error: ${err.message}]\r\n`));
        session.closedAt = new Date().toISOString();
        session.exitCode = -1;
        session.proc = null;
    });

    SESSIONS.set(id, session);

    res.json({
        success: true,
        session: serializeSession(session),
    });
});

router.get('/sessions', authenticate, (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    const list = Array.from(SESSIONS.values())
        .filter((s) => s.userId === userId)
        .map(serializeSession);
    res.json({ success: true, sessions: list });
});

router.get('/sessions/:id/output', authenticate, (req: Request, res: Response) => {
    const session = SESSIONS.get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.userId !== req.user?.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    const cursor = Number(req.query.cursor) || 0;
    const { text, nextCursor } = getOutputFromCursor(session, cursor);
    res.json({
        success: true,
        data: {
            output: text,
            cursor: nextCursor,
            session: serializeSession(session),
        },
    });
});

router.post('/sessions/:id/input', authenticate, (req: Request, res: Response) => {
    const session = SESSIONS.get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.userId !== req.user?.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    if (!session.proc || session.closedAt) return res.status(410).json({ success: false, error: 'Session closed' });
    const input = String(req.body?.input ?? '');
    if (!input) return res.json({ success: true });
    try {
        session.proc.stdin.write(input);
        // Echo input back to output so the user sees what they typed (TERM=dumb has no echo)
        if (input !== '' && input !== '' && input !== '') {
            pushOutput(session, Buffer.from(input));
        }
        session.lastActiveAt = new Date().toISOString();
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/sessions/:id/resize', authenticate, (req: Request, res: Response) => {
    const session = SESSIONS.get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.userId !== req.user?.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    session.cols = Number(req.body?.cols) || session.cols;
    session.rows = Number(req.body?.rows) || session.rows;
    res.json({ success: true });
});

router.delete('/sessions/:id', authenticate, (req: Request, res: Response) => {
    const session = SESSIONS.get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.userId !== req.user?.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    if (session.proc) {
        try { session.proc.kill('SIGTERM'); } catch { /* already dead */ }
    }
    SESSIONS.delete(req.params.id);
    res.json({ success: true });
});

function serializeSession(s: Session) {
    return {
        id: s.id, shell: s.shell, cwd: s.cwd,
        cols: s.cols, rows: s.rows,
        startedAt: s.startedAt, lastActiveAt: s.lastActiveAt,
        closedAt: s.closedAt, exitCode: s.exitCode,
    };
}

export default router;
