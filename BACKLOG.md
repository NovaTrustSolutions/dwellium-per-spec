# Dwellium — Backlog (deferred, agreed work)

Things we've explicitly decided to do *later*. Newest first.

---

## ☐ Optimization & ease-of-use sweep — *added 2026-06-10 (UI/skills/theme session)*

Unfinished items surfaced across the Fey-UI, ARA/skills, Hermes, and Terminal·BL4 arcs. Grouped by urgency.

### 🔴 Blockers before the next push
- ✅ **RESOLVED 2026-06-11 — Linux baselines recaptured.** Workflow run 27323324840 on `feat/scribe-ingestion-honcho`; 8 new `*-chromium-linux.png` merged at `6ae2611` (auto-PR step failed per known repo permission gap; manual side-branch merge as documented). **Parity Gate run 27323591499 = SUCCESS on the branch** — tsc + vitest + both builds + PII + blocking axe + blocking screenshot steps all green, which also discharges the "Mac gate-of-record" item for this branch state.
- ✅ **RESOLVED 2026-06-11 — backend runaway killed.** Pid 31139 was an ORPHAN (ppid 1, alive since Jun 8, ~99% CPU, 2,651 CPU-hours) — `launchctl kickstart` can't reach orphans; killed by pid. Clean instance now at 0.0% CPU, `/api/auth/me` 200. Lesson: after backend restarts, `pgrep -fl ts-node-dev` for strays.
- ✅ **RESOLVED 2026-06-11 — merged to main.** PR #99 merge commit `f2a09b8` (Ilya chose merge-commit to preserve the arc history). Branch Parity Gate green pre-merge; **main Parity Gate green post-merge (run 27327369278)**. Includes the pinned-5 One Front Door nav (ARA · Strata · Scribe · Inbox Zero · Task Board — daily-driver set per Ilya) + the e2e locator fix (`:not(.sidebar-widget--pinned)`) the pinned section required. Way 1 sidebar decision: CLOSED.

### 🟠 ARA / agents — capability gaps
- **Multi-step actions inside widgets:** "open Notepad and draft a letter in it" opens Notepad but can't type into it. Needs a widget-action bus (per-widget verbs ARA can call) or an LLM tool-loop. Biggest single "ease" win.
- **Voice input for ARA:** she speaks (TTS) but has no mic — "If I say open Notepad" implies speech-to-ARA. Reuse TranscriptionHub's SpeechRecognition as a mic button in ARA's composer.
- **Stella doesn't execute AGENT_SKILLS:** her Skills tab shows them, but her chat path doesn't run `matchSkill` like ARA's now does. Mirror the ARA hook.
- **Agent Lab orchestrator runs don't EXECUTE skills:** personas display equipped skill chips, but team runs only prompt with text — wire `runSkillForInput` into member task execution so a Researcher actually web-searches.
- **Hermes browser-side fallback is single-shot,** not a multi-step ReAct loop; and when the backend IS up, backend tools + browser skills aren't merged into one registry.
- **Compound commands across layers:** "open notepad and calculate 15% of 2400" — command clauses chain, but skills aren't chained with commands.
- **Backend humanize:** the `humanize` flag is sent but the ARA backend route ignores it (frontend prefix only). Backend prompt change needed for a fully consistent voice when the backend answers.
- **Image gen provider breadth:** OpenAI-key-only (DALL-E 3). Add Gemini image fallback; key-missing CTA should deep-link to Control Panel → API Keys.
- **Web search without Anthropic:** add a Tavily/Brave key field to integrations as an alternative live-search path.

### 🟡 Theme / design cohesion (Terminal·BL4 follow-ups)
- **Font-setting collision:** layout settings (`fontFamily: Roboto`, `fontScale: 1.3`) override the theme's typography — BL4's voice breaks under them. Either themes apply a recommended font pairing, or settings get a "use theme default" toggle.
- **BL4 per-widget sweep:** the cohesion layer unifies chrome; heavy widget interiors (Strata, Astra, Scribe) still carry one-off styles. Audit worst offenders under BL4.
- **Accent override interplay:** a custom accent color silently fights theme accents — add a "theme default" accent reset affordance.
- **Set BL4 as default theme?** Currently opt-in per user (Ilya-gated).

### 🟢 Performance / housekeeping
- **StrataDashboard chunk is 1.11 MB** — by far the largest; split its modules further.
- **Media weight:** `nebula-bg.mp4` 71 MB (accepted+monitored) + new `ara-intro.mp4` 21 MB — consider compressed/teaser-loop variants; watch GitHub's 100 MB hard limit.
- **`.gitignore` gap:** `build/` + `.react-router/` (Phase-9 carry-forward).
- **Window x-clamp:** y is now rescue-clamped everywhere; x still allows near-total off-screen by design — revisit if it bites.
- **A11y re-check under BL4:** 10px mono uppercase labels + `#82908a` secondary text on black — run an axe pass with BL4 active (CI baselines run the default theme, so CI won't catch it).

### Cross-session carry-forwards (pre-existing, still open)
- ARA per-user-key passthrough to backend route; Hydra-as-llmClient-head; ThoughtWeaver persistent + user-only-delete half; backend `/api/integrations/test-postgres`; Gmail/Calendar OAuth backend session; Phase-9 A2/A3 hydration-flash polish (cosmetic, Ilya-gated).

### Consolidation-plan reconciliation — *verified 2026-06-11 against the 06-09 Plan Status*
- ✅ **One Save backend P0**: committed + mounted (`app.ts` `/api/objects`); client spine + 30 wrapped stores committed (`b8c1893`).
- ✅ **RESOLVED 2026-06-11 — One Save is LIVE.** `VITE_ONE_SAVE=true` set in `qualia-shell/.env`; dev server restarted. Part A smoke 8/8 PASS (incl. on-disk object + event log). **Root-cause fix en route:** browser write-through was failing (preflight-rejected 503/"Failed to fetch") because backend CORS `allowedHeaders` was missing `X-Qualia-API` — fixed in backend `adfcd34`. Part B survival test PASSED: theme set → wiped all browser storage → re-login → theme hydrated back from the backend; backfill synced the other wrapped stores (accent/animations/threads/copaw/…). Also fixed `smoke_one_save.sh` macOS bash-3.2 empty-array bug (`35f30c9`). Note: production builds need the flag in the build env too.
- ✅ **Backend ARA personality (humanize, backend half)**: was sitting uncommitted in `ai-dashboard369-file-manager` since the 06-09 arc — committed 2026-06-11 (`ab2095f`, backend `tsc --noEmit` clean). Backend repo not pushed (needs your go / remote policy).
- **Way 2 — Spaces**: SHIPPED 06-09 (spacesStore + SpacesSwitcher + apply-space bus).
- **Way 1 — One Front Door**: ⌘K command+memory results shipped; **remaining: shrink sidebar primary nav to ~5 pinned** (decision: which 5).
- **One Conductor + One Memory**: heuristic conductor + unifiedMemory shipped 06-09; the 06-10 skills layer + Agent Lab extend it. **🎯 KICKED OFF 2026-06-11** — Phase-10 plan at `Docs/Phases/Phase_10_Plan.md`. Remaining work: (A) fold agents into ARA as spawnable sub-agents + Hermes hints + chaining; (B) LLM-routed command dispatch replace heuristic; (C) true window tab-grouping (Option α incremental vs. β structural — Ilya gates at 10.8). **Decision gates LOCKED 2026-06-11 (Ilya):** 10.1 Block A confirmed as planned; 10.5 per-user-key → backend → heuristic cascade; 10.8 Option α incremental. Task 10.1 PRE0 complete (`Docs/Phase10_Task_10_1_Completion_Report.md` — 3 plan-citation drifts found: ARA→ARAConsole, hermes/→HonchoHermesPanel/, QuickCommand→CommandPalette). Task 10.2 complete same day (`Docs/Phase10_Task_10_2_Completion_Report.md` — spawn.ts + parseCommand spawn-first + ARA-hosted orchestrator runs; vitest 1116 ✓ full gate ✓; live LLM run NOT yet verified — first item of next session); Task 10.3 complete (`Docs/Phase10_Task_10_3_Completion_Report.md` — araHermes.ts ara-chat-tagged few-shot K=3 + 👍/👎 voting with 👎-exclusion; vitest 1123 ✓ full gate ✓); Task 10.4 complete (`Docs/Phase10_Task_10_4_Completion_Report.md` — conductorChain.ts command+skill chaining with result piping + evaluateMath "of" fix; vitest 1136 ✓ full gate ✓). **Block A code-complete** (live browser check of spawn/hints/chains pending). Task 10.5 complete (`Docs/Phase10_Task_10_5_Completion_Report.md` — llmRouter.ts cascade per locked gate + Hermes routing memory; backend classifier route = carry-forward; vitest 1161 ✓ full gate ✓); Task 10.6 complete (`Docs/Phase10_Task_10_6_Completion_Report.md` — heuristic-first LLM-on-miss per Ilya call; dispatchTiers refactor + normalized re-dispatch + ⌘K "Ask ARA" row over dwellium:ara-prompt bus; ⌘K chained-input gap closed; vitest 1174 ✓ full gate ✓); Task 10.7 complete (`Docs/Phase10_Task_10_7_Completion_Report.md` — 47-pattern corpus 100% accuracy vs ≥95% gate + adversarial-LLM resilience + collectMisRoutes; vitest 1179 ✓ full gate ✓). **🎯 Block B complete.** Task 10.9 complete (`Docs/Phase10_Task_10_9_Completion_Report.md` — tabGroupStore.ts Option α model + One Save, rides existing apply-space tabbed bus; vitest 1187 ✓ full gate ✓); Task 10.10 complete (`Docs/Phase10_Task_10_10_Completion_Report.md` — TabGroupManager panel + Desktop "⊟ Groups" toggle; drag-to-group = Phase-11 carry-forward; vitest 1193 ✓ full gate ✓). **🎯 Block C MVP complete.** Next: 10.11 closer.

---

## ☐ ThoughtWeaver phone sync via Supabase  — *added 2026-05-30, deferred by Ilya*

**Goal:** Let the user capture thoughts from a phone and have them appear in ThoughtWeaver on the desktop (and vice-versa), without losing the "trusted, never-deleted" guarantee.

**Why this route:** the capture store is currently per-browser `localStorage` (`thought-weaver:captures:<userId>`), so a phone can't reach what's on the desktop. Supabase is the recommended path because it's already wired into the app (per-user Supabase config in the integrations bundle) and works without standing up the heavy Dwellium backend.

**Sketch of the work (when picked up):**
- Add a `thought_weaver_captures` table in the user's Supabase (cols mirror `LocalCapture`: id, user_id, text, filed_to, confidence, destination_name, created_at). RLS so a user only sees their own rows.
- Sync layer: on capture, write-through to Supabase when configured; on load, merge Supabase rows with local (local stays the offline-first source of truth so nothing is ever lost if Supabase is down).
- A mobile-friendly capture route/page (PWA-installable) that writes to the same table — minimal UI: textarea + Capture, reuse `localCategorize` for instant bucketing.
- Keep user-only-delete + verbatim-text guarantees across the sync.

**Relevant files:** `qualia-shell/src/components/ThoughtWeaver/thoughtWeaverStore.ts` (store + would gain a sync adapter), `localCategorizer.ts`, `localViews.ts`, the integrations Supabase config (`src/utils/integrationsStore.ts` / `useIntegrations`). Supabase MCP is connected for schema work.

**Acceptance:** a thought added on phone shows on desktop within a refresh; offline still works (local-first); a verified test of the sync/merge logic (not just "builds green").
