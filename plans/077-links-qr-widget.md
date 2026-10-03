# 077 — Links & QR widget: audit + improvement plan

Status: PHASES 1–4 IMPLEMENTED 2026-10-02/03, committed locally, NOT pushed — frontend `feat/077-links-qr-p1`,
backend `feat/077-links-backend-p1` (see §7–10). The audit (2026-10-01) was read-only.
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

Phase 1 status: done, see §7. Pulled forward from 3.5 because the live render showed it: the
table layout at the 520 px minimum width (short link unreadable, QR and edit form off-screen).

### Phase 2 — make the door sheet do its job

| Step | Change | Fixes |
|---|---|---|
| 2.1 | Destinations per Q1: remove the hardcoded `?request=…` URLs and the default door pattern. Add per-property destination fields (portal, maintenance, pay, notice) stored with the existing widget memory, empty by default. A preset button or door-sheet Generate is disabled with "Set a destination for this property first" until its field holds a valid URL. Ilya enters the external URLs later; no code change needed then. | D1, D15 |
| 2.2 | Built-in `POST /api/links/bulk`: loop the existing create in one transaction; same slug + same URL returns the existing row (idempotent re-mint); chunk at 100 on the client. | D4, D14 |
| 2.3 | Door sheet: Generate mints first, then each cell's QR encodes the **short link**; print the short URL as text under each code; snapshot the pattern at Generate. | D2, D14 |
| 2.4 | Short-link domain per Q2: one `/l/*` line in `write-netlify-redirects.mjs`; `PUBLIC_BASE_URL` = app origin; backend refuses to mint when `PUBLIC_BASE_URL` is empty. Once two hosts serve `/l/*` (app domain + `run.app`), the self-link check must know both — it compares against `PUBLIC_BASE_URL` only (review B-2). | D5 |
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

| 3.6 | Carried over from the Phase 1 and Phase 2 reviews (see §7/§8 for the Phase 2 items F6, F10, F11, F12): slugs are case-sensitive while the `/l/` route is not (`/l/PAY` 404s when the slug is `pay`) — look slugs up case-insensitively and refuse case-only duplicates; a failed background refresh replaces the list with the error card (nothing is lost, Retry restores it) — keep the list and show a notice instead; re-clicking a preset whose link is archived answers "key is taken" with no visible row — say it is archived and offer to unarchive (2.2's idempotent mint covers the door sheet). | review B-4, F-6, F-7 |

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

## 7. Phase 1 — what was done (2026-10-02)

Swarm: ruflo `swarm-1790952808617-qhjacy` registered `links077-backend-coder`,
`links077-frontend-coder` and `links077-adversarial-reviewer`; the work ran as Claude Code
subagents — two coders in parallel on disjoint files (one per repo), then one refute-first reviewer
over both commits. The orchestrator read every diff, added fixes of its own, mutation-checked the
bug-pinning tests and ran the gates.

| Step | Done | Where |
|---|---|---|
| 1.1 | Widget reads `mode`; built-in hides domain, tags, tag filter, expiry, key edit, Tags column, Open in Dub and Mint; no tags/domains/sparkline requests; UTM appended to the destination as text; presets send no tags | ShortLinks.tsx, shortLinksApi.ts |
| 1.2 | 503 is needs-setup only with `needsSetup:true`; a 200 that is not a JSON envelope is an error | shortLinksApi.ts |
| 1.3 | Expiry shown in local time; PATCH carries only fields changed since the edit opened | ShortLinks.tsx (`isoToLocalInput`, `editPatch`, `editBase`) |
| 1.4 | Refresh keeps list, composer and open edit; latest-wins guard; handlers `reload()` instead of calling a stale `refresh`; presets do not wipe the composer | ShortLinks.tsx |
| 1.5 | Deferred to 3.1 (see table above) | — |
| 1.6 | One destination validator for create + PATCH, stores the parsed URL; non-string inputs ignored; 500 instead of a hung request; single-statement PATCH | linkRoutes.ts |
| 1.7 | Built-in DELETE archives; slug stays reserved | linkRoutes.ts |
| 1.8 | Stale copy removed (widget, registry, API client, tools/dub/README.md) | — |
| extra | Table layout at 520 px: fixed columns, QR + edit form in their own full-width row | ShortLinks.css, ShortLinks.tsx |

Review: 0 high, 3 medium, several low — all reproduced by the reviewer with probes. Fixed in this
phase: B-1 (validator stored the raw string), B-2 (self-link by origin; the two-host case is in 2.4),
B-3 (non-atomic PATCH), F-1 (untouched edit reverted another writer's change), F-2 (stale
"Show archived" after a create), F-3 (HTML 200 read as Dub mode), F-5 (UTM re-serialised the query),
plus the test gaps it found (second guard untested → one guard; a UTC-only pass; unwrapped GET).
Deferred with a home: B-4, F-6, F-7 → 3.6.

Evidence: `plans/077-assets/probe.cjs` renders the real widget standalone (StrictMode, no shell, no
login) against an in-memory fake of the built-in backend on `http://harness.invalid` — it cannot
reach a real server. `results.json` and the PNGs beside it are generated by that script;
`before-520-edit.png` is the same harness pointed at `main`.

Not done / not verified in Phase 1: nothing is pushed or deployed; the widget has not been seen
inside the logged-in shell or against the real backend (creating links there would write real
data); Dub mode was exercised by unit tests only; presets still point at the app's own origin
(D1 — Phase 2.1).

## 8. Phase 2 — what was done (2026-10-02)

Swarm: ruflo `swarm-1790980313449-6hfqrn` registered `links077-p2-backend`, `links077-p2-qr`,
`links077-p2-infra`, `links077-p2-integrator` and a reviewer; the work ran as Claude Code subagents —
three coders in parallel on disjoint files (backend bulk/env; QR encoder merge; presets/API
client/CSS/Netlify), then one integrator for the widget, then a refute-first reviewer. The
orchestrator read every diff, built the print/scan check, and fixed what it found.

| Step | Done | Where |
|---|---|---|
| 2.1 | Per-property destinations entered in a Destinations section (widget memory); presets disabled with a hint until set; the hardcoded `?request=…` URLs and `APP_BASE` are gone | ShortLinks.tsx, andyLinkPresets.ts |
| 2.2 | Built-in `POST /bulk`: validate all, one transaction, UPSERT by key (re-aims + un-archives, keeps clicks); client chunks at 100 | linkRoutes.ts, shortLinksApi.ts |
| 2.3 | Door sheet: Generate snapshots, mints, renders codes that encode the SHORT link with the short URL printed under them; fallback to the destination with a notice when minting fails; `{unit}` optional | QrDoorSheet.tsx |
| 2.4 | Netlify `/l/*` proxy line; `PUBLIC_BASE_URL` = app origin and `SHORT_LINK_HOSTS` = Cloud Run host in the deploy script; create/bulk answer 503 without a base; self-link check knows both hosts | write-netlify-redirects.mjs, cloud-run.sh, linkRoutes.ts |
| 2.5 | One encoder: `Scheduling/qr.ts` deleted, `qrDataUri` added to the Scribe encoder; decode-verified with CIDetector up to the 213-byte v10 ceiling | Scribe/idocs/blocks/qr.ts |
| 2.6 | Download SVG next to the row QR | ShortLinks.tsx |
| 2.7 | Printing from a standalone document in a hidden iframe (the in-page print hack printed one clipped page); `@page` margins; 30-unit sheet → 4-page Letter PDF, all 30 codes decoded from the print render (smallest ≈ 34 mm) | QrDoorSheet.tsx, plans/077-assets/print-check.cjs |

Review (refute-first, after the integration commit): 0 high. Fixed in this phase — F1 two unit labels
collapsing to one key printed a sticker whose destination did not match its code (the sheet now
refuses such a roster naming both units; the backend refuses a batch with a repeated key); F2 a
non-string destination value in widget memory blanked the whole widget (reads as unset); F4 a
sheet opened before its destination was entered never picked it up (the pattern follows the
destination until typed over); F5 door keys shared the preset namespace (a unit labelled "rent"
would have overwritten the rent preset — door keys are now `<property>-unit-<unit>`); F7
`SHORT_LINK_HOSTS` entries with a scheme or port silently disabled the loop guard (normalised);
F8 a per-unit (`{unit}`) destination was posted verbatim by the preset (preset disabled with a
door-sheet hint); F9 every keystroke re-encoded every code (memoised); plus tests for the three
guards the reviewer showed were unprotected (stale mint, Print wiring, keyless-slug retry).
Deferred with a home — 3.6: F6 (a long label or refused URL fails the whole batch with an index,
and a chunk failing after an earlier chunk committed reports "unavailable"), F10 (`LIMIT 200`
can hide presets behind a large door sheet — paginate), F11 (list/PATCH return relative short
links with no base; only writes refuse), F12 (real-browser print path, Safari/Firefox).

Not done / not verified: nothing pushed or deployed; the Netlify `/l/*` proxy and the new env
values take effect only on the next deploy (verify with `curl -sI https://<app>/l/<slug>` → 302 +
Location); no phone-camera scan of a paper print (CIDetector on the print render stands in);
the widget has not been exercised in the logged-in shell. Destinations are per-user widget memory
(Ilya is the only operator) — move them to the backend if a second operator ever needs them.

## 9. Phase 3 — what was done (2026-10-03)

Swarm: ruflo `swarm-1790993985486-tza97c` registered `links077-p3-backend`, `links077-p3-client`,
`links077-p3-integrator` and `links077-p3-reviewer`; the work ran as Claude Code subagents — two
coders in parallel (backend; API client + CSS) with the integrator started alongside them on a
fixed contract, then a refute-first reviewer. The orchestrator read every diff, ran the live
probes and fixed what they showed.

| Step | Done | Where |
|---|---|---|
| 3.1 | `short_links` + `expires_at`, `tags` (JSON names), `created_by`, `updated_at` — `ALTER TABLE ADD COLUMN` only, idempotent; expired links 404; `GET /tags` = names in use, `POST /tags` echoes; the widget shows expiry, tags, tag filter and edit controls when the backend lists the feature | linkRoutes.ts, ShortLinks.tsx |
| 3.2 | `short_link_clicks(slug, ts, kind)` — head / bot / human by method and user agent, no IP or UA stored; only human GETs count; zero-filled per-UTC-day timeseries and windowed counts; the sparkline draws in built-in mode | linkRoutes.ts, ShortLinks.tsx |
| 3.3 | `GET /l/:slug` rate limited per client (120/min, burst 30/10 s; env-overridable), keyed on Netlify's `x-nf-client-connection-ip` behind the `/l/*` proxy, else `req.ip` — `req.ip` alone would have put every resident behind the proxy in one bucket | app.ts |
| 3.4 | Client-side search over short link, destination, title and tags, combined with the tag filter | ShortLinks.tsx |
| 3.5 | Always-mounted `role="status"` notice; Archive → focus on Confirm → back to the row or the search box; edit form focuses its URL input and is a `group`; 12 px minimum text; global `:focus-visible` ring confirmed to reach the controls | ShortLinks.tsx, ShortLinks.css |
| 3.6 | Case-insensitive slug lookups with 409 on case-only duplicates (an index backs the lookup); a failed background refresh keeps the list and says so; a preset refused as taken hints at Show archived; list cap 1000 | linkRoutes.ts, ShortLinks.tsx |
| contract | The list advertises `features: ['expiry','tags','timeseries']`; the widget gates on it, so either side can deploy first (old-backend.cjs proves an older backend still hides those controls) | shortLinksApi.ts |

Review (refute-first, after the integration commit): 0 critical, 6 warnings, all reproduced. Fixed:
W1 a forged `x-nf-client-connection-ip` on a direct call to the run.app host could burn another
client's bucket (key is now `ip|header`, truncated; limits 300/min, 60/10 s in case Netlify does
not forward the header — verify after deploy); W2 a door-sheet re-mint could never clear an old
expiry and the list never showed one (re-mint now defines the expiry; rows show "expires …" /
"expired"); W3 a tag filter whose tag vanished stranded an empty list (filter is derived from the
current tags); W4 a tag added with "Add tag" lost its checkbox on refresh while still being sent
(picker = backend tags ∪ picked; picked cleared after create); W5 the sparkline "cap" was a batch
size (now a real cap of 8); W6 untested focus clear (tests added). Also: strict ISO-with-zone
expiry parsing with a calendar check, `bot\b` so a CUBOT phone is a human, a four-column table
(tags and expiry sit under the short link — five columns did not fit 520 px).
Deferred with a home — 3.6/Phase 4: I3 interval anchoring to UTC days (24h = 2 points), I5 an
archive that succeeds followed by a failed refresh reads as "could not refresh", I6 `GET /tags`
includes tags used only by archived links and `LIMIT 1000` truncates silently.

Not in 3.1: `entity_type` / `entity_id` columns — nothing sends them yet (Phase 4). Dub mode untouched.

## 10. Phase 4 — what was done (2026-10-03)

Swarm: ruflo `swarm-1790997066209-b8bwrq` registered `links077-p4-data`, `links077-p4-strata`,
`links077-p4-scribe`, `links077-p4-integrator` (and a reviewer); the work ran as Claude Code
subagents — three coders and the integrator in parallel on disjoint files against a fixed contract,
then a refute-first reviewer. Frontend only; the backend did not change.

| Item | Done | Where |
|---|---|---|
| Rosters from Strata | `useLinkProperties()` returns Strata properties (tags from the name, de-duplicated) with units loaded lazily for the selected one, naturally sorted; the Andy list is the fallback when Strata has none. Presets, Destinations and the door sheet use it; destinations are keyed by the Strata property id | linkProperties.ts, ShortLinks.tsx, QrDoorSheet.tsx |
| "Print maintenance QR" on a Strata unit, "QR door sheet" on a property | One breadcrumb button in PropertiesModule → `openDoorSheet({propertyId, propertyName, units?})` (pending slot + live event + `openWidget('short-links')`); the widget opens its sheet on that property with that roster, or a transient entry when the property is unknown to it | doorSheetLink.ts, PropertiesModule.tsx |
| "Short link + QR" in Scribe's PublishDialog | After publishing: Make short link → bulk upsert by key `doc-<slug>` (hash-suffixed when it would exceed 64 chars, so two long slugs can never share a link) → short URL, Copy, 120 px QR, Download SVG | PublishDialog.tsx |

Review (refute-first, after the integration commit): 0 critical, 3 warnings, all reproduced. Fixed: W1 a
duplicate property name got a `-2` tag that collided with a real "… 2" property and moved with list
order, so one property's door codes could re-aim another's (tags now get an id-derived suffix and are
order-independent); W2 Generate during the initial list load minted nothing and blamed an unreachable
backend (Generate waits with "Loading…"; a needs-setup backend is named as such); W3 an empty roster
disabled Generate silently (hint shown; a request with `units: []` means the whole roster). Low: a
comma in a unit label split it in two (one per line now); a blank name / blank unit number from Strata
produced a dead button (filtered / disabled); presets showed the fallback list while Strata was still
loading ("Loading properties…"); archived/inactive properties are left out; the four untested guards
the reviewer found now have tests. Noted, not changed: destinations typed under a fallback id do not
migrate to the Strata id once Strata answers (they were only ever typed in dev); a short link made from
a localhost origin targets localhost (make them on the app domain).

Not done: PropertiesModule has no render test (its own test file states a full render is too costly);
the two buttons are verified by the module's typecheck and by the deep-link module's tests only.
No browser run inside the logged-in shell.

