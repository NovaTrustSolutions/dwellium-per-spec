# Plan 047: Ten open-source tools, customized for Andy — integration map + onboarding for the expanded surface

> **Executor instructions**: drafted by 12 agents (one per repo researching README/LICENSE/docs + the Dwellium slot; one architect; one onboarding designer) against `main` @ `5e78ca8` (2026-08-19). Frontend repo `~/Downloads/Dwellium -Per Spec` (app in `qualia-shell/`), backend `~/dwellium-backend/ai-dashboard369-file-manager` (Cloud Run `dwellium-backend`, us-central1, project `my-project-57391aion-ethos-api`). Build with `npx react-router build` (never `vite build`); gate = `cd qualia-shell && npx tsc -b && npx vitest run && NETLIFY=1 npx react-router build`; backend = `OPENAI_API_KEY=sk-dummy npx jest --forceExit`. **No push / Cloud Run deploy / VM create / DNS change without Ilya's per-phase go. Never DELETE/TRUNCATE; every data bridge is upsert + soft-delete only.** Ilya runs all `gcloud` commands (the harness blocks them for agents).
>
> **License rule of thumb** (verified per repo below): AGPL tools (Immich, listmonk, Dub core, RustDesk, AppFlowy, Documenso core) are self-hosted **unmodified** — all customization lives in Dwellium (our code), never in a fork; MIT (Excalidraw, cal.diy) and MPL-2.0 (Penpot) may be customized freely; FluidVoice is GPL-3 and a Mac-side companion install. **Plan 046** (first-run card, widget descriptions, Labs group, sync pill) is the foundation the onboarding section below builds on — do 046 S2/S1/F first.

## Status

- **Source**: Ilya's list of 10 repos (2026-08-19) + the request for an onboarding that keeps new users from drowning.
- **Phasing (by Andy-value ÷ effort)** — **Phase 1 (now)**: Excalidraw whiteboard (S), Documenso e-sign (M), FluidVoice companion + vocabulary (S). **Phase 2 (next)**: cal.diy scheduling (M), listmonk broadcasts (M), Dub links & QR (M), Immich photo vault (L), RustDesk remote support launcher (S), Penpot launcher (S now, self-host L later). **Phase 3 (later)**: AppFlowy (M ops + license/seat decision).
- **Shared platform work (once, before Phase 2)**: Tools VM + Caddy + Google-OAuth-per-tool identity, backend `toolsSync` bridge + proxy routes, the reusable external-tool widget, Tools hub window — see *Architecture*.
- **Decision gates for Ilya**: 10 architecture gates (G1–G10) at the end; each tool section lists its own.

## Summary table

| # | Tool | What it is (one line) | License | Dwellium slot | Pattern | Effort | Phase |
|---|------|----------------------|---------|---------------|---------|--------|-------|
| 1 | documenso/documenso | Open-source DocuSign alternative: upload PDF, place signature/text/date fields, send to re… | AGPL-3.0-only for the core | Primarily augments existing widgets, plus one small new widget. (a) Strata Dashboard → Leasing module: add 'Se… | Recommended: backend proxy + webhooks + embed SDK. Dwellium backend holds the Documenso AP… | M | 1 |
| 2 | excalidraw/excalidraw | Open-source hand-drawn-style whiteboard (README: "virtual hand-drawn style whiteboard. Col… | MIT | New widget `whiteboard` (label "Whiteboard", icon 'pen-tool' or 'pencil-ruler') registered in qualia-shell/src… | Recommended: pattern (1) native React widget — `<Excalidraw initialData={...} onChange={de… | S | 1 |
| 3 | altic-dev/FluidVoice | Open-source macOS (15+, Apple Silicon; Intel = Whisper only) menu-bar dictation app, v1.6.… | GPL-3.0 | No new widget. It is a companion install that works against every existing text field (ARA Console composer at… | Recommended: companion install (pattern 0 — zero Dwellium code). Andy installs FluidVoice,… | S.  | 1 |
| 4 | immich-app/immich | Self-hosted photo/video management server (README: "high performance self-hosted photo and… | AGPL-3.0-only | New widget `photo-vault` (label "Photo Vault", icon 'image') registered in /Users/ilyaklipinitser/Downloads/Dw… | Recommended: backend proxy (pattern 3) + iframe widget (pattern 2). Dwellium backend holds… | L | 2 |
| 5 | penpot/penpot | Open-source, self-hostable design & prototyping platform (Figma-class: vector editor, boar… | MPL-2.0 | New widget `penpot-studio` ("Design Studio") registered in /Users/ilyaklipinitser/Downloads/Dwellium -Per Spec… | Recommended: self-host Penpot on one GCE VM behind Caddy (TLS + strip X-Frame-Options + fr… | L | 2 |
| 6 | calcom/cal.diy | Cal.DIY is the original calcom/cal.com GitHub repo renamed (github.com/calcom/cal.com now … | MIT | New widget 'scheduler' ("Scheduling") registered in /Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia… | Recommended: (A) self-host cal.diy on a GCE VM at cal.dwellium.com; (B) frontend = native … | M | 2 |
| 7 | knadh/listmonk | Self-hosted newsletter / mailing-list manager (Go backend, Vue+Buefy admin UI, single bina… | AGPL-3.0-only | New widget `'broadcasts'` (label 'Broadcasts', icon 'megaphone') registered in /Users/ilyaklipinitser/Download… | Recommended: backend proxy (pattern 3). A thin Express router `/api/broadcasts/*` behind `… | M | 2 |
| 8 | dubinc/dub | Open-core link-attribution platform: branded short links on custom domains, QR codes, clic… | AGPL-3.0-only for all code EXCEPT `apps/web/app/ | New widget `'short-links'` ("Links & QR") registered in /Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qu… | Recommended: backend proxy (pattern 3) — new Express router `dubRoutes.ts` mounted at `/ap… | M | 2 |
| 9 | rustdesk/rustdesk | Open-source remote desktop (TeamViewer/AnyDesk-style): Rust core + Flutter GUI clients for… | AGPL-3.0-only | New widget `remote-support` ("Remote Support", icon 'monitor') registered in /Users/ilyaklipinitser/Downloads/… | Recommended (phase 2): "Launcher" pattern — self-hosted hbbs/hbbr on a GCE VM + native Rea… | S f | 2 |
| 10 | AppFlowy-IO/AppFlowy | Notion-style "AI workspace": pages/docs editor, databases (grid/board/calendar views), kan… | AGPL-3.0-only | New widget 'appflowy' (label "AppFlowy Workspace", icon 'book-open') in group Filing Cabinet — registered in /… | Recommended: self-host unmodified AppFlowy-Cloud stack on a GCE VM at flowy.dwellium.com; … | M | 3 |

---

## Architecture (shared platform pieces)

### Plan 047 — Shared integration architecture (ARCHITECT)

Anchors: `deploy/cloud-run.sh` (secrets via `upsert_secret_from_env` + `--set-secrets`, preserve-unknowns env merge, `GOOGLE_CLIENT_ID` ≠ `GOOGLE_OAUTH_CLIENT_ID` note at ~L140); `src/services/authMiddleware.ts:50 authenticate`; `src/services/dwelliumSchema.ts` (snake_case tables, TEXT ids, `metadata TEXT DEFAULT '{}'`, `created_at/updated_at`, `federated_identities(provider,subject,user_id)`); `src/routes/webhookRoutes.ts:22-39` (HMAC verify pattern, mounted unauthenticated at app.ts:376); `src/components/Terminal/LangFlowPanel.tsx:150-156` (iframe + reachability + "Open ↗"). CloudBrowser is a Playwright screenshot stream over `/api/cloud-browser` — NOT the iframe pattern.

### (a) Identity — ONE default: backend-issued service credentials + proxy; Google OAuth only for admin UIs
- Residents/vendors never log into any tool. They get Dwellium-minted tokens/links: Documenso recipient signing token, Cal public booking page, listmonk unsubscribe link, Dub short link, Immich shared link (expiry+password). All minted server-side behind `authenticate`.
- Andy/Lisa: tool admin UIs (Documenso, Immich, Penpot, cal.diy, AppFlowy) use the tool's own Google login with the SAME Google OAuth client (`GOOGLE_OAUTH_CLIENT_ID`, add each tool's callback URI). One Google account, one extra click, no shared session. Restrict by domain whitelist where the tool supports it.
- Rejected: small OIDC provider (new stateful service, no tool needs it for 2 admins); session-cookie passthrough (GoTrue/NextAuth JWTs ≠ Dwellium session; cross-site cookies break on *.netlify.app).
- Record mapping in existing `federated_identities` (provider=`documenso|immich|penpot|cal|appflowy`, subject=tool user id) — no new identity table.
- Precondition for in-iframe admin login: Dwellium + tools on one registrable domain (app.dwellium.com + *.dwellium.com). Until then, widgets default to "Open ↗".

### (b) Hosting topology — see `hosting_table`. Rules:
- Cloud Run: only stateless single-container + managed DB (Documenso fits; everything else that is ≥3 containers/needs local disk/UDP/WebSockets → VM).
- ONE GCE VM (`dwellium-tools-1`, e2-standard-4, 16 GB, 250 GB pd-balanced, static IP, Caddy for TLS + header rewrite) running docker compose stacks per subdomain: cal, lists (listmonk, private-only), photos, design, rustdesk. Nightly `pg_dump` + rsync to `gs://${PROJECT_ID}-dwellium-runtime/tools-backups/`. Add AppFlowy only in phase 3 (or a second VM).
- Vendor managed cloud when self-host is infeasible (Dub — "Docker not supported") or when Ilya chooses zero-ops (Documenso Cloud Teams).
- Excalidraw/FluidVoice: no hosting (npm bundle / Andy's Mac).

### (c) Secrets/env conventions
- Browser never holds a third-party key. All keys are Cloud Run secrets: add `upsert_secret_from_env <ENV> dwellium-<kebab>` lines to `deploy/cloud-run.sh` beside the OPENAI/TRELLO ones; deploy via `./deploy/cloud-run.sh` (preserve-unknowns keeps hand-set vars).
- Naming: `<TOOL>_URL` (literal env, via env_file), `<TOOL>_API_KEY|TOKEN` and `<TOOL>_WEBHOOK_SECRET` (secrets). e.g. `DOCUMENSO_API_URL/DOCUMENSO_API_KEY/DOCUMENSO_WEBHOOK_SECRET`, `CAL_API_URL/CAL_API_KEY/CAL_WEBHOOK_SECRET`, `LISTMONK_URL/LISTMONK_API_USER/LISTMONK_API_TOKEN`, `DUB_API_KEY/DUB_WEBHOOK_SECRET`, `IMMICH_URL/IMMICH_API_KEY`, `PENPOT_URL/PENPOT_ACCESS_TOKEN`, `RUSTDESK_ID_SERVER/RUSTDESK_RELAY/RUSTDESK_PUBKEY` (non-secret).
- VM `.env` files for the compose stacks live only on the VM (chmod 600) + Secret Manager copy; never in git.
- Webhook receivers: HMAC-verify (`webhookRoutes.ts:22-39` pattern), dedupe by upstream id, UPSERT only.

### (d) Data bridge — "tools sync" service
New `src/services/toolsSyncService.ts` + `src/routes/toolsSyncRoutes.ts` mounted `app.use('/api/tools', createAuditMiddleware('/api/tools'), authenticate, toolsSyncRoutes)` beside app.ts:421. Per-tool routers stay thin and call the service.
Tables (dwelliumSchema.ts conventions):
- `external_links(id TEXT PK, tool TEXT, entity_type TEXT CHECK(property|unit|resident|lease|vendor|workitem|doc), entity_id TEXT, external_type TEXT, external_id TEXT, external_url TEXT, metadata TEXT DEFAULT '{}', created_at, updated_at, UNIQUE(tool, external_type, external_id))` — the one mapping table for Documenso envelopes, Cal bookings/event types, listmonk lists/subscribers, Dub links, Immich albums/assets, Penpot files, RustDesk machines.
- `tool_sync_runs(id, tool, direction TEXT CHECK(out|in), status, started_at, finished_at, summary TEXT DEFAULT '{}')` — idempotent run log; nightly via existing `schedulerRoutes`.
Routes: `GET /api/tools/:tool/status`; `POST /api/tools/:tool/sync` (out: entities→tool, UPSERT); `GET /api/tools/links?entity_type&entity_id`; tool-specific: `/api/esign/*`, `/api/cal/*`, `/api/broadcasts/*`, `/api/links/*`, `/api/photos/*`, `/api/penpot/*`, `/api/remote-support/config`; webhooks `/api/webhooks/{documenso,cal,dub,penpot}`. Entity→object map: property→listmonk list/Immich album root/Cal team; unit→Cal event-type slug `unit-<id>-showing`/Immich album/Dub tag; resident→Documenso recipient/listmonk subscriber (attribs property_id,unit_id,lease_end,role); lease (workitem)→Documenso envelope (`workitem.metadata.esign`); vendor→Cal event type/listmonk Vendors list; workitem→Immich album/Dub link/Cal booking.

### (e) Frontend "external tool widget" pattern
One component `src/components/ExternalTool/ExternalToolFrame.tsx` (generalize LangFlowPanel.tsx:150-156): props `{ id, url (from `/api/tools/:tool/status`), title, allow, openInNewTabByDefault }` → reachability check → iframe → "Open ↗" fallback + "Setup" card. Each tool = one `widgetRegistry.ts` entry (`lazyWithReload`, category, minWidth/Height) + one `hierarchy.ts` dock row + a `tools/<tool>.config.ts`. Native widgets (Excalidraw, Broadcasts, Links & QR, Scheduler embed, Remote Support) register the same way but render React instead of the frame.

### (f) License compliance rules
- MIT (Excalidraw, cal.diy): free to fork/rebrand/bundle; keep copyright notice in NOTICE.
- MPL-2.0 (Penpot): no network clause; only modified Penpot source files must be published (public fork) — prefer config/nginx overrides/API.
- AGPL-3.0 (AppFlowy, Immich, Documenso core, listmonk, Dub, RustDesk): run UNMODIFIED official images; customize via API/env/our widget code only. Any patch served to users ⇒ publish the fork. Documenso `packages/ee` and Dub `(ee)` dirs are proprietary — never enable without a paid key. AppFlowy free self-host = 1 seat: needs paid plan or AGPL self-build.
- GPL-3.0 (FluidVoice): stock install only; never vendor Swift code; no CORS fork.

### (g) Phasing (value ÷ effort)
| Phase | Items | Why |
|---|---|---|
| 1 now | Excalidraw whiteboard (S); Documenso E-Sign widget + esignRoutes + webhook (M, Cloud Run or Cloud); FluidVoice install + vocab seed (S); ExternalToolFrame + toolsSync tables/routes scaffolding | No new VM; leases are Andy's #1 paper flow; foundations for all later tools |
| 2 next | Tools VM + Caddy; cal.diy scheduler (M); listmonk broadcasts (M); Dub links/QR (M, managed); Immich photo vault (L); RustDesk launcher (S); Penpot lite launcher (S) | Real PM value, needs the VM/domain/SMTP once |
| 3 later | Penpot full self-host iframe; RustDesk web-client spike; AppFlowy; web push-to-talk; Excalidraw collab | Ops-heavy or overlapping with Scribe/Wiki/Task Board |

### (h) Ilya decision gates — see `ilya_gates`.

### (i) STOP conditions
- Never DELETE/TRUNCATE/DROP any user-data table (SQLite or tool Postgres); sync is UPSERT-only; unsubscribes/archives are soft flags.
- No `git push`, deploy, DNS change, or paid plan signup without explicit "go" from Ilya.
- No third-party key in frontend code or Netlify env; stop if a tool only works that way.
- Stop if a tool requires modifying AGPL source to integrate (route around or drop the tool).
- Stop and report if iframe login fails on Safari/Chrome rather than hacking cookies.
- Never store RustDesk passwords, resident signing tokens, or p12 passphrases in One Save/SQLite plaintext.

### Hosting topology & cost bands

| tool | where hosted | stateful services | est. monthly cost band | notes |
|---|---|---|---|---|
| Excalidraw | Netlify bundle (npm, lazy chunk) | none (JSON via /api/scribe/files) | $0 | MIT; copy fonts to public/ for zero CDN |
| FluidVoice | Andy's Mac (brew cask) | none | $0 | GPL-3; no server side |
| Documenso | Cloud Run (official image) + Cloud SQL Postgres (db-f1-micro) + GCS + SMTP; OR Documenso Cloud Teams | Postgres, object store, p12 in Secret Manager | $25–60 (Cloud Run+SQL) or ~$30–50 (Cloud Teams) | AGPL core unmodified; ee disabled |
| cal.diy | Tools VM (compose: web, api-v2, postgres, redis) | Postgres, Redis | share of VM | MIT; Caddy at cal.dwellium.com; ALLOWED_HOSTNAMES |
| listmonk | Tools VM (compose: app, postgres), private-only, proxy via /api/broadcasts | Postgres, media volume | share of VM + SES/Postmark $0–15 | AGPL unmodified; SPF/DKIM/DMARC |
| Immich | Tools VM (compose: server, ML optional, valkey, custom postgres) | Postgres (local SSD), uploads disk | share of VM + disk growth ($10–40) | AGPL unmodified; v3 needs x86-64-v2 |
| Penpot | Phase 2: managed design.penpot.app (launcher); Phase 3: Tools VM (6 containers) | Postgres, Valkey, assets | $0 now; share of VM later | MPL-2; X-Frame-Options override at Caddy |
| RustDesk hbbs/hbbr | Tools VM (compose, static IP, TCP 21114-21119/UDP 21116) | tiny sqlite + keypair volume | share of VM | AGPL unmodified; stock clients |
| Dub | Dub managed cloud via /api/links proxy | none ours (SQLite `external_links`) | $0–90 (plan limits unverified) | AGPL self-host infeasible (no Docker) |
| AppFlowy | Phase 3 only: second VM or same VM if RAM allows (10 containers) | Postgres, MinIO, Redis | +$30–60 | AGPL + 1-seat free tier; paid plan or self-build |
| Tools VM itself | GCE e2-standard-4 + 250 GB pd-balanced + static IP, us-central1 | all of the above | $110–160 | Start e2-standard-2 ($50–70) if Immich ML off |
| Dwellium backend | Cloud Run (existing) | SQLite on runtime bucket/disk | existing | toolsSync + proxies live here |

---

## Per-tool plans (phase order)

## Documenso — self-hosted e-signature for leases, renewals, vendor/owner agreements

- **What**: AGPL-3.0 DocuSign alternative (React Router v7 + Hono, Prisma/Postgres, S3, SMTP, p12 signing cert). v2 REST API (`/api/v2`, header `Authorization: api_…`, envelopes), webhooks (`DOCUMENT_SENT/SIGNED/COMPLETED…`), `@documenso/embed-react` (`EmbedSignDocument`/`EmbedDirectTemplate`, `host` prop for self-host).
- **License**: core `AGPL-3.0-only`; `packages/ee` = proprietary Documenso Commercial License. Rule: run the **unmodified** official image; customize only via API/SDK/webhooks/env/templates → no source-publication duty, no EE key. Do not enable `NEXT_PRIVATE_DOCUMENSO_LICENSE_KEY` features.
- **Hosting**: Cloud Run (`documenso/documenso` image, same project/region as `dwellium-backend`) + Cloud SQL Postgres + GCS S3-interop + SMTP (Resend/Gmail) + cert in Secret Manager (`NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS`, `_PASSPHRASE`, `NEXTAUTH_SECRET`, `NEXT_PRIVATE_ENCRYPTION_KEY`, `NEXT_PUBLIC_WEBAPP_URL=https://esign.<domain>`). Alternative: Documenso Cloud Teams (same integration code, env-only).
- **Fit for Andy**: Leasing module already has manual docStatus `draft→pending_review→approved→sent→signed→countersigned` (`LeasingModule.tsx:30-36`, `dwelliumRoutes.ts:2382`) — Documenso makes `sent/signed/countersigned` real. Renewals tab, Tenant Portal "My Lease", vendor/owner agreements, signed PDFs auto-filed.
- **Slot**: augments Strata Dashboard → Leasing, Tenant Portal → lease tab; new `e-sign` widget (iframe of Documenso, CloudBrowser pattern) in group Property Management.
- **Pattern**: backend proxy holds API key; webhooks drive status; embed SDK in Tenant Portal. Andy logs into Documenso with his Google account (Documenso Google OAuth); residents sign by token only.
- **Effort**: M, ~2 weeks (1–2 days Phase-1 iframe; 5–7 days API+webhook+embed; 1–2 days infra).

### Steps
1. **Infra** (ops, no code): deploy Documenso to Cloud Run with env above; create team "AstraStrata", generate API key + webhook (URL `https://argyleholocron.netlify.app/api/webhooks/documenso`, all DOCUMENT_* events), create templates `lease`, `renewal`, `vendor_agreement`. Record template ids.
2. **Backend env** — `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager`: add `DOCUMENSO_API_URL`, `DOCUMENSO_API_KEY`, `DOCUMENSO_WEBHOOK_SECRET`, `DOCUMENSO_TEMPLATE_LEASE`, `DOCUMENSO_TEMPLATE_RENEWAL` to Cloud Run secrets/.env.example (never to the SPA).
3. **Backend route** — new `src/routes/esignRoutes.ts` (copy shape of `src/routes/leaseCoachRoutes.ts:8-12`):
   - `POST /leases/:workitemId/send` (`authenticate`, `requireRole('management')` from `src/services/authMiddleware.ts:50,102`): read workitem via `store.getWorkitem`, call Documenso v2 envelope-from-template with recipients [tenant email/name, Andy countersigner] + prefill, send; write `metadata.esign={envelopeId,recipients[{email,role,token}]}`; reuse `DOC_TRANSITIONS` logic from `dwelliumRoutes.ts:2382-2411` to set `docStatus='sent'`.
   - `GET /leases/:workitemId/signing-token` (`authenticate`, `requireTenant` as in `tenantRoutes.ts:144`): return the calling tenant's token only.
   - `GET /leases/:workitemId/signed-pdf` (`authenticate`): stream signed PDF from Documenso.
   - Mount in `src/app.ts` next to `:402`: `app.use('/api/esign', authenticate, esignRoutes)`.
4. **Webhook** — extend `src/routes/webhookRoutes.ts` (mounted unauthenticated at `app.ts:376`): `POST /documenso` verifying Documenso signature (HMAC pattern at `:22-39`); map `DOCUMENT_SIGNED→signed`, `DOCUMENT_COMPLETED→countersigned`, `DOCUMENT_REJECTED/CANCELLED→draft` + note; on COMPLETED download PDF → file store and set `metadata.esign.signedPdfFileId`. Use `payload.envelopeId` as key.
5. **Frontend – Leasing**: in `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell/src/components/StrataDashboard/modules/LeasingModule.tsx` add button "Send for e-signature" beside `DOC_NEXT_STATUS` buttons (`:1056`) when `docStatus==='approved'`, calling `POST /api/esign/leases/:id/send` via `strataPut`-style helper; show `metadata.esign.recipients[].status` chips; "Out for Signing" filter (`:693`) reads `docStatus==='sent'`.
6. **Frontend – Tenant Portal**: `npm i @documenso/embed-react`; in `src/components/TenantPortal/TenantPortal.tsx` `LeaseTab` (`:581`) fetch `/api/esign/leases/:id/signing-token`; if token render `<EmbedSignDocument host={import.meta.env.VITE_DOCUMENSO_URL} token={token} onDocumentCompleted={refetch}/>`, else link to signed PDF.
7. **Widget**: add `'e-sign'` to `src/registry/widgetRegistry.ts` (clone `'cloud-browser'` entry `:564-572`, `category:'property'`), component `src/components/ESign/ESign.tsx` = `<iframe src={VITE_DOCUMENSO_URL}>` (Andy's inbox/templates); add dock entry in `src/data/hierarchy.ts:27` (`group:'Property Management'`, icon `'pen-line'`). Add `VITE_DOCUMENSO_URL` to Netlify env. No new Netlify redirect needed (`/api/*` already proxied by `scripts/write-netlify-redirects.mjs:14`); Documenso CSP/`frame-ancestors` must allow `argyleholocron.netlify.app`.
8. **ARA/Hermes**: register tools `esign.send_lease`, `esign.status` (thin wrappers over step 3) in the ARA tool list in `src/routes/araRoutes.ts`.

### Test
- Backend (jest, `tests/esignRoutes.test.ts`): mock fetch to Documenso; `POST /api/esign/leases/:id/send` with docStatus `approved` → 200, `metadata.esign.envelopeId` set, `docStatus==='sent'`; with docStatus `draft` → 400. `tests/webhookRoutes.test.ts`: `POST /api/webhooks/documenso` bad signature → 401; `DOCUMENT_COMPLETED` → workitem `docStatus==='countersigned'`.
- Frontend (vitest, `src/test/leasingEsign.test.tsx`): renders "Send for e-signature" only when `docStatus==='approved'`; TenantPortal LeaseTab renders `EmbedSignDocument` when token present.

### Verify
- `curl -I https://esign.<domain>/` → 200; `curl -H "Authorization: api_…" https://esign.<domain>/api/v2/…` lists templates.
- Human: in Strata → Leasing, approve a lease, click "Send for e-signature"; tenant logs into Tenant Portal → My Lease → signs inline; Andy countersigns in E-Sign widget; Leasing shows `countersigned` and the signed PDF opens from the lease; Cloud Run logs show one webhook hit per event.

---

## Excalidraw — embeddable MIT whiteboard as a native Dwellium widget (floor plans, maintenance markup, doc diagrams)

**What/License:** `@excalidraw/excalidraw` React component; MIT (LICENSE: "Copyright (c) 2020 Excalidraw") → free to customize/fork/serve, keep the notice. No service to host; JSON in/out via `initialData` / `onChange(elements, appState, files)` (docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props).
**Pattern:** (1) native registry widget, lazy-loaded. Persistence via existing authenticated Scribe file store. Effort **S (1–2 days)**; phase **1**.

### Steps (Dwellium side)
1. `cd "qualia-shell" && npm i @excalidraw/excalidraw` — first run `npm info @excalidraw/excalidraw peerDependencies` and confirm React 19.2.4 (package.json:46) is in range.
2. Create `src/components/Whiteboard/Whiteboard.tsx`:
   - `import { Excalidraw } from '@excalidraw/excalidraw'; import '@excalidraw/excalidraw/index.css';`
   - Wrapper `div` with `height:100%; width:100%` (Excalidraw fills its container).
   - `theme` from `src/context/ThemeContext.tsx`; `UIOptions={{ canvasActions: { loadScene: false } }}`; `renderTopRightUI` → "Save" + "Attach PNG to unit".
   - Load: `GET /api/scribe/files/whiteboards/<boardId>.excalidraw` → `initialData`. Save: debounced (1.5 s, on idle) `PUT /api/scribe/files/whiteboards/<boardId>.excalidraw` with `{ type:'excalidraw', version:2, elements, appState:{viewBackgroundColor,gridSize}, files }` — strip `appState.collaborators`, cap `files` to ≤2 MB. Route anchors: `dwellium-backend/ai-dashboard369-file-manager/src/routes/scribeRoutes.ts:101,120` (already behind `authenticate`, `services/authMiddleware.ts:50`).
   - Optional board picker: list `GET /api/scribe/files?prefix=whiteboards/` (scribeRoutes.ts:63); board metadata `{title, propertyId, unitId, workOrderId}` kept in `whiteboards/<boardId>.meta.json`.
3. Register widget in `src/registry/widgetRegistry.ts` beside `'scribe'` (~line 532): `'whiteboard': { id:'whiteboard', label:'Whiteboard', icon:'pen-tool', component: lazyWithReload(() => import('../components/Whiteboard/Whiteboard')), category:'tools', minWidth:720, minHeight:480 }`.
4. Dock it in `src/data/hierarchy.ts` under `// ── Property Management ──` (after line 21 `dock-trello`): `{ id:'dock-whiteboard', label:'Whiteboard', icon:'pen-tool', component:'whiteboard', pinned:true, group:'Property Management' }`.
5. Vite: if build complains about `process`, add `define: { 'process.env.IS_PREACT': JSON.stringify('false') }` in `vite.config.ts` (Excalidraw docs note). Fonts: copy `node_modules/@excalidraw/excalidraw/dist/prod/fonts` → `public/excalidraw-fonts/` and set `window.EXCALIDRAW_ASSET_PATH='/excalidraw-fonts/'` in `Whiteboard.tsx` before render (self-hosted, no CDN).
6. Bridge to Strata (phase 1b, small): in `src/components/StrataDashboard/modules/DesignStudio.tsx` add "Open in Whiteboard" that opens the widget with `?unitId=` preset; in `modules/MaintenanceModule.tsx` work-order detail add "Mark up photo" → opens Whiteboard with the unit photo as an image element; "Attach PNG" posts the export blob to `POST /api/unit-photos/:unitId` (`unitPhotoRoutes.ts:33`).
7. No backend change, no env vars, no Netlify redirect required (asset path is same-origin; `/api/scribe/*` already proxied).
8. Phase 2: Scribe fence — in `src/components/Scribe/MarkdownPreview.tsx` render ```` ```excalidraw ```` code fences with `<Excalidraw viewModeEnabled initialData={JSON.parse(code)} />`; export PNG via the package's export util for the PPTX/DOCX path (`src/components/Scribe/idocs/idocExport.ts`). Hermes/ARA tool `create_whiteboard` writes elements JSON to the same route.
9. Phase 3 (only if asked): Two Brains live co-drawing → deploy `excalidraw-room` websocket server to Cloud Run (`dwellium-excalidraw-room`, us-central1) and pass `isCollaborating` + room URL; needs Netlify websocket proxy config.

**Test:** `src/test/whiteboardWidget.test.tsx` (vitest + @testing-library/react, same style as `src/test/CloudBrowser.test.tsx`): mock `fetch` for `/api/scribe/files/whiteboards/*`; assert `WIDGET_REGISTRY['whiteboard']` exists with `category==='tools'` and `HIERARCHY` contains `component:'whiteboard'`; render `<Whiteboard boardId="t1"/>`, fire `onChange` once (mock `@excalidraw/excalidraw` to a stub that calls `props.onChange([{id:'e1'}],{},{})`), advance fake timers 1500 ms, expect exactly one `PUT /api/scribe/files/whiteboards/t1.excalidraw` whose body JSON has `elements.length===1`. Existing `src/test/registryWalker.test.tsx` must stay green (entry well-formed, lazy component).
**Verify:** `npm run test -- whiteboard registryWalker && npm run build` (check the whiteboard chunk is separate in the vite output, not in the main bundle); then `npm run dev`, sign in as Andy, open Sidebar → Property Management → Whiteboard, draw a rectangle, reload the page and confirm the rectangle persists; `curl -H "Authorization: Bearer <token>" https://argyleholocron.netlify.app/api/scribe/files/whiteboards/<boardId>.excalidraw` returns the JSON (200).

---

## FluidVoice — macOS system-wide dictation as a companion to Dwellium (no embed)

- **What**: GPL-3.0 Swift menu-bar app (v1.6.9, 10.7k★). Hotkey → on-device STT (Parakeet/Nemotron/Whisper/Apple) → types into the focused field via Accessibility. Optional LLM post-process, per-app prompts, custom dictionary, opt-in loopback HTTP API on 127.0.0.1:47733 (`/v1/transcribe`, `/v1/postprocess`, `/v1/dictionary/custom-words|replacements`, `/v1/history`; no auth, no CORS).
- **License**: GPL-3.0 since 2026-02-23 (Apache-2.0 before). Use as-is = no obligation. Fork + distribute binary = publish modified source. Not AGPL; never runs on our servers. Do not vendor its code.
- **Fit for Andy**: dictate emails in Inbox, notes in Scribe/Notepad, work-order notes in Strata Dashboard, talk to ARA composer; custom dictionary fixes property/resident/vendor names; Write Mode rewrites selected text.
- **Slot**: none new. Works on every existing input. Anchors: ARA mic `qualia-shell/src/components/ARAConsole/ARAConsole.tsx:1859-1870` + `araDictation.ts`; Transcription Hub Moonshine `TranscriptionHub.tsx:432-438,1304-1336`; backend `/api/transcribe` at `dwellium-backend/.../src/app.ts:385`.
- **Pattern**: companion install (zero Dwellium code) + one-off vocabulary seed over the loopback API. Alt (Phase 3): page-wide push-to-talk hook reusing `araDictation.ts` for non-Mac users.
- **Hosting**: none (Andy's Mac). **Effort**: S — 0.5 day install+seed; +1–2 days for the optional web hook.
- **Phase**: 1 for install + seed; 3 for the web-app hotkey port.

### Steps (Phase 1 — no Dwellium code)
1. Andy: `brew install --cask fluidvoice`; grant Microphone + Accessibility; pick hotkey (suggest Right-Option push-to-talk); choose Parakeet TDT v3; leave cloud AI off.
2. FluidVoice Settings → enable Local API (UserDefaults `LocalAPIEnabled`, port 47733) only while seeding.
3. Vocabulary export script `qualia-shell/scripts/fluidvoice-vocab.mjs`: read property/unit/resident/vendor names via the existing authenticated backend (`/api/*`, `authMiddleware.ts`), emit `{entries:[{text,weight,aliases}],mode:"append"}`; Andy runs `node scripts/fluidvoice-vocab.mjs | curl -s -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:47733/v1/dictionary/custom-words`. Replacements (`/v1/dictionary/replacements`) for casing/sign-off. No secrets involved; script never stores keys.
4. Per-App Configuration: Chrome → prompt set "Property-management assistant; keep names capitalised; short email format; no filler".
5. Control Panel note: add a 'Dictation (FluidVoice)' paragraph to `qualia-shell/src/components/ControlPanel/LlmIntegrationsSection.tsx` (install command, hotkey, seed command). Text only; no state.
6. Disable Local API afterwards (it exposes `/v1/history` to any local process).

### Steps (Phase 3 — optional 'port the idea' for non-Mac users)
1. `qualia-shell/src/lib/useGlobalDictationHotkey.ts`: on keydown of configured key while `document.activeElement` is input/textarea, call `startDictation(getSpeechRecognitionCtor(), el.value, {onText: v => el.value = v, onEnd})` from `src/components/ARAConsole/araDictation.ts`; stop on keyup. ~50 lines.
2. Mount once in `qualia-shell/app/root.tsx`; hotkey pref in `src/lib/araPrefsStore.ts`. No registry/hierarchy/Netlify/backend change.

### Test
- Phase 1: `vitest run scripts/__tests__/fluidvoiceVocab.test.ts` — asserts export maps a fixture property/resident list to `{text, aliases}` entries, dedupes, and `mode === 'append'` (never `replace`).
- Phase 3: `vitest run src/test/globalDictationHotkey.test.ts` — with FakeSR from `src/test/araDictation.test.ts`, keydown on a focused textarea starts one session with `baseText === textarea.value`; emitted finals update `textarea.value`; keyup calls `stop()`.

### Verify
- `curl -s http://127.0.0.1:47733/v1/health` → 200 on Andy's Mac; `curl -s http://127.0.0.1:47733/v1/dictionary/custom-words | jq .count` equals the seeded count.
- Human: in Chrome at https://argyleholocron.netlify.app, focus ARA composer / Scribe / Inbox reply, hold hotkey, say "Schedule HVAC vendor for unit 2B at Maple Court" → text appears with names cased correctly; `npm test` green.

---

## Immich — self-hosted photo/video vault for inspections, move-in/out and maintenance before/after

- **What**: AGPL-3.0 photo/video server (NestJS + Svelte + Flutter apps + Python ML). Albums, shared links, faces/CLIP search, OIDC (Google) login, OpenAPI REST (`X-API-Key`), TS SDK.
- **License**: AGPL-3.0-only → run unmodified; customize only via config/API/our widget. Do not fork.
- **Hosting**: single GCE VM (e2-standard-2, 100–500 GB pd-balanced) + docker compose from `docker/docker-compose.yml` (immich-server :2283, immich-machine-learning, valkey, `ghcr.io/immich-app/postgres:14-vectorchord…`). Caddy TLS at `photos.dwellium.com`. Not Cloud Run (local-disk DB + custom PG image).
- **Pattern**: backend proxy (`/api/photos/*`, `authenticate`) holding one service API key + iframe widget of the Immich UI; Google OIDC in Immich for Andy/Lisa.
- **Slot**: new widget `photo-vault` (Filing Cabinet); augments Home Upkeep AI and Strata maintenance.
- **Effort**: L, 2–3 weeks. **Phase 2.**

### Steps
1. **Infra**: create VM, install Docker, copy release `docker-compose.yml` + `.env` (`UPLOAD_LOCATION=/mnt/photos/library`, `DB_DATA_LOCATION=/mnt/photos/pg`, `DB_PASSWORD` alphanumeric, `IMMICH_VERSION=v3`), `docker compose up -d`. Caddy → `photos.dwellium.com`. Nightly `pg_dumpall` + disk snapshot.
2. **Immich admin**: create andy@dwellium.com admin; Admin → Settings → OAuth: issuer `https://accounts.google.com`, client id/secret (reuse Google OAuth project; add redirect `https://photos.dwellium.com/auth/login`), Auto Register on; Server → name "Dwellium Photo Vault". Create API key for a `dwellium-service` user → store as Cloud Run secret `IMMICH_API_KEY`; env `IMMICH_URL=https://photos.dwellium.com`.
3. **Backend proxy**: add `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/routes/photosRoutes.ts` (copy shape of `cloudBrowserRoutes.ts`: `router.use(authenticate)` at line 20). Endpoints: `GET /albums?propertyId`, `POST /albums {propertyId,unitId,workOrderId,kind}` → Immich `POST /albums`; `POST /albums/:id/assets` (multipart → Immich `POST /assets` then `PUT /albums/{id}/assets`); `POST /albums/:id/share {expiresAt,password}` → `POST /shared-links`; `GET /thumb/:assetId` stream. All calls set header `X-API-Key`. Mount in `src/app.ts` next to line 421: `app.use('/api/photos', createAuditMiddleware('/api/photos'), photosRoutes);`.
4. **Persist link**: in the Strata work-order / lease SQLite rows add nullable `photo_album_id`, `photo_share_url` (additive migration, no deletes).
5. **Widget**: `qualia-shell/src/components/PhotoVault/PhotoVault.tsx` — iframe `VITE_IMMICH_URL` (pattern: `src/components/Terminal/LangFlowPanel.tsx:150`), "Open in new window" fallback button. Register in `src/registry/widgetRegistry.ts` after `'cloud-browser'` (line 564): `'photo-vault': { id, label:'Photo Vault', icon:'image', component: lazyWithReload(() => import('../components/PhotoVault/PhotoVault')), category:'filing', minWidth:520, minHeight:420 }`. Add to `src/data/hierarchy.ts`: `{ id:'dock-photo-vault', label:'Photo Vault', icon:'image', component:'photo-vault', pinned:true, group:'Filing Cabinet' }`.
6. **Strata hook**: in `src/components/StrataDashboard/StrataDashboard.tsx` work-order detail, add `PhotoStrip` (thumbs via `/api/photos/thumb/:id`, Upload, "Share with resident" → step-3 share endpoint, copies URL to the resident message).
7. **Home Upkeep AI hook**: `src/components/HomeUpkeepAI/HomeUpkeepAI.tsx` ~line 533: add "Pick from Photo Vault" (lists recent assets via proxy, fetches original, sets `inspectPhoto` base64 → existing `analyze-photo` call at line 230).
8. **Netlify**: no new redirect needed (`/api/*` already proxied, `scripts/write-netlify-redirects.mjs:15`). Add `VITE_IMMICH_URL` to Netlify env; add `IMMICH_URL`/`IMMICH_API_KEY` to Cloud Run.
9. **ARA/Hermes**: register tools `photos.listRecent`, `photos.share` calling the same proxy (araRoutes.ts tool table).

**Test**: backend jest `photosRoutes.test.ts` — mock fetch; `POST /api/photos/albums` without session → 401; with session → forwards `X-API-Key` and returns `{albumId}`; `POST /albums/:id/share` passes `expiresAt`. Frontend vitest `widgetRegistry.test.ts`: `expect(widgetRegistry['photo-vault'].label).toBe('Photo Vault')`.
**Verify**: `curl -I https://photos.dwellium.com` → 200; `curl -H "Cookie: <session>" https://argyleholocron.netlify.app/api/photos/albums?propertyId=1` → JSON; human: open Photo Vault from sidebar, Google-login loads library; in Strata upload a photo to a work order, click Share, open link in incognito → album visible with password.

---

## Penpot — self-hosted Figma-class design studio for flyers, notices and a Dwellium design system

- **Repo / license:** https://github.com/penpot/penpot — **MPL-2.0** (LICENSE). File-level copyleft, no network clause: self-host, configure, integrate freely; only edited Penpot source files must be published if we serve modified builds (public fork). Our widget/proxy code stays private.
- **What it is:** Clojure/CLJS design + prototyping platform: boards, components/design tokens, prototypes, share links, SVG/CSS inspect, PNG/SVG/PDF export, plugins, RPC API (`/api/rpc/command/<name>`, `Authorization: Token <pat>`, catalogue at `/api/_doc`), webhooks, and (2.16) a `penpot-mcp` service.
- **Stack / hosting:** docker-compose.yaml = penpot-frontend (nginx) + penpot-backend (JVM) + penpot-exporter + penpot-mcp + postgres:15 + valkey:8.1 (+ mailcatch). Stateful + websockets → **one GCE VM (e2-standard-2) with docker compose behind Caddy**, not Cloud Run. Managed design.penpot.app = launcher-only (no iframe).
- **Embed evidence:** frontend nginx sends `X-Frame-Options SAMEORIGIN always` (docker/images/files/nginx-security-headers.conf) → iframe works only self-hosted with the header dropped at the proxy and `Content-Security-Policy: frame-ancestors 'self' https://argyleholocron.netlify.app`. No npm/web-component embed exists. Auth flags (help.penpot.app/technical-guide/configuration/): `enable-login-with-google` + `PENPOT_GOOGLE_CLIENT_ID/SECRET`, `disable-registration`, `PENPOT_REGISTRATION_DOMAIN_WHITELIST`, `enable-access-tokens`, `enable-webhooks`.
- **Andy fit:** listing flyers / For-Rent one-pagers; tenant notices (late rent, inspection, move-in/out) as reusable boards → PDF to Tenant Portal / Inbox Zero; Dwellium brand library (tokens, components) reused by Template Generator / Scribe; signage & QR posters; share-link prototypes for Lisa/owners.
- **Dwellium slot:** new widget `penpot-studio` ("Design Studio") in `qualia-shell/src/registry/widgetRegistry.ts` beside `template-generator` (L521-527, category `filing`); dock entry in `qualia-shell/src/data/hierarchy.ts` Filing Cabinet group (L59-66). Component copies the external-URL iframe pattern in `src/components/Terminal/PaperclipPanel.tsx:16-30,165-175` (URL + reachability check + "Open ↗"). Not CloudBrowser (Playwright screenshot stream, `CloudBrowser.tsx:35`).
- **Pattern:** self-host + iframe widget + backend proxy (`/api/penpot/*`, server-held token) + webhooks → Automation Hub. Alternative (Phase-1 lite): managed penpot.app + launcher + manual PNG/PDF upload.
- **Effort:** L, ~2–3 weeks (ops + cross-site cookie friction). Lite path S, ~2 days. **Phase 2.**

### Steps
1. **Infra (VM):** create GCE VM `penpot-vm` (e2-standard-2, Debian, docker). `curl -O https://raw.githubusercontent.com/penpot/penpot/main/docker/images/docker-compose.yaml`; `.env`: `PENPOT_VERSION=2.16`, `PENPOT_PUBLIC_URI=https://design.<domain>`, `PENPOT_FLAGS="disable-registration enable-login-with-google enable-access-tokens enable-webhooks enable-smtp disable-email-verification"`, `PENPOT_GOOGLE_CLIENT_ID/SECRET` (reuse Dwellium's Google client; add redirect `https://design.<domain>/api/auth/oauth/google/callback`), `PENPOT_REGISTRATION_DOMAIN_WHITELIST=dwellium.com`, `PENPOT_TELEMETRY_ENABLED=false`. Drop mailcatch; keep fs storage + nightly `pg_dump` → GCS.
2. **Proxy:** Caddy on the VM: `reverse_proxy penpot-frontend:9001 { header_down -X-Frame-Options }` + `header Content-Security-Policy "frame-ancestors 'self' https://argyleholocron.netlify.app"` (add custom domain later). Never rebuild Penpot images (keeps MPL obligations nil).
3. **Penpot setup:** Andy + Lisa sign in via Google; team "Dwellium"; shared library "Dwellium Brand" + starter boards (Listing Flyer, Late-Rent Notice, Inspection Notice, Move-in Checklist, Owner Report cover) with `{{property.name}}`-style text layers. Create a service access token → Secret Manager.
4. **Backend proxy:** new `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/routes/penpotRoutes.ts` (copy shape of `cloudBrowserRoutes.ts:1-24`: `router.use(authenticate)`), mount in `src/app.ts` after L421: `app.use('/api/penpot', createAuditMiddleware('/api/penpot'), penpotRoutes)`. Env: `PENPOT_BASE_URL`, `PENPOT_ACCESS_TOKEN`, `PENPOT_WEBHOOK_SECRET`. Routes: `GET /status` (proxies `get-profile`), `GET /files` (proxy `get-all-projects` / `get-project-files` — confirm names at `/api/_doc`), `POST /export` → exporter → save via existing File Manager object/asset service into `Properties/<name>/Marketing`; `POST /webhook` (no `authenticate`, verify shared secret) → Automation Hub event `design.updated`. Cloud Run: add the 3 env vars/secrets to service `dwellium-backend`.
5. **Widget:** `qualia-shell/src/components/PenpotStudio/PenpotStudio.tsx` — iframe `src=VITE_PENPOT_URL` with `allow="clipboard-read; clipboard-write"`, reachability via `authFetch('/api/penpot/status')`, "Open ↗" fallback, side panel "Export to File Manager" (file + board picker → `/api/penpot/export`). Register in `widgetRegistry.ts` (`'penpot-studio'`, icon `palette`, category `filing`, minWidth 900/minHeight 600, `lazyWithReload`) and `hierarchy.ts` Filing Cabinet (`dock-penpot`). No Netlify change: `/api/*` already proxied (`scripts/write-netlify-redirects.mjs:14`).
6. **ARA/Hermes hook (optional, same PR):** ARA tool `penpot.export_board` calling step-4 route; later `enable-mcp` and register `penpot-mcp` as a Hermes MCP source.

- **Test:** frontend vitest `src/test/PenpotStudio.test.tsx` — "renders iframe with VITE_PENPOT_URL when /api/penpot/status ok" (`expect(screen.getByTitle('Design Studio')).toHaveAttribute('src', expect.stringContaining(url))`) and "shows Open ↗ fallback when status fetch rejects"; backend jest `tests/penpotRoutes.test.ts` (supertest) — `GET /api/penpot/status` → 401 without bearer, 200 with mocked upstream; `POST /api/penpot/webhook` → 401 on bad secret, 202 on good.
- **Verify:** `curl -sI https://design.<domain>/ | grep -i 'x-frame-options\|content-security-policy'` (no XFO, CSP frame-ancestors present); `curl -H "Authorization: Token $PENPOT_ACCESS_TOKEN" https://design.<domain>/api/rpc/command/get-profile` → 200 JSON; open Dwellium → Filing Cabinet → Design Studio: Penpot dashboard renders inside the window in Chrome (and note Safari behaviour), export a board → file appears in File Manager under the property folder.

---

## Cal.DIY — MIT-licensed self-hosted scheduling (showings, maintenance windows, vendor visits) embedded in Dwellium

**What:** github.com/calcom/cal.diy = the original cal.com repo renamed (cal.com → 301 → cal.diy) with enterprise code removed; pure **MIT** (LICENSE: Cal.com, Inc.) — we may fork, rebrand, self-host privately. Keeps booking pages, availability, Google Calendar sync, embeds (`@calcom/embed-react` 1.5.3), REST API v2 (`/v2/slots`, `/v2/bookings`, `/v2/event-types`, `/v2/webhooks`), webhooks. Removed: Teams/Orgs/Insights/Workflows/SSO-SAML.
**Stack/hosting:** Next.js + Prisma/Postgres + NestJS api-v2 + Redis (stock `docker-compose.yml`: database, redis, calcom, calcom-api). Host on one GCE VM (e2-standard-2, docker compose, Caddy TLS at `cal.dwellium.com`). Cloud Run is viable only for web-only (needs Cloud SQL) — not recommended.
**Pattern:** native React widget (embed-react, inline) + backend proxy `/api/cal/*` holding the API key + webhook receiver → One Save. No SSO available; Andy signs into cal.diy once (Google sign-in).
**Phase:** 2 · **Effort:** M (~2–3 wks; ops of the 4-container stack is the cost driver; Dwellium code ~3–4 days).

### Steps — hosting (ops)
1. GCE VM + `git clone https://github.com/calcom/cal.diy`; `.env` from `.env.example`: `NEXT_PUBLIC_WEBAPP_URL=https://cal.dwellium.com`, `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`, `DATABASE_URL`, `GOOGLE_API_CREDENTIALS` (same GCP project as Dwellium OAuth), `ALLOWED_HOSTNAMES` incl. `argyleholocron.netlify.app`, `CSP_POLICY` frame-ancestors = Dwellium origins, `NEXT_PUBLIC_API_V2_URL=https://cal.dwellium.com/api/v2`. `docker compose up -d`. Verify api-v2 boots without `CALCOM_LICENSE_KEY` (README for v2 still mentions it — stale risk).
2. In cal.diy UI: connect Andy's Google Calendar; create event types `unit-showing`, `maintenance-visit`, `vendor-walkthrough`, `lease-signing`; create API key; create webhook → `https://argyleholocron.netlify.app/api/webhooks/cal` with secret.

### Steps — Dwellium backend (`/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager`)
3. Env: `CAL_API_URL`, `CAL_API_KEY`, `CAL_WEBHOOK_SECRET` (Cloud Run secrets; never in browser).
4. New `src/routes/calBookingRoutes.ts`: `GET /slots`, `POST /bookings`, `GET /bookings`, `GET /event-types` → forward to `${CAL_API_URL}/v2/...` with `Authorization: Bearer ${CAL_API_KEY}` + `cal-api-version` header. Mount in `src/app.ts` next to line 419 (`app.use('/api/calendar', …)`): `app.use('/api/cal', createAuditMiddleware('/api/cal'), authenticate, requireRole('management'), calBookingRoutes)` (`authenticate`/`requireRole` from `src/services/authMiddleware.ts:50,102`).
5. Webhook: add `router.post('/cal', …)` to `src/routes/webhookRoutes.ts` (mirror Trello receiver at line 52): verify `x-cal-signature-256` HMAC with `CAL_WEBHOOK_SECRET`, map `triggerEvent` BOOKING_CREATED/RESCHEDULED/CANCELLED → **UPSERT** One Save object `{calBookingUid, kind, start, end, attendee, propertyId/unitId parsed from eventType slug}`; on maintenance kind also create Task Board card via existing task service. Mounted already at `app.ts:376` (`/api/webhooks`, no auth — keep HMAC mandatory).
6. ARA tools: register `cal.findSlots` / `cal.book` in `src/routes/araRoutes.ts` tool list, calling the same proxy functions (Hermes reuses them for reminders).

### Steps — Dwellium frontend (`/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell`)
7. `npm i @calcom/embed-react` (one new dep, MIT).
8. New `src/components/Scheduler/Scheduler.tsx`: `<Cal calLink="andy/unit-showing" calOrigin={import.meta.env.VITE_CAL_ORIGIN} config={{theme:'dark', prefill}} />` + a "Bookings" list from `authFetch('/api/cal/bookings')`.
9. Register in `src/registry/widgetRegistry.ts` (copy `'cloud-browser'` entry, lines 564-572): id `scheduler`, label "Scheduling", icon `calendar-days`, minWidth 520/minHeight 600. Dock row in `src/data/hierarchy.ts` after line 18: `{ id:'dock-scheduler', label:'Scheduling', icon:'calendar-days', component:'scheduler', pinned:true, group:'Property Management' }`.
10. Strata Calendar (`src/components/StrataDashboard/modules/CalendarModule.tsx`): add a "Self-serve booking" card beside the Google Calendar card (lines 199-276) that opens the `scheduler` widget; replace the Outlook "Coming soon" row (line 355) copy with "Book via Scheduling".
11. Tenant Portal (`src/components/TenantPortal`): inline `<Cal calLink="andy/maintenance-visit" config={{name,email}} />` on the Maintenance request screen.
12. Env: `VITE_CAL_ORIGIN=https://cal.dwellium.com` in Netlify. No Netlify redirect needed (embed loads cross-origin from cal.dwellium.com; webhook/API go through existing `/api/*` proxy in `scripts/write-netlify-redirects.mjs`).

**Test:** backend jest `tests/calWebhook.test.ts` — POST `/api/webhooks/cal` with valid HMAC + BOOKING_CREATED body → 200 and `getObject(calBookingUid)` exists; invalid signature → 401; `tests/calBookingRoutes.test.ts` — `GET /api/cal/slots` without session → 401, with mocked fetch → passes through `/v2/slots`. Frontend vitest `src/test/scheduler.test.tsx` — registry has `scheduler` and renders `Cal` with `calOrigin` from env.
**Verify:** `curl -s https://cal.dwellium.com/api/v2/health` → 200; open Dwellium → Scheduling widget shows Andy's booking page inline; book a test slot → row appears in Strata Calendar list and Andy's Google Calendar within 10 s; cancel in cal.diy → One Save record flips to cancelled (`curl -H "Authorization: Bearer …" https://argyleholocron.netlify.app/api/cal/bookings`).

---

## listmonk — self-hosted mailing lists + transactional email for resident/owner/vendor broadcasts

- **What**: Go + Vue, single binary, PostgreSQL >= 12; REST API (BasicAuth `api_user:token`), `POST /api/tx` transactional sends with `template_id` + `data`. Docs: listmonk.app/docs/apis/apis/, /apis/transactional/, /installation/.
- **License**: AGPL-3.0-only. Integrate over the REST API only; do NOT fork/modify listmonk (network use of modified source forces publication). Templates/config/API = fine.
- **Hosting**: GCE e2-small, official docker-compose (listmonk/listmonk:latest + postgres:15), Caddy TLS, bind admin to private interface; alt: Cloud Run + Cloud SQL + S3-compatible media. Env: `LISTMONK_app__address`, `LISTMONK_db__host/port/user/password/database`, `LISTMONK_ADMIN_USER/PASSWORD`; init with `./listmonk --install --idempotent --yes`.
- **Andy fit**: per-property resident notices, monthly owner reports, vendor RFQ blasts, automated lease-renewal/late-rent/work-order transactional mail, opt-out + bounce compliance.
- **Slot**: new widget `broadcasts` (Property Management group) + backend proxy `/api/broadcasts`; augments Strata Dashboard residents and Template Generator; keeps `/api/gmail` for 1:1.
- **Pattern**: backend proxy (authenticate) -> listmonk API; native React widget; listmonk admin linked out for power features. Phase 2, effort M (~1.5-2 wks; infra + deliverability dominate).

### Steps (Dwellium side)
1. Infra: provision VM, `docker compose up -d` with official compose; create API user `dwellium` in listmonk Admin -> Users; configure SMTP (SES or Workspace relay) + SPF/DKIM for dwellium.com. Record `LISTMONK_URL`, `LISTMONK_API_USER`, `LISTMONK_API_TOKEN` as Cloud Run secrets for service `dwellium-backend` (never in the browser).
2. Backend route: add `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/routes/broadcastRoutes.ts` modeled on `src/routes/cloudBrowserRoutes.ts` (`router.use(authenticate)` at line 20). Endpoints: `GET /lists`, `POST /sync-residents` (reads entities via the same sqlite the `/api/dwellium/entities` handler uses in `src/routes/dwelliumRoutes.ts:96`, upserts to listmonk `/api/subscribers` with attribs {property_id, unit, role, lease_end}), `POST /campaigns` (create + optional start), `GET /campaigns/:id/stats`, `POST /tx` (forwards to listmonk `/api/tx`). Use global `fetch` with `Authorization: token ${user}:${token}`; allow-list paths, never forward arbitrary URLs.
3. Mount: in `src/app.ts` next to line 421 add `app.use('/api/broadcasts', createAuditMiddleware('/api/broadcasts'), broadcastRoutes);` — audit middleware gives Andy a who-sent-what log.
4. Widget: create `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell/src/components/Broadcasts/Broadcasts.tsx` (property selector -> audience -> template -> subject/body preview -> Send/Schedule; 'Sync residents' button; campaign stats table). Register in `src/registry/widgetRegistry.ts` after the `'cloud-browser'` entry (lines 564-572): `'broadcasts': { id:'broadcasts', label:'Broadcasts', icon:'megaphone', component: lazyWithReload(() => import('../components/Broadcasts/Broadcasts')), category:'tools', minWidth:720, minHeight:480 }`. Dock in `src/data/hierarchy.ts` near line 23: `{ id:'dock-broadcasts', label:'Broadcasts', icon:'megaphone', component:'broadcasts', pinned:true, group:'Property Management' }`.
5. Hooks: Template Generator (`widgetRegistry.ts:521`) gets an 'Open in Broadcasts' action that passes the rendered HTML; Automation Hub rules + Hermes tool `send_broadcast` and ARA intent call `POST /api/broadcasts/tx` with a required confirm flag; Strata residents module gets 'Sync to mailing list'.
6. Netlify: no new redirect needed — `/api/*` already proxies to Cloud Run (`scripts/write-netlify-redirects.mjs:15`). Only add a `/unsub/*` redirect if we later want branded unsubscribe pages.
7. Nightly job (Automation Hub/scheduler): pull bounces + unsubscribes from listmonk, mark resident contact records; on resident removal in Strata, blocklist the subscriber in listmonk.

### Test
- Backend (jest, pattern `tests/cloudBrowserRoutes.test.ts` mocking `authMiddleware`): `tests/broadcastRoutes.test.ts` — "POST /api/broadcasts/tx forwards template_id + data with token header and returns {data:true}" (mock fetch; assert upstream URL is `${LISTMONK_URL}/api/tx`, header `Authorization: token u:t`, 401 without auth).
- Frontend (vitest, `src/test/`): `broadcasts.test.tsx` — "renders property list and disables Send until template selected"; `widgetRegistry` contains key `broadcasts`.

### Verify
- `curl -u dwellium:$TOKEN $LISTMONK_URL/api/lists` returns 200 from the VM; `curl -H "Authorization: Bearer <session>" https://argyleholocron.netlify.app/api/broadcasts/lists` returns the same lists through the proxy.
- Human: open Broadcasts widget -> pick Oakridge -> Resident Notice template -> Send to self only -> email arrives with DKIM pass; listmonk admin shows the campaign with 1 sent; audit log row exists.

---

## Dub — branded short links, QR codes and click analytics for notices, unit signage and work orders

- **What**: open-core link platform (dubinc/dub). REST API `https://api.dub.co` (Bearer `dub_...`), `GET /qr?url=` (no auth, PNG), webhooks, npm SDK `dub`. Stack: Next.js/Prisma/PlanetScale/Upstash/Tinybird/Vercel.
- **License**: AGPL-3.0 except `apps/web/app/(ee)` + `.../[slug]/(ee)` (proprietary, ee/LICENSE.md). We call the API, never fork → no disclosure obligation. Self-host docs: "Docker is currently not supported" → use Dub cloud.
- **Slot**: new widget `short-links` ("Links & QR"), group Property Management; hooks into Scribe PublishDialog, Strata units/vendors, Automation Hub.
- **Pattern**: backend proxy with `authenticate`; single workspace key in Cloud Run secret; optional Dub webhook (HMAC-verified, no session auth).
- **Phase 2, effort M (~1.5–2 wks)**. Risk: confirm Dub plan limits (pricing page now Partners-centric; free Links tier unverified).

### Steps — backend (`/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager`)
1. `npm i dub`. Env: `DUB_API_KEY` (secret), `DUB_DOMAIN` (e.g. go.dwellium.com), `DUB_WEBHOOK_SECRET`, optional `DUB_API_BASE` (default https://api.dub.co).
2. New `src/services/dubService.ts`: `createEntityLink({kind, id, url, title})` → `dub.links.create({url, domain, externalId:`${kind}:${id}`, tags:[kind], comments:title})`; `getStats(linkId)` → `dub.analytics.retrieve`; `qrPng(url)` → fetch `${DUB_API_BASE}/qr?url=&size=600&fgColor=…` stream. Table `short_links(id, dub_id, short_link, kind, entity_id, url, clicks, created_by, archived)` via existing better-sqlite3 migrations.
3. New `src/routes/dubRoutes.ts` (copy shape of `cloudBrowserRoutes.ts`): `POST /` create, `GET /` list (filter kind/entity), `GET /:id/qr` (PNG proxy), `POST /:id/archive` (soft — never delete; door signs). Mount in `src/app.ts` next to line 421: `app.use('/api/links', createAuditMiddleware('/api/links'), authenticate, dubRoutes);`.
4. Webhook: add `router.post('/dub', …)` to `src/routes/webhookRoutes.ts` (already mounted unauthenticated at `src/app.ts:376`); verify HMAC with `DUB_WEBHOOK_SECRET` per Dub "verify webhook requests" doc; on `link.clicked` increment `short_links.clicks`, if kind==='workorder' mark WO vendor_opened.
5. Register ARA tools `links.create|links.stats|links.qr` where other ARA tools live (`src/routes/araRoutes.ts` tool registry) so Hermes/ARA can mint QR/links by voice.

### Steps — frontend (`/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell`)
6. `src/components/ShortLinks/ShortLinks.tsx`: table of links (kind, entity, short URL, clicks, Copy, QR, Archive) + "New link" form; calls `/api/links` with existing auth fetch helper.
7. Register in `src/registry/widgetRegistry.ts` after `'cloud-browser'` (~line 564): `'short-links': { id:'short-links', label:'Links & QR', icon:'qr-code', component: lazyWithReload(() => import('../components/ShortLinks/ShortLinks')), category:'tools', minWidth:520, minHeight:420 }`. Dock in `src/data/hierarchy.ts` after line 27: `{ id:'dock-short-links', label:'Links & QR', icon:'qr-code', component:'short-links', pinned:true, group:'Property Management' }`.
8. `src/components/Scribe/idocs/PublishDialog.tsx:68` — add "Short link + QR" button: POST `/api/links` `{kind:'doc', id:slug, url: publicUrlFor(slug)}`; show short URL + QR `<img src="/api/links/:id/qr">`.
9. Strata unit detail: "Print maintenance QR" → link to Tenant Portal maintenance form `?property=&unit=`; per-property print sheet (CSS @media print grid).
10. Netlify: no new redirect — `/api/*` already proxied by `scripts/write-netlify-redirects.mjs`; custom domain is DNS on Dub side only.

### Test
- Backend (jest, `tests/dubRoutes.test.ts`, mock `authMiddleware` like `tests/cloudBrowserRoutes.test.ts:5` and mock `dub` client): `POST /api/links {kind:'unit',id:'2B',url}` → 201 with `shortLink` matching `/^https:\/\/go\.dwellium\.com\//` and row in `short_links`; `GET /:id/qr` → 200 `content-type: image/png`; webhook with bad HMAC → 401, good → clicks+1.
- Frontend (vitest, `src/test/ShortLinks.test.tsx`): renders list from mocked `/api/links`, "Copy" writes short URL to clipboard; PublishDialog shows QR img after publish.

### Verify
- `cd dwellium-backend/ai-dashboard369-file-manager && npm test -- dubRoutes` green; `cd qualia-shell && npx vitest run ShortLinks` green.
- Human: in Dwellium open Links & QR → create link for a published /p/<slug> doc → open short URL on phone (redirects, Dub dashboard shows click) → print QR, scan with phone → lands on Tenant Portal maintenance form with unit prefilled → `curl -s -o /dev/null -w '%{http_code}' https://argyleholocron.netlify.app/api/links` returns 401 (proxy live, auth enforced).

---

## RustDesk — self-hosted remote control for office PCs, kiosks and resident tech support

- **What**: AGPL-3.0 remote desktop (Rust + Flutter clients; hbbs ID server + hbbr relay from rustdesk/rustdesk-server, also AGPL-3.0). OSS has no REST API, no OIDC, no npm SDK; API server/OIDC/branded clients are Pro-only.
- **Fit for Andy**: unattended control of the leasing-office PC/kiosk, resident "read me your ID" support sessions, built-in file transfer, "take control" escalation from Two Brains.
- **Hosting**: ONE GCE VM (e2-small, static IP) running `wget rustdesk.com/oss.yml -O compose.yml && docker compose up -d`; firewall TCP 21114-21119 + UDP 21116; persist `./data` (id_ed25519 keypair + sqlite). Cloud Run cannot host this (UDP + arbitrary TCP ports).
- **License rule**: run stock images/clients only → no source-publishing duty. Branded installer = buy Pro generator, do not fork the Flutter client.
- **Pattern**: Launcher widget + deep links. No in-browser session in phase 2 (web-client framing/licensing unverified → phase-3 spike).
- **Effort**: S, ~2-3 days; cost driver = VM ops + client installs, not code.

### Steps (Dwellium side)
1. **Infra**: create VM `rustdesk-relay` in `my-project-57391aion-ethos-api`, static IP, DNS `remote.<andy-domain>`; compose up; `cat data/id_ed25519.pub` → public key. Start hbbs with `-k _` so only key-holding clients connect.
2. **Backend env** (Cloud Run service `dwellium-backend`): `RUSTDESK_ID_SERVER=remote.<domain>:21116`, `RUSTDESK_RELAY_SERVER=remote.<domain>:21117`, `RUSTDESK_PUBLIC_KEY=<id_ed25519.pub>`. Public key is not a secret; env keeps one source of truth.
3. **Backend route**: new `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/routes/remoteSupportRoutes.ts` — `router.use(authenticate)` (pattern: settingsRoutes.ts:10-13), `GET /config` returns `{ idServer, relayServer, publicKey, downloadUrl }` from env. Mount in `src/app.ts` next to line 421: `app.use('/api/remote-support', createAuditMiddleware('/api/remote-support'), remoteSupportRoutes)`.
4. **Widget**: `qualia-shell/src/components/RemoteSupport/RemoteSupport.tsx` — fetches `/api/remote-support/config`; panels: (a) "Connect your machine" (copyable ID/relay/key + download link), (b) saved machines list `{label, rustdeskId, propertyId?}` in One Save (no passwords), (c) "Connect" → `window.location.href = buildRustdeskLink(id)` with a fallback "copy ID + open RustDesk" hint. `remoteDeskLink.ts` exports `buildRustdeskLink(id)` (strip spaces, rustdesk:// scheme — confirm exact path in rustdesk repo before merge).
5. **Registry**: add `'remote-support'` entry in `qualia-shell/src/registry/widgetRegistry.ts` after `'cloud-browser'` (line 564), `category: 'tools'`, `minWidth: 480, minHeight: 360`, `lazyWithReload(() => import('../components/RemoteSupport/RemoteSupport'))`.
6. **Dock**: add `{ id: 'dock-remote-support', label: 'Remote Support', icon: 'monitor', component: 'remote-support', pinned: false, group: 'Filing Cabinet' }` in `qualia-shell/src/data/hierarchy.ts` after line 69.
7. **Two Brains hook**: in `qualia-shell/src/components/TwoBrains/TwoBrains.tsx` near the screen-share controls (line ~272) add an "Escalate to full control" button that opens the `remote-support` widget (use the existing open-widget dispatcher the sidebar uses).
8. **Netlify**: no new redirect needed (`/api/*` already proxied by `scripts/write-netlify-redirects.mjs`). Skip `/remote/*` until the phase-3 iframe spike.
9. **Docs**: publish a Scribe Interactive Doc "Get remote help" at `/p/remote-help` (download link, where to read the ID, never share the permanent password by chat).

**Test**: vitest `src/components/RemoteSupport/remoteDeskLink.test.ts` — `expect(buildRustdeskLink('123 456 789')).toBe('rustdesk://connection/new/123456789')`; and `expect(widgetRegistry['remote-support']).toBeDefined()` in a registry smoke test. Backend: supertest `GET /api/remote-support/config` → 401 without session, 200 with `publicKey` matching env.

**Verify**: on the VM `docker compose ps` shows hbbs+hbbr Up; from laptop `nc -zv remote.<domain> 21116 21117`; install client on office PC, set ID/relay/key, set permanent password, confirm connect from Andy's laptop; in Dwellium open Remote Support → Connect → RustDesk launches pre-filled; a human checks the session renders and file transfer works. Log the result in docs/code.md.

**Skipped**: iframe web client (phase-3 spike: confirm framing headers + web-client v2 source status + reverse-proxy TLS for 21118/21119); Pro console/OIDC; ARA driving sessions (no OSS API).

---

## AppFlowy — Notion-style docs/databases/kanban workspace (self-hosted, iframe widget)

- **What**: Flutter+Rust desktop app; AppFlowy-Web (React 18/Vite) browser client; AppFlowy-Cloud backend (Rust, Postgres+pgvector, Redis, MinIO, GoTrue). README: "Distributed under the AGPLv3 License".
- **License**: AGPL-3.0-only (LICENSE, §13 network clause). Unmodified self-host + iframe = no source obligation; any fork we serve must be published. Open-core catch (AppFlowy-Cloud README): free self-host tier = **1 user seat + 3 guests**; more seats = commercial self-host license, or build from AGPL source ourselves.
- **Hosting**: GCE VM + docker compose (nginx, minio, postgres pg16/pgvector, redis, gotrue, appflowy_cloud, admin_frontend, ai, appflowy_worker, appflowy_search, appflowy_web — from docker-compose.yml). Not Cloud Run (stateful, WebSocket /ws/v2). FQDN e.g. flowy.dwellium.com + TLS.
- **Embed**: iframe of AppFlowy-Web / published pages (no React npm package — only Flutter packages). REST exists but undocumented (AppFlowy-Cloud src/api/*.rs). Google OAuth via GoTrue (deploy.env GOTRUE_EXTERNAL_GOOGLE_*).
- **Andy fit**: SOP/handbook wiki shared with Lisa; vendor directory + lease-renewal DB with calendar view (Strata Calendar is "Coming soon"); published tenant pages; turnover kanban.
- **Slot**: new widget `appflowy` in Filing Cabinet; complements Wiki/Scribe, candidate to replace Notepad later. Keep Task Board/Trello.
- **Pattern**: unmodified self-host + iframe widget (copy `LangFlowPanel.tsx` reachability/iframe/Open↗ pattern). Phase-2 optional `/api/appflowy/*` proxy behind `authenticate`.
- **Effort**: M (3–4 days phase 1; ops is the cost). **Phase 3.**

### Steps (phase 1)
1. Infra: GCE VM (e2-standard-2, 30 GB), clone AppFlowy-IO/AppFlowy-Cloud, copy `deploy.env` → `.env`: `FQDN=flowy.dwellium.com`, `SCHEME=https`, `WS_SCHEME=wss`, new `GOTRUE_JWT_SECRET`, `GOTRUE_ADMIN_EMAIL/PASSWORD`, `GOTRUE_EXTERNAL_GOOGLE_ENABLED=true` + the Dwellium Google client id/secret, `GOTRUE_DISABLE_SIGNUP=true` after Andy+Lisa sign in. `docker compose up -d`. TLS via Caddy/certbot in front of nginx.
2. Framing: in AppFlowy-Cloud `nginx/nginx.conf` add `add_header Content-Security-Policy "frame-ancestors 'self' https://argyleholocron.netlify.app https://*.dwellium.com";` (unmodified images; config-only, no AGPL trigger).
3. Widget: create `qualia-shell/src/components/AppFlowy/AppFlowy.tsx` — copy `src/components/Terminal/LangFlowPanel.tsx:21-29` (LS_URL/DEFAULT_URL state) and `:150-156` (iframe + `allow="clipboard-read; clipboard-write"`), default URL from `import.meta.env.VITE_APPFLOWY_URL`, reachability check + "Open ↗" fallback.
4. Registry: add to `src/registry/widgetRegistry.ts` after `'cloud-browser'` (line 564): `'appflowy': { id:'appflowy', label:'AppFlowy Workspace', icon:'book-open', component: lazyWithReload(() => import('../components/AppFlowy/AppFlowy')), category:'tools', minWidth:720, minHeight:520 }`.
5. Dock: add to `src/data/hierarchy.ts` after line 65: `{ id:'dock-appflowy', label:'AppFlowy', icon:'book-open', component:'appflowy', pinned:false, group:'Filing Cabinet' }`.
6. Env: Netlify env `VITE_APPFLOWY_URL=https://flowy.dwellium.com`. No Netlify redirect needed (cross-origin iframe, not proxied). No backend route in phase 1.
7. Content: seed workspace "AstraStrata" with Property SOP, Vendor Directory (grid+calendar), Lease Renewals (calendar), Turnover board; publish "House Rules" and paste URL into Tenant Portal links.

### Phase 2 (only if adopted)
- `dwellium-backend/.../src/routes/appflowyRoutes.ts` mounted in `src/app.ts` as `app.use('/api/appflowy', authenticate, appflowyRoutes)`; env `APPFLOWY_BASE_URL`, `APPFLOWY_SERVICE_EMAIL/PASSWORD` (GoTrue password grant at `/gotrue/token?grant_type=password`) → proxy `GET /api/workspace/:id/...` search/pages; Hermes job mirrors Scribe docs by slug; ARA tool `appflowy_search`.

### Test
- `src/test/AppFlowyWidget.test.tsx` (vitest): `expect(WIDGET_REGISTRY['appflowy'].label).toBe('AppFlowy Workspace')`; render `<AppFlowy/>` and assert `screen.getByTitle('AppFlowy')` iframe `src` startsWith `VITE_APPFLOWY_URL` (pattern: `src/test/apiKeysWidget.test.tsx:14`).

### Verify
- `curl -I https://flowy.dwellium.com` → 200 and CSP header contains `frame-ancestors ... argyleholocron.netlify.app`; `curl -s https://flowy.dwellium.com/gotrue/health`. Human: open Dwellium → Filing Cabinet → AppFlowy, sign in with Google (Andy), create a page, confirm it persists after reload; check Safari — if login loops, the "Open ↗" button must open the workspace in a new tab.

---

## Onboarding for the expanded surface (builds on Plan 046 F/S2/D)

> **Note on the tier table**: the designer proposed renaming the sidebar group *Filing Cabinet* → *Tools & Files*. Ilya's locked decision is **no renames** — treat that as gate **G11** below; default = keep *Filing Cabinet* and add the *Tools hub* window inside it.

# Onboarding design — builds on Plan 046 F (FirstRunCard) + S2 (descriptions / ? sheet / ⌘K pill)

**Principle (ponytail):** reuse `PINNED_WIDGETS`, `hiddenWidgetsStore`, `sidebarGroupsStore`, `withSyncStatic`, `logActivity`, `react-markdown`. New code = 1 store, 1 data file, 3 small components, 2 registry fields. No tour library.

### 0. Registry + data (anchors)
- `src/registry/widgetRegistry.ts:23-43` `WidgetRegistration`: add `tier?: 'core'|'daily'|'ai'|'tools'|'labs'` and `tip?: { does: string; tryThis: string; related: string[] }` next to Plan 046 S2's `description`. Fill for all 55 + new tools (one PR, text only). `labs` default for any entry with `restrictedToEmails` or in `FOLDED_AGENT_WIDGETS` (`src/lib/hiddenWidgetsStore.ts:56`).
- `src/data/hierarchy.ts:15-72`: rename group string `'Filing Cabinet'` → keep id, change display label to "Tools & Files" in `WIDGET_GROUPS` (`Sidebar.tsx:808-812`) only — don't migrate saved layouts.
- New `src/data/toolsHub.ts`: `TOOLS: {id, label, license, status:'ready'|'needs-setup'|'coming-soon', phase:1|2|3, blurb, widgetId?, setupDoc}[]` for Whiteboard, E-Sign, Scheduling, Broadcasts, Links&QR, Photo Vault, Design Studio, Remote Support, AppFlowy, FluidVoice. Status for iframe tools = `needs-setup` until `VITE_<TOOL>_URL` env is set (same env-gate as `LangFlowPanel.tsx:150`).

### 1. Per-user onboarding store
- New `src/lib/onboardingStore.ts` (copy `hiddenWidgetsStore.ts` shape, `withSyncStatic`, objectType `'onboarding'`, key `dwellium-onboarding`): `{ role: 'owner'|'staff'|null, seenTips: string[], unlockedTiers: string[], firstWin: {key:boolean,data:boolean,ara:boolean}, doneAt?: number }`. Helpers `markTipSeen(id)`, `unlockTier(t)`, `useOnboarding()`. Plan 046 F's default-stack flag moves in here as `firstWin` (single store, not two).

### 2. Role-based starter sets (first-run flow)
- Owner-operator = `role in ['management','corporate','god']` (`UserContext.tsx:85 ROLE_HIERARCHY`); Staff = `agent|maintenance|advisor`; Resident = `tenant` (never reaches AdminShell — Tenant Portal is its onboarding; add a 3-bullet banner in `TenantPortal.tsx` reading the same `tip` data for `tenant-portal`).
- `src/components/Shell/defaultStack.ts`: add `STARTER_SETS = { owner: PINNED_WIDGETS, staff: PINNED_WIDGETS.filter(p => ['strata-dashboard','task-board','inbox'].includes(p.component)) }` and `DEFAULT_STARTUP_STACK` becomes `getStartupStack(role)` (owner: ARA+Strata; staff: Strata+Task Board). `Desktop.tsx:673` passes role.
- First run (AdminShell, `ShellLayout` return at `AdminShell.tsx:165-173`): mount Plan 046 F `<FirstRunCard/>` **with a step 0 role chooser** ("I run the properties" / "I help manage them") only when `onboardingStore.role === null`; picking sets role → applies starter set → expands groups per tier table (`setExpandedGroups` via `sidebarGroupsStore`, `Sidebar.tsx:338`). Steps 1–3 unchanged (add AI key → bring data → ask ARA).

### 3. Progressive disclosure in sidebar
- `Sidebar.tsx:808-812 WIDGET_GROUPS`: render order Core(pinned rail, exists) → Property Management → AI Tools → Tools & Files. Default `expandedGroups` for a new owner = `{'Property Management'}`; staff = `{}`.
- `Sidebar.tsx:960-963` children render: show first 6 items of a group + a `Show N more` row (local `useState` per group, no persistence) when `items.length > 6`; when `tier==='labs'` items are filtered out entirely (`permittedItems` filter at `:796` adds `&& tierOf(item.component) !== 'labs'`).
- Unlocks: `unlockTier('ai')` fires from ARA on first assistant reply (`ARAConsole.tsx` send handler) → toast "AI Tools unlocked" + `setExpandedGroups(prev => prev ∪ {'AI Tools'})` once. `unlockTier('tools')` fires on first Tools hub open. Unlock only affects *expansion + toast*, never permissions (`can()` stays authoritative).

### 4. Per-widget first-open tip (once per user per widget)
- Mount in `Window.tsx:378-392` as a **sibling after** `.window__content` (zero-DOM contract: widget root must stay first child of `.window__content`, so the tip is a positioned card inside the window root, not inside content). `<WidgetTip widgetId={state.component}/>`: reads `WIDGET_REGISTRY[id].tip`; renders 3 bullets (what it does / try this / related → chips that call `openWindow`) + "Got it"; `markTipSeen(id)` on dismiss or after 20 s; returns null if seen or no tip. Suppress for the two auto-opened default-stack windows on the very first paint (FirstRunCard owns that moment) — check `onboardingStore.firstWin.ara`.
- Re-open: ⌘K row `help: <widget>` (see §6) and a "?" button in the window titlebar `Window.tsx` title row → `unmarkTipSeen` + show.

### 5. Tools hub window
- New widget `tools-hub` (`widgetRegistry.ts` next to `'control-panel'` :574, category `'tools'`, tier `'tools'`, icon `'layout-grid'`), dock row in `hierarchy.ts` after `dock-terminal`. Component `src/components/ToolsHub/ToolsHub.tsx`: table from `toolsHub.ts` — name · license badge (exact SPDX from repo reports, e.g. "AGPL-3.0, unmodified image") · status pill · one-line blurb · **Open** (`openWindow(widgetId)` if `ready`; `needs-setup` → opens Control Panel section / setup markdown in Guide; `coming-soon` → disabled + phase). ~120 lines, no new deps.

### 6. Help entry points
- Plan 046 S2 `?` sheet: add section "Guides" listing `docs/guides/*.md` titles + "Replay first-run" (resets `onboardingStore.role`).
- ⌘K (`CommandPalette.tsx:789-800` widget results): when query starts with `help:` or `?`, build `helpResults` from `WIDGET_REGISTRY` entries with `tip` → action = open widget + force tip; plus static rows "help: shortcuts" (opens ? sheet), "help: tools" (Tools hub), "help: guide". Subtitle = registry `description` (S2).
- Guide widget `guide` (registry, tier `'tools'`, category `'tools'`): `react-markdown` (already installed, `package.json:48`) over `src/content/guides/{getting-started,owner-operator,staff,tools}.md` imported with `?raw`; left list / right rendered; accepts `initialSlug` prop via `openWindow` detail. ~80 lines.

### 7. "Done onboarding" + metrics
- Done = `firstWin.key && firstWin.data && firstWin.ara && seenTips ⊇ starter-set ids` → `doneAt = Date.now()`; FirstRunCard auto-hides; ? sheet shows "Replay".
- Log with existing `logActivity(widgetId,label,action,details)` (`activityLogStore.ts:94`, One Save synced, visible in Time Travel): (1) `onboarding:first-win` with `{step, msSinceLogin}` per step — metric **time-to-first-win**; (2) `onboarding:tip-seen` `{widgetId, dismissed:'button'|'timeout'}` — metric **distinct widgets opened in first 7 days** (target ≥ 6 for owner); (3) `onboarding:unlock` `{tier}` and `tools-hub:open` `{toolId,status}` — metric **% users who open ≥1 Tools-hub tool within 14 days**. Also `onboarding:replay` to catch confusion. Query: Time Travel filter `widgetId==='onboarding'`.

### Executor steps (order = PR order)
1. Registry fields `tier`/`tip` + `toolsHub.ts` data (text only). 2. `onboardingStore.ts` + vitest `test/onboardingStore.test.ts` (markTipSeen idempotent, unlockTier set semantics, done predicate). 3. `defaultStack.ts` `STARTER_SETS`/`getStartupStack(role)` + extend `test/defaultStack.test.ts`. 4. Sidebar: labs filter, Show-more, default expansion by role. 5. `WidgetTip` in Window.tsx. 6. Tools hub + Guide widgets + dock rows. 7. FirstRunCard step 0 (role) + unlock hooks (ARA first reply, Tools hub open). 8. ⌘K `help:` rows + ? sheet Guides section. 9. Tenant Portal 3-bullet banner.

### Test
- `npm test` (vitest): onboardingStore, defaultStack starter sets per role, `widgetRegistry` walker asserts every non-labs entry has `description` + `tip` + `tier`, ToolsHub renders N rows and disables coming-soon, WidgetTip renders once then null after `markTipSeen`.
- `tsc -b && npm run build` chunk check: Guide/ToolsHub lazy via `lazyWithReload`.

### Verify (browser, fresh profile at https://argyleholocron.netlify.app, Andy + a staff test login)
- Fresh owner login → role card → ARA+Strata open, only "Property Management" expanded, Labs items absent from sidebar; first ARA reply → "AI Tools unlocked" toast + group expands once.
- Open Scribe → tip shows; close/reopen → no tip; ⌘K `help: scribe` → tip again. Reload on another device → `seenTips` persisted via One Save (check `/api` object type `onboarding`).
- Tools hub lists 10 tools with correct license/status; `needs-setup` Open routes to setup; Time Travel shows `onboarding:*` entries.
- Staff login → Strata+Task Board only, AI Tools group hidden; tenant login → Tenant Portal banner, no admin shell.

### Disclosure tiers

| Tier | Widgets + OSS tools in it | Shown to whom / when |
|---|---|---|
| **Core** (pinned rail, always visible, auto-opens ARA+Strata) | ARA Console, Strata Dashboard, Scribe, Inbox Zero, Task Board (= `PINNED_WIDGETS` in `src/components/Shell/defaultStack.ts`) — plus **Whiteboard (Excalidraw, MIT, S)** pinned inside Strata Design Studio not the rail | Every `management`+ user from first login; `tenant` role never sees the admin shell (Tenant Portal only); `agent`/`maintenance` staff see Strata, Task Board, Inbox Zero only (ARA/Scribe hidden until unlocked) |
| **Daily** (group "Property Management", expanded by default for owner-operator) | Tenant Portal (mgmt), Trello, Astra, Universal Shell, API Keys, File Manager/Files, Docs (Doc Viewer), PDF Gear, Notepad; **E-Sign (Documenso, AGPL unmodified image, phase 1)**, **Scheduling (cal.diy, MIT, phase 2)**, **Broadcasts (listmonk, AGPL via API, phase 2)**, **Links & QR (Dub hosted API, phase 2)** | Owner-operator (Andy/Lisa): expanded on first run. Staff: collapsed, revealed via "Show more". Tools land here only once their `status` in Tools hub = `ready` |
| **AI** (group "AI Tools", collapsed by default, unlocked on first ARA reply) | Agent Lab, Thought Weaver, NotebookLM, Transcribe, Meeting Notetaker, Fact Check, Upkeep AI, Automations, Mission Control, AI Spend, Artifacts, Connections & Memory, Knowledge Graph, Cognitive M Network, Harness, Honcho, Hermes, System Health; **FluidVoice (GPL-3 companion install, no widget — a setup card in Control Panel → Dictation)** | Owner-operator: group header visible but collapsed until the FirstRunCard step 3 ("ask ARA") completes → auto-expands once + toast. Staff: hidden until admin grants `widget:*` perms. Folded agents (Stella/Hydra/Two Brains/…) stay in "+ Add widget" gallery (existing `FOLDED_AGENT_WIDGETS`) |
| **Tools** (group "Filing Cabinet" renamed in UI to "Tools & Files"; houses the new **Tools hub** window) | Explorer, Tasks, Inbox, Tag File, File Explorer, Workspace, Cloud Browser, Time Travel, Holocron Library, Template Generator, Control Panel (gear); **Tools hub** window; **Photo Vault (Immich, AGPL unmodified, phase 2)**, **Design Studio (Penpot, MPL-2.0, phase 2 lite launcher)**, **Remote Support (RustDesk launcher, AGPL stock, phase 2)** | Owner-operator: collapsed; opened via Tools hub or ⌘K. Staff: only what `can('widget:x')` allows. Each OSS tool shows `status` (ready / needs-setup / coming-soon) and never opens a blank iframe |
| **Labs** (hidden from sidebar; reachable only via "+ Add widget" gallery and ⌘K "labs: …") | Terminal (already hidden), Georgia Code, Audit Log (Andy-only), Foundry, Synthesis, Hive, Builder Agents, Memory Graph RAG, Content Search, Autonomous Runs, Cognitive Harness deep modes; **AppFlowy Workspace (AGPL + 1-seat free tier, phase 3)**, **RustDesk in-window web client (phase 3 spike)**, **FluidVoice web push-to-talk port (phase 3)** | Andy (`god`) and anyone who explicitly un-hides them; never in a starter set; `labs` badge in ⌘K rows and Tools hub |

---

## Decision gates — for Ilya

1. G1 Domain: approve moving Dwellium to app.dwellium.com + *.dwellium.com subdomains (prerequisite for any in-iframe admin login; otherwise widgets stay Open-in-new-tab).
2. G2 Documenso hosting: Cloud Run + Cloud SQL + GCS (self-managed, ~$25-60/mo) vs Documenso Cloud Teams subscription; and accept self-signed p12 signing cert for leases (not qualified e-signature).
3. G3 Tools VM: approve creating GCE VM dwellium-tools-1 (size e2-standard-2 vs -4, disk size, static IP, open RustDesk ports) in project my-project-57391aion-ethos-api and its backup bucket path.
4. G4 Google OAuth: approve adding each tool's callback URI to the existing GOOGLE_OAUTH_CLIENT_ID client (one consent screen) vs separate clients per tool.
5. G5 Email sending: pick transactional provider (SES/Postmark/SendGrid) and approve DNS SPF/DKIM/DMARC for dwellium.com before listmonk/Documenso go live.
6. G6 Dub: confirm plan/limits and approve a paid Dub workspace, or defer Links & QR.
7. G7 AppFlowy: decide paid self-host plan vs AGPL self-build vs skip (default skip / phase 3).
8. G8 Penpot: launcher-only (managed penpot.app) now, self-host later — confirm, or skip entirely.
9. G9 Data retention: confirm resident PII may be mirrored into listmonk/Documenso/Immich and that deletions are soft flags synced both ways (no hard deletes).
10. G10 Per-phase 'go' before each git push / Cloud Run deploy / VM create / DNS change.
11. G11 Onboarding: keep sidebar group name *Filing Cabinet* (default, no renames) vs allow *Tools & Files*.
12. G12 Onboarding starter sets: confirm the three roles (Owner-operator / Staff / Resident) and that staff see Strata + Task Board + Inbox Zero only until unlocked.


## Sequencing & dispatch

- **Wave 0 (prereq)**: Plan 046 S2 (descriptions) + S1 (AI-ready) + F (first-run card) merged — the onboarding tiers and Tools hub reuse their stores/components.
- **Wave 1 (parallel, 3 agents)**: Excalidraw widget (`feat/047-whiteboard`), Documenso e-sign (`feat/047-esign` frontend + backend proxy), FluidVoice companion card + vocabulary seed (`feat/047-dictation`). No VM needed.
- **Wave 2 (after G1/G3/G4/G5)**: Tools VM + Caddy + OAuth (Ilya runs gcloud; agent writes compose files under `~/dwellium-backend/tools/`), then cal.diy, listmonk, Dub, Immich, RustDesk launcher, Penpot launcher in parallel worktrees; backend `toolsSync` + `/api/<tool>/*` proxies on `feat/047-tools-bridge`.
- **Wave 3 (onboarding)**: tiers + Tools hub + per-widget first-open tips + role starter sets on `ux/047-onboarding` (after 046 F/S2).
- **Wave 4**: AppFlowy only if G7 says yes.
- Per branch: gate green + `Verify` lines pasted; no push without Ilya's go.

## STOP conditions

- Never fork-and-modify an AGPL tool; if a customization needs a code change inside the tool, stop and raise it (publish-source obligation).
- Never mirror resident PII into a tool before G9 is answered; all bridges upsert-only with soft-delete flags.
- No VM, DNS, OAuth-client, or Cloud Run changes without the specific `gcloud` command pasted to Ilya and his go (G10).
- If an iframe login fails under third-party-cookie restrictions, ship the "Open ↗ in new tab" fallback — never a blank iframe.
- Do not retire Notepad / Task Board / Wiki in favour of AppFlowy (phase 3, Andy's call after trial).
