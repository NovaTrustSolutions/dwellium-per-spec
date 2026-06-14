# Dwellium — Honest Assessment (2026-06-12)

Evaluated at frontend `eb30826` / backend `d795176`. Grounded in measured facts: 48 registered widgets, ~132,400 LOC of frontend TS/TSX, 126 test files (1,319 passing tests), 32 One Save-synced stores, 11 distinct window-event buses, backend with 47+ SQLite tables + filesystem object store, CI green, working 486 MB installable DMG. Where I verified something live this session, I say so; where I haven't, I say that too.

---

## What this app actually is

A local-first "agentic OS" for property management: a browser-style desktop (windows, regions, tabs, spaces) hosting 48 widgets, with one conductor agent (ARA) that routes natural language to commands/skills/teams, one memory spine (Honcho + unified recall + knowledge graph), one persistence guarantee (One Save write-through to a backend object store — verified today at 82/82 keys across logout/login and after deliberate browser-storage destruction), and a property-management core (Strata/AppFolio parity). It is the rare case where the ambition ("one calm thing you talk to") has most of its load-bearing parts actually built and tested.

---

## 10 upgrades / additions (ranked by value)

1. **Live property-data feeds.** Strata runs on AppFolio-derived seeds. Wiring real AppFolio (or Buildium/RentManager) API sync would convert the centerpiece from a beautiful mirror into an operating tool. This is the single highest-value upgrade in the app.
2. **Real security mode** (see weakness #1) — promote the packaged app from "trusted single Mac" to defensible: auth on by default, secrets in the OS keychain (Electron `safeStorage`), LLM calls proxied server-side.
3. **Cloud replication of One Save.** The object store is per-backend. Replicating `objects/` + event logs through Supabase (already integrated) gives multi-Mac continuity and makes the DMG's "fresh data" caveat disappear.
4. **Mobile companion (PWA).** ThoughtWeaver phone capture exists; extend the same `/capture` pattern to: read morning brief, chat with ARA, browse artifacts. Three screens would cover 80% of phone value.
5. **Auto-updater in the packaged app.** The in-app Update button (verified working today) covers the dev machine; the DMG has no update path. `electron-updater` + GitHub Releases closes the loop.
6. **ARA streaming + visible tool calls.** Replies arrive as blobs; streaming tokens + a "running: web search…" activity line would make the conductor feel twice as fast at zero model cost.
7. **Time travel.** One Save already keeps append-only event logs per object (`events/*.ndjson`). A history browser + restore-to-version turns an architectural nicety into a user-facing superpower (undo for *everything*).
8. **Backend dream cron + notifications.** Dreams/brief fire on first open (app must be open). The automation scheduler shipped today can host a true 3 a.m. cycle; add macOS notifications/email for the brief.
9. **Widget consolidation pass.** The original proposal said "delete the rest" — never done. Tasks vs Task Board vs Trello, Notepad vs Scribe vs Docs, two graph widgets. Merging overlaps would cut cognitive load and maintenance surface meaningfully.
10. **Continuous voice mode.** Dictation + TTS exist; a wake-word / hold-to-talk conversation loop with ARA would fit the "talk to your OS" identity and is mostly assembly of existing parts.

---

## 10 biggest weaknesses + fixes

1. **Security posture (the big one).** Auth-disabled mode everywhere including the packaged app; the backend on :3000/:38473 accepts unauthenticated requests from ANY local process; LLM/API keys live in localStorage (encrypted at rest, but the key derives from the user id — decorative against a local attacker) and are used browser-direct, so any XSS = key theft. *Fine* for one trusted Mac; not defensible beyond that. **Fix:** flip AUTH_ENABLED on with the seeded users in the sidecar; move provider calls behind the backend; Electron `safeStorage` for secrets. ~2-3 sessions.
2. **Verification breadth vs. widget breadth.** 1,319 tests are heavily store/parser-level; e2e covers 8 baseline pages; most of the 48 widgets have zero interaction tests. The repo's own FUCKUPS.md documents the recurring "green gate ≠ working" failure mode. **Fix:** a Playwright journey suite for the daily-driver five + a registry-walker smoke (mount every widget, click its primary action).
3. **Performance ceiling.** LCP ~2.7 s (5.4× the original 500 ms gate — formally ratified as structurally unattainable without re-architecture); TranscriptionHub chunk 2.36 MB; 71 MB `nebula-bg.mp4` in git and in every build. Feels fine on an M-series; objectively heavy. **Fix:** chunk-split TranscriptionHub (the Strata split recipe exists, −60% proven), compress/stream media, accept LCP or fund the re-arch.
4. **Event-bus invisible coupling.** 11 `CustomEvent` buses + pending-slot holders work, but mount-race bugs recurred 3+ times (default stack, ara-prompt, morning brief — each needed the same "consume on mount" fix). **Fix:** one typed bus module with last-value replay; delete the per-feature pending-slot copies.
5. **Six overlapping layout systems.** Free windows, regions, region tabs, free-window groups (new), Spaces, saved layouts — Option β's unification bailed and lives as a findings doc. Every new layout feature pays compound complexity tax. **Fix:** execute Option β Stage C: groups become the single container; regions become group presets.
6. **God components.** `Desktop.tsx` and `ARAConsole.tsx` are each ~2,500-3,000 lines with a dozen responsibilities; today's work made both bigger. They are where regressions will breed. **Fix:** extract (window-render, buses, strips) and (tiers, voice, panels) into modules — mechanical, 1-2 sessions each.
7. **Single-machine data reality.** "Saved forever" is verified — on one Mac. No replication, no backup beyond Time Machine, the DMG starts clean. **Fix:** = upgrade #3, plus a one-click export/import (zip of `~/.dwellium` + objects) as the cheap interim.
8. **Uneven AI degradation paths.** Honest-offline patterns exist (Stella banner, KG messages — ~187 files reference offline/fallback handling), but coverage is inconsistent: some LLM-dependent widgets fail loudly or hang when a key is missing or a provider 429s, while others degrade gracefully. There's no single contract for "what a widget does with no model." **Fix:** a shared `useAIAvailability()` hook + a standard degraded-state component (cached last result + "AI unavailable, showing last known" banner); make passing it a registry requirement so new widgets can't ship without a defined offline path. ~1 session.
9. **Documentation sprawl as a maintenance signal.** 157 files in `Docs/` plus ~20 top-level status/gap/handoff markdowns (FUCKUPS.md, WHY_GREEN_IS_NOT_WORKING.md, multiple gap analyses, per-feature HANDOFF docs). This is genuinely useful institutional memory, but it's also a tell: the same problems are re-documented because they recur, and a newcomer can't find the current source of truth. **Fix:** collapse to four living docs — ARCHITECTURE, STATUS, KNOWN-ISSUES, ROADMAP — and archive the rest under `Docs/archive/` with dates. The history stays; the surface area shrinks.
10. **Solo-built bus factor.** Every load-bearing decision — the One Save guarantee, the event-bus conventions, the layout systems, the ARA routing — lives in one person's head and in scattered docs, not in enforced structure. The recurring "green ≠ working" and mount-race classes of bug are what happens when conventions are tribal rather than typed. **Fix:** encode the conventions as code, not prose — typed event bus (weakness #4), a widget contract (weakness #8), an architecture decision record per subsystem. Lower the cost of a second contributor (or a future you) being correct by default.

---

## Rating (by category)

Scored 1–10, grounded in this session's measured facts. These are my honest calls, not marketing.

| Category | Score | Basis |
|---|---|---|
| **Ambition / vision** | 9.5 | "One calm thing you talk to" as a local-first agentic OS is a genuinely original, coherent product thesis — and most of the load-bearing parts actually exist. |
| **Architecture** | 7.5 | The One Save spine, knowledge graph, and ARA routing are real and well-conceived; dragged down by six overlapping layout systems, 11 ad-hoc event buses, and god components. |
| **Feature breadth** | 9.0 | 48 working widgets, property-management core at AppFolio parity, voice, capture, automation scheduler. Few solo projects reach this surface area. |
| **Reliability / persistence** | 8.5 | One Save verified live today — 82/82 keys survived logout/login and deliberate browser-storage destruction, restored from the backend object store. Single-machine caveat keeps it off 10. |
| **Test / verification** | 6.0 | 1,319 passing tests + green CI is real, but coverage is store/parser-deep and widget-interaction-shallow; the repo's own docs admit "green gate ≠ working." |
| **Performance** | 6.0 | Feels fine on Apple Silicon, objectively heavy: LCP ~2.7s (5.4× the original gate), 2.36 MB transcription chunk, 71 MB video in every build. |
| **Security** | 4.5 | Fully appropriate for one trusted Mac — and that is exactly its current scope — but auth-disabled by default, unauthenticated local backend, and browser-direct API keys make it indefensible the moment it leaves that boundary. |
| **Polish / UX** | 8.0 | Cohesive desktop metaphor, working voice/dictation, honest-offline banners. Held back by overlapping widgets that do similar things and uneven empty/error states. |
| **Maintainability** | 6.0 | Strong institutional memory in docs, but god components, tribal conventions, and doc sprawl mean complexity compounds with each feature. |
| **Distribution / ops** | 6.5 | A real, installed-and-verified 486 MB DMG is a major milestone; no auto-update path, Apple-Silicon-only build, and clean-start data hold it back. |

**Overall: 7.5 / 10.** A remarkably complete, genuinely original local-first agentic OS whose core promises (persistence, voice, the conductor, property parity) are built and — where checked this session — verified live. The gap between it and an 8.5+ is not more features; it's consolidation and hardening: flip security on for anything beyond one Mac, replicate the data, unify the layout/bus/component sprawl, and widen verification from "stores pass" to "widgets work." The hard, creative part is done. What remains is disciplined.

---

*Where this session verified live: One Save persistence (82/82 keys, logout/login + storage-wipe recovery), the in-app Update button (status/check/apply against the real backend), and the packaged DMG (installed, backend health + API routes answered 200). Performance, test-coverage, security, and architecture figures are read from the codebase and CI, not re-measured live this session — stated as such above.*
