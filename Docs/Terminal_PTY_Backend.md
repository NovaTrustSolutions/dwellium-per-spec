# Backend patch — real PTY for the Terminal (node-pty)

Upgrades `/api/terminal` sessions from `child_process.spawn(shell, ['-i'])` (no
TTY) to a real **node-pty** PTY, so the in-app Terminal supports full-screen /
interactive programs (vim, less, top, ssh prompts, REPLs) with proper colors,
cursor control, and resize.

**Repo:** `ai-dashboard369-file-manager` · file: `src/routes/terminalRoutes.ts`.
`node-pty` is already a dependency and **already installed** in `node_modules`,
so no new install is needed. Read-only — apply it yourself.

The HTTP API and response shapes are **unchanged** (`/capabilities` flat,
`/sessions` flat, `/output` → `data.output` string), so the frontend (now an
xterm.js emulator) works without further changes.

---

## Edits to `src/routes/terminalRoutes.ts`

**1. Import node-pty (replace the child_process import).**

```ts
// remove:  import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { spawn } from 'child_process'; // keep ONLY if `which()` still uses it
```

**2. Session type — hold a PTY instead of a child process.**

```ts
interface Session {
  // …unchanged fields…
  pty: IPty | null;          // was: proc: ChildProcessWithoutNullStreams | null
  // output ring buffer fields unchanged
}
```

**3. `POST /sessions` — spawn a PTY, stream its data, handle exit.**

```ts
router.post('/sessions', authenticate, (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const shell = pickShell();
  const cwd = (req.body?.cwd && typeof req.body.cwd === 'string') ? path.resolve(req.body.cwd) : os.homedir();
  const cols = Number(req.body?.cols) || 100;
  const rows = Number(req.body?.rows) || 30;

  let proc: IPty;
  try {
    proc = pty.spawn(shell, [], {
      name: 'xterm-256color',       // a real terminal type (was TERM=dumb)
      cols, rows, cwd,
      env: { ...process.env, TERM: 'xterm-256color' } as { [k: string]: string },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Spawn failed: ${err.message}` });
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const session: Session = {
    id, userId, shell, cwd, cols, rows,
    startedAt: now, lastActiveAt: now, closedAt: null, exitCode: null,
    pty: proc, output: [], outputBytes: 0, cursor: 0, totalEmitted: 0,
  };

  proc.onData((data: string) => {                 // PTY emits a STRING
    pushOutput(session, Buffer.from(data, 'utf8'));
    session.lastActiveAt = new Date().toISOString();
  });
  proc.onExit(({ exitCode }) => {
    session.closedAt = new Date().toISOString();
    session.exitCode = exitCode;
    session.pty = null;
    pushOutput(session, Buffer.from(`\r\n[process exited with code ${exitCode}]\r\n`));
  });

  SESSIONS.set(id, session);
  res.json({ success: true, session: serializeSession(session) });
});
```

**4. `POST /sessions/:id/input` — write to the PTY; DROP the manual echo.**

A PTY echoes input itself, so remove the old `pushOutput(session, Buffer.from(input))`
echo line (otherwise every keystroke shows twice).

```ts
router.post('/sessions/:id/input', authenticate, (req, res) => {
  const session = SESSIONS.get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.userId !== req.user?.id) return res.status(403).json({ success: false, error: 'Forbidden' });
  if (!session.pty || session.closedAt) return res.status(410).json({ success: false, error: 'Session closed' });
  const input = String(req.body?.input ?? '');
  if (!input) return res.json({ success: true });
  try {
    session.pty.write(input);          // PTY echoes — do NOT pushOutput here
    session.lastActiveAt = new Date().toISOString();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

**5. `POST /sessions/:id/resize` — real PTY resize (lets vim lay out correctly).**

```ts
router.post('/sessions/:id/resize', authenticate, (req, res) => {
  const session = SESSIONS.get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.userId !== req.user?.id) return res.status(403).json({ success: false, error: 'Forbidden' });
  const cols = Number(req.body?.cols) || session.cols;
  const rows = Number(req.body?.rows) || session.rows;
  session.cols = cols; session.rows = rows;
  try { session.pty?.resize(cols, rows); } catch { /* dead pty */ }
  res.json({ success: true });
});
```

**6. `DELETE /sessions/:id` — kill the PTY.**

```ts
if (session.pty) { try { session.pty.kill(); } catch { /* already dead */ } }
```

> Replace any other `session.proc` references with `session.pty` (e.g. the
> `/signal` route → `session.pty?.kill('SIGINT')`). `pushOutput` /
> `getOutputFromCursor` / `/capabilities` / `/output` stay exactly as they are.

---

## Apply + test

```
cd ai-dashboard369-file-manager
# rebuild node-pty against your current Node if needed:
npm rebuild node-pty
npx tsc --noEmit
npm run dev          # backend on :3000
```

Then **reload the app**, open the Terminal (it'll connect via the xterm.js
emulator that already shipped), and run `vim`, `top`, `htop`, `python3`, or
`ssh` — they should render and accept input like a real terminal. Resize the
window and vim reflows.

## Notes

- If `npm rebuild node-pty` fails (native toolchain), the old `child_process`
  version still works for basic commands — keep it until the rebuild succeeds.
- The frontend already streams keystrokes (`term.onData → /input`) and sends
  `/resize` on container resize, so no frontend change is needed.
