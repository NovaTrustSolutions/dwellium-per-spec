# Gap analysis — Excalidraw (Whiteboard) and Documenso (E-Sign) in Dwellium, plan 047

Date: 2026-08-23. Read-only audit. Every Dwellium claim cites a file (+line); every upstream claim cites a URL fetched today via WebFetch. Tests quoted were executed today (frontend `npx vitest run …` → 4 files / 29 tests passed; backend `npx jest tests/esignRoutes.test.ts` → 13 passed).

Path shorthand:
- `FE/` = `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell/src/`
- `BE/` = `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/`
- `PLAN` = `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/plans/047-oss-tools-integration-and-onboarding.md`

Legend: ✅ available through the integration · 🟡 partial · ❌ not available · ➖ intentionally out of scope

---

# 1. Excalidraw — `@excalidraw/excalidraw` embedded as the `whiteboard` widget

## 1.1 Upstream capabilities (source: README https://github.com/excalidraw/excalidraw ; props docs https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props)

License MIT; npm package `@excalidraw/excalidraw` (README). README splits features into the **library/editor** set and the **excalidraw.com app** set:

| # | Feature (README wording) | Source |
|---|---|---|
| E1 | "Infinite, canvas-based whiteboard" + "Zoom and panning support" | README |
| E2 | "Hand-drawn like style" | README |
| E3 | "Wide range of tools - rectangle, circle, diamond, arrow, line, free-draw, eraser..." + "Arrow-binding & labeled arrows" | README |
| E4 | "Undo / Redo" | README |
| E5 | "Dark mode" (component prop `theme`, defaults "light") | README; props docs |
| E6 | "Image support" | README |
| E7 | "Shape libraries support" (props `onLibraryChange`, `libraryReturnUrl`) | README; props docs |
| E8 | "Localization (i18n) support" (prop `langCode`, defaults "en") | README; props docs |
| E9 | "Export to PNG, SVG & clipboard" | README |
| E10 | "Open format - export drawings as an `.excalidraw` json file" | README |
| E11 | "Customizable" — embed API: `initialData`, `onChange`, `UIOptions`, `renderTopRightUI`, `viewModeEnabled`, `zenModeEnabled`, `gridModeEnabled`, `excalidrawAPI`, `renderEmbeddable`, etc. | README; props docs |
| E12 | App: "Local-first support (autosaves to the browser)" | README (excalidraw.com section) |
| E13 | App: "PWA support (works offline)" | README (excalidraw.com section) |
| E14 | App: "Real-time collaboration" (component prop `isCollaborating`; needs a collab server) | README; props docs |
| E15 | App: "End-to-end encryption" + "Shareable links (export to a readonly link…)" | README (excalidraw.com section) |

## 1.2 What Dwellium has

**Integration model:** embedded library — the npm package runs in-app as a native React widget (no external service). `FE/components/Whiteboard/Whiteboard.tsx:1-9` (header comment), `:11-12` (imports `Excalidraw` + CSS), `:64-69` (`<Excalidraw theme initialData onChange UIOptions>`). Dependency pinned `"@excalidraw/excalidraw": "0.18.1"` (`qualia-shell/package.json:27`).

**Files and what they do**
- `FE/components/Whiteboard/Whiteboard.tsx` — widget. Self-hosted fonts via `window.EXCALIDRAW_ASSET_PATH = '/excalidraw-fonts/'` (`:37-39`; dir exists at `qualia-shell/public/excalidraw-fonts/fonts/{Assistant,Cascadia,ComicShanns,Excalifont,Liberation,Lilita,Nunito,Virgil}`); Dwellium theme → Excalidraw `theme` ('latte'/'corporate' = light, else dark) (`:41-42, 65`); `initialData` from per-user store captured at mount (`:49-50, 66`); `onChange` → `saveSceneDebounced(sanitizeScene(...))` (`:52-57`); `UIOptions={{ canvasActions: { loadScene: false } }}` (`:68`); pending save cancelled on unmount (`:60`).
- `FE/lib/whiteboardStore.ts` — persistence. Per-user localStorage key `whiteboard:<userId>` / `whiteboard:_anonymous` (`:31-34`); One Save write-through to the backend object store via `withSync(..., { objectType: 'whiteboard' })` (`:53-60`); 1.5 s trailing-edge debounce (`:26, 96-99`); `sanitizeScene` keeps only `elements`, `appState.{viewBackgroundColor,gridSize}`, `files`, drops `files` > 2 MB (`:28-29, 67-85`). NOTE: the plan specified persistence through the Scribe file store (`PLAN:155`); what shipped is localStorage + One Save object store — a single scene per user, no board picker.
- `FE/registry/widgetRegistry.ts:665-676` — `'whiteboard'` entry (label "Whiteboard", icon `pen-tool`, category `tools`, minWidth 720 / minHeight 480, lazy).
- `FE/data/hierarchy.ts:22-23` — dock `dock-whiteboard`, group "Property Management", pinned.
- `FE/data/toolsHub.ts:34` — Tools hub row `{ id:'whiteboard', license:'MIT (Excalidraw, embedded)', phase:1, widgetId:'whiteboard' }` — **no `envVar`**, so `resolveToolStatus` (`:51-60`) returns `ready` as soon as the widget is registered.
- `FE/content/guides/gettingStarted.ts:51,57` — guide text ("full Excalidraw canvas… save per-account automatically"; listed under Ready).

**Env gates:** none. **Backend:** no whiteboard-specific code (`grep -rn whiteboard BE/src` → no hits; persistence rides the generic One Save object store).

**Tests (all passing today)**
- `FE/test/whiteboardStore.test.ts` — per-user key + `_anonymous` fallback (`:40-46`); garbage/missing JSON → `EMPTY_SCENE` (`:47-55`); `sanitizeScene` keeps elements/viewBackgroundColor/gridSize, strips `collaborators`, JSON round-trip safe (`:59-73`); drops files > 2 MB (`:74-78`); exactly one trailing-edge persist with the LAST scene at 1500 ms (`:84-98`); `cancelPendingSave` drops a queued write (`:99-109`).
- `FE/test/whiteboardWidget.test.tsx` (Excalidraw mocked) — registry entry well-formed (`:56-65`); dock entry under Property Management (`:66-69`); Tools hub resolves `ready` off the live registry with no env (`:70-73`); mounts dark by default, asset path `/excalidraw-fonts/`, `loadScene:false` (`:77-83`); light themes → `theme="light"` (`:84-88`); hydrates `initialData` from the saved scene (`:89-94`); one debounced write after onChange (`:95-107`); unmount cancels a pending save (`:108-114`).
- `FE/test/toolsHub.test.tsx:53-55,88` — whiteboard is in the "ready today" set.

**UI entry points:** widget id `whiteboard`; sidebar dock "Property Management → Whiteboard"; Tools hub row "Whiteboard" (Ready → Open). No Strata hook shipped (plan step 6 "Open in Whiteboard" / "Mark up photo" / "Attach PNG" — `grep -rn -i whiteboard FE/components/StrataDashboard` → no hits); no Scribe ```` ```excalidraw ```` fence (plan step 8 — `grep -rn -i excalidraw FE/components/Scribe` → no hits).

**Status on production (https://argyleholocron.netlify.app):** Tools hub shows Whiteboard = **Ready**; no env needed.

## 1.3 Gap table

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| E1 Infinite canvas, zoom/pan | ✅ | Embedded component, `Whiteboard.tsx:64-69` | — |
| E2 Hand-drawn style | ✅ | Embedded component | — |
| E3 Tools + arrow binding/labels | ✅ | Embedded component | — |
| E4 Undo/Redo | ✅ | Embedded component (in-session history) | Same as upstream: history not persisted across reloads |
| E5 Dark mode | ✅ | `theme` mapped from Dwellium theme store, `Whiteboard.tsx:41-42,65`; tested `whiteboardWidget.test.tsx:77-88` | — |
| E6 Image support | 🟡 | Paste/insert works in-canvas; `files` persisted by `whiteboardStore.sanitizeScene` | `files` > 2 MB serialized are dropped on save (`whiteboardStore.ts:28-29,74`) — images silently vanish on reload if over the cap |
| E7 Shape libraries | 🟡 | Library panel is part of the embedded UI | No `onLibraryChange` / `initialData.libraryItems` wiring (`grep` on `Whiteboard.tsx` → only `theme/initialData/onChange/UIOptions`), so saved library items are not persisted; `libraryReturnUrl` unset (install-from-libraries.excalidraw.com round-trip unverified inside the windowed shell) |
| E8 Localization | 🟡 | Component default `langCode="en"` | `langCode` not wired to any Dwellium locale setting — English only |
| E9 Export PNG/SVG/clipboard | ✅ | Built-in export dialog (only `loadScene` is disabled in `UIOptions`, `Whiteboard.tsx:68`) | — |
| E10 Open `.excalidraw` JSON format | 🟡 | Export via built-in menu; the persisted shape is the same `{type:'excalidraw',version:2,…}` (`whiteboardStore.ts:14-21`) | **Import** disabled on purpose (`loadScene:false`) — no way to open an existing `.excalidraw` file in-app |
| E11 Customizable embed API | ✅ | Uses `theme`, `initialData`, `onChange`, `UIOptions` | `renderTopRightUI` "Save / Attach PNG" from `PLAN:153` not built; `viewModeEnabled`/`excalidrawAPI` unused |
| E12 Local-first autosave | ✅ (native) | Dwellium's own `whiteboardStore`: localStorage cache + One Save write-through, 1.5 s debounce (`whiteboardStore.ts:53-60,96-99`) | Single scene per user — no multi-board picker (`PLAN:156` optional) |
| E13 PWA / offline | 🟡 | Scene survives offline via localStorage cache | Dwellium ships `public/manifest.json` but no service worker found (`grep serviceWorker|vite-plugin-pwa` → none); app shell not installable/offline |
| E14 Real-time collaboration | ❌ | — | Needs `excalidraw-room` websocket server + `isCollaborating`; explicitly deferred to phase 3 (`PLAN:166`) |
| E15 E2E encryption + shareable read-only links | ➖ | — | excalidraw.com share-backend features; Dwellium persists behind its authenticated backend instead; no share-link product need stated in the plan |

## 1.4 Parity numbers (Excalidraw)

15 upstream rows. Tally: ✅ 8 (E1,E2,E3,E4,E5,E9,E11,E12) · 🟡 5 (E6,E7,E8,E10,E13) · ❌ 1 (E14) · ➖ 1 (E15).

- (a) **Feature coverage once configured** (nothing to configure — Whiteboard is Ready today):
  - strict (✅ only): 8 / 15 = **53%**; excluding the ➖ row: 8 / 14 = 57%
  - inclusive (✅ + 🟡): 13 / 15 = **87%**; excluding ➖: 13 / 14 = 93%
- (b) **Native in Dwellium** — the embed counts as native (library runs in-app, no external service), so native = same as (a): **53% strict / 87% inclusive**. The only non-native-able rows are E14 (server) and E15 (share backend).

## 1.5 What it would take to close each ❌ / 🟡

- E6 images > 2 MB — move `files` out of the scene blob into the existing file store and keep references; or raise the cap when One Save is on. **M**
- E7 library persistence — add `onLibraryChange` → a `whiteboardLibrary:<uid>` store + pass `initialData.libraryItems`. **S**
- E8 i18n — pass `langCode` from Dwellium's locale (if/when one exists). **S**
- E10 import — flip `loadScene:true` (or add an "Import .excalidraw" button via `renderTopRightUI`) once the store supports more than one scene. **S**
- E13 PWA — add a service worker / `vite-plugin-pwa`; app-wide decision, not whiteboard-specific. **M**
- E14 collaboration — deploy `excalidraw-room` (Cloud Run) + Netlify websocket proxy + `isCollaborating` (`PLAN:166`). **L**
- Plan deltas not in the upstream list: Strata bridges "Open in Whiteboard / Mark up photo / Attach PNG" (`PLAN:164`) **M**; Scribe fence + PNG export (`PLAN:165`) **M**; multi-board picker (`PLAN:156`) **M**.

## 1.6 Verification

```
# files + key lines
sed -n 37,39p "FE/components/Whiteboard/Whiteboard.tsx"          # EXCALIDRAW_ASSET_PATH
sed -n 64,69p "FE/components/Whiteboard/Whiteboard.tsx"          # props actually passed
grep -n "FILES_CAP_BYTES\|WHITEBOARD_SAVE_DEBOUNCE_MS\|objectType" "FE/lib/whiteboardStore.ts"
grep -n "'whiteboard'" "FE/registry/widgetRegistry.ts" "FE/data/toolsHub.ts" "FE/data/hierarchy.ts"
grep -n excalidraw "qualia-shell/package.json"                   # 0.18.1
ls "qualia-shell/public/excalidraw-fonts/fonts"
grep -rn -i whiteboard FE/components/StrataDashboard FE/components/Scribe   # expect: no hits
# tests
cd qualia-shell && npx vitest run src/test/whiteboardStore.test.ts src/test/whiteboardWidget.test.tsx src/test/toolsHub.test.tsx
# live
open https://argyleholocron.netlify.app  → Tools hub → Whiteboard = Ready
```

---

# 2. Documenso — backend proxy + external Documenso, surfaced as the `esign` widget

## 2.1 Upstream capabilities (sources: README https://github.com/documenso/documenso ; homepage https://documenso.com/ ; pricing https://documenso.com/pricing ; docs https://docs.documenso.com/developers/public-api , https://docs.documenso.com/developers/webhooks , https://docs.documenso.com/developers/embedding , https://docs.documenso.com/users/get-started/account-creation)

License AGPL-3.0 (README badge). README itself is thin on features (it covers self-hosting, local dev `npm run dx`, one-click deploys to Railway/Render/Koyeb/Elestio, Docker/Compose/Kubernetes, and the stack: React Router v7, Hono, Prisma, tRPC, pdf.js, Lingui…); product features come from the homepage/docs.

| # | Feature | Source (quote) |
|---|---|---|
| D1 | Create, send, sign documents | homepage "Create, Send, Sign Documents With Ease" |
| D2 | Draft→sign workflow incl. field placement | homepage "Define workflows from draft to sign with our easy to use interface" |
| D3 | Templates | homepage "Create Templates and Enable Direct Linking" |
| D4 | Direct links (on-demand signing) | homepage "Share reusable templates for instant, on-demand signing" |
| D5 | Teams / organisations | homepage "Create & Manage Teams"; docs nav "Organisations" |
| D6 | Public REST API v2 (`Authorization: api_xxx`; Documents/Recipients/Fields/Templates/Teams; "Documents and templates are being deprecated and replaced by envelopes") | docs public-api |
| D7 | Webhooks (`DOCUMENT_CREATED, DOCUMENT_SENT, DOCUMENT_OPENED, DOCUMENT_SIGNED, DOCUMENT_COMPLETED, DOCUMENT_REJECTED, DOCUMENT_CANCELLED` + recipient/template events) | docs webhooks |
| D8 | Embedding SDKs (`@documenso/embed-react` etc.; `EmbedDirectTemplate`, `EmbedSignDocument`; `host` prop for self-host; "available on Teams Plan and above") | docs embedding |
| D9 | Compliance: "21 CFR Part 11", "ESIGN Act", "UETA", "SOC2", "HIPAA" | homepage |
| D10 | Self-hosting (Docker/Compose/Railway/Render/Koyeb/Elestio/K8s), open source | README |
| D11 | Zapier integration | homepage "connects with your favorite tools via Zapier" |
| D12 | Document revocation / cancel | homepage FAQ "Can I revoke or cancel a document after sending it?" |
| D13 | Account security (2FA, passkeys), plans Free/Individual/Teams/Platform | docs account-creation |
| D14 | Signed document retrieval (download) | docs public-api (Documents: retrieve) — Dwellium calls `/api/v2/envelopes/:id/download`; that exact envelope path was not in the page I fetched, flagging as unverified |

Pricing facts fetched (https://documenso.com/pricing): Free = "5 documents per month", "Up to 10 recipients per document", "No credit card required"; "API Access for Personal Use" first appears under **Individual ($25/mo)**; "Embedded Signing" first appears under **Teams ($40/mo)**; Webhooks/Templates/Direct Links not itemised per tier on that page.

## 2.2 What Dwellium has

**Integration model:** proxy + external app. The browser never talks to Documenso; Express routes hold the key and call Documenso's v2 API; Documenso calls back via webhook; the widget is a sent-documents tracker plus an "Open Documenso ↗" link. (`BE/src/routes/esignRoutes.ts:1-18`; `FE/components/ESign/esignApi.ts:1-8`.)

**Backend files**
- `BE/src/routes/esignRoutes.ts` — mounted `app.use('/api/esign', authenticate, esignRoutes)` (`BE/src/app.ts:430`); every route `requireRole('management')`. Env gate `DOCUMENSO_API_URL` + `DOCUMENSO_API_KEY` (`:27-32`); unset → 503 `{success:false, needsSetup:true, error:'Documenso is not configured — set DOCUMENSO_API_URL and DOCUMENSO_API_KEY…'}` (`:34-39`). `documensoFetch` → `${baseUrl}/api/v2${path}` with raw `Authorization: api_…` header (`:41-47`, matches docs). Routes: `GET /documents` (leases with `metadata.esign.envelopeId`, `:49-65`); `GET /leases/:id/status` (`:67-73`); `POST /leases/:id/send` — only from `docStatus==='approved'` (`:81-86`), recipients from body or `applicantEmail|tenantEmail` fallback (`:87-97`), `POST /envelopes` with `{title, templateId?: DOCUMENSO_TEMPLATE_LEASE, recipients, externalId}` then `POST /envelopes/:id/send` (`:99-109`), UPSERT of `metadata.{docStatus:'sent', docHistory, esign:{envelopeId,recipients,sentAt}}` (`:113-128`); `GET /leases/:id/signed-pdf` proxies `/envelopes/:id/download` (`:134-149`).
- `BE/src/routes/webhookRoutes.ts:113-173` — `POST /api/webhooks/documenso` (mounted unauthenticated `BE/src/app.ts:382`). Gate `DOCUMENSO_WEBHOOK_SECRET` unset → 503 (`:140-143`); timing-safe compare of header `x-documenso-secret` (`:126-131, 145-148`); event map `DOCUMENT_SIGNED→signed`, `DOCUMENT_COMPLETED→countersigned`, `DOCUMENT_REJECTED/CANCELLED→draft` (`:119-124`); keyed by `payload.envelopeId||payload.id` (`:151`); unknown events acknowledged (`:153`); metadata UPSERT only (`:155-170`). NOT done: downloading/filing the signed PDF on COMPLETED (`PLAN:127`).
- Env used by backend: `DOCUMENSO_API_URL`, `DOCUMENSO_API_KEY`, `DOCUMENSO_TEMPLATE_LEASE`, `DOCUMENSO_WEBHOOK_SECRET` (`esignRoutes.ts:28-29,99`; `webhookRoutes.ts:140`). `BE/.env.example` has no DOCUMENSO_* lines (`grep DOCUMENSO BE/.env.example` → none) — plan step 2 (`PLAN:122`) half-done.

**Frontend files**
- `FE/components/ESign/esignApi.ts` — `listEsignDocuments()` → `GET ${API_BASE}/api/esign/documents` (`:47-57`), `sendForEsign(workitemId)` → `POST …/leases/:id/send` (`:59-72`); 503 → typed `needs-setup`, network error → `error` (`:50-56, 65-70`). No caller for `/status` or `/signed-pdf`.
- `FE/components/ESign/ESign.tsx` — widget: states loading / needs-setup ("Connect Documenso" card → opens Tools hub, `:59-70`) / error (Retry, `:72-78`) / empty ("Open Strata", `:80-86`) / table Document·Recipients·Status·Sent (`:88-110`); "Open Documenso ↗" link only when `VITE_DOCUMENSO_URL` is set (`:39, 46-50`).
- `FE/components/StrataDashboard/modules/LeasingModule.tsx` — `sendForSignature` (`:258-273`) → toast "Sent for e-signature" / "Documenso is not connected yet — see Tools hub → E-Sign"; button "Send for e-signature" rendered only when `docStatus==='approved'` (`:1086-1092`); recipient chips from `metadata.esign.recipients` (`:1093-1098`).
- `FE/registry/widgetRegistry.ts:786-800` — `'esign'` entry (label "E-Sign", icon `pen-line`, category `tools`, 520×400, lazy). `FE/data/hierarchy.ts:31` — `dock-esign`, Property Management, pinned. `FE/data/toolsHub.ts:35` — row `{ id:'esign', license:'AGPL-3.0-only (Documenso, unmodified image)', phase:1, widgetId:'esign', envVar:'VITE_DOCUMENSO_URL' }` → `needs-setup` until `VITE_DOCUMENSO_URL` is set (`:51-60`). `qualia-shell/.env.example:53-54` documents `VITE_DOCUMENSO_URL=` and that API keys live on Cloud Run only. Guide: `FE/content/guides/gettingStarted.ts:49,62`.
- Not present: `@documenso/embed-react` (`grep documenso qualia-shell/package.json` → none); Tenant Portal signing embed (`grep -rn -i "documenso|EmbedSign|esign" FE/components/TenantPortal` → none) — `PLAN:130` step 6 not built; `/leases/:id/signing-token` route (`PLAN:126`) not built; ARA tools `esign.send_lease` / `esign.status` (`PLAN:132`) not built.

**Tests (all passing today)**
- `BE/tests/esignRoutes.test.ts` — 503 + `needsSetup:true` on all four routes when env unset (`:48-63`); 401 without session (`:65-68`); 403 for tenant role (`:70-74`); approved → 200, envelope id recorded, `docStatus=sent`, docHistory appended, exact upstream URLs `/api/v2/envelopes` then `/api/v2/envelopes/env_123/send` (`:83-106`); draft → 400 and Documenso never called (`:108-118`); no recipient → 400 (`:120-126`); Documenso 500 → 502, docStatus unchanged (`:128-135`); unknown workitem → 404 (`:137-141`); `/documents` lists only enveloped leases + `/status` (`:148-161`); webhook: 503 without secret (`:165-169`), 401 wrong secret (`:171-175`), `DOCUMENT_COMPLETED` → countersigned + unknown event ignored (`:177-193`), unknown envelope → `updated:null` (`:195-201`).
- `FE/test/esignWidget.test.tsx` — 503 → `needs-setup` for list and send (`:35-39`); 200 → documents + envelope id (`:41-49`); 400 error message surfaced; network → "Backend unreachable" (`:51-56`); widget needs-setup card button opens `tools-hub` (`:60-66`); table renders title/recipient/status (`:68-77`); error state with Retry (`:79-84`).
- `FE/test/toolsHub.test.tsx:42-45, 61-63` — esign `needs-setup` without env, `ready` with `VITE_DOCUMENSO_URL`.

**UI entry points:** widget id `esign`; dock "Property Management → E-Sign"; Tools hub row "E-Sign" (Set up → opens Guide); Strata → Leasing → approved lease → "Send for e-signature".

**Status on production:** Tools hub shows E-Sign = **Set up** (`VITE_DOCUMENSO_URL` not set on Netlify); Cloud Run has `/api/esign/*` + `/api/webhooks/documenso` deployed and answers 503 "not configured" (no `DOCUMENSO_*` env). Note a status split: the Tools hub keys on the *frontend* env only (`toolsHub.ts:58`) while the widget keys on the *backend* 503 (`ESign.tsx:59`) — setting only `VITE_DOCUMENSO_URL` would flip the hub to Ready while the widget still shows "Connect Documenso".

## 2.3 Gap table

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| D1 Create, send, sign | 🟡 | Send from an approved lease via proxy (`esignRoutes.ts:75-132`; `LeasingModule.tsx:1086-1092`); signing happens in Documenso's email flow | Dwellium uploads **no PDF**: the envelope is `{title, templateId?, recipients, externalId}` (`esignRoutes.ts:102`) — the Dwellium-generated lease (`LeasingModule.tsx` `generateLeaseDoc`, `BE/src/services/leaseGenerator.ts`) is not attached; without `DOCUMENSO_TEMPLATE_LEASE` the envelope has no document. No in-app signing surface |
| D2 Draft→sign workflow, field placement | 🟡 | Dwellium's own `docStatus` machine `draft→pending_review→approved→sent→signed→countersigned` (`BE/src/routes/dwelliumRoutes.ts:2373`; `esignRoutes.ts:82-86`), webhook makes `signed/countersigned` real | Field placement lives only in the Documenso template; no field API use |
| D3 Templates | 🟡 | One template id via env `DOCUMENSO_TEMPLATE_LEASE` (`esignRoutes.ts:99-102`) | Renewal / vendor templates from `PLAN:121-122` not wired; no template listing/selection in UI |
| D4 Direct links | ❌ | — | No use of direct-link templates; could serve "sign on demand" for applications |
| D5 Teams / organisations | ➖ | Management-role gate on Dwellium side (`esignRoutes.ts:49,67,75,134`) | Zero-cost addendum (`PLAN:502-507`) picks the Cloud **Free** plan, which has no team; Documenso-side org features unused by design |
| D6 REST API v2 | ✅ | `documensoFetch` with `Authorization: api_…` (`esignRoutes.ts:41-47`); envelopes create/send/download used | Uses 3 endpoints of the API surface; header format matches docs |
| D7 Webhooks | ✅ | `POST /api/webhooks/documenso`, secret-gated, 4 events mapped (`webhookRoutes.ts:119-124, 139-173`) | `DOCUMENT_SENT/OPENED` + recipient events ignored (acknowledged); header name `x-documenso-secret` could not be confirmed from the docs page I fetched — verify at setup; signed PDF not auto-filed on COMPLETED (`PLAN:127`) |
| D8 Embedding SDK | ❌ | — | `@documenso/embed-react` not installed; Tenant Portal embed (`PLAN:130`) not built; upstream requires **Teams plan** (docs embedding) — conflicts with zero-cost addendum, so effectively ➖ under current constraints |
| D9 Compliance certs | 🟡 | Inherited from Documenso Cloud if used | Self-host path (gate G2, `PLAN:470`) = self-signed p12, "not qualified e-signature"; Dwellium adds no audit surface beyond `docHistory` |
| D10 Self-hosting | ➖ | — | Addendum chose Documenso Cloud free; self-host "documented, not built" (`PLAN:506`) |
| D11 Zapier | ➖ | — | Dwellium's own webhook bridge supersedes it |
| D12 Revocation / cancel | 🟡 | Inbound `DOCUMENT_CANCELLED/REJECTED → draft` handled (`webhookRoutes.ts:122-123`) | No outbound cancel route/button in Dwellium |
| D13 2FA / passkeys, plans | ➖ | — | Documenso account security applies to Andy's Documenso login only; Dwellium auth is separate |
| D14 Signed PDF retrieval | 🟡 | Backend `GET /api/esign/leases/:id/signed-pdf` (`esignRoutes.ts:134-149`) | No frontend caller (`esignApi.ts` has only list + send); not filed into Dwellium storage |

## 2.4 Parity numbers (Documenso)

14 upstream rows. Tally: ✅ 2 (D6, D7) · 🟡 6 (D1, D2, D3, D9, D12, D14) · ❌ 2 (D4, D8) · ➖ 4 (D5, D10, D11, D13).

- (a) **Feature coverage once configured** (i.e. after `DOCUMENSO_API_URL/KEY/WEBHOOK_SECRET/TEMPLATE_LEASE` on Cloud Run + `VITE_DOCUMENSO_URL` on Netlify + webhook registered in Documenso):
  - strict (✅ only): 2 / 14 = **14%**; excluding ➖ rows: 2 / 10 = 20%
  - inclusive (✅ + 🟡): 8 / 14 = **57%**; excluding ➖: 8 / 10 = 80%
- (b) **Native in Dwellium** (reimplemented in-app, not proxied): the only upstream row with native substance is D2 (Dwellium's own docStatus state machine + history, pre-dating 047) — **1 / 14 ≈ 7% partial, 0% full**. Everything else (signing, templates, API, webhooks, compliance) is Documenso's, reached through the proxy. The sent-documents tracker (`ESign.tsx`) is Dwellium-native UI but is not an upstream feature row.
- Today on production, coverage is **0%** of either number: backend returns 503 and the widget shows "Connect Documenso".

**Risk flagged by the pricing fetch:** the zero-cost addendum assumes "Documenso Cloud free plan… Ilya creates the account + API key" (`PLAN:506`), but on https://documenso.com/pricing the Free tier lists only "5 documents per month / Up to 10 recipients per document / No credit card required", and "API Access for Personal Use" first appears under Individual ($25/mo). Dwellium's integration needs the API + webhooks, so the $0 path may not yield an API key — re-verify on account creation (the addendum itself says free-tier numbers must be re-verified at build time).

## 2.5 What it would take to close each ❌ / 🟡

- D1 attach the Dwellium lease PDF — multipart/upload step before `/envelopes/:id/send` (or template-only with prefill); and confirm the v2 envelope create payload shape against the API reference. **M**
- D2 field placement — rely on templates (S, config only) or call the Fields API (L); recommend templates. **S**
- D3 more templates — add `DOCUMENSO_TEMPLATE_RENEWAL/VENDOR` env + a template picker in Leasing. **S**
- D4 direct links — store a direct-link URL per template and expose "Sign on demand" in Leasing/Tenant Portal. **S**
- D7 auto-file signed PDF on COMPLETED — in the webhook, call `/signed-pdf` logic and write to the file store, set `metadata.esign.signedPdfFileId`. **S**
- D8 Tenant Portal embed — `npm i @documenso/embed-react`, backend `/signing-token` route (`PLAN:126`), `EmbedSignDocument host=VITE_DOCUMENSO_URL` (`PLAN:130`); blocked by Teams-plan requirement under zero-cost. **M (+ plan cost)**
- D9 compliance — decision only (Cloud vs self-host cert), gate G2. **S**
- D12 outbound cancel — proxy route + button mapping to the envelope cancel endpoint. **S**
- D14 signed PDF in UI — add `getSignedPdf()` to `esignApi.ts` and a "Download signed PDF" link in Leasing/E-Sign for `signed/countersigned`. **S**
- Hygiene: align Tools hub status with the backend 503 (or document that both envs must be set); add `DOCUMENSO_*` to `BE/.env.example`. **S**

## 2.6 Verification

```
# backend
sed -n 27,47p BE/src/routes/esignRoutes.ts      # env gate + v2 fetch helper
sed -n 99,109p BE/src/routes/esignRoutes.ts     # envelope create/send payload (no PDF)
sed -n 119,124p BE/src/routes/webhookRoutes.ts  # event map
grep -n "api/esign\|api/webhooks" BE/src/app.ts # mounts (:382, :430)
grep -n DOCUMENSO BE/.env.example               # expect: none
cd BE && OPENAI_API_KEY=sk-dummy npx jest tests/esignRoutes.test.ts --forceExit
# frontend
grep -n "VITE_DOCUMENSO_URL\|503" "FE/components/ESign/ESign.tsx" "FE/components/ESign/esignApi.ts" "FE/data/toolsHub.ts"
grep -n "sendForEsign\|Send for e-signature" "FE/components/StrataDashboard/modules/LeasingModule.tsx"
grep -n documenso qualia-shell/package.json     # expect: none (no embed SDK)
grep -rn -i "documenso\|EmbedSign" FE/components/TenantPortal   # expect: none
cd qualia-shell && npx vitest run src/test/esignWidget.test.tsx src/test/toolsHub.test.tsx
# live
open https://argyleholocron.netlify.app  → Tools hub → E-Sign = Set up
curl -s -H "Authorization: Bearer <token>" https://<cloud-run-backend>/api/esign/documents   # expect 503 {needsSetup:true}
# upstream
https://documenso.com/pricing  (Free tier bullets; API under Individual)
https://docs.documenso.com/developers/embedding  ("available on Teams Plan and above")
```

---

## Bottom line

- **Excalidraw:** genuinely integrated and live — 8/15 features fully, 13/15 including partials (87%), all native. Gaps are persistence niceties (library items, images > 2 MB, import) and the deliberately deferred collab server.
- **Documenso:** a correct, well-tested **scaffold** (proxy + webhook + tracker UI) that is dark on production and, even once configured, reaches 2/14 features fully and 8/14 with partials (57%), ~0% native. The biggest functional gap is that Dwellium never uploads the lease PDF (template-only envelopes), and the biggest assumption risk is that the Free plan may not include API access.
