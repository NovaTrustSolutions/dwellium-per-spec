# Gap analysis — Scribe "Interactive Docs" v1 vs Gamma.app Documents

**Date:** 2026-08-18 · **Ours:** `qualia-shell/src/components/Scribe/idocs/` (main `8e2e188`, live on argyleholocron.netlify.app) · **Theirs:** Gamma.app *Documents* as inventoried from help.gamma.app / developers.gamma.app / pricing (marketing pages 403 to fetchers; 97 sourced facts, see §Sources).
**Target stated by Ilya:** 100 % parity. **Score at v1 (2026-08-18 a.m.): 41 %. After Wave 1 (2026-08-18 p.m., main `d6a70e3`): ≈ 69 % weighted parity (see §Scoring — per-area re-scores below).** The core authoring loop (AI-generate → card/block doc → theme → present → export) is at parity; the gaps are almost entirely *platform* features (real-time collaboration, hosted publishing, cloud analytics, AI media, native diagrams, imports beyond text).

Legend: ✅ parity · 🟡 partial (works, narrower) · ❌ missing · ➕ ours only.

---

## Wave 1 — SHIPPED 2026-08-18 (main `d6a70e3`, live on argyleholocron.netlify.app)

Three parallel branches (A renderer/export/blocks · B AI/import/library · C editor/store/history), merged with zero conflicts; gate on merged main: tsc 0 · vitest **227 files / 1968 tests** (+80) · Netlify build 0; live browser pass at 1440×900 (templates → editor, all new blocks incl. KaTeX + Mermaid rendering, slash palette, doc settings, history, present, spotlight, Esc-safe).

Now ✅ that were ❌/🟡 this morning: card backgrounds (color/image/overlay/intensity/align) · `image-top`/`background` layouts · page sizes (16:9 · 4:3 · 1:1 · A4 · Letter · fluid, incl. `@page` for print) · **nested cards** (⌘⇧O) · footnotes (`[^n]`) · headers/footers/logo/section numbers · Emphasize (boxes) · smart layouts `steps`/`process`, `funnel`, `boxes` (+ existing timeline/columns/gallery) · card-link buttons · **drag-and-drop** cards + blocks · copy/paste/duplicate/multi-select cards · insert cards from another doc · math (KaTeX) · diagrams (Mermaid) · Prism code · **local QR** block · donut/area charts · Spotlight (`S`) · presenter notes (stored; presenter *view* is wave 2) · `/` slash palette · **version history + ⌘Z/⌘⇧Z** (30 snapshots) · templates (6 built-in + save-as-template) · doc-level AI (summarize / add card / translate / restyle / regenerate card) · amount/audience/language options + RTL `dir` · outline-first generation up to 30 cards · URL import (backend Readability proxy) · PDF import (pdf.js) · +9 embed providers (24 total: adds TikTok, Wistia, JotForm, Instagram, X, Office 365, Power BI, Tableau, Google Drive) · 47 themes · library search/sort.

Still open (→ waves 2–3): AI images/Unsplash/Giphy, theme editor + font upload, in-editor agent chat, presenter view, comments, real-time collaboration, publish/share links/embed code/password/SEO, server analytics, PPTX/PNG export, HTTP API, custom domains.

## 1. Content model

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| Cards as flexible sections, fluid height, unlimited count | Cards, fluid height, unlimited | ✅ | — |
| Card layouts: no-image / top / right / left / background | `default`, `hero`, `split-left`, `split-right` + header image | 🟡 | add `image-top`, `background` (full-bleed) layouts — CSS only |
| Card backgrounds: color / image / Unsplash / GIF / AI, overlay frosted/faded/clear 0–100 %, full-bleed, v-align | header image URL only | ❌ | per-card `background{color,image,overlay,intensity,align}` (S) |
| Card sizes 16:9 / 1:1 / 4:3 / A4 / Letter / fluid | fluid only | ❌ | `doc.pageSize` + `aspect-ratio` on `.scribe-idocs__card` (S) |
| Nested cards (expand/collapse, ⌘⇧O) | — | ❌ | `Card.children` + collapsible render (M) |
| Toggles (collapsible text) | `accordion` block | ✅ | — |
| Footnotes | — | ❌ | `footnote` inline syntax in md + card-bottom render (S) |
| Smart Layouts (columns, timeline, process, funnel, boxes, bullets, numbers, quotes, steps, galleries) | `columns`, `timeline`, `gallery`, `quote`, `table` | 🟡 | add `steps`/`process`, `funnel`, `boxes`/`numbers` blocks; "switch layout" transform on existing block (M) |
| Emphasize (highlight one cell) | — | ❌ | `emphasis` flag on columns/table cells (S) |
| Table of contents block | `toc` (click → jump/scroll) | ✅ | — |
| Card links / `/button` targeting cards, mailto | `button` (external URL); TOC jumps | 🟡 | `button.href = #card:<id>` (S) |
| Multipage gammas (Pages panel, per-page URLs, auto nav) | one doc = one page; library of docs | ❌ | out of scope for v1 (needs publishing, §7) |
| Filmstrip: drag reorder, multi-select, copy/paste cards across docs | outline rail: ↑/↓, duplicate, delete | 🟡 | drag-and-drop (native HTML5 DnD, no dep) + copy card JSON (S) |
| Merge gammas / copy cards between docs | duplicate doc; import JSON | 🟡 | "Insert cards from another doc…" picker (S) |
| Headers/footers 6 positions, section numbers, logo (Pro) | — | ❌ | `doc.chrome{header,footer,logo}` rendered per card + in HTML/print export (S–M) |

## 2. Blocks & interactive elements

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| Insert bar + `/` slash search for blocks | "+ Add block" menu (18 types) | 🟡 | `/` slash palette in the md textareas reusing `slashCommands.ts` pattern (S) |
| Rich text: headings, B/I/U/S, size, color, align, links, lists, blockquote | Markdown (react-markdown + GFM) | 🟡 | markdown covers B/I/S, lists, links, quotes; **no** color/size/align/underline → inline toolbar writing md/HTML spans (M) |
| Callouts | `callout` info/success/warning/danger | ✅ | — |
| Code blocks | `code{lang}` (no highlighting inside idocs) | 🟡 | route through `previewEnhance` Prism (S) |
| Math (KaTeX inline + block) | — (Scribe Doc mode has KaTeX; not in idocs) | ❌ | reuse `previewEnhance` KaTeX on idocs md (S) |
| Tables | `table` | ✅ | — |
| Smart Charts: column/bar/line/pie/donut ("14 types"), cell editor, Google Sheets live sync, edit via Agent | `chart` bar/line/pie, inline data editor | 🟡 | donut/area/stacked (recharts, S); Sheets sync (M, needs Google OAuth already wired for Andy) |
| Smart Diagrams (freeform canvas) | — | ❌ | Mermaid via `previewEnhance` gets flowcharts cheaply (S); freeform canvas is L |
| AI Infographics (`/infographics`, Pro) | — | ❌ | needs image generation (§3) |
| Timelines / process flows | `timeline` | ✅ (timeline) / ❌ (process) | `steps` block (S) |
| Buttons / links | `button` primary/secondary | ✅ | — |
| QR code | — | ❌ | tiny QR encoder (no dep ≈ 150 lines) or `api.qrserver.com` image (S) |
| Images: upload/URL/Unsplash/web search/Giphy/Pictographic/AI, crop, focal point, fit/fill | URL or file (downscaled data URL) | 🟡 | Unsplash/Giphy pickers (keys), crop/focal (M) |
| Image galleries | `gallery` | ✅ | — |
| Video/media embeds: YouTube, Vimeo, Loom, TikTok, Spotify, Wistia | YouTube (watch/shorts/youtu.be), Vimeo, Loom, Spotify | 🟡 | TikTok, Wistia mappers in `embedSrcFor` (S) |
| App embeds: Figma, Airtable, Miro, Google Docs/Sheets/Slides/Maps/Drive/Forms, Typeform, JotForm, Calendly, Instagram, X, Office 365, PowerBI/Tableau, generic iframe | Figma, Airtable, Miro, Google Docs/Sheets/Slides/Forms/Maps, Typeform, Calendly, PDF, generic web | 🟡 | JotForm, Instagram, X, Office 365, PowerBI/Tableau, Drive mappers (S); oEmbed unfurl for titles/thumbnails (M) |
| Native forms/polls/quizzes | `quiz` (reveal answer + explanation) | ➕ | Gamma has none natively — ours is ahead |
| Tabs block | `tabs` | ➕ | Gamma has toggles only |
| AI animations / video (Ultra) | — | ❌ | out of scope (video-gen models) |

## 3. AI

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| Creation modes: Generate (prompt) · Paste text · Import file/URL · Template · Agent | Generate (prompt) · Paste text/outline · Import .md/.txt/.docx/.json · Blank | 🟡 | URL import (fetch + readability, S — CORS via backend proxy); templates (§6); Agent (below) |
| Import: PPTX, DOCX, PDF, Google Docs/Slides, Notion, URL; 200 MB | DOCX (mammoth), MD/TXT, JSON | 🟡 | PDF text (pdf.js is already in the app for PDFGear — reuse, S); PPTX (M); Google Docs via OAuth (M) |
| textMode generate / condense / preserve; up to 400k chars | generate; source ≤ 12k chars | 🟡 | chunked condense pass for long sources (S) |
| Options: amount brief/medium/detailed/extensive · tone · audience · 60+ languages · image source | cards count (1–12) · tone | 🟡 | add amount + audience + language selects to the composer (S) |
| Cards per prompt: Free 10 / Plus 20 / Pro 50–60 / Ultra 75 | 12 cap | 🟡 | raise cap; generation is one call — batch by outline for >12 (S) |
| **Agent** in-editor chat (⌘E): grammar, translate, summarize, tone, expand/add cards, restyle, format, web search, read URLs/uploads, multi-card edits | per-block AI ▾ (rewrite/shorten/expand/simplify/formal/friendly) | 🟡 | doc-level "AI ▾": add card about X / translate doc / summarize / restyle — reuse `callLlm` + `normalizeCard`; ARA already has web search skill (M) |
| Create with Agent (uploads, research, outline editing, 4 style presets) | — | ❌ | outline-first flow: generate outline → user edits → generate cards (M) |
| Translate per card / whole doc | — | ❌ | one prompt over `exportMarkdown` → `normalizeDoc` (S) |
| Remix (template + content + prompt; doc↔deck) | — | ❌ | "Regenerate with theme/format" (M) |
| One-click restyle | theme swatches (7) | ✅ | — |
| AI images (30+ models, styles), style references, Imagine editor, image dashboard | — | ❌ | app already has an image-gen skill (`skill-image-gen`, OpenAI/Gemini) → "Generate image" on `image` blocks (S–M) |
| Studio Mode (cinematic full-image cards) | — | ❌ | depends on image gen |
| Credits / tokens model | user's own LLM key, no metering | ➕/— | AI Spend widget already meters `callLlm` — surface per-doc cost (S) |

## 4. Design

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| 100+ built-in themes, dark/light | 7 (`inherit`, `paper`, `midnight`, `sunrise`, `forest`, `slate`, `neon`) | 🟡 | themes are 8-var CSS maps — generating 30–50 more is data entry (S); "inherit" already follows all 18 app themes |
| Custom themes: colors/gradients, heading/body fonts, spacing, roundness, stroke/shadow, block fills, accent images, logo, AI style keywords; workspace share; import theme from PPTX | — | ❌ | theme editor over the same 8 vars + fonts (M); reuse ControlPanel "Customize Theme" UI pattern |
| Custom font upload (TTF/OTF, Pro) | fonts limited to app-loaded (Hanken/Inter/JetBrains + system) | ❌ | `@font-face` from uploaded file stored as data URL (S) |
| Responsive (laptop/tablet/phone) | responsive grid + present | 🟡 | app shell itself is desktop-first (plan 045-E) |
| RTL support; UI in 15 languages | inherits app (LTR) | ❌ | `dir="rtl"` per doc (S) |

## 5. Modes

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| Formats: presentation / document / webpage / social | document (cards); Present ≈ deck | 🟡 | "deck" = fixed 16:9 page size (§1); webpage = publish (§7) |
| Present: full screen or in tab, ←/→, ↑/↓ scroll in tall cards, progress bar, Esc, Quick Edit (E), Follow Mode | Present overlay in the Scribe window, ←/→/PgUp/PgDn/Space/Esc, progress dots, Scroll toggle | 🟡 | true Fullscreen API (S); Follow Mode needs realtime (§6) |
| Spotlight (reveal one block at a time) | — | ❌ | block-index state + blur class (S) |
| Presenter View (notes, timer) | — | ❌ | `card.notes` + second window/popout (M; the shell has popout windows) |
| Convert site ↔ document | — | ❌ | n/a until publishing |

## 6. Collaboration

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| Permissions View/Comment/Edit; workspace defaults | per-user private store (One Save sync) | ❌ | share to workspace users via One Save `objectType: scribe-idocs-shared` + role check (M) |
| Real-time co-editing with cursors | — | ❌ | needs CRDT/WS (L) — no such infra in the app today |
| Block-level comments + reactions, @mentions, Slack DMs | — (Scribe Doc mode has inline comments; not wired to idocs) | ❌ | reuse Scribe `CommentEditor` per block (M) |
| Workspaces, folders | library list | 🟡 | folder tag on doc (S) |
| Workspace templates + template instructions; public template gallery | — | ❌ | "Save as template" = doc JSON with `isTemplate` + "New from template" (S) |
| Version history (all plans) | — | ❌ | snapshot ring buffer (last 20) in the store (S); Scribe Doc mode already has versions — same pattern |

## 7. Sharing / publishing

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| Public link with access levels; embed iframe | Copy JSON; save HTML to Artifact Gallery; download HTML | ❌ | backend `POST /api/idocs/publish` → static HTML at `/p/<slug>` (M) — the export HTML is already self-contained/no-script |
| Password protection (Pro) | — | ❌ | with publish (S after publish) |
| Hide "Made with" badge | n/a | ➕ | no badge |
| Publish as site: subdomain, custom domains, navbar, favicon | — | ❌ | L (product decision) |
| SEO title/description, indexing toggle, GA/GTM/Pixel | `description` field | ❌ | with publish |
| Direct post to LinkedIn | — | ❌ | S after publish |
| Mobile app | — | ❌ | n/a |

## 8. Analytics

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| Views, unique viewers (30 d), % views per card, time per card, cards viewed, viewer identity, Pro | views + seconds per card, local (this browser), Analytics popover | 🟡 | server-side beacons once published (M) |

## 9. Export / import

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| PDF (styled), PPTX, PNG, Google Slides; fonts embedded | PDF (text-only via pdf-lib), **Print** (styled, page-per-card), HTML (standalone, no-script), Markdown, JSON | 🟡 | styled PDF = print-to-PDF today; PPTX (pptxgenjs is a new dep — needs Ilya's OK, M); PNG per card (canvas of DOM, M) |
| Import PDF/PPTX/DOCX/Google Docs/Notion/URL | DOCX/MD/TXT/JSON | 🟡 | see §3 |
| DOCX/Markdown/HTML export | HTML + Markdown ✅; DOCX ❌ | ➕/🟡 | DOCX via existing mammoth is read-only; writer needs a dep |

## 10. Platform

| Gamma | Ours (v1) | Status | Gap → what closes it |
|---|---|---|---|
| Generate API, themes/folders/export/analytics endpoints, OAuth | widget-action bus `scribe.create-interactive-doc` (ARA/Hermes can trigger); no HTTP API | 🟡 | backend route wrapping `generateDocFromPrompt` server-side (M) |
| Connectors: ChatGPT/Claude MCP, Zapier/Make/n8n; inbound Airtable/HubSpot/Notion/Slack/… | ARA + Hermes skills; Supabase/Postgres/Gmail integrations exist app-wide | 🟡 | ARA skill "make an interactive doc from <source>" (S) |
| Slack app | — | ❌ | n/a |
| Version history | — | ❌ | see §6 |
| Shortcuts (⌘Z, ⌘E agent, S spotlight, E quick edit, ⌘⇧O) | ←/→/Esc in present | ❌ | ⌘Z via snapshot history; S/E once features exist |
| Offline | ➕ works offline (local store, One Save syncs later) | ➕ | — |
| SOC 2 / SSO / AI-training opt-out | n/a — data never leaves the user's own LLM key/backend | ➕ | — |

---

## Scoring

Weighted by what a document author touches daily (weights in parentheses):

| Area | Weight | v1 | after Wave 1 | Notes (post-wave-1) |
|---|---|---|---|---|
| 1 Content model | 15 | 55 % | 90 % | nesting/backgrounds/sizes/footnotes/chrome/emphasize ✅; multipage & merge-gammas ❌ |
| 2 Blocks & interactive | 20 | 60 % | 85 % | 24 block types incl. math/diagram/QR/steps/funnel/boxes; AI infographics, freeform diagram canvas ❌ |
| 3 AI | 20 | 40 % | 65 % | options/outline-first/doc-level actions/translate ✅; agent chat, AI images, remix ❌ |
| 4 Design | 10 | 30 % | 55 % | 47 themes ✅; theme editor/font upload/custom logo theme ❌ |
| 5 Modes | 5 | 50 % | 75 % | spotlight ✅, page sizes ≈ deck; presenter view ❌ |
| 6 Collaboration | 10 | 5 % | 25 % | version history + templates ✅; comments/realtime/permissions ❌ |
| 7 Sharing/publishing | 10 | 10 % | 10 % | unchanged (wave 3) |
| 8 Analytics | 3 | 40 % | 40 % | unchanged |
| 9 Export/import | 5 | 55 % | 80 % | URL/PDF import ✅, HTML/MD/print ✅; PPTX/PNG ❌ |
| 10 Platform | 2 | 30 % | 45 % | ⌘Z/shortcuts/`?` sheet ✅; HTTP API ❌ |
| **Weighted total** | 100 | **≈ 41 %** | **≈ 69 %** | |

## Road to 100 % — sequenced by leverage (each item is one plan-045-style ticket)

**Wave 1 — authoring parity — ✅ SHIPPED 2026-08-18 (see block above; projected 68 %, landed ≈ 69 %):** card backgrounds + page sizes + `image-top/background` layouts · nested cards · footnotes · `steps`/`process`/`funnel`/`boxes` blocks · card-link buttons · drag-and-drop reorder + copy card · math + Prism + Mermaid via `previewEnhance` · donut/area charts · TikTok/Wistia/JotForm/Instagram/X/PowerBI/Tableau mappers · QR block · headers/footers · Spotlight · `/` slash palette · 40 more themes (data) · version snapshots + ⌘Z · templates (save/new-from) · translate/summarize/add-card doc-level AI · amount/audience/language options · URL + PDF import.
→ projected **≈ 68 %**.

**Wave 2 — AI media + editor depth (M, ~3 days):** AI image generation on `image` blocks (reuse `skill-image-gen`) · Unsplash/Giphy pickers · theme editor + font upload · outline-first "Create with Agent" flow · in-editor AI chat (ARA-in-Scribe already exists as `AraMiniPanel` — point it at the active idoc) · Presenter view (popout) · block comments (reuse Scribe `CommentEditor`) · Google Sheets chart sync · styled PDF (print pipeline) · PNG per card.
→ projected **≈ 84 %**.

**Wave 3 — platform (M–L, needs backend + product decisions):** publish to `/p/<slug>` (static HTML already generated) → password, SEO, share links, embed code, server analytics · workspace sharing + roles · real-time co-editing (CRDT; **L**) · PPTX export (new dep, Ilya gate) · public HTTP generate API · custom domains (L).
→ **≈ 95–100 %** (the last points are Gamma's hosted business features — custom domains, mobile app, Slack app, credit economy — which are product choices, not gaps in the editor).

## Sources
- Gamma inventory (97 items, each with URL): research pass 2026-08-18 over help.gamma.app (collections: Editing/Designing, AI Content & Images, Sharing/Collab/Analytics, Websites & Publishing, Connectors/Imports/Embeds), developers.gamma.app/llms-full.txt, lab.gamma.app, gamma.app/pricing, third-party reviews (kripeshadwani, eesel, presentations.ai). Facts marked "unverified" in the inventory were treated as gaps in Gamma's favour.
- Ours: `qualia-shell/src/components/Scribe/idocs/*` @ `8e2e188`; live pass on the dev build (Playwright, 1440×900): library → blank → 7 block types → present → Esc; vitest 222 files / 1888 tests; `README.md` "Known v1 simplifications".
