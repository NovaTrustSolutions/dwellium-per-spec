# Penpot — gap analysis (Dwellium plan 047, phase 2 launcher)

Date: 2026-08-23. Read-only audit. Frontend root `FE` = `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell/src`; backend root `BE` = `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src`; plan = `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/plans/047-oss-tools-integration-and-onboarding.md`.

## 1. Upstream capabilities (fetched 2026-08-23)

| # | Feature | Upstream phrasing | Source |
|---|---|---|---|
| P1 | Real-time collaboration | "Real-time collaboration strengthens this foundation, helping teams scale" | https://github.com/penpot/penpot (README) |
| P2 | Native Design Tokens | "Best-in-class native Design Tokens provide a single source of truth" | README; https://help.penpot.app/user-guide/ (`/user-guide/design-systems/design-tokens/`) |
| P3 | Components & Variants | "native Design Tokens, Components, and Variants for scalable, reusable…" | README; `/user-guide/design-systems/components/`, `/variants/` |
| P4 | Responsive layouts (CSS Grid / Flex Layout) | "With CSS Grid and Flex Layout, teams can design responsive interfaces" | README; `/user-guide/designing/flexible-layouts/` |
| P5 | Plugin system | "Penpot plugins let you expand the platform's capabilities" | README |
| P6 | Inspect tab / design-as-code | "The inspect tab…", "design is expressed as code" | README; `/user-guide/dev-tools/#inspect-design` |
| P7 | Open standards (SVG, CSS, HTML, JSON) | "works with open standards like SVG, CSS, HTML, and JSON" | README |
| P8 | Open API via access tokens + webhooks | "open API and plugin system makes the workspace programmable"; "support for webhooks and an API accessible through access [tokens]" | README |
| P9 | Self-hosting | "Built on open source and designed for self-hosting" | README; https://help.penpot.app/technical-guide/ |
| P10 | MCP server | "The MCP server takes it further by enabling multi-directional workflows" | README |
| P11 | Prototyping | "Build interactive prototypes to mimic your product behaviour" | https://help.penpot.app/user-guide/ (`/user-guide/prototyping-testing/prototyping/`) |
| P12 | Shared Libraries | "Organize and manage your stored elements with Libraries" | `/user-guide/design-systems/libraries/` |
| P13 | Export PNG/JPEG/WEBP/SVG/PDF, whole-page PDF, `.penpot` import/export | formats "PNG, JPEG, WEBP, SVG, PDF"; "export all the artboards of a page to a single PDF" | https://help.penpot.app/user-guide/exporting/ |

License: MPL-2.0 (README; plan L229).

## 2. What Dwellium has today

**Integration model: launcher only (no iframe, no backend).** Opens Penpot's free cloud in a new tab.

| Piece | File | What it does |
|---|---|---|
| Widget | `FE/components/PenpotStudio/PenpotStudio.tsx` L1-52 | Card: title "Design Studio", blurb (flyers/notices/brand library), muted note "Penpot's cloud blocks embedding, so it opens in a new tab", and `<a target="_blank" rel="noreferrer" href={url}>Open Penpot ↗</a>` (L46). `penpotUrl(env)` (L20-23) returns `VITE_PENPOT_URL` if set, else `PENPOT_DEFAULT_URL = 'https://design.penpot.app'` (L17). Header comment L5-9: XFO SAMEORIGIN verified 2026-08-20 → launcher by design. |
| Styles | `FE/components/PenpotStudio/PenpotStudio.css` L1-61 | Theme-token card + button; nothing functional. |
| Registry | `FE/registry/widgetRegistry.ts` L820-834 | id `penpot-studio`, label "Design Studio", tier `tools`, icon `palette`, category `filing`, `minWidth 480 / minHeight 400`, lazy import. Comment L820-822: "No env gate — `ready` as soon as this entry exists." |
| Tools hub row | `FE/data/toolsHub.ts` L42-44 | id `design-studio`, license "MPL-2.0 (Penpot, launcher)", phase 2, `widgetId: 'penpot-studio'`, **no `envVar`** → `resolveToolStatus` (L51-60) returns `ready`. |
| Tools hub UI | `FE/components/ToolsHub/ToolsHub.tsx` L31, L59-63 | `ready` → `openWidget('penpot-studio')`; button label "Open". |
| Dock / sidebar | `FE/data/hierarchy.ts` L90 | `dock-penpot`, group Filing Cabinet, `pinned: false` (reachable via Tools hub + ⌘K). Icon map `FE/components/Sidebar/iconMap.ts` L117. |
| Preview quick link | `FE/components/Shell/FluidOS.tsx` L117-129 | Preview pane lists "Design Studio → https://design.penpot.app" as a quick link (L124) and loads it in the in-app Preview iframe. |
| Guide text | `FE/content/guides/gettingStarted.ts` L57 | "Ready — … Design Studio (Penpot's free cloud, opens in a new tab)". |
| Env gate | `VITE_PENPOT_URL` (optional, re-points launcher only) | Not set in production; default cloud URL used. |
| Backend | `grep -ri "penpot" BE` → **no matches** | No `/api/penpot/*` proxy, no webhook route, no export-to-File-Manager (plan L242 steps 4-6 not built). |

**Tests** (`npx vitest run src/test/penpotWidget.test.tsx src/test/toolsHub.test.tsx` → 2 files, 13 tests passed, run 2026-08-23):
- `FE/test/penpotWidget.test.tsx` L15-20: `penpotUrl({})` = `https://design.penpot.app`; env override trims + re-points.
- L24-30: `WIDGET_REGISTRY['penpot-studio']` defined, label "Design Studio"; Tools-hub row has no `envVar` and resolves `ready` with empty env.
- L32-40: renders blurb, "cloud blocks embedding" note, link `href` = default URL, `target="_blank"`, and **`document.querySelector('iframe')` is null** ("launcher-only by design").
- L42-45: `VITE_PENPOT_URL` re-points the link.
- `FE/test/toolsHub.test.tsx` L53-60, L88-90: `design-studio` is one of exactly three `ready` rows (whiteboard, dictation, design-studio).
- `FE/test/registryWalker.test.tsx` L46-48: registry count comment includes `penpot-studio`.

**Production status** (https://argyleholocron.netlify.app): Tools hub shows Design Studio = **Ready**; Open → Design Studio widget → "Open Penpot ↗" opens https://design.penpot.app in a new tab. Independent header check today: `curl -sI https://design.penpot.app/` → `HTTP/2 200`, `x-frame-options: SAMEORIGIN` (so an iframe of the cloud editor would be blocked — launcher is the correct model).

**Plan 047 intent vs. built:** Plan L227-247 specifies the *full* path (self-host on GCE behind Caddy stripping XFO, iframe widget, `/api/penpot/*` proxy with `PENPOT_ACCESS_TOKEN`, webhooks → Automation Hub, "Export to File Manager"). The zero-cost addendum L502-517 (row L510: "penpot.app free cloud — launcher widget only | Self-host = phase 3") and gate G8 (L476) replaced that with the lite launcher. What shipped matches the addendum exactly, not the L238-247 steps.

## 3. Gap table

Legend: ✅ available through the integration · 🟡 partial · ❌ not available · ➖ intentionally out of scope.
"Through the integration" here means *in Penpot's free cloud after clicking Open ↗* — nothing runs inside a Dwellium window.

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| P1 Real-time collaboration | ✅ (external) | Open ↗ → design.penpot.app; Andy + Lisa collaborate in Penpot's UI | Not visible inside Dwellium; no shared session/SSO (separate Google sign-in) |
| P2 Design Tokens | ✅ (external) | Penpot cloud editor | Plan L233 "Dwellium Brand" library/tokens not seeded (plan step 3, L241) — nothing in repo |
| P3 Components & Variants | ✅ (external) | Penpot cloud editor | Same as above |
| P4 CSS Grid / Flex layouts | ✅ (external) | Penpot cloud editor | — |
| P5 Plugins | ✅ (external) | Penpot cloud editor | No Dwellium-specific plugin exists |
| P6 Inspect / code | ✅ (external) | Penpot cloud editor | — |
| P7 Open standards SVG/CSS/HTML/JSON | ✅ (external) | Penpot cloud editor | No import path into Dwellium (manual download → File Manager upload) |
| P8 Open API (access tokens) + webhooks | 🟡 | Andy can create a token in Penpot's UI; Dwellium has **no** `/api/penpot/*` proxy, no webhook receiver (BE grep empty) | Plan L242 step 4 (`penpotRoutes.ts`, `PENPOT_ACCESS_TOKEN`, `POST /webhook` → Automation Hub) not built |
| P9 Self-hosting | ➖ | Addendum L510: free cloud chosen, "Self-host = phase 3"; G8 (L476) | Ilya-locked zero-cost decision; `VITE_PENPOT_URL` hook already exists for a future self-host |
| P10 MCP server | ❌ | Nothing registers `penpot-mcp` with Hermes/ARA (plan L244 step 6 optional) | Whether design.penpot.app exposes MCP to free-plan users was **not verified** in this audit; self-host compose ships `penpot-mcp` (plan L231) |
| P11 Prototyping | ✅ (external) | Penpot cloud editor | — |
| P12 Shared Libraries | ✅ (external) | Penpot cloud editor | "Dwellium Brand" library not created (plan L241) |
| P13 Export PNG/JPEG/WEBP/SVG/PDF, `.penpot` | ✅ (external) | Penpot cloud editor → download to disk | No "Export to File Manager" side panel (plan L243) — manual upload only |

Minor observation (not a P-row): `FE/components/Shell/FluidOS.tsx` L124 offers design.penpot.app as a Preview-pane quick link, but `penpot.app` is not in `FRAME_BLOCKED_HOSTS` (L137-141) and the host sends `X-Frame-Options: SAMEORIGIN` (verified above) → that quick link will render a blank Preview iframe rather than the "refuses to be framed" fallback (L550). One-line fix (S): add `'penpot.app'` to the list. Not changed here (read-only).

## 4. Parity numbers

Denominator = 13 upstream features (P1-P13).

- **(a) Feature coverage once configured** (nothing to configure — Ready by default):
  - *Via Open ↗ external app*: ✅ rows = P1,P2,P3,P4,P5,P6,P7,P11,P12,P13 = **10/13 = 76.9%**. Counting the 🟡 (P8, usable in Penpot UI, not bridged) = 11/13 = 84.6%. Excluding the ➖ self-host row from the denominator: 10/12 = 83.3%.
  - *Inside a Dwellium widget*: **0/13 = 0%** — the widget is a card with one link; no iframe (`penpotWidget.test.tsx` L39 asserts `iframe` is null).
- **(b) Native in Dwellium** (reimplemented in Dwellium code): **0/13 = 0%**. Dwellium ships ~50 lines of launcher UI + a URL resolver; no design, export, API or webhook code.

## 5. What it would take to close each ❌ / 🟡

| Row | Action | Effort |
|---|---|---|
| P8 API + webhooks | Build `BE/routes/penpotRoutes.ts` (`GET /status`, `GET /files`, `POST /export`, `POST /webhook`) + env `PENPOT_BASE_URL/ACCESS_TOKEN/WEBHOOK_SECRET` + mount in `app.ts` (plan L242); free cloud issues personal access tokens, so this does not strictly need the self-host | M |
| P10 MCP | Only meaningful with self-host (`penpot-mcp` container, plan L231/L244) → register as Hermes MCP source | L (ops) / S (registration once hosted) |
| P13 Export-to-File-Manager | Side panel in `PenpotStudio.tsx` calling `POST /api/penpot/export` (depends on P8) → `Properties/<name>/Marketing` | M |
| P2/P3/P12 Brand library | Human step: create team "Dwellium", library "Dwellium Brand", 5 starter boards (plan L241) — no code | S |
| In-window embed (all rows → "inside widget") | Phase-3 self-host on a VM behind Caddy (`header_down -X-Frame-Options`, CSP `frame-ancestors … argyleholocron.netlify.app`, plan L239-240), then iframe in `PenpotStudio.tsx` + set `VITE_PENPOT_URL`; blocked by zero-cost addendum (no VM) | L |
| Preview quick-link blank | Add `'penpot.app'` to `FRAME_BLOCKED_HOSTS` in `FluidOS.tsx` L137 | S |

## 6. Verification

```bash
# Dwellium side
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell"
grep -rn -i "penpot" src/data/toolsHub.ts src/registry/widgetRegistry.ts src/data/hierarchy.ts src/components/Shell/FluidOS.tsx
sed -n '1,52p' src/components/PenpotStudio/PenpotStudio.tsx        # no <iframe>, href = env || design.penpot.app
npx vitest run src/test/penpotWidget.test.tsx src/test/toolsHub.test.tsx   # 13 passed on 2026-08-23
grep -rn -i "penpot" /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src   # expect no output
# Upstream / live
curl -sI https://design.penpot.app/ | grep -i x-frame-options     # x-frame-options: SAMEORIGIN
open https://github.com/penpot/penpot ; open https://help.penpot.app/user-guide/exporting/
open https://argyleholocron.netlify.app   # Tools hub → Design Studio = Ready → Open → "Open Penpot ↗" (new tab)
```

---

# AppFlowy — gap analysis (Dwellium plan 047, phase 3 — DEFERRED, nothing built)

## 1. Upstream capabilities (fetched 2026-08-23)

| # | Feature | Upstream phrasing | Source |
|---|---|---|---|
| A1 | Docs / wiki editor | "Bring projects, wikis, and teams together with AI" | https://github.com/AppFlowy-IO/AppFlowy (README) |
| A2 | Databases with Grid / Board (Kanban) / Calendar views | "Databases for Tasks and Projects"; Kanban, Grid, Calendar views shown | README |
| A3 | AppFlowy AI | "AppFlowy AI" featured capability | README |
| A4 | Local-first / data privacy | "achieve more without losing control of your data"; "100% control of your data" | README |
| A5 | Self-hosting (AppFlowy-Cloud stack) | "Self-hosting AppFlowy" + guide; stack = GoTrue, PostgreSQL, Redis, MinIO, nginx, admin frontend, AppFlowy Web; docker compose + `deploy.env` | README → https://appflowy.com/docs/Step-by-step-Self-Hosting-Guide ; https://github.com/AppFlowy-IO/AppFlowy-Cloud |
| A6 | Real-time collaboration | "AI collaborative workspace"; Cloud README: guests "collaborate with you in real time" | README; AppFlowy-Cloud README |
| A7 | Templates | "AppFlowy Templates" | README |
| A8 | Desktop apps (macOS, Windows, Linux) | releases listed | README |
| A9 | Mobile apps (iOS, Android 10+) | App Store / Play Store | README |
| A10 | AppFlowy Web (browser client) | "AppFlowy Web App access" in free self-host tier | AppFlowy-Cloud README |
| A11 | Sites / publish pages | "Sites for Beautiful documentation"; "Ability to publish pages" | README; AppFlowy-Cloud README |
| A12 | Unlimited workspaces | "create unlimited workspaces" | AppFlowy-Cloud README |

License: AGPLv3 ("Distributed under the AGPLv3 License", README). Licensing constraint (not a feature): free self-hosted tier = "One user seat (per instance)" + "Up to 3 guest editors"; "AppFlowy Self-hosted Cloud is adopting an open-core model" (AppFlowy-Cloud README) — matches plan L372.

## 2. What Dwellium has today

**Integration model: nothing.** No widget, no iframe, no env, no backend. Exactly as expected for a phase-3 deferral.

| Piece | File | What it does |
|---|---|---|
| Tools hub row | `FE/data/toolsHub.ts` L47 | id `appflowy`, label "AppFlowy Workspace", license "AGPL-3.0-only (AppFlowy-Cloud, unmodified)", phase 3, blurb "Notion-style docs, databases and kanban — trial only, Andy's call after.", `widgetId: 'appflowy'`, `envVar: 'VITE_APPFLOWY_URL'`, `setupDoc: 'appflowy'`. |
| Status resolution | `FE/data/toolsHub.ts` L57 | `hasWidget('appflowy')` is false (no registry entry) → `coming-soon`. |
| Tools hub UI | `FE/components/ToolsHub/ToolsHub.tsx` L59-63 | Button disabled, label "Coming soon", title "Coming soon (phase 3)". |
| Guide text | `FE/content/guides/gettingStarted.ts` L70 | "Coming soon — AppFlowy Workspace (phase 3 trial)." |
| Widget / registry / dock | — | `grep -ri appflowy FE` hits only `toolsHub.ts`, `gettingStarted.ts`, `test/toolsHub.test.tsx`. No `components/AppFlowy/`, no registry id, no `hierarchy.ts` entry. |
| Env | `VITE_APPFLOWY_URL` referenced as the future gate only | Not set anywhere. |
| Backend | `grep -ri appflowy BE` → **no matches** | — |

**Tests** (`FE/test/toolsHub.test.tsx`, part of the 13 passing above):
- L37: TOOLS id list ends with `'appflowy'` (exactly ten tools).
- L53-60: `appflowy` resolves `coming-soon` with empty env (the only coming-soon row).
- L84-87: rendered Tools hub has exactly **one** "Coming soon" button and it is disabled.

**Production status** (https://argyleholocron.netlify.app): Tools hub shows AppFlowy Workspace = **Coming soon** (disabled button).

**What plan 047 proposes for phase 3** (plan L369-397; summary row L27; gate G7 L475; wave 4 L489; STOP L498):
- *Hosting*: GCE VM (e2-standard-2, 30 GB) running the **unmodified** AppFlowy-Cloud docker-compose stack (nginx, minio, postgres+pgvector, redis, gotrue, appflowy_cloud, admin_frontend, ai, worker, search, appflowy_web) at `flowy.dwellium.com` with TLS via Caddy/certbot (L373, L381). Hosting table L102: "+$30-60/mo, second VM". **Note:** the zero-cost addendum table (L502-517) has no AppFlowy row at all — under the no-new-spend rule there is currently no $0 hosting decision for it; it is effectively parked behind G7.
- *Identity*: Google OAuth via GoTrue (`GOTRUE_EXTERNAL_GOOGLE_ENABLED=true` + Dwellium's Google client; `GOTRUE_DISABLE_SIGNUP=true` after Andy + Lisa sign in) (L381); mapping recorded in `federated_identities` provider=`appflowy` (L41). Seat catch: free tier = 1 seat + 3 guests → paid self-host plan, AGPL self-build, or skip (L372, G7).
- *What would embed*: iframe of AppFlowy-Web in a new widget `FE/components/AppFlowy/AppFlowy.tsx` copying `LangFlowPanel.tsx` reachability/iframe/Open ↗ pattern, default URL `VITE_APPFLOWY_URL`; registry id `appflowy` (label "AppFlowy Workspace", icon `book-open`), dock `dock-appflowy` in Filing Cabinet; CSP `frame-ancestors` added in AppFlowy-Cloud `nginx.conf` (config-only) (L382-386). Content seed: SOP, Vendor Directory, Lease Renewals calendar, Turnover board, published "House Rules" (L387). Optional phase-2 `/api/appflowy/*` proxy + Hermes mirror + ARA `appflowy_search` (L390). Test spec `src/test/AppFlowyWidget.test.tsx` (L393).

## 3. Gap table

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| A1 Docs / wiki editor | ❌ | — | Phase 3; Dwellium already has Wiki/Scribe/Notepad (plan L376, STOP L498: do not retire them) |
| A2 Databases grid/board/calendar | ❌ | — | Phase 3; overlaps Task Board/Trello (L376) |
| A3 AppFlowy AI | ❌ | — | Phase 3; would need the `ai` container (L373) |
| A4 Local-first / data privacy | ❌ | — | N/A until self-hosted |
| A5 Self-hosting | ❌ | — | No VM; no $0 row in addendum; gate G7 open |
| A6 Real-time collaboration | ❌ | — | Free tier caps at 1 seat + 3 guests (AppFlowy-Cloud README) |
| A7 Templates | ❌ | — | — |
| A8 Desktop apps | ➖ | — | Out of scope: Dwellium is a web shell; desktop app would only matter as a companion (not planned) |
| A9 Mobile apps | ➖ | — | Same |
| A10 AppFlowy Web | ❌ | — | This is the thing the phase-3 iframe would embed (L374) |
| A11 Sites / publish pages | ❌ | — | Plan L387 would paste published URL into Tenant Portal |
| A12 Unlimited workspaces | ❌ | — | — |

## 4. Parity numbers

Denominator = 12 upstream features (A1-A12).
- **(a) Feature coverage once configured**: there is nothing to configure — no widget exists, `VITE_APPFLOWY_URL` has no consumer. Via Open ↗: **0/12 = 0%**. Inside a Dwellium widget: **0/12 = 0%**.
- **(b) Native in Dwellium**: **0/12 = 0%**.
Both are 0% plainly because only a disabled Tools-hub row and guide text exist (files above). Functional overlap with existing Dwellium widgets (Wiki, Scribe, Notepad, Task Board) is real but those are not AppFlowy integrations and are not counted.

## 5. What it would take (phase-3 plan steps, effort)

| Step | Action | Effort |
|---|---|---|
| G7 decision | Paid self-host plan vs AGPL self-build vs skip (plan L475); also pick a $0-compatible host or accept +$30-60/mo (L102) — addendum currently silent | S (decision) |
| Infra | VM + AppFlowy-Cloud compose from `deploy.env`, FQDN, TLS, GoTrue Google OAuth (L381) | M-L (ops; ~10 containers) |
| Framing | CSP `frame-ancestors` in `nginx.conf` (L382) | S |
| Widget | `components/AppFlowy/AppFlowy.tsx` (iframe + reachability + Open ↗), registry `appflowy`, dock entry, `VITE_APPFLOWY_URL` on Netlify (L383-386) — the Tools-hub row then flips `needs-setup` → `ready` automatically via `resolveToolStatus` | S-M (~1 day) |
| Content seed | Workspace, SOP, Vendor Directory, Lease Renewals, Turnover board, published House Rules (L387) | S (human) |
| Test | `src/test/AppFlowyWidget.test.tsx` per L393 | S |
| Optional bridge | `/api/appflowy/*` proxy + Hermes mirror + ARA search (L390) | M |
Plan's own estimate: M, 3-4 days phase 1, "ops is the cost" (L378).

## 6. Verification

```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell"
grep -rn -i "appflowy" src            # expect: data/toolsHub.ts:47, content/guides/gettingStarted.ts:70, test/toolsHub.test.tsx
grep -n "'appflowy'" src/registry/widgetRegistry.ts src/data/hierarchy.ts   # expect no output
npx vitest run src/test/toolsHub.test.tsx   # asserts exactly one disabled "Coming soon" (AppFlowy)
grep -rn -i "appflowy" /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src   # expect no output
sed -n '369,397p' "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/plans/047-oss-tools-integration-and-onboarding.md"
open https://github.com/AppFlowy-IO/AppFlowy ; open https://github.com/AppFlowy-IO/AppFlowy-Cloud
open https://argyleholocron.netlify.app   # Tools hub → AppFlowy Workspace = Coming soon (disabled)
```
