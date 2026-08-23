# Gap analysis — plan 047 OSS integrations: listmonk and Dub

Date: 2026-08-23. Read-only audit; no repo files modified.
Sources: local code (paths + lines below) and the upstream pages fetched today (URLs inline). Nothing is asserted about upstream that was not on a fetched page.

Legend: ✅ available through the Dwellium integration · 🟡 partial · ❌ not available · ➖ intentionally out of scope.
Paths: `FE` = `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell/src`, `BE` = `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager`, `REPO` = `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`.

---

# 1. listmonk (knadh/listmonk) → Dwellium "Broadcasts"

## 1.1 Upstream capabilities (fetched)

Sources: README https://github.com/knadh/listmonk (thin: "standalone, self-hosted, newsletter and mailing list manager", single binary, PostgreSQL, AGPLv3, Docker/binary install); homepage https://listmonk.app/ ; API index https://listmonk.app/docs/apis/apis/ ; campaigns API https://listmonk.app/docs/apis/campaigns/ .

| # | Feature | Upstream source |
|---|---|---|
| L1 | Mailing lists, single & double opt-in, "millions of subscribers" | https://listmonk.app/ ("One-way mailing lists") |
| L2 | Subscriber segmentation with SQL expressions | https://listmonk.app/ |
| L3 | Subscriber management API (`/api/subscribers`) | https://listmonk.app/docs/apis/apis/ |
| L4 | Bulk import (`/api/import`) | https://listmonk.app/docs/apis/apis/ |
| L5 | Campaign lifecycle: create, update, status → scheduled/running/paused/cancelled, delete (`/api/campaigns`, `PUT …/status`) | https://listmonk.app/docs/apis/campaigns/ |
| L6 | Campaign test send + preview (`POST …/{id}/test`, `GET …/{id}/preview`) | https://listmonk.app/docs/apis/campaigns/ |
| L7 | Templates — Go templating; drag-and-drop builder, WYSIWYG, Markdown, HTML, plain text (`/api/templates`) | https://listmonk.app/ ; https://listmonk.app/docs/apis/apis/ |
| L8 | Built-in analytics — campaign performance, bounces, top links (`GET /api/campaigns/analytics/{type}`, `…/running/stats`) | https://listmonk.app/ ; https://listmonk.app/docs/apis/campaigns/ |
| L9 | Transactional mail API using pre-defined templates (`/api/tx`, docs group "Transactional") | https://listmonk.app/ ; https://listmonk.app/docs/apis/apis/ |
| L10 | Bounce processing (`/api/bounces`, bounce analytics) | https://listmonk.app/docs/apis/apis/ ; https://listmonk.app/ |
| L11 | Media library, S3-compatible backend (`/api/media`) | https://listmonk.app/ ; https://listmonk.app/docs/apis/apis/ |
| L12 | Multi-threaded, multi-SMTP queues with throughput / sliding-window rate limiting | https://listmonk.app/ |
| L13 | Messenger interfaces — SMS / WhatsApp / FCM via HTTP webhooks | https://listmonk.app/ |
| L14 | Privacy controls, OIDC SSO, granular roles/permissions, granular API tokens | https://listmonk.app/ |
| L15 | Public campaign archive (`PUT /api/campaigns/{id}/archive`) | https://listmonk.app/docs/apis/campaigns/ |

Auth model used by the proxy is the documented one: `Authorization: token api_user:token` (https://listmonk.app/docs/apis/apis/).

## 1.2 What Dwellium has

**Integration model:** backend proxy (Express) + native thin React widget + "Open listmonk ↗" launcher to the external admin. listmonk itself is never embedded; it runs as the stock image on a GCP e2-micro (AGPL-unmodified rule: `REPO/tools/listmonk/README.md` lines 10-12; `docker-compose.yml` header).

**Backend** — `BE/src/routes/broadcastRoutes.ts`, mounted `app.use('/api/broadcasts', createAuditMiddleware('/api/broadcasts'), authenticate, broadcastRoutes)` (`BE/src/app.ts:431`). Every route is `requireRole('management')`. Env gate `LISTMONK_URL` + `LISTMONK_USER` + `LISTMONK_TOKEN` (lines 29-35); any missing → `503 {needsSetup:true}` (lines 38-42). Fixed paths only (header lines 17-18). Upstream calls wrapped:

| Dwellium route | listmonk call | Lines |
|---|---|---|
| `GET /api/broadcasts/lists` | `GET /api/lists?page=1&per_page=100` | 63-73 |
| `GET /api/broadcasts/templates` | `GET /api/templates` | 75-85 |
| `GET /api/broadcasts/campaigns` | `GET /api/campaigns?page=1&per_page=50&order_by=created_at&order=DESC` | 87-97 |
| `POST /api/broadcasts/campaigns` | `POST /api/campaigns` with `type:'regular'`, `content_type` default `richtext`, `body` default `''`, optional `template_id` — **draft only, never started** (lines 18-19, 99) | 99-131 |
| `POST /api/broadcasts/campaigns/:id/test` | `GET /api/campaigns/:id` then `POST /api/campaigns/:id/test` with `subscribers[]` | 133-169 |

Not built from plan 047 §listmonk steps (`REPO/plans/047-…md` lines 291-297): `POST /sync-residents` (subscriber upsert), `GET /campaigns/:id/stats`, `POST /tx`, Template-Generator/Automation/Hermes hooks, nightly bounce/unsubscribe job. Verified by grep: only `LISTMONK_URL|USER|TOKEN` are read anywhere in `BE/src`.

**Frontend**
- Client `FE/components/Broadcasts/broadcastsApi.ts`: `listBroadcastLists/Templates/Campaigns` (59-61), `createCampaignDraft` (63-81), `sendCampaignTest` (83-96). 503 → `{kind:'needs-setup'}`.
- Widget `FE/components/Broadcasts/Broadcasts.tsx`: states loading / needs-setup ("Connect listmonk", 100-111) / error+Retry (113-119) / ok. OK view = "New notice" composer: subject + Audience select (lists with `subscriber_count`) + Template select → **Create draft** (123-154); Campaigns table name/subject/status/created (156-177). "Open listmonk ↗" link only when `VITE_LISTMONK_URL` is set (57, 87-91). **`sendCampaignTest` is imported nowhere in the UI** (grep: only defined in broadcastsApi.ts) — test-send exists as API only. Composer never sends a body → drafts are created with an empty body and must be finished in listmonk admin.
- Registry `FE/registry/widgetRegistry.ts:872-883` (`'broadcasts'`, tier tools, icon megaphone, 720×480). Dock row `FE/data/hierarchy.ts:35` (group "Property Management", pinned). Tools hub row `FE/data/toolsHub.ts:39` (`envVar:'VITE_LISTMONK_URL'`, license "AGPL-3.0-only (listmonk, via API)"); status rule `resolveToolStatus` lines 51-60 (`needs-setup` while env unset); Tools hub renders "Set up" → opens Guide (`FE/components/ToolsHub/ToolsHub.tsx:29-33, 60-63`). Guide row `FE/content/guides/gettingStarted.ts:64`.

**Env gates:** frontend `VITE_LISTMONK_URL` (launcher link + Tools-hub Ready flip only — the widget itself keys on the proxy's 503, not the env); backend `LISTMONK_URL`, `LISTMONK_USER`, `LISTMONK_TOKEN` (deploy upserts the token secret `dwellium-listmonk-token`: `BE/deploy/cloud-run.sh:121,169-175`).

**Ops docs:** `REPO/tools/listmonk/README.md` — GCP Always-Free e2-micro (us-central1, 30 GB pd-standard, static IP, Caddy TLS on `lists.dwellium.com`, port 9000 loopback-only), Brevo free SMTP 300/day (§4), API user `dwellium` + Cloud Run env (§5), verify (§6), ops notes (mem caps 256 MB/512 MB, pg_dump backups, never hand-DELETE). `docker-compose.yml`: `listmonk/listmonk:latest` + `postgres:17-alpine`, `--install --idempotent --yes && --upgrade --yes`.

**Tests**
- Backend `BE/tests/broadcastRoutes.test.ts`: 503+`needsSetup` on every route when env unset (41); 401 without session (58); 403 for tenant role (63); `GET /lists` sends `token dwellium:tok_test`, hits `…/api/lists?page=1&per_page=100`, unwraps `{data:{results}}` (76-89); campaigns/templates unwrap (91); `POST /campaigns` creates DRAFT, 201, `type:'regular'` (105); 400 without subject/lists, listmonk never called (126); test route re-reads campaign then posts subscribers (137); 400 bad emails / 500→502 (156); fetch throws → 502 (165).
- Frontend `FE/test/broadcastsWidget.test.tsx`: api 503→needs-setup for list+create (54); 200→data, 400→backend error text, offline→"Backend unreachable" (60); widget needs-setup card with e2-micro pointer, button opens `tools-hub` (71); lists+campaigns render, composer POSTs `{subject, lists:[1], template_id:2}` to `/api/broadcasts/campaigns`, "Draft created" (80); error state + Retry (101). `FE/test/toolsHub.test.tsx:55,91`: `broadcasts` is `needs-setup` with empty env.

**Production status (today):** Tools hub on https://argyleholocron.netlify.app shows Broadcasts = **Set up** (no `VITE_LISTMONK_URL` on Netlify — consistent with `toolsHub.test.tsx:55`). Proxy deployed on Cloud Run: `curl -s -o /dev/null -w '%{http_code}' https://argyleholocron.netlify.app/api/broadcasts/lists` → **401** (verified 2026-08-23; auth gate runs before env gate). With a session it answers 503 (caller-reported; matches `broadcastRoutes.ts:38-42`). The e2-micro/listmonk instance, DNS and Brevo are Ilya-run steps (README §1-4) — not confirmed deployed.

## 1.3 Gap table — listmonk

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| L1 Lists / opt-in | 🟡 | Widget Audience dropdown (read-only, with `subscriber_count`) via `GET /api/broadcasts/lists` | No create/edit lists; opt-in type not surfaced. Full mgmt only via "Open listmonk ↗". |
| L2 SQL segmentation | ❌ | — | Admin-only (Open ↗). Proxy exposes no subscriber query. |
| L3 Subscriber management | ❌ | — | Plan step 2 `POST /sync-residents` not built; no `/api/subscribers` proxy. Admin-only. |
| L4 Import | ❌ | — | Admin-only. |
| L5 Campaign lifecycle | 🟡 | Widget lists campaigns + creates **draft** (`POST /api/campaigns`, `type regular`, body `''`) | Start/schedule/pause/cancel/delete deliberately left in admin (`Broadcasts.tsx:6`, `broadcastRoutes.ts:18-19`). Draft body empty — must be edited upstream. |
| L6 Test send + preview | 🟡 | Backend `POST /campaigns/:id/test` + client `sendCampaignTest` exist | **No UI calls it**; preview not proxied. |
| L7 Templates | 🟡 | Widget Template select via `GET /api/broadcasts/templates` | Pick only; no editor, no body. Template authoring = admin. |
| L8 Analytics | ❌ | Status pill only (`draft/running/…`) | No `analytics/{type}`, `running/stats`, per-campaign stats proxied (plan step 2 `GET /campaigns/:id/stats` not built). |
| L9 Transactional API | ❌ | — | Plan step 2 `POST /tx` + Automation/Hermes hooks not built. API-only feature upstream → not reachable via Open ↗ either. |
| L10 Bounce processing | ❌ | — | Plan step 7 nightly bounce/unsubscribe sync not built. Viewable in admin. |
| L11 Media library | ❌ | — | Admin-only. |
| L12 Multi-SMTP / queues / rate limits | ➖ | Ops config in admin Settings → SMTP (Brevo, `tools/listmonk/README.md` §4) | Server-side setting, not a widget concern by design. |
| L13 Messenger interfaces (SMS/WhatsApp/FCM) | ➖ | — | Plan 047 scopes Broadcasts to e-mail notices (plan lines 281-288); never in scope. Configurable upstream if wanted. |
| L14 Privacy / OIDC / roles / API tokens | 🟡 | Proxy authenticates with a granular API user token (`LISTMONK_USER/TOKEN`, README §5); Dwellium side adds `authenticate` + `requireRole('management')` + audit middleware | SSO/roles/privacy pages admin-only. |
| L15 Public archive | ❌ | — | Admin-only. |

## 1.4 Parity numbers — listmonk (15 features; ➖ = 2 → 13 in-scope)

Weighted scoring: ✅ = 1, 🟡 = 0.5, ❌/➖ = 0.

| Path | Count | / 15 | / 13 (excl. ➖) |
|---|---|---|---|
| (a1) In-Dwellium widget UI, fully ✅ | 0 | 0 % | 0 % |
| (a1) Widget UI, ✅+🟡 (L1, L5, L7) | 3 partial | 20 % partial-inclusive; weighted 1.5/15 = **10 %** | 23 %; weighted 1.5/13 = 12 % |
| (a2) Widget + backend proxy API (adds L6 test-send, L14 token auth) | 5 partial | 33 % partial-inclusive; weighted 2.5/15 = **17 %** | 38 %; weighted 19 % |
| (a3) "Open listmonk ↗" to the external admin (needs `VITE_LISTMONK_URL`) | 14 (all but L9) | **93 %** | 12/13 = 92 % |
| (a) Feature coverage once configured = a2 ∪ a3 | 14/15 | **93 %** | 92 % |
| (b) Native in Dwellium (reimplemented UI) | 0 full, 3 thin-client partials | **0 % full / 10 % weighted / 20 % partial-inclusive** | 0 / 12 / 23 % |

Reading: the integration is a launcher + a 3-endpoint read view + one draft-create; ~90 % of listmonk's value arrives only by opening the admin in a new tab.

## 1.5 What it would take to close each ❌/🟡

| Row | Close-out | Size |
|---|---|---|
| L1 lists 🟡 | Proxy `POST/PUT /api/lists`; add "New audience" row in widget | S |
| L2 SQL segmentation ❌ | Proxy `GET /api/subscribers?query=` behind an allow-listed expression builder (property/unit/role) | M |
| L3 subscribers ❌ | Plan step 2 `POST /sync-residents`: read entities SQLite → upsert `/api/subscribers` with attribs; "Sync residents" button | M |
| L4 import ❌ | Leave in admin (Open ↗); or proxy `/api/import` multipart | ➖ / M |
| L5 lifecycle 🟡 | Add body editor (reuse Template Generator HTML per plan step 5) + `PUT /campaigns/:id/status` with confirm for `scheduled`/`running` | M |
| L6 test send 🟡 | Wire existing `sendCampaignTest` into a "Send test to me" button; proxy `GET /preview` into an iframe/srcdoc | S |
| L7 templates 🟡 | Leave authoring in admin; optionally proxy `GET /templates/:id/preview` | S |
| L8 analytics ❌ | Proxy `GET /campaigns/analytics/{type}` + `running/stats`; sparkline column | M |
| L9 transactional ❌ | Proxy `POST /api/tx` (template_id + data), confirm flag; hook Automation Hub / Hermes `send_broadcast` (plan step 5) | M |
| L10 bounces ❌ | Nightly Automation job pulling `/api/bounces` + unsubscribes → soft flags on resident records (plan step 7) | M |
| L11 media ❌ | Leave in admin | ➖ |
| L14 roles 🟡 | Nothing required; optionally per-user API tokens | S |
| L15 archive ❌ | Proxy `PUT /campaigns/:id/archive` + toggle | S |

---

# 2. Dub (dubinc/dub) → Dwellium "Links & QR"

## 2.1 Upstream capabilities (fetched)

Sources: README https://github.com/dubinc/dub ("the modern, open-source link attribution platform for short links, conversion tracking, and affiliate programs"; AGPLv3 core + commercial `/ee`; "You can self-host Dub"); docs intro https://dub.co/docs/introduction ; create-link API https://dub.co/docs/api-reference/endpoint/create-a-link ; QR API https://dub.co/docs/api-reference/endpoint/retrieve-a-qr-code ; self-hosting https://dub.co/docs/self-hosting ; pricing https://dub.co/pricing .

| # | Feature | Upstream source |
|---|---|---|
| D1 | Short links with custom slug (`url`, `key`, `keyLength`, `prefix`) | create-a-link |
| D2 | Custom domains (`domain`, default workspace primary domain or `dub.sh`) | create-a-link |
| D3 | QR codes — `GET /qr?url=` unauthenticated PNG, `size` (default 600), `level`, `fgColor`, `bgColor`, `margin`; logo/hideLogo paid; `qrCode` URL on each link | retrieve-a-qr-code ; create-a-link |
| D4 | Real-time click/link analytics (`clicks` on link; "Link analytics") | docs/introduction ; create-a-link |
| D5 | Conversion tracking / marketing attribution (`trackConversion`, `leads`, `conversions`, `sales`, `saleAmount`) | README ; create-a-link |
| D6 | Partner / affiliate programs (`programId`, `partnerId`) | README ; docs/introduction |
| D7 | Event webhooks | docs/introduction |
| D8 | REST API + SDKs (TS, Python, Go, PHP, Ruby; web/iOS/RN), bulk link creation | docs/introduction |
| D9 | Link controls: `expiresAt`/`expiredUrl`, `password`, `archived` | create-a-link |
| D10 | Link cloaking (`rewrite`) + custom link previews (`proxy`, `title`, `description`, `image`, `video`) | create-a-link |
| D11 | Device & geo targeting (`ios`, `android`, `geo`) | create-a-link |
| D12 | UTM / ref builder (`utm_source…utm_content`, `ref`) | create-a-link |
| D13 | A/B testing (`testVariants`, `testStartedAt/CompletedAt`) | create-a-link |
| D14 | Organisation: `tagIds/tagNames`, `folderId`, `comments`, `externalId`, `tenantId` | create-a-link |
| D15 | Integrations: Stripe, Shopify, Google Tag Manager, Zapier, HubSpot, Segment | docs/introduction |

Self-hosting (fetched): requires GitHub, Tinybird, Upstash, PlanetScale, Vercel, Cloudflare/AWS; "Docker is currently not supported, but we have a few open issues and PRs for it." → plan 047's "use Dub cloud" decision (plan line 312) still holds.

**Pricing caveat (material):** https://dub.co/pricing as fetched 2026-08-23 lists Business $90/mo, Advanced $300/mo, Enterprise (14-day trials) and **no free plan**. Dwellium text asserts "dub.co free plan (~25 links/mo + QR)" in `FE/components/ShortLinks/shortLinksApi.ts:5-6`, `ShortLinks.tsx:7-8, 84-85`, `BE/src/routes/linkRoutes.ts:5-6`, plan addendum line 511. Plan line ~503 already says free-tier numbers must be re-verified at build time. Treat the $0 assumption as **unverified** until Ilya confirms in the Dub signup flow.

## 2.2 What Dwellium has

**Integration model:** backend proxy (raw `fetch` to `https://api.dub.co`, no `dub` SDK — `BE/package.json` has no `"dub"` dependency) + native React widget. **No embed and no "Open ↗" launcher**: `ShortLinks.tsx` never reads `VITE_DUB_URL`; that env only flips the Tools-hub pill (`FE/data/toolsHub.ts:40`, registry comment `widgetRegistry.ts:885`).

**Backend** — `BE/src/routes/linkRoutes.ts`, mounted `app.use('/api/links', createAuditMiddleware('/api/links'), authenticate, linkRoutes)` (`BE/src/app.ts:432`). `requireRole('management')`. Env gate `DUB_API_KEY` (27-35); optional `DUB_API_BASE` (default `https://api.dub.co`), `DUB_WORKSPACE` (appended as `workspaceId=`, 44-56). Missing key → `503 {needsSetup:true}` (38-42).

| Dwellium route | Dub call | Lines |
|---|---|---|
| `POST /api/links` `{url, key?, entityType?, entityId?}` | `POST /links` `{url, key?, externalId:'type:id'?}`; result UPSERTed into SQLite `external_links` (tool `'dub'`, UNIQUE(tool, external_type, external_id); never deleted) | 106-135; upsert 85-104; schema `BE/src/services/dwelliumSchema.ts:356-371` |
| `GET /api/links` | `GET /links?page=1&pageSize=100`; each row re-UPSERTed to mirror clicks | 137-153 |
| QR | no proxy — uses Dub's `qrCode` URL or falls back to `${apiBase}/qr?url=` (69-81); browser loads the PNG directly from Dub | — |

Not built from plan 047 §Dub (plan lines 318-329): `dub` SDK, `DUB_DOMAIN`, `DUB_WEBHOOK_SECRET` + HMAC webhook in `webhookRoutes.ts` (grep: no "dub" there), `GET /:id/qr` PNG proxy, `POST /:id/archive`, ARA tools `links.*`, PublishDialog "Short link + QR", Strata "Print maintenance QR" sheet.

**Frontend**
- Client `FE/components/ShortLinks/shortLinksApi.ts`: `listShortLinks` (36-46), `createShortLink({url,key?})` (48-61). 503 → needs-setup.
- Widget `FE/components/ShortLinks/ShortLinks.tsx`: create form URL + optional custom key (101-126, client-side `^https?://` check 45/119); table short link / destination / clicks / Copy (clipboard) / QR toggle rendering `<img src={qrCode} width=120>` (136-165); needs-setup "Connect Dub" card (78-89); error + Retry (91-97). **Never sends `entityType/entityId`** (48) — the entity mapping the backend supports is unused by the UI.
- Registry `FE/registry/widgetRegistry.ts:886-896` (`'short-links'`, "Links & QR", icon qr-code, 520×420). Dock `FE/data/hierarchy.ts:36`. Tools hub `FE/data/toolsHub.ts:40` (`envVar:'VITE_DUB_URL'`, "AGPL-3.0-only (Dub, hosted API)"). Guide row `gettingStarted.ts:65`.

**Env gates:** frontend `VITE_DUB_URL` (status pill only); backend `DUB_API_KEY` (secret `dwellium-dub-api-key`, `BE/deploy/cloud-run.sh:122`), optional `DUB_WORKSPACE` (`cloud-run.sh:177-178`), `DUB_API_BASE`.

**Tests**
- Backend `BE/tests/linkRoutes.test.ts`: 503+`needsSetup` on both routes without key (50); 401 without session (64); 403 tenant (69); `POST /` sends `Bearer dub_test_key` to `…/links` with `{url,key,externalId:'unit:2B'}`, 201, row in `external_links` with entity_type/unit, second POST same id → still 1 row (82-108); `workspaceId` appended when `DUB_WORKSPACE` set (110); bad url → 400, Dub never called (123); `GET /` handles array and `{links:[…]}` shapes with clicks (132); Dub 500 → 502, fetch throws → 502 (152).
- Frontend `FE/test/shortLinksWidget.test.tsx`: api 503→needs-setup (45); 200/400/offline mapping (51); "Connect Dub" card mentions `DUB_API_KEY`, button opens `tools-hub` (62); link row shows clicks `12`, QR toggle img `src` = Dub `qrCode` URL (71); create POSTs `{url,key}` to `/api/links` then list refreshes (81); error + Retry (105). `FE/test/toolsHub.test.tsx:55,91`: `links` is `needs-setup` with empty env.

**Production status (today):** Tools hub shows Links & QR = **Set up** (no `VITE_DUB_URL`). Proxy live: `curl … https://argyleholocron.netlify.app/api/links` → **401** unauthenticated (verified 2026-08-23); 503 with a session (caller-reported; matches `linkRoutes.ts:38-42`). No Dub workspace/key provisioned (Ilya step).

## 2.3 Gap table — Dub

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| D1 Short links + custom key | ✅ | Widget form → `POST /api/links` → Dub `POST /links` | Works once `DUB_API_KEY` set. No `prefix`/`keyLength`. |
| D2 Custom domains | 🟡 | Implicit — Dub uses the workspace's primary domain; proxy never passes `domain` | Plan's `DUB_DOMAIN` (go.dwellium.com) not implemented; domain setup lives in Dub dashboard (no launcher). |
| D3 QR codes | ✅ | `<img>` of Dub's `qrCode` URL (or `/qr?url=`), 120 px toggle | Basic only: no size/colour/margin, no print sheet (plan step 9), no PNG proxy (`GET /:id/qr`). |
| D4 Click analytics | 🟡 | Total `clicks` column from `GET /links`, mirrored into `external_links.metadata` | No time series, geo, device, referrer; Dub analytics endpoints not proxied. |
| D5 Conversion tracking | ❌ | — | `trackConversion` never sent; leads/sales not surfaced. Low PM relevance; not in plan. |
| D6 Partner / affiliate programs | ➖ | — | Outside plan 047's Dub scope ("notices, unit signage and work orders", plan line 309). |
| D7 Webhooks | ❌ | — | Plan step 4 (`/api/webhooks/dub`, HMAC, `link.clicked` → WO vendor_opened) not built. |
| D8 REST API / SDKs / bulk | 🟡 | Raw `fetch` wraps 2 endpoints (create, list) | No `dub` SDK (plan step 1), no bulk, no ARA tools (plan step 5). |
| D9 Expiry / password / archive | ❌ | — | `archived` soft-archive endpoint (plan step 3) not built; no expiry/password fields. |
| D10 Cloaking / custom previews | ❌ | — | Not in plan; admin-only on Dub side. |
| D11 Device / geo targeting | ❌ | — | Not in plan; low PM value. |
| D12 UTM / ref | ❌ | — | Not in plan. |
| D13 A/B testing | ➖ | — | Outside plan scope; marketing feature. |
| D14 Tags / folders / externalId / tenantId | 🟡 | Backend sends `externalId='entityType:entityId'` and mirrors to `external_links` — **widget never supplies entity fields**; no tags | Plan's `tags:[kind]`, PublishDialog/Strata hooks (steps 8-9) not built. |
| D15 Integrations (Stripe, Shopify, GTM, Zapier, HubSpot, Segment) | ➖ | — | Dub-side SaaS integrations; unrelated to Dwellium's use case. |

## 2.4 Parity numbers — Dub (15 features; ➖ = 3 → 12 in-scope)

Weighted: ✅ = 1, 🟡 = 0.5.

| Path | Count | / 15 | / 12 (excl. ➖) |
|---|---|---|---|
| (a1) Widget UI, fully ✅ (D1, D3) | 2 | **13 %** | 17 % |
| (a1) Widget UI, ✅+🟡 (+D2 implicit domain, +D4 clicks) | 2 + 2 partial | 27 % partial-inclusive; weighted 3/15 = **20 %** | 33 %; weighted 25 % |
| (a2) Widget + proxy API (adds D8 API-consumed, D14 externalId) | 2 + 4 partial | 40 % partial-inclusive; weighted 4/15 = **27 %** | 50 %; weighted 33 % |
| (a3) "Open ↗" to external Dub dashboard | **none exists** | 0 % | 0 % |
| (a) Feature coverage once configured = a2 ∪ a3 | 2 ✅ + 4 🟡 | **27 % weighted / 40 % partial-inclusive** | 33 % / 50 % |
| (b) Native in Dwellium (reimplemented UI) — identical to a1, since there is no embed/launcher | 2 ✅ + 2 🟡 | **13 % full / 20 % weighted / 27 % partial-inclusive** | 17 / 25 / 33 % |

Reading: unlike listmonk, Dub has no escape hatch inside Dwellium — anything beyond create/list/clicks/QR means leaving the app for app.dub.co manually.

## 2.5 What it would take to close each ❌/🟡

| Row | Close-out | Size |
|---|---|---|
| D2 domain 🟡 | Add `DUB_DOMAIN` env, pass `domain` on create; Ilya adds DNS on Dub side | S |
| D3 QR (polish) | Proxy `GET /api/links/:id/qr` streaming PNG with `size`/`fgColor`; per-property print sheet (`@media print`) | S–M |
| D4 analytics 🟡 | Proxy Dub analytics retrieve (clicks by day / country / device) + small chart | M |
| D5 conversions ❌ | Skip unless Tenant-Portal form submissions should count as conversions; then `trackConversion:true` + `/track/lead` | M |
| D7 webhooks ❌ | `router.post('/dub')` in `webhookRoutes.ts`, HMAC via `DUB_WEBHOOK_SECRET`, bump `external_links.metadata.clicks`, WO `vendor_opened` | M |
| D8 API 🟡 | `npm i dub` optional; ARA tools `links.create|stats|qr` | S–M |
| D9 archive/expiry ❌ | `PATCH` proxy for `archived`/`expiresAt`; Archive button (soft, never delete) | S |
| D10–D12 ❌ | Expose `rewrite`, `utm_*` as optional form fields if ever needed | S each |
| D14 entity mapping 🟡 | Widget: entity picker (or open-from-context via `openWidget` detail) → send `entityType/entityId`; `tags:[kind]`; PublishDialog "Short link + QR"; Strata "Print maintenance QR" | M |
| Add "Open Dub ↗" launcher | Read `VITE_DUB_URL` in `ShortLinks.tsx` like `Broadcasts.tsx:57,87-91` | S |
| Pricing risk | Re-verify free tier in Dub signup; if none, decide paid ($90/mo) vs. swap (e.g. self-hosted Shlink/YOURLS behind the same `/api/links` contract) | decision |

---

# 3. Verification commands / URLs

```bash
# Frontend: files, registry, env usage, tests
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell"
ls src/components/Broadcasts src/components/ShortLinks
grep -n "'broadcasts'\|'short-links'" src/registry/widgetRegistry.ts            # 872-896
grep -rn "VITE_LISTMONK_URL\|VITE_DUB_URL" src | grep -v src/test              # Broadcasts.tsx:57 reads it; ShortLinks.tsx does NOT
grep -rn "sendCampaignTest" src | grep -v broadcastsApi.ts                     # → no hits (unused in UI)
npx vitest run src/test/broadcastsWidget.test.tsx src/test/shortLinksWidget.test.tsx src/test/toolsHub.test.tsx

# Backend: routes, env names, schema, tests
cd /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager
grep -n "broadcastRoutes\|linkRoutes" src/app.ts                                 # 70-71, 431-432
grep -rhoE "process\.env\.(DUB|LISTMONK)_[A-Z_]+" src | sort -u                  # DUB_API_BASE/KEY/WORKSPACE, LISTMONK_TOKEN/URL/USER
grep -n '"dub"' package.json                                                     # → none (no SDK)
grep -n -i dub src/routes/webhookRoutes.ts                                       # → none (no webhook)
grep -n external_links src/services/dwelliumSchema.ts                            # 356-371
npm test -- broadcastRoutes linkRoutes

# Production (unauthenticated → 401 proves the proxies are mounted behind auth)
curl -s -o /dev/null -w '%{http_code}\n' https://argyleholocron.netlify.app/api/broadcasts/lists   # 401 (2026-08-23)
curl -s -o /dev/null -w '%{http_code}\n' https://argyleholocron.netlify.app/api/links              # 401 (2026-08-23)
# With a management session token: expect 503 {"needsSetup":true} until LISTMONK_* / DUB_API_KEY are set
curl -s -H "Authorization: Bearer <session>" https://argyleholocron.netlify.app/api/broadcasts/lists
curl -s -H "Authorization: Bearer <session>" https://argyleholocron.netlify.app/api/links
# Tools hub: open https://argyleholocron.netlify.app → Tools hub → Broadcasts / Links & QR pills read "Needs setup" / button "Set up"
```

Upstream pages used (all fetched 2026-08-23): https://github.com/knadh/listmonk · https://listmonk.app/ · https://listmonk.app/docs/apis/apis/ · https://listmonk.app/docs/apis/campaigns/ · https://github.com/dubinc/dub · https://dub.co/docs/introduction · https://dub.co/docs/api-reference/endpoint/create-a-link · https://dub.co/docs/api-reference/endpoint/retrieve-a-qr-code · https://dub.co/docs/self-hosting · https://dub.co/pricing
