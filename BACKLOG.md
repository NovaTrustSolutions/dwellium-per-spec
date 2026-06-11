# Dwellium — Backlog (deferred, agreed work)

Things we've explicitly decided to do *later*. Newest first.

---

## ☐ Optimization & ease-of-use sweep — *added 2026-06-10 (UI/skills/theme session)*

Unfinished items surfaced across the Fey-UI, ARA/skills, Hermes, and Terminal·BL4 arcs. Grouped by urgency.

### 🔴 Blockers before the next push
- **Recapture Linux Playwright screenshot baselines.** The 21 UIX changes + window-chrome edits alter all 8 baseline pages; the screenshot-baseline CI step is BLOCKING, so pushing now fails Parity Gate. Dispatch `Capture Linux Playwright Baselines` (workflow ref + framework-mode patches per memory note) and commit the new `*-chromium-linux.png` set with the push.
- **Run the full strict gate on the Mac** (not just sandbox): `tsc -b && vitest && react-router build ×2 && PII && SSR smoke`. Sandbox gate passed, but the Mac is the gate-of-record. 8 commits are local-only on `feat/scribe-ingestion-honcho`; decide squash-vs-merge to `main`.
- **Backend runaway process check:** `ps` showed the backend `ts-node-dev` (pid ~31139) at ~98% CPU with 2,651 CPU-hours. Restart `com.dwellium.backend` and investigate the hot loop — this alone may explain general sluggishness.

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
