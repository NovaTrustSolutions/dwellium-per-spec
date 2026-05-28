# Dwellium — Install Guide

This guide bootstraps the full Dwellium app (backend + frontend + DnD routes + launchd autostart) on a fresh Mac, producing an installation that is feature/UI-identical to the development machine.

After install: open `http://localhost:5173/` in any browser. Both services autostart at every login and restart on crash. No terminal needed at runtime.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  macOS Login → launchd autostarts both agents                    │
│                                                                  │
│  com.dwellium.backend  → :3000   (Express + SQLite + 47 tables)  │
│  com.dwellium.frontend → :5173   (React Router v7 prod build)    │
│                                                                  │
│  Chrome → localhost:5173 → SPA → fetch :3000 → app works         │
└─────────────────────────────────────────────────────────────────┘
```

| Component | Lives at | Why |
|---|---|---|
| Frontend source | `~/dwellium-per-spec/` (or wherever you cloned this repo) | Edit here. Run `Scripts/rebuild-frontend.sh` to redeploy after changes. |
| Backend source | `~/dwellium-backend/ai-dashboard369-file-manager/` | TCC-free. launchd-readable. |
| Frontend production build | `~/Library/Application Support/Dwellium/frontend-build/` | TCC-free copy of `qualia-shell/build/`. Served by launchd. |
| Launcher scripts | `~/Library/Application Support/Dwellium/start-{backend,frontend}.sh` | TCC-free. nvm-aware. |
| LaunchAgent plists | `~/Library/LaunchAgents/com.dwellium.{backend,frontend}.plist` | Where launchd discovers agents at login. |
| Logs | `~/Library/Logs/dwellium-{backend,frontend}.{out,err}.log` | Tail with `tail -f`. |
| Per-user app data | `~/.dwellium/scribe/<userId>/` | User content (Scribe files, images, comments). Travels with the user across machines if you sync `~/.dwellium/`. |

**TCC note (macOS Privacy & Security):** launchd-spawned processes cannot read from `~/Downloads/`, `~/Documents/`, or `~/Desktop/` — even files you own. The architecture above places every launchd-readable file outside those folders. If you clone the repo into `~/Downloads/` (default for some users), `install.sh` still works because Terminal has TCC access for builds — but the built artifacts get copied to `~/Library/Application Support/Dwellium/` where launchd can serve them.

---

## Prerequisites

- macOS (any modern version, tested on Sonoma + Sequoia)
- Homebrew (`brew --version` should work)
- nvm with Node 20 or newer (`node --version` ≥ v20.0.0)
- A backend tarball (`ai-dashboard369-file-manager-*.tar.gz`) — obtain from the project owner

To install nvm + Node on a fresh Mac:

```bash
brew install nvm
mkdir -p ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshenv
echo '. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshenv
source ~/.zshenv
nvm install 20
nvm use 20
nvm alias default 20
```

> **Why `~/.zshenv` instead of `~/.zshrc`:** `~/.zshrc` is only sourced for interactive shells. launchd spawns non-interactive shells which would otherwise miss nvm. See `feedback-nvm-non-interactive-subshells.md` in memory.

---

## Install

```bash
# 1. Clone this repo (suggested location: ~/dwellium-per-spec)
git clone https://github.com/NovaTrustSolutions/dwellium-per-spec.git ~/dwellium-per-spec
cd ~/dwellium-per-spec

# 2. Run the installer with the path to your backend tarball
./install.sh ~/Downloads/dwellium-backend-2026-05-28.tar.gz
```

The installer does 8 steps and prints progress for each:

1. Verify Node ≥20 via nvm
2. Extract backend tarball to `~/dwellium-backend/`
3. `npm install` in both backend + frontend
4. Apply DnD backend routes (image upload + URL fetch)
5. Build the frontend
6. Stage build artifacts in `~/Library/Application Support/Dwellium/frontend-build/`
7. Install both launchd agents
8. Load both agents + verify both endpoints respond

Total time: ~3-5 minutes (dominated by `npm install` on first run).

When it finishes you'll see:

```
🎉 Install complete. Open http://localhost:5173/ in your browser.
```

---

## Per-user state — what does NOT transfer automatically

The CODE is deterministic — git SHA determines features, layout, UI. But the following per-user state is machine-local by design and must be reconfigured on each new machine:

- **LLM API keys** (Anthropic / OpenAI / Gemini / Local / Custom) — re-enter in Settings → API Keys. localStorage-backed.
- **Supabase / Postgres connection strings** — re-enter in Settings.
- **Scribe theme** + **Scribe layout** (TOC width, Minimap width, TabBar height) — defaults restored; re-customize if desired.
- **Saved layouts** (window manager presets) — re-create per user.
- **Scribe files + comments + images** — live under `~/.dwellium/scribe/<userId>/`. Sync this folder between machines if you want continuity. **Do not commit this folder** — it contains user data.
- **Backend SQLite database** — at `~/dwellium-backend/ai-dashboard369-file-manager/data/dwellium.db`. Includes properties, units, tenants, work orders, etc. Sync this file or the whole `data/` folder if you want shared state across machines (single-user only; concurrent writes will corrupt).

---

## Day-to-day

| Action | Command |
|---|---|
| Edit source + redeploy frontend | Edit in `qualia-shell/`, then `./Scripts/rebuild-frontend.sh` |
| Edit backend + auto-restart | Edit in `~/dwellium-backend/...` — ts-node-dev hot-reloads automatically |
| See backend logs | `tail -f ~/Library/Logs/dwellium-backend.out.log` |
| See frontend logs | `tail -f ~/Library/Logs/dwellium-frontend.out.log` |
| Restart backend | `launchctl kickstart -k gui/$(id -u)/com.dwellium.backend` |
| Restart frontend | `launchctl kickstart -k gui/$(id -u)/com.dwellium.frontend` |
| Stop both | `launchctl bootout gui/$(id -u) com.dwellium.backend && launchctl bootout gui/$(id -u) com.dwellium.frontend` |
| Re-enable both | `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dwellium.backend.plist && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dwellium.frontend.plist` |
| Uninstall everything | `./uninstall.sh` (see below) |

---

## Verifying parity across machines

After installing on a new machine, verify the deployment matches the original:

```bash
# 1. Same code (git SHA)
git rev-parse HEAD                                            # Should match the source machine's SHA
( cd ~/dwellium-backend/ai-dashboard369-file-manager && \
  git rev-parse HEAD 2>/dev/null || echo "(no-git posture per spec)" )

# 2. Same dependency versions
diff <(cd qualia-shell && npm list --depth=0 2>/dev/null) \
     <(ssh other-machine 'cd ~/dwellium-per-spec/qualia-shell && npm list --depth=0' 2>/dev/null)

# 3. Same launchd state on both machines
launchctl print gui/$(id -u)/com.dwellium.backend  | grep state
launchctl print gui/$(id -u)/com.dwellium.frontend | grep state

# 4. Same endpoints respond
curl http://localhost:3000/health
curl -I http://localhost:5173/
```

Identical SHAs + identical dependency trees + both services on → the UI, features, and layouts will match.

---

## Troubleshooting

### "Operation not permitted" in launchd logs

You're hitting macOS TCC. The repo or backend lives in `~/Downloads/`, `~/Documents/`, or `~/Desktop/`. Move it to `~/` (home root) and re-run install.sh. See `feedback-launchd-tcc-downloads.md` in memory.

### `lsof -ti :3000` says backend port is in use but app isn't responding

Old backend instance is still running:

```bash
lsof -ti :3000 | xargs kill
launchctl kickstart -k gui/$(id -u)/com.dwellium.backend
```

### Frontend serves an old version after editing source

The frontend serves a static production build. Run `./Scripts/rebuild-frontend.sh` to redeploy.

### `Cannot find module '@react-router/serve'`

The runtime in `~/Library/Application Support/Dwellium/frontend-build/` is missing the serve package. Re-run `./Scripts/rebuild-frontend.sh` — it reinstalls the runtime container.

### "Compilation error in scribeDndRoutes.ts" on backend boot

Missing TypeScript types for one of the DnD deps. Run:

```bash
cd ~/dwellium-backend/ai-dashboard369-file-manager
npm install --save-dev @types/jsdom @types/turndown @types/multer
launchctl kickstart -k gui/$(id -u)/com.dwellium.backend
```

---

## Uninstall

```bash
launchctl bootout gui/$(id -u) com.dwellium.backend 2>/dev/null || true
launchctl bootout gui/$(id -u) com.dwellium.frontend 2>/dev/null || true
rm -rf ~/Library/LaunchAgents/com.dwellium.{backend,frontend}.plist
rm -rf ~/Library/Application\ Support/Dwellium
rm -rf ~/Library/Logs/dwellium-{backend,frontend}.{out,err}.log
# Leave ~/dwellium-backend/ and the repo in place — those are your code.
# Leave ~/.dwellium/scribe/ in place — those are your files.
```
