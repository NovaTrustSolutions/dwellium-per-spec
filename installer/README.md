# Dwellium Installer

A click-through installation wizard for a new Mac. A desktop window walks the user
through each section — **Prerequisites → Get the code → Dependencies → Build →
Services → Integrations → Finish** — and each section installs automatically when
they click **Continue**, with a live log and progress bar. It reuses the proven
commands from the repo's `install.sh`.

## Run it (dev — needs Node already installed)
```bash
cd installer
npm install
npm start
```

## Build a double-click installer (for bare machines)
```bash
cd installer
npm install
npm run dist        # → installer/dist/"Dwellium Installer.dmg"
```
Distribute the `.dmg`. A new user double-clicks it — **no Node or prerequisites
needed first**, because Electron bundles its own runtime. The wizard then installs
everything else (Homebrew, Node, git, Python, uv, the app, services, integrations).

## What each section does
| Section | What it runs |
|---|---|
| Prerequisites | Installs Homebrew (if missing), then `node`, `git`, `python@3.12`, `uv` via brew. Docker optional. |
| Get the code | Locates the Dwellium repo folder + the backend tarball; extracts backend to `~/dwellium-backend`. |
| Dependencies | `npm install` in backend + frontend; applies the Scribe DnD backend routes. |
| Build | `npm run build` (frontend) + stages the runtime under Application Support. |
| Services | Installs + loads the launchd agents (autostart at login), verifies `:3000` + `:5173`. |
| Integrations | Optional: LangFlow, CrewAI, Paperclip, Open Notebook (Docker), Google sign-in. |
| Finish | Opens `http://localhost:5173/`. |

## Honest notes
- **Some sub-steps are interactive at the OS level.** Installing Homebrew/Xcode CLT may prompt for your Mac password via a system dialog. Paperclip onboarding, the Google sign-in, and Open Notebook (which needs Docker Desktop running) may open a browser or need a moment — the wizard surfaces this in the log and lets you Retry.
- **Backend is a tarball** (no-git posture). Pick the `.tar.gz` in the "Get the code" step.
- **Verified here:** all JS parses, `package.json` is valid, and every embedded install script passes `bash -n`. Running and packaging the Electron app happen on the Mac (can't run a GUI/installer in the build sandbox), so do a `npm start` pass before shipping the `.dmg`.
