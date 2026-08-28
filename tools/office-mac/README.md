# Office-Mac-in-a-box — plan 054 phase 4 runbook

One directory that turns the always-on office Mac into the free self-host home
for the five proven stacks: **listmonk** (Broadcasts), **Immich** (Photo
Vault), **Documenso** (E-Sign), **RustDesk** hbbs/hbbr (Remote Support),
**excalidraw-room** (Whiteboard collab). Everything references the existing,
locally-proven compose files in `tools/<svc>/` — nothing here forks or edits
them. Official images only, zero paid tiers.

Target: one ~15-minute office visit.

## Prerequisites — the ONLY two human steps

1. **Docker** — Docker Desktop (docker.com, "Start when you sign in" enabled)
   or `brew install colima docker && colima start --memory 8`.
2. **Tailscale** — install from tailscale.com/download, sign in to the
   Dwellium tailnet. In the admin console → DNS, enable **MagicDNS** and
   **HTTPS Certificates** (one-time per tailnet).

## Then

```sh
cd tools/office-mac
./bootstrap.sh
```

Idempotent — re-run any time. It: checks docker + tailscale (exits naming the
exact missing piece), generates each stack's `.env` from a template **only if
absent** (never overwrites; secrets via `openssl rand`, all gitignored),
generates the Documenso signing cert if absent, brings up all five stacks as
`dwellium-<svc>` compose projects, waits on every health endpoint, and ends
with the status matrix plus the copy-paste Cloud Run + Netlify env block with
the Mac's real tailnet hostname filled in.

Then run the `tailscale funnel` / `serve` commands it prints (once), and paste
the env block into Cloud Run (deploy shell) + Netlify. Done.

Day-2 verbs: `make up` / `make down` / `make status` / `make seed`.
After any reboot: `./healthcheck.sh` (exit non-zero = something is down).

## Env handoff table

`<mac>` = the tailnet hostname bootstrap prints (e.g.
`dwellium-office.tailnet-name.ts.net`).

| Service | Local | Cloud Run env | Netlify env | Public reach (Funnel)? |
|---|---|---|---|---|
| Immich | `http://127.0.0.1:2283` | `IMMICH_URL=https://<mac>` + `IMMICH_API_KEY` | `VITE_IMMICH_URL=https://<mac>` | **Yes — Funnel 443**: resident share links + Cloud Run proxy |
| Documenso | `http://127.0.0.1:3140` | `DOCUMENSO_API_URL=https://<mac>:8443` + `DOCUMENSO_API_KEY` | `VITE_DOCUMENSO_URL=https://<mac>:8443` | **Yes — Funnel 8443**: residents sign from home + Cloud Run proxy |
| listmonk | `http://127.0.0.1:9000` | `LISTMONK_URL=https://<mac>:10000` + `LISTMONK_USER=dwellium` + `LISTMONK_TOKEN` | `VITE_LISTMONK_URL=https://<mac>:10000` | **Yes — Funnel 10000**: Cloud Run proxy (off-tailnet) |
| excalidraw-room | `http://127.0.0.1:8080` | — | `VITE_EXCALIDRAW_COLLAB_URL=https://<mac>:8444` | No — `tailscale serve` only (staff on tailnet); Funnel's 3 ports (443/8443/10000) are spent above |
| RustDesk | tcp 21116/21117 | `RUSTDESK_RELAY_HOST=<mac>` | `VITE_RUSTDESK_RELAY=<mac>:21116,<key>` | No — Funnel is HTTPS-only, can't carry raw TCP/UDP |

`VITE_RUSTDESK_RELAY` shape is `host:port,key` — the key is the contents of
`tools/rustdesk/data/id_ed25519.pub` (generated on first start; bootstrap
inlines it into the printed env block). Back up `tools/rustdesk/data/` —
losing the key means reconfiguring every client.

**Honest limits of the tailnet topology:**

- Tailscale **Funnel serves only ports 443 / 8443 / 10000** — exactly three
  public slots, spent on Immich / Documenso / listmonk (the three that Cloud
  Run and residents must reach). Funnel needs one-time tailnet approval (the
  first `funnel` command prints the admin-console link).
- Whiteboard live-collab therefore works for **tailnet members only** (staff
  laptops with Tailscale installed). Fine for internal sessions.
- RustDesk raw ports are reachable only on the tailnet: office PCs get
  Tailscale; residents fall back to RustDesk's community servers (works,
  slower — `tools/rustdesk/README.md` §7). The backend relay-status probe
  from Cloud Run **cannot** reach tailnet raw ports, so the widget's pill
  will read "Relay down" even when the relay works — either accept that or
  keep the relay on the free e2-micro VM (`tools/rustdesk/README.md` §1-5),
  which is that README's original topology.
- Funnel puts Immich/Documenso/listmonk **login pages on the public
  internet** — `docker compose pull` + `up -d` regularly is now mandatory
  hygiene, not optional (see `tools/immich/README.md` Funnel section).
- After Funnel is on, set Documenso's `NEXT_PUBLIC_WEBAPP_URL` in
  `tools/documenso/.env` to `https://<mac>:8443` and
  `docker compose --project-directory ../documenso -p dwellium-documenso up -d`
  — signing emails embed that base URL.

## RAM budget (estimates from each compose's images; verify with `docker stats`)

| Stack | Compose caps | Typical resident set |
|---|---|---|
| listmonk (postgres 256M + app 512M + caddy 64M) | 832 MB | ~300 MB |
| Immich (server + postgres + valkey; **ML off**) | uncapped | ~1.5–2 GB |
| Documenso (next.js + postgres 15 + mailpit) | uncapped | ~700 MB |
| RustDesk (hbbs + hbbr) | uncapped | ~30 MB |
| excalidraw-room | 400 MB | ~80 MB |
| **Total (five stacks coexisting)** | | **~2.6–3.1 GB** |

Verdict for a 16 GB Mac: **comfortable.** Give the Docker VM 6–8 GB
(Docker Desktop → Settings → Resources, or `colima start --memory 8`) and
macOS still keeps 8+ GB. Turning on Immich machine learning later adds ~2 GB
(`tools/immich/README.md` step 6) — still fits. A 8 GB Mac would be tight but
workable with ML off; 16 GB is the recommended floor.

## Gotchas

- **colima resurrects stopped containers** (docs/code.md 2026-08-26): all
  five composes carry `restart: always`/`unless-stopped`, so a container you
  `docker stop`ped comes back when the colima VM (or Docker Desktop) next
  restarts. **Fix:** retire a stack with
  `docker compose --project-directory ../<svc> -p dwellium-<svc> down`
  (= `make down` for all five) — down removes the containers so there is
  nothing for the restart policy to resurrect. Volumes/data survive `down`.
- **RustDesk uses `network_mode: host`**, which on macOS needs host
  networking support in the Docker VM: Docker Desktop ≥ 4.34 (enable in
  Settings → Resources → Network) or colima with `--network-address`. If the
  21116/21117 probes fail with containers running, this is why.
- **Documenso first boot runs migrations ~1–3 min** — bootstrap waits up to
  6 min; `/signin` answering 200 = ready.
- **Ports on this Mac:** 3000 = Dwellium backend, 3100 = paperclipai — that's
  why Documenso rides 3140 (`tools/documenso/README.md`). Check any conflict
  with `lsof -iTCP:<port> -sTCP:LISTEN`.
- **Immich ML is intentionally off** (compose ships it commented out). In
  Immich Admin → Settings → Machine Learning, disable Smart Search + Facial
  Recognition so the server stops looking for the missing container.

## Seeds (`make seed` — UPSERT-only, safe to re-run)

- **listmonk**: `tools/listmonk/seed.sh` — 5 audiences + 4 notice templates.
  Needs `LISTMONK_USER` + `LISTMONK_TOKEN` (listmonk admin → Users → create
  API user `dwellium`).
- **Immich**: per-property albums ("Woodland Parc Townhomes", "Riverwood Club
  Apartments") via the same find-or-create-by-name the backend's
  `/api/photos/albums/ensure` uses. Needs `IMMICH_API_KEY` (Immich UI →
  Account Settings → API Keys). Skipped with instructions when unset.

## Remaining human steps after bootstrap (in-UI, ~10 min)

1. Immich: first sign-up = admin; create the `dwellium-service` API key.
2. Documenso: create the admin account; Settings → API Tokens → create;
   validate + store via `tools/documenso/store-token.sh` / `connect-local.sh`.
3. listmonk: log in (creds in `tools/listmonk/.env`), change the admin
   password, Users → create API user `dwellium`, Settings → SMTP (Brevo —
   `tools/listmonk/README.md` §4).
4. Run the printed `tailscale funnel`/`serve` commands; approve Funnel once.
5. Paste the printed env block into the Cloud Run deploy shell + Netlify,
   redeploy both.
