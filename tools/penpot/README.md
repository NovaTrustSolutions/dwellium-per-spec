# Penpot self-host — Design Studio in-window (plan 053)

Dwellium's Design Studio widget has two modes:

- **No env set (today):** launcher over Penpot's free cloud
  (https://design.penpot.app). The cloud sends `X-Frame-Options: SAMEORIGIN`
  (re-verified 2026-08-23 via `curl -sI https://design.penpot.app/`), so the
  editor **cannot** be iframed — one click opens it in a new tab.
- **`VITE_PENPOT_URL` set to a self-host (this directory):** the widget
  renders the Penpot editor **inside a Dwellium window** (iframe), because our
  own Caddy strips the frame headers and sets
  `frame-ancestors https://argyleholocron.netlify.app http://localhost:*`.

Files here:

| File | What |
|---|---|
| `docker-compose.yml` | Penpot's **official** deploy file, byte-for-byte. Source: <https://raw.githubusercontent.com/penpot/penpot/main/docker/images/docker-compose.yaml> (fetched 2026-08-23; sha256 `79330b4445d6c6dba6918d222d342a365710ba90b6bb8a8eae3d333155b0cf5e`). Official `penpotapp/*` images only, unmodified. Re-sync from upstream freely — nothing of ours is in it. |
| `docker-compose.override.yml` | Dwellium's config: loopback port bind, `PENPOT_PUBLIC_URI` + `PENPOT_SECRET_KEY` from `.env`. Compose merges it automatically. |
| `Caddyfile` | TLS + frame-header rewrite at `design.dwellium.com` (host Caddy, same pattern as the listmonk VM). |

## Sizing and cost — the honest part

Penpot is **not** a $0 tool to self-host. The stack is seven containers
(frontend nginx, backend JVM, exporter with a headless browser, MCP server,
Postgres 15, Valkey, mailcatch). Penpot's own recommended-settings page says
"4 CPUs and 16GB of RAM are sufficient to support thousands of users" and
suggests 50–100 GB elastic DB storage for up to 10 editors
(<https://help.penpot.app/technical-guide/getting-started/recommended-settings/>).
For a 2-seat Andy + Lisa instance the practical floor (our judgment, not an
official number) is **~2 GB RAM / 2 vCPU** — the backend JVM alone wants ~1 GB
and the exporter spikes when rendering PDFs. It does **not** fit the GCP
Always-Free e2-micro (1 GB) that runs listmonk.

Real options:

| Option | Cost | Trade-off |
|---|---|---|
| A. GCE `e2-medium` (2 vCPU / 4 GB) + 30 GB disk | **≈ $25–30/mo** (us-east1, on-demand; check the GCP calculator at commit time) | Comfortable; public URL → iframe works everywhere |
| B. GCE `e2-small` (2 vCPU / 2 GB) + swap | **≈ $13–15/mo** | Tight; exporter PDF renders may OOM under load |
| C. Always-on office Mac (Docker Desktop, like Immich in `tools/immich/`) + a `caddy` container for the header rewrite, reachable over Tailscale | **$0 cash** | Editor iframe only loads on machines inside the tailnet (same caveat as Photo Vault); browser TLS needs the Tailscale cert or plain `http://<mac>.<tailnet>.ts.net` |
| D. Stay on the free cloud (today's default) | **$0** | Launcher only — the cloud's `X-Frame-Options: SAMEORIGIN` makes in-window impossible by design |

There is no pretend-$0 path to the in-window iframe on the public internet.
If Andy wants the editor inside Dwellium from anywhere, that is option A or B
and it costs money; say so out loud before provisioning.

## Bring-up (options A/B — a VM)

```bash
# VM with Ubuntu 24.04, ports 80/443 open (same firewall rule as listmonk).
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 caddy
sudo usermod -aG docker "$USER" && exit   # re-ssh so the group applies

mkdir -p ~/penpot && cd ~/penpot
# copy docker-compose.yml + docker-compose.override.yml from this repo, then:
cat > .env <<'EOF'
PENPOT_PUBLIC_URI=https://design.dwellium.com
PENPOT_SECRET_KEY=<python3 -c "import secrets; print(secrets.token_urlsafe(64))">
EOF
chmod 600 .env
docker compose up -d
docker compose logs -f penpot-backend   # wait for "welcome to penpot"
```

DNS: `design.dwellium.com A <vm-ip>` at the registrar. Then install the
`Caddyfile` from this directory into `/etc/caddy/Caddyfile` and
`sudo systemctl reload caddy` — Caddy fetches the Let's Encrypt cert itself.

Production hardening (both from the official file's own warning comment):
remove `disable-secure-session-cookies` and `disable-email-verification` from
`PENPOT_FLAGS` once SMTP is real (override `PENPOT_FLAGS` per service in
`docker-compose.override.yml`); swap mailcatch for a real SMTP (Brevo free
relay, same as listmonk — `tools/listmonk/README.md` §4).

First login: `https://design.dwellium.com` → register Andy (email
verification is disabled by the default flags until you harden), create team
"Dwellium", invite Lisa.

## Env wiring back into Dwellium

| Env | Where | Effect |
|---|---|---|
| `VITE_PENPOT_URL=https://design.dwellium.com` | Netlify (frontend) | Design Studio widget switches launcher → **in-window iframe** (reachability-checked; cloud URLs keep the launcher) |
| `PENPOT_API_URL=https://design.dwellium.com` | backend (Cloud Run) | Base for the `/api/design` proxy. Defaults to `https://design.penpot.app` — the proxy works against the **free cloud too**; the self-host is only needed for the iframe |
| `PENPOT_ACCESS_TOKEN=<token>` | backend (Cloud Run, secret) | Personal access token: Penpot → *Your account → Access tokens → Generate new token* (<https://help.penpot.app/technical-guide/integration/#access-tokens>). Auth header format is `Authorization: Token <token>` |

While `PENPOT_ACCESS_TOKEN` is unset the `/api/design` routes answer
`503 { needsSetup: true }` and the widget's Files tab shows the setup card —
never a crash.

## API surface the proxy uses (documented, not invented)

Penpot's public API is the RPC surface at `/api/rpc/command/<name>`,
self-documented at <https://design.penpot.app/api/main/doc> (linked from the
integration guide). It content-negotiates `application/json` via the `Accept`
header (transit+json is the default). Commands used by
`/api/design` (snapshotted in the backend's
`tests/fixtures/penpot-rpc-commands.json` with a drift-guard test):

- `get-teams` `{}` → teams
- `get-projects` `{teamId}` → projects
- `get-project-files` `{projectId}` → files
- `export-binfile` `{fileId, includeLibraries, embedAssets}` → the `.penpot`
  binary (import it into any Penpot instance)

**Not proxied, on purpose:** PNG/PDF/SVG *render* export is performed by the
separate `penpot-exporter` service whose HTTP endpoint is an internal
implementation detail, not part of the documented API
(<https://help.penpot.app/technical-guide/developer/architecture/exporter/>).
Render exports stay in Penpot's own UI (File → Export). Do not fake an
endpoint for this.

## MCP

The official compose already ships `penpotapp/mcp` and the `enable-mcp` flag
(both present in `docker-compose.yml` as fetched). Once the self-host is up,
registering it as a Hermes/ARA MCP source is a follow-up — nothing in Dwellium
depends on it today.

## Andy's templates

`qualia-shell/public/design-templates/` holds five Dwellium-branded SVG
starter templates (flyer, late-rent notice, inspection notice, move-in
checklist, owner-report cover). The Design Studio widget's **Templates** tab
previews and downloads them; per-template import steps are shown there.
Penpot imports SVG directly: open a file and drag the downloaded `.svg` onto
the canvas — it arrives as editable vectors (SVG is Penpot's native format).
