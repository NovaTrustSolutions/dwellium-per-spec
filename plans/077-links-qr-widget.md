# 077 — Links & QR widget: audit + improvement plan

Status: PLAN ONLY 2026-10-01. Audit was read-only; nothing is implemented, committed or pushed.
Base: frontend `main` @ `fe281de`; backend `main` (links code identical on the checked-out
`chore/token-encryption-key-secret` branch — `git diff main` touches only `deploy/cloud-run.sh`).
Swarm: ruflo `swarm-1790844744784-onqku3` (hierarchical). ruflo only *registered* the agents
(`links-frontend-analyst`, `links-backend-analyst`, `links-market-researcher`); the work ran as
three Claude Code subagents. Orchestrator re-read the code behind D1–D9, D11, D13 and re-ran
`npx vitest run src/test/shortLinksWidget.test.tsx` (18/18 pass). Backend jest (22/22) was run by
the backend analyst against a temp SQLite file, not re-run by the orchestrator.

## 1. What the widget is today

Frontend: `qualia-shell/src/components/ShortLinks/` — `ShortLinks.tsx` (594), `QrDoorSheet.tsx` (149),
`shortLinksApi.ts` (165), `andyLinkPresets.ts` (75), `ShortLinks.css` (217); test
`src/test/shortLinksWidget.test.tsx` (363). Registry `widgetRegistry.ts:909-921` (id `short-links`,
tools, 520×420 min); Tools hub `data/toolsHub.ts:40`; pinned dock `data/hierarchy.ts:36`.
Backend: `src/routes/linkRoutes.ts` (457), mounted `app.ts:503`; public redirect `app.ts:505-509`.

The backend has **two modes in one file**: a Dub proxy when `DUB_API_KEY` is set, and a built-in
SQLite shortener when it is not (`linkRoutes.ts:177-181`, comment: "no paid tier, live on open").
The frontend never reads the `mode` field the backend returns. Which mode production runs in is
UNVERIFIED (not checked — would need the deployed env).

| Capability | Dub mode | Built-in mode | Evidence |
|---|---|---|---|
| List links (short URL, destination, tags, clicks) | works, 100 max | works, 200 max, no paging | ShortLinks.tsx:468-589; linkRoutes.ts:256-263 |
| Create (URL + custom key) | works | works; duplicate → 409 | ShortLinks.tsx:177-187; linkRoutes.ts:214-225 |
| Domain, expiry, tags, UTM on create | works | **silently dropped, UI says "Created"** | linkRoutes.ts:214-225 |
| Inline edit (URL, key, expiry, tags) | partial (D2, D3) | only URL saved; rest ignored, UI says "Updated" | ShortLinks.tsx:214-232; linkRoutes.ts:400-411 |
| Archive / unarchive (confirm-gated) | works | works | ShortLinks.tsx:504-533 |
| Delete | no UI (by design) | no UI; backend route is a hard DELETE | linkRoutes.ts:444 |
| Copy short URL | works; failure not reported | same | ShortLinks.tsx:254-257 |
| Row QR (120 px) | Dub-hosted image | client-side, ECC L | ShortLinks.tsx:534-537; Scheduling/qr.ts |
| QR download / PNG / SVG export | none | none | no `download` in ShortLinks/ |
| Click count | works | works (raw counter, no bot filter) | linkRoutes.ts:211 |
| 30-day sparkline | works | never draws (backend returns `[]`) | linkRoutes.ts:380 |
| Tags: create, filter | works | list is `[]`, create → 501 | linkRoutes.ts:314,330 |
| Presets (4 × 2 properties) | creates link | creates link, tags dropped | andyLinkPresets.ts:58-63 |
| Door sheet: roster → QR grid → print | works | works | QrDoorSheet.tsx:43-146 |
| "Mint short links" for door sheet | works (≤100) | **always fails, 501** | linkRoutes.ts:280; ShortLinks.tsx:262 |
| Public redirect `/l/:slug` | n/a (Dub's domain) | 302, unauthenticated, no rate limit | app.ts:505-509 |
| Search, sort, paging, total clicks | none | none | — |

## 2. Findings (verified against code unless marked)

| id | sev | finding | evidence |
|---|---|---|---|
| D1 | **high** | Preset and door-sheet destinations go nowhere. They point at `<app origin>/?request=maintenance`, `/?pay=rent`, `/?notice=current`; nothing in `src/` or `app/` reads those params, and there is no tenant-facing route. A resident scanning a door QR lands on the staff login. | andyLinkPresets.ts:58-65; grep for readers: none |
| D2 | **high** | Printed door QRs encode the long destination URL, not a short link. Minting is decoupled from what prints, so signs are untrackable and cannot be re-aimed without reprinting. | QrDoorSheet.tsx:130-131 vs :65-69 |
| D3 | **high** | Built-in mode silently drops expiry, tags, UTM and domain on create, and key/tags/expiry on edit, while the UI reports success. A user who sets an expiry gets a link that never expires. | linkRoutes.ts:214-225, 400-411 |
| D4 | med-high | "Mint short links" is offered in built-in mode and always fails with 501 (gate is `state.kind==='ok'`, not Dub). | ShortLinks.tsx:262; linkRoutes.ts:280 |
| D5 | med-high | Built-in short links are `https://<service>.run.app/l/<slug>` (deploy sets `PUBLIC_BASE_URL` to the Cloud Run URL). The Netlify redirects script proxies `/health`, `/api/*`, `/p/*` only, so `/l/*` on the app's own domain would serve the SPA shell. If `PUBLIC_BASE_URL` is unset the short link is a relative path and the QR is unscannable. Actual prod value UNVERIFIED. | cloud-run.sh:393; write-netlify-redirects.mjs:14-24; linkRoutes.ts:192-194 |
| D6 | med | Editing a link with an expiry shifts it by the user's UTC offset on every save (`slice(0,16)` of a UTC ISO string shown as local, then `toISOString()`), even when the field is untouched. | ShortLinks.tsx:218, 231 |
| D7 | med | Hard DELETE in built-in mode frees the slug for re-use: a printed QR could later resolve to a different link. File header says "rows are never deleted", true only for the Dub mirror. No UI calls it. | linkRoutes.ts:444 |
| D8 | med | `/l/:slug` is unauthenticated, outside the `/api` rate limiters, and does a DB write per hit (HEAD and link-preview bots included). Counts inflate; door keys are guessable (`<property>-<unit>`). | app.ts:505-509; linkRoutes.ts:208-213 |
| D9 | med | Any HTTP 503 renders the "not configured" card. Built-in mode never returns 503, so today that card only appears for a cold-start/overload 503 and tells the user the wrong thing. | shortLinksApi.ts:95 |
| D10 | med | Built-in handlers are `async` with no try/catch on Express 4: a non-string `title` throws in the SQLite bind and the request hangs. (Bind failure reproduced by the analyst; full HTTP hang not exercised.) | linkRoutes.ts:214-229, 398-411 |
| D11 | med | `refresh()` clears `editingId`, so creating a link, clicking a preset or toggling "Show archived" discards an unsaved inline edit. A preset click also wipes the composer draft. | ShortLinks.tsx:122, 165-169 |
| D12 | med | Clearing the last tag in edit does not persist (backend drops an empty array) but UI says "Updated". | ShortLinks.tsx:230; linkRoutes.ts:165-168 |
| D13 | med | Two QR encoders. `Scheduling/qr.ts` (ECC L, fixed mask, ≤134 bytes) draws the row QR; `Scribe/idocs/blocks/qr.ts` (ECC M default, 8-mask scoring, ≤213 bytes) draws the door sheet. Scribe's is a strict superset. Over-capacity row QR renders a broken image. | ShortLinks.tsx:31; QrDoorSheet.tsx:14 |
| D14 | med | Door sheet is not frozen: cells and mint read the live `pattern`, so editing it after Generate changes the QR under already-reviewed cells. Roster > 100 fails (no chunking); re-mint collides on deterministic keys. | QrDoorSheet.tsx:65-69, 130 |
| D15 | med | Properties and unit rosters are hardcoded for Andy (2 properties, 1 and 4 units); label says "seeded from Strata data" but nothing reads Strata. Destination origin is `window.location.origin`, so a link made on localhost points at localhost. | andyLinkPresets.ts:24-44; QrDoorSheet.tsx:93 |
| D16 | low-med | No ownership column: any management-or-higher user can edit or archive every link. Fine for one team; note it. | linkRoutes.ts:182-189 |
| D17 | low-med | Accessibility: status notices have no live region; focus is lost when Archive swaps to Confirm; no `:focus-visible` styles; 9–10 px text; no responsive rules below the 520 px min; `aria-label` on a role-less div. | ShortLinks.tsx:437, 514-524, 539; ShortLinks.css |
| D18 | low | Stale copy: needs-setup card ("activates with the next backend deploy"), registry description ("Dub hosted API, free plan", `VITE_DUB_URL`), hardcoded "dub.co/pricing currently lists no free plan" (asserted by tests). | ShortLinks.tsx:296-311; widgetRegistry.ts:907-912 |
| D19 | low | Sparkline cache never invalidates and caches failures; no request-ordering guard on refresh; copy reports success without awaiting the clipboard. | ShortLinks.tsx:119-158, 254-257 |
| D20 | low | URL validation is a prefix regex: `https://` alone passes on the backend; no length cap (only the 1 MB body limit); self-referencing `/l/<own slug>` loop accepted. `javascript:`/`data:` are correctly rejected. | linkRoutes.ts:216, 405 |

Not verified by anyone: print layout in a real browser (the `visibility:hidden` + absolute sheet
inside an `overflow:auto` window may clip multi-page grids), phone-camera scanning of a printed
sheet, and production env values. The analyst did decode both encoders' output with macOS
`CIDetector` (all payload sizes passed) — clean raster only.

Plan-047 items never built: entity-aware links (backend accepts `entityType`/`entityId`, widget
never sends them), Scribe PublishDialog "Short link + QR", Strata unit "Print maintenance QR",
`GET /api/links/:id/qr`, Dub click webhook, ARA `links.*` tools.

## 3. What mature products do (sources checked 2026-10-01)

Ranked for one small property-management team, not a marketing team:

1. Per-unit links with a printable sheet — fixqueue.app, maintenants.app
2. Editable destination behind a stable code ("dynamic QR"), so signs are never reprinted — qr-code-generator.com
3. Print-correct export (SVG/PDF, quiet zone, size) — uniqode.com sizing guide
4. Bulk create from a roster/CSV — uniqode.com (2,000), dub.co CSV import
5. Expiry — Dub, Bitly, Short.io, Kutt, Shlink
6. Bot filtering on counts — Shlink `excludeBots` (api-spec.shlink.io)
7. Tags/folders by property — Dub, Short.io
8. Scan analytics by time and device — Bitly QR
9. Destination allowlist / leaving-site interstitial — OWASP Unvalidated Redirects cheat sheet
10. Password links, API/webhooks, geo/device targeting — skipped below as YAGNI

QR print rules: quiet zone ≥ 4 modules (ISO/IEC 18004, cited via qrcodekit.com — the standard
itself is paywalled and was not read); error correction L/M/Q/H ≈ 7/15/25/30 % and M for general
use, Q/H for dirty environments (Denso Wave, qrcode.com); size ≈ scan distance ÷ 10 and ≥ 2 cm
(vendor rule of thumb, uniqode.com); print the URL as text under the code so tampering stickers
are noticeable (FBI IC3 PSA220118).

## 4. Decisions (Ilya, 2026-10-02)

| # | Question | Decision |
|---|---|---|
| Q1 | Where should a resident land when they scan a door QR? | **External pages; Ilya sets the URLs up later.** Until a property has a destination, its presets and door sheet stay disabled — no more links to the staff login. A Dwellium-hosted intake form is out of scope. |
| Q2 | What domain should short links use? | **Agreed:** `/l/*` proxy line in the Netlify redirects script, `PUBLIC_BASE_URL` = the app's domain. Links already minted on `run.app` keep working (the backend route stays). |
| Q3 | Is built-in the long-term mode (no Dub)? | **Yes — no paid tier.** Built-in becomes first-class; the Dub proxy code is left dormant and untouched (removing it is a separate cleanup). |
| Q4 | Built-in `DELETE /api/links/:id`: | **Yes:** it archives instead of hard-deleting. |

## 5. Plan

Rule for every phase: additive only. No DELETE/DROP/TRUNCATE; schema changes are
`ALTER TABLE … ADD COLUMN` guarded by a column-exists check; nothing is pushed or deployed
without an explicit say-so.

### Phase 1 — make the UI tell the truth (frontend-only + small backend hardening)

| Step | Change | Fixes |
|---|---|---|
| 1.1 | `shortLinksApi.ts`: surface `mode` from the list response. In built-in mode hide domain picker, tag controls, expiry and "Mint" until Phase 3 lands them. UTM: append the params to the destination URL client-side (works in both modes, no backend change). | D3, D4 |
| 1.2 | `shortLinksApi.ts:95`: a 503 means needs-setup only when the body carries `needsSetup: true` (what an old backend sent); any other 503 is a normal error with Retry. The card stays for that old-backend case, with its stale claims removed. | D9, D18 |
| 1.3 | Expiry edit: convert with local-time formatting on load, and only send `expiresAt` when the field changed. | D6 |
| 1.4 | `refresh()` keeps `editingId` when the row still exists; preset create does not reset the composer. | D11 |
| 1.5 | DEFERRED to 3.1. D12 is reachable only in Dub mode, which is dormant (Q3), and whether Dub clears tags on an empty array is unverified. Built-in tags get clear semantics when they land in 3.1. Phase 1 instead sends only changed fields on edit (1.3). | D12 |
| 1.6 | Backend: wrap built-in handlers in try/catch; `String()` the title; validate with `new URL()`, cap URL at 2048 chars, reject a destination whose host+path is this service's own `/l/`. | D10, D20 |
| 1.7 | Backend: built-in DELETE sets `archived = 1` (Q4 decided). | D7 |
| 1.8 | Fix registry/tools-hub copy; drop the dated Dub-pricing sentence and its test assertion. | D18 |

Check: extend `shortLinksWidget.test.tsx` with a built-in-shaped fixture (`mode:'builtin'`,
`qrCode:''`) and an expiry round-trip test under a non-UTC `TZ`; add a jest case for a
non-string title and for DELETE-archives.

### Phase 2 — make the door sheet do its job

| Step | Change | Fixes |
|---|---|---|
| 2.1 | Destinations per Q1: remove the hardcoded `?request=…` URLs and the default door pattern. Add per-property destination fields (portal, maintenance, pay, notice) stored with the existing widget memory, empty by default. A preset button or door-sheet Generate is disabled with "Set a destination for this property first" until its field holds a valid URL. Ilya enters the external URLs later; no code change needed then. | D1, D15 |
| 2.2 | Built-in `POST /api/links/bulk`: loop the existing create in one transaction; same slug + same URL returns the existing row (idempotent re-mint); chunk at 100 on the client. | D4, D14 |
| 2.3 | Door sheet: Generate mints first, then each cell's QR encodes the **short link**; print the short URL as text under each code; snapshot the pattern at Generate. | D2, D14 |
| 2.4 | Short-link domain per Q2: one `/l/*` line in `write-netlify-redirects.mjs`; `PUBLIC_BASE_URL` = app origin; backend refuses to mint when `PUBLIC_BASE_URL` is empty. | D5 |
| 2.5 | One encoder: use `Scribe/idocs/blocks/qr.ts` everywhere, delete `Scheduling/qr.ts`, add a `qrDataUri` wrapper beside `qrSvg`. | D13 |
| 2.6 | Row actions: "Download SVG" (an `<a download>` on the data URI). Skip PNG. | export gap |
| 2.7 | Print CSS: `@page` margins and a real print-preview check on a 30-unit roster; scan a printed sheet with two phones. | unverified print |

Check for 2.4 (Netlify answers 200 for anything): assert `curl -sI https://<app>/l/<slug>` returns
a `302` with the right `Location`, not a `200 text/html`.

### Phase 3 — built-in mode gets the features the UI already shows

| Step | Change | Fixes |
|---|---|---|
| 3.1 | `short_links` additive columns: `expires_at`, `tags` (JSON text), `updated_at`, `created_by`, `entity_type`, `entity_id`. Redirect returns 404 after expiry. Re-enable the controls hidden in 1.1. | D3, D16 |
| 3.2 | Click log table `short_link_clicks(slug, ts, kind)`; count only GET with a non-bot user agent; serve the 30-day timeseries from it so the sparkline draws. No IP stored. | D8, sparkline |
| 3.3 | Rate-limit `/l/:slug` with the existing limiter middleware. | D8 |
| 3.4 | Client-side search box over the loaded list. | search gap |
| 3.5 | Accessibility pass: `role="status"` on the notice, focus kept on Archive→Confirm, `:focus-visible`, 12 px minimum text, wrap the action cell. | D17 |

### Phase 4 — integrations plan 047 promised (only if still wanted)

Read properties and units from Strata instead of the hardcoded list; "Print maintenance QR" on a
Strata unit; "Short link + QR" in Scribe's PublishDialog.

### Deliberately skipped

Password links, geo/device targeting, webhooks, link-in-bio, destination malware scanning, a
leaving-site interstitial, pagination. Add the interstitial/allowlist if non-management roles ever
get to create links; add pagination when the list passes 200.

## 6. Swarm execution (when approved)

One worktree off `origin/main` per repo; split by file ownership; agents never run git writes.

| Wave | Agent | Owns |
|---|---|---|
| 1 (parallel) | backend | `linkRoutes.ts`, `tests/linkRoutes.test.ts`, `tests/builtinLinks.test.ts`, `app.ts:505-509` |
| 1 | api-client | `shortLinksApi.ts` |
| 1 | qr | `Scribe/idocs/blocks/qr.ts`, delete `Scheduling/qr.ts`, fix its import in `Scheduling.tsx` |
| 1 | infra-css | `write-netlify-redirects.mjs`, `ShortLinks.css` |
| 2 (single) | integrator | `ShortLinks.tsx`, `QrDoorSheet.tsx`, `andyLinkPresets.ts`, `shortLinksWidget.test.tsx`, registry copy |
| 3 | adversarial reviewer | try to break: expiry under `TZ=America/Los_Angeles`, re-mint twice, 101-unit roster, 503 mid-edit, archived slug re-create, HEAD on `/l/`, empty `PUBLIC_BASE_URL` |

Contracts the waves share:

```ts
// shortLinksApi.ts
export type LinksMode = 'dub' | 'builtin';
export function listShortLinks(showArchived?: boolean): Promise<ShortLinksResult<{ links: ShortLink[]; mode: LinksMode }>>;

// Scribe/idocs/blocks/qr.ts
export function qrDataUri(text: string, opts?: { ecc?: 'L' | 'M' }): string | null;

// linkRoutes.ts — built-in bulk, same envelope as Dub mode
// POST /api/links/bulk { links: {url, key?, title?, tagNames?}[] } → { success, mode:'builtin', data: LinkRow[] }
```

Orchestrator reads every wave's diff and commits between waves; nothing is pushed.
