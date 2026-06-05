# FEATURE_STATUS — runtime baseline audit (Cycle 1)

**Date:** 2026-05-31
**Branch:** `feat/scribe-ingestion-honcho`
**How:** real `react-router build` served on :3460, driven headless by
`Scripts/autorun/_drive.mjs` (login as Andy/god → open widget → screenshot).
**Backend:** REAL backend is LIVE on `localhost:3000` (Express). `API_BASE` resolves to
`http://localhost:3000` for the localhost build, so widgets hit the real backend. CORS is
`Access-Control-Allow-Origin: *`, so the cross-port (:3460 → :3000) fetches succeed.

Legend: ✅ works · ⚠️ renders-but-dead/empty/offline · ❌ broken

| # | Feature | Sidebar label | State | Runtime observation (screenshot in `cleanup-shots/`) |
|--:|---------|---------------|:-----:|------------------------------------------------------|
| 1 | Thought Weaver | Thought Weaver | ✅ | Capture tab renders; **Recent Captures shows a real backend-categorized item** ("buy milk tomorrow" → `admin` 95%). Backend `POST /api/thought-weaver/capture` returns `{success, filed_to:"admin", confidence:0.95, classification}`. `tw-open.png` · **Reports tab (Cycle 3): "Generate now" PRODUCES a daily report + weekly summary** (cards=2) from backend captures via local-first reportEngine; `insights=0` = correct no-LLM heuristic state. `tw-reports.png` |
| 2 | Honcho | Honcho | ✅ | **Cycle 4 FIXED** — was renders-but-dead: `+ Add Memory` POSTed to `/api/honcho/memories` which the backend 404s, so memories never showed. Added local-first `honchoMemoryStore` (per-user, `createLocalStorageStore`): Add Memory persists + renders even with the backend route offline. Runtime proof: card renders, persisted under `honcho:memories:<uid>`, header reads "1 memories" (`honcho-memory.png`). **Files arrange/filter VERIFIED** — seeded 3 converted entries → name-sort direction toggle reorders `zulu,mike,alpha → alpha,mike,zulu` (`honcho-files.png`). Hermes still offline (python agent down — correct state). |
| 3 | Stella Agent | Stella Agent | ✅ | **Cycle 5: Skills catalog VERIFIED + /hermes spawn FIXED.** Tool Catalog filter is client-side: typing "memory" narrows `15 → 2` (Honcho Memory, Memory Explorer), all match (`stella-skills.png`). **The break:** the intro tip + code comment say `/hermes <task>` "runs even when both [backend + LLM] are down", but the chat composer textarea + send button were `disabled` offline → the advertised `/hermes` command was structurally **unreachable** (renders-but-dead). **Fix:** composer always typeable; send enabled when the input is a `/hermes` command (ordinary chat still honestly gated offline). Runtime proof: offline, `typeable=true sendEnabled=true`, user msg + a rendered Hermes reply appear (`stella-hermes.png`). Backend `POST /api/stella/chat` still 405 = correct offline state for ordinary chat. |
| 4 | Astra Dashboard | Astra Dashboard | ⚠️ | **PM-exec dashboard renders cleanly** — panels: Portfolio Heatmap, Financial Quick-viz, Cross-Domain Snapshots, Watchdog List, Maintenance Queue, Litigation & Matters, Lease Expirations, Financial Snapshot. **All EMPTY** ("No … yet", NOI $0, Revenue $0). Tabs Dashboard/Workspace/Channels/Intel. This is the Cycle 10–11 UI target. `audit-astra.png` |
| 5 | ARA Console | ARA Console | ⚠️ | Opens "Chief of Staff" chat — greeting + composer render. Chat not yet exercised (likely backend/LLM-gated). `audit-ara.png` |
| 6 | Inbox Zero | Inbox Zero | ✅ | **Renders WITH real data** — Primary list shows billing invoice #4821 (Q1 Consulting Services), legal HOA notice, etc. Tabs + filters present. `audit-inbox.png` |
| 7 | Transcribe | Transcribe | ⚠️ | Recorder UI renders (00:00, Live Mic, Pick Audio File, Load Recent File, Transcript pane). No transcription exercised (needs mic/file). `audit-transcribe.png` |
| 8 | Fact Check | Fact Check | ⚠️ | "Fact-Check Log" renders with data: 50 claims, 0 verified, 0 disputed, 4% avg conf — all rows UNVERIFIABLE 0%. `+ Paste a claim` input + Check button present. Likely LLM-gated (low confidence = no verifier). `audit-fact.png` |
| 9 | Workspace | Workspace | ✅ | **Cycle 9 FIXED — drill-down reachable offline.** Was ❌: domaines (`/api/workspace/domaines`) + tree (`/api/file-explorer/tree`) both 404 with no backend → index dead-ended at "Failed to load domaines — HTTP 404", nothing to drill into. The drill-down logic + selectors were already correct but structurally unreachable (no data). **Fix:** local-first fallback (`workspaceLocalSeed.ts` + store `useLocalWorkspace()`/`offline` flag) loads a self-consistent sample workspace when the backend is absent, with an honest "local sample workspace" banner; successful real loads clear it. Runtime proof: `offline=true domaines=3 → projects=2 → threads=2`, back-nav project→domaine→index all navigate (`workspace-drilldown.png`). Read-only — structure mutations still need the backend. |
| — | Scribe ingestion | Scribe | ✅ | **Cycle 7 VERIFIED + harness fixed.** `scribe` substring collided with **Transcribe** — fixed `openWidget` to exact-match the glyph-stripped label first, so `scribe`→Scribe deterministically. Headless Chromium has no `window.showDirectoryPicker`, so the driver injects an in-memory fake picker (source = notes.html/readme.md/budget.csv; backup records writes) — only the OS picker is stubbed, the real `useIngestion→convertFolder→write` pipeline runs. **Runtime proof:** pick source `AutorunSource` + backup `AutorunBackup` → "Convert now" enabled → ran → `indexed=3`, `statuses=[converted,passthrough,queued-backend]` (html→md, .md passthrough, .csv deferred-to-backend), `writes=[notes.md,readme.md]` (backup actually received the Markdown; csv correctly NOT written), persisted to `scribe-ingestion:<uid>` (n=3). `scribe-ingest.png`. No production-source fix needed — wiring was correct; it had simply never been runtime-verified. |
| — | Hermes | (within Stella/Honcho) | ✅ | **Cycle 6 FIXED** — learning loop was renders-but-dead offline: HonchoHermesPanel delegate input/Run were `disabled={!hermesOnline}`, so with Ollama down you could never run → `recordRun` never fired → no 👍/👎 control. Fix: delegation reachable offline (runner is backend-independent + records every run) + result renders on graceful failure so the rating shows. Runtime proof: offline delegate → 👍 → `hermes:learning:<uid>` holds run with `rating===1` (`hermes-learning.png`). /hermes spawn from Stella fixed in Cycle 5. Status banner still honestly shows "Hermes Offline 💤". |
| — | Statute matching | (within Transcribe → Legal Shield) | ✅ | **Cycle 8 FIXED.** Lives in TranscriptionHub: the Legal Shield scan (LLM via `scanSegmentsViaLlm` → `buildMatchedStatutes`) extracts/normalizes/de-dupes O.C.G.A. sections and renders them with similarity + excerpt (`statuteMatch.ts`). **The break:** the scan only ran during LIVE mic transcription (moonshine / cloud-STT paths enqueued each new segment) — `loadTranscription` set the segments but NEVER queued a scan, so the matched-statute UI was permanently **dead for the review-a-saved-transcript flow** (the only non-mic way to get segments). **Fix:** `loadTranscription` now enqueues the loaded segment texts (same `length>15` gate as live) when Legal Shield is on; the scan effect drains the queue and only calls the LLM when a provider is active (no-op offline → correct). **Runtime proof:** seeded a saved transcript + active `local` LLM (only the LLM network call route-stubbed; extraction→render all real), loaded it from the Log tab → **2 matched-statute lists** rendered: lockout segment → `O.C.G.A. § 44-7-14` + `§ 44-7-7` both @**100%** (primary, code_ref), deposit segment → `§ 44-7-30` @**100%** + `§ 44-7-34` @**60%** (secondary, summary-only); 4 excerpts shown. `statute-match.png`. Proves similarity weighting + excerpt + multi-statute extraction + the reachability fix. |

## Cross-cutting findings
- **Every widget logs 4–7 `/api/* 404` console errors** on open. The backend on :3000 is
  missing several routes the widgets call (Workspace `domaines` is the visible one). These
  need per-feature triage — some are graceful (widget falls back / shows offline), some are
  hard failures (Workspace). **No JS crashes / no white screens** — every widget mounted.
- **Login + shell are rock-solid** at runtime (splash→Andy→passphrase→shell every run).
- **Hermes + Stella python agent is offline** in this environment → offline banners are the
  *correct* state, not a bug, as long as they're honest (they are).

## Honest summary
- **Genuinely working at runtime:** Thought Weaver (capture→categorize→file via backend),
  Inbox Zero (data renders).
- **Renders but needs a real action exercised / is empty / is correctly-offline:** Honcho,
  Stella, Astra, ARA, Transcribe, Fact Check.
- **Broken:** none outstanding (Workspace fixed at Cycle 9 — local-first fallback).

## Driver
`Scripts/autorun/_drive.mjs <widget-substring> <action> <out.png>` — reused every cycle.
Actions implemented so far: `open` (observe), `tw-capture` (type+capture+assert filed).
