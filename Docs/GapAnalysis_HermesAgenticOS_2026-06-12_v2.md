# Gap Analysis v2 — "Hermes Agentic OS" vs Dwellium (post-P12)

**Date:** 2026-06-12, after the P12 gap-closure arc. Same benchmark as v1 (`GapAnalysis_HermesAgenticOS_2026-06-12.md`: Jack Roberts video, full transcript). Every Dwellium status below re-verified against the working tree at HEAD `e0cc741` (frontend) / `d795176` (backend) — files greped, commits inspected, not recalled.

## Where v1 stood vs where v2 stands

| # | Video feature | v1 status | **v2 status** | Evidence |
|---|---|---|---|---|
| 1 | Unified hub | ✅ HAVE | ✅ HAVE | unchanged |
| 2 | Embedded chat + history | ✅ HAVE | ✅ HAVE | unchanged |
| 3 | Dreaming function (re-reads everything) | 🟡 memories-only, no schedule | ✅ **HAVE** — wide corpus (memories + agent exchanges + goals + captures + artifacts + usage) on the 6-h dream AND a once-per-calendar-day deep cycle | `dailySynthesis.ts`, runner `deepCycle` (`aaad330`); live-fired on real data |
| 4 | Morning brief | ❌ GAP | ✅ **HAVE** — daily brief (insights + suggestions + data lines), 🌅 banner → ARA delivery, 30-day retention, works key-less for data lines | `morningBriefStore.ts`, `MorningBriefBanner.tsx` (`aaad330`); live-verified 3-insight brief |
| 5 | Per-persona preferred model | 🟡 no model preference | ✅ **HAVE** — `Persona.preferredModel` flows through all 4 orchestrator invoke sites; `applyModelPreference` in llmClient with honest fallback; Agent Lab picker (built-ins editable) | `c4b9175` (10 preferredModel sites across personas/AgentLab/ARAConsole) |
| 6 | AI spend dashboard | ❌ GAP | ✅ **HAVE** — every `callLlm` completion recorded (provider/model/est. tokens/est. $), daily rollups, plan advice; AiSpend widget | `llmUsageStore.ts`, `AiSpend/` (`d36b64c`) |
| 7 | Mission Control goals | ❌ GAP | ✅ **HAVE** — "new goal …" → brief + agent-actions vs your-role + clarifying Qs; "refine goal …: answers" regenerates; widget tracks progress; plans auto-filed as artifacts | `goalsStore/goalPlanner/MissionControl` (`b8bad41`) |
| 8 | Connections panel | 🟡 scattered | ✅ **HAVE** — one pane: 5 LLM providers + search + Supabase + Postgres + Google + backend + knowledge graph, live status chips, deep-links | `ConnectionsPanel.tsx` (`2d9503a`) |
| 9 | Memory stack overview + edit agent memory | 🟡 no pane, no editing | ✅ **HAVE** — live counts across 8 knowledge stores + **Agent Context** editor injected silently into every ARA chat | same pane; `agentContextStore.ts` |
| 10 | Artifact library | 🟡 file-centric only | ✅ **HAVE** — ARA/skill outputs auto-captured (type detection, auto title + summary), gallery with filter/search/preview/pin/delete | `artifactStore.ts`, `ArtifactGallery/` (`74ed175`) |
| 11 | Code graph (graphify) | ✅ HAVE, broader | ✅ HAVE, broader | unchanged (`3aef7e7`/`a315c4e`) |
| 12 | Scheduled tasks that execute | 🟡 UI only, nothing fires | ✅ **HAVE** — schedules persist server-side, 60-s loop fires due slots through the same audited /run path; claim-before-run; jest 8/8 on due-logic | `automationScheduler*.ts` (`d795176` + `d7d0963`) |
| 13 | Onboarding / ROI-per-skill | ❌ skipped | ❌ skipped by choice (single-user app; client-onboarding feature) | — |
| 14 | Obsidian / Pinecone connectors | ❌ N/A | ❌ N/A by choice (our stack: Supabase/Postgres/Google + FS-is-truth) | — |
| 15 | Install-prompt packaging | ❌ N/A | ❌ N/A (their sales packaging, not a capability) | — |

## Verdict

**12 of 12 applicable features: HAVE.** Every real gap from v1 closed in one day (P12-1…8). The three ❌ remaining are deliberate non-goals, not gaps. Dwellium now exceeds the video's system on every axis it demonstrated — and the video has no equivalent of Strata, Scribe, TranscriptionHub + Speaker Library, the NL UI Editor, spaces/tab-groups, or One Save.

## Honest residuals (small, known, not feature gaps)

1. **Dreaming is "first tick of the day," not a true overnight daemon** — the app must be open for the cycle to fire (browser runtime). A real 3 a.m. dream needs a backend cron leg (the automation scheduler could host it).
2. **Spend ledger meters `callLlm` only** — ARA's backend-routed chats (`/api/ara/chat`) aren't counted yet; costs are estimates (chars→tokens→price table), not provider-reported usage.
3. **Goal planning is one-shot + refine**, deliberately simpler than the video's multi-turn intake.
4. **Scheduler unattended fire** is unit-tested (jest 8/8) + routes live-verified, but no real automation has been blind-fired end-to-end — set one to hourly and watch the audit log.
5. **Artifact capture** covers ARA chat outputs, skills, and goal plans; Stella/orchestrator outputs flow in only via the skills they call.

If you want any residual closed, say the word — #1 (backend dream cron) and #2 (meter the ARA backend leg) are each well under an hour.
