# Photo Vault — Immich on the office Mac (plan 047 phase 2, zero-cost)

Dwellium's **Photo Vault** widget embeds a self-hosted [Immich](https://immich.app)
photo/video server for **inspection photos, move-in/move-out condition records and
before/after maintenance shots**. Per the plan-047 zero-cost addendum it runs on
**Andy's always-on office Mac** (Docker Desktop) and is reached from anywhere
through **Tailscale** at `https://<mac-name>.<tailnet>.ts.net` — no monthly spend.

Why Tailscale HTTPS and not the office LAN address: the Dwellium web app is served
over `https://`, and an `http://` LAN URL can be neither iframed nor pinged from an
https page (mixed content). Tailscale's `ts.net` certificates give the Mac a real
HTTPS URL that works from any device on the tailnet.

**License note (AGPL-3.0):** the Immich images run unmodified. All customization is
config, API, or Dwellium-side widget code. Never fork or patch the images.

Verified against (2026-08-20): the official release compose
(<https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml>,
v3.1.0), <https://docs.immich.app/install/requirements>,
<https://docs.immich.app/install/docker-compose>,
<https://tailscale.com/kb/1153/enabling-https>, <https://tailscale.com/kb/1242/tailscale-serve>,
and the Immich OpenAPI spec v3.1.0 (`x-api-key` header auth; `/albums`,
`/assets`, `/shared-links` endpoints).

---

## What the Mac needs

- Apple Silicon or Intel Mac that stays on (System Settings → check Energy /
  Battery so it never sleeps; a Mac mini is ideal).
- ~6 GB free RAM for Docker (Immich minimum; 4 GB works because we leave the
  machine-learning container off — see below).
- Disk space for the photo library on the internal SSD (database must NOT live
  on a network share).

## Setup (do these in order)

1. **Install Docker Desktop** — download from
   <https://www.docker.com/products/docker-desktop/> (pick "Apple Silicon" on an
   M-series Mac), open it once, and in Docker Desktop Settings enable
   **Start Docker Desktop when you sign in**.

2. **Copy this folder to the Mac** — put `docker-compose.yml` and `.env.example`
   in a folder like `~/immich`, then in Terminal:

   ```sh
   cd ~/immich
   cp .env.example .env
   mkdir -p ~/DwelliumPhotos/library ~/DwelliumPhotos/postgres
   open -e .env   # edit: UPLOAD_LOCATION, DB_DATA_LOCATION, DB_PASSWORD
   ```

   `DB_PASSWORD` must be letters and numbers only.

3. **Start Immich**:

   ```sh
   docker compose up -d
   ```

   First start downloads a few GB of images. When it settles, open
   <http://localhost:2283> on the Mac.

4. **Create the admin account** — the first sign-up in the web UI becomes admin.
   Use Andy's email; store the password in the usual password manager.

5. **Create an API key** (Dwellium's backend bridge will use it later) — in the
   Immich web UI click your avatar → **Account Settings** → **API Keys** →
   **New API Key**, name it `dwellium-service`, copy the key once and store it.
   The Immich API authenticates with this key in the `x-api-key` header
   (endpoints Dwellium will use: `POST /albums`, `PUT /albums/{id}/assets`,
   `POST /assets`, `POST /shared-links`).

6. **Turn off the ML features we didn't start** — this compose leaves the
   `immich-machine-learning` container commented out (it's the heavy part;
   optional on Apple Silicon). In the Immich web UI go to **Administration →
   Settings → Machine Learning Settings** and disable it (Smart Search +
   Facial Recognition) so the server doesn't look for the missing container.
   Want smart search later? Uncomment the block in `docker-compose.yml`,
   `docker compose up -d`, re-enable the setting.

7. **Install Tailscale** on the Mac — <https://tailscale.com/download> (or the
   Mac App Store), sign in to the Dwellium tailnet. Then in the Tailscale
   **admin console → DNS** enable **MagicDNS** and **HTTPS Certificates**
   (one-time toggle for the whole tailnet; machine names become public in the
   certificate ledger — keep the Mac's name boring, e.g. `dwellium-office`).

8. **Serve Immich over tailnet HTTPS** — in Terminal on the Mac:

   ```sh
   tailscale serve --bg 2283
   tailscale serve status   # shows the https://<mac-name>.<tailnet>.ts.net URL
   ```

   `tailscale serve` proxies the local port to HTTPS with an automatically
   provisioned `ts.net` Let's Encrypt certificate and stays on across reboots
   (`--bg`). It is tailnet-only — nothing is exposed to the public internet
   (that would be `tailscale funnel`, which we do NOT use). If the `tailscale`
   command isn't found, the macOS CLI lives at
   `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.

9. **Point Dwellium at it** — in Netlify: Site settings → **Environment
   variables** → add `VITE_IMMICH_URL = https://<mac-name>.<tailnet>.ts.net`
   → redeploy. The Photo Vault widget and the Tools hub flip from
   "needs setup" to "ready" automatically.

10. **Install Tailscale on the viewers too** — the office Mac only answers
    inside the tailnet, so Andy's/Lisa's laptops and phones each need Tailscale
    installed and signed in. Off the tailnet, the widget shows a polite
    "Connect to Tailscale to view photos" card instead of a blank frame.

## CORS — not needed (for now)

The Dwellium widget only (a) pings `VITE_IMMICH_URL` with a `no-cors` fetch to
test reachability and (b) iframes / deep-links the Immich web UI. Neither is a
cross-origin API read from the browser, so **no CORS configuration is required
in Immich**. If Dwellium later calls the Immich API directly from the browser,
route it through the Dwellium backend proxy (`/api/photos/*`, plan 047 pattern
3) with the API key server-side — do not reach for CORS headers.

If the embedded frame ever renders blank while the status dot says reachable,
the browser is blocking the embed (e.g. third-party-cookie login) — use the
widget's **Open ↗** button; same data, full app.

## Care and feeding

- **Backups**: Immich writes automatic database dumps under
  `UPLOAD_LOCATION/backups`. Make sure the Mac's Time Machine (or any backup)
  covers `~/DwelliumPhotos`.
- **Upgrades**: `cd ~/immich && docker compose pull && docker compose up -d`.
  Check the Immich release notes first — majors occasionally need a new
  compose file.
- **Certificate renewals**: `tailscale serve` renews its own cert; nothing to do.
