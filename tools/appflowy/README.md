# AppFlowy Workspace — self-host (plan 047 phase 3 / plan 053)

Dwellium's **AppFlowy Workspace** widget embeds [AppFlowy](https://appflowy.com)
(Notion-style docs, database grids, kanban boards, calendars) for the property
desk: a lease tracker, a vendor board and the property SOP docs — starter
content ships in `templates/` (see `templates/IMPORT.md`).

**Read this first — you probably don't need this directory.** The hosted free
plan is the zero-cost path: sign up at <https://appflowy.com>, use the web app
at `https://appflowy.com/app`, and set `VITE_APPFLOWY_URL=https://appflowy.com/app`.
Verified 2026-08-23 (curl): `appflowy.com/app` answers 200 with **no
X-Frame-Options and no CSP `frame-ancestors`**, so it embeds straight into the
Dwellium widget. Free plan ("Free forever", appflowy.com/pricing): 1
collaborative workspace, up to 2 members, unlimited pages & blocks, 5 GB
storage, 10 AI responses. Self-host only if Andy outgrows that or wants the
data on his own box.

**License note (AGPL-3.0):** the AppFlowy-Cloud images run unmodified. The only
Dwellium-side change here is *config* — one `add_header` line in
`nginx/nginx.conf` (the file upstream tells self-hosters to alter). Never fork
or patch the images.

**Seat caveat (honest):** the free self-hosted tier is "One user seat (per
instance)" plus "Up to 3 guest editors" (AppFlowy-Cloud README — the project is
open-core). Andy + Lisa as two full seats needs the paid self-host plan; one
seat + guests is free.

Derived from (fetched 2026-08-23):
- Compose: <https://raw.githubusercontent.com/AppFlowy-IO/AppFlowy-Cloud/main/docker-compose.yml>
  (`docker-compose.yml` here is that file byte-for-byte below a citation header)
- Nginx: <https://raw.githubusercontent.com/AppFlowy-IO/AppFlowy-Cloud/main/nginx/nginx.conf>
  (`nginx/nginx.conf` here is upstream + the one Dwellium `frame-ancestors` header)
- Guide: <https://appflowy.com/docs/Step-by-step-Self-Hosting-Guide>

---

## What it costs (do not skip)

This is the **heaviest stack in the tool shed** — ~10 containers: nginx, MinIO,
Postgres (pgvector), Redis, GoTrue, appflowy_cloud, admin_frontend, ai, worker,
search, appflowy_web. Budget:

- **RAM/CPU:** 4 GB+ RAM, 2 vCPU (e2-standard-2 class). It does NOT fit the
  free e2-micro that runs listmonk/RustDesk — plan 047 prices this at
  **+$30-60/mo for a second VM**. There is no $0 hosting decision for it in the
  zero-cost addendum; that is why the hosted free plan above is the default.
- **Effort:** real ops — TLS, SMTP, OAuth redirect URIs, and version upgrades
  across all images. "3-4 days, ops is the cost" per plan 047.

## Setup

1. **VM + DNS:** a 2 vCPU / 4 GB VM with Docker + Docker Compose; point
   `flowy.<your-domain>` at it.

2. **Get the config baseline** from upstream — the compose reads ~60 env vars:

   ```sh
   git clone --depth 1 https://github.com/AppFlowy-IO/AppFlowy-Cloud
   cp AppFlowy-Cloud/deploy.env .env      # upstream's documented env template
   # then replace AppFlowy-Cloud/docker-compose.yml + nginx/nginx.conf with the
   # files from THIS directory (same upstream files; nginx has the one header).
   ```

   In `.env` set at minimum: `APPFLOWY_BASE_URL=https://flowy.<your-domain>`,
   fresh `GOTRUE_JWT_SECRET` / `POSTGRES_PASSWORD` / MinIO keys, and SMTP if
   you want magic-link email sign-in.

3. **Google OAuth via GoTrue** (phase-3 plan L381 — so Andy signs in with the
   same Google account as Dwellium):
   - Google Cloud Console → the Dwellium OAuth client → add redirect URI
     `https://flowy.<your-domain>/gotrue/callback`.
   - In `.env`:

     ```env
     GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
     GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<Dwellium Google client id>
     GOTRUE_EXTERNAL_GOOGLE_SECRET=<client secret>
     GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://flowy.<your-domain>/gotrue/callback
     ```

   - After Andy (and Lisa, if paying for the second seat) have signed in once,
     set `GOTRUE_DISABLE_SIGNUP=true` and `docker compose up -d gotrue` so
     nobody else can register.

4. **TLS:** either put certs at `nginx/ssl/certificate.crt` +
   `nginx/ssl/private_key.key` (the upstream nginx service mounts them), or
   front the stack with Caddy/certbot on the VM and keep nginx on port 80.

5. **Start + verify:**

   ```sh
   docker compose up -d
   docker compose ps                     # all healthy
   curl -s -o /dev/null -D - https://flowy.<your-domain> | grep -i frame
   #   → Content-Security-Policy: frame-ancestors 'self' https://argyleholocron.netlify.app http://localhost:5173
   ```

   That header comes from the one Dwellium line in `nginx/nginx.conf` — it is
   what lets the widget iframe the workspace. If you serve Dwellium from
   another origin, add it to that line.

6. **Wire Dwellium:** set `VITE_APPFLOWY_URL=https://flowy.<your-domain>` in
   Netlify env and redeploy. The Tools-hub row flips to Ready automatically.

7. **Seed content:** import `templates/` per `templates/IMPORT.md` (lease
   tracker grid, vendor board, property docs).

## Troubleshooting

- `docker compose ps` — anything unhealthy, read its logs
  (`docker compose logs gotrue` is the usual first suspect: bad
  `GOTRUE_DATABASE_URL` or SMTP).
- Widget shows "isn't reachable" — the VM is down or DNS/TLS broke; the
  widget's Re-check button re-pings after you fix it.
- Embed shows a blank frame on production — the `frame-ancestors` header is
  missing your Dwellium origin (step 5).
