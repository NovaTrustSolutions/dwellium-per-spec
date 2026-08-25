# Dub — branded short links + QR for Dwellium "Links & QR" (plan 047/053)

Dwellium talks to the **hosted Dub API** (`https://api.dub.co`, Bearer token) through
the backend proxy at `/api/links` (`src/routes/linkRoutes.ts` in the backend repo).
The browser never sees the key. Dub is AGPL-3.0 but self-hosting is explicitly not
Docker-supported upstream (GitHub/Tinybird/Upstash/PlanetScale/Vercel stack), so the
hosted API is the plan-047 decision of record.

Built against the published Dub OpenAPI, fetched 2026-08-23 (HTTP 200):
**`https://dub.co/openapi.json`** — "Dub API" v0.0.1, OpenAPI 3.0.3, 41 paths. It is
the same document Dub's docs reference (`dubinc/docs` → `docs.json` →
`https://spec.speakeasy.com/dub/dub/dub-with-code-samples`). `https://spec.dub.co`
is a dead Vercel deployment (404) as of that date. Snapshot + drift guard:
`tests/fixtures/dub-openapi-paths.json` + `tests/linkRoutes.test.ts` in the backend.

## ⚠️ Pricing — no visible free plan

As fetched 2026-08-23, https://dub.co/pricing lists **Business $90/mo, Advanced
$300/mo, Enterprise** with 14-day trials and **no free plan**. Earlier Dwellium
copy assumed "~25 links/mo free" — treat that as stale. **Check current pricing in
the Dub signup flow before creating the workspace**; if a paid plan is not wanted,
the widget's QR door sheet still works fully offline (client-side QR encoding), and
a self-hosted Shlink/YOURLS behind the same `/api/links` contract is the fallback.

## Account setup (human steps)

1. Create a Dub account + workspace at https://app.dub.co (check pricing first, above).
2. Workspace → Settings → **API Keys** → create a key (`dub_…`). It is workspace-scoped.
3. (Optional) Workspace → **Domains** → add `go.dwellium.com` (or similar) and point
   the DNS CNAME Dub shows you. Without it, links mint on the shared `dub.sh` domain.
4. (Optional) Note the workspace **slug** from the app URL (`app.dub.co/<slug>`) and
   id (`ws_…`) from workspace settings.

## Environment variables

Backend (Cloud Run — `deploy/cloud-run.sh` upserts the secret):

| Var | Required | What |
|---|---|---|
| `DUB_API_KEY` | yes | Workspace API key (secret `dwellium-dub-api-key`). Unset → every `/api/links` route answers 503 `needsSetup:true`. |
| `DUB_WORKSPACE` | optional | Workspace id (`ws_…`); appended as `workspaceId=` on every call. |
| `DUB_DOMAIN` | optional | Default short-link domain (e.g. `go.dwellium.com`) applied to creates when the widget doesn't pick one. |
| `DUB_API_BASE` | optional | Override `https://api.dub.co` (tests use it). |

Frontend (Netlify):

| Var | Required | What |
|---|---|---|
| `VITE_DUB_URL` | optional | Flips the Tools-hub pill to Ready (status only). Set to `https://app.dub.co`. |
| `VITE_DUB_WORKSPACE` | optional | Workspace slug — the widget's "Open in Dub ↗" deep-links to `https://app.dub.co/<slug>`. |

## What the widget covers (plan 053)

Create (custom key, domain picker, tags, UTM builder, expiry) · list with click
counts + clicks sparkline (Dub `/analytics` timeseries) · inline edit (PATCH) ·
confirm-gated archive (soft — never delete) · tag filter · copy + QR · bulk create
(`POST /links/bulk`, used by the door sheet's "Mint short links") · Andy presets
(Resident portal / Maintenance request / Rent payment / Current notice, per-property
tags — edit `qualia-shell/src/components/ShortLinks/andyLinkPresets.ts`) · printable
per-unit **QR door sheet** (client-side QR, works with zero Dub setup).

Created links are mirrored UPSERT-only into the backend `external_links` SQLite
table; rows are never deleted (repo data rule).
