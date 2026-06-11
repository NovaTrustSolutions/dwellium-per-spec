# FUCKUPS.md — Mistakes Log (read this before you say "I can't")

> **What this file is.** A running log of mistakes made working on this repo, each
> with root cause, the fix, and how to avoid it next time. It exists because the
> same failures kept recurring and because "I can't do that" was said when the
> thing was actually possible or already solved.

> **For Ilya:** if an agent claims it consulted this file, it must quote the
> canary token below verbatim. No token = it didn't read this.

---

## 🤡 CANARY TOKEN

```
🤡 CLOWN-CANARY: DWELLIUM-9F3A-"honk-honk" 🤡
```

If you are an agent (Claude Code, Cowork, or otherwise) and you have read this
file, you MUST quote `DWELLIUM-9F3A-"honk-honk"` back to Ilya when you reference
it — especially before telling him something can't be done. If you don't quote
it, you didn't actually read the file, and your "I can't" is invalid.

---

## THE RULE (also in CLAUDE.md + AGENTS.md)

**Before you tell Ilya you "can't" do something** — or that something is
impossible, blocked, unavailable, or "not currently permitted" — you MUST:

1. Open and read THIS file (`FUCKUPS.md`) first.
2. Check whether the blocker is already logged here with a solution.
3. Only then may you claim inability — and you must (a) cite the clown canary
   token to prove you read this, and (b) state the *specific* verification you
   ran that proves it's impossible (a command + its output), not a guess.

"I can't" without those two things is itself a fuck-up. Log it below.

---

## LOG (newest first)

### F-011 — "My session work disappeared": :5173 was a stale launchd-served COPY, not the repo
- **Problem:** Ilya kept opening localhost:5173 and seeing none of the session's
  work — looked like sessions were being lost. They never were; the work was
  always in `~/Downloads/Dwellium -Per Spec` (uncommitted until 2026-06-10).
- **Root cause:** A past session created `com.dwellium.frontend.plist`
  (launchd, RunAtLoad + KeepAlive) serving a pre-built copy at
  `~/Library/Application Support/Dwellium/frontend-build` (919MB, stale since
  May 28) on :5173 — placed there because launchd can't read ~/Downloads (TCC).
  It silently squatted :5173 and respawned when killed, so any real
  `npm run dev` got bumped to :5174 while the browser showed the stale copy.
- **Fix (2026-06-10):** `launchctl bootout gui/$UID/com.dwellium.frontend`;
  moved frontend-build + start-frontend.sh + the plist to Trash. Backend agent
  (`com.dwellium.backend`) intentionally KEPT. Verified :5173 now serves from
  the repo (lsof cwd check + UIX marker present in /src/styles/variables.css).
- **Prevention:** Before concluding "work is missing," verify WHAT the preview
  server is serving: `lsof -p $(lsof -tnP -iTCP:5173 -sTCP:LISTEN) | grep cwd`.
  Don't re-create a launchd frontend agent serving a copied build unless Ilya
  asks; if one is needed it must rebuild from the repo on login, not serve a
  frozen snapshot.

### F-010 — Tried to live-boot the backend in the Cowork Linux sandbox to smoke-test new routes; can't (Mac-native better-sqlite3)
- **Problem:** Wanted to verify the new Gmail/Calendar routes by booting `ai-dashboard369-file-manager` (`npm run dev`) + curling them in-sandbox. The server crashes at startup before listening.
- **Root cause:** `node_modules/better-sqlite3/build/Release/better_sqlite3.node: invalid ELF header` — the mounted `node_modules` is compiled for macOS (Darwin/arm64); the Cowork sandbox is Linux x86. The native addon can't load. Sister to F-001 (sandbox can't run the full build/boot).
- **Do NOT "fix" with `npm rebuild`/`npm install` in the sandbox** — that overwrites the Mac's native binary with a Linux one and breaks the backend on the Mac.
- **Verification used instead:** `npx tsc --noEmit` in the backend → exit 0, 0 errors (proves the new routes compile + the service signatures match). The live route smoke-test (boot + `curl /api/integrations/status`, `/api/gmail/test`, `/api/calendar/events`) must run on the Mac.
- **Prevention:** For backend changes, verify with `tsc` in-sandbox; run any live boot/curl on the Mac. Never rebuild native modules against the mounted `node_modules`.

### F-009 — Claimed the "click a widget → bounced to login" bug was fixed + verified; it wasn't (missed a second vector)
- **Problem:** Told Ilya the logout-on-widget-click bug was fixed and verified.
  It still happened — and then on *multiple* widgets. The earlier work hardened
  only ONE of two logout vectors.
- **Root cause:** Two code paths can reach `clearTokens()` on a backend hiccup:
  (1) the mount `/api/auth/me` validator, and (2) `authFetch() → doRefresh()`
  when a *data* endpoint 401s (the path an actual widget click hits). The earlier
  fix only hardened (1). `doRefresh()` still called `clearTokens()` on ANY non-OK
  `/api/auth/refresh` response (5xx / 404 / even a 401), so any widget whose call
  401'd → silent refresh failed → logout. Every authed widget shared this one
  defect, which is why it looked like "multiple widgets." The regression test I
  added back then only exercised the mount path, so the green gate never covered
  the widget-click path → false confidence.
- **Fix (commit pending):** `doRefresh()` NEVER clears auth now — a failed refresh
  is not authority to log out. The ONLY authorities to clear the session are the
  mount `/api/auth/me` validator (a definitive 401/403 → `clearTokens`) and an
  explicit `logout()`. On a reachable-but-erroring backend, `doRefresh` surfaces
  the global "connect?" banner instead. `qualia-shell/src/context/UserContext.tsx`
  (`doRefresh` non-OK branch).
- **Verification (ran before claiming):** added 4 regression tests on the REAL
  path (authed → widget call 401 → refresh 5xx / 404 / 401 → assert still logged
  in; + transparent retry on refresh success). `npx vitest run
  src/test/UserContext.test.tsx` → 15/15 pass; `npx tsc -b` → exit 0.
- **Prevention:** When fixing an auth/session logout bug, enumerate EVERY
  `clearTokens()` call site AND every code path that can reach each one, then add
  a test for the exact user-facing path (logged-in → authed call returns 401 →
  assert session survives) — not just the mount/reload path. A green gate that
  doesn't exercise the logged-in→click-widget flow is not proof the flow works.

### F-008 — Said "I can't" / made excuses instead of checking first
- **Problem:** Reflexively claimed inability ("I can't enter that", "that's not
  possible", "I already did that") without verifying. Wasted Ilya's time and
  eroded trust.
- **Root cause:** Speaking from assumption instead of checking the code, the
  history, or this log.
- **Fix:** This file + the BEFORE-YOU-SAY-YOU-CAN'T rule above.
- **Prevention:** Read FUCKUPS.md → verify with a command → *then* speak. If it
  turns out you genuinely can't, log a new entry here with the proof.

### F-007 — Claimed a feature was "already done" when it wasn't built
- **Problem:** Told Ilya the "backend failure never logs you out + Do you want to
  connect?" banner was already complete. It did not exist.
- **Root cause:** Summarized from memory instead of grepping the codebase.
- **Fix:** Built it for real — `src/lib/backendStatusStore.ts` +
  `src/components/Shell/BackendConnectionBanner.tsx`, wired in `App.tsx` +
  `UserContext.tsx` (commit `7e2cc63`).
- **Prevention:** NEVER claim a feature exists/works from memory. `grep`/`Read`
  the actual files first. "Recalling past work" = run a search, don't narrate.

### F-006 — Said "fixed/works" before running any verification
- **Problem:** Declared the auth fix resolved the cold-reload login bug without
  confirming it.
- **Root cause:** Skipped the verification step; claim preceded proof.
- **Fix:** Re-ran tsc + tests and pasted the output; flagged what was NOT
  confirmed (live cold-reload still open).
- **Prevention:** STRUCTURAL VERIFICATION GATE — before typing "done/fixed/works/
  verified", run the check and paste the output inline ABOVE the claim. No proof
  → say "NOT verified."

### F-005 — Stale `.git/index.lock` blocked all git operations (happened twice)
- **Problem:** `fatal: Unable to create '.git/index.lock': File exists` — git
  refused to commit. Second time: an in-sandbox `git status` from the Linux
  workspace created a 0-byte lock that the sandbox could NOT delete
  (`EPERM: operation not permitted` on the mounted macOS folder).
- **Root cause:** (a) a crashed earlier run left a stale lock; (b) running
  git index-mutating commands against the *mounted* repo from the Linux sandbox,
  which is not permitted to unlink files in `.git/`.
- **Fix:** `rm -f ".git/index.lock"` — on the Mac (the host owns the file).
  Before removing, confirm no live git process: `ps aux | grep '[g]it'`.
- **Prevention:** From the Cowork/Linux sandbox, only do READ-ONLY git on the
  mounted repo (`git log`, `git show`, `git diff`, `git status` is borderline —
  it takes the index lock). Run any `git add`/`commit`/`status` that mutates the
  index ON THE MAC, or via the file tools (Write/Edit) for non-git file changes.

### F-004 — `npx vite build` silently no-ops in this repo
- **Problem:** Running `npx vite build` exits 0 and produces ZERO artifacts.
- **Root cause:** RR v7 framework mode — the `@react-router/dev/vite` plugin
  takes over the build pipeline; direct vite-CLI is inert.
- **Fix:** Use `npx react-router build` (and `VITE_APPFOLIO_SEEDS=false
  npx react-router build` for the second mode).
- **Prevention:** The gate/build always uses `react-router build`, never
  `vite build`. (Also documented in CLAUDE.md Conventions.)

### F-003 — Launched the autobuild in the wrong place
- **Problem:** `./launch-autobuild.sh` → "command not found"; `cat
  AUTOBUILD_PROMPT.md` → "No such file"; empty prompt → "Input must be provided".
- **Root cause:** Ran from the `qualia-shell/` subdir (not repo root), and/or in
  the same Terminal tab that was running `npm run dev` (foreground process eats
  the keystrokes), and/or the files weren't placed yet.
- **Fix:** `cd ~/Downloads/"Dwellium -Per Spec"` (repo root), open a FRESH tab
  (⌘T) not the dev-server tab, then `./autobuild-dwellium.sh`.
- **Prevention:** Always state the exact `cd` + a fresh-tab instruction; confirm
  required files exist before invoking.

### F-002 — Browser-subagent loops burned 30–60 min
- **Problem:** Browser subagents got stuck in retry loops for non-visual work.
- **Root cause:** Used a heavyweight browser agent where a direct command would
  do; no kill-switch.
- **Fix/Prevention:** Prefer `run_command`/CDP/`curl` for any non-visual op
  (localStorage, DOM reads, "is it live"). Only use a browser subagent when Ilya
  explicitly asks for a screenshot/UI check. Kill a stuck subagent at +5 min and
  switch methods; never retry the same losing strategy.

### F-001 — Could not run the full gate in the Cowork Linux sandbox
- **Problem:** `npx vitest run` (98 files) and `react-router build` can't
  complete in-sandbox: each bash call is capped at ~45s (cold Vite optimize
  exceeds it) and the mount blocks `unlink`, so the build's cleanup step throws
  `EPERM`.
- **Root cause:** Sandbox per-call timeout + mounted-filesystem permission model;
  not a code defect (the build pipeline ran to emitting `build/server/...`).
- **Fix:** Verify what IS possible in-sandbox (tsc -b, targeted vitest files,
  PII scan, code review); run the FULL gate on the Mac where it's ~10–30s.
- **Prevention:** Don't claim the full gate "passed/failed" from the sandbox.
  State exactly what you ran and where, and hand the user the Mac one-liner.

---

## How to add an entry
Append at the TOP of the LOG (newest first), next ID up, same shape:
`Problem → Root cause → Fix → Prevention`. Keep it specific and command-level.
