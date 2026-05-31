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
| 1 | Thought Weaver | Thought Weaver | ✅ | Capture tab renders; **Recent Captures shows a real backend-categorized item** ("buy milk tomorrow" → `admin` 95%). Backend `POST /api/thought-weaver/capture` returns `{success, filed_to:"admin", confidence:0.95, classification}`. `tw-open.png` |
| 2 | Honcho | Honcho | ⚠️ | Renders "Honcho + Hermes — Memory & Intelligence · 0 memories · Hermes Offline". Tabs Memory/Dreams/Hermes/Agents/Graph/Files. "No memories yet." + `+ Add Memory`. **Add Memory not yet exercised.** Hermes offline (python agent down). `audit-honcho.png` |
| 3 | Stella Agent | Stella Agent | ⚠️ | Renders 8 tabs (Chat/Honcho/Hermes/Skills/Memory/Cron/MCP/Voice). **Honest offline banner**: "Stella agent is offline — requires the Stella Python agent service, OR configure a personal LLM in Settings → API Keys." Backend `POST /api/stella/chat` → 405. Correct offline behavior; no LLM key configured in headless run. `audit-stella.png` |
| 4 | Astra Dashboard | Astra Dashboard | ⚠️ | **PM-exec dashboard renders cleanly** — panels: Portfolio Heatmap, Financial Quick-viz, Cross-Domain Snapshots, Watchdog List, Maintenance Queue, Litigation & Matters, Lease Expirations, Financial Snapshot. **All EMPTY** ("No … yet", NOI $0, Revenue $0). Tabs Dashboard/Workspace/Channels/Intel. This is the Cycle 10–11 UI target. `audit-astra.png` |
| 5 | ARA Console | ARA Console | ⚠️ | Opens "Chief of Staff" chat — greeting + composer render. Chat not yet exercised (likely backend/LLM-gated). `audit-ara.png` |
| 6 | Inbox Zero | Inbox Zero | ✅ | **Renders WITH real data** — Primary list shows billing invoice #4821 (Q1 Consulting Services), legal HOA notice, etc. Tabs + filters present. `audit-inbox.png` |
| 7 | Transcribe | Transcribe | ⚠️ | Recorder UI renders (00:00, Live Mic, Pick Audio File, Load Recent File, Transcript pane). No transcription exercised (needs mic/file). `audit-transcribe.png` |
| 8 | Fact Check | Fact Check | ⚠️ | "Fact-Check Log" renders with data: 50 claims, 0 verified, 0 disputed, 4% avg conf — all rows UNVERIFIABLE 0%. `+ Paste a claim` input + Check button present. Likely LLM-gated (low confidence = no verifier). `audit-fact.png` |
| 9 | Workspace | Workspace | ❌ | **"Failed to load domaines — HTTP 404" + Retry.** Domaine list fetch hits a backend route that 404s. Drill-down (Domaine→Project→Thread) blocked at step 1. `audit-workspace.png` |
| — | Scribe | Scribe | ⏳ | NOT isolated yet — `scribe` regex matched **Transcribe** first. Needs exact-label match next cycle. |
| — | Hermes | (within Stella/Honcho) | ⚠️ | "Hermes Offline" everywhere — python agent down. /hermes spawn untested. |
| — | Statute matching | (within Scribe) | ⏳ | Not reached yet. |

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
- **Broken:** Workspace (domaines 404).

## Driver
`Scripts/autorun/_drive.mjs <widget-substring> <action> <out.png>` — reused every cycle.
Actions implemented so far: `open` (observe), `tw-capture` (type+capture+assert filed).
