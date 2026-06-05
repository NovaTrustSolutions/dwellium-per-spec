# Per-user Integrations Vault + Backend Health Meter — CONTINUOUS AUTONOMOUS driver

You run UNATTENDED for ~2 hours. Ilya is NOT at the keyboard and will NOT answer.
**Never ask questions. Never stop for review.** Re-fed every iteration — re-orient from the
repo, do ONE bounded cycle, leave the tree committed + green, end turn.

## THE ONE RULE
**"Compiles" and "tests pass" do NOT mean it works.** Every cycle: **actually run the app
and drive the feature in a real headless browser** and confirm it FUNCTIONS — keys save +
reload on a fresh login; the health meter shows real per-service status. Paste runtime proof
(assert + screenshot to `Scripts/autorun/intg-shots/`) BEFORE any "works/done" claim. If you
can't make it work this cycle, log it honestly to `Scripts/autorun/INTG_PROGRESS.md`.

Global rules (Ilya's CLAUDE.md): 🧪 every response; ETA per step; proof before claims; NO
`git push`; never undo Ilya's commits; never delete `Scripts/autorun/HALT`.

═══════════════════════════════════════════════════════════════════════════════
## GOAL (three deliverables: A Integrations Vault · B Health Meter · C Terminal works)
═══════════════════════════════════════════════════════════════════════════════
### A. Per-user Integrations Vault — one place to save ALL integration credentials
Every integration the app uses gets a field in ONE Control-Panel section, saved **per user**
so each user has their own SDK keys + API keys that **auto-load on login**. The foundation
already exists — EXTEND it, don't rebuild:
- `src/utils/integrationsStore.ts` — per-user `createLocalStorageStore` keyed by
  `integrationsUserIdHolder.current` (Andy ≠ Lisa). Loads on login already.
- `src/types/integrations.ts` — the `IntegrationsBundle` type.
- `src/components/ControlPanel/LlmIntegrationsSection.tsx` — the current UI (only
  anthropic/openai/gemini/supabase today).
- `src/hooks/useIntegrations.ts` — consumer hook.
**Work:** widen `IntegrationsBundle` + the section to cover EVERY integration the app
references. Enumerate them from the codebase (grep for `apiKey`, `API_KEY`, `Bearer`,
`/api/`, env `VITE_*`). Known set to cover at minimum: **Anthropic, OpenAI, Gemini, Ollama/
Hermes (local LLM URL), Supabase (url+anon key), Postgres (connection string), Telegram bot
token, Anam (avatar) key, NotebookLM, Firecrawl, ElevenLabs/TTS if present.** Group them
(LLM providers / Data / Agents / Voice / Other). Each field: label, masked input (show/hide),
save, and a per-field "Test" button where a cheap reachability check exists. **All values
stay in the per-user local store** (never logged, never sent anywhere except the integration
itself). On login as a different user, the fields must reload THAT user's saved values.

### C. Terminal widget — make it ACTUALLY work like a real terminal
The Terminal widget (`src/components/Terminal/Terminal.tsx`) renders a shell UI and talks to
`${API_BASE}/api/terminal/*` (capabilities, `POST /sessions`, input, output stream). It
currently shows *"Terminal backend not available — no /api/terminal route configured"* when
that backend route is absent. A backend contract already exists at
`Docs/backend-terminal-routes.ts` (Node `child_process.spawn`, no PTY:
`GET /capabilities`, `POST /sessions`, `POST /sessions/:id/input`, output polling/stream).
**Work (frontend repo only — you cannot edit Ilya's separate backend):**
1. **Verify + fix the frontend** so that, GIVEN a working `/api/terminal` backend, the widget
   creates a session, sends a command, and renders streamed stdout/stderr correctly — type
   `echo hello` / `ls` / `pwd` and see real output, like a normal terminal. Fix any frontend
   bug (session lifecycle, input encoding, output rendering, scrollback, resize). Runtime-prove
   it against the backend if `/api/terminal` is live on :3000.
2. **If the backend route is missing** (the loop earlier found :3000 lacks several routes):
   confirm it via a probe, add `/api/terminal` to `Scripts/autorun/BACKEND_ROUTES_NEEDED.md`
   with the exact endpoints + shapes, and make the widget's empty/offline state honest and
   non-crashing (clear "backend route not configured" message, not a dead black box). The
   ready-to-paste backend impl already lives in `Docs/backend-terminal-routes.ts` — point to it.
3. Make it feel like a terminal: monospaced, focus-on-click, Enter submits, Ctrl+C sends SIGINT
   if the backend supports it, command history (↑/↓), clear button. a11y + no console errors.

### B. Backend Services Health Meter
A live health meter showing the status of each backend service the app depends on. Build on
`src/components/AstraDashboard/ObservabilityPanel.tsx` (and/or `StatusCheckModule.tsx`).
- Ping each service endpoint and show **🟢 up / 🟡 degraded / 🔴 down** with latency.
- Services to monitor (from `Scripts/autorun/BACKEND_ROUTES_NEEDED.md`): the main API
  (`GET /api/health` if it exists, else a known-good route like `/api/auth/me`), Hermes/
  Ollama (`/api/hermes/status` → `ollamaOnline`), Stella python agent (`/api/stella/status`),
  ThoughtWeaver (`/api/thought-weaver/*`), Honcho (`/api/honcho/stats`), Workspace/file
  (`/api/file-explorer/tree`), plus any integration the user configured a key for (ping its
  health if cheap). Show an **overall health %** (services-up / total).
- Auto-refresh on an interval (e.g. 15–30s) with a manual "Refresh" button; per-service last-
  checked time. Graceful: a 404/timeout = 🔴 with the reason, never a crash.
- Make it reachable: a Health widget/panel that's easy to find (register it, or surface it in
  Control Panel + the dashboard Observability tab).

═══════════════════════════════════════════════════════════════════════════════
## AUTONOMY + GATE
═══════════════════════════════════════════════════════════════════════════════
- NO QUESTIONS. Chain cycles. Log forks to `Scripts/autorun/INTG_DECISIONS.md`.
- ONE CYCLE PER ITERATION → run it live → prove → gate → commit → mark done → end turn.
- ALWAYS GREEN + COMMITTED. Can't get green → revert your changes, log why, move on.
- `touch Scripts/autorun/STOP` only on a true blocker (same fail 3× / destructive).
  `touch Scripts/autorun/ALL_DONE` only when BOTH A and B are runtime-verified + closure done.
- Branch: CURRENT (`feat/scribe-ingestion-honcho`). Do NOT create a new branch.
- **SSR-safe:** keys/health use `window`/`localStorage`/`fetch` — only inside event handlers
  / `useEffect`, never at module top-level or in `useState(()=>…)`. Persist via
  `createLocalStorageStore`. The SSR smoke test will catch violations.

### Strict gate (after code changes, before commit)
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell" && npx tsc -b && npx vitest run && npx react-router build && cd .. && SMOKE_TEST_PORT=3458 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```

### Runtime harness (reuse the cleanup one)
`Scripts/autorun/_drive.mjs` already logs in (splash → Andy → passphrase `Comet2878!` →
Unlock) and opens widgets. Extend it with actions you need (open Control Panel, type a key,
save, reload page, assert the value persisted for that user; open Health, assert per-service
dots render). Serve + drive in ONE shell (background server dies when the shell exits):
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell"
npx react-router build
( npx react-router-serve build/server/index.js > /tmp/serve.log 2>&1 & SRV=$!; \
  for i in $(seq 1 15); do curl -sf -o /dev/null http://localhost:3000/ && break; sleep 1; done; \
  node ../Scripts/autorun/_drive.mjs <action> ../Scripts/autorun/intg-shots/<file>.png; kill $SRV )
```

═══════════════════════════════════════════════════════════════════════════════
## CYCLE LIST (in order; each ends with runtime proof + commit)
═══════════════════════════════════════════════════════════════════════════════
1. **Audit + enumerate.** Grep the codebase for every integration/credential the app uses
   (apiKey/Bearer/VITE_*/`/api/*` hosts). Write `Scripts/autorun/INTEGRATIONS_INVENTORY.md`:
   each integration, what consumes it, current field-or-missing, cheap health/test endpoint if
   any. No code yet.
2. **Widen the data model.** Extend `IntegrationsBundle` (`src/types/integrations.ts`) +
   `integrationsStore` to hold every enumerated integration, grouped. Keep per-user keying.
   Unit test the store (save→reload→per-user isolation: Andy's keys ≠ Lisa's). Gate. Commit.
3. **Build the Vault UI.** Expand `LlmIntegrationsSection.tsx` (or a new `IntegrationsVault`
   it renders) into grouped sections covering all integrations: masked inputs, show/hide,
   Save, per-field Test where cheap. Wire to the store via `useIntegrations`. Gate. Commit.
4. **Prove per-user save + reload-on-login (RUNTIME).** Drive it: log in as Andy → open
   Control Panel → type a test key in (e.g.) OpenAI → Save → reload the page / re-login →
   assert the field still shows Andy's value; (if a second user is testable) confirm a
   different user does NOT see it. Screenshot. Commit only when the assert passes.
5. **Health meter — data layer.** Create `src/components/.../serviceHealth.ts`: a typed
   `checkService(name, url, method)` returning `{ name, status:'up'|'degraded'|'down', ms,
   detail }`, and `checkAllServices()` returning the array + overall %. Pure + injectable
   fetch; unit-tested with mocked fetch. Gate. Commit.
6. **Health meter — UI.** Build the meter on `ObservabilityPanel.tsx` (+ surface in Control
   Panel): per-service 🟢/🟡/🔴 + latency + last-checked, overall health %, auto-refresh
   interval + manual Refresh. Graceful on 404/timeout. Gate. Commit.
7. **Prove health meter (RUNTIME).** Drive it live against the real :3000 backend: open the
   Health panel, assert ≥1 service shows 🟢 (e.g. thought-weaver, which is live) and the
   down ones show 🔴 with a reason (not a crash). Screenshot showing the dots + overall %.
   Commit when the assert passes.
8. **Terminal — probe + frontend audit.** Build the app, serve it, drive the Terminal widget
   live against :3000. Probe whether `/api/terminal/capabilities` + `POST /api/terminal/sessions`
   exist. Record in INTG_PROGRESS.md: does the widget reach a backend? does a session start?
   does typing a command return output? Screenshot the actual state. No fixing yet — honest baseline.
9. **Terminal — make it function.** Fix the frontend so a session starts, `echo hello`/`pwd`/`ls`
   round-trip and render, history (↑/↓), Enter submits, clear, focus-on-click, Ctrl+C if supported.
   If the backend route is ABSENT: make the offline/empty state honest + non-crashing AND add
   `/api/terminal` to `BACKEND_ROUTES_NEEDED.md` (endpoints + shapes, point to
   `Docs/backend-terminal-routes.ts`). **Runtime proof:** if backend live → screenshot real
   command output; if absent → screenshot the clean "backend not configured" state (no black box,
   no crash) + the documented route. Gate. Commit.
10. **Polish + a11y + CLOSURE.** Consistent empty/loading/error states, labels, keyboard nav,
   no console errors across all three surfaces (Vault, Health, Terminal). Write
   `Scripts/autorun/INTG_CLOSURE.md` (what shipped, per-user proof, health-meter proof, terminal
   proof, screenshots, anything deferred). Fresh gate. `touch Scripts/autorun/ALL_DONE`.

Split any oversized cycle: coherent chunk → prove → commit → DON'T mark done.
**Reuse existing stores/patterns. Never fake a runtime check. Keys never leave the local store.**

═══════════════════════════════════════════════════════════════════════════════
## END
═══════════════════════════════════════════════════════════════════════════════
When A + B are runtime-verified and closure is written: append the push command
(`git push -u origin feat/scribe-ingestion-honcho`) to INTG_PROGRESS.md and
`touch Scripts/autorun/ALL_DONE`. Do NOT push.

LOOP CONTRACT: one bounded cycle, RUNTIME-verified, committed, logged — then end the turn.
