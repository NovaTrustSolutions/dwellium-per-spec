# Gap analysis — Immich (Photo Vault) and RustDesk (Remote Support) in Dwellium, plan 047

Date: 2026-08-23. Read-only audit. Every Dwellium claim cites a file (+line); every upstream claim cites a URL fetched today.
Repo root `R` = `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`; frontend `F` = `R/qualia-shell/src`; backend `B` = `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src`.

Legend: ✅ available through the integration as shipped (the *How* column says whether that is inside the Dwellium widget or only via Open ↗ / a native client) · 🟡 partial / needs config not yet shipped · ❌ not available · ➖ intentionally out of scope.

Shared facts (verified today):
- Backend: `grep -rliE 'immich|rustdesk' B | wc -l` → **0**. No `/api/photos/*`, no `/api/remote-support/config`, no `photosRoutes.ts`/`remoteSupportRoutes.ts`. Both integrations are frontend-only + ops docs.
- Tests: `npx vitest run src/test/photoVaultWidget.test.tsx src/test/remoteSupportWidget.test.tsx src/test/toolsHub.test.tsx` → 3 files, **16 tests passed** (run 2026-08-23 02:26, 701 ms).
- Production `https://argyleholocron.netlify.app` → HTTP/2 200 (`curl -sI`). Per the caller's live check the Tools hub shows Photo Vault = **Set up** and Remote Support = **Set up** (env vars unset on Netlify); that matches `resolveToolStatus` (`F/data/toolsHub.ts:51-60`): widget registered + env missing ⇒ `needs-setup`, and `needs-setup` ⇒ button label "Set up" that opens the Guide, not the widget (`F/components/ToolsHub/ToolsHub.tsx:29-34, 63`).
- Status rule, both tools: `ready` only when the widget is in `WIDGET_REGISTRY` **and** the `VITE_*` env is set (`F/data/toolsHub.ts:5-9, 56-59`; `F/components/ToolsHub/ToolsHub.tsx:21-23`).

---

# Immich — Photo Vault

## 1. Upstream capabilities (fetched 2026-08-23)

Source A = README features table, https://github.com/immich-app/immich ("High performance self-hosted photo and video management solution", AGPL-3.0). Source B = https://docs.immich.app/ (nav: Overview · Install · Features · Administration · Developer · Guides · FAQ · **API**; API reference at https://api.immich.app/). Source C = https://docs.immich.app/features/libraries/ (external libraries). Latest release today: `v3.1.0` (`curl -sI https://github.com/immich-app/immich/releases/latest` → `/releases/tag/v3.1.0`).

| # | Feature | Source |
|---|---|---|
| 1 | Upload and view videos and photos (mobile + web) | A |
| 2 | Album and Shared albums | A |
| 3 | Public Sharing (shared links) | A |
| 4 | Search by metadata, objects, faces, and CLIP | A |
| 5 | Facial recognition and clustering | A |
| 6 | Metadata view (EXIF, map) + Global Map | A |
| 7 | Multi-user support + Administrative functions (user management) | A |
| 8 | OAuth support | A |
| 9 | API Keys + REST API (api.immich.app, docs "API" section) | A, B |
| 10 | Mobile app: auto backup when opened, background backup, selective album backup, offline support | A |
| 11 | Partner Sharing | A |
| 12 | Archive and Favorites, Tags, Folder View | A |
| 13 | External Libraries ("track assets stored in the filesystem outside of Immich", `:ro` mounts) | C |
| 14 | RAW formats, LivePhoto/MotionPhoto, 360° display, Memories, Stacked Photos, Download to device, user-defined storage structure | A |

## 2. What Dwellium has

**Integration model** — iframe of the stock Immich web UI, gated by `VITE_IMMICH_URL`, with a reachability ping (LangFlowPanel pattern, "never a blank iframe"):
- `F/components/PhotoVault/PhotoVault.tsx` (113 lines). Reads `env.VITE_IMMICH_URL`, trims trailing `/` (l.26). Three states (l.8-12): env unset → "Connect Immich" needs-setup card pointing at `tools/immich/README.md` + "Open Tools hub" button (l.50-67); env set + `fetch(url,{mode:'no-cors'})` with 4 s abort resolves → `<iframe src={url} allow="clipboard-read; clipboard-write; fullscreen">` (l.33-44, 102-108); ping rejects → "Photo Vault isn't reachable … connect to Tailscale to view photos" card with **Re-check** and **Open ↗** (l.86-100). Toolbar always has a status dot, the URL, a reload button and **Open ↗** (l.74-83). No Immich API calls, no Dwellium-side photo logic.
- `F/components/PhotoVault/PhotoVault.css` (108 lines) — layout only.
- Registry `F/registry/widgetRegistry.ts:856-867` — id `photo-vault`, label "Photo Vault", tier `tools`, icon `image`, category `filing`, 520×420 min, lazy import.
- Dock row `F/data/hierarchy.ts:80` (`dock-photo-vault`, group "Filing Cabinet", `pinned: true`).
- Tools hub row `F/data/toolsHub.ts:41` — license "AGPL-3.0-only (Immich, unmodified image)", phase 2, `envVar: 'VITE_IMMICH_URL'`, `setupDoc: 'photo-vault'`.
- Guide row `F/content/guides/gettingStarted.ts:66` — "The office-Mac Immich (tools/immich) + `VITE_IMMICH_URL` — viewing needs Tailscale on your device".
- Ops docs `R/tools/immich/`: `README.md` (133 lines — Docker Desktop on the always-on office Mac, `tailscale serve --bg 2283` for a tailnet-only `https://<mac>.<tailnet>.ts.net` URL, admin = first sign-up, API key `dwellium-service` "for later", ML container off, Netlify env, Time Machine backups, "CORS — not needed"); `docker-compose.yml` (official v3.1.0 release compose, ML service commented out l.40-64, images unmodified); `.env.example` (`UPLOAD_LOCATION`, `DB_DATA_LOCATION`, `DB_PASSWORD`, `IMMICH_VERSION=v3`).

**Env gates** — frontend `VITE_IMMICH_URL` only. The plan's backend `IMMICH_URL`/`IMMICH_API_KEY` (plan §Immich step 2/8) do not exist anywhere (backend grep = 0).

**Tests** — `F/test/photoVaultWidget.test.tsx` (3): (1) no env → "Connect Immich" card, README path text, no `<iframe>`, button dispatches `dwellium:open-widget` for `tools-hub`; (2) env set + fetch resolves → iframe `src` equals URL with trailing slash trimmed, no "isn't reachable" text; (3) env set + fetch throws → "connect to Tailscale" card, no iframe, then fetch stubbed OK + **Re-check** → iframe appears. `F/test/toolsHub.test.tsx:71-77` — `photo-vault` has `envVar VITE_IMMICH_URL`, `needs-setup` without env, `ready` with it. `F/test/registryWalker.test.tsx:46-49` counts it in the 63-widget registry.

**UI entry points** — Tools hub row (button "Set up" → Guide while env unset; "Open" → widget when ready), Filing Cabinet dock row, registry (⌘K/gallery surfaces use the registry — not separately verified here).

**Plan-047 items NOT built** (grep-verified, 0 hits): backend proxy `photosRoutes.ts` (step 3), `photo_album_id`/`photo_share_url` columns (step 4), Strata `PhotoStrip` (step 6), Home Upkeep "Pick from Photo Vault" (step 7), ARA `photos.*` tools (step 9), Google OIDC in Immich (step 2 — the zero-cost README uses password admin instead).

**Current production status** — `needs-setup` ("Set up"). Opening the widget itself renders the "Connect Immich" card. Nothing Immich-related is reachable from production today.

## 3. Gap table

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| 1 Upload/view photos & videos (web) | ✅ once configured | inside widget (iframe of Immich web UI) or Open ↗ | Requires viewer on the tailnet (`PhotoVault.tsx:8-12`; `tools/immich/README.md:107-110`). Iframe-login under third-party-cookie blocking is an acknowledged risk with Open ↗ fallback (`README.md:121-123`) — unverified whether Immich sets frame-blocking headers. |
| 2 Albums & shared albums | ✅ once configured | iframe / Open ↗ | Generic Immich albums; no unit/work-order ↔ album mapping in Dwellium (plan step 4/6 not built). |
| 3 Public sharing (shared links) | 🟡 | creatable in iframe | Share URLs are `ts.net` tailnet-only (`README.md:94-98` — funnel explicitly NOT used), so residents/vendors off the tailnet cannot open them. Defeats the plan's "Immich shared link (expiry+password)" for residents (plan l.38). |
| 4 Search by metadata / objects / faces / CLIP | 🟡 | iframe | Metadata search works; objects/faces/CLIP need `immich-machine-learning`, which the shipped compose comments out (`docker-compose.yml:40-64`) and the README tells you to disable (`README.md:74-80`). |
| 5 Facial recognition & clustering | ❌ (off by design in the shipped compose) | — | Same ML container; README step 6 disables it. Zero-cost/RAM decision, reversible. |
| 6 Metadata view (EXIF, map) + Global Map | ✅ once configured | iframe / Open ↗ | Nothing Dwellium-specific. |
| 7 Multi-user + admin | ✅ once configured | iframe / Open ↗ | Admin = first sign-up (`README.md:64-66`). No SSO/identity mapping to Dwellium (plan `federated_identities` l.41 not built). |
| 8 OAuth login | 🟡 | Immich admin config (not done) | Upstream supports it; zero-cost runbook uses password login; plan's Google-OIDC step (l.213) not in `tools/immich/README.md` (grep "oauth" = 0). |
| 9 API keys / REST API | 🟡 | Immich UI only | README step 5 creates a `dwellium-service` key "for later" (`README.md:67-72`); no Dwellium consumer — backend grep 0, no `/api/photos/*`. |
| 10 Mobile app auto/background/selective backup, offline | 🟡 | native Immich mobile app only | Works if the phone runs Tailscale and the app is pointed at the `ts.net` URL — but `tools/immich/README.md` never mentions the mobile app (grep "mobile" = 0). |
| 11 Partner sharing | ✅ once configured | iframe / Open ↗ | — |
| 12 Archive / Favorites / Tags / Folder view | ✅ once configured | iframe / Open ↗ | — |
| 13 External libraries | ❌ | — | Compose mounts only `UPLOAD_LOCATION` (`docker-compose.yml:27`); no `:ro` external-library volume, although the addendum wording says "external library on Mac disk" (plan l.514). Needs a compose edit + admin library. |
| 14 RAW / LivePhoto / 360° / Memories / Stacks / Download / storage template | ✅ once configured | iframe / Open ↗ | Server-side Immich features, pass through the iframe. |

## 4. Parity numbers (N = 14 features)

- ✅ = 7 (rows 1, 2, 6, 7, 11, 12, 14) · 🟡 = 5 (3, 4, 8, 9, 10) · ❌ = 2 (5, 13) · ➖ = 0.
- (a) **Feature coverage once configured**: full ✅ = 7/14 = **50 %**; reachable in some form (✅+🟡) = 12/14 = **86 %**.
  - Inside the Dwellium widget (iframe): 7 ✅ + 4 🟡 (rows 3, 4, 8, 9) → 11/14 = 79 % in some form, 50 % full.
  - Only via Open ↗ / native client: row 10 (mobile app) → 1/14 = 7 %. (Open ↗ shows the same web UI as the iframe, so it adds nothing beyond the cookie-fallback.)
- (b) **Native in Dwellium** (reimplemented inside Dwellium code): **0/14 = 0 %**. Dwellium ships launcher/reachability chrome (113 lines) and ops docs; no photo feature is implemented in Dwellium.
- **Today in production**: 0/14 = 0 % (env unset → needs-setup card only).

## 5. What it would take to close each ❌/🟡

- Row 3 (share links off-tailnet): **M** — either expose only `/share/*` publicly (Tailscale Funnel is per-port, so a reverse proxy or Cloudflare Tunnel in front) or build the plan's `/api/photos/albums/:id/share` proxy that mints links and re-serves them from a public host; or accept tailnet-only sharing (staff only).
- Rows 4/5 (ML search/faces): **S** — uncomment the ML block in `tools/immich/docker-compose.yml`, `docker compose up -d`, re-enable in Admin → Machine Learning Settings (needs ~+2 GB RAM on the Mac).
- Row 8 (OAuth): **S** — config only: Admin → Settings → OAuth with the existing Google client + redirect `https://<mac>.<tailnet>.ts.net/auth/login` (plan l.213).
- Row 9 (API): **M** — backend `photosRoutes.ts` per plan step 3 (`authenticate`, `X-API-Key` from Cloud Run secret); **L** to add Strata PhotoStrip / Home Upkeep pick / unit-album mapping (steps 4, 6, 7, 9).
- Row 10 (mobile backup): **S** — a README paragraph: install Tailscale + Immich app on the phone, server URL = the `ts.net` URL.
- Row 13 (external library): **S** — add `- /Users/andy/<folder>:/mnt/media/<folder>:ro` to `immich-server.volumes`, create the library in Admin → External Libraries (https://docs.immich.app/features/libraries/).

## 6. Verification

- Code: `grep -n "VITE_IMMICH_URL" "R/qualia-shell/src/components/PhotoVault/PhotoVault.tsx" "R/qualia-shell/src/data/toolsHub.ts"`; `sed -n 856,867p "R/qualia-shell/src/registry/widgetRegistry.ts"`; `grep -rn "PhotoStrip\|photo_album_id\|Pick from Photo Vault" "R/qualia-shell/src"` → 0.
- Backend: `grep -rliE 'immich' "B" | wc -l` → 0.
- Tests: `cd R/qualia-shell && npx vitest run src/test/photoVaultWidget.test.tsx src/test/toolsHub.test.tsx`.
- Upstream: https://github.com/immich-app/immich (features table), https://docs.immich.app/ (API section → https://api.immich.app/), https://docs.immich.app/features/libraries/; `curl -sI https://github.com/immich-app/immich/releases/latest` → `v3.1.0` (matches `tools/immich/docker-compose.yml:4`).
- Prod: `curl -sI https://argyleholocron.netlify.app` → 200; open Tools hub → Photo Vault row shows "Set up". After setup (from a tailnet device): `curl -I https://<mac>.<tailnet>.ts.net` → 200 and check for `x-frame-options`/`content-security-policy: frame-ancestors` headers before trusting the iframe path.

---

# RustDesk — Remote Support

## 1. Upstream capabilities (fetched 2026-08-23)

Source D = README, https://github.com/rustdesk/rustdesk ("Yet another remote desktop solution, written in Rust. Works out of the box with no configuration required." … "You have full control of your data, with no concerns about security." … use "our rendezvous/relay server, set up your own, or write your own"; AGPL-3.0; RustDesk Server Pro linked). Source E = https://github.com/rustdesk/rustdesk-server (README: "hbbs - RustDesk ID/Rendezvous server", "hbbr - RustDesk relay server", default ports hbbs `21116` / hbbr `21117`, `-k`/`KEY` "hbbs loads/generates one by default", AGPL-3.0, "Need more features? RustDesk Server Pro might suit you better"). Source F = OSS install doc https://raw.githubusercontent.com/rustdesk/doc.rustdesk.com/master/content/self-host/rustdesk-server-oss/install/_index.en.md (TCP 21114-21119 + UDP 21116; 21118/21119 = WebSocket for the web client, must sit behind a header-validating reverse proxy; `wget rustdesk.com/oss.yml -O compose.yml && sudo docker compose up -d`). Source G = client docs https://raw.githubusercontent.com/rustdesk/doc.rustdesk.com/master/content/client/_index.en.md (platforms Windows/macOS/Debian/RedHat/Arch/openSUSE/NixOS/AppImage/Flatpak/Android/iOS "cannot be controlled remotely"/Web; settings: service control, hardware codec, audio, recording, permissions for someone taking control, password options, One-Time Password, ID change, custom server, proxy, clipboard sync, display settings). Source H = client configuration doc https://raw.githubusercontent.com/rustdesk/doc.rustdesk.com/master/content/self-host/client-configuration/_index.en.md (ID Server "required", Key "required for encrypted connections to your self-hosted server" from `id_ed25519.pub`, Relay Server "often optional", API Server "needed for Pro account login and web console features"; set under "Settings then Network"; "Custom client generator" is "Pro only"). Latest release today: `1.4.9` (`curl -sI https://github.com/rustdesk/rustdesk/releases/latest` → `/releases/tag/1.4.9`). Note: rustdesk.com itself returns 403 to WebFetch, so docs were read from the doc.rustdesk.com GitHub source.

| # | Feature | Source |
|---|---|---|
| 1 | Remote desktop control (TeamViewer-style, Rust core + Flutter clients) | D |
| 2 | Works out of the box with the project's public rendezvous/relay servers | D |
| 3 | Self-hosted ID/rendezvous (hbbs) + relay (hbbr) servers, docker `oss.yml` | E, F |
| 4 | Key-based client authentication (`-k` / `KEY`, `id_ed25519.pub`; "required for encrypted connections to your self-hosted server") | E, H |
| 5 | File transfer | D (README nav: file transfer, TCP tunneling) |
| 6 | TCP tunneling | D |
| 7 | Cross-platform clients: Windows, macOS, Linux (deb/rpm/Arch/openSUSE/NixOS/AppImage/Flatpak), Android, iOS (control-only), Web | G |
| 8 | Web client (browser-based controller; needs WebSocket 21118/21119 behind a reverse proxy) | F, G |
| 9 | Unattended access controls: permanent password / One-Time Password / "Permissions for someone taking control" | G |
| 10 | Session features: clipboard sync, audio, hardware codec, recording, display settings | G |
| 11 | Custom server settings in the client (Settings → Network: ID Server, Relay, API, Key) + proxy | G, H |
| 12 | Pro-only: API server / web console / account login / custom client generator | E, H |
| 13 | Data control — own relay + key ("You have full control of your data") | D, H |
| 14 | Mobile clients (Android, iOS controller) | D, G |

## 2. What Dwellium has

**Integration model** — "launcher" card; **no remote session in-window** (header comment: "OSS RustDesk has no embeddable web client — phase-3 spike", `F/components/RemoteSupport/RemoteSupport.tsx:3-4`). The card: (1) "Install RustDesk on the machine" with three stock download links pinned to v1.4.9 — macOS Apple Silicon, macOS Intel, Windows 64-bit (l.37-42, 66-78) + "All releases" (l.43, 61-63); (2) "Point it at your relay": if `VITE_RUSTDESK_RELAY` parses (`host:port,key`, `parseRustdeskRelay` l.29-35) it renders "Settings → Network → ID/Relay server" instructions plus copyable **ID / Relay server** and **Key** rows (l.82-103); if unset, a `data-state="community-relay"` note saying RustDesk's free community servers are used and pointing at `tools/rustdesk/README.md` + the Netlify env (l.104-113); (3) safety note "Never share the machine's permanent password by chat" (l.116-119). Download URLs verified live today (302 to release assets; latest tag is still 1.4.9).
- `F/components/RemoteSupport/RemoteSupport.css` (102 lines) — layout only.
- Registry `F/registry/widgetRegistry.ts:838-849` — id `remote-support`, tier `tools`, icon `monitor` (`F/components/Sidebar/iconMap.ts:118`), category `tools`, 480×360, lazy import.
- Dock row `F/data/hierarchy.ts:91` (`dock-remote-support`, "Filing Cabinet", `pinned: false`).
- Tools hub row `F/data/toolsHub.ts:46` — "AGPL-3.0-only (RustDesk, stock build)", phase 2, `envVar: 'VITE_RUSTDESK_RELAY'`.
- Guide row `F/content/guides/gettingStarted.ts:67`.
- Ops docs `R/tools/rustdesk/`: `README.md` (93 lines — gcloud commands for Always-Free `e2-micro` `dwellium-free-1` in us-central1 with static IP, firewall TCP 21114-21119 + UDP 21116, `docker compose up -d`, `cat data/id_ed25519.pub`, Netlify env `VITE_RUSTDESK_RELAY=<ip-or-dns>:21116,<key>`, verify with `nc -zv`; "Ilya runs every command"); `docker-compose.yml` (mirrors `rustdesk.com/oss.yml`: `rustdesk/rustdesk-server:latest` hbbs + hbbr, `-k _`, host networking, `./data` volume).

**Env gates** — frontend `VITE_RUSTDESK_RELAY` only. Plan's backend `RUSTDESK_ID_SERVER`/`RUSTDESK_RELAY_SERVER`/`RUSTDESK_PUBLIC_KEY` + `GET /api/remote-support/config` (plan l.352-353) do not exist (backend grep 0).

**Tests** — `F/test/remoteSupportWidget.test.tsx`: `parseRustdeskRelay` (undefined/blank → null; `host:port`; `host:port,key` with trimming); registry entry exists with icon `monitor`; env unset → three download links all under `github.com/rustdesk/rustdesk/releases/download/`, `[data-state="community-relay"]` present, no copy button; env set → server + key text rendered, community note absent, both copy buttons call `navigator.clipboard.writeText` with the right values. `F/test/toolsHub.test.tsx:65-68` — `remote-support` flips to `ready` with `VITE_RUSTDESK_RELAY` set.

**UI entry points** — Tools hub row ("Set up" → Guide today), dock row, registry.

**Plan-047 items NOT built** (grep-verified, 0 hits): backend config route (step 3); saved-machines list in One Save and `buildRustdeskLink` / `rustdesk://` deep link (step 4b/c — `grep -rn "buildRustdeskLink\|rustdesk://"` = 0); Two Brains "Escalate to full control" (step 7 — no "escalate" in `TwoBrains.tsx`); Scribe "Get remote help" doc (step 9); in-window web client (explicitly phase 3).

**Current production status** — `needs-setup` ("Set up" → Guide). Unlike Photo Vault, the widget itself is useful without env (download links + community-server note), but the Tools hub does not route there until `VITE_RUSTDESK_RELAY` is set. Whether the e2-micro relay exists is not evidenced in the repo or env; treat the relay as **not deployed**.

## 3. Gap table

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| 1 Remote desktop control | ✅ | native client only (launcher links → stock RustDesk) | Nothing in-window; user leaves Dwellium to connect. Deep-link "Connect" (plan step 4c) not built. |
| 2 Works out of the box with public servers | ✅ | native client; widget explains it (`RemoteSupport.tsx:104-113`) | This is the only path that works in production today (env unset). Shared/slower per the card. |
| 3 Self-hosted hbbs/hbbr | 🟡 | runbook + compose in `tools/rustdesk/` | Not deployed/evidenced (prod env unset → "Set up"). Blocked on Ilya running the gcloud commands. |
| 4 Key-based auth (`-k`) | 🟡 | compose `-k _` (`docker-compose.yml:18,30`); widget shows key + Copy (`RemoteSupport.tsx:93-101`) | Depends on row 3. Key optional in the env format "while testing" (`README.md:79`). |
| 5 File transfer | ✅ | native client only | Not mentioned anywhere in Dwellium (grep "file transfer" in `tools/rustdesk/README.md` = 0). |
| 6 TCP tunneling | ✅ | native client only | Not surfaced. |
| 7 Cross-platform clients | 🟡 | 3 direct links (macOS arm/x86, Windows x64) + "All releases" | Linux/Android/iOS (resident devices) only via the generic releases page; links hard-pinned to 1.4.9 (still latest today, will drift). |
| 8 Web client | ❌ | — | Deferred to a phase-3 spike (`RemoteSupport.tsx:3-4`; plan l.365). Relay compose exposes no reverse-proxied 21118/21119 WebSocket (upstream requires one). |
| 9 Unattended access / permanent pw / OTP / permissions | ✅ | native client only | Dwellium adds only the "never share the permanent password by chat" note (`RemoteSupport.tsx:116-119`). |
| 10 Clipboard / audio / codec / recording / display | ✅ | native client only | — |
| 11 Custom server settings in client | ✅ once configured | inside widget: values + Copy + "Settings → Network → ID/Relay server" (`RemoteSupport.tsx:84-102`) | The one feature the widget materially helps with; inert until env is set. |
| 12 Pro-only (API server, web console, custom client generator, OIDC) | ➖ | — | Out of scope by plan: OSS stock images/clients only, zero-cost, no Pro purchase (plan l.343-346; `toolsHub.ts:46` "stock build"). |
| 13 Data control via own relay + key | 🟡 | native client + own relay | Until row 3 ships, sessions ride the community servers (still RustDesk-encrypted, but not "your own" infrastructure). |
| 14 Mobile clients (Android / iOS controller) | ✅ | native client only | Not linked from the card (see row 7). |

## 4. Parity numbers (N = 14 features)

- ✅ = 8 (rows 1, 2, 5, 6, 9, 10, 11, 14) · 🟡 = 4 (3, 4, 7, 13) · ❌ = 1 (8) · ➖ = 1 (12).
- (a) **Feature coverage once configured**: full ✅ = 8/14 = **57 %**; reachable in some form (✅+🟡) = 12/14 = **86 %** (12/13 = 92 % if the ➖ Pro row is excluded).
  - Inside the Dwellium widget: row 11 only (config display/copy) → 1/14 = **7 %**; the download links are a gateway, not a feature.
  - Only via native client (launcher → stock RustDesk): rows 1, 2, 5, 6, 9, 10, 14 → 7/14 = **50 %**.
- (b) **Native in Dwellium**: **0/14 = 0 %** — `parseRustdeskRelay` + copy buttons display config; no RustDesk capability is reimplemented.
- **Today in production**: Tools hub routes to the Guide, but anyone who opens the widget from the dock can reach rows 1, 2, 5, 6, 9, 10, 14 via community servers (7/14 = 50 % via native client, 0 % in-widget).

## 5. What it would take to close each ❌/🟡

- Rows 3/4/13 (own relay + key): **S ops** — Ilya runs `tools/rustdesk/README.md` §1-5 (VM, firewall, compose, `cat data/id_ed25519.pub`), sets `VITE_RUSTDESK_RELAY=<ip>:21116,<key>` in Netlify, redeploys; widget + hub flip to Ready with no code change (`toolsHub.test.tsx:65-68`).
- Row 7 (platforms / drift): **S** — add Linux `.deb`/Android `.apk` links or link the client docs page; replace hard-pinned 1.4.9 URLs with `releases/latest/download/<asset>` pattern or a periodic check.
- Row 8 (web client in-window): **L** — phase-3 spike per plan l.365: TLS reverse proxy for 21118/21119 WebSocket (upstream says hbbs/hbbr trust `X-Real-IP`/`X-Forwarded-For`, so the proxy must validate headers), confirm the web client's embeddability/frame headers and source status, then an iframe widget on the LangFlowPanel reachability pattern.
- Plan leftovers (not upstream features but parity with the plan): saved machines + `rustdesk://` deep link **M**; Two Brains "Escalate to full control" button **S**; backend `/api/remote-support/config` **S** (only needed if the config should stop living in a Vite env).

## 6. Verification

- Code: `sed -n 29,43p "R/qualia-shell/src/components/RemoteSupport/RemoteSupport.tsx"`; `sed -n 838,849p "R/qualia-shell/src/registry/widgetRegistry.ts"`; `grep -rn "buildRustdeskLink\|rustdesk://\|Escalate" "R/qualia-shell/src"` → 0.
- Backend: `grep -rliE 'rustdesk' "B" | wc -l` → 0.
- Tests: `cd R/qualia-shell && npx vitest run src/test/remoteSupportWidget.test.tsx src/test/toolsHub.test.tsx`.
- Upstream: https://github.com/rustdesk/rustdesk, https://github.com/rustdesk/rustdesk-server, the two doc.rustdesk.com raw pages above; `curl -sI https://github.com/rustdesk/rustdesk/releases/latest` → `/tag/1.4.9`; `curl -sI https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-aarch64.dmg` → 302 (asset exists).
- Prod: `curl -sI https://argyleholocron.netlify.app` → 200; Tools hub → Remote Support row "Set up". After relay deploy: `nc -zv <static-ip> 21116` and `21117`; in a client, Settings → Network → paste the widget's values → connect.
