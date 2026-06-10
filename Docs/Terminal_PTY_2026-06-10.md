# Terminal real-TTY upgrade (xterm.js + node-pty) — 2026-06-10

The in-app Terminal now renders a real terminal emulator, so full-screen /
interactive programs (vim, top, htop, less, python3, ssh prompts) work — colors,
cursor control, and resize included. Two halves:

## Frontend (built + tested, ships now)

- Added **`@xterm/xterm`** + **`@xterm/addon-fit`** (package.json updated).
- `Terminal.tsx` renders a live session through xterm.js, loaded via **dynamic
  import in a client effect (SSR-safe — no top-level import)**:
  - keystrokes stream live: `term.onData → POST /input`
  - PTY output renders: poll `data.output` → `term.write`
  - `FitAddon` reflows the grid + sends real `cols/rows` to `/resize` (so vim lays out)
- The **offline** shell keeps the plain `<pre>` + command box, unchanged.
- Verified: `tsc -b` green + **Terminal 10/10** (online tests now assert through a
  mocked `term.write`; offline + command/signal tests unchanged) + regression green.

## Backend (ready-to-apply patch — you apply it)

`Docs/Terminal_PTY_Backend.md` swaps the session spawn in
`src/routes/terminalRoutes.ts` from `child_process.spawn(shell, ['-i'])` (no TTY)
to **node-pty** (`pty.spawn`, `name: 'xterm-256color'`), wires real resize, and
drops the manual input echo (the PTY echoes). **node-pty is already installed.**
The HTTP API + response shapes are unchanged, so the frontend needs no further
edits.

## ⚠️ Do this first on your Mac

I added two dependencies and ran `npm install` in the Linux sandbox, so **sync
your Mac node_modules before the gate**:

```
cd qualia-shell && npm install
```

(Your darwin esbuild/rollup binaries are still present; this just installs the two
xterm packages and reconciles the lockfile. If the build ever complains about a
platform binary, `rm -rf node_modules && npm install`.)

## Then

```
npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_PORT=3010 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```

## Live check

Apply the backend patch (`Docs/Terminal_PTY_Backend.md`), restart the backend,
reload the app, open the Terminal → run `vim`, `top`, or `python3`. They should
render and accept input like a real terminal; resize the window and vim reflows.

## Files

```
qualia-shell/package.json                       + @xterm/xterm, @xterm/addon-fit
qualia-shell/src/components/Terminal/Terminal.tsx   xterm.js renderer + keystroke streaming
qualia-shell/src/components/Terminal/Terminal.css   xterm host styles
qualia-shell/src/test/Terminal.test.tsx             xterm-mocked assertions
Docs/Terminal_PTY_Backend.md                    node-pty backend patch
```
