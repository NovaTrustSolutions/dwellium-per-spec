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
`/assets`, `/shared-links` endpoints). Plan 053 re-verified the API against the
pinned spec snapshot
<https://raw.githubusercontent.com/immich-app/immich/c98c20e9639257187e1e3b2efa9f1a7f3b465a9d/open-api/immich-openapi-specs.json>
(mirrored in the backend at `tests/fixtures/immich-openapi-paths.json` with a
drift-guard test) and added <https://tailscale.com/kb/1223/funnel> for the
public shared-links path below.

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

5. **Create an API key** (the Dwellium backend proxy uses it — plan 053) — in
   the Immich web UI click your avatar → **Account Settings** → **API Keys** →
   **New API Key**, name it `dwellium-service`, copy the key once and store it.
   The Immich API authenticates with this key in the `x-api-key` header.

   Give the key to the backend as env (`deploy/cloud-run.sh` upserts the
   secret `dwellium-immich-api-key`):

   ```sh
   IMMICH_URL=https://<mac-name>.<tailnet>.ts.net \
   IMMICH_API_KEY=<the key> \
   ./deploy/cloud-run.sh
   ```

   This powers the widget's native **Albums / Upload / Share** tabs and the
   Strata **Photos** button through `/api/photos/*` (endpoints used, all
   verified against the pinned OpenAPI snapshot: `GET/POST /albums`,
   `GET /albums/{id}`, `PUT /albums/{id}/assets`, `POST /assets`,
   `GET /assets/{id}/thumbnail`, `POST /search/smart`, `POST /search/metadata`,
   `GET/POST /shared-links`). The key never reaches the browser. Until both
   env vars are set the tabs show an honest "needs setup" card.

   ⚠️ Reachability: the Cloud Run backend is NOT on the tailnet, so with plain
   `tailscale serve` it cannot reach the `ts.net` URL — the tabs will say
   "unreachable" even with the env set. Enable **Tailscale Funnel** (section
   below) to make the URL publicly reachable, which fixes the backend proxy
   AND resident-facing shared links in one move.

6. **Turn off the ML features we didn't start** — this compose leaves the
   `immich-machine-learning` container commented out (it's the heavy part;
   optional on Apple Silicon). In the Immich web UI go to **Administration →
   Settings → Machine Learning Settings** and disable it (Smart Search +
   Facial Recognition) so the server doesn't look for the missing container.

   **Enabling smart search + facial recognition later** (plan 053, gap rows
   4/5): uncomment the `immich-machine-learning` block in
   `docker-compose.yml`, run `docker compose up -d`, then in
   **Administration → Settings → Machine Learning Settings** re-enable
   **Smart Search** and **Facial Recognition**, and run the "Smart Search" and
   "Face Detection" jobs from **Administration → Jobs** to index the existing
   library. Hardware caveat: this adds roughly **+2 GB RAM** to Docker's
   footprint and inference is **CPU-only inside Docker Desktop's VM** (the
   armnn/cuda hwaccel tags do not apply on a Mac) — first-time indexing of a
   large library will keep the Mac busy for hours. Until ML is on, the Photo
   Vault widget's search automatically falls back to filename/EXIF search and
   says so in the results header.

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
   (`--bg`). It is tailnet-only — nothing is exposed to the public internet.
   To make shared links work for residents/vendors (and the Cloud Run backend
   proxy reachable), upgrade to **Tailscale Funnel** — see the dedicated
   section below. If the `tailscale` command isn't found, the macOS CLI lives
   at `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.

9. **Point Dwellium at it** — two halves (plan 053):
   - **Frontend (iframe tab)**: in Netlify: Site settings → **Environment
     variables** → add `VITE_IMMICH_URL = https://<mac-name>.<tailnet>.ts.net`
     → redeploy. The Photo Vault widget and the Tools hub flip from
     "needs setup" to "ready" automatically.
   - **Backend (Albums / Upload / Share tabs + Strata Photos button)**: set
     `IMMICH_URL` + `IMMICH_API_KEY` on the backend as shown in step 5.

10. **Install Tailscale on the viewers too** — the office Mac only answers
    inside the tailnet, so Andy's/Lisa's laptops and phones each need Tailscale
    installed and signed in. Off the tailnet, the widget shows a polite
    "Connect to Tailscale to view photos" card instead of a blank frame.

## Tailscale Funnel — public shared links for residents (plan 053)

`tailscale serve` keeps Immich tailnet-only, which means the **Share** tab's
links only open on staff devices. To hand a shared album to a resident or a
vendor (move-out photos, before/after proof), the Mac has to answer from the
public internet. Tailscale **Funnel** does that with the same certificate and
no port-forwarding:

```sh
tailscale serve reset          # drop the tailnet-only proxy from step 8
tailscale funnel --bg 2283     # serve Immich on https://<mac-name>.<tailnet>.ts.net:443, PUBLICLY
tailscale funnel status        # confirm "Funnel on" and the URL
```

(Funnel must be allowed once for the tailnet: the command prints an admin-console
approval link the first time. Funnel serves on ports 443/8443/10000 — the plain
`tailscale funnel --bg 2283` maps local port 2283 onto public 443.)

After enabling Funnel:
- **Shared links work for anyone** — the Photo Vault Share tab's URLs
  (`https://<mac>.<tailnet>.ts.net/share/<key>`) open off-tailnet, with the
  expiry/password you set on the link.
- **The backend proxy reaches Immich** — Cloud Run is not a tailnet member, so
  the native Albums/Upload/Share tabs need this (or stay "unreachable").
- Viewers no longer need Tailscale for the iframe tab either.

**The security trade-off, plainly:** Funnel puts your Immich **login page on
the public internet**. Anyone who finds the URL can attempt to sign in; the
only things protecting the photo library are Immich's password strength, the
API key's secrecy, and Immich staying patched (`docker compose pull`
regularly — public exposure turns upgrade discipline from nice-to-have into
mandatory). Shared-link URLs are unguessable but unlisted-not-private: anyone
a resident forwards a link to can open it until it expires. If that trade-off
is not acceptable, stay on `tailscale serve` — everything keeps working for
staff on the tailnet; only resident-facing links and the Cloud Run proxy need
Funnel.

## Mobile app — phone backups from the field

The Immich mobile app (iOS/Android) gives techs auto-backup of inspection
photos taken on their phones: install **Tailscale** on the phone (skip if
Funnel is on), install the **Immich** app, set the server URL to
`https://<mac-name>.<tailnet>.ts.net`, and sign in. In the app enable
**Backup** for the camera album (background + selective album backup are in
the app's Backup settings). Photos then appear in the Photo Vault widget like
any other upload; move them into the right "Property — Unit" album from the
Albums tab or the Immich UI.

## External libraries — index existing photo folders read-only

To surface an existing folder of photos on the Mac (say `~/OldUnitPhotos`)
without importing/duplicating it, mount it read-only and register it as an
Immich **external library** (<https://docs.immich.app/features/libraries/>):

1. In `docker-compose.yml`, under `immich-server: volumes:`, uncomment/add:
   `- /Users/andy/OldUnitPhotos:/mnt/media/old-unit-photos:ro`
2. `docker compose up -d`
3. Immich web UI → **Administration → External Libraries** → **Create
   library** → owner Andy → add the import path `/mnt/media/old-unit-photos`
   → **Scan**.

The `:ro` mount guarantees Immich can never modify or delete the originals.

## OAuth login (optional; config-only)

Password login is the zero-cost default. If Andy wants Google sign-in:
Immich web UI → **Administration → Settings → OAuth Settings** → enable, fill
Issuer URL `https://accounts.google.com`, the existing Dwellium Google client
ID/secret, and add the redirect URI
`https://<mac-name>.<tailnet>.ts.net/auth/login` to that Google client. No
image modification involved (AGPL rule intact).

## CORS — not needed

The Dwellium widget (a) pings `VITE_IMMICH_URL` with a `no-cors` fetch to test
reachability, (b) iframes / deep-links the Immich web UI, and (c) — since plan
053 — talks to the Immich API **only through the Dwellium backend proxy**
(`/api/photos/*`) with the API key server-side. None of these is a
cross-origin API read from the browser, so **no CORS configuration is required
in Immich** — keep it that way; never reach for CORS headers instead of the
proxy.

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
