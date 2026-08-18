🧪 Research complete (~12 min of fetching). Note: `gamma.app/*` marketing pages (incl. `/products/documents`, `/pricing`, `/integrations/*`, `/explore/*`) return HTTP 403 to fetchers, so I sourced primarily from `help.gamma.app`, `developers.gamma.app/llms-full.txt`, `lab.gamma.app`, and third‑party reviews. Facts from marketing pages are attributed via search snippets and marked accordingly.

# Gamma "Documents" feature inventory (as of Aug 2026)

## 1. Content model
- [content] Cards ("slides") as flexible sections — fluid height by default; fixed aspect ratios (e.g. 16:9) show dotted guides; unlimited card count; hidden cards for backup content (https://help.gamma.app/en/articles/11016396-what-are-slides-in-gamma-and-how-do-they-work)
- [content] Nested cards — drag one card onto another or `/` command; expand/collapse; ⌘/Ctrl+Shift+O opens all nested cards (https://help.gamma.app/en/articles/11016428-how-do-i-use-toggles-nested-slides-and-footnotes-effectively; https://openaimaster.com/how-to-use-gamma-app/)
- [content] Toggles — collapsible sections; convert existing text via toolbar/right-click; multiple per card (same URL as above)
- [content] Footnotes — highlight text → footnote; renders at card bottom, housed in the footnote number (same URL)
- [content] Card layouts — accent-image positions: No image / Top / Right / Left / Background (full-bleed); per-card, not global (https://help.gamma.app/en/articles/11969695-how-do-i-style-slides-and-adjust-layout-settings-in-my-gamma)
- [content] Card backgrounds — solid color, image (upload/web/Unsplash/GIF/AI), overlay Frosted/Faded/Clear with 0–100% intensity; full-bleed toggle; content align top/center/bottom (same URL; https://help.gamma.app/en/articles/11029115-how-do-i-control-slide-sizes-and-adjust-page-setups)
- [content] Card sizes (API-documented) — 16x9, 1x1, 4x3, a4, letter, fluid; Page Setup "Slide Size" dropdown in editor (https://developers.gamma.app/llms-full.txt; https://help.gamma.app/en/articles/11029115-how-do-i-control-slide-sizes-and-adjust-page-setups)
- [content] Smart Layouts — Insert → Smart Layouts; named: timelines, columns, galleries, `/timeline`, `/process`, `/funnel`; one-click layout switch auto-reflows content; sparkle-icon AI layout suggestions with preview (https://help.gamma.app/en/articles/11029130-what-s-the-fastest-way-to-transform-content-and-layouts; https://help.gamma.app/en/articles/11016396-what-are-slides-in-gamma-and-how-do-they-work)
- [content] Smart Layout variants per third-party: columns, boxes, bullets, images, numbers, quotes, steps (https://kripeshadwani.com/gamma-app-review/) (unverified against official docs)
- [content] Emphasize — star icon highlights one cell in a structured layout; fixed style (https://help.gamma.app/en/articles/11028369-what-is-the-emphasize-feature-and-how-can-i-use-it)
- [content] Table of contents — auto-generated clickable TOC block from card titles (https://kripeshadwani.com/gamma-app-review/; YouTube "How to add a Table of Contents automatically in Gamma") (unverified in help center)
- [content] Card links — `/button` or `/link` can target other pages or individual cards (identified by card heading); mailto links; not sub-card anchors (https://help.gamma.app/en/articles/11047766-how-do-i-link-within-my-gamma-site)
- [content] Multipage gammas — Pages panel; blank or AI-generated pages; reorder/rename/duplicate/archive; per-page links; file-level sharing; publish as multi-page site with auto nav (https://help.gamma.app/en/articles/13929260-what-are-multipage-gammas-and-how-do-i-use-them)
- [content] Filmstrip — left-side card navigator; drag reorder, Shift multi-select, copy/paste cards across gammas (https://help.gamma.app/en/articles/11016403-how-does-the-filmstrip-in-gamma-work)
- [content] Merge/combine gammas and copy cards between gammas (https://help.gamma.app/en/articles/11028354-how-do-i-merge-slides-and-combine-gammas)
- [content] Headers/footers — 6 positions (top/bottom × L/C/R); text, auto section numbers, theme logo, PNG/SVG upload; logo sizes S–XL, light/dark variants; hide on first/last; per-card eye toggle; included in PDF/PPTX; **Pro+** (https://help.gamma.app/en/articles/11100588-how-can-i-add-headers-and-footers-to-my-gamma)

## 2. Blocks & interactive elements
- [blocks] Insert bar (right side) + `/` slash-command search for every block (https://help.gamma.app/en/articles/7898153-what-s-the-best-way-to-add-blocks-and-content-in-gamma)
- [blocks] Text: headings, bold/italic/underline/strikethrough, font size, color (palette/theme), align L/C/R, links, bulleted/numbered lists, blockquotes (`>` prefix), footnotes (https://help.gamma.app/en/articles/11028318-how-do-i-add-edit-and-style-text-in-gamma)
- [blocks] Callout boxes, blockquotes, code blocks, math, toggles, nested cards (https://lab.gamma.app/gamma-101-module-2-lesson-4)
- [blocks] Tables, lists, boxes, buttons, code blocks, TOC (https://kripeshadwani.com/gamma-app-review/)
- [blocks] Math — `/math block` (centered, own line) and `/inline math`; KaTeX, most LaTeX (https://help.gamma.app/en/articles/11971719-how-do-i-add-math-in-gamma)
- [blocks] Smart Charts — `/chart` or Insert → Charts & Diagrams; cell editor; live sync to a Google Sheets tab; edit via Agent (https://help.gamma.app/en/articles/11029098-how-can-i-generate-charts-and-diagrams-in-gamma)
- [blocks] Chart types — column, bar, line, pie, donut confirmed; "14 chart types" per reviewer (https://www.topview.ai/blog/detail/how-to-create-charts-with-ai-for-your-presentations-gamma-tutorial via search; https://kripeshadwani.com/gamma-app-review/) (full list unverified)
- [blocks] Smart Diagrams — `/diagram`; freeform canvas: lines, arrows, shapes, text, images; zoom/grid/undo; "3 freeform diagram" types per reviewer (https://help.gamma.app/en/articles/11029098-how-can-i-generate-charts-and-diagrams-in-gamma; https://kripeshadwani.com/gamma-app-review/)
- [blocks] AI Infographics — `/infographics`; art style, layout, aspect ratio, model; static image in exports; **Pro** (https://help.gamma.app/en/articles/13920805-how-do-i-add-infographics-in-gamma)
- [blocks] Timelines/process flows — as Smart Layouts and via API "infographics (timelines, process flows)" (https://developers.gamma.app/guides/charts-and-structured-content)
- [blocks] Buttons/links — `/button`, `/link` (https://help.gamma.app/en/articles/11047766-how-do-i-link-within-my-gamma-site)
- [blocks] QR code — `/qr code`, any URL, B&W only (https://help.gamma.app/en/articles/11047829-how-do-i-create-and-embed-a-qr-code-in-gamma)
- [blocks] Images — upload (PNG/JPEG/GIF, 200MB, 50MP), URL, stock (Unsplash), web search, Giphy GIFs, Pictographic, AI; crop/resize/replace, focal-point crosshair, fit/fill (https://help.gamma.app/en/articles/11028379-how-do-i-add-and-edit-images-in-gamma; https://help.gamma.app/en/articles/11856101-how-do-i-use-the-visuals-menu-in-gamma)
- [blocks] Image galleries — "gallery" smart layout (https://help.gamma.app/en/articles/11029130-what-s-the-fastest-way-to-transform-content-and-layouts)
- [blocks] Video/media embeds — YouTube, Vimeo, Loom, TikTok, Spotify, Wistia (`/wistia` or paste URL) (https://lab.gamma.app/gamma-101-module-2-lesson-4; https://gamma.app/integrations/wistia and /spotify via search snippet)
- [blocks] App/embeds — Figma, Airtable, Miro, Google Docs/Sheets/Slides/Maps/Drive/Forms, Typeform, JotForm, Calendly, Instagram, X/Twitter, Office 365, PowerBI/Tableau dashboards, generic live website/iframe (https://kripeshadwani.com/gamma-app-review/; https://gamma.app/integrations/x, /figma, /instagram, /calendly, /type-form via search snippets; https://www.aitoolssme.com/review/gamma)
- [blocks] Native forms/polls/quizzes — none found; forms only via embeds (Typeform/Google Forms/JotForm) (unverified: absence)
- [blocks] Tabs / accordion block — no evidence beyond toggles (unverified: absence)
- [blocks] AI animations (video) — models Leonardo Motion 2/2 Fast, Luma Ray 2/2 Flash, Veo 3.1/3.1 Fast; card-level; **Ultra** (https://help.gamma.app/en/articles/13920980-how-do-i-add-animations-in-gamma)

## 3. AI
- [ai] Creation modes — Generate (prompt), Paste in text, Import file or URL, Create from template, Agent (https://help.gamma.app/en/articles/7838093-how-do-i-create-a-new-presentation-document-or-webpage-in-gamma; https://help.gamma.app/en/articles/15002203-how-do-i-create-with-agent-in-gamma)
- [ai] Import sources — PPTX, DOCX, PDF, Google Docs, Google Slides, Notion, web URL, pasted text; "plain" vs AI-assisted import; text only (styling not preserved); 200MB files, 100MB PDFs (https://help.gamma.app/en/articles/11047840-how-can-i-import-slides-or-documents-into-gamma)
- [ai] textMode generate / condense / preserve (API); inputText up to 400k chars (https://developers.gamma.app/llms-full.txt)
- [ai] Generation options — text amount brief/medium/detailed/extensive; tone; audience; 60+ languages; image source aiGenerated / webFreeToUseCommercially / webFreeToUse / giphy / pictographic / pexels / placeholder / themeAccent / webAllImages / noImages (https://developers.gamma.app/llms-full.txt)
- [ai] AI tokens per initial generation — Free 50k, Plus/Pro 100k (https://help.gamma.app/en/articles/11047156-what-are-gamma-tokens-and-how-do-they-work)
- [ai] Cards per prompt — Free 10, Plus 20, Pro 50–60 (sources conflict), Ultra 75 (https://www.eesel.ai/blog/gamma-pricing; https://www.presentations.ai/blog/gamma-pricing)
- [ai] Agent (in-editor AI chat, ⌘/Ctrl+E or sparkle) — fix grammar, translate, summarize, tone, expand/add cards, restyle theme, format, web search, read URLs/screenshots/uploads, multi-card edits; thread clears after 180k tokens or 3 days (https://help.gamma.app/en/articles/8033284-can-i-edit-my-content-using-ai)
- [ai] Create with Agent — uploads (PDF/doc/deck/site/image/existing gamma), research, outline editing, 4 style presets Minimal/Visual/Classic/Consultant; **Plus/Pro/Ultra/Teams only** (https://help.gamma.app/en/articles/15002203-how-do-i-create-with-agent-in-gamma)
- [ai] Translate — Free/Plus per-card; Pro whole gamma at once (https://help.gamma.app/en/articles/11016513-can-i-translate-a-gamma-document)
- [ai] Remix — source gamma/template + content + prompt → restyle / fill / change format (doc↔deck); all plans, costs credits (https://help.gamma.app/en/articles/12601672-what-is-remix-and-how-do-i-use-it)
- [ai] One-click restyle — click any theme to preview/apply; Agent restyles (https://help.gamma.app/en/articles/10262646-how-do-i-change-my-gamma-theme)
- [ai] AI images — `/ai` or Insert → AI Image; style + dimensions; Enhance prompt; models incl. DALL·E 3, GPT Image, Flux Kontext Max, Ideogram, Recraft, Imagen, Leonardo, Luma, Gemini/Nano Banana Pro (30+ via API); style presets photography/illustration/abstract/3D/line art (https://help.gamma.app/en/articles/11047176-how-do-i-generate-images-with-ai-in-gamma; https://help.gamma.app/en/articles/11856101-how-do-i-use-the-visuals-menu-in-gamma; https://developers.gamma.app/llms-full.txt)
- [ai] Image style references + theme-level AI image style keywords (https://help.gamma.app/en/articles/13928575-what-are-image-style-references-and-how-do-i-use-them; https://help.gamma.app/en/articles/11029150-can-i-add-my-own-colors-and-fonts-to-gamma)
- [ai] Imagine (image editor/canvas) — variations, restyle, crop, erase, background removal, upscale, expand, agent edits; standalone infographics/posters/logos; up to 3 variations; JPEG/PNG/WebP/HEIC; **not on Business/Enterprise** (https://help.gamma.app/en/articles/16154694-how-do-i-edit-images-with-gamma-imagine; https://help.gamma.app/en/articles/13928852-what-is-imagine-and-how-do-i-design-with-it)
- [ai] AI Image dashboard (Media/Graphics) — workspace-wide library, regenerate, reuse (https://help.gamma.app/en/articles/11047222-where-can-i-find-the-ai-image-dashboard-in-gamma)
- [ai] Studio Mode — full-image cinematic cards/socials, HD/4K, Nano Banana Pro HD; **Ultra** early access (https://juliangoldie.com/gamma-studio-mode/; https://www.eesel.ai/blog/gamma-pricing)
- [ai] Credits — Free 400 one-time (+200/referral, cap 2,000); Plus 1,000/mo; Pro 4,000; Ultra 20,000; Team 6,000/seat; Business 10,000/seat; rollover cap 2× plan; costs vary by model; image cost shown pre-generate (https://help.gamma.app/en/articles/7834324-how-do-credits-work-in-gamma; https://www.eesel.ai/blog/gamma-pricing)
- [ai] API credit costs — 1–3 credits/card; images Standard 2–15, Advanced 20–33, Premium 34–75, Ultra 30–125 (https://developers.gamma.app/llms-full.txt)

## 4. Design
- [design] Themes — "100+" built-in incl. dark/light; preview-on-click; customize inside a gamma (Theme → … → Customize) (https://kripeshadwani.com/gamma-app-review/; https://help.gamma.app/en/articles/10262646-how-do-i-change-my-gamma-theme) (count unverified officially)
- [design] Custom themes — colors (hex/wheel, gradients), heading/body fonts, line-height/letter-spacing/size/uppercase, roundness, stroke/shadow, block fills, accent images, logo (4 corners; Pro), AI style keywords; auto-shared to workspace; import theme from PPTX/Google Drive file (https://help.gamma.app/en/articles/11029150-can-i-add-my-own-colors-and-fonts-to-gamma; https://lilys.ai/notes/en/gamma-ai/create-custom-presentation-themes-ai via search)
- [design] Custom font upload (TTF/OTF) — Pro+ (https://kripeshadwani.com/gamma-app-review/; https://www.presentations.ai/blog/gamma-pricing)
- [design] Responsive — adapts to laptop/tablet/phone (https://gamma.app/explore/content/guides/gamma-vs-powerpoint-card-based-format-presentations via search snippet)
- [design] Right-to-left language support (https://help.gamma.app/en/articles/11016519-does-gamma-support-right-to-left-languages) (content not fetched — unverified detail)
- [design] UI in 15 languages (https://help.gamma.app/en/articles/11016506-how-do-i-use-gamma-in-my-preferred-language)

## 5. Modes
- [modes] Formats — presentation, document, webpage (site), social; document = scrollable long-form (https://developers.gamma.app/llms-full.txt; https://help.gamma.app/en/articles/7838093-how-do-i-create-a-new-presentation-document-or-webpage-in-gamma)
- [modes] Present — Full screen or In tab; ←/→ cards, ↑/↓ scroll inside tall cards; progress bar; Esc; Quick Edit (E) mid-presentation; Follow Mode via shared link (https://help.gamma.app/en/articles/8032935-what-s-the-best-way-to-present-my-gamma)
- [modes] Spotlight (S) — blur unrevealed blocks, reveal one at a time (https://help.gamma.app/en/articles/11047295-how-does-spotlight-mode-work-in-gamma)
- [modes] Presenter View — private notes, live note editing, timer, shortcuts (https://help.gamma.app/en/articles/11047307-can-i-use-speaker-notes-while-presenting-in-gamma)
- [modes] Convert site ↔ document (https://help.gamma.app/en/articles/11047785-can-i-revert-my-gamma-site-back-to-a-document)
- [modes] Zoom control — not documented (unverified: absence)

## 6. Collaboration
- [collab] Permissions — View / Comment / Edit / No access; workspace settings override per-doc (https://help.gamma.app/en/articles/11047226-how-do-collaboration-and-sharing-settings-work-in-gamma)
- [collab] Real-time co-editing with visible cursors (https://help.gamma.app/en/articles/11594955-what-options-does-gamma-offer-for-teams-and-business; https://flowith.io/blog/gamma-app-2026-faq-custom-branding-export-pdf-ppt-collaboration/)
- [collab] Block-level comments + reactions (speech-bubble on hover); @mentions & resolve per third party; Slack DM notifications (https://openaimaster.com/how-to-use-gamma-app/; https://help.gamma.app/en/articles/15546622-can-i-use-gamma-with-slack) (mentions unverified officially)
- [collab] Workspaces — add/remove members, roles; SSO on Business (https://help.gamma.app/en/collections/12178919-accounts-workspaces-user-settings)
- [collab] Folders — all plans; no nesting; gamma in multiple folders; shared folders need workspace sharing on Team/Business (https://help.gamma.app/en/articles/15715069-how-do-i-use-folders-in-gamma)
- [collab] Workspace templates + template instructions — Pro/Ultra/Team/Business; "Add to my workspace" import (https://help.gamma.app/en/articles/12590858-how-do-i-use-workspace-templates)
- [collab] Public templates/inspiration gallery — gamma.app/templates (403 to fetcher; unverified)

## 7. Sharing / publishing
- [share] Public link with access levels; Share → Embed iframe (auto-updates, all plans; docs/decks only, not sites) (https://help.gamma.app/en/articles/11047806-can-i-embed-gamma-into-another-site)
- [share] Password protection — Share → Advanced → "Require a password"; **Pro+**, docs only (https://help.gamma.app/en/articles/11047226-how-do-collaboration-and-sharing-settings-work-in-gamma)
- [share] Hide "Made with Gamma" badge — Plus+ (same URL)
- [share] Publish as site — free `*.gamma.site` subdomain; custom domains Pro (10) / Ultra & Business (100); SSL; navbar (logo, 5 links, 2 buttons); favicon; per-page URL path; publish/unpublish per page (https://help.gamma.app/en/articles/8429268-how-do-i-create-publish-a-site-in-gamma; https://help.gamma.app/en/articles/11047478-how-do-i-set-up-customize-a-site-in-gamma)
- [share] SEO — page title/description; "Make discoverable on the web" indexing Pro/Ultra only; Google Analytics/GTM, Facebook Pixel (https://help.gamma.app/en/articles/11047720-what-does-indexing-mean-for-my-site; https://help.gamma.app/en/collections/12178914-websites-publishing)
- [share] Direct post to LinkedIn (https://help.gamma.app/en/articles/8022861-what-s-the-easiest-way-to-export-my-gamma)
- [share] Mobile app iOS/Android — view/generate/Agent-edit/present-remote/comment/analytics/export; no manual editing, no offline (https://help.gamma.app/en/articles/11016450-does-gamma-have-a-mobile-app)
- [share] Social share (OG) cards — not documented (unverified)

## 8. Analytics
- [analytics] Views, Unique Viewers (30d), % views per card, relative time per card, cards viewed; named viewers if logged in else Anonymous; Full-Access collaborators only; no export; **Pro+** (https://help.gamma.app/en/articles/11047329-how-do-i-track-my-gamma-s-performance-using-analytics)

## 9. Export
- [export] PDF, PPTX, PNG (all plans; watermark on Free); Google Slides via PPTX; fonts embed in PDF/PNG/PPTX; interactive elements (nested cards, embeds) flatten (https://help.gamma.app/en/articles/8022861-what-s-the-easiest-way-to-export-my-gamma; https://help.gamma.app/en/articles/15939201-why-doesn-t-my-exported-pdf-or-powerpoint-match-what-i-see-in-gamma)
- [export] No DOCX/Markdown/HTML export in official docs (openaimaster claims "text/PDF/HTML" — unverified)

## 10. Platform
- [platform] Generate API — POST /v1.0/generations, /from-template, GET status, themes, folders, images, export, analytics endpoints; exportAs pdf/pptx/png; OAuth; **Pro/Ultra/Teams/Business** keys (https://developers.gamma.app/llms-full.txt)
- [platform] Connectors — ChatGPT & Claude MCP connectors (all plans), Glean, Superhuman, Atlassian Rovo; Zapier, Make, n8n; Gamma MCP (https://help.gamma.app/en/articles/13943863-how-do-i-use-gamma-with-outbound-connectors-and-integrations)
- [platform] Inbound data connectors — Airtable, Atlassian, Fathom, Granola, HubSpot, Linear, Monday.com, Notion, Sentry, Slack, Stripe, Frontify (https://help.gamma.app/en/articles/15675394-how-do-i-use-gamma-with-inbound-connectors)
- [platform] Slack app — link previews, comment DMs, AI generation, channel-as-source (https://help.gamma.app/en/articles/15546622-can-i-use-gamma-with-slack)
- [platform] Version history — … menu → Version History; all plans incl. Free (https://help.gamma.app/en/articles/11048579-can-i-undo-a-change-or-restore-a-previous-version-in-gamma)
- [platform] Shortcuts — ⌘/Ctrl+Z, ⌘/Ctrl+E Agent, S spotlight, E quick edit, ⌘/Ctrl+Shift+O open nested, Shift+drag multi-select (various help URLs above)
- [platform] Offline — not supported; internet required (https://help.gamma.app/en/articles/11016450-does-gamma-have-a-mobile-app)
- [platform] AI training opt-out (individual plans default-on; Team/Business excluded); SSO + SOC 2 docs on Business (https://help.gamma.app/en/articles/12281928-does-gamma-use-my-content-to-train-its-ai-features; https://help.gamma.app/en/articles/11594955-what-options-does-gamma-offer-for-teams-and-business)
- [platform] Accessibility features — not documented (unverified)

## 11. Plan gating summary
- [plans] Free $0: 400 one-time credits, 10 cards, basic image models, watermark, PDF/PPTX/PNG (https://www.eesel.ai/blog/gamma-pricing)
- [plans] Plus ~$8–10/mo: 1,000 credits, 20 cards, advanced image models, no badge, Agent (https://www.eesel.ai/blog/gamma-pricing; https://help.gamma.app/en/articles/15002203-how-do-i-create-with-agent-in-gamma)
- [plans] Pro ~$15–20/mo: 4,000 credits, 50–60 cards, premium models, API, custom fonts, headers/footers, password, 10 domains, indexing, analytics, workspace templates, infographics, whole-doc translate (https://www.eesel.ai/blog/gamma-pricing; https://www.presentations.ai/blog/gamma-pricing; help articles above)
- [plans] Ultra $90–100/mo: 20,000 credits, 75 cards, top models, AI animations/video, Studio Mode, 100 domains (https://www.eesel.ai/blog/gamma-pricing; https://help.gamma.app/en/articles/13920980-how-do-i-add-animations-in-gamma)
- [plans] Team $20/seat (2 min): Pro + shared folders/admin/central billing, 6,000 credits; Business $40/seat (10 min): SSO, SOC 2 docs, advanced models, 10,000 credits, 100 domains (https://help.gamma.app/en/articles/11594955-what-options-does-gamma-offer-for-teams-and-business)

Key gaps I could not verify (marketing pages 403): exact built-in theme count, full chart-type list, native tabs/forms/polls, OG social cards, accessibility statement, official Pro card cap (50 vs 60).