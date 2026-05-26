# Dwellium — One-Command Bring-Up Runbook

*Produced at the close of the 24h "make it functioning" effort
(`feat/functionality-bringup`, Milestone 4). Run from a fresh Mac with Node
22 + npm installed. Re-tested 2026-05-25 against `main` at `f312b3d` with
branch `feat/functionality-bringup` checked out.*

This runbook reproduces the working state of all 26 widgets: 4 backend AI
paths live, 5 widgets explicitly degraded-by-design (honest "not configured"
messaging), 17 widgets returning real backend data.

---

## 0. Prereqs (one-time, host machine)

- macOS 14+ (tested on Darwin 25.5.0) or Linux equivalent
- Node 22 LTS via nvm (`nvm install 22 && nvm use 22`)
- `npm` 10+
- `sqlite3` CLI (optional — only for DB inspection)
- This repo cloned at any path; resolved here as `<repo>`
- The sibling backend at `Downloads/Dwellium-main/ai-dashboard369-file-manager`
  (its monorepo wrapper is `Downloads/Dwellium-main`).

> **Backend-A discipline.** The sibling backend's git remote contains an
> exposed token. **Never run `git push` / `pull` / `fetch` / `clone` against
> it.** Read-only ops (`git diff`, `git log`, `git status`) are fine. All
> route additions live in this repo as a patch (`Docs/backend-A-routes.patch`)
> so they survive a backend re-clone.

---

## 1. Bring up the backend (port 3000)

```bash
# A) cd into the backend
cd ~/Downloads/Dwellium-main/ai-dashboard369-file-manager

# B) rebuild the better-sqlite3 native binding for the current Node ABI.
#    The repo ships node_modules compiled against Node 20 (NODE_MODULE_VERSION
#    115). Node 22 needs 127. Skip this and the backend dies at first DB call.
npm rebuild better-sqlite3

# C) apply the M1 route additions if a fresh clone (skip if patch already
#    applied — `git status` will show clean if no new edits remain).
#    From the monorepo root (paths inside the patch are
#    `a/ai-dashboard369-file-manager/...`), apply with:
( cd ~/Downloads/Dwellium-main \
  && git apply --check "<repo>/Docs/backend-A-routes.patch" \
  && git apply "<repo>/Docs/backend-A-routes.patch" )
# Adds:
#   src/app.ts (mount tenantAdminRoutes)
#   src/routes/dwelliumRoutes.ts (+ /search/saved, /search/health)
#   src/routes/tenantAdminRoutes.ts (NEW — /tenant/admin/{stats,directory,
#                                          maintenance,payments,messages,
#                                          lease-alerts})

# D) create .env with the OpenAI key (Ilya pastes the value; never typed by
#    an automated agent — gitignored at monorepo root .gitignore:10)
read -s OPENAI_KEY
printf 'OPENAI_API_KEY=%s\n' "$OPENAI_KEY" > .env
unset OPENAI_KEY
# Required: OPENAI_API_KEY (project key, starts with sk-proj-).
# Optional: OPENAI_MODEL (default gpt-4o-mini). Trello/Twilio/Gmail/Telegram
# integrations stay off unless their respective *_API_KEY / *_TOKEN / *_ENABLED
# vars are set — see src/config/index.ts + process.env audit (~54 vars).

# E) start the backend (ts-node-dev --respawn; auto-seeds users + demo data)
npm run dev
# expect: "Server running on http://localhost:3000" + Dwellium ASCII box
```

Verify (different terminal):

```bash
curl -s http://localhost:3000/health | head -c 100
# → {"status":"ok","timestamp":"…","hooks":{…}}

curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"email":"andy@dwellium.com","password":"admin123"}' \
  http://localhost:3000/api/auth/login | head -c 80
# → {"user":{"id":"…","email":"andy@dwellium.com","role":"god",…},"token":"…"
```

### Backend hygiene

- **Only one `ts-node-dev` parent.** During development churn it's easy to
  leave orphans. Audit with `ps -ef | grep ts-node-dev | grep -v grep`.
  Stale parents serve `:3000` with **stale `process.env`** — every `.env`
  change requires a full kill of all parents, not just the port listener.
  Kill all: `pkill -f "ts-node-dev.*src/app"`.
- **Auto-seed is idempotent** — `[DwelliumSeed] Demo data already exists,
  skipping` is the expected restart log.

---

## 2. Bring up the frontend (port 5173)

```bash
cd <repo>/qualia-shell

# .env (gitignored; create if absent)
cat > .env <<'EOF'
VITE_API_URL=http://localhost:3000
VITE_USE_STATIC_API=false
EOF
# Optional (existing): VITE_ANAM_API_KEY for the avatar SDK; widgets that
# don't use it tolerate absence.

npm install   # only on a fresh clone
npm run dev   # → http://localhost:5173/
```

Login flow (Andy / god):

1. Browser to <http://localhost:5173/>
2. Click the splash overlay (*"Click to Access Terminal"*).
3. Click the **Andy** avatar.
4. Enter passphrase **`Comet2878!`** and Unlock.

> Frontend login is a local-only client gate; the backend's `AUTH_ENABLED`
> defaults to `false` (dev mode) so every request is auto-treated as
> Andy/god. Real `/api/auth/login` works too (10 seeded users; see
> `services/authService.ts:188`).

---

## 3. What works / honest-unavailable / fast-follow

| Status | Count | Widgets |
|---|---|---|
| **WORKING** (real backend data, end-to-end functional) | **17** | strata-dashboard, astra-dashboard, universal-shell, inbox, inbox-zero, tasks, home-upkeep-ai, automation-hub, tenant-portal-mgmt, ara-console *(AI live)*, fact-check-log *(AI live)*, thought-weaver, two-brains, file-manager, doc-viewer, notepad, control-panel, template-generator |
| **Honest-unavailable** (clean "not configured" messaging) | **5** | trello-board, terminal, hydra-ai, stella-agent, georgia-code, notebooklm-context |
| **SSR-recoverable** (functional in browser; SSR pageerror noise — Phase-9+ deferred per `CLAUDE.md`) | 3 | stella-agent, transcription, pdf-gear |

(Stella appears twice: honest-unavailable on its chat path; SSR-recoverable
on its module-load path. Both states are non-blocking for user-visible
function.)

### Backend-A route coverage map

| Mount | Status | Notes |
|---|---|---|
| `/api/auth/*` | ✅ live | 10 seeded users; Andy/`admin123` is god |
| `/api/dwellium/*` | ✅ live | properties + units + entities + workitems + stats |
| `/api/dwellium/search/{saved,health}` | ✅ live (M1 patch) | placeholders for GlobalSearch |
| `/api/dwellium/tenant/admin/*` | ✅ live (M1 patch) | 6 endpoints; raw SQL against `entity_profiles` + `units` + `workitems` |
| `/api/inbox/*`, `/api/tasks/*` | ✅ live | 14 demo inbox items seeded |
| `/api/maintenance/*` | ✅ live | 10 systems / 14 warnings / 10 overdue |
| `/api/transcribe/*` | ✅ live | analyze + fact-check use the OpenAI key |
| `/api/ara/*` | ✅ live | 14 modes; `gpt-4o-mini` by default |
| `/api/trello/*` | ⚠️ returns 500 (TRELLO_API_KEY unset) | frontend shows honest "Trello not configured" |
| `/api/hydra/*` | ❌ no mount | frontend shows honest "Hydra multi-model is not configured" |
| `/api/stella/*` + `/api/v1/telegram/*` | ❌ no mount | frontend shows "Stella agent is offline — requires the Stella Python agent service" |
| `/api/terminal/*` | ❌ no mount | frontend shows "Terminal backend not available" |
| `/api/georgia-code/*` | ❌ no mount | frontend shows "Georgia Code index is not loaded" |
| `/api/v1/notebooklm/*` | ❌ no mount | frontend shows "NotebookLM not connected" |

### Fast-follow (≤1d work each)

1. **OpenAI fact-check prompt tuning.** `factCheckText()` returns "unverifiable"
   on obvious facts; prompt is too narrow. ~30 min.
2. **SSR-time browser-global guards** at `TranscriptionHub.tsx:376`,
   stella-agent's `localStorage` init, pdf-gear's `DOMMatrix` import.
   All 3 already render via CSR fallback; this just silences SSR pageerrors.
   ~1h total. Tracked at Phase-9+ in `CLAUDE.md §Conventions`.
3. **Vision smoke-test** for `/api/maintenance/analyze-photo` — wired
   end-to-end but unverified (would burn gpt-4o vision quota). ~5 min once
   a real test photo is on hand.
4. **Hydra / Stella / Georgia / NotebookLM real backends** — these are the
   M3 specialized services the original 24h plan flagged as likely-deferred.
   Each is a multi-hour to multi-day stand-up depending on scope.

---

## 4. Common operations

```bash
# Kill all dev processes (when handing off / restarting)
pkill -f "ts-node-dev.*src/app"
pkill -f "vite"
lsof -ti :3000 -P :5173 -P | xargs -r kill

# Inspect backend DB
sqlite3 ~/Downloads/Dwellium-main/ai-dashboard369-file-manager/data/dwellium.db \
  "SELECT entity_type, COUNT(*) FROM entity_profiles GROUP BY entity_type;"

# Re-capture the 26-widget popup baseline
cd <repo>/qualia-shell
npx playwright test --config=_preview-capture-backend.config.ts \
  --project=chromium e2e/_preview-capture-backend.ts \
  --reporter=list --workers=1
# → screenshots + _classification.json at <repo>/Docs/preview-screenshots-backend/

# Shell-mode re-capture (subset of widgets that need shell tree)
npx playwright test --config=_shell-recapture.config.ts \
  --project=chromium --reporter=list --workers=1
```

---

## 5. Branch state at handoff

| | |
|---|---|
| Branch | `feat/functionality-bringup` |
| Base | `main` at `f312b3d` (unchanged) |
| Tracked commits | `0850c78` api.ts port fix · `e33a701` popup providers + honest states · plus M3+M4 commit (this milestone) |
| Backend A HEAD | `b9de83f Initial commit` (unchanged; only working-tree edits) |
| Backend A patch | `Docs/backend-A-routes.patch` (3 files, 212 line additions) |
| Frontend `.env` | gitignored; `VITE_API_URL=http://localhost:3000` + `VITE_USE_STATIC_API=false` |
| Backend `.env` | gitignored at monorepo root; one `OPENAI_API_KEY=sk-proj-…` line |

To merge into `main`: PR `feat/functionality-bringup` → `main` after the
usual review. The branch is intentionally focused on functionality bring-up
and does not modify any of the Phase-8+/Phase-9+ closure artifacts.
