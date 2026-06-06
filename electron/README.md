# Dwellium Desktop (Electron)

A **standalone** macOS build of Dwellium: one installer carries the UI **and** the
Node backend, with no separate server to start. Because the backend stores
everything on the filesystem (no database), pointing the data root at a folder on
a passport drive makes the app **and** your data travel together.

## How it works

```
┌─────────────────────────── Dwellium.app ───────────────────────────┐
│  Electron main (main.cjs)                                           │
│    ├─ spawns the bundled Node backend  ──► 127.0.0.1:38473          │
│    │     (Electron's own Node — nothing to install on the host)     │
│    ├─ front server 127.0.0.1:38472                                  │
│    │     • serves the static SPA (resources/client)                 │
│    │     • reverse-proxies /api, /health, /uploads ► backend        │
│    └─ BrowserWindow ► http://127.0.0.1:38472   (same origin, no CORS)│
└─────────────────────────────────────────────────────────────────────┘
```

The SPA is built with `VITE_API_URL=http://127.0.0.1:38472`, so its `/api/*`
calls hit the front proxy → backend. Private fixed ports avoid clashing with a
dev backend on `:3000`.

## Build the installer (run on a Mac)

Requirements: macOS, Node 18+, npm, and the backend repo present
(default sibling `../ai-dashboard369-file-manager`).

```bash
# from the repo root (Dwellium -Per Spec)
bash Scripts/build-electron-mac.sh
# → electron/dist-installer/Dwellium-1.0.0-universal.dmg
```

The script: builds the SPA in SPA mode (non-destructively patches then restores
`react-router.config.ts` / `app/routes.ts` / `vite.config.ts`), builds + stages
the backend, then runs electron-builder for a **universal** (Intel + Apple
Silicon) `.dmg`.

Overrides:

| Env | Default | Purpose |
|-----|---------|---------|
| `DWELLIUM_BACKEND_DIR` | `../ai-dashboard369-file-manager` | backend repo location |
| `DWELLIUM_BACKEND_ENTRY` | `dist/index.js` | backend's built entrypoint (set to whatever the repo emits) |
| `DWELLIUM_FRONT_PORT` | `38472` | front-proxy port baked into the SPA |

## Passport-drive data

Files/notes live under the **data root** (default `~/.dwellium`). To keep them on
the drive so they travel between Macs, launch with:

```bash
DWELLIUM_DATA_ROOT=/Volumes/<YOUR_DRIVE>/Dwellium open -a Dwellium
```

(or choose the folder in-app). The File Explorer header shows the active root.

## Installing on another Mac (Gatekeeper)

The build is **unsigned**, so the first launch on a new Mac needs a one-time
bypass: **right-click `Dwellium.app` → Open → Open**. After that it opens
normally.

### Signed + notarized (optional, removes the bypass)

With an Apple Developer ID, set `identity` in `package.json` → `build.mac` to your
certificate and add notarization (`afterSign` + `notarytool` / `electron-notarize`
with `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`). Then the .dmg
opens without the right-click step and can be shared beyond your own machines.

## Notes / honesty

- Verified in CI-sandbox: `node --check` on `main.cjs` + `preload.cjs`, the SPA
  builds with the Electron API base, and the app's gate (tsc + vitest) is
  unaffected. **electron + electron-builder + the .dmg are produced on macOS** —
  they can't run in the Linux build sandbox.
- The backend bundling assumes the core Node/Express + filesystem backend
  (File Explorer / Scribe / ingest / schedule / terminal / workspace / docs-convert,
  per `Docs/backend-*-routes.ts`). If the full `ai-dashboard369-file-manager`
  repo adds a database or native modules, confirm `DWELLIUM_BACKEND_ENTRY` and
  rebuild native deps for `universal` (`electron-builder` handles most via
  `npmRebuild`).
- LLM features work via your per-user API keys (re-enter on each Mac; internet
  required). All other local-first features work fully offline.

## Reproducible builds (no machine-to-machine drift)

The build is pinned so the same source produces the same app payload anywhere:

- **Node** is pinned by `.nvmrc` (root + `electron/`). `build-electron-mac.sh`
  aborts if your Node major differs — run `nvm use` first.
- **Exact dependencies** come from committed lockfiles via strict `npm ci`
  (qualia-shell, electron, and the backend) — never `npm install`.
- **Electron / electron-builder** are pinned exact in `package.json` + lock, with
  `electronVersion`, `npmRebuild: false`, and a fixed `buildVersion`.
- **The bundled backend is pinned** to a commit in `BACKEND_PIN`. The build
  refuses to bundle a different commit (override only with
  `DWELLIUM_ALLOW_BACKEND_DRIFT=1`, never for releases). First run with an empty
  `SHA=` records the current backend HEAD — **commit `BACKEND_PIN` afterward**.
- Every build emits `dist-installer/build-manifest.json` recording Node/npm,
  Electron versions, the two lockfile hashes, the backend SHA, the repo HEAD, and
  a **SHA-256 fingerprint of the staged client payload**. Two machines prove
  parity by diffing this file — identical `clientPayloadSha256` + lock hashes +
  `backendSha` ⇒ identical app.

What is *not* byte-identical: the `.dmg` container itself (electron-builder embeds
timestamps; the image is unsigned). The **payload inside** it is deterministic —
that's what the manifest fingerprints. For a byte-identical, verifiable installer
you'd add Apple code-signing + notarization (Developer ID).

Requirement on the backend repo: it must have a committed `package-lock.json`
(the build `npm ci`s it). Runtime caveat: PDFGear OCR (tesseract.js) still fetches
its wasm core + language model from a CDN on first use — self-host those under
`qualia-shell/public/` for fully offline, version-locked OCR.
