# Installing Dwellium on another Mac (from the .dmg)

The installer is **one file**: `electron/dist-installer/Dwellium-1.0.0-arm64.dmg` (~486 MB).
It carries the full app — UI **and** the Node backend (47-table SQLite, One Save,
ARA routes, knowledge graph, automation scheduler) — nothing else to install.
Built + smoke-tested 2026-06-12 (frontend `b2c4480` line, backend pinned `d795176`).

**Target:** Apple Silicon Macs (M1/M2/M3/M4). For an Intel Mac, rebuild with
`DWELLIUM_MAC_ARCH=x64 bash Scripts/build-electron-mac.sh` on an Intel machine.

## Install (2 minutes)

1. Copy the `.dmg` to the new Mac (AirDrop / drive / iCloud).
2. Open it, drag **Dwellium** into **Applications**.
3. First launch: **right-click → Open → Open** (the app is unsigned — macOS
   Gatekeeper requires this once; afterwards it opens normally).
4. **Wait ~40 seconds on first boot** — the backend sidecar initializes its
   full schema (47 tables, permissions, scheduler) before the API comes up.
   The UI loads immediately; backend-powered widgets come alive when it's ready.

## Set up (same as the dev machine)

- **Login:** identical auth-disabled local mode as the dev machine (the
  built-in user). All data is local to the Mac.
- **API keys:** Control Panel → **API Keys** — add your Anthropic / OpenAI /
  Gemini keys (per user, encrypted at rest). Supabase / Postgres / search keys
  in the same panel. This unlocks ARA chat, skills, dreams, image gen, etc.
- **Knowledge Graph (optional):** the graph engine is the `graphify` CLI.
  On the new Mac, run once in Terminal:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh   # if uv isn't installed
  uv tool install "graphifyy[mcp]"
  ```
  Then hit **Rebuild** in the Knowledge Graph widget. Everything else works
  without this.
- **Stella/CoPaw Python agent (optional):** not bundled; the app shows its
  honest offline state. Stella chat still works through your LLM key.

## Where data lives

- App data root: `~/.dwellium` by default — changeable in the app
  (Settings → Data Folder). Point it at a portable drive and the app + data
  travel together.
- To MIGRATE your existing data from the dev machine: copy `~/.dwellium` and
  the backend's `data/` content into the new Mac's data root before first run.
  A fresh install otherwise starts clean (by design).

## Ports / coexistence

The app uses private localhost ports **38472** (UI origin) and **38473**
(backend sidecar) — it never conflicts with a dev stack on :5173/:3000 and
binds to 127.0.0.1 only (nothing exposed to the network).

## Rebuilding the installer (dev machine)

```bash
export DWELLIUM_BACKEND_DIR=~/dwellium-backend/ai-dashboard369-file-manager
export DWELLIUM_BACKEND_ENTRY=dist/app.js
bash Scripts/build-electron-mac.sh        # needs Node 22 (nvm use 22)
# → electron/dist-installer/Dwellium-1.0.0-arm64.dmg
```

The script stages an SPA-mode frontend build + the backend at the commit pinned
in `electron/BACKEND_PIN`, rebuilds the ABI-bound natives (better-sqlite3,
node-pty) against the pinned Electron, and packages the dmg.
