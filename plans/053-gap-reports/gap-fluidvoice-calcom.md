# FluidVoice — gap analysis (Dwellium plan 047, "Dictation")

Generated 2026-08-23. Read-only audit. Dwellium paths are relative to
`/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell/src` unless absolute.
Upstream facts come only from URLs fetched during this audit (listed per row).

**Integration model: companion install (zero embed, zero server).** FluidVoice runs on the user's Mac and
types into whatever field is focused; Dwellium ships only (a) a Control Panel setup card and (b) a static
property-management vocabulary seed for FluidVoice's loopback dictionary API.

## 1. Upstream capabilities (FluidVoice, GPL-3.0, macOS menu-bar dictation)

Sources: README `https://github.com/altic-dev/FluidVoice` (raw: `https://raw.githubusercontent.com/altic-dev/FluidVoice/main/README.md`);
source tree `https://api.github.com/repos/altic-dev/FluidVoice/git/trees/main?recursive=1`;
`…/main/Sources/Fluid/Services/LocalAPI/LocalAPIRouter.swift`, `…/LocalAPIServer.swift`, `…/LocalAPIModels.swift`, `…/DictionaryAPIController.swift`.

| # | Feature | Evidence |
|---|---|---|
| F1 | On-device STT with multiple models: Nemotron Speech 3.5 (+Multilingual), Parakeet Flash/TDT v3/v2, Cohere Transcribe, Apple Speech, Whisper tiny→large | README "Supported Models" / "Features → Multiple Speech Models" |
| F2 | Global hotkey voice capture from any app | README "Features → Global Hotkey" |
| F3 | "Smart Typing" — text inserted into the focused field of any app via the Accessibility API | README "Features → Smart Typing"; "Requirements → Accessibility permissions for typing" |
| F4 | Fluid Intelligence — fully local AI enhancement (formatting, context-aware capitalization, post-processing); separate privately-maintained runtime, ~3.5 GB | README "Fluid Intelligence", "What's New in 1.6.0" |
| F5 | Optional cloud AI enhancement (OpenAI, Groq, custom provider); keys in macOS Keychain | README "Features → AI Enhancement", "Quick Start" |
| F6 | Write Mode — write/rewrite selected text in any text field | README "Features → Write Mode" |
| F7 | Command Mode — control the Mac by voice (launch apps, run shortcuts, system actions) | README "Features → Command Mode" |
| F8 | Per-App Configuration — different prompt sets per application | README "Features → Per-App Configuration" |
| F9 | Live Preview overlay (notch-aware, configurable sizes) | README "Features → Live Preview / Notch-Aware Overlay / Configurable Overlay" |
| F10 | Local recording/transcription history with budget controls + ZIP export; Today-Usage stats | README "Features → Audio History / Today-Usage Stats" |
| F11 | Multilingual dictation (per-model language tables) | README "Parakeet TDT v3 Languages", "Cohere Transcribe Languages", etc. |
| F12 | Custom dictionary: custom words `{text, weight?, aliases?}` + replacements `{triggers[], replacement}`; write modes `append`/`replace` (default append) | NOT in README. Source: `Sources/Fluid/UI/CustomDictionaryView.swift`, `Services/LocalAPI/DictionaryAPIController.swift` (structs `CustomWordsWriteRequest`, `ReplacementWriteRequest`, `enum WriteMode { append, replace }`) |
| F13 | Opt-in loopback HTTP API, default port **47733**, key `LocalAPIEnabled`, loopback-only, **no auth, no CORS**: `GET /v1/health`, `GET /v1/history`, `GET/POST /v1/dictionary/replacements`, `GET/POST /v1/dictionary/custom-words`, `POST /v1/transcribe`, `POST /v1/postprocess` | NOT in README. Source: `LocalAPIRouter.swift` (routes), `LocalAPIModels.swift` (`defaultPort = 47_733`, `"LocalAPIEnabled"`), `LocalAPIServer.swift` (`isLoopback` guard, "Local API listening on http://127.0.0.1:…") |
| F14 | Local-first privacy (voice/text never leave the Mac unless cloud AI opted in; anonymous analytics on by default, toggle in Settings), menu-bar app, auto-updates/beta channel, `brew install --cask fluidvoice`; macOS 15+, Apple Silicon (Intel = Whisper only) | README "Privacy & Analytics", "Quick Start", "Requirements", "Features → Menu Bar Integration / Auto-Updates / Local-First" |

Version/stars shown on README at fetch time: 1.6.0, 10.8k★ (plan 047 text says v1.6.9/10.7k — README drift, immaterial).

## 2. What Dwellium has

**Model:** companion (plan 047 "pattern 0 — zero Dwellium code" + one-off vocabulary seed). No widget, no iframe, no proxy, no backend code
(`grep -rni fluidvoice /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src` → no matches).

| File | What it does |
|---|---|
| `components/ControlPanel/DictationSection.tsx` (78 lines) | Setup card: title "Dictation (FluidVoice)"; 4-step install list (`brew install --cask fluidvoice`, grant Mic+Accessibility / Right-Option push-to-talk / Parakeet / "leave cloud AI off", seed vocabulary via Local API, disable Local API afterwards); **Copy vocabulary** button → `navigator.clipboard.writeText(JSON.stringify(buildVocabularyPayload()))`; copied/failed status text (lines 26-33, 59-74). |
| `data/fluidVoiceVocabulary.ts` (69 lines) | `FLUIDVOICE_VOCABULARY`: **32 entries** — 19 product/widget proper nouns (Dwellium, ARA, Strata, Scribe, Honcho, …), 10 PM-jargon terms (work order, move-in, HVAC, lease renewal, …), 3 seed community names (lines 23-59). `buildVocabularyPayload()` → `{entries, mode:'append'}` (lines 62-64, "ALWAYS append; never replace"). `SEED_COMMAND` = `pbpaste \| curl -s -X POST … http://127.0.0.1:47733/v1/dictionary/custom-words` (lines 67-68). Header lines 6-9: deliberately **no resident/vendor person names** (PII stays on the backend). |
| `components/ControlPanel/ControlPanel.tsx:11,604` | Mounts `<DictationSection />` after `<LlmIntegrationsSection />`. |
| `data/toolsHub.ts:36` | Tools-hub row `dictation`: `companion: true`, license "GPL-3.0 (FluidVoice, Mac companion install)", phase 1, `setupDoc:'dictation'`. `resolveToolStatus` line 56: `if (tool.companion) return 'ready'`. |
| `components/ToolsHub/ToolsHub.tsx:32` | Ready companion → `openWidget('control-panel')` (setup card lives there). |
| `content/guides/gettingStarted.ts:57,69` | Guide lists Dictation as Ready; "Control Panel → Dictation → install with one brew command, click Copy vocabulary…". |
| Adjacent, pre-existing native STT (not FluidVoice) | `components/ARAConsole/araDictation.ts` (Web Speech API mic in ARA composer only, P11-8); `components/TranscriptionHub/TranscriptionHub.tsx:434-439` (Moonshine local STT); `components/PersonaStudio/personaWhisperStt.ts` (Whisper-tiny ONNX in-browser fallback). |

**Env gates:** none (`toolsHub.ts:36` has no `envVar`; status is unconditionally `ready`).

**Tests (all passing — `npx vitest run` on the 4 files below → 21/21, run 2026-08-23):**
- `test/dictationSection.test.tsx` (3): renders heading + `brew install --cask fluidvoice` + seed URL + "types it into" note; Copy writes JSON with `mode==='append'` and `entries.length === FLUIDVOICE_VOCABULARY.length`, shows "Copied N terms"; clipboard rejection shows fallback text.
- `test/fluidVoiceVocabulary.test.ts` (5): non-empty entries; deduped (case-insensitive), no alias equals its own text; contains Dwellium/ARA/Strata/Honcho/Hermes/Scribe/work order/HVAC/lease renewal; payload mode append and JSON never contains "replace"; `SEED_COMMAND` targets `127.0.0.1:47733/v1/dictionary/custom-words`.
- `test/toolsHub.test.tsx` (relevant asserts): `dictation` is `companion:true` and `ready` with or without a widget (lines 48-51); clicking its row opens `control-panel` (lines 103-108).
- (`test/araDictation.test.ts` covers the ARA Web-Speech path, not FluidVoice.)

**UI entry points:** Tools hub row "Dictation" (status Ready → Open → Control Panel); Control Panel section "Dictation (FluidVoice)"; Guide bullet. No widget id (by design).

**Production status (https://argyleholocron.netlify.app, HTTP 200 via `curl -sI` 2026-08-23):** Tools hub shows Dictation = **Ready** (companion rule). Whether FluidVoice is installed on Andy's Mac is outside the app's knowledge — "Ready" means the Dwellium-side card shipped, not that dictation works.

**Plan-047 drift worth knowing:** plan step 3 (`scripts/fluidvoice-vocab.mjs` reading live property/resident/vendor names from the authenticated backend) was replaced by the static, PII-free seed above; step 4 (Chrome per-app prompt set) is not surfaced in the card; step 5 landed as a separate `DictationSection.tsx` instead of a paragraph in `LlmIntegrationsSection.tsx`; phase-3 `useGlobalDictationHotkey.ts` (non-Mac hotkey port) does not exist (`find src -iname '*globalDictation*'` → none).

## 3. Gap table

Legend: ✅ available through the integration · 🟡 partial · ❌ not available · ➖ intentionally out of scope

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| F1 On-device multi-model STT | ✅ | Companion app on the Mac; card recommends Parakeet (`DictationSection.tsx:49`) | Requires macOS 15+/Apple Silicon; Intel = Whisper only. Non-Mac users: ❌ (see F3) |
| F2 Global hotkey capture | ✅ | User sets hotkey in FluidVoice; card suggests Right-Option push-to-talk (line 49) | Dwellium cannot know/record the hotkey; no in-app hint near fields |
| F3 Smart Typing into any focused field (Accessibility API) | ✅ | Works on every Dwellium input (ARA composer, Scribe, Inbox, Strata notes) with zero Dwellium code | The core of the integration. Plan-047 phase-3 web hotkey port for Windows/Linux users not built; ARA composer mic (`araDictation.ts`) is the only native field-level dictation |
| F4 Fluid Intelligence local enhancement | ✅ | Chosen during FluidVoice onboarding | Not mentioned in the card (card only says "leave cloud AI off") |
| F5 Cloud AI enhancement (OpenAI/Groq) | ✅ (available; discouraged) | User opt-in in FluidVoice | Card explicitly advises off (line 49) — privacy stance; no Dwellium key sharing |
| F6 Write Mode (rewrite selected text) | ✅ | Works in any Dwellium field | Not mentioned in card/Guide |
| F7 Command Mode (voice-control the Mac) | ➖ | n/a | Controls macOS, not Dwellium; no Dwellium relevance |
| F8 Per-App Configuration (prompt sets per app) | 🟡 | Available in FluidVoice Settings; user-driven | Plan step 4 (a Chrome "property-management assistant" prompt set) is not provided or documented in the card |
| F9 Live Preview overlay | ✅ | FluidVoice UI | — |
| F10 History + ZIP export, usage stats | ✅ | FluidVoice UI | Card step 4 tells users to disable Local API because `/v1/history` is exposed to local processes (lines 56) — correct per `LocalAPIServer.swift` (no auth) |
| F11 Multilingual models | ✅ | Model choice in FluidVoice | Seed vocabulary is English-only |
| F12 Custom dictionary (custom words + replacements) | 🟡 | **Custom words** seeded: 32 static terms, append-only, via clipboard + `SEED_COMMAND` (`fluidVoiceVocabulary.ts:23-68`); payload shape matches upstream `CustomWordsWriteRequest` (`entries[{text,weight?,aliases?}]`, `mode:'append'`) | **Replacements** (`/v1/dictionary/replacements`, plan step 3 "casing/sign-off") not seeded; no live property/unit/resident/vendor names (deliberate PII choice, header lines 6-9); seed is manual (copy → enable Local API → run curl), not one click |
| F13 Local HTTP API (`/v1/transcribe`, `/v1/postprocess`, `/v1/history`, `/v1/health`) | ➖ (only `/v1/dictionary/custom-words` is used, indirectly via curl) | n/a | Intentional: server is loopback-only, no CORS, no auth (`LocalAPIServer.swift`); the https app cannot call it from the browser (mixed content + no CORS), and the card tells users to switch it off after seeding |
| F14 Local-first privacy, menu bar, auto-update, brew install | ✅ | Card gives `brew install --cask fluidvoice` + permission steps (lines 46-49) | — |

## 4. Parity numbers

Rows: 14. ✅ = 10 (F1, F2, F3, F4, F5, F6, F9, F10, F11, F14) · 🟡 = 2 (F8, F12) · ❌ = 0 · ➖ = 2 (F7, F13).

(a) **Feature coverage once installed (Mac user):**
- Strict (✅ only): 10 / 14 = **71 %**; against in-scope rows (14 − 2 ➖ = 12): 10 / 12 = **83 %**.
- Counting 🟡 as ½: (10 + 1) / 14 = **79 %**; in-scope: 11 / 12 = **92 %**.
- For a non-Mac user the number is **0 %** (F1–F14 all require the Mac app).

(b) **Native in Dwellium (reimplemented inside the app):** 0 / 14 = **0 %** of FluidVoice's features are reimplemented.
If one generously counts the pre-existing ARA mic button + in-browser Moonshine/Whisper-tiny STT as half-credit toward F1 and F3 (field-specific, no hotkey, no system-wide typing): (0.5 + 0.5) / 14 ≈ **7 %**.
Dwellium-authored code for this integration: 78 + 69 lines (card + seed) — glue, not a reimplementation.

## 5. What it would take to close each 🟡/❌ (one line, effort)

- **F8 per-app prompt set (🟡):** add a fourth card step + a "Copy Chrome prompt" button with the plan-047 step-4 prompt text; pure UI — **S**.
- **F12 replacements + live vocabulary (🟡):** add `REPLACEMENTS` array + second copy button posting to `/v1/dictionary/replacements` (S); optional authenticated backend export (`GET /api/fluidvoice/vocab` → community/unit names only, still no person names) so the seed follows real data — **M** (needs Ilya sign-off on PII scope).
- **F3 non-Mac users (gap, not a row):** plan-047 phase-3 `useGlobalDictationHotkey.ts` (~50 lines reusing `araDictation.ts`, mount in `app/root.tsx`, pref in `araPrefsStore.ts`) — **S/M**.
- **Install-state awareness (gap):** Dwellium cannot detect FluidVoice; a "Test dictation" textarea in the card would at least let users confirm it works — **S**.

## 6. Verification

```bash
# Dwellium files + tests
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell"
sed -n 23,68p src/data/fluidVoiceVocabulary.ts           # 32 entries, mode 'append', SEED_COMMAND
grep -n "DictationSection" src/components/ControlPanel/ControlPanel.tsx   # :11 import, :604 mount
sed -n 36p src/data/toolsHub.ts; sed -n 56p src/data/toolsHub.ts          # companion:true → 'ready'
npx vitest run src/test/dictationSection.test.tsx src/test/fluidVoiceVocabulary.test.ts src/test/toolsHub.test.tsx
find src -iname '*globalDictation*'                        # empty → phase-3 hook not built
grep -rni fluidvoice /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src   # empty → no backend code
# Upstream
open https://github.com/altic-dev/FluidVoice            # README: Features, Requirements, License (GPLv3 from 2026-02-23)
curl -s https://raw.githubusercontent.com/altic-dev/FluidVoice/main/Sources/Fluid/Services/LocalAPI/LocalAPIRouter.swift | grep -n '"/v1/'
curl -s https://raw.githubusercontent.com/altic-dev/FluidVoice/main/Sources/Fluid/Services/LocalAPI/LocalAPIModels.swift | grep -n -E "47_733|LocalAPIEnabled"
# On Andy's Mac after seeding (plan 047 verify step)
curl -s http://127.0.0.1:47733/v1/health; curl -s http://127.0.0.1:47733/v1/dictionary/custom-words | jq .count   # expect 32 (+ any pre-existing)
```

---

# Cal.com / "Cal.DIY" — gap analysis (Dwellium plan 047, "Scheduling")

**Naming, verified:** `https://github.com/calcom/cal.com` now serves the **Cal.diy** README ("a fork of Cal.com with all
enterprise/commercial code removed … Teams, Organizations, Insights, Workflows, SSO/SAML … removed"; "licensed under the MIT License")
— i.e. the GitHub repo was renamed/redirected to `calcom/cal.diy`, as plan 047 §"Cal.DIY" says. The **integration does not self-host
cal.diy**: per the plan's 2026-08-20 zero-cost addendum (`plans/047-…md:502-517`) it embeds a **hosted cal.com free individual plan**
booking page. Upstream capabilities below are therefore taken from the repo README **and** cal.com's hosted pricing/docs pages, and each row
says which surface it applies to.

## 1. Upstream capabilities

Sources: `https://github.com/calcom/cal.com` (→ Cal.diy README; raw `https://raw.githubusercontent.com/calcom/cal.diy/main/README.md`);
`https://cal.com/pricing`; `https://cal.com/docs` (API v2 intro); `https://cal.com/docs/llms.txt` (docs index);
`https://cal.com/docs/developing/guides/automation/webhooks.md`; `https://cal.com/docs/developing/guides/embeds/embed-events.md`.

| # | Feature | Evidence |
|---|---|---|
| C1 | Public booking pages; unlimited event types & calendars (free plan: "1 user", "Unlimited event types & calendars") | pricing |
| C2 | Availability/schedules, timezone detection, conflict checking, cancellation/rescheduling, private links, booking calendar/list view | pricing (free plan bullets) |
| C3 | Calendar integrations — Google Calendar, Microsoft Graph/Office 365, Apple, CalDAV (two-way sync) | Cal.diy README "Integrations"; pricing "Calendar syncing (Google, Outlook, Apple…)" |
| C4 | Video conferencing — Google Meet, Zoom, Daily/Cal Video, Teams, Webex | Cal.diy README; pricing |
| C5 | Embeds — embed.js / `@calcom/embed-react`; inline & popup; the embed is an iframe with postMessage events (`__iframeReady`, `__dimensionChanged`, …) | docs embed-events ("the embedded iframe"); Cal.diy README "Embed SDK" |
| C6 | Webhooks — UI (Settings → Developer → Webhooks) or API; triggers incl. `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`, `BOOKING_REJECTED`, `MEETING_ENDED`, `FORM_SUBMITTED`…; HMAC header `x-cal-signature-256`; free plan lists "Basic analytics and webhooks" | docs webhooks; pricing |
| C7 | REST API v2 — auth via OAuth / API key / Platform; endpoints for event-types, bookings, slots, schedules, calendars, webhooks; 120 req/min per API key | docs API v2 intro; docs index (`api-reference/v2/*`) — **note:** pricing lists "Custom APIs" as Teams-only; whether the free plan issues API keys was **not verifiable** from the fetched pages |
| C8 | Email & SMS notifications to booker/host (free plan: "Email & SMS notifications") | pricing |
| C9 | Booking questions / custom fields | pricing ("custom questions"); Cal.diy README |
| C10 | Payments at booking — "Accept Stripe & PayPal payments" (free plan) | pricing; docs index `api-reference/v2/stripe/*` |
| C11 | CRM & business integrations — "Two-way Salesforce & HubSpot sync", Pipedrive, Zoho, Basecamp; "Integrate with 100+ apps"; 1-click Calendly import | pricing; Cal.diy README |
| C12 | Teams/Orgs-tier features on hosted: round-robin, collective & managed events, recurring events, routing forms, workflows/automation, booking analytics, branding removal, custom domain, SSO/SCIM ("$12 per user/month" Teams, "$28" Orgs) | pricing; (in Cal.diy these EE features are removed per README) |
| C13 | Self-hosting — Docker images `calcom/cal.diy`, docker-compose, Node ≥18 + PostgreSQL ≥13, env `DATABASE_URL`/`NEXTAUTH_SECRET`/`CALENDSO_ENCRYPTION_KEY`/`NEXT_PUBLIC_WEBAPP_URL`; "No license key required"; 100 % MIT | Cal.diy README "Deployment/Docker", "What's different", "License" |
| C14 | Mobile app + browser extension; i18n/translations | pricing ("Mobile App", "Browser Extension"); Cal.diy README "Translations" |

## 2. What Dwellium has

**Model:** **embedded iframe** of one cal.com booking-page URL (no embed.js, no SDK, no proxy, no backend).
`Scheduling.tsx:5-10` header: plain iframe chosen because cal.com booking pages ship no `X-Frame-Options`/`frame-ancestors`
(re-checked 2026-08-23: `curl -sI -L https://cal.com/peer` → 200 with neither header) and the official embed.js is itself an iframe.

| File | What it does |
|---|---|
| `components/Scheduling/Scheduling.tsx` (72 lines) | `calcomUrl(env)` reads/trims `VITE_CALCOM_URL` (lines 20-23). Unset → "Connect Cal.com" needs-setup card: copy, `https://cal.com/signup` link, "Open Tools hub" button (`openWidget('tools-hub')`) (lines 28-54). Set → header with "Open ↗" (new tab) + `<iframe src={url} title="Scheduling booking page" allow="clipboard-read; clipboard-write">` (lines 56-71). |
| `components/Scheduling/Scheduling.css` | Layout/theme tokens only; `.scheduling__frame` fills the window. |
| `registry/widgetRegistry.ts:805-819` | Widget id **`scheduler`**, label "Scheduling", icon `calendar-days`, tier `tools`, category `tools`, lazy import of `Scheduling`, min 520×600; tip "Book a test slot on your own page, then check it landed in Google Calendar." |
| `data/hierarchy.ts:32-33` | Dock row `dock-scheduler` (pinned, group "Property Management"). |
| `data/toolsHub.ts:37-38` | Row `scheduling`: license "MIT (Cal.com, hosted free plan)", phase 2, `widgetId:'scheduler'`, **`envVar:'VITE_CALCOM_URL'`**, `setupDoc:'scheduling'`; `resolveToolStatus` lines 57-59: widget registered + env unset → `needs-setup`; env set → `ready`. |
| `components/ToolsHub/ToolsHub.tsx:29-34,56-64` | `needs-setup` → "Set up" button opens the Guide; `ready` → "Open" → `openWidget('scheduler')`. |
| `content/guides/gettingStarted.ts:63` | Guide table row: "**Scheduling** (Cal.com) — Showings and vendor visits booked from a link — A free cal.com booking page + `VITE_CALCOM_URL`". |
| Backend | **None.** `grep -rni "calcom\|cal\.com\|cal\.diy" /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src` → no matches. `src/routes/calendarRoutes.ts` is **Google Calendar** (GET `/status`, GET/POST `/events` over `calendarService` → google.calendar v3), not cal.com. |
| Dependencies | `package.json` has **no** `@calcom/embed-react` (plan step 7 not done; intentionally avoided — see header comment). |

**Env gate:** `VITE_CALCOM_URL` (frontend build-time, Netlify). Not present in `netlify.toml`/`.env.example` (grep empty) — it is expected to be set in the Netlify UI.

**Tests (passing, 2026-08-23):**
- `test/schedulingWidget.test.tsx` (3): `calcomUrl` → undefined for unset/blank, trimmed URL when set; registry has `scheduler` with label "Scheduling"/icon `calendar-days`; env unset renders "Connect Cal.com", signup link href `https://cal.com/signup`, no iframe, and the button dispatches `dwellium:open-widget` → `tools-hub`; env set renders iframe `src`=URL and "Open ↗" href=URL, no card.
- `test/toolsHub.test.tsx` (relevant asserts): `scheduling` is `needs-setup` with empty env (lines 53-60, 91-93) and `ready` with `VITE_CALCOM_URL` set (lines 65-69); "Set up" opens the Guide (lines 94-98).

**UI entry points:** widget `scheduler` (dock "Scheduling", ⌘K); Tools hub row "Scheduling"; Guide table row. No Strata Calendar card, no Tenant Portal embed, no ARA tools (plan steps 6, 10, 11 not built — `grep -rn scheduler src/components/StrataDashboard src/components/TenantPortal` → none).

**Production status (https://argyleholocron.netlify.app, HTTP 200):** Tools hub shows Scheduling = **Set up** (`needs-setup`) because `VITE_CALCOM_URL` is not set on Netlify; opening the widget shows the "Connect Cal.com" card. Nothing is bookable in Dwellium today. (Netlify env was not inspected directly in this audit; status as reported by the parent and consistent with the code path.)

## 3. Gap table

Legend: ✅ available through the integration (once `VITE_CALCOM_URL` is set) · 🟡 partial · ❌ not available · ➖ intentionally out of scope

| Upstream feature | In Dwellium today | How | Gap / note |
|---|---|---|---|
| C1 Booking pages / unlimited event types | ✅ | iframe of the URL in `VITE_CALCOM_URL` (`Scheduling.tsx:64-69`) | One URL only. Point it at the **user page** (`https://cal.com/<user>`) to expose all event types; an event-type URL (the card's example `…/unit-showing`) exposes one. Event types are created in cal.com's UI, not in Dwellium |
| C2 Availability, timezone, conflict checks, cancel/reschedule, private links | ✅ | Rendered by cal.com inside the iframe; cancel/reschedule via cal.com emails | Availability is edited on cal.com, not in Dwellium; "Open ↗" goes to the booking page, not to cal.com settings |
| C3 Calendar sync (Google/Outlook/Apple/CalDAV) | 🟡 | Configured in cal.com; bookings land in Andy's Google Calendar, which Dwellium already reads via `calendarRoutes.ts` GET `/api/calendar/events` (Strata Calendar card) | Indirect only; no cal.com → Dwellium record, no unit/property mapping, no One Save object (plan step 5) |
| C4 Video conferencing links | ✅ | Booker receives the link from cal.com | Likely unused for showings; nothing needed |
| C5 Embeds (embed.js / embed-react, theme, prefill, events) | 🟡 | Plain `<iframe>` — functionally the same page the official embed renders | No `theme:'dark'`, no prefill (tenant name/email), no `bookingSuccessful`-style callbacks, no auto-resize; embed-react (plan step 7-8) deliberately not added |
| C6 Webhooks (`BOOKING_CREATED`…, `x-cal-signature-256`) | ❌ | — | Free plan lists webhooks, but Dwellium has **no receiver**: plan step 5 (`router.post('/cal')` in `webhookRoutes.ts`, HMAC verify, UPSERT One Save booking, maintenance → Task Board card) not built; backend grep empty |
| C7 REST API v2 (slots/bookings/event-types) | ❌ | — | Plan step 4 (`calBookingRoutes.ts` → `/api/cal/*` proxy with `CAL_API_KEY`) and step 6 (ARA tools `cal.findSlots`/`cal.book`) not built. Also: free-plan API-key availability unverified (pricing lists "Custom APIs" under Teams) — addendum: "API-dependent bridges deferred" |
| C8 Email & SMS notifications | ✅ | Sent by cal.com | — |
| C9 Booking questions / custom fields | ✅ | Configured on cal.com, shown in iframe | Answers are not read back into Dwellium (needs C6/C7) |
| C10 Payments (Stripe/PayPal) | ✅ | In iframe if configured on cal.com | Not a PM use case; no Dwellium ledger link |
| C11 CRM / 100+ apps / Calendly import | ➖ | — | Upstream-only integrations; Dwellium has no cal.com bridge and its own resident/vendor data; out of scope for plan 047 |
| C12 Teams/Orgs tier (round-robin, collective, recurring, routing forms, workflows, branding removal, custom domain) | ➖ | — | Paid ($12/$28 per user/mo); zero-cost addendum locks the 1-seat free plan; also removed from Cal.diy |
| C13 Self-hosting (Docker, MIT, no license key) | ➖ | — | Plan 047 original "Tools VM + cal.dwellium.com" path explicitly killed by the addendum ("G3 (paid Tools VM) is dead"); plan hosting steps 1-2 dropped |
| C14 Mobile app / browser extension / i18n | ✅ (upstream, outside Dwellium) | User installs cal.com mobile app; booking page i18n is cal.com's | No Dwellium touchpoint |

## 4. Parity numbers

Rows: 14. ✅ = 7 (C1, C2, C4, C8, C9, C10, C14) · 🟡 = 2 (C3, C5) · ❌ = 2 (C6, C7) · ➖ = 3 (C11, C12, C13). (7 + 2 + 2 + 3 = 14.)

(a) **Feature coverage once configured (`VITE_CALCOM_URL` set):**
- Strict (✅ only): 7 / 14 = **50 %**; against in-scope rows (14 − 3 ➖ = 11): 7 / 11 = **64 %**.
- Counting 🟡 as ½: (7 + 1) / 14 = **57 %**; in-scope: 8 / 11 = **73 %**.
- **Today in production: 0 %** (env unset → needs-setup card; no booking surface).

(b) **Native in Dwellium:** 0 / 14 = **0 %**. `Scheduling.tsx` is a 72-line env-gated iframe shell; no scheduling logic (slots, availability, bookings) exists in Dwellium. The only Dwellium-native calendar code is Google Calendar list/create (`calendarRoutes.ts`, Strata Calendar module) — adjacent, not a cal.com reimplementation.

## 5. What it would take to close each 🟡/❌ (one line, effort)

- **C5 embed fidelity (🟡):** swap `<iframe>` for the official embed snippet or `@calcom/embed-react` with `config={{theme:'dark', name, email}}` and an `on('bookingSuccessful')` listener → toast/activity log; one MIT dep — **S**.
- **C3 calendar bridge (🟡):** reuse existing `GET /api/calendar/events` to show "upcoming cal.com bookings" under the iframe (filter by event-type slug in the title) — **S**; true per-unit mapping needs C6 — **M**.
- **C6 webhooks (❌):** `router.post('/cal')` in `webhookRoutes.ts` (HMAC `x-cal-signature-256` with `CAL_WEBHOOK_SECRET`, UPSERT One Save `{calBookingUid,…}`, maintenance → Task Board card) + create the webhook in cal.com Settings → Developer; jest `calWebhook.test.ts` — **M** (prereq: public webhook URL; plan says `/api/webhooks/cal` via existing Netlify `/api/*` proxy).
- **C7 API proxy + ARA tools (❌):** `calBookingRoutes.ts` (`/api/cal/slots|bookings|event-types`, Bearer `CAL_API_KEY`, `cal-api-version` header) behind `authenticate`+`requireRole('management')`; register `cal.findSlots`/`cal.book` ARA tools — **M**; **blocker:** first confirm the free plan issues API keys (Settings → Developer → API keys) — if not, this stays deferred per addendum.
- **Production activation (not a feature gap):** set `VITE_CALCOM_URL` in Netlify and redeploy — **S**, no code change (`toolsHub.test.tsx:65-69` proves the flip).

## 6. Verification

```bash
# Dwellium
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell"
sed -n 20,23p src/components/Scheduling/Scheduling.tsx; sed -n 64,69p src/components/Scheduling/Scheduling.tsx   # env read + iframe
sed -n 805,819p src/registry/widgetRegistry.ts; sed -n 38p src/data/toolsHub.ts                                  # 'scheduler' + envVar
grep -n calcom package.json || echo "no @calcom dep"
npx vitest run src/test/schedulingWidget.test.tsx src/test/toolsHub.test.tsx
grep -rni "calcom\|cal\.com\|cal\.diy" /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src || echo "no cal.com backend code"
grep -n "router\.\(get\|post\)" /Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager/src/routes/calendarRoutes.ts   # Google Calendar only
# Production
curl -sI https://argyleholocron.netlify.app | head -1          # HTTP/2 200
# (Netlify UI) Site settings → Environment variables → VITE_CALCOM_URL absent → Tools hub "Set up"
# Upstream
curl -sI -L https://cal.com/peer | grep -i -E "x-frame-options|frame-ancestors" || echo "booking page is iframe-able"
open https://github.com/calcom/cal.com      # redirects to Cal.diy README (MIT, EE removed)
open https://cal.com/pricing                # Free: 1 user, unlimited event types, webhooks; Teams: routing forms, recurring, "Custom APIs"
open https://cal.com/docs/developing/guides/automation/webhooks.md   # triggers + x-cal-signature-256
```
